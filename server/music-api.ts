import type { IncomingMessage, ServerResponse } from "node:http";
import { spotifyEmbed } from "../src/lib/dashboard.ts";
export function createMusicApi(fetcher: typeof fetch = fetch) {
  const cache = new Map<
    string,
    { at: number; status: number; title?: string }
  >();
  const pending = new Map<
    string,
    Promise<{ at: number; status: number; title?: string }>
  >();
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const request = new URL(req.url || "/", "http://127.0.0.1");
    if (request.pathname !== "/api/music/spotify") {
      next();
      return;
    }
    const reply = (status: number, data: unknown) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=300",
      });
      res.end(JSON.stringify(data));
    };
    if (req.method !== "GET") {
      reply(405, { error: "Método no permitido" });
      return;
    }
    if (
      !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(
        req.headers.host || "",
      ) ||
      req.headers["sec-fetch-site"] === "cross-site"
    ) {
      reply(403, {});
      return;
    }
    const embed = spotifyEmbed(request.searchParams.get("url") || "");
    if (!embed) {
      reply(400, { error: "Pega un enlace completo de Spotify." });
      return;
    }
    let result = cache.get(embed);
    if (
      !result ||
      Date.now() - result.at > (result.status === 200 ? 1800000 : 60000)
    ) {
      let work = pending.get(embed);
      if (!work) {
        work = (async () => {
          const canonical = embed.replace("/embed/", "/");
          const response = await fetcher(
            `https://open.spotify.com/oembed?url=${encodeURIComponent(canonical)}`,
            { signal: AbortSignal.timeout(8000), redirect: "error" },
          );
          if (!response.ok)
            return {
              at: Date.now(),
              status:
                response.status === 404 || response.status === 400 ? 404 : 503,
            };
          const body = await response.json();
          return {
            at: Date.now(),
            status: 200,
            title:
              typeof body.title === "string"
                ? body.title.slice(0, 300)
                : undefined,
          };
        })()
          .catch(() => ({ at: Date.now(), status: 503 }))
          .then((value) => {
            if (cache.size >= 100) cache.delete(cache.keys().next().value!);
            cache.set(embed, value);
            return value;
          })
          .finally(() => pending.delete(embed));
        pending.set(embed, work);
      }
      result = await work;
    }
    reply(200, {
      available:
        result.status === 404 ? false : result.status === 200 ? true : null,
      title: result.title || "",
      error:
        result.status === 404
          ? "Spotify no encuentra este contenido. Puede ser privado, haber sido eliminado o no estar disponible en tu región."
          : result.status !== 200
            ? "No pudimos comprobar el enlace. Puedes intentar abrir el reproductor."
            : "",
    });
  };
}
