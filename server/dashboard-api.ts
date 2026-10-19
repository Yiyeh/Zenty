import { tr } from "../src/lib/i18n.ts";
import { APP_NAME } from "../src/lib/brand.ts";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, readFile, writeFile, rename, readdir, unlink, stat } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { join } from "node:path";
import { mergeDashboardWithConflicts } from "../src/lib/dashboard-sync.ts";
import type { SyncConflict } from "../src/lib/sync.ts";
import { parseBackup } from "../src/lib/dashboard.ts";
export function createDashboardApi(directory: string) {
  const path = join(directory, "dashboard.json");
  let pending: Promise<unknown> = Promise.resolve();
  const conflictDirectory = join(directory, "conflicts"), conflictState = join(conflictDirectory, "state.json");
  const atomic = async (filename: string, value: unknown) => { await mkdir(conflictDirectory, { recursive: true }); const temporary = filename + "." + randomUUID() + ".tmp"; await writeFile(temporary, JSON.stringify(value)); await rename(temporary, filename); };
  const readConflict = async (): Promise<SyncConflict | null> => {
    try {
      const value = JSON.parse(await readFile(conflictState, "utf8"));
      return value && /^[a-f0-9-]{36}$/.test(value.id) && Number.isFinite(Date.parse(value.at)) && Array.isArray(value.fields) && value.fields.every((field: unknown) => typeof field === "string") ? value : null;
    } catch { return null; }
  };
  const preserveConflict = async (previous: string, fields: string[]): Promise<SyncConflict> => {
    const conflict = { id: randomUUID(), at: new Date().toISOString(), fields };
    await atomic(join(conflictDirectory, `${conflict.id}.json`), { ...parseBackup(previous), version: 2 });
    await atomic(conflictState, conflict);
    const files = await Promise.all((await readdir(conflictDirectory)).filter(file => /^[a-f0-9-]{36}\.json$/.test(file)).map(async file => ({ file, time: (await stat(join(conflictDirectory, file))).mtimeMs })));
    for (const file of files.filter(file => file.file !== `${conflict.id}.json`).sort((a, b) => b.time - a.time).slice(9)) await unlink(join(conflictDirectory, file.file));
    return conflict;
  };
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const pathname = req.url?.split("?")[0] || "";
    const conflictPath = /^\/api\/dashboard\/conflicts\/([a-f0-9-]{36})(\/ack)?$/.exec(pathname);
    if (pathname !== "/api/dashboard" && !conflictPath) {
      next();
      return;
    }
    const reply = (code: number, value: unknown) => {
      if (code === 200 && value && typeof value === "object" && "data" in value) {
        const tag = `"${createHash("sha256").update(JSON.stringify({ data: value.data, conflict: "conflict" in value ? value.conflict : null })).digest("hex")}"`;
        res.setHeader("ETag", tag);
        if (req.method === "GET" && req.headers["if-none-match"] === tag) {
          res.writeHead(304, { "Cache-Control": "no-store" }); res.end(); return;
        }
      }
      res.writeHead(code, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    const host = req.headers.host || "",
      origin = req.headers.origin;
    if (
      !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) ||
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        req.socket.remoteAddress || "",
      ) ||
      req.headers["sec-fetch-site"] === "cross-site" ||
      (origin && ![`http://${host}`, `https://${host}`].includes(origin)) ||
      req.headers["x-mia-dashboard"] !== "1"
    ) {
      reply(403, {
        error: tr("dashboard_api.b0d2ede4ec", { v0: APP_NAME }),
      });
      return;
    }
    try {
      if (conflictPath) {
        await pending;
        if (req.method === "GET" && !conflictPath[2]) {
          try { const data = parseBackup(await readFile(join(conflictDirectory, `${conflictPath[1]}.json`), "utf8")); reply(200, { data: { ...data, version: 2 } }); }
          catch { reply(404, { error: tr("sync.copyMissing") }); }
        } else if (req.method === "POST" && conflictPath[2]) {
          const work = pending.then(async () => { const conflict = await readConflict(); if (conflict?.id === conflictPath[1]) await atomic(conflictState, null); });
          pending = work.catch(() => {}); await work; reply(200, { ok: true });
        } else reply(405, { error: tr("dashboard_api.1bd43567cd") });
        return;
      }
      if (req.method === "GET") {
        await pending;
        try {
          const raw = await readFile(path, "utf8");
          const data = parseBackup(raw);
          reply(200, { data: { ...data, version: 2 }, conflict: await readConflict() });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          reply(200, { data: null, conflict: await readConflict() });
        }
        return;
      }
      if (!["PUT", "PATCH"].includes(req.method || "")) {
        reply(405, { error: tr("dashboard_api.1bd43567cd") });
        return;
      }
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > (req.method === "PATCH" ? 10_000_000 : 5_000_000)) {
          reply(413, { error: tr("dashboard_api.6da004d1b7") });
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      let data: ReturnType<typeof parseBackup>;
      let base: ReturnType<typeof parseBackup> | undefined;
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (req.method === "PATCH") {
          const input = JSON.parse(raw);
          base = parseBackup(JSON.stringify({ ...input.base, version: 2 }));
          data = parseBackup(JSON.stringify({ ...input.data, version: 2 }));
        } else data = parseBackup(raw);
      } catch {
        reply(400, { error: tr("dashboard_api.e654bc6234") });
        return;
      }
      const work = pending.then(async () => {
        let previous = "";
        try {
          previous = await readFile(path, "utf8");
          parseBackup(previous);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        if (base) {
          const merged = mergeDashboardWithConflicts(base, data, previous ? parseBackup(previous) : base);
          if (merged.conflicts.length && previous) await preserveConflict(previous, merged.conflicts);
          data = parseBackup(JSON.stringify({ ...merged.data, version: 2 }));
        }
        const content = JSON.stringify({ ...data, version: 2 });
        if (content === previous) return;
        await mkdir(directory, { recursive: true });
        if (previous) {
          const old = join(directory, `previous.${randomUUID()}.tmp`);
          await writeFile(old, previous);
          await rename(old, join(directory, "previous.json"));
        }
        const temp = `${path}.${randomUUID()}.tmp`;
        await writeFile(temp, content);
        await rename(temp, path);
      });
      pending = work.catch(() => {});
      await work;
      reply(200, { ok: true, data: { ...data, version: 2 }, conflict: await readConflict() });
    } catch {
      reply(500, {
        error:
          tr("dashboard_api.ee11916ca2"),
      });
    }
  };
}
