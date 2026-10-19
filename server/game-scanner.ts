import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, readFile, stat, realpath } from "node:fs/promises";
import { join, resolve, basename, extname, sep, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type {
  InstalledGame,
  EmulatorConfig,
  LauncherId,
} from "../src/lib/installed-games.ts";
const exec = promisify(execFile);
export type LaunchSpec =
  | { type: "uri"; uri: string }
  | { type: "exe"; executable: string; args: string[]; cwd: string };
export interface FoundGame {
  game: InstalledGame;
  launch: LaunchSpec;
}
export const stableId = (source: string, value: string) =>
  `${source}:${createHash("sha256").update(value.toLowerCase()).digest("hex").slice(0, 24)}`;
export async function isDirectory(path: string) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
export async function isFile(path: string) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
export async function smallText(path: string) {
  if ((await stat(path)).size > 5_000_000)
    throw new Error("Manifest too large");
  return readFile(path, "utf8");
}
export async function list(path: string) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch {
    return [];
  }
}
export function parseVdf(source: string): Record<string, any> {
  const tokens =
    source
      .replace(/^\uFEFF/, "")
      .match(/"(?:\\.|[^"\\])*"|[{}]|\/\/[^\r\n]*|[^\s{}"]+/g) || [];
  let index = 0;
  const decode = (token: string) =>
    token.startsWith('"')
      ? token.slice(1, -1).replace(/\\\\/g, "\\").replace(/\\"/g, '"')
      : token;
  function block(depth = 0): Record<string, any> {
    if (depth > 20) throw new Error("VDF nesting too deep");
    const out: Record<string, any> = Object.create(null);
    while (index < tokens.length) {
      const key = tokens[index++];
      if (key === "}") break;
      if (key.startsWith("//")) continue;
      const value = tokens[index++];
      if (value === undefined) break;
      out[decode(key)] = value === "{" ? block(depth + 1) : decode(value);
    }
    return out;
  }
  return block();
}
export async function scanSteam(roots: string[]): Promise<FoundGame[]> {
  const libraries = new Set<string>();
  for (const root of roots) {
    libraries.add(resolve(root));
    for (const file of [
      join(root, "steamapps", "libraryfolders.vdf"),
      join(root, "config", "libraryfolders.vdf"),
    ]) {
      try {
        const folders = parseVdf(await smallText(file)).libraryfolders;
        for (const [key, entry] of Object.entries(folders || {})) {
          const path =
            typeof entry === "string" && /^\d+$/.test(key)
              ? entry
              : (entry as any)?.path;
          if (typeof path === "string" && isAbsolute(path))
            libraries.add(resolve(path));
        }
      } catch {
        /* Default root still works. */
      }
    }
  }
  const found: FoundGame[] = [];
  for (const root of libraries) {
    const manifests = (await list(join(root, "steamapps"))).filter(
      (f) => f.isFile() && /^appmanifest_\d+\.acf$/i.test(f.name),
    );
    await Promise.all(
      manifests.slice(0, 5000).map(async (file) => {
        try {
          const a = parseVdf(
            await smallText(join(root, "steamapps", file.name)),
          ).AppState;
          if (
            !a ||
            !/^\d+$/.test(a.appid) ||
            file.name !== `appmanifest_${a.appid}.acf` ||
            typeof a.name !== "string" ||
            !a.name.trim() ||
            typeof a.installdir !== "string" ||
            /[\\/]|^\.+$/.test(a.installdir) ||
            !(Number(a.StateFlags) & 4) ||
            /steamworks.*redistributables|steam linux runtime/i.test(a.name)
          )
            return;
          const installPath = join(root, "steamapps", "common", a.installdir);
          if (!(await isDirectory(installPath))) return;
          found.push({
            game: {
              id: `steam:${a.appid}`,
              title: a.name.slice(0, 500),
              launcher: "steam",
              installPath,
              image: `https://cdn.akamai.steamstatic.com/steam/apps/${a.appid}/header.jpg`,
              steamId: a.appid,
            },
            launch: { type: "uri", uri: `steam://rungameid/${a.appid}` },
          });
        } catch {
          /* One damaged or updating manifest must not hide other games. */
        }
      }),
    );
  }
  return [...new Map(found.map((g) => [g.game.id, g])).values()];
}
export async function scanEpic(directories: string[], journals: string[] = [], installedLists: string[] = []): Promise<FoundGame[]> {
  const found: FoundGame[] = [];
  for (const directory of directories)
    for (const file of (await list(directory))
      .filter((f) => f.isFile() && /\.item$/i.test(f.name))
      .slice(0, 5000)) {
      try {
        const m = JSON.parse((await smallText(join(directory, file.name))).replace(/^\uFEFF/, ""));
        if (
          !/^[\w-]{1,200}$/.test(m.AppName) ||
          (m.CatalogNamespace != null && !/^[\w-]{1,200}$/.test(m.CatalogNamespace)) ||
          (m.CatalogItemId != null && !/^[\w-]{1,200}$/.test(m.CatalogItemId)) ||
          typeof m.DisplayName !== "string" ||
          !m.DisplayName.trim() ||
          m.bIsIncompleteInstall ||
          typeof m.InstallLocation !== "string" ||
          !isAbsolute(m.InstallLocation) ||
          !(await isDirectory(m.InstallLocation))
        )
          continue;
        found.push({
          game: {
            id: `epic:${m.AppName}`,
            title: m.DisplayName.slice(0, 500),
            launcher: "epic",
            installPath: m.InstallLocation,
            image: "",
            steamId: null,
          },
          launch: {
            type: "uri",
            uri: epicLaunchUri(m.AppName, m.CatalogNamespace, m.CatalogItemId),
          },
        });
      } catch {
        /* Ignore incomplete manifests. */
      }
    }
  for (const file of installedLists) {
    try {
      const entries = JSON.parse((await smallText(file)).replace(/^\uFEFF/, "")).InstallationList;
      if (Array.isArray(entries)) for (const row of entries.slice(0, 5000)) {
        if (!/^[\w-]{1,200}$/.test(row.AppName) || typeof row.InstallLocation !== "string" ||
            !isAbsolute(row.InstallLocation) || !(await isDirectory(row.InstallLocation)) ||
            found.some((entry) => entry.game.id === `epic:${row.AppName}`)) continue;
        found.push({ game: { id: `epic:${row.AppName}`, title: basename(row.InstallLocation), launcher: "epic", installPath: row.InstallLocation, image: "", steamId: null },
          launch: { type: "uri", uri: epicLaunchUri(row.AppName) } });
      }
    } catch { /* Optional legacy installation index. */ }
  }
  for (const file of journals) {
    try {
      if ((await stat(file)).size > 64_000_000) continue;
      const entries = new Map<string, Record<string, any>>();
      const lines = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
      for await (const line of lines) {
        if (line.length > 1_000_000) continue;
        try {
          const row = JSON.parse(line.replace(/^\uFEFF/, ""));
          if (typeof row.installationId === "string" && /^[\w-]{1,200}$/.test(row.installationId) && entries.size < 10000)
            entries.set(row.installationId, { ...entries.get(row.installationId), ...row });
        } catch { /* Interrupted journal append must not hide completed entries. */ }
      }
      for (const row of entries.values()) {
        if (row.complete !== true || row.deleted || row.removed || !/^[\w-]{1,200}$/.test(row.artifactId) ||
            !/^[\w-]{1,200}$/.test(row.namespace) || !/^[\w-]{1,200}$/.test(row.itemId) ||
            (row.platform && row.platform !== "Windows") || typeof row.dir !== "string" || !isAbsolute(row.dir) || !(await isDirectory(row.dir))) continue;
        found.push({ game: { id: `epic:${row.artifactId}`, title: typeof row.displayName === "string" && row.displayName.trim() ? row.displayName.slice(0, 500) : basename(row.dir), launcher: "epic", installPath: row.dir, image: "", steamId: null },
          launch: { type: "uri", uri: epicLaunchUri(row.artifactId, row.namespace, row.itemId) } });
      }
    } catch { /* New Epic launcher is optional; other stores remain available. */ }
  }
  return [...new Map(found.map((entry) => [entry.game.id, entry])).values()];
}
function epicLaunchUri(app: string, namespace?: string, item?: string) {
  const identity = namespace && item ? `${namespace}:${item}:${app}` : app;
  return `com.epicgames.launcher://apps/${encodeURIComponent(identity)}?action=launch&silent=true`;
}
export async function registryTree(
  key: string,
): Promise<Record<string, Record<string, string>>> {
  if (process.platform !== "win32") return {};
  try {
    const { stdout } = await exec("reg.exe", ["query", key, "/s"], {
      windowsHide: true,
      timeout: 8000,
      maxBuffer: 12_000_000,
      encoding: "utf8",
    });
    const result: Record<string, Record<string, string>> = Object.create(null);
    let current = "";
    for (const line of stdout.split(/\r?\n/)) {
      if (/^HKEY_/.test(line)) {
        current = line.trim();
        result[current] = Object.create(null);
      } else {
        const match = line.match(/^\s+(.+?)\s+REG_\w+\s+(.*)$/);
        if (match && current) result[current][match[1]] = match[2].trim();
      }
    }
    return result;
  } catch {
    return {};
  }
}
async function registryBatch(
  keys: string[],
): Promise<Record<string, Record<string, string>>[]> {
  if (process.platform !== "win32") return keys.map(() => ({}));
  const paths = keys
    .map(
      (key) =>
        `'${key.replace(/^HKCU/, "Registry::HKEY_CURRENT_USER").replace(/^HKLM/, "Registry::HKEY_LOCAL_MACHINE").replaceAll("'", "''")}'`,
    )
    .join(",");
  const fields = [
    "SteamPath",
    "InstallPath",
    "gameName",
    "path",
    "exe",
    "workingDir",
    "DisplayName",
    "Name",
    "title",
    "InstallLocation",
    "InstallDir",
    "Publisher",
    "DisplayIcon",
    "Executable",
    "ExecutablePath",
  ];
  const script = `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $ErrorActionPreference='SilentlyContinue'; $roots=@(${paths}); $fields=@(${fields.map((f) => `'${f}'`).join(",")}); $result=@(); foreach($root in $roots){$tree=@{}; $keys=@(Get-Item -LiteralPath $root)+@(Get-ChildItem -LiteralPath $root -Recurse); foreach($key in $keys){if($null -eq $key){continue}; $values=@{}; foreach($field in $fields){$value=$key.GetValue($field); if($null -ne $value){$values[$field]=[string]$value}}; $tree[$key.Name]=$values}; $result+=,$tree}; ConvertTo-Json -InputObject $result -Depth 8 -Compress`;
  try {
    const { stdout } = await exec(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      {
        windowsHide: true,
        timeout: 12_000,
        maxBuffer: 12_000_000,
        encoding: "utf8",
      },
    );
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed) || parsed.length !== keys.length)
      throw new Error("Invalid registry response");
    return parsed;
  } catch {
    return Promise.all(keys.map(registryTree));
  }
}
export async function scanGog(
  entries: Record<string, Record<string, string>>,
): Promise<FoundGame[]> {
  const out: FoundGame[] = [];
  for (const [key, row] of Object.entries(entries)) {
    const id = key.split("\\").pop() || "";
    if (
      !/^\d+$/.test(id) ||
      !row.gameName ||
      !row.path ||
      !row.exe ||
      !isAbsolute(row.exe) ||
      extname(row.exe).toLowerCase() !== ".exe" ||
      !(await isFile(row.exe))
    )
      continue;
    // Prefer the publisher's own executable for DRM-free games; never interpret launcher command strings.
    out.push({
      game: {
        id: `gog:${id}`,
        title: row.gameName.slice(0, 500),
        launcher: "gog",
        installPath: row.path,
        image: "",
        steamId: null,
      },
      launch: {
        type: "exe",
        executable: row.exe,
        args: [],
        cwd: row.workingDir || row.path,
      },
    });
  }
  return out;
}
export async function scanAmazon(databasePath: string): Promise<FoundGame[]> {
  if (!(await isFile(databasePath))) return [];
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(databasePath, {
    readOnly: true,
    allowExtension: false,
  });
  try {
    database.exec("PRAGMA query_only = ON");
    const entries = database
      .prepare(
        "SELECT Id, ProductTitle, InstallDirectory FROM DbSet WHERE Installed = 1 LIMIT 5000",
      )
      .all();
    const found: FoundGame[] = [];
    for (const row of entries) {
      if (
        typeof row.Id !== "string" ||
        !/^[\w-]{1,200}$/.test(row.Id) ||
        typeof row.ProductTitle !== "string" ||
        typeof row.InstallDirectory !== "string" ||
        !isAbsolute(row.InstallDirectory) ||
        !(await isDirectory(row.InstallDirectory))
      )
        continue;
      found.push({
        game: {
          id: `amazon:${row.Id}`,
          title: row.ProductTitle.slice(0, 500),
          launcher: "amazon",
          installPath: row.InstallDirectory,
          image: "",
          steamId: null,
        },
        launch: { type: "uri", uri: `amazon-games://play/${row.Id}` },
      });
    }
    return found;
  } finally {
    database.close();
  }
}
function cleanIcon(value: string | undefined): string {
  return (value || "")
    .replace(/^"(.+)"(?:,\s*-?\d+)?$/, "$1")
    .replace(/,\s*-?\d+$/, "");
}
export async function scanRegisteredGames(
  entries: Record<string, Record<string, string>>,
  source: LauncherId,
): Promise<FoundGame[]> {
  const found: FoundGame[] = [];
  for (const [key, row] of Object.entries(entries)) {
    const name = row.DisplayName || row.Name || row.title;
    const path = row.InstallLocation || row.InstallDir || row.path;
    if (
      !name ||
      !path ||
      !isAbsolute(path) ||
      !(await isDirectory(path)) ||
      /launcher|connect|redistributable|anti.?cheat|support|uninstall|service|installer|directx|visual c\+\+|^battle\.net$|^EA app$|^Origin$/i.test(
        name,
      )
    )
      continue;
    const icon = cleanIcon(row.DisplayIcon);
    // Only a concrete executable that belongs to this installation; never UninstallString or arbitrary arguments.
    const gameRoot = await realpath(path).catch(() => "");
    const candidates = [row.Executable, row.ExecutablePath, icon].filter(
      (p): p is string =>
        !!p && isAbsolute(p) && extname(p).toLowerCase() === ".exe",
    );
    let executable = "";
    for (const candidate of candidates) {
      const actual = await realpath(candidate).catch(() => "");
      if (
        gameRoot &&
        actual.toLowerCase().startsWith((gameRoot + sep).toLowerCase()) &&
        (await isFile(actual))
      ) {
        executable = actual;
        break;
      }
    }
    const uplayId =
      source === "ubisoft" ? key.match(/Uplay Install (\d+)$/i)?.[1] : null;
    if (!executable && !uplayId) continue;
    found.push({
      game: {
        id: stableId(source, key),
        title: name.slice(0, 500),
        launcher: source,
        installPath: path,
        image: "",
        steamId: null,
      },
      launch: uplayId
        ? { type: "uri", uri: `uplay://launch/${uplayId}/0` }
        : { type: "exe", executable, args: [], cwd: gameRoot },
    });
  }
  return found;
}
export interface XboxPackage { Name: string; PackageFamilyName: string; InstallLocation: string }
const xmlValue = (value: string) => value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const xmlAttribute = (tag: string, name: string) => xmlValue(tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] || "");
export async function scanXboxFolders(roots: string[], packages: XboxPackage[] = []): Promise<FoundGame[]> {
  const candidates = new Map<string, XboxPackage | undefined>();
  for (const row of packages) if (typeof row.InstallLocation === "string" && isAbsolute(row.InstallLocation))
    candidates.set(resolve(row.InstallLocation), row);
  for (const root of roots) {
    if (!isAbsolute(root)) continue;
    const libraries = new Set([join(root, "XboxGames")]);
    try {
      const marker = join(root, ".GamingRoot");
      if ((await stat(marker)).size <= 4096) {
        const folder = (await readFile(marker)).subarray(8).toString("utf16le").split(String.fromCharCode(0))[0];
        if (folder && !isAbsolute(folder) && !folder.split(/[\\/]/).some((part) => part === "..")) libraries.add(join(root, folder));
      }
    } catch { /* A drive need not contain an Xbox library. */ }
    for (const library of libraries) for (const directory of (await list(library)).filter((entry) => entry.isDirectory()).slice(0, 5000)) {
      for (const content of [join(library, directory.name, "Content"), join(library, directory.name)])
        if (await isFile(join(content, "MicrosoftGame.config"))) candidates.set(resolve(content), candidates.get(resolve(content)));
    }
  }
  const found: FoundGame[] = [];
  for (const [directory, registered] of candidates) {
    try {
      const config = await smallText(join(directory, "MicrosoftGame.config"));
      const identity = xmlAttribute(config.match(/<Identity\b[^>]*>/i)?.[0] || "", "Name");
      const row = registered || packages.find((entry) => entry.Name === identity);
      let appId = "";
      try {
        const manifest = await smallText(join(directory, "AppxManifest.xml"));
        appId = xmlAttribute(manifest.match(/<Application\b[^>]*>/i)?.[0] || "", "Id");
      } catch { /* Modern Gaming Services installations use MicrosoftGame.config. */ }
      const executables = [...config.matchAll(/<Executable\b[^>]*>/gi)].map((match) => match[0]).filter((tag) => !/^(true|1)$/i.test(xmlAttribute(tag, "IsDevOnly")));
      appId ||= xmlAttribute(executables[0] || "", "Id");
      const title = xmlAttribute(config.match(/<ShellVisuals\b[^>]*>/i)?.[0] || "", "DefaultDisplayName");
      const family = row?.PackageFamilyName;
      let launch: LaunchSpec | undefined;
      if (family && /^[\w.-]+_[\w]+$/.test(family) && /^[\w.-]+$/.test(appId))
        launch = { type: "uri", uri: `shell:AppsFolder\\${family}!${appId}` };
      else {
        const gameRoot = await realpath(directory);
        for (const tag of executables) {
          const name = xmlAttribute(tag, "Name");
          if (!name || isAbsolute(name) || extname(name).toLowerCase() !== ".exe") continue;
          const executable = await realpath(join(directory, name)).catch(() => "");
          if (executable.toLowerCase().startsWith((gameRoot + sep).toLowerCase()) && await isFile(executable)) {
            launch = { type: "exe", executable, args: [], cwd: gameRoot }; break;
          }
        }
      }
      if (!launch) continue;
      found.push({ game: { id: family ? `xbox:${family}` : stableId("xbox", directory), title: title && !title.startsWith("ms-resource:") ? title.slice(0, 500) : basename(resolve(directory, basename(directory).toLowerCase() === "content" ? ".." : ".")), launcher: "xbox", installPath: directory, steamId: null, image: "" }, launch });
    } catch { /* Read only: never change WindowsApps permissions. */ }
  }
  return [...new Map(found.map((entry) => [entry.game.id, entry])).values()];
}
export async function scanXbox(): Promise<FoundGame[]> {
  if (process.platform !== "win32") return [];
  const script = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $packages=@(Get-AppxPackage | Where-Object {$_.IsFramework -eq $false} | Select-Object Name,PackageFamilyName,InstallLocation); $roots=@(Get-PSDrive -PSProvider FileSystem | Where-Object {$_.Root -match '^[A-Za-z]:\\\\$'} | Select-Object -ExpandProperty Root); @{Packages=$packages;Roots=$roots} | ConvertTo-Json -Depth 4 -Compress";
  try {
    const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { windowsHide: true, timeout: 20_000, maxBuffer: 4_000_000 });
    const parsed = JSON.parse(stdout || "{}");
    return await scanXboxFolders(Array.isArray(parsed.Roots) ? parsed.Roots : [], Array.isArray(parsed.Packages) ? parsed.Packages : []);
  } catch {
    return scanXboxFolders([resolve(process.env.SystemDrive || "C:", "\\")]);
  }
}
export async function scanRoms(config: EmulatorConfig): Promise<FoundGame[]> {
  if (!config.enabled) return [];
  const root = await realpath(config.folder);
  const out: FoundGame[] = [];
  const visited = new Set<string>();
  async function walk(folder: string, depth: number) {
    if (visited.has(folder) || out.length >= 2000) return;
    visited.add(folder);
    for (const entry of await list(folder)) {
      if (out.length >= 2000) break;
      if (entry.isSymbolicLink()) continue;
      const path = join(folder, entry.name);
      if (entry.isDirectory() && config.recursive && depth < 4)
        await walk(path, depth + 1);
      if (
        !entry.isFile() ||
        !config.extensions.includes(extname(entry.name).slice(1).toLowerCase())
      )
        continue;
      const actual = await realpath(path).catch(() => "");
      if (!actual.startsWith(root + sep)) continue;
      const title =
        basename(path, extname(path))
          .replace(/\s*\([^)]*\)|\s*\[[^\]]*\]/g, "")
          .trim() || entry.name;
      out.push({
        game: {
          id: stableId(`rom-${config.id}`, actual),
          title,
          launcher: "emulator",
          installPath: actual,
          steamId: null,
          image: "",
          emulatorId: config.id,
          system: config.name,
        },
        launch: {
          type: "exe",
          executable: config.executable,
          cwd: resolve(config.executable, ".."),
          args: config.args.map((a) => a.replaceAll("{rom}", actual)),
        },
      });
    }
  }
  await walk(root, 0);
  return out;
}
export async function scanComputer(): Promise<{
  found: FoundGame[];
  warnings: string[];
}> {
  if (process.platform !== "win32")
    return {
      found: [],
      warnings: [
        "La detección automática de launchers está disponible en Windows.",
      ],
    };
  const roots = [
    join(
      process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
      "Steam",
    ),
    join(process.env.ProgramFiles || "C:\\Program Files", "Steam"),
  ];
  const xbox = scanXbox();
  const trees = await registryBatch([
    "HKCU\\Software\\Valve\\Steam",
    "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam",
    "HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games",
    "HKLM\\SOFTWARE\\GOG.com\\Games",
    "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs",
    "HKCU\\Software\\Epic Games\\EpicGamesLauncher",
  ]);
  for (const tree of trees.slice(0, 2))
    for (const row of Object.values(tree))
      if (row.SteamPath || row.InstallPath)
        roots.push(row.SteamPath || row.InstallPath);
  const uninstalls = { ...trees[4], ...trees[5], ...trees[6] };
  const filtered = (pattern: RegExp) =>
    Object.fromEntries(
      Object.entries(uninstalls).filter(([, row]) =>
        pattern.test(`${row.Publisher || ""} ${row.InstallLocation || ""}`),
      ),
    );
  const outputs = await Promise.allSettled([
    scanSteam(roots),
    scanEpic([
      join(
        process.env.ProgramData || "C:\\ProgramData",
        "Epic",
        "EpicGamesLauncher",
        "Data",
        "Manifests",
      ),
    ], [...new Set([
      join(process.env.LOCALAPPDATA || "", "com.epicgames.eglv2", "installations.jsonl"),
      ...Object.values(trees[8] || {}).flatMap((row) => row.AppDataPath && isAbsolute(row.AppDataPath) ? [join(row.AppDataPath, "installations.jsonl")] : []),
    ])], [join(process.env.ProgramData || "C:\\ProgramData", "Epic", "UnrealEngineLauncher", "LauncherInstalled.dat")]),
    scanGog({ ...trees[2], ...trees[3] }),
    scanRegisteredGames(filtered(/amazon games|amazon\.com/i), "amazon"),
    scanAmazon(
      join(
        process.env.LOCALAPPDATA || "",
        "Amazon Games",
        "Data",
        "Games",
        "Sql",
        "GameInstallInfo.sqlite",
      ),
    ),
    scanRegisteredGames({ ...filtered(/ubisoft/i), ...trees[7] }, "ubisoft"),
    scanRegisteredGames(
      filtered(/electronic arts|EA Games|EA Desktop|origin games/i),
      "ea",
    ),
    scanRegisteredGames(filtered(/blizzard|battle\.net/i), "battlenet"),
    scanRegisteredGames(filtered(/riot games/i), "riot"),
    xbox,
  ]);
  return {
    found: [
      ...new Map(
        outputs
          .flatMap((o) => (o.status === "fulfilled" ? o.value : []))
          .map((g) => [g.game.id, g]),
      ).values(),
    ],
    warnings: outputs.some((o) => o.status === "rejected")
      ? [
          "No se pudo leer una de las bibliotecas. Las demás siguen disponibles.",
        ]
      : [],
  };
}
