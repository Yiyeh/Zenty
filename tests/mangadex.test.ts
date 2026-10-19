import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { createLibraryApi } from "../server/library-api.ts";
import { createMangaDexApi } from "../server/mangadex-api.ts";

test("MangaDex: no recorta a 500, conserva idiomas/volúmenes y bloquea peticiones cruzadas", async (t) => {
  const calls: URL[] = [];
  const chapter = (id: string, number: string | null, lang = "es", volume = "1", externalUrl?: string) => ({ id, attributes: { chapter: number, translatedLanguage: lang, volume, pages: 20, externalUrl }, relationships: [] });
  const rows = Array.from({ length: 501 }, (_, i) => chapter(`chapter-${i}`, String(i + 1)));
  rows.push(chapter("other-language", "1", "es-la"), chapter("other-volume", "1", "es", "2"), chapter("special-a", null), chapter("special-b", null), chapter("unsafe-link", "999", "es", "1", "javascript:alert(1)"));
  const handler = createMangaDexApi({ fetchJson: async (url: string) => {
    const parsed = new URL(url); calls.push(parsed);
    const offset = Number(parsed.searchParams.get("offset"));
    return { data: rows.slice(offset, offset + 500), total: rows.length };
  } });
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  const root = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/mangadex`;
  const response = await fetch(`${root}/manga/pagination-fixture/chapters?lang=es-all`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.chapters.length, rows.length);
  assert.deepEqual(calls.map((url) => url.searchParams.get("offset")), ["0", "500"]);
  assert.deepEqual(calls[0].searchParams.getAll("translatedLanguage[]"), ["es", "es-la"]);
  assert.equal(data.chapters.find((entry: {id: string}) => entry.id === "unsafe-link").externalUrl, null);
  await fetch(`${root}/manga/spanish-fixture/chapters?lang=es`);
  assert.deepEqual(calls[2].searchParams.getAll("translatedLanguage[]"), ["es"]);
  assert.equal((await fetch(`${root}/search`, { headers: { Origin: "https://other.example" } })).status, 403);
  assert.equal((await fetch(`${root}/search`, { headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
  for (const url of ["http://uploads.mangadex.org/private", "https://127.0.0.1/a", "https://uploads.mangadex.org:444/a", "https://user:pass@uploads.mangadex.org/a"]) {
    const rejected = await fetch(`${root}/image?url=${encodeURIComponent(url)}`);
    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers.get("access-control-allow-origin"), null);
  }
});

test("MangaDex API: búsqueda, capítulos y páginas", { skip: process.env.ZENTY_LIVE_TESTS === "0" }, async (t) => {
  const handler = createMangaDexApi();
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api/mangadex`;

  t.after(async () => {
    await new Promise<void>((done) => server.close(() => done()));
  });

  // 1. Search popular with Spanish language
  const popRes = await fetch(`${base}/search?lang=es-all&limit=3`);
  assert.equal(popRes.status, 200);
  const popData = await popRes.json();
  assert.ok(Array.isArray(popData.results));
  assert.ok(popData.results.length > 0);
  assert.ok(typeof popData.results[0].title === "string");
  assert.ok(popData.results[0].id);

  // 2. Search specific title (e.g. chainsaw man)
  const searchRes = await fetch(`${base}/search?q=chainsaw&lang=es-all&limit=2`);
  assert.equal(searchRes.status, 200);
  const searchData = await searchRes.json();
  assert.ok(Array.isArray(searchData.results));
  assert.ok(searchData.results.length > 0);
  assert.ok(searchData.results.some((m: { title: string }) => m.title.toLowerCase().includes("chainsaw")));

  // 3. Manga details
  const mangaId = searchData.results[0].id;
  const mangaRes = await fetch(`${base}/manga/${mangaId}`);
  assert.equal(mangaRes.status, 200);
  const mangaDetails = await mangaRes.json();
  assert.equal(mangaDetails.id, mangaId);
  assert.ok(typeof mangaDetails.title === "string");

  // 4. Chapters feed with deduplication
  const chRes = await fetch(`${base}/manga/${mangaId}/chapters?lang=es-all`);
  assert.equal(chRes.status, 200);
  const chData = await chRes.json();
  assert.ok(Array.isArray(chData.chapters));
  if (chData.chapters.length > 1) {
    const num0 = parseFloat(chData.chapters[0].chapter);
    const num1 = parseFloat(chData.chapters[1].chapter);
    if (!isNaN(num0) && !isNaN(num1)) {
      assert.ok(num0 <= num1, "Los capítulos deben ordenarse ascendentemente");
    }
  }

  // 5. Test caching: second call is instant and returns same data
  const t0 = Date.now();
  const cachedRes = await fetch(`${base}/search?q=chainsaw&lang=es-all&limit=2`);
  const t1 = Date.now();
  assert.equal(cachedRes.status, 200);
  assert.ok(t1 - t0 < 50, "La llamada en caché debe responder rápidamente");

  // 6. Test chapter pages & image proxy route
  const internalCh = chData.chapters.find(
    (c: { isExternal: boolean; pages: number }) => !c.isExternal && c.pages > 0,
  );
  if (internalCh) {
    const pagesRes = await fetch(`${base}/chapter/${internalCh.id}/pages`);
    assert.equal(pagesRes.status, 200);
    const pagesData = await pagesRes.json();
    assert.ok(Array.isArray(pagesData.pages));
    assert.ok(pagesData.pages.length > 0);
    assert.ok(pagesData.pages[0].startsWith("/api/mangadex/image?url="));

    const proxyRes = await fetch(
      `http://127.0.0.1:${address.port}${pagesData.pages[0]}`,
    );
    assert.equal(proxyRes.status, 200);
    assert.ok(proxyRes.headers.get("content-type")?.includes("image/"));
    const imgBuffer = await proxyRes.arrayBuffer();
    assert.ok(imgBuffer.byteLength > 100);
  }
});

