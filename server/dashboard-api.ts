import { APP_NAME } from "../src/lib/brand.ts";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { join } from "node:path";
import { mergeDashboard } from "../src/lib/dashboard-sync.ts";
import { parseBackup } from "../src/lib/dashboard.ts";
export function createDashboardApi(directory: string) {
  const path = join(directory, "dashboard.json");
  let pending: Promise<unknown> = Promise.resolve();
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    if (req.url?.split("?")[0] !== "/api/dashboard") {
      next();
      return;
    }
    const reply = (code: number, value: unknown) => {
      if (code === 200 && value && typeof value === "object" && "data" in value) {
        const tag = `"${createHash("sha256").update(JSON.stringify(value.data)).digest("hex")}"`;
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
        error: `Solo disponible desde ${APP_NAME} en este equipo.`,
      });
      return;
    }
    try {
      if (req.method === "GET") {
        await pending;
        try {
          const raw = await readFile(path, "utf8");
          const data = parseBackup(raw);
          reply(200, { data: { ...data, version: 2 } });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          reply(200, { data: null });
        }
        return;
      }
      if (!["PUT", "PATCH"].includes(req.method || "")) {
        reply(405, { error: "Método no permitido." });
        return;
      }
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > (req.method === "PATCH" ? 10_000_000 : 5_000_000)) {
          reply(413, { error: "El espacio supera 5 MB." });
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
        reply(400, { error: "El respaldo no contiene un espacio válido." });
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
        if (base) data = parseBackup(JSON.stringify({ ...mergeDashboard(base, data, previous ? parseBackup(previous) : base), version: 2 }));
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
      reply(200, { ok: true, data: { ...data, version: 2 } });
    } catch {
      reply(500, {
        error:
          "No se pudo leer o guardar el espacio en disco. La copia existente se ha conservado.",
      });
    }
  };
}
