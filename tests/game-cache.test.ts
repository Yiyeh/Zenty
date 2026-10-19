import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import {
  createGameImages,
  imageMime,
  imageUrl,
  publicImageAddress,
  downloadGameImage,
} from "../server/game-images.ts";
import { createGamingApi } from "../server/gaming-api.ts";
import { createInstalledApi } from "../server/installed-api.ts";
import {
  cachedGameImage,
  validSavedGame,
  emptyGame,
} from "../src/lib/gaming.ts";
import type { FoundGame } from "../server/game-scanner.ts";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/t8AAAAASUVORK5CYII=",
  "base64",
);
async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "mia-cache-test-"));
  t.after(async () => {
    const actual = resolve(directory),
      parent = resolve(tmpdir());
    assert.ok(
      actual.startsWith(parent + sep) &&
        actual.slice(parent.length + 1).startsWith("mia-cache-test-"),
    );
    await rm(actual, { recursive: true, force: true });
  });
  return directory;
}
async function serve(
  t: TestContext,
  middleware: (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => Promise<void>,
) {
  const server = createServer(
    (req, res) =>
      void middleware(req, res, () => {
        res.writeHead(404);
        res.end();
      }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
test("imágenes: una descarga compartida, archivos en disco y cero red después de reiniciar", async (t) => {
  const directory = await fixture(t);
  let calls = 0;
  const cache = createGameImages({
    directory,
    downloader: async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return png;
    },
  });
  const result = await Promise.all(
    Array.from({ length: 8 }, () => cache.get("https://example.com/cover.png")),
  );
  assert.equal(calls, 1);
  assert.ok(result.every((r) => r.bytes.equals(png)));
  const files = await readdir(directory);
  assert.equal(files.filter((f) => f.endsWith(".image")).length, 1);
  assert.equal(files.filter((f) => f.endsWith(".json")).length, 1);
  const index = JSON.parse(
    await readFile(
      join(directory, files.find((f) => f.endsWith(".json"))!),
      "utf8",
    ),
  );
  assert.equal(index.mime, "image/png");
  assert.equal(index.bytes, png.length);
  assert.ok(index.savedAt);
  const offline = createGameImages({
    directory,
    downloader: async () => {
      throw new Error("This must not make a network call");
    },
  });
  assert.deepEqual(
    (await offline.get("https://example.com/cover.png")).bytes,
    png,
  );
  assert.equal(
    (await offline.get("https://example.com/cover.png#fragment")).key,
    result[0].key,
  );
});
test("imágenes: HTTP local, caché del navegador, HEAD, ETag y bloqueo de otros orígenes", async (t) => {
  const directory = await fixture(t);
  let calls = 0;
  const root = await serve(
    t,
    createGameImages({
      directory,
      downloader: async () => {
        calls++;
        return png;
      },
    }).middleware,
  );
  const url = root + cachedGameImage("https://example.com/cover.png");
  const first = await fetch(url);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("content-type"), "image/png");
  assert.match(first.headers.get("cache-control")!, /immutable/);
  assert.deepEqual(Buffer.from(await first.arrayBuffer()), png);
  const head = await fetch(url, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal(
    (
      await fetch(url, {
        headers: { "If-None-Match": first.headers.get("etag")! },
      })
    ).status,
    304,
  );
  assert.equal(
    (await fetch(url, { headers: { origin: "https://evil.example" } })).status,
    403,
  );
  assert.equal((await fetch(url, { method: "POST" })).status, 405);
  assert.equal(calls, 1);
});
test("imágenes: los fallos no generan bucles de descarga ni admiten SVG, HTML o archivos grandes", async (t) => {
  const directory = await fixture(t);
  let time = 100_000,
    calls = 0;
  const options = {
    directory,
    now: () => time,
    downloader: async () => {
      calls++;
      return Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>bad()</script></svg>',
      );
    },
  };
  await assert.rejects(() =>
    createGameImages(options).get("https://example.com/unsafe.svg"),
  );
  await assert.rejects(() =>
    createGameImages(options).get("https://example.com/unsafe.svg"),
  );
  assert.equal(calls, 1);
  time += 301_000;
  const repaired = createGameImages({
    ...options,
    downloader: async () => {
      calls++;
      return png;
    },
  });
  assert.equal(
    (await repaired.get("https://example.com/unsafe.svg")).mime,
    "image/png",
  );
  assert.equal(calls, 2);
  assert.throws(() => imageMime(Buffer.from("<html>not an image</html>")));
  await assert.rejects(() =>
    createGameImages({
      directory,
      downloader: async () => Buffer.alloc(8 * 1024 * 1024 + 1),
    }).get("https://example.com/large.png"),
  );
});
test("imágenes: protección de red local y URLs, y respaldo con URL original independiente del servidor", async () => {
  for (const value of [
    "https://127.0.0.1/a",
    "https://2130706433/a",
    "https://[::1]/a",
    "https://[::ffff:127.0.0.1]/a",
    "https://192.168.1.2/a",
    "https://10.0.0.1/a",
    "http://example.com/a",
    "https://example.com:8443/a",
    "https://user:pass@example.com/a",
    "https://private.local/a",
  ])
    assert.throws(() => imageUrl(value));
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "100.64.0.1",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "2002:7f00:1::",
  ])
    assert.equal(publicImageAddress(ip), false, ip);
  assert.equal(publicImageAddress("8.8.8.8"), true);
  assert.equal(publicImageAddress("2606:4700::1111"), true);
  await assert.rejects(() =>
    downloadGameImage("https://169.254.169.254/latest"),
  );
  const game = emptyGame({
    id: "manual:cache",
    title: "Mi juego",
    image: "https://example.com/cover.jpg",
  });
  assert.ok(
    cachedGameImage(game.image).startsWith("/api/game-assets/image?url="),
  );
  assert.equal(cachedGameImage("javascript:1"), "");
  assert.equal(
    validSavedGame({
      id: game.id,
      game,
      status: "pending",
      note: "",
      addedAt: new Date().toISOString(),
    }),
    true,
  );
});
test("feeds: reiniciar conserva consultas recientes; sin conexión conserva las anteriores con su fecha", async (t) => {
  const directory = await fixture(t);
  let calls = 0,
    time = Date.parse("2026-10-17T16:00:00Z");
  const options = {
    directory,
    now: () => time,
    fetcher: (async () => {
      calls++;
      return new Response(
        JSON.stringify([
          {
            id: 1,
            title: "Juego",
            gamerpower_url: "https://www.gamerpower.com/example",
            status: "Active",
            type: "Game",
            platforms: "PC",
          },
        ]),
      );
    }) as typeof fetch,
  };
  const firstRoot = await serve(t, createGamingApi(options));
  const first = await (await fetch(firstRoot + "/api/gaming/giveaways")).json();
  assert.equal(first.items.length, 1);
  assert.equal(calls, 1);
  const secondRoot = await serve(t, createGamingApi(options));
  const parallel = await Promise.all(
    Array.from({ length: 5 }, () =>
      fetch(secondRoot + "/api/gaming/giveaways").then((r) => r.json()),
    ),
  );
  assert.equal(calls, 1);
  assert.ok(parallel.every((r) => r.items.length === 1 && !r.stale));
  time += 16 * 60_000;
  const offlineRoot = await serve(
    t,
    createGamingApi({
      directory,
      now: () => time,
      fetcher: (async () => {
        throw new Error("Offline");
      }) as typeof fetch,
    }),
  );
  const stale = await (
    await fetch(offlineRoot + "/api/gaming/giveaways")
  ).json();
  assert.equal(stale.items.length, 1);
  assert.equal(stale.stale, true);
  assert.equal(stale.updatedAt, first.updatedAt);
});
test("fichas: persistencia tras reinicio y resultados sin coincidencia guardados un día", async (t) => {
  const directory = await fixture(t);
  let calls = 0;
  const entry: FoundGame = {
    game: {
      id: "gog:7",
      title: "Juego sin coincidencia",
      launcher: "gog",
      installPath: directory,
      image: "",
      steamId: null,
    },
    launch: {
      type: "exe",
      executable: join(directory, "game.exe"),
      args: [],
      cwd: directory,
    },
  };
  const options = {
    directory,
    scanner: async () => ({ found: [entry], warnings: [] }),
    fetcher: (async () => {
      calls++;
      return new Response(JSON.stringify({ items: [] }));
    }) as typeof fetch,
  };
  for (let instance = 0; instance < 2; instance++) {
    const root = await serve(t, createInstalledApi(options));
    const result = await (
      await fetch(root + "/api/installed/metadata", {
        method: "POST",
        headers: { "X-MIA-Games": "1", "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.game.id }),
      })
    ).json();
    assert.equal(result.source, "");
    assert.ok(result.fetchedAt);
  }
  assert.equal(calls, 1);
});