test("Biblioteca: añadir manga de MangaDex, guardar capítulo/página y persistir en disco", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mia-manga-test-"));
  let handler = createLibraryApi(directory);
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api/library`;

  t.after(async () => {
    await new Promise<void>((done) => server.close(() => done()));
    if (
      resolve(directory).startsWith(resolve(tmpdir()) + sep) &&
      basename(directory).startsWith("mia-manga-test-")
    ) {
      await rm(directory, { recursive: true, force: true });
    }
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

  // 1. Initial library is empty
  const initial = await (await request()).json();
  assert.equal(initial.documents.length, 0);

  // 2. Add Manga to Library via POST /api/library/manga
  const addRes = await request(
    "/manga",
    "POST",
    JSON.stringify({
      mangadexId: "test-manga-uuid-1234",
      title: "Chainsaw Man",
      coverUrl: "https://uploads.mangadex.org/covers/test/cover.jpg",
      language: "es-la",
      description: "Denji es un joven que vive atrapado en la pobreza extrema.",
      author: "Tatsuki Fujimoto",
      totalChapters: 97,
    }),
  );
  assert.equal(addRes.status, 201);
  const { document: doc, duplicate } = await addRes.json();
  assert.equal(duplicate, false);
  assert.equal(doc.format, "manga");
  assert.equal(doc.title, "Chainsaw Man");
  assert.equal(doc.manga?.mangadexId, "test-manga-uuid-1234");
  assert.equal(doc.manga?.language, "es-la");
  assert.equal(doc.totalUnits, 97);

  // Verify physical file was created on disk
  const diskData = JSON.parse(
    await readFile(join(directory, "documents", `${doc.id}.manga`), "utf8"),
  );
  assert.equal(diskData.mangadexId, "test-manga-uuid-1234");

  // 3. Test duplicate addition
  const dupRes = await request(
    "/manga",
    "POST",
    JSON.stringify({
      mangadexId: "test-manga-uuid-1234",
      title: "Chainsaw Man",
      language: "es-la",
    }),
  );
  assert.equal(dupRes.status, 201);
  const dupData = await dupRes.json();
  assert.equal(dupData.duplicate, true);
  assert.equal(dupData.document.id, doc.id);

  // 4. Update reading progress: Chapter 12, Page 5
  const updateRes = await request(
    `/${doc.id}`,
    "PATCH",
    JSON.stringify({
      position: { unit: 11, anchor: 4, fraction: 0.25, progress: 0.12 },
      manga: {
        currentChapterId: "chapter-uuid-12",
        currentChapterNumber: "12",
        currentChapterTitle: "La batalla",
        chapterIndex: 11,
        pageIndex: 4,
        totalPages: 20,
        lastPagePreviewUrl: "/api/mangadex/image?url=https%3A%2F%2Fuploads.mangadex.org%2Fdata%2F123.jpg",
      },
      favorite: true,
      bookmark: {
        label: "Capítulo 12, página 5",
        position: { unit: 11, anchor: 4, fraction: 0.25, progress: 0.12 },
      },
    }),
  );
  assert.equal(updateRes.status, 200);
  const updatedDoc = await updateRes.json();
  assert.equal(updatedDoc.position.unit, 11);
  assert.equal(updatedDoc.position.anchor, 4);
  assert.equal(updatedDoc.manga.currentChapterNumber, "12");
  assert.equal(updatedDoc.manga.pageIndex, 4);
  assert.equal(
    updatedDoc.manga.lastPagePreviewUrl,
    "/api/mangadex/image?url=https%3A%2F%2Fuploads.mangadex.org%2Fdata%2F123.jpg",
  );
  assert.equal(updatedDoc.favorite, true);
  assert.equal(updatedDoc.bookmarks.length, 1);

  // 5. Restart server and verify persistence from library.json and disk
  handler = createLibraryApi(directory);
  const reloaded = await (await request()).json();
  assert.equal(reloaded.documents.length, 1);
  const storedManga = reloaded.documents[0];
  assert.equal(storedManga.id, doc.id);
  assert.equal(storedManga.position.unit, 11);
  assert.equal(storedManga.position.anchor, 4);
  assert.equal(storedManga.manga.currentChapterNumber, "12");
  assert.equal(storedManga.manga.pageIndex, 4);
  assert.equal(
    storedManga.manga.lastPagePreviewUrl,
    "/api/mangadex/image?url=https%3A%2F%2Fuploads.mangadex.org%2Fdata%2F123.jpg",
  );

  // 6. Move to trash and restore
  await request(`/${doc.id}`, "DELETE");
  const inTrash = await (await request()).json();
  assert.ok(inTrash.documents[0].deletedAt);

  await request(`/${doc.id}`, "PATCH", JSON.stringify({ restore: true }));
  const restored = await (await request()).json();
  assert.equal(restored.documents[0].deletedAt, null);

  // 7. Permanent deletion removes document and physical .manga file
  await request(`/${doc.id}`, "DELETE");
  await request(`/${doc.id}?permanent=1`, "DELETE");
  const final = await (await request()).json();
  assert.equal(final.documents.length, 0);

  // Verify file was deleted from documents/
  await assert.rejects(async () => {
    await readFile(join(directory, "documents", `${doc.id}.manga`), "utf8");
  });
});
