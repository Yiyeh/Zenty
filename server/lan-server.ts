import { tr, getLocale } from "../src/lib/i18n.ts";
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
import { createServer, request } from "node:http";
import type { Server } from "node:http";
import { networkInterfaces } from "node:os";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { APP_NAME } from "../src/lib/brand.ts";

export interface LanStatus { enabled: boolean; urls: string[]; connections: { name: string; url: string }[]; pairedDevices: number; code: string; port: number }
function lanConnections() {
  return Object.entries(networkInterfaces()).flatMap(([name, items]) => (items || [])
    .filter((item) => !item.internal && item.family === "IPv4" && privateAddress(item.address))
    .map((item) => ({ name, address: item.address })))
    .sort((a, b) => Number(/virtual|vethernet|vpn|docker|wsl/i.test(a.name)) - Number(/virtual|vethernet|vpn|docker|wsl/i.test(b.name)));
}
export function lanAddresses() { return [...new Set(lanConnections().map((item) => item.address))]; }
function privateAddress(ip: string) {
  ip = ip.replace(/^::ffff:/, "");
  return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
}
const loginPage = (failed = false) => `<!doctype html><html lang="${getLocale()}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="same-origin"><title>${APP_NAME} · ${escapeHtml(tr("lan.connect"))}</title><style>html{color-scheme:dark;font:16px system-ui;background:#17191f;color:#eee}body{margin:0;min-height:100dvh;display:grid;place-items:center}main{box-sizing:border-box;width:min(92vw,420px);padding:32px;border:1px solid #444252;border-radius:24px;background:#24232c}h1{margin-top:0}p{color:#bbb9c9;line-height:1.6}input,button{box-sizing:border-box;width:100%;font:inherit;padding:14px;border-radius:10px;border:1px solid #716285}input{background:#17191f;color:#fff;letter-spacing:.25em;margin:12px 0 18px}button{background:#8260ac;color:white;font-weight:600;cursor:pointer}label{font-size:14px}.remember{display:flex;gap:10px;align-items:center;margin-bottom:20px;line-height:1.5}input[type=checkbox]{width:18px;height:18px;margin:0;flex-shrink:0;accent-color:#8260ac}.error{color:#ffb7a6}</style><main><h1>${APP_NAME}</h1><p>${escapeHtml(tr("lan.welcome"))}<br>${escapeHtml(tr("lan.instructions"))}</p>${failed ? `<p class="error" role="alert">${escapeHtml(tr("lan.incorrect"))}</p>` : ''}<form method="post" action="/connect"><label for="code">${escapeHtml(tr("lan.code"))}</label><input id="code" name="code" inputmode="numeric" pattern="[0-9]{9}" maxlength="9" autocomplete="one-time-code" required autofocus><label class="remember"><input type="checkbox" name="remember" value="1" checked>${escapeHtml(tr("lan.remember"))}</label><button>${escapeHtml(tr("lan.enter"))}</button></form><p><small>${escapeHtml(tr("lan.keepOpen"))}</small></p></main></html>`;

