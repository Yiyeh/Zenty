import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { TestContext } from "node:test";
import {
  createGamingApi,
  normalizeDeals,
  normalizeGiveaways,
  normalizeRelease,
} from "../server/gaming-api.ts";
import {
  dateOnly,
  emptyGame,
  giveawayExpired,
  httpsUrl,
  matchesPlatform,
  validSavedGame,
} from "../src/lib/gaming.ts";
import { defaultData, parseBackup } from "../src/lib/dashboard.ts";
const original = {
  id: 10,
  title: "Una aventura",
  gamerpower_url: "https://www.gamerpower.com/adventure",
  status: "Active",
  type: "Game",
  platforms: "PC, Steam",
  end_date: "2026-10-17 23:59:00",
};
const timestamp = Date.parse("2026-10-17T16:00:00Z");
const sampleDeal = {
  gameID: "40",
  title: "Un buen juego",
  dealID: "a%2Bb%3D",
  salePrice: "4.99",
  normalPrice: "19.99",
  storeID: "1",
};
test("regalos: distingue juegos, DLC y betas; elimina promociones terminadas y enlaces inseguros", () => {
  const items = normalizeGiveaways(
    [
      original,
      { ...original, id: 11, type: "DLC" },
      { ...original, id: 12, type: "Early Access" },
      { ...original, id: 13, end_date: "2026-10-15" },
      { ...original, id: 14, status: "Expired" },
      { ...original, id: 15, gamerpower_url: "javascript:alert(1)" },
    ],
    timestamp,
  );
  assert.deepEqual(
    items.map((i) => i.kind),
    ["game", "loot", "beta"],
  );
  assert.equal(
    giveawayExpired(items[0], Date.parse("2026-10-18T01:00:00Z")),
    false,
  );
  assert.equal(
    giveawayExpired(items[0], Date.parse("2026-10-19T01:00:00Z")),
    true,
  );
  assert.equal(normalizeGiveaways({ status: 0 }).length, 0);
  assert.throws(() => normalizeGiveaways({ error: "broken" }));
});
test("ofertas: precios válidos, moneda USD, sin duplicados y enlaces de redirección requeridos", () => {
  const deals = normalizeDeals(
    [
      sampleDeal,
      sampleDeal,
      { ...sampleDeal, gameID: "2", salePrice: "NaN" },
      { ...sampleDeal, gameID: "3", salePrice: "20" },
      { ...sampleDeal, gameID: "4", salePrice: "0" },
    ],
    [{ storeID: "1", storeName: "Steam" }],
  );
  assert.equal(deals.length, 2);
  assert.equal(deals[0].price, 4.99);
  assert.equal(deals[0].discount, 75);
  assert.equal(deals[0].store, "Steam");
  assert.equal(
    new URL(deals[0].url).searchParams.get("dealID"),
    sampleDeal.dealID,
  );
  assert.equal(deals[1].price, 0);
  assert.equal(matchesPlatform(deals[0], "Steam"), true);
});
test("lanzamientos: fechas exactas sin inventar días para trimestres, demos y filtros de plataforma", () => {
  const g = normalizeRelease(
    { id: 20, name: "MIA Demo" },
    { type: "demo", release_date: { date: "18 Oct, 2026", coming_soon: true } },
  )!;
  assert.equal(g.releaseDate, "2026-10-18");
  assert.equal(g.demo, true);
  assert.equal(matchesPlatform(g, "Steam"), true);
  assert.equal(matchesPlatform(g, "PlayStation"), false);
  assert.equal(
    matchesPlatform(emptyGame({ platforms: ["PlayStation 5"] }), "PlayStation"),
    true,
  );
  assert.equal(
    normalizeRelease(
      { id: 21, name: "Otro juego" },
      { release_date: { date: "Q1 2027" } },
    )?.releaseDate,
    null,
  );
  assert.equal(dateOnly("2026-02-30"), null);
  assert.equal(httpsUrl("https://user:password@example.com"), "");
});
test("juegoteca y preferencias sobreviven a respaldos; la importación inválida es atómica", () => {
  const saved = {
    id: "manual:1",
    game: emptyGame({
      id: "manual:1",
      title: "Mi juego",
      releaseDate: "2027-01-12",
    }),
    status: "playing",
    note: "Jugar con amigos",
    addedAt: "2026-10-17T00:00:00.000Z",
  };
  assert.equal(validSavedGame(saved), true);
  const result = parseBackup(
    JSON.stringify({
      ...defaultData,
      version: 2,
      games: [saved],
      settings: {
        ...defaultData.settings,
        gamingPlatform: "PlayStation",
        gamingShowDemos: false,
      },
    }),
  );
  assert.deepEqual(result.games, [saved]);
  assert.equal(result.settings.gamingPlatform, "PlayStation");
  assert.equal(result.settings.gamingShowDemos, false);
  assert.throws(() =>
    parseBackup(
      JSON.stringify({
        ...defaultData,
        games: [{ ...saved, game: { ...saved.game, image: "javascript:1" } }],
      }),
    ),
  );
  assert.throws(() =>
    parseBackup(JSON.stringify({ ...defaultData, games: [saved, saved] })),
  );
  assert.equal(validSavedGame({ ...saved, status: "toString" }), false);
  assert.deepEqual(
    parseBackup(JSON.stringify({ tasks: [], habits: [], settings: {} })).games,
    [],
  );
});
async function serve(t: TestContext, api: ReturnType<typeof createGamingApi>) {
  const server = createServer(
    (req, res) =>
      void api(req, res, () => {
        res.writeHead(404);
        res.end();
      }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      ),
  );
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
test("API: comparte consultas simultáneas, respeta caché, conserva datos ante fallos y limita reintentos", async (t) => {
  let time = timestamp,
    calls = 0,
    fail = false;
  const api = createGamingApi({
    now: () => time,
    ttl: 90_000,
    fetcher: (async () => {
      calls++;
      if (fail) throw new Error("Offline");
      await new Promise((resolve) => setTimeout(resolve, 30));
      return new Response(JSON.stringify([original]));
    }) as typeof fetch,
  });
  const root = await serve(t, api);
  const results = await Promise.all(
    Array.from({ length: 6 }, () =>
      fetch(`${root}/api/gaming/giveaways`).then((r) => r.json()),
    ),
  );
  assert.equal(calls, 1);
  assert.equal(
    results.every((r) => r.items.length === 1 && !r.stale),
    true,
  );
  await fetch(`${root}/api/gaming/giveaways`);
  assert.equal(calls, 1);
  time += 91_000;
  fail = true;
  const stale = await (await fetch(`${root}/api/gaming/giveaways`)).json();
  assert.equal(stale.stale, true);
  assert.equal(stale.items.length, 1);
  assert.equal(stale.updatedAt, results[0].updatedAt);
  assert.match(stale.warning, /última consulta/);
  await fetch(`${root}/api/gaming/giveaways`);
  assert.equal(calls, 2);
  time += 61_000;
  fail = false;
  assert.equal(
    (await (await fetch(`${root}/api/gaming/giveaways`)).json()).stale,
    false,
  );
  assert.equal(calls, 3);
});
test("API: fuentes independientes, fechas parciales y sin proxy de URLs arbitrarias", async (t) => {
  const urls: string[] = [];
  const root = await serve(
    t,
    createGamingApi({
      now: () => timestamp,
      fetcher: (async (input) => {
        const url = String(input);
        urls.push(url);
        if (url.includes("gamerpower")) throw new Error("Offline");
        if (url.includes("featuredcategories"))
          return new Response(
            JSON.stringify({
              coming_soon: {
                items: [
                  { id: 20, name: "Futuro" },
                  { id: 21, name: "Futuro sin fecha" },
                ],
              },
              new_releases: { items: [{ id: 22, name: "Reciente" }] },
            }),
          );
        if (url.includes("appids=21")) throw new Error("Details unavailable");
        if (url.includes("appdetails"))
          return new Response(
            JSON.stringify({
              20: {
                success: true,
                data: {
                  release_date: { date: "18 Oct, 2026", coming_soon: true },
                },
              },
            }),
          );
        if (url.includes("/stores"))
          return new Response(
            JSON.stringify([{ storeID: "1", storeName: "Steam" }]),
          );
        return new Response(JSON.stringify([sampleDeal]));
      }) as typeof fetch,
    }),
  );
  assert.equal(
    (await (await fetch(`${root}/api/gaming/giveaways`)).json()).stale,
    true,
  );
  const releases = await (await fetch(`${root}/api/gaming/releases`)).json();
  assert.equal(releases.items.length, 3);
  assert.equal(releases.items[0].releaseDate, "2026-10-18");
  assert.equal(releases.items[1].releaseDate, null);
  assert.equal(releases.items[2].comingSoon, false);
  assert.equal(
    (await (await fetch(`${root}/api/gaming/deals`)).json()).items.length,
    1,
  );
  const count = urls.length;
  assert.equal(
    (await fetch(`${root}/api/gaming/https://evil.example`)).status,
    404,
  );
  assert.equal(
    (await fetch(`${root}/api/gaming/giveaways`, { method: "POST" })).status,
    405,
  );
  assert.equal(
    (
      await fetch(`${root}/api/gaming/giveaways`, {
        headers: { origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${root}/api/gaming/giveaways`, {
        headers: { "sec-fetch-site": "cross-site" },
      })
    ).status,
    403,
  );
  assert.equal(urls.length, count);
});
