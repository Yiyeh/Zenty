import { APP_NAME } from "../src/lib/brand.ts";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  dateOnly,
  emptyGame,
  giveawayExpired,
  httpsUrl,
  validSavedGame,
} from "../src/lib/gaming.ts";
import type { GameItem, GamingFeed } from "../src/lib/gaming.ts";
type Row = Record<string, any>;
const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? value.filter((v) => v && typeof v === "object") : [];
const text = (value: unknown, limit = 20_000) =>
  typeof value === "string" ? value.slice(0, limit) : "";
const money = (value: unknown) =>
  ((typeof value === "string" && value.trim()) || typeof value === "number") &&
  Number.isFinite(Number(value)) &&
  Number(value) >= 0
    ? Number(value)
    : null;
export function normalizeGiveaways(
  value: unknown,
  now = Date.now(),
): GameItem[] {
  if (!Array.isArray(value)) {
    if ((value as Row)?.status === 0 || (value as Row)?.status === 201)
      return [];
    throw new Error("Unexpected GamerPower response");
  }
  return rows(value).flatMap((r) => {
    const url = httpsUrl(r.gamerpower_url, [
      "www.gamerpower.com",
      "gamerpower.com",
    ]);
    if (
      !Number.isSafeInteger(r.id) ||
      !text(r.title) ||
      !url ||
      r.status !== "Active"
    )
      return [];
    const game = emptyGame({
      id: `gp:${r.id}`,
      title: text(r.title, 500),
      source: "gamerpower",
      kind:
        r.type === "Game"
          ? "game"
          : /beta|early access/i.test(r.type)
            ? "beta"
            : "loot",
      url,
      image: httpsUrl(r.image) || httpsUrl(r.thumbnail),
      platforms: text(r.platforms)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20),
      description: text(r.description),
      instructions: text(r.instructions),
      endDate: dateOnly(r.end_date),
    });
    return giveawayExpired(game, now) ? [] : [game];
  });
}
export function normalizeDeals(value: unknown, stores: unknown): GameItem[] {
  if (!Array.isArray(value) || !Array.isArray(stores))
    throw new Error("Unexpected CheapShark response");
  const names = new Map(
    rows(stores).map((s) => [String(s.storeID), text(s.storeName, 100)]),
  );
  const seen = new Set<string>();
  return rows(value).flatMap((r) => {
    const price = money(r.salePrice),
      regularPrice = money(r.normalPrice);
    if (
      !text(r.gameID) ||
      !text(r.dealID) ||
      !text(r.title) ||
      price === null ||
      regularPrice === null ||
      price >= regularPrice ||
      seen.has(r.gameID)
    )
      return [];
    seen.add(r.gameID);
    return [
      emptyGame({
        id: `cs:${r.gameID}`,
        title: text(r.title, 500),
        source: "cheapshark",
        kind: "deal",
        url: `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(r.dealID)}`,
        image: httpsUrl(r.thumb),
        platforms: [
          "PC",
          ...["Steam", "GOG", "Epic Games Store"].filter(
            (s) => s === names.get(String(r.storeID)),
          ),
        ],
        price,
        regularPrice,
        discount: Math.max(
          0,
          Math.min(100, Math.round((1 - price / regularPrice) * 100)),
        ),
        store: names.get(String(r.storeID)) || "Tienda de PC",
      }),
    ];
  });
}
export function normalizeRelease(
  row: Row,
  detail?: Row,
  upcoming = true,
): GameItem | null {
  if (!Number.isSafeInteger(row.id) || !text(row.name)) return null;
  const release = detail?.release_date;
  const label = text(release?.date, 150);
  // Steam's Spanish date is presentation text; only parse an unambiguous English date from appdetails.
  const timestamp =
    label && /^\d{1,2} [A-Za-z]{3},? \d{4}$/.test(label)
      ? Date.parse(label + " 12:00:00 GMT")
      : NaN;
  return emptyGame({
    id: `steam:${row.id}`,
    title: text(row.name, 500),
    source: "steam",
    kind: "release",
    url: `https://store.steampowered.com/app/${row.id}/`,
    image: httpsUrl(row.header_image) || httpsUrl(row.large_capsule_image),
    platforms: ["PC", "Steam"],
    releaseDate: Number.isFinite(timestamp)
      ? new Date(timestamp).toISOString().slice(0, 10)
      : null,
    releaseLabel: label,
    comingSoon:
      typeof release?.coming_soon === "boolean"
        ? release.coming_soon
        : upcoming,
    demo: detail?.type === "demo" || /\bdemo\b/i.test(row.name),
    description: text(detail?.short_description).replace(/<[^>]*>/g, ""),
  });
}
interface Options {
  directory?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  ttl?: number;
}
export function createGamingApi({
  directory,
  fetcher = fetch,
  now = Date.now,
  ttl = 15 * 60_000,
}: Options = {}) {
  const cache = new Map<string, GamingFeed>();
  const flights = new Map<string, Promise<GamingFeed>>();
  const attempts = new Map<string, number>();
  const restored = new Map<string, Promise<void>>();
  async function restore(kind: string) {
    if (!directory) return;
    if (restored.has(kind)) return restored.get(kind);
    const work = (async () => {
      try {
        const raw = await readFile(join(directory, `${kind}.json`), "utf8");
        if (raw.length > 8_000_000) return;
        const saved: GamingFeed = JSON.parse(raw);
        if (
          typeof saved.updatedAt !== "string" ||
          !Number.isFinite(Date.parse(saved.updatedAt)) ||
          !Array.isArray(saved.items) ||
          !saved.items.every((g) =>
            validSavedGame({
              id: g?.id,
              game: g,
              status: "pending",
              note: "",
              addedAt: saved.updatedAt,
            }),
          )
        )
          return;
        cache.set(kind, saved);
      } catch {
        /* A missing/disposable feed is requested from its source. */
      }
    })();
    restored.set(kind, work);
    return work;
  }
  async function json(url: string) {
    const response = await fetcher(url, {
      headers: {
        "User-Agent": `${APP_NAME}-PersonalDashboard/1.0 (local personal dashboard)`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
    const body = await response.text();
    if (body.length > 8_000_000) throw new Error("Source too large");
    return JSON.parse(body);
  }
  async function releases(): Promise<GameItem[]> {
    const categories = await json(
      "https://store.steampowered.com/api/featuredcategories/?cc=cl&l=english",
    );
    if (
      !Array.isArray(categories?.coming_soon?.items) ||
      !Array.isArray(categories?.new_releases?.items)
    )
      throw new Error("Unexpected Steam response");
    const incoming = rows(categories.coming_soon.items).slice(0, 10);
    const details = new Map<number, Row>();
    // Small fixed batch, never an unbounded scan of Steam's catalogue.
    for (let i = 0; i < incoming.length; i += 3) {
      await Promise.all(
        incoming.slice(i, i + 3).map(async (r) => {
          if (!Number.isSafeInteger(r.id)) return;
          try {
            const detail = await json(
              `https://store.steampowered.com/api/appdetails?appids=${r.id}&cc=cl&l=english&filters=basic,release_date`,
            );
            if (detail?.[r.id]?.success && detail[r.id].data)
              details.set(r.id, detail[r.id].data);
          } catch {
            /* Keep the official selection with an explicitly unknown date. */
          }
        }),
      );
    }
    const combined = [
      ...incoming.map((r) => normalizeRelease(r, details.get(r.id))),
      ...rows(categories.new_releases.items)
        .slice(0, 10)
        .map((r) => normalizeRelease(r, undefined, false)),
    ].filter((g): g is GameItem => !!g);
    return [...new Map(combined.map((g) => [g.id, g])).values()];
  }
  async function load(kind: string): Promise<GameItem[]> {
    if (kind === "giveaways")
      return normalizeGiveaways(
        await json("https://www.gamerpower.com/api/giveaways?sort-by=date"),
        now(),
      );
    if (kind === "deals") {
      const [deals, stores] = await Promise.all([
        json(
          "https://www.cheapshark.com/api/1.0/deals?pageSize=40&onSale=1&sortBy=DealRating",
        ),
        json("https://www.cheapshark.com/api/1.0/stores"),
      ]);
      return normalizeDeals(deals, stores);
    }
    return releases();
  }
  async function feed(kind: string): Promise<GamingFeed> {
    await restore(kind);
    const old = cache.get(kind);
    if (old?.updatedAt && now() - Date.parse(old.updatedAt) < ttl)
      return { ...old, stale: false, warning: "" };
    if (flights.has(kind)) return flights.get(kind)!;
    if (attempts.has(kind) && now() - attempts.get(kind)! < 60_000)
      return {
        items: old?.items || [],
        updatedAt: old?.updatedAt || null,
        stale: true,
        warning:
          "La fuente no respondió. Puedes volver a intentar en un minuto.",
      };
    attempts.set(kind, now());
    const pending = load(kind)
      .then(async (items) => {
        const result = {
          items,
          updatedAt: new Date(now()).toISOString(),
          stale: false,
          warning: "",
        };
        cache.set(kind, result);
        if (directory) {
          try {
            await mkdir(directory, { recursive: true });
            const target = join(directory, `${kind}.json`),
              temp = `${target}.${randomUUID()}.tmp`;
            await writeFile(temp, JSON.stringify(result));
            await rename(temp, target);
          } catch {
            return {
              ...result,
              warning:
                "La consulta está disponible, pero no se pudo guardar en disco para la próxima sesión.",
            };
          }
        }
        return result;
      })
      .catch(() => ({
        items: old?.items || [],
        updatedAt: old?.updatedAt || null,
        stale: true,
        warning: old
          ? "La fuente no respondió. Se muestra la última consulta; comprueba la vigencia en la tienda."
          : "No se pudo consultar esta fuente. Reintenta en un minuto o abre su sitio.",
      }))
      .finally(() => flights.delete(kind));
    flights.set(kind, pending);
    return pending;
  }
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    if (!req.url?.split("?")[0].startsWith("/api/gaming/")) {
      next();
      return;
    }
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(body));
    };
    const host = req.headers.host || "";
    const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
    const peer = req.socket.remoteAddress || "";
    if (
      !localHost ||
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer) ||
      req.headers["sec-fetch-site"] === "cross-site" ||
      (req.headers.origin &&
        req.headers.origin !== `http://${host}` &&
        req.headers.origin !== `https://${host}`)
    ) {
      reply(403, {
        error: `Solo disponible desde ${APP_NAME} en este equipo.`,
      });
      return;
    }
    if (req.method !== "GET") {
      reply(405, { error: "Método no permitido." });
      return;
    }
    const kind = req.url.split("?")[0].slice("/api/gaming/".length);
    if (!["giveaways", "deals", "releases"].includes(kind)) {
      reply(404, { error: "Fuente desconocida." });
      return;
    }
    reply(200, await feed(kind));
  };
}