/** Authenticated gateway to the existing loopback library, never a second data store. */
export function createLanSharing(targetOrigin: string, preferredPort = 17732, pairingDirectory?: string, integrationRequest?: (action: string, input: unknown) => Promise<unknown>) {
  const target = new URL(targetOrigin);
  if (target.hostname !== "127.0.0.1" || target.protocol !== "http:") throw new Error("Servidor local inválido.");
  let server: Server | undefined;
  let code = "", port = 0;
  let transition: Promise<unknown> = Promise.resolve();
  const sessions = new Map<string, number>();
  let paired = new Map<string, number>();
  let pendingSave: Promise<unknown> = Promise.resolve();
  const digest = (token: string) => createHash("sha256").update(token).digest("hex");
  const prune = () => { for (const [key, until] of paired) if (until <= Date.now()) paired.delete(key); };
  const savePairs = () => {
    const snapshot = JSON.stringify({ version: 1, devices: [...paired].map(([hash, expiresAt]) => ({ hash, expiresAt })) });
    const work = pendingSave.catch(() => {}).then(async () => {
      if (!pairingDirectory) return;
      await mkdir(pairingDirectory, { recursive: true });
      const temporary = join(pairingDirectory, `paired-${randomBytes(8).toString("hex")}.tmp`);
      await writeFile(temporary, snapshot, { mode: 0o600 });
      await rename(temporary, join(pairingDirectory, "paired-devices.json"));
    });
    pendingSave = work; return work;
  };
  const loadPairs = async () => {
    if (!pairingDirectory) { prune(); return; }
    try {
      const raw = await readFile(join(pairingDirectory, "paired-devices.json"), "utf8");
      if (raw.length > 100_000) throw new Error("Archivo demasiado grande.");
      const value = JSON.parse(raw);
      if (value.version !== 1 || !Array.isArray(value.devices) || value.devices.length > 128) throw new Error("Formato inválido.");
      paired = new Map(value.devices.filter((entry: { hash: unknown; expiresAt: unknown }) => typeof entry.hash === "string" && /^[a-f0-9]{64}$/.test(entry.hash) && typeof entry.expiresAt === "number" && Number.isFinite(entry.expiresAt)).map((entry: { hash: string; expiresAt: number }) => [entry.hash, entry.expiresAt]));
      prune();
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("No se pudieron leer los dispositivos autorizados. Usa «Olvidar dispositivos» para restablecer el acceso."); }
  };
  const attempts = new Map<string, { count: number; until: number }>();
  const status = (): LanStatus => ({ enabled: !!server?.listening, code, port, pairedDevices: [...paired.values()].filter((until) => until > Date.now()).length, connections: server?.listening ? lanConnections().map((item) => ({ name: item.name, url: `http://${item.address}:${port}` })) : [], urls: server?.listening ? lanAddresses().map((ip) => `http://${ip}:${port}`) : [] });
  const stop = async () => {
    const previous = server; server = undefined; sessions.clear(); attempts.clear(); code = ""; port = 0;
    await pendingSave.catch(() => {});
    if (previous) { previous.closeAllConnections(); await new Promise<void>((resolve) => previous.close(() => resolve())); }
  };
  async function start() {
    if (server?.listening) return;
    await loadPairs();
    code = String(randomInt(100_000_000, 1_000_000_000));
    const candidate = createServer((req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "same-origin");
      res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
      const fail = (httpStatus: number, message: string) => { res.writeHead(httpStatus, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: message })); };
      const host = req.headers.host || "";
      const allowedHosts = ["127.0.0.1", ...lanAddresses()].map((ip) => `${ip}:${port}`);
      if (!privateAddress(req.socket.remoteAddress || "") || !allowedHosts.includes(host)) { fail(403, "Acceso local no autorizado."); return; }
      if ((req.headers.origin && req.headers.origin !== `http://${host}`) || req.headers["sec-fetch-site"] === "cross-site") { fail(403, "Origen no autorizado."); return; }
      let url: URL;
      try { url = new URL(req.url || "/", `http://${host}`); } catch { fail(400, "URL inválida."); return; }
      const page = (failed = false) => { res.writeHead(failed ? 401 : 200, { "Content-Type": "text/html; charset=utf-8" }); res.end(loginPage(failed)); };
      if (url.pathname === "/connect" && req.method === "POST") {
        const ip = req.socket.remoteAddress || "";
        const now = Date.now();
        for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
        const attempt = attempts.get(ip) || { count: 0, until: now + 60_000 };
        if (attempts.size >= 256 || attempt.count >= 5) { page(true); return; }
        attempt.count++; attempts.set(ip, attempt);
        let raw = "";
        req.on("data", (chunk: Buffer) => { raw += chunk.toString(); if (raw.length > 1024) req.destroy(); });
        req.on("end", () => { void (async () => {
          const input = new URLSearchParams(raw);
          const entered = input.get("code") || "";
          if (!server || !/^[0-9]{9}$/.test(entered) || entered.length !== code.length || !timingSafeEqual(Buffer.from(entered), Buffer.from(code))) { page(true); return; }
          for (const [key, until] of sessions) if (until < Date.now()) sessions.delete(key);
          prune();
          if (sessions.size >= 128 || paired.size >= 128) { fail(429, "Hay demasiados dispositivos conectados."); return; }
          const token = randomBytes(32).toString("hex");
          const remember = input.get("remember") === "1";
          const maxAge = remember ? 90 * 24 * 60 * 60 : 12 * 60 * 60;
          if (remember) { paired.set(digest(token), Date.now() + maxAge * 1000); await savePairs(); }
          else sessions.set(token, Date.now() + maxAge * 1000);
          res.writeHead(303, { Location: "/", "Set-Cookie": `zenty_lan=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}` }); res.end();
        })().catch(() => fail(500, "No se pudo recordar el dispositivo. Vuelve a intentarlo.")); });
        return;
      }
      const token = /(?:^|;\s*)zenty_lan=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || "")?.[1] || "";
      if (Math.max(sessions.get(token) || 0, paired.get(digest(token)) || 0) <= Date.now()) {
        if (req.method === "GET" && ["/", "/connect"].includes(url.pathname)) page();
        else fail(401, "La sesión terminó. Recarga la página e introduce el código del PC.");
        return;
      }
      if (url.pathname === "/disconnect" && req.method === "POST") {
        sessions.delete(token); paired.delete(digest(token));
        void savePairs().then(() => { res.writeHead(303, { Location: "/", "Set-Cookie": "zenty_lan=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" }); res.end(); }).catch(() => fail(500, "No se pudo guardar la desconexión. Vuelve a intentarlo.")); return;
      }
      if (url.pathname === "/api/remote/integrations") {
        if (!integrationRequest) { fail(503, "Las conexiones necesitan Zenty de escritorio abierto."); return; }
        if (req.headers["x-zenty-remote"] !== "1") { fail(403, "Solicitud no autorizada."); return; }
        void (async () => {
          let action = "snapshot", input: unknown = null;
          if (req.method === "POST") {
            let size = 0; const chunks: Buffer[] = [];
            for await (const chunk of req) { size += chunk.length; if (size > 10000) { fail(413, "Solicitud demasiado grande."); return; } chunks.push(Buffer.from(chunk)); }
            const body = JSON.parse(Buffer.concat(chunks).toString());
            if (!["refresh", "command", "volume"].includes(body.action)) { fail(400, "Acción inválida."); return; }
            action = body.action; input = body.input;
          } else if (req.method !== "GET") { fail(405, "Método no permitido."); return; }
          const result = await integrationRequest(action, input);
          res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(result));
        })().catch(() => fail(502, "El PC no pudo completar la acción. Comprueba tus conexiones en Zenty."));
        return;
      }
      const read = req.method === "GET" || req.method === "HEAD";
      const library = /^\/api\/library(?:\/|$)/.test(url.pathname);
      const manga = read && /^\/api\/mangadex\//.test(url.pathname);
      const dashboard = url.pathname === "/api/dashboard" && ["GET", "PATCH"].includes(req.method || "");
      const feeds = read && (/^\/api\/gaming\//.test(url.pathname) || ["/api/news", "/api/news/sources", "/api/news/image", "/api/game-assets/image", "/api/music/spotify"].includes(url.pathname));
      const installed = (req.method === "PATCH" && ["/api/installed/manual", "/api/installed/emulators", "/api/installed/artwork"].includes(url.pathname)) || (read && url.pathname === "/api/installed/scan") || (req.method === "POST" && ["/api/installed/scan", "/api/installed/metadata", "/api/installed/launch"].includes(url.pathname));
      const profile = req.method === "GET" && url.pathname === "/api/share-profile";
      const asset = read && (url.pathname === "/" || /^\/(assets|pdfjs)\//.test(url.pathname) || /^\/(favicon\.svg|zenty-icon\.png)$/.test(url.pathname));
      if (!(library || manga || profile || asset || dashboard || feeds || installed)) { fail(403, "Esta función está disponible en el PC anfitrión."); return; }
      if (library && !read && req.headers["x-mia-library"] !== "1") { fail(403, "Solicitud no autorizada."); return; }
      if (dashboard && req.headers["x-mia-dashboard"] !== "1") { fail(403, "Solicitud no autorizada."); return; }
      const headers: Record<string, string> = { host: target.host, "sec-fetch-site": "same-origin" };
      for (const key of ["content-type", "content-length", "range", "if-range", "if-none-match", "x-mia-library", "x-mia-dashboard", "x-mia-games"]) if (typeof req.headers[key] === "string") headers[key] = req.headers[key];
      if (profile) headers["x-mia-dashboard"] = "1";
      const upstream = request({ hostname: target.hostname, port: target.port, path: profile ? "/api/dashboard" : url.pathname + url.search, method: req.method, headers }, (response) => {
        const transform = profile || url.pathname === "/" || (library && /^\/api\/library\/?$/.test(url.pathname) && req.method === "GET");
        if (transform) {
          const chunks: Buffer[] = []; let size = 0;
          response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 25_000_000) response.destroy(); else chunks.push(chunk); });
          response.on("end", () => {
            try {
              let content = Buffer.concat(chunks).toString("utf8");
              if (profile) {
                const settings = JSON.parse(content).data?.settings || {};
                content = JSON.stringify({ settings: Object.fromEntries(["userName", "theme", "accentColor", "surfaceTone", "background", "density"].filter((key) => settings[key] !== undefined).map((key) => [key, settings[key]])) });
              } else if (library) { const state = JSON.parse(content); delete state.storagePath; content = JSON.stringify(state); }
              else content = content.replace('<head>', '<head><meta name="zenty-remote" content="app">');
              const outputHeaders = { ...response.headers }; delete outputHeaders["content-length"]; delete outputHeaders["transfer-encoding"];
              res.writeHead(response.statusCode || 502, outputHeaders); res.end(content);
            } catch { fail(502, "No se pudo leer la biblioteca del PC."); }
          });
          response.on("error", () => { if (!res.headersSent) fail(502, "El PC interrumpió la conexión."); else res.destroy(); });
        } else { response.on("error", () => res.destroy()); res.writeHead(response.statusCode || 502, response.headers); response.pipe(res); }
      });
      upstream.setTimeout(60_000, () => upstream.destroy());
      upstream.on("error", () => { if (!res.headersSent) fail(502, "No se pudo contactar con Zenty en el PC."); else res.destroy(); });
      res.on("close", () => upstream.destroy());
      req.pipe(upstream);
    });
    candidate.requestTimeout = 120_000;
    try {
      await new Promise<void>((resolve, reject) => { candidate.once("error", reject); candidate.listen(preferredPort, "0.0.0.0", resolve); });
      server = candidate; port = (candidate.address() as { port: number }).port;
    } catch { code = ""; throw new Error(`No se pudo abrir el servidor web. Comprueba que el puerto ${preferredPort} esté libre.`); }
  }
  return {
    status,
    forget() {
      const work = transition.catch(() => {}).then(async () => { paired.clear(); sessions.clear(); await savePairs(); return status(); });
      transition = work; return work;
    },
    set(enabled: boolean) {
      const work = transition.catch(() => {}).then(async () => { if (enabled) await start(); else await stop(); return status(); });
      transition = work; return work;
    },
    stop: () => { const work = transition.catch(() => {}).then(stop); transition = work; return work; },
  };
}
