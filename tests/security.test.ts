import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { startLocalServer } from "../server/local-server.ts";
const { createPinSecurity } = createRequire(import.meta.url)("../desktop/pin-security.cjs");

test("PIN: opcional, hash con sal, reinicio bloqueado, cambio y recuperación sin perder datos", async t => {
  const root = await mkdtemp(join(tmpdir(), "zenty-pin-")); t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, "security", "pin.json");
  const security = await createPinSecurity(file);
  assert.equal(security.state().enabled, false);
  assert.equal(security.isLocked(), false);
  await assert.rejects(security.configure("", "123"), /invalid/);
  const first = await security.configure("", "083927");
  assert.match(first.recovery, /^[a-f0-9]{32}$/);
  const raw = await readFile(file, "utf8");
  assert.ok(!raw.includes("083927") && !raw.includes(first.recovery));
  const restarted = await createPinSecurity(file);
  assert.equal(restarted.isLocked(), true);
  await assert.rejects(restarted.unlock("000000"), /incorrect/);
  await assert.rejects(restarted.configure("083927", "928374"), /locked/);
  await restarted.unlock("083927");
  await assert.rejects(restarted.disable("000000"), /incorrect/);
  const second = await restarted.configure("083927", "928374");
  assert.notEqual(second.recovery, first.recovery);
  await restarted.lock();
  await assert.rejects(restarted.recover(first.recovery), /incorrect/);
  await restarted.recover(second.recovery);
  assert.equal(restarted.isLocked(), false);
  assert.equal((await createPinSecurity(file)).state().enabled, false);
});

test("PIN: limita intentos incluso al reiniciar y un archivo corrupto mantiene el bloqueo", async t => {
  const root = await mkdtemp(join(tmpdir(), "zenty-pin-rate-")); t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, "pin.json"); let time = 10000;
  const security = await createPinSecurity(file, { now: () => time });
  await security.configure("", "938271"); await security.lock();
  for (let i = 0; i < 5; i++) await assert.rejects(security.unlock("111111"), /incorrect/);
  assert.equal(security.state().retryAfter, 30);
  const restarted = await createPinSecurity(file, { now: () => time });
  await assert.rejects(restarted.unlock("938271"), /wait/);
  time += 30001;
  await restarted.unlock("938271");
  assert.equal(restarted.state().retryAfter, 0);
  await writeFile(file, "{corrupt");
  const damaged = await createPinSecurity(file);
  assert.equal(damaged.isLocked(), true); assert.equal(damaged.state().damaged, true);
  await assert.rejects(damaged.unlock("938271"), /damaged/);
});

test("PIN: bloquear el perfil impide leer y escribir por HTTP, desbloquear recupera la biblioteca", async t => {
  const root = await mkdtemp(join(tmpdir(), "zenty-pin-http-")); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "dist")); await writeFile(join(root, "dist/index.html"), "<html></html>");
  let locked = true;
  const local = await startLocalServer({ root: join(root, "dist"), dataDirectory: root, port: 0, isLocked: () => locked });
  t.after(() => new Promise<void>(resolve => local.server.close(() => resolve())));
  for (const endpoint of ["/api/library", "/api/dashboard", "/api/installed/snapshot", "/api/news"]) {
    assert.equal((await fetch(local.url + endpoint)).status, 423);
    assert.equal((await fetch(local.url + endpoint, { method: "POST", body: "{}" })).status, 423);
  }
  assert.equal((await fetch(local.url)).status, 200);
  locked = false;
  assert.equal((await fetch(local.url + "/api/dashboard", { headers: { "X-MIA-Dashboard": "1" } })).status, 200);
});
