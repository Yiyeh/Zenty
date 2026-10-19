import test from "node:test";
import { request } from "node:http";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startLocalServer } from "../server/local-server.ts";
import { createLanSharing, lanAddresses } from "../server/lan-server.ts";
import { defaultData } from "../src/lib/dashboard.ts";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "zenty-lan-"));
  const root = join(dir, "dist"); await mkdir(root);
  await writeFile(join(root, "index.html"), '<html><head><title>Zenty</title></head><body>Library</body></html>');
  const local = await startLocalServer({ root, dataDirectory: dir, port: 0 });
  const sharing = createLanSharing(local.url, 0);
  return { local, sharing, async cleanup() { await sharing.stop(); local.server.closeAllConnections(); await new Promise<void>((resolve) => local.server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); } };
}
async function connect(url: string, code: string) {
  const response = await fetch(url + "/connect", { method: "POST", headers: { Origin: url }, body: new URLSearchParams({ code }), redirect: "manual" });
  assert.equal(response.status, 303);
  const cookie = response.headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly; SameSite=Strict/);
  return cookie.split(";")[0];
}
test("red local: desactivada por defecto, URL real, biblioteca y progreso compartidos sin filtrar credenciales", async () => {
  const { local, sharing, cleanup } = await setup();
  try {
    assert.deepEqual(sharing.status(), { enabled: false, devices: [], urls: [], connections: [], pairedDevices: 0, code: "", port: 0 });
    const state = await sharing.set(true);
    assert.equal(state.enabled, true);
    assert.deepEqual(state.urls, lanAddresses().map((ip) => `http://${ip}:${state.port}`));
    const url = `http://127.0.0.1:${state.port}`;
    const login = await fetch(url);
    assert.equal(login.headers.get("referrer-policy"), "same-origin");
    const loginHtml = await login.text();
    assert.match(loginHtml, /Código de acceso/);
    assert.match(loginHtml, /name="remember" value="1" checked/);
    assert.match(loginHtml, /name="referrer" content="same-origin"/);
    assert.doesNotMatch(loginHtml, /no-referrer/);
    assert.equal((await fetch(url + "/api/library")).status, 401);
    // Use the real LAN interface too, when available on this test machine.
    const remote = state.urls[0] || url;
    const cookie = await connect(remote, state.code);
    assert.match(await (await fetch(remote, { headers: { cookie } })).text(), /name="zenty-remote"/);
    const secretData = structuredClone(defaultData);
    secretData.settings.userName = "Lector";
    secretData.settings.spotifyClientId = "private-config";
    await fetch(local.url + "/api/dashboard", { method: "PUT", headers: { "X-MIA-Dashboard": "1" }, body: JSON.stringify({ ...secretData, version: 2 }) });
    const profile = await (await fetch(remote + "/api/share-profile", { headers: { cookie } })).json();
    assert.equal(profile.settings.userName, "Lector"); assert.equal(profile.settings.spotifyClientId, undefined);
    const remoteDashboard = await (await fetch(remote + "/api/dashboard", { headers: { cookie, "X-MIA-Dashboard": "1" } })).json();
    assert.equal(remoteDashboard.data.settings.userName, "Lector");
    const first = structuredClone(remoteDashboard.data), second = structuredClone(remoteDashboard.data);
    first.settings.userName = "Desde el teléfono"; second.settings.theme = "dark";
    await Promise.all([fetch(remote + "/api/dashboard", { method: "PATCH", headers: { cookie, "X-MIA-Dashboard": "1" }, body: JSON.stringify({ base: remoteDashboard.data, data: first }) }), fetch(local.url + "/api/dashboard", { method: "PATCH", headers: { "X-MIA-Dashboard": "1" }, body: JSON.stringify({ base: remoteDashboard.data, data: second }) })]);
    const synced = await (await fetch(local.url + "/api/dashboard", { headers: { "X-MIA-Dashboard": "1" } })).json();
    assert.equal(synced.data.settings.userName, "Desde el teléfono"); assert.equal(synced.data.settings.theme, "dark");
    const tagged = await fetch(remote+"/api/dashboard",{headers:{cookie,"X-MIA-Dashboard":"1"}});
    const unchanged = await fetch(remote+"/api/dashboard",{headers:{cookie,"X-MIA-Dashboard":"1","If-None-Match":tagged.headers.get("etag")!}});
    assert.equal(unchanged.status,304);
    const uploaded = await (await fetch(local.url + "/api/library?name=lectura.txt", { method: "POST", headers: { "X-MIA-Library": "1" }, body: "Libro compartido" })).json();
    const id = uploaded.document.id;
    const list = await (await fetch(remote + "/api/library", { headers: { cookie } })).json();
    assert.equal(list.documents[0].id, id); assert.equal(list.storagePath, undefined);
    assert.equal(await (await fetch(remote + `/api/library/${id}/file`, { headers: { cookie } })).text(), "Libro compartido");
    const update = await fetch(remote + `/api/library/${id}`, { method: "PATCH", headers: { cookie, "X-MIA-Library": "1", "Content-Type": "application/json" }, body: JSON.stringify({ position: { unit: 7, progress: .5 } }) });
    assert.equal(update.status, 200);
    const hostState = await (await fetch(local.url + "/api/library")).json();
    assert.equal(hostState.documents[0].position.unit, 7);
    const imported = await fetch(remote + "/api/library?name=desde-ipad.txt", { method: "POST", headers: { cookie, "X-MIA-Library": "1" }, body: "Desde el dispositivo" });
    assert.equal(imported.status, 201);
    assert.equal((await (await fetch(local.url + "/api/library")).json()).documents.length, 2);
    assert.equal((await fetch(remote + "/api/dashboard", { method: "PUT", headers: { cookie, "X-MIA-Dashboard": "1" }, body: "{}" })).status, 403);
    for (const path of ["/api/installed/pick", "/api/installed/manual", "/api/music", "/desktop/main.cjs", "/data/dashboard-data/dashboard.json"]) {
      assert.equal((await fetch(remote + path, { headers: { cookie } })).status, 403, path);
    }
    await sharing.set(false);
    assert.equal(sharing.status().enabled, false);
    const restarted = await sharing.set(true);
    assert.notEqual(restarted.code, state.code);
    assert.equal((await fetch(`http://127.0.0.1:${restarted.port}/api/library`, { headers: { cookie } })).status, 401);
  } finally { await cleanup(); }
});

