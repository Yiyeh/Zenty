import { APP_NAME } from "../src/lib/brand.ts";
import type { IncomingMessage, ServerResponse } from "node:http";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, rename, realpath } from "node:fs/promises";
import {
  join,
  resolve,
  extname,
  basename,
  dirname,
  isAbsolute,
} from "node:path";
import { randomUUID } from "node:crypto";
import { httpsUrl } from "../src/lib/gaming.ts";
import { searchKey, launcherNames } from "../src/lib/installed-games.ts";
import type {
  InstalledSnapshot,
  EmulatorConfig,
  GameMetadata,
  LauncherId,
} from "../src/lib/installed-games.ts";
import { scanComputer, scanRoms, isDirectory, isFile } from "./game-scanner.ts";
import type { FoundGame, LaunchSpec } from "./game-scanner.ts";
import { createGameImages } from "./game-images.ts";
import { createHash } from "node:crypto";
interface ManualEntry {
  id: string;
  title: string;
  executable: string;
  args: string[];
  image: string;
  launcher: LauncherId;
  enabled: boolean;
}
interface LocalState {
  version: 1;
  manual: ManualEntry[];
  emulators: EmulatorConfig[];
  metadata: Record<string, GameMetadata>;
}
class LocalError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
const blockedExecutables =
  /^(cmd|powershell|pwsh|wscript|cscript|mshta|rundll32|regsvr32|reg|shutdown|explorer|conhost|msiexec)\.exe$/i;
