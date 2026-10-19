import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { createDashboardApi } from "../server/dashboard-api.ts";
import { startLocalServer } from "../server/local-server.ts";
import { defaultData } from "../src/lib/dashboard.ts";
const require = createRequire(import.meta.url);
const {
  windowState,
  performWindowAction,
  safeExternalUrl,
  authUrl,
  trustedFrame,
} = require("../desktop/window-controls.cjs");
test("ventana nativa: restaurar desde pantalla completa, maximizar, minimizar y cerrar", () => {
  const calls: string[] = [];
  let full = true,
    maximized = false;
  const window = {
    isMaximized: () => maximized,
    isFullScreen: () => full,
    isFocused: () => true,
    setFullScreen: (value: boolean) => {
      full = value;
    },
    minimize: () => calls.push("minimize"),
    close: () => calls.push("close"),
    maximize: () => {
      maximized = true;
    },
    unmaximize: () => {
      maximized = false;
    },
  };
  performWindowAction(window, "maximize");
  assert.deepEqual(windowState(window), {
    fullscreen: false,
    maximized: false,
    focused: true,
  });
  performWindowAction(window, "maximize");
  assert.equal(maximized, true);
  performWindowAction(window, "maximize");
  assert.equal(maximized, false);
  performWindowAction(window, "fullscreen");
  assert.equal(full, true);
  performWindowAction(window, "minimize");
  performWindowAction(window, "close");
  assert.deepEqual(calls, ["minimize", "close"]);
  assert.throws(() => performWindowAction(window, "execute"));
});
test("escritorio: enlaces externos y ventanas remotas no obtienen controles nativos", () => {
  for (const value of [
    "file:///C:/secret",
    "javascript:alert(1)",
    "steam://run/1",
    "https://user:pass@example.com",
    "data:text/html,x",
  ])
    assert.equal(safeExternalUrl(value), null);
  assert.equal(safeExternalUrl("https://example.com"), "https://example.com/");
  assert.equal(authUrl("https://accounts.spotify.com/authorize"), true);
  assert.equal(authUrl("https://accounts.google.com/"), true);
  for (const value of [
    "http://accounts.google.com/",
    "https://accounts.google.com.evil.test",
    "https://other.test",
  ])
    assert.equal(authUrl(value), false);
  const origin = "http://127.0.0.1:17731";
  assert.equal(
    trustedFrame(
      { senderFrame: { url: origin + "/#gaming", parent: null } },
      origin,
    ),
    true,
  );
  for (const frame of [
    { url: origin + "/", parent: {} },
    { url: "https://other.test/", parent: null },
    { url: origin + "/document.html", parent: null },
  ])
    assert.equal(trustedFrame({ senderFrame: frame }, origin), false);
});
test("espacio en disco: reinicio, copia previa y protección de datos corruptos", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mia-desktop-data-"));
  let handler = createDashboardApi(directory);
  const server = createServer(
    (req, res) =>
      void handler(req, res, () => {
        res.writeHead(404);
        res.end();
      }),
  );
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(async () => {
    await new Promise<void>((done) => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/dashboard`;
  const headers = {
    "X-MIA-Dashboard": "1",
    "Content-Type": "application/json",
  };
  assert.equal((await fetch(url)).status, 403);
  assert.equal(
    (
      await fetch(url, {
        headers: { ...headers, Origin: "https://other.test" },
      })
    ).status,
    403,
  );
  assert.deepEqual(await (await fetch(url, { headers })).json(), {
    data: null, conflict: null,
  });
  const first = { ...structuredClone(defaultData), version: 2 };
  assert.equal(
    (await fetch(url, { method: "PUT", headers, body: JSON.stringify(first) }))
      .status,
    200,
  );
  handler = createDashboardApi(directory);
  assert.deepEqual((await (await fetch(url, { headers })).json()).data, first);
  const second = structuredClone(first);
  second.settings.userName = "Espacio de prueba";
  assert.equal(
    (await fetch(url, { method: "PUT", headers, body: JSON.stringify(second) }))
      .status,
    200,
  );
  assert.deepEqual(
    JSON.parse(await readFile(join(directory, "previous.json"), "utf8")),
    first,
  );
  assert.equal(
    (await fetch(url, { method: "PUT", headers, body: "{}" })).status,
    400,
  );
  assert.deepEqual(
    JSON.parse(await readFile(join(directory, "dashboard.json"), "utf8")),
    second,
  );
  await writeFile(join(directory, "dashboard.json"), "corrupt-original");
  assert.equal(
    (await fetch(url, { method: "PUT", headers, body: JSON.stringify(first) }))
      .status,
    500,
  );
  assert.equal(
    await readFile(join(directory, "dashboard.json"), "utf8"),
    "corrupt-original",
  );
});
test("servidor empaquetado: recursos locales con CSP y carpetas personales inaccesibles", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mia-desktop-server-"));
  const root = join(directory, "dist");
  await mkdir(root);
  await writeFile(join(root, "index.html"), "<title>MIA</title>");
  await writeFile(join(directory, "private.txt"), "secret");
  const { server, url } = await startLocalServer({
    root,
    dataDirectory: directory,
    port: 0,
  });
  t.after(async () => {
    await new Promise<void>((done) => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  });
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "<title>MIA</title>");
  assert.match(
    response.headers.get("Content-Security-Policy")!,
    /object-src 'none'/,
  );
  assert.doesNotMatch(
    response.headers.get("Content-Security-Policy")!,
    /'unsafe-eval'/,
  );
  assert.equal((await fetch(url + "/private.txt")).status, 404);
  assert.equal(
    (await fetch(url + "/dashboard-data/dashboard.json")).status,
    404,
  );
  assert.equal((await fetch(url, { method: "HEAD" })).status, 200);
});
