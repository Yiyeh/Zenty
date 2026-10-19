import { tr } from "../src/lib/i18n.ts";
import { createGameImages } from "./game-images.ts";
import { normalizeNewsFeed } from "../src/lib/news.ts";
import { APP_NAME } from "../src/lib/brand.ts";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import type {
  NewsArticle,
  NewsFeedResponse,
  NewsSourceInfo,
} from "../src/lib/news.ts";

export const DEFAULT_SOURCES: NewsSourceInfo[] = ([
  {
    id: "xataka",
    get name() { return "Xataka"; },
    siteUrl: "https://www.xataka.com",
    feedUrl: "https://feeds.weblogssl.com/xataka2",
    category: "tech",
    language: "es",
    color: "#00b289",
    enabled: true,
  },
  {
    id: "genbeta",
    get name() { return "Genbeta"; },
    siteUrl: "https://www.genbeta.com",
    feedUrl: "https://feeds.weblogssl.com/genbeta",
    category: "tech",
    language: "es",
    color: "#1484ff",
    enabled: true,
  },
  {
    id: "theverge",
    get name() { return "The Verge"; },
    siteUrl: "https://www.theverge.com",
    feedUrl: "https://www.theverge.com/rss/index.xml",
    category: "tech",
    language: "en",
    color: "#e31255",
    enabled: true,
  },
  {
    id: "arstechnica",
    get name() { return "Ars Technica"; },
    siteUrl: "https://arstechnica.com",
    feedUrl: "https://feeds.arstechnica.com/arstechnica/index",
    category: "tech",
    language: "en",
    color: "#ff4e00",
    enabled: true,
  },
  {
    id: "3djuegos",
    get name() { return "3DJuegos"; },
    siteUrl: "https://www.3djuegos.com",
    feedUrl: "https://www.3djuegos.com/universo/rss/rss.php",
    category: "gaming",
    language: "es",
    color: "#e60012",
    enabled: true,
  },
  {
    id: "eurogamer",
    get name() { return "Eurogamer"; },
    siteUrl: "https://www.eurogamer.es",
    feedUrl: "https://www.eurogamer.es/feed",
    category: "gaming",
    language: "es",
    color: "#0072ce",
    enabled: true,
  },
  {
    id: "polygon",
    get name() { return "Polygon"; },
    siteUrl: "https://www.polygon.com",
    feedUrl: "https://www.polygon.com/rss/index.xml",
    category: "gaming",
    language: "en",
    color: "#e51255",
    enabled: true,
  },
  {
    id: "ramenparados",
    get name() { return tr("news_api.3f58b915d4"); },
    siteUrl: "https://ramenparados.com",
    feedUrl: "https://ramenparados.com/feed/",
    category: "anime",
    language: "es",
    color: "#ff6f00",
    enabled: true,
  },
  {
    id: "ann",
    get name() { return "Anime News Network"; },
    siteUrl: "https://www.animenewsnetwork.com",
    feedUrl: "https://www.animenewsnetwork.com/news/rss.xml",
    category: "anime",
    language: "en",
    color: "#1d3557",
    enabled: true,
  },
  {
    id: "elpais_ciencia",
    get name() { return "El País Ciencia"; },
    siteUrl: "https://elpais.com/ciencia",
    feedUrl:
      "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ciencia/portada",
    category: "science",
    language: "es",
    color: "#1a365d",
    enabled: true,
  },
  {
    id: "physorg",
    get name() { return "Phys.org"; },
    siteUrl: "https://phys.org",
    feedUrl: "https://phys.org/rss-feed/",
    category: "science",
    language: "en",
    color: "#0284c7",
    enabled: true,
  },
  {
    id: "espinof",
    get name() { return "Espinof"; },
    siteUrl: "https://www.espinof.com",
    feedUrl: "https://feeds.weblogssl.com/espinof",
    category: "culture",
    language: "es",
    color: "#d97706",
    enabled: true,
  },
  {
    id: "bbcmundo",
    get name() { return tr("news_api.f59ff44ce9"); },
    siteUrl: "https://www.bbc.com/mundo",
    feedUrl: "https://feeds.bbci.co.uk/mundo/rss.xml",
    category: "general",
    language: "es",
    color: "#bb1919",
    enabled: true,
  },
]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  get aacute() { return "á"; },
  get eacute() { return "é"; },
  get iacute() { return "í"; },
  get oacute() { return "ó"; },
  get uacute() { return "ú"; },
  get ntilde() { return "ñ"; },
  get Aacute() { return "Á"; },
  get Eacute() { return "É"; },
  get Iacute() { return "Í"; },
  get Oacute() { return "Ó"; },
  get Uacute() { return "Ú"; },
  get Ntilde() { return "Ñ"; },
  get uuml() { return "ü"; },
  get Uuml() { return "Ü"; },
  iexcl: "¡",
  iquest: "¿",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  bull: "•",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
};

