import { tr } from "../src/lib/i18n.ts";
import { APP_NAME } from "../src/lib/brand.ts";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, join, extname, sep } from "node:path";
import { createLibraryApi } from "./library-api.ts";
import { createMangaDexApi } from "./mangadex-api.ts";
import { createGamingApi } from "./gaming-api.ts";
import { createInstalledApi } from "./installed-api.ts";
import { createDashboardApi } from "./dashboard-api.ts";
import { createMusicApi } from "./music-api.ts";
import { createNewsApi } from "./news-api.ts";
export async function startLocalServer({
  root = resolve("dist"),
  dataDirectory = process.cwd(),
  port = 5173,
  isLocked = () => false,
}: { root?: string; dataDirectory?: string; port?: number; isLocked?: () => boolean } = {}) {
  root = resolve(root);
  const contentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com/gsi/",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://api.mangadex.org https://uploads.mangadex.org https://*.mangadex.org https://*.mangadex.network https://accounts.spotify.com https://api.spotify.com https://accounts.google.com https://www.googleapis.com https://api.open-meteo.com https://geocoding-api.open-meteo.com",
    "frame-src 'self' blob: https://open.spotify.com https://accounts.google.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
  const library = createLibraryApi(join(dataDirectory, "library-data")),
    mangadex = createMangaDexApi(),
    music = createMusicApi(),
    gaming = createGamingApi({
      directory: join(dataDirectory, "gaming-data", "feeds"),
    }),
    installed = createInstalledApi({
      directory: join(dataDirectory, "gaming-data"),
    }),
    dashboard = createDashboardApi(join(dataDirectory, "dashboard-data")),
    news = createNewsApi({
      directory: join(dataDirectory, "dashboard-data"),
    });
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".woff2": "font/woff2",
    ".mjs": "text/javascript",
    ".wasm": "application/wasm",
  };
  const server = createServer(
    (req, res) => {
      if (isLocked() && new URL(req.url || "/", "http://localhost").pathname.startsWith("/api/")) {
        res.writeHead(423, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ error: "security.locked" })); return;
      }
      void mangadex(
        req,
        res,
        () =>
          void music(
        req,
        res,
        () =>
          void dashboard(
            req,
            res,
            () =>
              void library(
                req,
                res,
                () =>
                  void gaming(
                    req,
                    res,
                    () =>
                      void installed(
                        req,
                        res,
                        () =>
                          void news(
                            req,
                            res,
                            () =>
                              void (async () => {
                            try {
                              if (
                                req.method !== "GET" &&
                                req.method !== "HEAD"
                              ) {
                                res.writeHead(405);
                                res.end();
                                return;
                              }
                              const pathname = decodeURIComponent(
                                new URL(req.url || "/", "http://127.0.0.1")
                                  .pathname,
                              );
                              const path = resolve(
                                root,
                                "." +
                                  (pathname === "/" ? "/index.html" : pathname),
                              );
                              if (!path.startsWith(root + sep)) {
                                res.writeHead(403);
                                res.end();
                                return;
                              }
                              const file = await readFile(path);
                              res.writeHead(200, {
                                "Content-Type":
                                  types[extname(path)] ||
                                  "application/octet-stream",
                                "X-Content-Type-Options": "nosniff",
                                "Content-Security-Policy":
                                  contentSecurityPolicy,
                              });
                              res.end(req.method === "HEAD" ? undefined : file);
                            } catch {
                              res.writeHead(404);
                              res.end(
                                tr("local_server.3309255e1f", { v0: APP_NAME }),
                              );
                            }
                          })(),
                      ),
                  ),
              ),
          ),
        ),
      ),
      );
    },
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    server,
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
  };
}
