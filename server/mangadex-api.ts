import { tr } from "../src/lib/i18n.ts";
import type { IncomingMessage, ServerResponse } from "node:http";

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttlMs: number) {
  // Prevent cache from growing unbounded
  if (cache.size > 500) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

const USER_AGENT = "Zenty/1.0";

async function mangadexFetch(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20000),
    redirect: "error",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(tr("mangadex_api.8d1defbbd3", { v0: res.status, v1: text || res.statusText }));
  }
  return res.json();
}

function resolveTitle(titleObj: Record<string, string> | undefined, altTitles?: Record<string, string>[]): string {
  if (!titleObj) return tr("mangadex_api.b3ca8d5687");
  if (titleObj["es"]) return titleObj["es"];
  if (titleObj["es-la"]) return titleObj["es-la"];
  if (titleObj["en"]) return titleObj["en"];
  if (titleObj["ja-ro"]) return titleObj["ja-ro"];
  const first = Object.values(titleObj)[0];
  if (first) return first;

  if (altTitles && Array.isArray(altTitles)) {
    for (const alt of altTitles) {
      if (alt["es"]) return alt["es"];
      if (alt["es-la"]) return alt["es-la"];
      if (alt["en"]) return alt["en"];
      if (alt["ja-ro"]) return alt["ja-ro"];
      const v = Object.values(alt)[0];
      if (v) return v;
    }
  }
  return tr("mangadex_api.b3ca8d5687");
}

function resolveDescription(descObj: Record<string, string> | undefined): string {
  if (!descObj) return "";
  return (
    descObj["es"] ||
    descObj["es-la"] ||
    descObj["en"] ||
    Object.values(descObj)[0] ||
    ""
  );
}

function getLanguageArray(lang: string): string[] {
  if (lang === "es-all") return ["es", "es-la"];
  if (lang === "es-la") return ["es-la"];
  if (lang === "es" || lang === "es-es") return ["es"];
  if (lang === "en") return ["en"];
  if (lang === "all" || !lang) return [];
  return [lang];
}

