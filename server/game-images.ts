import { tr } from "../src/lib/i18n.ts";
import { APP_NAME } from "../src/lib/brand.ts";
import type { IncomingMessage, ServerResponse } from "node:http";
import { request } from "node:https";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const denied = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  denied.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
] as const)
  denied.addSubnet(address, prefix, "ipv6");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
export function publicImageAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4
    ? !denied.check(address, "ipv4")
    : family === 6 &&
        globalV6.check(address, "ipv6") &&
        !denied.check(address, "ipv6");
}
export function imageUrl(value: string): URL {
  const url = new URL(value);
  if (
    value.length > 8192 ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error(tr("game_images.f995ba9ebc"));
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    (!host.includes(".") && !isIP(host)) ||
    /(?:^|\.)(localhost|local|internal|home|lan|test|invalid)$/.test(host) ||
    (isIP(host) && !publicImageAddress(host))
  )
    throw new Error(tr("game_images.7840c772c7"));
  url.hash = "";
  return url;
}
export function imageMime(bytes: Buffer): string {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii")))
    return "image/gif";
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  if (
    bytes.subarray(4, 8).toString("ascii") === "ftyp" &&
    /avif|avis/.test(bytes.subarray(8, 40).toString("ascii"))
  )
    return "image/avif";
  throw new Error(tr("game_images.5704d82880"));
}
/** Resolve once and connect to that verified address, including on every redirect. */
export async function downloadGameImage(
  input: string,
  redirects = 0,
): Promise<Buffer> {
  if (redirects > 3) throw new Error(tr("game_images.0160164d60"));
  const url = imageUrl(input),
    host = url.hostname.replace(/^\[|\]$/g, "");
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await Promise.race([
        lookup(host, { all: true, verbatim: true }),
        new Promise<never>((_, reject) => {
          dnsTimer = setTimeout(
            () => reject(new Error(tr("game_images.c41902270c"))),
            8000,
          );
        }),
      ]).finally(() => clearTimeout(dnsTimer));
  if (
    !addresses.length ||
    addresses.some((a) => !publicImageAddress(a.address))
  )
    throw new Error(tr("game_images.a23c1da3e8"));
  return new Promise<Buffer>((resolve, reject) => {
    const connection = request(
      {
        hostname: addresses[0].address,
        family: addresses[0].family,
        servername: isIP(host) ? undefined : host,
        port: 443,
        path: url.pathname + url.search,
        method: "GET",
        agent: false,
        headers: {
          Host: url.host,
          "User-Agent": `${APP_NAME}-PersonalDashboard/1.0`,
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
        },
        signal: AbortSignal.timeout(15_000),
      },
      (response) => {
        if (
          [301, 302, 303, 307, 308].includes(response.statusCode || 0) &&
          response.headers.location
        ) {
          const location = response.headers.location;
          response.destroy();
          void downloadGameImage(
            new URL(location, url).href,
            redirects + 1,
          ).then(resolve, reject);
          return;
        }
        if (
          response.statusCode !== 200 ||
          Number(response.headers["content-length"] || 0) > MAX_IMAGE_BYTES
        ) {
          response.destroy();
          reject(new Error(tr("game_images.7f5a69efb8")));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_IMAGE_BYTES) {
            response.destroy(new Error(tr("game_images.43fdc69e6e")));
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        response.on("error", reject);
        response.on("end", () => {
          const bytes = Buffer.concat(chunks);
          try {
            imageMime(bytes);
            resolve(bytes);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    connection.on("error", reject);
    connection.end();
  });
}
interface ImageRecord {
  version: 1;
  url: string;
  mime?: string;
  bytes?: number;
  checksum?: string;
  savedAt?: string;
  retryAfter?: number;
}
export function createGameImages({
  directory,
  downloader = downloadGameImage,
  now = Date.now,
  route = "/api/game-assets/image",
}: {
  directory: string;
  downloader?: (url: string) => Promise<Buffer>;
  now?: () => number;
  route?: string;
}) {
  const flights = new Map<
    string,
    Promise<{ bytes: Buffer; mime: string; key: string }>
  >();
  let active = 0;
  const waiting: (() => void)[] = [];
  async function slot<T>(work: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      if (active < 3) {
        active++;
        resolve();
      } else waiting.push(resolve);
    });
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  }
  async function atomic(path: string, value: Buffer | string) {
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, value);
    await rename(temp, path);
  }
  async function get(value: string) {
    const url = imageUrl(value).href,
      key = createHash("sha256").update(url).digest("hex");
    if (flights.has(key)) return flights.get(key)!;
    const work = (async () => {
      const indexPath = join(directory, `${key}.json`),
        imagePath = join(directory, `${key}.image`);
      let previous: ImageRecord | undefined;
      try {
        previous = JSON.parse(await readFile(indexPath, "utf8"));
      } catch {
        /* A missing/corrupt disposable cache can be downloaded again. */
      }
      if (
        previous?.version === 1 &&
        previous.url === url &&
        previous.mime &&
        previous.checksum
      ) {
        try {
          const bytes = await readFile(imagePath);
          const mime = imageMime(bytes);
          if (
            bytes.length <= MAX_IMAGE_BYTES &&
            bytes.length === previous.bytes &&
            mime === previous.mime &&
            createHash("sha256").update(bytes).digest("hex") ===
              previous.checksum
          )
            return { bytes, mime, key };
        } catch {
          /* Repair an interrupted or manually removed image. */
        }
      }
      if (previous?.retryAfter && previous.retryAfter > now())
        throw new Error(tr("game_images.d33aa3f9ce"));
      return slot(async () => {
        try {
          const bytes = await downloader(url);
          if (bytes.length > MAX_IMAGE_BYTES)
            throw new Error(tr("game_images.43fdc69e6e"));
          const mime = imageMime(bytes);
          await mkdir(directory, { recursive: true });
          await atomic(imagePath, bytes);
          await atomic(
            indexPath,
            JSON.stringify({
              version: 1,
              url,
              mime,
              bytes: bytes.length,
              checksum: createHash("sha256").update(bytes).digest("hex"),
              savedAt: new Date(now()).toISOString(),
            } satisfies ImageRecord),
          );
          return { bytes, mime, key };
        } catch (error) {
          await mkdir(directory, { recursive: true });
          await atomic(
            indexPath,
            JSON.stringify({
              version: 1,
              url,
              retryAfter: now() + 300_000,
            } satisfies ImageRecord),
          ).catch(() => {});
          throw error;
        }
      });
    })().finally(() => flights.delete(key));
    flights.set(key, work);
    return work;
  }
  const middleware = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
    if (requestUrl.pathname !== route) {
      next();
      return;
    }
    const host = req.headers.host || "",
      origin = req.headers.origin;
    if (
      !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) ||
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        req.socket.remoteAddress || "",
      ) ||
      req.headers["sec-fetch-site"] === "cross-site" ||
      (origin && ![`http://${host}`, `https://${host}`].includes(origin))
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }
    try {
      const image = await get(requestUrl.searchParams.get("url") || "");
      const headers = {
        "Content-Type": image.mime,
        "Content-Length": image.bytes.length,
        "Cache-Control": "private, max-age=31536000, immutable",
        ETag: `"${image.key}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      };
      if (req.headers["if-none-match"] === headers.ETag) {
        const { "Content-Length": _, ...notModified } = headers;
        res.writeHead(304, notModified);
        res.end();
        return;
      }
      res.writeHead(200, headers);
      res.end(req.method === "HEAD" ? undefined : image.bytes);
    } catch {
      res.writeHead(502, { "Cache-Control": "no-store", "Retry-After": "300" });
      res.end();
    }
  };
  return { get, middleware };
}
