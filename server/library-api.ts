import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  stat,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve, join } from "node:path";
import {
  documentFormat,
  MAX_DOCUMENT_BYTES,
  readerDefaults,
  clampPosition,
  normalizeReaderPreferences,
} from "../src/lib/library.ts";
import type { LibraryState, LibraryDocument } from "../src/lib/library.ts";
class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function createLibraryApi(directory = resolve("library-data")) {
  const root = resolve(directory);
  const manifest = join(root, "library.json");
  let pending: Promise<unknown> = Promise.resolve();
  const serialize = <T>(work: () => Promise<T>): Promise<T> => {
    const next = pending.then(work);
    pending = next.catch(() => {});
    return next;
  };
  async function read(): Promise<LibraryState> {
    await mkdir(join(root, "documents"), { recursive: true });
    try {
      const data = JSON.parse(await readFile(manifest, "utf8"));
      if (data.version !== 1 || !Array.isArray(data.documents))
        throw new Error("Invalid library");
      if (
        !data.documents.every(
          (d: LibraryDocument) =>
            /^[a-f\d-]{36}$/.test(d.id) &&
            typeof d.name === "string" &&
            typeof d.title === "string" &&
            (d.format === "manga" || documentFormat(d.name) === d.format) &&
            Number.isFinite(d.size) &&
            typeof d.hash === "string" &&
            typeof d.addedAt === "string" &&
            (d.deletedAt === null || typeof d.deletedAt === "string") &&
            (d.lastReadAt === null || typeof d.lastReadAt === "string") &&
            d.position &&
            ["unit", "anchor", "fraction", "progress"].every(
              (key) =>
                typeof d.position[key as keyof typeof d.position] ===
                  "number" &&
                Number.isFinite(d.position[key as keyof typeof d.position]),
            ) &&
            Array.isArray(d.bookmarks) &&
            d.bookmarks.every(
              (mark) =>
                typeof mark.id === "string" &&
                typeof mark.label === "string" &&
                mark.position &&
                typeof mark.position.unit === "number",
            ),
        )
      )
        throw new Error("Invalid records");
      return {
        ...data,
        preferences: normalizeReaderPreferences(data.preferences),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return {
          version: 1,
          documents: [],
          preferences: { ...readerDefaults },
        };
      throw new ApiError(
        500,
        "No se pudo leer el índice de la biblioteca. Conserva la carpeta library-data para recuperarlo; no se ha sobrescrito.",
      );
    }
  }
  async function save(state: LibraryState) {
    const temporary = `${manifest}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2));
    await rename(temporary, manifest);
  }
  const pathFor = (doc: LibraryDocument) =>
    join(root, "documents", `${doc.id}.${doc.format}`);
  const reply = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(value));
  };
  async function body(req: IncomingMessage, max: number) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > max)
        throw new ApiError(
          413,
          "El archivo supera el límite permitido (150 MB por documento).",
        );
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  async function handler(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void = () => {
      res.writeHead(404);
      res.end();
    },
  ) {
    if (!req.url?.startsWith("/api/library")) {
      next();
      return;
    }
    try {
      // Personal local server: reject remote clients, foreign origins and DNS rebinding.
      const host = req.headers.host || "";
      const hostname = new URL(`http://${host}`).hostname;
      if (
        !["localhost", "127.0.0.1", "[::1]"].includes(hostname) ||
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          req.socket.remoteAddress || "",
        )
      )
        throw new ApiError(
          403,
          "La biblioteca está disponible solo desde este equipo.",
        );
      if (req.headers.origin && new URL(req.headers.origin).host !== host)
        throw new ApiError(403, "Origen no autorizado.");
      if (req.headers["sec-fetch-site"] === "cross-site")
        throw new ApiError(403, "Origen no autorizado.");
      if (
        !["GET", "HEAD"].includes(req.method || "") &&
        req.headers["x-mia-library"] !== "1"
      )
        throw new ApiError(403, "Solicitud de biblioteca no autorizada.");
      const url = new URL(req.url, `http://${host}`);
      const parts = url.pathname.split("/").filter(Boolean);
      const id = parts[2];
      const action = parts[3];
      if (id && id !== "preferences" && id !== "manga" && !/^[a-f\d-]{36}$/.test(id))
        throw new ApiError(400, "Documento no válido.");
      if (req.method === "GET" && !id) {
        const state = await read();
        reply(res, 200, { ...state, storagePath: root });
        return;
      }
      if (req.method === "POST" && id === "manga") {
        const input = JSON.parse((await body(req, 100000)).toString());
        if (
          !input.mangadexId ||
          typeof input.mangadexId !== "string" ||
          !input.title ||
          typeof input.title !== "string"
        )
          throw new ApiError(400, "Datos de manga inválidos.");
        const result = await serialize(async () => {
          const state = await read();
          const existing = state.documents.find(
            (d) =>
              d.format === "manga" &&
              (d.hash === `mangadex:${input.mangadexId}:${input.language || "es"}` ||
                d.manga?.mangadexId === input.mangadexId),
          );
          if (existing) {
            if (existing.deletedAt) {
              existing.deletedAt = null;
              await save(state);
            }
            return { document: existing, duplicate: true };
          }
          const docId = randomUUID();
          const safeTitle =
            input.title
              .replace(/[^\w\s\u00C0-\u024F\u1E00-\u1EFF-]/gi, "")
              .trim()
              .slice(0, 100) || "manga";
          const mangaData = {
            mangadexId: input.mangadexId,
            coverUrl: input.coverUrl || "",
            language: input.language || "es-all",
            description: input.description || "",
            author: input.author || "",
            status: input.status || "",
            currentChapterId: input.currentChapterId || "",
            currentChapterNumber: input.currentChapterNumber || "",
            currentChapterTitle: input.currentChapterTitle || "",
            chapterIndex: 0,
            pageIndex: 0,
            totalPages: 0,
          };
          const document: LibraryDocument = {
            id: docId,
            name: `${safeTitle}.manga`,
            title: input.title.trim().slice(0, 200),
            format: "manga",
            size: Buffer.byteLength(JSON.stringify(mangaData)),
            hash: `mangadex:${input.mangadexId}:${input.language || "es"}`,
            addedAt: new Date().toISOString(),
            lastReadAt: null,
            deletedAt: null,
            favorite: false,
            totalUnits: Number.isInteger(input.totalChapters)
              ? input.totalChapters
              : 0,
            position: clampPosition(null),
            bookmarks: [],
            manga: mangaData,
          };
          await writeFile(pathFor(document), JSON.stringify(mangaData, null, 2), {
            flag: "wx",
          });
          try {
            state.documents.push(document);
            await save(state);
          } catch (error) {
            await unlink(pathFor(document)).catch(() => {});
            throw error;
          }
          return { document, duplicate: false };
        });
        reply(res, 201, result);
        return;
      }
      if (req.method === "POST" && !id) {
        const name = (url.searchParams.get("name") || "").normalize("NFC");
        const format = documentFormat(name);
        if (
          !format ||
          !name ||
          name.length > 250 ||
          /[/\\]/.test(name) ||
          Array.from(name).some((char) => char.charCodeAt(0) < 32)
        )
          throw new ApiError(
            415,
            "Formato no compatible. Usa PDF, DOCX, EPUB, CBZ, TXT, MD o imágenes JPG, PNG y WebP.",
          );
        const buffer = await body(req, MAX_DOCUMENT_BYTES);
        if (!buffer.length) throw new ApiError(400, "El archivo está vacío.");
        if (
          format === "pdf" &&
          !buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))
        )
          throw new ApiError(415, "El archivo no contiene un PDF válido.");
        if (
          ["epub", "docx", "cbz"].includes(format) &&
          buffer.subarray(0, 2).toString() !== "PK"
        )
          throw new ApiError(
            415,
            "El archivo no es un contenedor válido o está protegido.",
          );
        const hash = createHash("sha256").update(buffer).digest("hex");
        const result = await serialize(async () => {
          const state = await read();
          const existing = state.documents.find((d) => d.hash === hash);
          if (existing) {
            if (existing.deletedAt) {
              existing.deletedAt = null;
              await save(state);
            }
            return { document: existing, duplicate: true };
          }
          const document: LibraryDocument = {
            id: randomUUID(),
            name,
            title: name.replace(/\.[^.]+$/, ""),
            format,
            size: buffer.length,
            hash,
            addedAt: new Date().toISOString(),
            lastReadAt: null,
            deletedAt: null,
            favorite: false,
            totalUnits: 0,
            position: clampPosition(null),
            bookmarks: [],
          };
          await writeFile(pathFor(document), buffer, { flag: "wx" });
          try {
            state.documents.push(document);
            await save(state);
          } catch (error) {
            await unlink(pathFor(document)).catch(() => {});
            throw error;
          }
          return { document, duplicate: false };
        });
        reply(res, 201, result);
        return;
      }
      if (req.method === "PATCH" && id === "preferences") {
        const input = JSON.parse((await body(req, 10000)).toString());
        const preferences = await serialize(async () => {
          const state = await read();
          state.preferences = normalizeReaderPreferences({
            ...state.preferences,
            ...input,
          });
          await save(state);
          return state.preferences;
        });
        reply(res, 200, preferences);
        return;
      }
      if (
        id &&
        (req.method === "GET" || req.method === "HEAD") &&
        action === "file"
      ) {
        const state = await read();
        const doc = state.documents.find((d) => d.id === id);
        if (!doc) throw new ApiError(404, "Documento no encontrado.");
        const file = pathFor(doc);
        const info = await stat(file).catch(() => {
          throw new ApiError(
            404,
            "No encontramos el archivo en la carpeta de biblioteca. Restaura una copia de la carpeta o vuelve a importarlo.",
          );
        });
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Length": info.size,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
        });
        if (req.method === "HEAD") res.end();
        else {
          const stream = createReadStream(file);
          stream.on("error", () => res.destroy());
          stream.pipe(res);
        }
        return;
      }
      if (req.method === "PATCH" && id) {
        const input = JSON.parse((await body(req, 200000)).toString());
        const doc = await serialize(async () => {
          const state = await read();
          const item = state.documents.find((d) => d.id === id);
          if (!item) throw new ApiError(404, "Documento no encontrado.");
          if (typeof input.title === "string" && input.title.trim())
            item.title = input.title.trim().slice(0, 200);
          if (typeof input.favorite === "boolean")
            item.favorite = input.favorite;
          if (input.restore === true) item.deletedAt = null;
          if (input.position && typeof input.position === "object") {
            item.position = clampPosition(input.position);
            item.lastReadAt = new Date().toISOString();
          }
          if (
            Number.isInteger(input.totalUnits) &&
            input.totalUnits > 0 &&
            input.totalUnits <= 100000
          ) {
            item.totalUnits = input.totalUnits;
            item.lastReadAt = new Date().toISOString();
          }
          if (
            input.bookmark &&
            typeof input.bookmark.label === "string" &&
            item.bookmarks.length < 500
          )
            item.bookmarks.push({
              id: randomUUID(),
              label: input.bookmark.label.trim().slice(0, 150) || "Mi marcador",
              position: clampPosition(input.bookmark.position),
              createdAt: new Date().toISOString(),
            });
          if (typeof input.removeBookmark === "string")
            item.bookmarks = item.bookmarks.filter(
              (b) => b.id !== input.removeBookmark,
            );
          if (input.manga && typeof input.manga === "object") {
            item.manga = {
              ...(item.manga || {
                mangadexId: "",
                language: "es-all",
              }),
              ...input.manga,
            };
            item.lastReadAt = new Date().toISOString();
            await writeFile(
              pathFor(item),
              JSON.stringify(item.manga, null, 2),
            ).catch(() => {});
          }
          await save(state);
          return item;
        });
        reply(res, 200, doc);
        return;
      }
      if (req.method === "DELETE" && id) {
        await serialize(async () => {
          const state = await read();
          const doc = state.documents.find((d) => d.id === id);
          if (!doc) throw new ApiError(404, "Documento no encontrado.");
          if (url.searchParams.get("permanent") === "1") {
            if (!doc.deletedAt)
              throw new ApiError(
                409,
                "Mueve el documento a la papelera primero.",
              );
            await unlink(pathFor(doc)).catch((error) => {
              if (error.code !== "ENOENT") throw error;
            });
            state.documents = state.documents.filter((d) => d.id !== id);
          } else doc.deletedAt = new Date().toISOString();
          await save(state);
        });
        reply(res, 200, { ok: true });
        return;
      }
      throw new ApiError(404, "Ruta no encontrada.");
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      reply(
        res,
        error instanceof ApiError
          ? error.status
          : error instanceof SyntaxError
            ? 400
            : 500,
        {
          error:
            error instanceof ApiError
              ? error.message
              : error instanceof SyntaxError
                ? "Solicitud JSON inválida."
                : "No se pudo guardar el cambio en la carpeta de biblioteca. Comprueba el espacio disponible y los permisos.",
        },
      );
    }
  }
  return handler;
}