export function createMangaDexApi({ fetchJson = mangadexFetch }: { fetchJson?: typeof mangadexFetch } = {}) {
  const reply = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(data));
  };

  return async function handler(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void = () => {
      res.writeHead(404);
      res.end();
    },
  ) {
    if (!/^\/api\/mangadex(?:\/|\?|$)/.test(req.url || "")) {
      next();
      return;
    }

    try {
      const host = req.headers.host || "127.0.0.1";
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) ||
          !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress || "") ||
          req.headers["sec-fetch-site"] === "cross-site" ||
          (req.headers.origin && req.headers.origin !== `http://${host}`)) {
        reply(res, 403, { error: tr("mangadex_api.c7ebeeaa53") }); return;
      }
      const url = new URL(req.url || "/", `http://${host}`);
      const parts = url.pathname.split("/").filter(Boolean);
      // parts[0] === "api", parts[1] === "mangadex", parts[2] === action or manga
      const action = parts[2];
      if (["manga", "chapter"].includes(action) && !/^[a-zA-Z0-9-]{1,100}$/.test(parts[3] || "")) {
        reply(res, 400, { error: tr("mangadex_api.f35af09c9c") }); return;
      }

      // 1. GET /api/mangadex/search
      if (action === "search" && req.method === "GET") {
        const query = (url.searchParams.get("q") || "").trim();
        const lang = url.searchParams.get("lang") || "es-all";
        const offset = parseInt(url.searchParams.get("offset") || "0", 10) || 0;
        const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10) || 20));

        const cacheKey = `search:${query}:${lang}:${offset}:${limit}`;
        const cached = getCached(cacheKey);
        if (cached) {
          reply(res, 200, cached);
          return;
        }

        const params = new URLSearchParams();
        params.set("limit", String(limit));
        params.set("offset", String(offset));
        params.append("includes[]", "cover_art");
        params.append("includes[]", "author");
        params.append("contentRating[]", "safe");
        params.append("contentRating[]", "suggestive");
        params.append("contentRating[]", "erotica");

        if (query) {
          params.set("title", query);
          params.set("order[relevance]", "desc");
        } else {
          params.set("order[followedCount]", "desc");
        }

        const langs = getLanguageArray(lang);
        for (const l of langs) {
          params.append("availableTranslatedLanguage[]", l);
        }

        const apiUrl = `https://api.mangadex.org/manga?${params.toString()}`;
        const apiData = await fetchJson(apiUrl);

        const results = (apiData.data || []).map((m: any) => {
          const coverRel = (m.relationships || []).find((r: any) => r.type === "cover_art");
          const coverFile = coverRel?.attributes?.fileName;
          const authorRel = (m.relationships || []).find((r: any) => r.type === "author" || r.type === "artist");
          const authorName = authorRel?.attributes?.name;

          return {
            id: m.id,
            title: resolveTitle(m.attributes?.title, m.attributes?.altTitles),
            altTitle: m.attributes?.altTitles?.[0] ? Object.values(m.attributes.altTitles[0])[0] : undefined,
            description: resolveDescription(m.attributes?.description),
            coverUrl: coverFile
              ? `/api/mangadex/image?url=${encodeURIComponent(`https://uploads.mangadex.org/covers/${m.id}/${coverFile}.512.jpg`)}`
              : null,
            coverThumb: coverFile
              ? `/api/mangadex/image?url=${encodeURIComponent(`https://uploads.mangadex.org/covers/${m.id}/${coverFile}.256.jpg`)}`
              : null,
            status: m.attributes?.status,
            year: m.attributes?.year,
            contentRating: m.attributes?.contentRating,
            availableLanguages: m.attributes?.availableTranslatedLanguages || [],
            tags: (m.attributes?.tags || []).map((t: any) => t.attributes?.name?.en).filter(Boolean),
            author: authorName,
          };
        });

        const output = {
          results,
          total: apiData.total || results.length,
          offset,
          limit,
        };

        setCache(cacheKey, output, 5 * 60 * 1000); // 5 min cache
        reply(res, 200, output);
        return;
      }

      // 2. GET /api/mangadex/manga/:id/chapters
      if (action === "manga" && parts[4] === "chapters" && req.method === "GET") {
        const mangaId = parts[3];
        const lang = url.searchParams.get("lang") || "es-all";

        const cacheKey = `chapters:${mangaId}:${lang}`;
        const cached = getCached(cacheKey);
        if (cached) {
          reply(res, 200, cached);
          return;
        }

        const params = new URLSearchParams();
        params.set("limit", "500");
        params.set("order[chapter]", "asc");
        params.set("order[volume]", "asc");
        params.append("includes[]", "scanlation_group");
        params.append("contentRating[]", "safe");
        params.append("contentRating[]", "suggestive");
        params.append("contentRating[]", "erotica");

        const langs = getLanguageArray(lang);
        for (const l of langs) {
          params.append("translatedLanguage[]", l);
        }

        const rawChapters: any[] = [];
        let offset = 0;
        while (true) {
          params.set("offset", String(offset));
          const feedData = await fetchJson(`https://api.mangadex.org/manga/${mangaId}/feed?${params.toString()}`);
          const batch = Array.isArray(feedData.data) ? feedData.data : [];
          rawChapters.push(...batch);
          offset += batch.length;
          if (!batch.length || offset >= Number(feedData.total || 0)) break;
          if (offset >= 10000) throw new Error(tr("mangadex_api.50f43d1833"));
        }
        // Deduplicate chapters: prefer chapters with pages > 0 (internal reader)
        const chapterMap = new Map<string, any>();
        for (const c of rawChapters) {
          const number = c.attributes?.chapter;
          const chNum = number == null || number === "" ? c.id :
            `${c.attributes?.volume ?? ""}:${number}:${c.attributes?.translatedLanguage || ""}`;
          const isExt = !!c.attributes?.externalUrl || c.attributes?.pages === 0;
          const existing = chapterMap.get(chNum);
          if (!existing) {
            chapterMap.set(chNum, c);
          } else {
            const existingIsExt = !!existing.attributes?.externalUrl || existing.attributes?.pages === 0;
            if (existingIsExt && !isExt) {
              chapterMap.set(chNum, c);
            } else if (!existingIsExt && !isExt && (c.attributes?.pages || 0) > (existing.attributes?.pages || 0)) {
              chapterMap.set(chNum, c);
            }
          }
        }

        const sorted = Array.from(chapterMap.values()).sort((a: any, b: any) => {
          const numA = parseFloat(a.attributes?.chapter || "0");
          const numB = parseFloat(b.attributes?.chapter || "0");
          if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
            return numA - numB;
          }
          return (a.attributes?.chapter || "0").localeCompare(b.attributes?.chapter || "0", undefined, { numeric: true });
        });

        const chapters = sorted.map((c: any) => {
          const groupRel = (c.relationships || []).find((r: any) => r.type === "scanlation_group");
          return {
            id: c.id,
            chapter: c.attributes?.chapter || "0",
            volume: c.attributes?.volume || null,
            title: c.attributes?.title || "",
            pages: c.attributes?.pages || 0,
            language: c.attributes?.translatedLanguage || "",
            publishAt: c.attributes?.publishAt || "",
            externalUrl: safeExternalChapter(c.attributes?.externalUrl),
            isExternal: !!c.attributes?.externalUrl || (c.attributes?.pages || 0) === 0,
            scanlationGroup: groupRel?.attributes?.name || null,
          };
        });

        const output = { chapters, total: chapters.length };
        setCache(cacheKey, output, 10 * 60 * 1000); // 10 min cache
        reply(res, 200, output);
        return;
      }

      // 3. GET /api/mangadex/manga/:id
      if (action === "manga" && parts[3] && !parts[4] && req.method === "GET") {
        const mangaId = parts[3];
        const cacheKey = `manga:${mangaId}`;
        const cached = getCached(cacheKey);
        if (cached) {
          reply(res, 200, cached);
          return;
        }

        const apiUrl = `https://api.mangadex.org/manga/${mangaId}?includes[]=cover_art&includes[]=author`;
        const m = (await fetchJson(apiUrl)).data;

        const coverRel = (m.relationships || []).find((r: any) => r.type === "cover_art");
        const coverFile = coverRel?.attributes?.fileName;
        const authorRel = (m.relationships || []).find((r: any) => r.type === "author" || r.type === "artist");

        const output = {
          id: m.id,
          title: resolveTitle(m.attributes?.title, m.attributes?.altTitles),
          altTitle: m.attributes?.altTitles?.[0] ? Object.values(m.attributes.altTitles[0])[0] : undefined,
          description: resolveDescription(m.attributes?.description),
          coverUrl: coverFile
            ? `/api/mangadex/image?url=${encodeURIComponent(`https://uploads.mangadex.org/covers/${m.id}/${coverFile}.512.jpg`)}`
            : null,
          coverThumb: coverFile
            ? `/api/mangadex/image?url=${encodeURIComponent(`https://uploads.mangadex.org/covers/${m.id}/${coverFile}.256.jpg`)}`
            : null,
          status: m.attributes?.status,
          year: m.attributes?.year,
          contentRating: m.attributes?.contentRating,
          availableLanguages: m.attributes?.availableTranslatedLanguages || [],
          tags: (m.attributes?.tags || []).map((t: any) => t.attributes?.name?.en).filter(Boolean),
          author: authorRel?.attributes?.name,
        };

        setCache(cacheKey, output, 15 * 60 * 1000);
        reply(res, 200, output);
        return;
      }

      // 4. GET /api/mangadex/chapter/:chapterId/pages
      if (action === "chapter" && parts[4] === "pages" && req.method === "GET") {
        const chapterId = parts[3];
        const cacheKey = `pages:${chapterId}`;
        const cached = getCached(cacheKey);
        if (cached) {
          reply(res, 200, cached);
          return;
        }

        const apiUrl = `https://api.mangadex.org/at-home/server/${chapterId}`;
        const homeData = await fetchJson(apiUrl);
        const baseUrl = homeData.baseUrl;
        const hash = homeData.chapter?.hash;
        const files: string[] = homeData.chapter?.data || [];
        const filesDataSaver: string[] = homeData.chapter?.dataSaver || [];

        const pages = files.map(
          (f) => `/api/mangadex/image?url=${encodeURIComponent(`${baseUrl}/data/${hash}/${f}`)}`,
        );
        const pagesDataSaver = filesDataSaver.map(
          (f) => `/api/mangadex/image?url=${encodeURIComponent(`${baseUrl}/data-saver/${hash}/${f}`)}`,
        );

        const output = {
          chapterId,
          baseUrl,
          hash,
          pages,
          pagesDataSaver: pagesDataSaver.length ? pagesDataSaver : pages,
          totalPages: pages.length,
        };

        setCache(cacheKey, output, 15 * 60 * 1000);
        reply(res, 200, output);
        return;
      }

      // 5. GET/HEAD /api/mangadex/image?url=...
      if (action === "image" && (req.method === "GET" || req.method === "HEAD")) {
        const targetUrl = url.searchParams.get("url");
        if (!targetUrl) {
          reply(res, 400, { error: tr("mangadex_api.f67e05ef00") });
          return;
        }

        let parsed: URL;
        try {
          parsed = new URL(targetUrl);
        } catch {
          reply(res, 400, { error: tr("mangadex_api.7b5287fd1f") });
          return;
        }

        const allowed =
          parsed.hostname === "uploads.mangadex.org" ||
          parsed.hostname === "api.mangadex.org" ||
          parsed.hostname.endsWith(".mangadex.org") ||
          parsed.hostname.endsWith(".mangadex.network");

        if (!allowed || parsed.protocol !== "https:" || parsed.username || parsed.password || (parsed.port && parsed.port !== "443")) {
          reply(res, 403, { error: tr("mangadex_api.600a21378e") });
          return;
        }

        try {
          const imgRes = await fetch(targetUrl, {
            redirect: "error",
            signal: AbortSignal.timeout(20000),
            method: req.method,
            headers: {
              "User-Agent": USER_AGENT,
              Referer: "https://mangadex.org/",
              Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
            },
          });

          if (!imgRes.ok) {
            reply(res, imgRes.status, { error: tr("mangadex_api.d85816bac3", { v0: imgRes.status }) });
            return;
          }

          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const contentLength = imgRes.headers.get("content-length");
          if (!/^image\/(jpeg|png|webp|avif|gif)(?:;|$)/i.test(contentType) || Number(contentLength || 0) > 20_000_000) {
            await imgRes.body?.cancel();
            reply(res, 502, { error: tr("mangadex_api.ccd7f8ae78") }); return;
          }

          const headers: Record<string, string> = {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=604800, immutable",
            "X-Content-Type-Options": "nosniff",
          };
          if (contentLength) headers["Content-Length"] = contentLength;

          if (req.method === "HEAD") {
            res.writeHead(200, headers);
            res.end();
            return;
          }

          const chunks: Buffer[] = []; let size = 0;
          for await (const chunk of imgRes.body || []) {
            size += chunk.length;
            if (size > 20_000_000) throw new Error(tr("mangadex_api.7289b3420c"));
            chunks.push(Buffer.from(chunk));
          }
          const buffer = Buffer.concat(chunks);
          headers["Content-Length"] = String(buffer.length);
          res.writeHead(200, headers);
          res.end(buffer);
          return;
        } catch {
          reply(res, 502, { error: tr("mangadex_api.2893675768") });
          return;
        }
      }

      reply(res, 404, { error: tr("mangadex_api.9ea25cfa71") });
    } catch (err) {
      reply(res, 500, {
        error: (err as Error).message || tr("mangadex_api.2045971771"),
      });
    }
  };
}
function safeExternalChapter(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
