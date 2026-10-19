import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import type { TestContext } from "node:test";
import {
  createInstalledApi,
  allowedLaunchUri,
  validateArgs,
  validateExecutable,
} from "../server/installed-api.ts";
import {
  scanSteam,
  scanEpic,
  scanXboxFolders,
  scanGog,
  scanAmazon,
  scanRoms,
  parseVdf,
} from "../server/game-scanner.ts";
import type { FoundGame, LaunchSpec } from "../server/game-scanner.ts";
import {
  createGameSearchIndex,
  searchInstalled,
} from "../src/lib/installed-games.ts";
import type {
  EmulatorConfig,
  InstalledGame,
} from "../src/lib/installed-games.ts";
async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "mia-games-test-"));
  t.after(async () => {
    const actual = resolve(root),
      parent = resolve(tmpdir());
    assert.ok(
      actual.startsWith(parent + sep) &&
        actual.slice(parent.length + 1).startsWith("mia-games-test-"),
    );
    await rm(actual, { recursive: true, force: true });
  });
  return root;
}
test("Epic moderno: Fortnite, diario incremental, duplicados, bajas y registros incompletos", async (t) => {
  const root = await fixture(t), installed = join(root, "Fortnite"), journal = join(root, "installations.jsonl");
  await mkdir(installed);
  const game = { installationId: "installation-1", complete: true, dir: installed, platform: "Windows", namespace: "fn", itemId: "item123", artifactId: "Fortnite" };
  await writeFile(journal, [JSON.stringify({ version: 1 }), JSON.stringify(game), JSON.stringify({ ...game, version: "updated" }), "{broken", JSON.stringify({ ...game, installationId: "removed", artifactId: "Removed" }), JSON.stringify({ installationId: "removed", deleted: true }), JSON.stringify({ ...game, installationId: "partial", artifactId: "Partial", complete: false }), JSON.stringify({ ...game, installationId: "absent", artifactId: "Absent", dir: join(root, "missing") })].join("\n"));
  const found = await scanEpic([], [journal]);
  assert.equal(found.length, 1);
  assert.equal(found[0].game.id, "epic:Fortnite");
  assert.equal(found[0].game.title, "Fortnite");
  assert.equal((found[0].launch as { uri: string }).uri, "com.epicgames.launcher://apps/fn%3Aitem123%3AFortnite?action=launch&silent=true");
  assert.ok(allowedLaunchUri((found[0].launch as { uri: string }).uri));
  assert.ok(allowedLaunchUri("com.epicgames.launcher://apps/Fortnite?action=launch&silent=true"));
  assert.ok(!allowedLaunchUri("com.epicgames.launcher://apps/Fortnite?action=uninstall"));
});
test("Xbox y Game Pass: otras unidades, GamingRoot, paquetes y ejecutables contenidos", async (t) => {
  const root = await fixture(t), drive = join(root, "drive"), content = join(drive, "XboxGames", "Space Game", "Content"), custom = join(drive, "MyLibrary", "Other", "Content");
  await mkdir(content, { recursive: true }); await mkdir(custom, { recursive: true });
  await writeFile(join(drive, ".GamingRoot"), Buffer.concat([Buffer.alloc(8), Buffer.from("MyLibrary\0", "utf16le")]));
  await writeFile(join(content, "MicrosoftGame.config"), '<Game><Identity Name="Studio.Space"/><ExecutableList><Executable Name="game.exe" Id="Game"/></ExecutableList><ShellVisuals DefaultDisplayName="Space &amp; Stars"/></Game>');
  await writeFile(join(custom, "MicrosoftGame.config"), '<Game><ExecutableList><Executable Name="game.exe" Id="Game"/></ExecutableList><ShellVisuals DefaultDisplayName="Other Game"/></Game>');
  await writeFile(join(custom, "game.exe"), "MZfixture");
  const packages = [{ Name: "Studio.Space", PackageFamilyName: "Studio.Space_12345", InstallLocation: content }];
  const found = await scanXboxFolders([drive], packages);
  assert.equal(found.length, 2);
  const space = found.find((entry) => entry.game.title === "Space & Stars")!;
  assert.equal(space.game.launcher, "xbox");
  assert.equal((space.launch as { uri: string }).uri, "shell:AppsFolder\\Studio.Space_12345!Game");
  assert.ok(allowedLaunchUri((space.launch as { uri: string }).uri));
  assert.equal(found.find((entry) => entry.game.title === "Other Game")?.launch.type, "exe");
  await writeFile(join(custom, "MicrosoftGame.config"), '<Game><ExecutableList><Executable Name="../../../outside.exe" Id="Game"/></ExecutableList></Game>');
  await writeFile(join(root, "outside.exe"), "MZfixture");
  assert.equal((await scanXboxFolders([drive], packages)).length, 1);
});
async function serve(
  t: TestContext,
  api: ReturnType<typeof createInstalledApi>,
) {
  const server = createServer(
    (req, res) =>
      void api(req, res, () => {
        res.writeHead(404);
        res.end();
      }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      ),
  );
  const root = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    root,
    request: async (action: string, body?: unknown, method?: string) =>
      fetch(`${root}/api/installed/${action}`, {
        method: method || (body === undefined ? "GET" : "POST"),
        headers: { "X-MIA-Games": "1", "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
  };
}
test("biblioteca: reiniciar y volver días después no escanea; actualizar sí, y Epic conserva portada", async (t) => {
  const directory = await fixture(t), install = join(directory, "Fortnite");
  await mkdir(install);
  const source: FoundGame = { game: { id: "epic:Fortnite", title: "Fortnite", launcher: "epic", installPath: install, image: "", steamId: null }, launch: { type: "uri", uri: "com.epicgames.launcher://apps/fn%3Aitem%3AFortnite?action=launch&silent=true" } };
  let scans = 0, network = 0, time = Date.now();
  const options = { directory: join(directory, "config"), now: () => time,
    scanner: async () => { scans++; return { found: [source], warnings: [] }; },
    fetcher: (async (url: string) => {
      network++; assert.ok(url.startsWith("https://store-content.ak.epicgames.com/"));
      return new Response(JSON.stringify({ productName: "Fortnite", pages: [{ _title: "home", data: { hero: { backgroundImageUrl: "https://cdn2.unrealengine.com/fortnite-test.jpg" } } }] }), { status: 200 });
    }) as typeof fetch,
  };
  const first = await serve(t, createInstalledApi(options));
  await first.request("scan");
  const meta = await (await first.request("metadata", { id: source.game.id })).json();
  assert.equal(meta.source, "Epic Games"); assert.ok(meta.image.includes("fortnite-test"));
  assert.equal(scans, 1); assert.equal(network, 1);
  time += 7 * 86400_000;
  const restarted = await serve(t, createInstalledApi(options));
  const restored = await (await restarted.request("scan")).json();
  assert.equal(restored.games.length, 1); assert.equal(restored.games[0].image, meta.image);
  assert.equal(scans, 1);
  const cached = await (await restarted.request("metadata", { id: source.game.id })).json();
  assert.equal(cached.image, meta.image); assert.equal(network, 1);
  await restarted.request("scan", {});
  assert.equal(scans, 2);
  const raw = JSON.parse(await readFile(join(options.directory, "installed-library.json"), "utf8"));
  raw.entries[0].launch.uri = "file:///C:/Windows/System32/cmd.exe";
  await writeFile(join(options.directory, "installed-library.json"), JSON.stringify(raw));
  const recovery = await serve(t, createInstalledApi(options));
  await recovery.request("scan"); assert.equal(scans, 3);
});
test("Steam: bibliotecas adicionales, manifiestos completos, duplicados y ausencia de carpetas", async (t) => {
  const root = await fixture(t),
    steam = join(root, "Steam"),
    second = join(root, "Segunda biblioteca");
  await mkdir(join(steam, "steamapps"), { recursive: true });
  await mkdir(join(second, "steamapps", "common", "MIA Game"), {
    recursive: true,
  });
  const escaped = second.replaceAll("\\", "\\\\");
  await writeFile(
    join(steam, "steamapps", "libraryfolders.vdf"),
    `"libraryfolders" { "1" { "path" "${escaped}" } }`,
  );
  const manifest =
    '"AppState" { "appid" "20" "name" "Juego de prueba" "installdir" "MIA Game" "StateFlags" "4" }';
  await writeFile(join(second, "steamapps", "appmanifest_20.acf"), manifest);
  await writeFile(
    join(second, "steamapps", "appmanifest_21.acf"),
    manifest.replaceAll('"20"', '"21"').replace('"4"', '"2"'),
  );
  await writeFile(
    join(second, "steamapps", "appmanifest_22.acf"),
    manifest.replaceAll('"20"', '"22"').replace("MIA Game", "../outside"),
  );
  await writeFile(join(second, "steamapps", "appmanifest_23.acf"), "broken");
  const found = await scanSteam([steam, second]);
  assert.equal(found.length, 1);
  assert.equal(found[0].game.id, "steam:20");
  assert.deepEqual(found[0].launch, {
    type: "uri",
    uri: "steam://rungameid/20",
  });
  assert.equal(Object.getPrototypeOf(parseVdf('"__proto__" "safe"')), null);
});
test("Epic, GOG y Amazon: solo instalaciones verificables y protocolos conocidos", async (t) => {
  const root = await fixture(t),
    manifests = join(root, "Manifests"),
    installed = join(root, "Mi juego");
  await mkdir(manifests);
  await mkdir(installed);
  const executable = join(installed, "game.exe");
  await writeFile(executable, "MZfixture");
  const epic = {
    AppName: "GameApp",
    CatalogNamespace: "Sandbox",
    CatalogItemId: "Product",
    DisplayName: "Juego Epic",
    InstallLocation: installed,
    bIsIncompleteInstall: false,
  };
  await writeFile(join(manifests, "game.item"), JSON.stringify(epic));
  await writeFile(
    join(manifests, "incomplete.item"),
    JSON.stringify({ ...epic, AppName: "Other", bIsIncompleteInstall: true }),
  );
  await writeFile(
    join(manifests, "bad.item"),
    JSON.stringify({ ...epic, AppName: "x?uninstall=true" }),
  );
  const found = await scanEpic([manifests]);
  assert.equal(found.length, 1);
  assert.equal(found[0].launch.type, "uri");
  assert.equal(
    allowedLaunchUri((found[0].launch as { uri: string }).uri),
    true,
  );
  const gog = await scanGog({
    "HKEY_LOCAL_MACHINE\\GOG.com\\Games\\123": {
      gameName: "Juego GOG",
      exe: executable,
      path: installed,
    },
  });
  assert.equal(gog.length, 1);
  assert.equal(gog[0].game.launcher, "gog");
  const { DatabaseSync } = await import("node:sqlite");
  const databasePath = join(root, "GameInstallInfo.sqlite"),
    db = new DatabaseSync(databasePath);
  db.exec(
    "CREATE TABLE DbSet (Id TEXT, ProductTitle TEXT, InstallDirectory TEXT, Installed INTEGER)",
  );
  db.prepare("INSERT INTO DbSet VALUES (?, ?, ?, ?)").run(
    "amazon-id",
    "Juego Amazon",
    installed,
    1,
  );
  db.prepare("INSERT INTO DbSet VALUES (?, ?, ?, ?)").run(
    "not-installed",
    "Ausente",
    installed,
    0,
  );
  db.close();
  const amazon = await scanAmazon(databasePath);
  assert.equal(amazon.length, 1);
  assert.deepEqual(amazon[0].launch, {
    type: "uri",
    uri: "amazon-games://play/amazon-id",
  });
});
test("emuladores: extensiones, carpetas, nombres limpios y argumentos con espacios sin shell", async (t) => {
  const root = await fixture(t),
    folder = join(root, "ROMs con espacios"),
    exe = join(root, "emulador.exe");
  await mkdir(join(folder, "Extra"), { recursive: true });
  await writeFile(exe, "MZfixture");
  await writeFile(join(folder, "Aventura (USA) [v1].iso"), "rom");
  await writeFile(join(folder, "Otra & aventura.iso"), "rom");
  await writeFile(join(folder, "No es una ROM.exe"), "binary");
  await writeFile(join(folder, "Extra", "Secuela.iso"), "rom");
  const config: EmulatorConfig = {
    id: "emulator-id",
    name: "Dolphin",
    executable: exe,
    folder,
    extensions: ["iso"],
    args: ["-e", "{rom}"],
    recursive: false,
    enabled: true,
  };
  const entries = await scanRoms(config);
  assert.equal(entries.length, 2);
  assert.equal(
    entries.some((g) => g.game.title === "Aventura"),
    true,
  );
  const game = entries.find((g) => g.game.title.includes("&"))!;
  assert.deepEqual((game.launch as { args: string[] }).args, [
    "-e",
    await realpath(join(folder, "Otra & aventura.iso")),
  ]);
  assert.equal((await scanRoms({ ...config, recursive: true })).length, 3);
  assert.equal((await scanRoms({ ...config, enabled: false })).length, 0);
  assert.throws(() => validateArgs(["--help"], true));
  await assert.rejects(() => validateExecutable(join(root, "powershell.exe")));
  assert.equal(allowedLaunchUri("steam://uninstall/20"), false);
  assert.equal(allowedLaunchUri("https://evil.example"), false);
});
test("búsqueda rápida: sin acentos, por palabras, launcher y emulador; índice idéntico al resultado normal", () => {
  const items: InstalledGame[] = [
    {
      id: "a",
      title: "Pokémon Aventuras",
      launcher: "emulator",
      system: "Dolphin",
      installPath: "",
      image: "",
      steamId: null,
    },
    {
      id: "b",
      title: "Mi aventura",
      launcher: "gog",
      installPath: "",
      image: "",
      steamId: null,
    },
  ];
  const index = createGameSearchIndex(items);
  for (const query of ["pokemon", "dolphin aven", "gog", "sin resultados", ""])
    assert.deepEqual(
      searchInstalled(items, query, index),
      searchInstalled(items, query),
    );
  assert.equal(searchInstalled(items, "pokemon dolphin", index)[0].id, "a");
});
test("API local: detección compartida, caché, inicio por ID e imposibilidad de enviar comandos arbitrarios", async (t) => {
  const directory = await fixture(t);
  let scans = 0,
    time = 100_000;
  const launched: LaunchSpec[] = [];
  const found: FoundGame = {
    game: {
      id: "steam:20",
      title: "Juego",
      launcher: "steam",
      installPath: directory,
      image: "",
      steamId: "20",
    },
    launch: { type: "uri", uri: "steam://rungameid/20" },
  };
  const { request, root } = await serve(
    t,
    createInstalledApi({
      directory,
      now: () => time,
      scanner: async () => {
        scans++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { found: [found], warnings: [] };
      },
      launcher: async (spec) => {
        launched.push(spec);
      },
    }),
  );
  const all = await Promise.all(
    Array.from({ length: 4 }, () => request("scan").then((r) => r.json())),
  );
  assert.equal(scans, 1);
  assert.equal(all[0].games.length, 1);
  await request("scan");
  assert.equal(scans, 1);
  assert.equal((await fetch(`${root}/api/installed/scan`)).status, 403);
  assert.equal(
    (
      await fetch(`${root}/api/installed/scan`, {
        headers: { "X-MIA-Games": "1", origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("launch", {
        id: "unknown",
        executable: "cmd.exe",
        args: ["/c", "bad"],
      })
    ).status,
    404,
  );
  assert.equal(launched.length, 0);
  assert.equal(
    (
      await request("launch", {
        id: "steam:20",
        uri: "steam://uninstall/20",
        args: ["bad"],
      })
    ).status,
    200,
  );
  assert.deepEqual(launched, [found.launch]);
  assert.equal((await request("launch", { id: "steam:20" })).status, 429);
  time += 3000;
  assert.equal((await request("launch", { id: "steam:20" })).status, 200);
});
test("accesos y emuladores: guardar, reiniciar, quitar, restaurar y conservar archivos", async (t) => {
  const directory = await fixture(t),
    exe = join(directory, "juego.exe"),
    roms = join(directory, "ROMs");
  await writeFile(exe, "MZfixture");
  await mkdir(roms);
  await writeFile(join(roms, "Prueba.iso"), "rom");
  const options = {
    directory: join(directory, "config"),
    scanner: async () => ({ found: [], warnings: [] }),
    launcher: async () => {},
  };
  const { request } = await serve(t, createInstalledApi(options));
  assert.equal(
    (await request("manual", { title: "Mi juego", executable: exe, args: [] }))
      .status,
    200,
  );
  assert.equal(
    (await request("manual", { title: "Duplicado", executable: exe, args: [] }))
      .status,
    400,
  );
  assert.equal(
    (
      await request("emulators", {
        name: "Emulador",
        executable: exe,
        folder: roms,
        extensions: ["exe"],
        args: ["{rom}"],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("emulators", {
        name: "Emulador",
        executable: exe,
        folder: roms,
        extensions: ["iso"],
        args: ["{rom}"],
      })
    ).status,
    200,
  );
  const first = await (await request("scan")).json();
  assert.equal(first.games.length, 2);
  const local = first.games.find((g: InstalledGame) =>
    g.id.startsWith("local:"),
  );
  await request("manual", { id: local.id, enabled: false }, "PATCH");
  const second = await (await request("scan")).json();
  assert.equal(second.games.length, 1);
  assert.equal(second.removed[0].title, "Mi juego");
  const other = await serve(t, createInstalledApi(options));
  assert.equal((await (await other.request("scan")).json()).games.length, 1);
  await other.request("manual", { id: local.id, enabled: true }, "PATCH");
  assert.equal((await (await other.request("scan")).json()).games.length, 2);
  assert.equal(await readFile(exe, "utf8"), "MZfixture");
  assert.equal(await readFile(join(roms, "Prueba.iso"), "utf8"), "rom");
});
test("fichas: coincidencia exacta, caché y funcionamiento local con APIs caídas; índice corrupto no se sobrescribe", async (t) => {
  const directory = await fixture(t);
  let calls = 0;
  const source: FoundGame = {
    game: {
      id: "gog:1",
      title: "Mi Juego",
      launcher: "gog",
      installPath: directory,
      image: "",
      steamId: null,
    },
    launch: {
      type: "exe",
      executable: join(directory, "juego.exe"),
      args: [],
      cwd: directory,
    },
  };
  const api = createInstalledApi({
    directory: join(directory, "config"),
    scanner: async () => ({ found: [source], warnings: [] }),
    fetcher: (async (input) => {
      calls++;
      return new Response(
        JSON.stringify(
          String(input).includes("storesearch")
            ? {
                items: [
                  { id: 21, type: "app", name: "Mi Juego II" },
                  { id: 20, type: "app", name: "Mi Juego" },
                ],
              }
            : {
                20: {
                  success: true,
                  data: {
                    name: "Mi Juego",
                    header_image: "https://example.com/cover.jpg",
                    short_description: "<b>Aventura</b>",
                    genres: [{ description: "Aventura" }],
                  },
                },
              },
        ),
      );
    }) as typeof fetch,
  });
  const { request } = await serve(t, api);
  await request("scan");
  const meta = await (await request("metadata", { id: "gog:1" })).json();
  assert.equal(meta.matchedTitle, "Mi Juego");
  assert.equal(meta.description, "Aventura");
  await request("metadata", { id: "gog:1" });
  assert.equal(calls, 2);
  assert.equal(
    (await request("artwork", { id: "gog:1", image: "javascript:1" }, "PATCH"))
      .status,
    400,
  );
  const corruptDir = join(directory, "corrupt");
  await mkdir(corruptDir);
  await writeFile(join(corruptDir, "local-games.json"), "broken");
  const corrupt = await serve(
    t,
    createInstalledApi({
      directory: corruptDir,
      scanner: async () => ({ found: [], warnings: [] }),
    }),
  );
  assert.equal((await corrupt.request("scan")).status, 500);
  assert.equal(
    await readFile(join(corruptDir, "local-games.json"), "utf8"),
    "broken",
  );
});