test("red local: rechaza otros orígenes, DNS rebinding, códigos incorrectos y limita intentos", async () => {
  const { sharing, cleanup } = await setup();
  try {
    const state = await sharing.set(true), url = `http://127.0.0.1:${state.port}`;
    assert.equal((await fetch(url + "/connect", { method: "POST", headers: { Origin: "null" }, body: new URLSearchParams({ code: state.code }) })).status, 403);
    const cookie = await connect(url, state.code);
    assert.equal((await fetch(url + "/api/library", { headers: { cookie, Origin: "https://malicioso.test" } })).status, 403);
    const rebinding = await new Promise<number>((resolve, reject) => {
      const req = request(url + "/api/library", { headers: { cookie, Host: `malicioso.test:${state.port}` } }, (res) => { res.resume(); resolve(res.statusCode!); });
      req.on("error", reject); req.end();
    });
    assert.equal(rebinding, 403);
    assert.equal((await fetch(url + "/api/library", { headers: { cookie, "Sec-Fetch-Site": "cross-site" } })).status, 403);
    assert.equal((await fetch(url + "/api/library/preferences", { method: "PATCH", headers: { cookie }, body: "{}" })).status, 403);
    for (let i = 0; i < 5; i++) {
      const response = await fetch(url + "/connect", { method: "POST", headers: { Origin: url }, body: new URLSearchParams({ code: "ááááááááá" }), redirect: "manual" });
      assert.equal(response.status, 401);
    }
    assert.equal((await fetch(url + "/connect", { method: "POST", body: new URLSearchParams({ code: state.code }), redirect: "manual" })).status, 401);
    // Existing paired sessions are unaffected by failed guesses.
    assert.equal((await fetch(url + "/api/library", { headers: { cookie } })).status, 200);
    assert.equal((await fetch(url + "/disconnect", { method: "POST", headers: { cookie }, redirect: "manual" })).status, 303);
    assert.equal((await fetch(url + "/api/library", { headers: { cookie } })).status, 401);
  } finally { await cleanup(); }
});