export function decodeHtmlEntities(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return "";
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return "";
      }
    })
    .replace(/&([a-zA-Z]+);/g, (match, name) => NAMED_ENTITIES[name] ?? match);
}

export function cleanText(input: string): string {
  if (!input) return "";
  const decoded = decodeHtmlEntities(input);
  return decoded
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractImageUrl(chunk: string): string | null {
  // 1. media:content url="..."
  const mediaContent = chunk.match(
    /<media:content[^>]*?\burl=["']([^"']+)["']/i,
  );
  if (mediaContent && /^https?:\/\//i.test(mediaContent[1])) {
    return mediaContent[1];
  }
  // 2. media:thumbnail url="..."
  const mediaThumb = chunk.match(
    /<media:thumbnail[^>]*?\burl=["']([^"']+)["']/i,
  );
  if (mediaThumb && /^https?:\/\//i.test(mediaThumb[1])) {
    return mediaThumb[1];
  }
  // 3. enclosure url="..." (image)
  const enclosure = chunk.match(
    /<enclosure[^>]*?\burl=["']([^"']+)["'][^>]*?(?:type=["']image\/[^"']*["']|)/i,
  );
  if (
    enclosure &&
    /^https?:\/\//i.test(enclosure[1]) &&
    (enclosure[0].includes("image/") ||
      /\.(jpe?g|png|webp|gif)/i.test(enclosure[1]))
  ) {
    return enclosure[1];
  }
  // 4. img src="..."
  const imgTag = chunk.match(/<img[^>]*?\bsrc=["']([^"']+)["']/i);
  if (
    imgTag &&
    /^https?:\/\//i.test(imgTag[1]) &&
    !imgTag[1].includes("feedburner") &&
    !imgTag[1].includes("pixel")
  ) {
    return imgTag[1];
  }
  return null;
}

export function parseRssOrAtom(
  xml: string,
  source: NewsSourceInfo,
): NewsArticle[] {
  const articles: NewsArticle[] = [];
  const isAtom = /<feed[\s>]/i.test(xml);
  const tagName = isAtom ? "entry" : "item";
  const regex = new RegExp(`<${tagName}[\\s\\S]*?<\\/${tagName}>`, "gi");

  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null && articles.length < 25) {
    const chunk = match[0];

    // Title
    const titleMatch = chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = cleanText(titleMatch ? titleMatch[1] : "");

    // Link
    let link = "";
    if (isAtom) {
      const linkMatch =
        chunk.match(
          /<link[^>]*?rel=["']alternate["'][^>]*?href=["']([^"']+)["']/i,
        ) || chunk.match(/<link[^>]*?href=["']([^"']+)["']/i);
      link = linkMatch ? linkMatch[1].trim() : "";
    } else {
      const linkMatch = chunk.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
      link = linkMatch ? cleanText(linkMatch[1]) : "";
    }

    if (!title || !link || !/^https?:\/\//i.test(link)) {
      continue;
    }

    // Summary
    const summaryMatch = chunk.match(
      /<(?:description|summary|content)[^>]*>([\s\S]*?)<\/(?:description|summary|content)>/i,
    );
    const summary = cleanText(summaryMatch ? summaryMatch[1] : "").slice(
      0,
      320,
    );

    // Published date
    const dateMatch = chunk.match(
      /<(?:pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated|dc:date)>/i,
    );
    let publishedAt: string | null = null;
    if (dateMatch) {
      const parsed = Date.parse(cleanText(dateMatch[1]));
      if (!isNaN(parsed)) {
        publishedAt = new Date(parsed).toISOString();
      }
    }

    // Image URL
    const imageUrl = extractImageUrl(chunk);

    // Tags / Categories
    const tags: string[] = [];
    const catRegex =
      /<category[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>|<category[^>]*?\bterm=["']([^"']+)["']/gi;
    let catMatch: RegExpExecArray | null;
    while ((catMatch = catRegex.exec(chunk)) !== null) {
      const tagText = cleanText(catMatch[1] || catMatch[2]);
      if (tagText && tagText.length <= 40 && !tags.includes(tagText)) {
        tags.push(tagText);
      }
    }

    // Calculate reading time estimate
    const wordCount = (title + " " + summary).split(/\s+/).length;
    const readTimeMinutes = Math.max(
      2,
      Math.min(10, Math.ceil(wordCount / 120)),
    );

    const id = `${source.id}:${createHash("sha256").update(link).digest("hex").slice(0, 16)}`;

    articles.push({
      id,
      title,
      link,
      summary,
      publishedAt,
      source: {
        id: source.id,
        name: source.name,
        siteUrl: source.siteUrl,
      },
      category: source.category,
      imageUrl,
      tags: tags.slice(0, 6),
      readTimeMinutes,
    });
  }

  return articles;
}

interface NewsApiOptions {
  directory?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  ttl?: number;
}

export function createNewsApi({
  directory,
  fetcher = fetch,
  now = Date.now,
  ttl = 15 * 60_000,
}: NewsApiOptions = {}) {
  let cachedFeed: NewsFeedResponse | null = null;
  let cacheTime = 0;
  let activeFlight: Promise<NewsFeedResponse> | null = null;
  const images = createGameImages({
    directory: join(directory || "dashboard-data", "news-images"),
    route: "/api/news/image",
  });
  const unavailableSources = new Set<string>();
  const sourceArticles = new Map<string, NewsArticle[]>();

  async function restore() {
    if (!directory) return;
    try {
      const raw = await readFile(join(directory, "news-cache.json"), "utf8");
      if (raw.length > 10_000_000) return;
      const parsed = normalizeNewsFeed(JSON.parse(raw));
      if (Array.isArray(parsed.items) && parsed.items.length > 0) {
        cachedFeed = parsed;
        cacheTime = Math.min(now(), Date.parse(parsed.updatedAt));
        for (const item of parsed.items) {
          const list = sourceArticles.get(item.source.id) || [];
          list.push(item);
          sourceArticles.set(item.source.id, list);
        }
      }
    } catch {
      /* Missing cache is expected on first launch */
    }
  }

  const restored = restore();

  async function fetchFeed(source: NewsSourceInfo): Promise<NewsArticle[]> {
    try {
      const response = await fetcher(source.feedUrl, {
        headers: {
          "User-Agent": `Mozilla/5.0 (compatible; ${APP_NAME}-Dashboard/1.0)`,
          Accept:
            "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        },
        signal: AbortSignal.timeout(6500),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const xml = await response.text();
      if (!xml || xml.length < 50 || xml.length > 3_000_000)
        throw new Error(tr("news_api.6b6f5760d5"));
      const parsed = parseRssOrAtom(xml, source);
      if (!parsed.length) throw new Error(tr("news_api.dfede8b832"));
      unavailableSources.delete(source.id);
      if (parsed.length > 0) {
        sourceArticles.set(source.id, parsed);
      }
      return parsed;
    } catch {
      unavailableSources.add(source.id);
      // Return previous articles for this source if available
      return sourceArticles.get(source.id) || [];
    }
  }

  async function getAggregatedFeed(
    forceRefresh = false,
  ): Promise<NewsFeedResponse> {
    await restored;

    const isExpired = now() - cacheTime > ttl;
    if (!forceRefresh && cachedFeed && !isExpired) {
      return cachedFeed;
    }

    if (activeFlight) {
      return activeFlight;
    }

    activeFlight = (async () => {
      try {
        const fetchPromises = DEFAULT_SOURCES.map((source) =>
          fetchFeed(source).catch(() => sourceArticles.get(source.id) || []),
        );

        const results = await Promise.all(fetchPromises);
        const allArticles = results.flat();

        // Deduplicate articles by normalized link or title
        const seen = new Set<string>();
        const uniqueArticles: NewsArticle[] = [];

        for (const article of allArticles) {
          const key = article.link.toLowerCase().replace(/\/$/, "");
          if (!seen.has(key)) {
            seen.add(key);
            uniqueArticles.push(article);
          }
        }

        // Sort by published date descending (nulls at end)
        uniqueArticles.sort((a, b) => {
          const timeA = a.publishedAt ? Date.parse(a.publishedAt) : 0;
          const timeB = b.publishedAt ? Date.parse(b.publishedAt) : 0;
          return timeB - timeA;
        });

        const feedResult: NewsFeedResponse = {
          items: uniqueArticles,
          sources: DEFAULT_SOURCES,
          updatedAt:
            unavailableSources.size === DEFAULT_SOURCES.length && cachedFeed
              ? cachedFeed.updatedAt
              : new Date(now()).toISOString(),
          stale: unavailableSources.size === DEFAULT_SOURCES.length,
          unavailableSources: [...unavailableSources],
          total: uniqueArticles.length,
        };

        if (!uniqueArticles.length) throw new Error(tr("news_api.8c5d82601e"));
        cachedFeed = feedResult;
        cacheTime = now();

        if (directory) {
          try {
            await mkdir(directory, { recursive: true });
            const target = join(directory, "news-cache.json");
            const temp = `${target}.${randomUUID()}.tmp`;
            await writeFile(temp, JSON.stringify(feedResult));
            await rename(temp, target);
          } catch {
            // Ignore disk cache write errors
          }
        }

        return feedResult;
      } finally {
        activeFlight = null;
      }
    })();

    return activeFlight;
  }

  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const [path, queryString] = (req.url || "").split("?");

    if (
      path !== "/api/news" &&
      path !== "/api/news/sources" &&
      path !== "/api/news/image"
    ) {
      next();
      return;
    }

    const reply = (code: number, value: unknown) => {
      res.writeHead(code, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(value));
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
        error: tr("news_api.b0d2ede4ec", { v0: APP_NAME }),
      });
      return;
    }

    if (path === "/api/news/image") {
      await images.middleware(req, res, next);
      return;
    }

    if (req.method !== "GET") {
      reply(405, { error: tr("news_api.1bd43567cd") });
      return;
    }

    // Sources endpoint
    if (path === "/api/news/sources") {
      reply(200, { sources: DEFAULT_SOURCES });
      return;
    }

    // Main news endpoint
    const params = new URLSearchParams(queryString || "");
    const forceRefresh =
      params.get("refresh") === "1" || params.get("refresh") === "true";
    const categoryFilter = params.get("category");
    const sourceFilter = params.get("source");
    const query = params.get("q")?.toLowerCase().trim();
    const tag = params.get("tag")?.toLowerCase().trim();
    const requestedLimit = Number(params.get("limit") || 200);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(200, Math.max(1, Math.floor(requestedLimit)))
      : 200;

    try {
      const feed = await getAggregatedFeed(forceRefresh);
      let filtered = feed.items;

      if (
        categoryFilter &&
        categoryFilter !== "all" &&
        categoryFilter !== "saved"
      ) {
        filtered = filtered.filter((item) => item.category === categoryFilter);
      }

      if (sourceFilter) {
        filtered = filtered.filter((item) => item.source.id === sourceFilter);
      }

      if (query) {
        filtered = filtered.filter(
          (item) =>
            item.title.toLowerCase().includes(query) ||
            item.summary.toLowerCase().includes(query) ||
            item.source.name.toLowerCase().includes(query) ||
            item.tags.some((t) => t.toLowerCase().includes(query)),
        );
      }

      if (tag) {
        filtered = filtered.filter(
          (item) =>
            item.tags.some((t) => t.toLowerCase().includes(tag)) ||
            item.title.toLowerCase().includes(tag) ||
            item.summary.toLowerCase().includes(tag),
        );
      }

      reply(200, {
        items: filtered.slice(0, limit),
        sources: feed.sources,
        updatedAt: feed.updatedAt,
        total: filtered.length,
        stale: feed.stale,
        unavailableSources: feed.unavailableSources,
      });
    } catch {
      reply(500, { error: tr("news_api.309b093fe5") });
    }
  };
}
