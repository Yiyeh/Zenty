import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { createLibraryApi } from "../server/library-api.ts";
import {
  archivePath,
  clampPosition,
  documentFormat,
  naturalPageSort,
  normalizeReaderPreferences,
  readerDefaults,
} from "../src/lib/library.ts";
test("formatos, paginación natural y referencias EPUB seguras", () => {
  assert.equal(documentFormat("Libro.EPUB"), "epub");
  assert.equal(documentFormat("manga.cbr"), null);
  assert.equal(documentFormat("archivo.exe"), null);
  assert.deepEqual(naturalPageSort(["page10.png", "page2.png", "page1.png"]), [
    "page1.png",
    "page2.png",
    "page10.png",
  ]);
  assert.equal(
    archivePath("OEBPS/text/ch1.xhtml", "../images/portada.png"),
    "OEBPS/images/portada.png",
  );
  for (const path of [
    "https://evil.test/a",
    "//evil.test/a",
    "../../../secreto",
    "../..\\x",
    "data:text/html,a",
  ])
    assert.equal(archivePath("OEBPS/text.xhtml", path), null);
});
test("posiciones y preferencias no admiten valores fuera de rango", () => {
  assert.deepEqual(
    clampPosition({ unit: -20, anchor: Infinity, fraction: 5, progress: -1 }),
    { unit: 0, anchor: 0, fraction: 1, progress: 0 },
  );
  const settings = normalizeReaderPreferences({
    fontSize: 999,
    lineHeight: 0,
    theme: "javascript:x",
    zoom: Infinity,
    brightness: -1,
    width: 1,
  });
  assert.equal(settings.fontSize, 32);
  assert.equal(settings.lineHeight, 1.3);
  assert.equal(settings.theme, readerDefaults.theme);
  assert.equal(settings.zoom, 1);
  assert.equal(settings.brightness, 0.55);
  assert.equal(settings.width, 440);
});
test("biblioteca en disco: importar, duplicados, progreso, reinicio, papelera y recuperación", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mia-library-test-"));
  let handler = createLibraryApi(directory);
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api/library`;
  t.after(async () => {
    await new Promise<void>((done) => server.close(() => done()));
    if (
      resolve(directory).startsWith(resolve(tmpdir()) + sep) &&
      basename(directory).startsWith("mia-library-test-")
    )
      await rm(directory, { recursive: true, force: true });
  });
  const request = (
    path = "",
    method = "GET",
    body?: string,
    extra: Record<string, string> = {},
  ) =>
    fetch(base + path, {
      method,
      headers: {
        "X-MIA-Library": "1",
        "Content-Type": "application/json",
        ...extra,
      },
      body,
    });
  const initial = await (await request()).json();
  assert.equal(initial.documents.length, 0);
  const content =
    "Mi documento original de prueba. No contiene datos personales.";
  const upload = await request("?name=Lectura.txt", "POST", content);
  assert.equal(upload.status, 201);
  const { document: doc } = await upload.json();
  assert.equal(doc.name, "Lectura.txt");
  const metadata = await (await request(`/${doc.id}`, "PATCH", JSON.stringify({ author: "Autora", collection: "Clásicos", tags: ["manga", "manga", "lectura"], series: "Saga", volume: "2", preferences: { theme: "night", zoom: 99 } }))).json();
  assert.equal(metadata.author, "Autora"); assert.deepEqual(metadata.tags, ["manga", "lectura"]); assert.equal(metadata.preferences.theme, "night"); assert.equal(metadata.preferences.zoom, 3);
  assert.equal((await (await request()).json()).preferences.theme, readerDefaults.theme);

  assert.equal(
    await readFile(join(directory, "documents", `${doc.id}.txt`), "utf8"),
    content,
  );
  const duplicate = await (
    await request("?name=Otro-nombre.txt", "POST", content)
  ).json();
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.document.id, doc.id);
  assert.equal((await readdir(join(directory, "documents"))).length, 1);
  await request(
    `/${doc.id}`,
    "PATCH",
    JSON.stringify({
      position: { unit: 8, anchor: 19, fraction: 0.6, progress: 0.42 },
      totalUnits: 20,
      favorite: true,
      bookmark: {
        label: "Volver aquí",
        position: { unit: 8, anchor: 19, fraction: 0.6, progress: 0.42 },
      },
    }),
  );
  await request(
    "/preferences",
    "PATCH",
    JSON.stringify({ theme: "night", fontSize: 25 }),
  );
  handler = createLibraryApi(directory);
  let stored = await (await request()).json();
  assert.equal(stored.documents[0].position.anchor, 19);
  assert.equal(stored.documents[0].position.fraction, 0.6);
  assert.equal(stored.documents[0].bookmarks.length, 1);
  assert.equal(stored.preferences.theme, "night");
  const original = await request(`/${doc.id}/file`);
  assert.equal(await original.text(), content);
  assert.ok(
    original.headers.get("Content-Disposition")?.includes("Lectura.txt"),
  );
  assert.equal((await request(`/${doc.id}?permanent=1`, "DELETE")).status, 409);
  await request(`/${doc.id}`, "DELETE");
  stored = await (await request()).json();
  assert.ok(stored.documents[0].deletedAt);
  assert.equal(
    await readFile(join(directory, "documents", `${doc.id}.txt`), "utf8"),
    content,
  );
  await request(`/${doc.id}`, "PATCH", JSON.stringify({ restore: true }));
  stored = await (await request()).json();
  assert.equal(stored.documents[0].deletedAt, null);
  assert.equal(stored.documents[0].position.unit, 8);
  await request(`/${doc.id}`, "DELETE");
  await request(`/${doc.id}?permanent=1`, "DELETE");
  assert.equal((await (await request()).json()).documents.length, 0);
  assert.equal((await readdir(join(directory, "documents"))).length, 0);
});
test("la API rechaza orígenes extraños, rutas, formatos falsos y peticiones sin autorización local", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mia-library-test-"));
  const handler = createLibraryApi(directory);
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/library`;
  t.after(async () => {
    await new Promise<void>((done) => server.close(() => done()));
    if (
      resolve(directory).startsWith(resolve(tmpdir()) + sep) &&
      basename(directory).startsWith("mia-library-test-")
    )
      await rm(directory, { recursive: true, force: true });
  });
  assert.equal(
    (await fetch(base, { headers: { Origin: "https://evil.test" } })).status,
    403,
  );
  const foreignHostStatus = await new Promise<number | undefined>(
    (done, reject) => {
      const req = httpRequest(
        base,
        { headers: { Host: "evil.test" } },
        (res) => {
          res.resume();
          done(res.statusCode);
        },
      );
      req.on("error", reject);
      req.end();
    },
  );
  assert.equal(foreignHostStatus, 403);
  assert.equal(
    (await fetch(base + "?name=a.txt", { method: "POST", body: "a" })).status,
    403,
  );
  const upload = (name: string, data = "contenido") =>
    fetch(base + `?name=${encodeURIComponent(name)}`, {
      method: "POST",
      headers: { "X-MIA-Library": "1" },
      body: data,
    });
  assert.equal((await upload("../privado.txt")).status, 415);
  assert.equal((await upload("exe.exe")).status, 415);
  assert.equal((await upload("falso.pdf")).status, 415);
  assert.equal((await upload("falso.epub")).status, 415);
  assert.equal((await upload("vacio.txt", "")).status, 400);
  assert.equal((await fetch(base + "/not-a-uuid/file")).status, 400);
  await writeFile(join(directory, "library.json"), "{roto");
  assert.equal((await fetch(base)).status, 500);
  assert.equal(
    await readFile(join(directory, "library.json"), "utf8"),
    "{roto",
  );
});
test("las escrituras simultáneas conservan todos los documentos y marcadores", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mia-library-test-"));
  const handler = createLibraryApi(directory);
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/library`;
  t.after(async () => {
    await new Promise<void>((done) => server.close(() => done()));
    if (
      resolve(directory).startsWith(resolve(tmpdir()) + sep) &&
      basename(directory).startsWith("mia-library-test-")
    )
      await rm(directory, { recursive: true, force: true });
  });
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      fetch(base + `?name=test${i}.txt`, {
        method: "POST",
        headers: { "X-MIA-Library": "1" },
        body: `documento ${i}`,
      }),
    ),
  );
  const state = await (await fetch(base)).json();
  assert.equal(state.documents.length, 8);
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      fetch(base + `/${state.documents[0].id}`, {
        method: "PATCH",
        headers: { "X-MIA-Library": "1" },
        body: JSON.stringify({
          bookmark: {
            label: `Marca ${i}`,
            position: { unit: i, anchor: 0, fraction: 0, progress: 0 },
          },
        }),
      }),
    ),
  );
  assert.equal(
    (await (await fetch(base)).json()).documents[0].bookmarks.length,
    8,
  );
});