export async function validateExecutable(value: unknown): Promise<string> {
  if (
    typeof value !== "string" ||
    !isAbsolute(value) ||
    extname(value).toLowerCase() !== ".exe" ||
    blockedExecutables.test(basename(value))
  )
    throw new LocalError("Selecciona el ejecutable .exe del juego o emulador.");
  const path = await realpath(value).catch(() => "");
  if (!path || !(await isFile(path)))
    throw new LocalError("No encontramos ese ejecutable. Comprueba la ruta.");
  return path;
}
export function validateArgs(value: unknown, rom = false): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 30 ||
    value.some(
      (a) =>
        typeof a !== "string" ||
        a.length > 2000 ||
        a.includes(String.fromCharCode(0)) ||
        a.includes("\r") ||
        a.includes("\n"),
    ) ||
    (rom && !value.some((a) => a.includes("{rom}")))
  )
    throw new LocalError(
      rom ? "Los argumentos deben incluir {rom}." : "Argumentos no válidos.",
    );
  return value;
}
export function allowedLaunchUri(uri: string): boolean {
  return (
    /^steam:\/\/rungameid\/\d{1,12}$/.test(uri) ||
    /^com\.epicgames\.launcher:\/\/apps\/[\w-]{1,200}(?:%3A[\w-]{1,200}%3A[\w-]{1,200})?\?action=launch&silent=true$/.test(
      uri,
    ) ||
    /^amazon-games:\/\/play\/[\w-]{1,200}$/.test(uri) ||
    /^uplay:\/\/launch\/\d+\/0$/.test(uri) ||
    /^shell:AppsFolder\\[\w.-]+_[\w]+![\w.-]+$/.test(uri)
  );
}
export async function launchGame(spec: LaunchSpec): Promise<void> {
  if (process.platform !== "win32")
    throw new LocalError(
      "El lanzamiento de juegos está disponible en Windows.",
    );
  let executable: string, args: string[], cwd: string | undefined;
  if (spec.type === "uri") {
    if (!allowedLaunchUri(spec.uri))
      throw new LocalError("Este acceso del launcher no es válido.");
    executable = join(process.env.WINDIR || "C:\\Windows", "explorer.exe");
    args = [spec.uri];
  } else {
    executable = await validateExecutable(spec.executable);
    args = validateArgs(spec.args);
    cwd = spec.cwd;
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      shell: false,
      detached: true,
      windowsHide: true,
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
async function pickPath(kind: string): Promise<string> {
  if (process.platform !== "win32")
    throw new LocalError("Escribe la ruta completa en este sistema.");
  if (!["executable", "folder"].includes(kind))
    throw new LocalError("Selector desconocido.");
  const script = `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; ${kind === "folder" ? "$picker=New-Object System.Windows.Forms.FolderBrowserDialog; $picker.Description='Elige tu carpeta de ROMs'; if($picker.ShowDialog() -eq 'OK'){Write-Output $picker.SelectedPath}" : "$picker=New-Object System.Windows.Forms.OpenFileDialog; $picker.Filter='Aplicaciones (*.exe)|*.exe'; $picker.Title='Elige el juego o emulador'; if($picker.ShowDialog() -eq 'OK'){Write-Output $picker.FileName}"}; $picker.Dispose()`;
  const result = await promisify(execFile)(
    "powershell.exe",
    [
      "-NoProfile",
      "-STA",
      "-WindowStyle",
      "Hidden",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    { windowsHide: true, timeout: 120_000, maxBuffer: 20_000 },
  );
  return result.stdout.trim();
}
interface Options {
  directory?: string;
  scanner?: typeof scanComputer;
  launcher?: (spec: LaunchSpec) => Promise<void>;
  fetcher?: typeof fetch;
  now?: () => number;
}
export function createInstalledApi({
  directory = resolve("gaming-data"),
  scanner = scanComputer,
  launcher = launchGame,
  fetcher = fetch,
  now = Date.now,
}: Options = {}) {
  const manifest = join(directory, "local-games.json");
  const libraryCache = join(directory, "installed-library.json");
  const images = createGameImages({
    directory: join(directory, "images"),
    now,
  });
  let state: LocalState | undefined,
    serial: Promise<unknown> = Promise.resolve(),
    scanFlight: Promise<InstalledSnapshot> | null = null,
    snapshot: InstalledSnapshot | null = null;
  let found = new Map<string, FoundGame>();
  const launches = new Map<string, number>();
  const metaFlights = new Map<string, Promise<GameMetadata>>();
  const metaAttempts = new Map<string, number>();
  let metadataActive = 0;
  const metadataWaiting: (() => void)[] = [];
  async function metadataSlot<T>(
    work: () => Promise<T>,
    priority: boolean,
  ): Promise<T> {
    await new Promise<void>((resolve) => {
      if (metadataActive < 3) {
        metadataActive++;
        resolve();
      } else if (priority) metadataWaiting.unshift(resolve);
      else metadataWaiting.push(resolve);
    });
    try {
      return await work();
    } finally {
      const next = metadataWaiting.shift();
      if (next) next();
      else metadataActive--;
    }
  }
  let activePick = false;
  const sequence = <T>(work: () => Promise<T>): Promise<T> => {
    const result = serial.then(work);
    serial = result.catch(() => {});
    return result;
  };
  async function read(): Promise<LocalState> {
    if (state) return state;
    try {
      const raw = await readFile(manifest, "utf8");
      if (raw.length > 10_000_000) throw new Error("Too large");
      const data = JSON.parse(raw);
      if (
        data.version !== 1 ||
        !Array.isArray(data.manual) ||
        !Array.isArray(data.emulators) ||
        !data.metadata ||
        typeof data.metadata !== "object"
      )
        throw new Error("Invalid state");
      for (const entry of data.manual)
        if (
          typeof entry.id !== "string" ||
          typeof entry.title !== "string" ||
          typeof entry.executable !== "string" ||
          !Array.isArray(entry.args) ||
          typeof entry.enabled !== "boolean" ||
          !Object.hasOwn(launcherNames, entry.launcher)
        )
          throw new Error("Invalid manual game");
      for (const entry of data.emulators)
        if (
          typeof entry.id !== "string" ||
          typeof entry.name !== "string" ||
          typeof entry.folder !== "string" ||
          typeof entry.executable !== "string" ||
          !Array.isArray(entry.args) ||
          !Array.isArray(entry.extensions) ||
          typeof entry.enabled !== "boolean"
        )
          throw new Error("Invalid emulator");
      state = data;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT")
        throw new LocalError(
          "No se pudo leer tu configuración local. Conserva gaming-data para recuperarla; no se ha sobrescrito.",
          500,
        );
      state = { version: 1, manual: [], emulators: [], metadata: {} };
    }
    return state!;
  }
  async function save() {
    const data = await read();
    await mkdir(directory, { recursive: true });
    const temporary = `${manifest}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(data));
    await rename(temporary, manifest);
  }
  async function scan(force = false): Promise<InstalledSnapshot> {
    if (scanFlight) return scanFlight;
    scanFlight = (async () => {
      const start = performance.now(),
        config = await read();
      const configKey = createHash("sha256").update(JSON.stringify([config.manual, config.emulators])).digest("hex");
      if (!force && !snapshot) {
        try {
          const raw = await readFile(libraryCache, "utf8");
          if (raw.length > 20_000_000) throw new Error("Large cache");
          const cached = JSON.parse(raw);
          if (cached.version !== 1 || cached.configKey !== configKey || !Array.isArray(cached.entries) || cached.entries.length > 20000 ||
              !cached.snapshot || !Array.isArray(cached.snapshot.warnings) || !Number.isFinite(Date.parse(cached.snapshot.scannedAt))) throw new Error("Invalid cache");
          for (const entry of cached.entries) {
            if (!entry?.game || typeof entry.game.id !== "string" || typeof entry.game.title !== "string" ||
                typeof entry.game.installPath !== "string" || !isAbsolute(entry.game.installPath) ||
                !Object.hasOwn(launcherNames, entry.game.launcher)) throw new Error("Invalid cached game");
            if (entry.launch?.type === "uri") { if (!allowedLaunchUri(entry.launch.uri)) throw new Error("Invalid launch"); }
            else if (entry.launch?.type === "exe") { if (!isAbsolute(entry.launch.executable) || !isAbsolute(entry.launch.cwd)) throw new Error("Invalid executable"); validateArgs(entry.launch.args, entry.game.launcher === "emulator"); }
            else throw new Error("Invalid launch");
          }
          found = new Map(cached.entries.map((entry: FoundGame) => [entry.game.id, entry]));
          snapshot = { ...cached.snapshot, games: cached.entries.map((entry: FoundGame) => entry.game), emulators: structuredClone(config.emulators), removed: config.manual.filter((entry) => !entry.enabled).map(({ id, title }) => ({ id, title })) };
        } catch { /* A disposable cache can be rebuilt without touching user configuration. */ }
      }
      if (!force && snapshot) {
        return { ...snapshot, games: snapshot.games.map((game) => ({ ...game, image: config.metadata[game.id]?.image || game.image || "" })) };
      }
      const result = await scanner();
      const warnings = [...result.warnings];
      const entries = [...result.found];
      for (const item of config.manual.filter((m) => m.enabled)) {
        if (!(await isFile(item.executable))) {
          warnings.push(
            `No se encuentra el ejecutable de ${item.title}. Puedes corregirlo o quitar el acceso.`,
          );
          continue;
        }
        entries.push({
          game: {
            id: item.id,
            title: item.title,
            launcher: item.launcher,
            installPath: dirname(item.executable),
            image: item.image,
            steamId: null,
          },
          launch: {
            type: "exe",
            executable: item.executable,
            args: item.args,
            cwd: dirname(item.executable),
          },
        });
      }
      const roms = await Promise.allSettled(
        config.emulators.filter((e) => e.enabled).map(scanRoms),
      );
      for (const output of roms)
        if (output.status === "fulfilled") entries.push(...output.value);
        else
          warnings.push(
            "No se pudo leer una carpeta de ROMs. Revisa su ruta en Emuladores.",
          );
      found = new Map(entries.map((e) => [e.game.id, e]));
      snapshot = {
        games: [...found.values()]
          .map((e) => ({
            ...e.game,
            image: config.metadata[e.game.id]?.image || e.game.image || "",
          }))
          .sort((a, b) => a.title.localeCompare(b.title)),
        emulators: structuredClone(config.emulators),
        removed: config.manual
          .filter((e) => !e.enabled)
          .map((e) => ({ id: e.id, title: e.title })),
        warnings,
        scannedAt: new Date(now()).toISOString(),
        durationMs: Math.round(performance.now() - start),
        supported: process.platform === "win32",
      };
      await mkdir(directory, { recursive: true });
      const temporary = `${libraryCache}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify({ version: 1, configKey, entries: [...found.values()], snapshot }));
      await rename(temporary, libraryCache);
      return snapshot;
    })().finally(() => {
      scanFlight = null;
    });
    return scanFlight;
  }
  async function requestJson(url: string) {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
      headers: { "User-Agent": `${APP_NAME}-PersonalDashboard/1.0` },
    });
    if (!response.ok) throw new Error("Metadata unavailable");
    const raw = await response.text();
    if (raw.length > 4_000_000) throw new Error("Metadata too large");
    return JSON.parse(raw);
  }
  async function metadata(id: string, priority = false): Promise<GameMetadata> {
    const config = await read();
    const old = config.metadata[id];
    if (
      old && !(id.startsWith("epic:") && !old.image && !old.source) &&
      (old.source === "Personalizada" ||
        now() - Date.parse(old.fetchedAt) < (old.source ? 30 : 1) * 86400_000)
    )
      return old;
    if (metaFlights.has(id)) return metaFlights.get(id)!;
    if (metaAttempts.has(id) && now() - metaAttempts.get(id)! < 300_000)
      return (
        old || {
          image: "",
          description: "",
          url: "",
          matchedTitle: "",
          genres: [],
          source: "",
          fetchedAt: "",
        }
      );
    const entry = found.get(id);
    if (!entry)
      throw new LocalError(
        "Vuelve a detectar los juegos antes de completar la ficha.",
        404,
      );
    const operation = metadataSlot(async () => {
      metaAttempts.set(id, now());
      let appid = entry.game.steamId;
      let image = entry.game.image;
      if (entry.game.launcher === "epic") {
        try {
          const slug = searchKey(entry.game.title).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          const product = await requestJson(`https://store-content.ak.epicgames.com/api/en-US/content/products/${encodeURIComponent(slug)}`);
          const page = product.pages?.find((value: any) => value._slug === "home" || value._title === "home") || product;
          const title = product.productName || page.productName;
          const cover = httpsUrl(page.data?.hero?.backgroundImageUrl) || httpsUrl(page.data?.about?.image?.src);
          if (typeof title === "string" && searchKey(title) === searchKey(entry.game.title) && cover) {
            const result: GameMetadata = { image: cover, description: String(page.data?.about?.description || "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/<[^>]*>/g, "").trim().slice(0, 2000), url: `https://store.epicgames.com/p/${slug}`, matchedTitle: title, genres: [], source: "Epic Games", fetchedAt: new Date(now()).toISOString() };
            await sequence(async () => { config.metadata[id] = result; await save(); });
            return result;
          }
        } catch { /* Other stores can still supply an exact match. */ }
      }
      const missing = async () => {
        if (old) return old;
        const result: GameMetadata = {
          image,
          description: "",
          url: "",
          matchedTitle: "",
          genres: [],
          source: "",
          fetchedAt: new Date(now()).toISOString(),
        };
        await sequence(async () => {
          config.metadata[id] = result;
          await save();
        });
        return result;
      };
      if (!appid) {
        const result = await requestJson(
          `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(entry.game.title)}&l=english&cc=cl`,
        );
        const match = result.items?.find(
          (r: any) =>
            r.type === "app" &&
            Number.isSafeInteger(r.id) &&
            searchKey(String(r.name)) === searchKey(entry.game.title),
        );
        if (!match) return missing();
        appid = String(match.id);
        image = httpsUrl(match.tiny_image);
      }
      const response = await requestJson(
        `https://store.steampowered.com/api/appdetails?appids=${appid}&l=spanish&cc=cl&filters=basic,genres`,
      );
      const detail = response?.[appid]?.success ? response[appid].data : null;
      if (!detail) return missing();
      const meta: GameMetadata = {
        image: httpsUrl(detail.header_image) || image,
        description:
          typeof detail.short_description === "string"
            ? detail.short_description.replace(/<[^>]*>/g, "").slice(0, 2000)
            : "",
        url: `https://store.steampowered.com/app/${appid}/`,
        matchedTitle: String(detail.name || entry.game.title).slice(0, 500),
        genres: Array.isArray(detail.genres)
          ? detail.genres.map((g: any) => String(g.description)).slice(0, 10)
          : [],
        source: "Steam",
        fetchedAt: new Date(now()).toISOString(),
      };
      await sequence(async () => {
        config.metadata[id] = meta;
        const entries = Object.entries(config.metadata);
        if (entries.length > 2000) {
          const removable = entries
            .filter(([, value]) => value.source !== "Personalizada")
            .sort((a, b) => a[1].fetchedAt.localeCompare(b[1].fetchedAt));
          for (const [key] of removable.slice(0, entries.length - 2000))
            delete config.metadata[key];
        }
        await save();
      });
      return meta;
    }, priority)
      .catch(
        () =>
          old || {
            image: entry.game.image,
            description: "",
            url: "",
            matchedTitle: "",
            genres: [],
            source: "",
            fetchedAt: "",
          },
      )
      .finally(() => metaFlights.delete(id));
    metaFlights.set(id, operation);
    return old || operation;
  }
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    if (req.url?.split("?")[0] === "/api/game-assets/image") {
      await images.middleware(req, res, next);
      return;
    }
    const path = req.url?.split("?")[0] || "";
    if (!path.startsWith("/api/installed/")) {
      next();
      return;
    }
    const reply = (code: number, body: unknown) => {
      res.writeHead(code, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(body));
    };
    try {
      const host = req.headers.host || "",
        origin = req.headers.origin;
      if (
        !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) ||
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          req.socket.remoteAddress || "",
        ) ||
        req.headers["sec-fetch-site"] === "cross-site" ||
        (origin && ![`http://${host}`, `https://${host}`].includes(origin))
      )
        throw new LocalError(
          `Solo puedes usar tus juegos desde ${APP_NAME} en este equipo.`,
          403,
        );
      if (req.headers["x-mia-games"] !== "1")
        throw new LocalError("Petición local no autorizada.", 403);
      let body: any = {};
      if (req.method === "POST" || req.method === "PATCH") {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 30_000)
            throw new LocalError("La configuración es demasiado grande.", 413);
          chunks.push(Buffer.from(chunk));
        }
        try {
          body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        } catch {
          throw new LocalError("Configuración no válida.");
        }
        if (!body || typeof body !== "object" || Array.isArray(body))
          throw new LocalError("Configuración no válida.");
      }
      const action = path.slice("/api/installed/".length);
      if (req.method === "GET" && action === "scan") {
        reply(200, await scan());
        return;
      }
      if (req.method === "POST" && action === "scan") {
        reply(200, await scan(true));
        return;
      }
      if (req.method === "POST" && action === "metadata") {
        const id = typeof body.id === "string" ? body.id : "";
        if (!snapshot) await scan();
        reply(200, await metadata(id, body.priority === true));
        return;
      }
      if (req.method === "POST" && action === "launch") {
        if (!snapshot) await scan();
        const entry = found.get(body.id);
        if (!entry)
          throw new LocalError(
            "Este juego ya no está en la detección. Actualiza tu biblioteca.",
            404,
          );
        if (now() - (launches.get(body.id) ?? 0) < 2000)
          throw new LocalError(
            "El acceso ya se está abriendo. Espera un momento.",
            429,
          );
        if (
          entry.game.launcher === "emulator" &&
          !(await isFile(entry.game.installPath))
        )
          throw new LocalError(
            "No encontramos esta ROM. Actualiza la detección.",
          );
        if (
          entry.game.launcher !== "emulator" &&
          !(await isDirectory(entry.game.installPath))
        )
          throw new LocalError(
            "La carpeta de este juego ya no está disponible. Actualiza la detección.",
          );
        if (
          entry.launch.type === "exe" &&
          !(await isFile(entry.launch.executable))
        )
          throw new LocalError(
            "El ejecutable ya no está disponible. Actualiza la detección.",
          );
        if (entry.launch.type === "uri" && !allowedLaunchUri(entry.launch.uri))
          throw new LocalError("Acceso inválido.");
        launches.set(body.id, now());
        try {
          await launcher(entry.launch);
        } catch (e) {
          launches.delete(body.id);
          throw e;
        }
        reply(200, {
          message:
            "Se envió la solicitud para abrir el juego. El launcher puede pedirte iniciar sesión.",
        });
        return;
      }
      if (req.method === "POST" && action === "pick") {
        if (activePick)
          throw new LocalError("Ya hay un selector de archivos abierto.", 409);
        activePick = true;
        try {
          reply(200, { path: await pickPath(body.kind) });
        } finally {
          activePick = false;
        }
        return;
      }
      if (req.method === "POST" && action === "manual") {
        const executable = await validateExecutable(body.executable),
          args = validateArgs(body.args || []);
        if (
          typeof body.title !== "string" ||
          !body.title.trim() ||
          body.title.length > 500
        )
          throw new LocalError("Añade un nombre para el juego.");
        const item: ManualEntry = {
          id: `local:${randomUUID()}`,
          title: body.title.trim(),
          executable,
          args,
          image: httpsUrl(body.image),
          launcher:
            Object.hasOwn(launcherNames, body.launcher) &&
            body.launcher !== "emulator"
              ? body.launcher
              : "manual",
          enabled: true,
        };
        await sequence(async () => {
          const config = await read();
          if (
            config.manual
              .filter((m) => m.enabled)
              .some(
                (m) => m.executable.toLowerCase() === executable.toLowerCase(),
              )
          )
            throw new LocalError("Ese acceso ya está añadido.");
          config.manual.push(item);
          await save();
        });
        snapshot = null;
        reply(200, { id: item.id });
        return;
      }
      if (req.method === "POST" && action === "emulators") {
        const executable = await validateExecutable(body.executable);
        if (
          typeof body.name !== "string" ||
          !body.name.trim() ||
          body.name.length > 100 ||
          typeof body.folder !== "string" ||
          !isAbsolute(body.folder) ||
          !(await isDirectory(body.folder))
        )
          throw new LocalError(
            "Añade un nombre y una carpeta de ROMs que exista.",
          );
        const extensions: string[] = Array.isArray(body.extensions)
          ? [
              ...new Set<string>(
                body.extensions.map((v: unknown) =>
                  String(v).trim().replace(/^\./, "").toLowerCase(),
                ),
              ),
            ]
          : [];
        if (
          !extensions.length ||
          extensions.length > 40 ||
          extensions.some(
            (e) =>
              !/^[a-z0-9]{1,8}$/.test(e) ||
              ["exe", "bat", "cmd", "ps1", "com", "dll", "lnk"].includes(e),
          )
        )
          throw new LocalError(
            "Indica extensiones de ROM, como iso, chd o gba.",
          );
        const item: EmulatorConfig = {
          id: randomUUID(),
          name: body.name.trim(),
          executable,
          folder: await realpath(body.folder),
          extensions,
          args: validateArgs(body.args || ["{rom}"], true),
          recursive: body.recursive === true,
          enabled: true,
        };
        if (item.args.some((a) => a.includes("RUTA_AL_CORE")))
          throw new LocalError(
            "En Opciones de inicio, reemplaza RUTA_AL_CORE.dll por la ruta real del core de RetroArch.",
          );
        await sequence(async () => {
          const config = await read();
          if (config.emulators.filter((e) => e.enabled).length >= 30)
            throw new LocalError("El máximo es de 30 emuladores activos.");
          config.emulators.push(item);
          await save();
        });
        snapshot = null;
        reply(200, { id: item.id });
        return;
      }
      if (req.method === "PATCH" && ["manual", "emulators"].includes(action)) {
        await sequence(async () => {
          const config = await read();
          const entries =
            action === "manual" ? config.manual : config.emulators;
          const entry = entries.find((e) => e.id === body.id);
          if (!entry || typeof body.enabled !== "boolean")
            throw new LocalError("Acceso no encontrado.", 404);
          entry.enabled = body.enabled;
          await save();
        });
        snapshot = null;
        reply(200, { ok: true });
        return;
      }
      if (req.method === "PATCH" && action === "artwork") {
        if (!found.has(body.id))
          throw new LocalError("Juego no encontrado.", 404);
        const image = httpsUrl(body.image);
        if (!image) throw new LocalError("Usa un enlace HTTPS de una imagen.");
        await sequence(async () => {
          const config = await read();
          config.metadata[body.id] = {
            image,
            description: "",
            url: "",
            matchedTitle: "",
            genres: [],
            source: "Personalizada",
            fetchedAt: new Date(now()).toISOString(),
          };
          await save();
        });
        snapshot = null;
        reply(200, { ok: true });
        return;
      }
      throw new LocalError("Acción no disponible.", 404);
    } catch (e) {
      reply(e instanceof LocalError ? e.status : 500, {
        error:
          e instanceof LocalError
            ? e.message
            : "No se pudo completar la acción. Revisa que el launcher, archivo o carpeta sigan disponibles.",
      });
    }
  };
}