test("dispositivo recordado: sobrevive al reinicio, solo guarda hashes y permite revocar", async () => {
  const { local, sharing: unused, cleanup } = await setup();
  const directory = await mkdtemp(join(tmpdir(), "zenty-pairing-"));
  const sharing = createLanSharing(local.url, 0, directory);
  let restarted: ReturnType<typeof createLanSharing> | undefined;
  try {
    const state = await sharing.set(true), url = `http://127.0.0.1:${state.port}`;
    const response = await fetch(url + "/connect", { method: "POST", headers: { Origin: url }, body: new URLSearchParams({ code: state.code, remember: "1" }), redirect: "manual" });
    assert.equal(response.status, 303);
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    assert.match(response.headers.get("set-cookie")!, /Max-Age=7776000/);
    assert.equal(sharing.status().pairedDevices, 1);
    const raw = await (await import("node:fs/promises")).readFile(join(directory, "paired-devices.json"), "utf8");
    assert.ok(!raw.includes(cookie.split("=")[1])); assert.ok(!raw.includes(state.code));
    await sharing.stop();
    restarted = createLanSharing(local.url, 0, directory);
    const next = await restarted.set(true), remote = `http://127.0.0.1:${next.port}`;
    assert.equal(next.pairedDevices, 1);
    assert.equal((await fetch(remote + "/api/library", { headers: { cookie } })).status, 200);
    await restarted.forget();
    assert.equal((await fetch(remote + "/api/library", { headers: { cookie } })).status, 401);
    assert.equal(restarted.status().pairedDevices, 0);
    await restarted.stop();
    const final = await sharing.set(true);
    assert.equal((await fetch(`http://127.0.0.1:${final.port}/api/library`, { headers: { cookie } })).status, 401);
  } finally { await unused.stop(); await sharing.stop(); await restarted?.stop(); await cleanup(); await rm(directory, { recursive: true, force: true }); }
});


test("app completa: conexiones del anfitrión requieren sesión y un comando explícito", async () => {
  const {local,cleanup} = await setup(); const actions: string[] = [];
  const sharing = createLanSharing(local.url,0,undefined,async (action,input) => { actions.push(action); return {ok:true,snapshot:{spotifyConnected:true,spotifyName:"PC",events:[]},input}; });
  try {
    const status = await sharing.set(true), url = `http://127.0.0.1:${status.port}`;
    assert.equal((await fetch(url+"/api/remote/integrations",{headers:{"X-Zenty-Remote":"1"}})).status,401); assert.equal(actions.length,0);
    const cookie = await connect(url,status.code);
    const snapshot = await (await fetch(url+"/api/remote/integrations",{headers:{cookie,"X-Zenty-Remote":"1"}})).json();
    assert.equal(snapshot.snapshot.spotifyName,"PC"); assert.deepEqual(actions,["snapshot"]);
    const volume = await fetch(url+"/api/remote/integrations",{method:"POST",headers:{cookie,"X-Zenty-Remote":"1"},body:JSON.stringify({action:"volume",input:45})});
    assert.equal(volume.status,200); assert.deepEqual(actions,["snapshot","volume"]);
    assert.equal((await fetch(url+"/api/remote/integrations",{method:"POST",headers:{cookie,"X-Zenty-Remote":"1"},body:JSON.stringify({action:"execute",input:"cmd"})})).status,400);
    assert.equal((await fetch(url+"/api/installed/manual",{method:"POST",headers:{cookie,"X-MIA-Games":"1"},body:JSON.stringify({executable:"C:/Windows/cmd.exe"})})).status,403);
  } finally { await sharing.stop(); await cleanup(); }
});


test("dispositivos: permisos individuales, nombre, revocación y lecturas sin comandos", async () => {
  const { sharing, cleanup } = await setup();
  try {
    const state = await sharing.set(true), url = `http://127.0.0.1:${state.port}`;
    const one = await connect(url, state.code), two = await connect(url, state.code);
    const devices = sharing.status().devices; assert.equal(devices.length, 2);
    await sharing.manage(devices[0].id, { name: "Mi tableta", permission: "read" });
    const info = await (await fetch(url + "/api/remote/device", { headers: { cookie: one } })).json(); assert.equal(info.permission, "read"); assert.equal(info.name, "Mi tableta");
    assert.equal((await fetch(url + "/api/library", { headers: { cookie: one } })).status, 200);
    for (const endpoint of ["/api/library?name=x.txt", "/api/dashboard", "/api/installed/launch", "/api/remote/integrations"]) assert.equal((await fetch(url + endpoint, { method: "POST", headers: { cookie: one }, body: "{}" })).status, 403);
    assert.match(await (await fetch(url, { headers: { cookie: one } })).text(), /name="zenty-permission" content="read"/);
    await sharing.manage(devices[0].id, { revoke: true });
    assert.equal((await fetch(url + "/api/library", { headers: { cookie: one } })).status, 401);
    assert.equal((await fetch(url + "/api/library", { headers: { cookie: two } })).status, 200);
    assert.doesNotMatch(JSON.stringify(sharing.status()), /"hash"|zenty_lan=/);
  } finally { await cleanup(); }
});
