import { request } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startLocalServer } from "../server/local-server.ts";
import { defaultData } from "../src/lib/dashboard.ts";
test("sincronización: conserva copia de conflictos, permite descargarla y confirmar el aviso", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zenty-sync-")); const root = join(dir, "assets"); await mkdir(root); await writeFile(join(root, "index.html"), "<head></head>");
  const local = await startLocalServer({ root, dataDirectory: dir, port: 0 }); const url = local.url + "/api/dashboard", headers = { "X-MIA-Dashboard": "1", "Content-Type": "application/json" };
  try {
    const base = { ...structuredClone(defaultData), version: 2 }; await fetch(url, { method: "PUT", headers, body: JSON.stringify(base) });
    const pc = structuredClone(base); pc.settings.userName = "PC"; await fetch(url, { method: "PUT", headers, body: JSON.stringify(pc) });
    const phone = structuredClone(base); phone.settings.userName = "Móvil";
    const result = await (await fetch(url, { method: "PATCH", headers, body: JSON.stringify({ base, data: phone }) })).json();
    assert.equal(result.data.settings.userName, "Móvil"); assert.deepEqual(result.conflict.fields, ["settings.userName"]);
    const copy = await (await fetch(url + "/conflicts/" + result.conflict.id, { headers })).json(); assert.equal(copy.data.settings.userName, "PC");
    const before = await fetch(url, { headers }); const tag = before.headers.get("etag")!;
    await fetch(url + "/conflicts/" + result.conflict.id + "/ack", { method: "POST", headers });
    const after = await fetch(url, { headers: { ...headers, "If-None-Match": tag } }); assert.equal(after.status, 200); assert.equal((await after.json()).conflict, null);
    assert.equal((await fetch(url + "/conflicts/" + result.conflict.id)).status, 403);
    const seen = new Promise<void>(resolve => local.server.once("request", () => resolve()));
    const upload = request(local.url + "/api/library?name=slow.txt", { method: "POST", headers: { "X-MIA-Library": "1" } });
    const uploaded = new Promise<number>(resolve => upload.on("response", response => { response.resume(); response.on("end", () => resolve(response.statusCode!)); }));
    upload.write("primera parte"); await seen;
    let drained = false; const draining = local.pause().then(() => { drained = true; }); await new Promise(resolve => setImmediate(resolve)); assert.equal(drained, false);
    upload.end(" segunda parte"); assert.equal(await uploaded, 201); await draining;
    assert.equal((await fetch(url, { headers })).status, 423); local.resume(); assert.equal((await fetch(url, { headers })).status, 200);
  } finally { local.server.closeAllConnections(); await new Promise<void>(resolve => local.server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); }
});
