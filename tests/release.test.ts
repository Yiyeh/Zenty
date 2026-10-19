import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
// @ts-expect-error Build script is JavaScript and is exercised directly by Node.
import { verifyRelease } from "../scripts/publish-release.mjs";
test("publicación: el instalador, versión y SHA-512 deben coincidir antes de publicar", async t => {
  const root = await mkdtemp(join(tmpdir(), "zenty-release-")); t.after(() => rm(root, { recursive: true, force: true }));
  const filename = "Zenty-Setup-1.0.0.exe", binary = Buffer.from("MZ fake installer fixture");
  await writeFile(join(root, filename), binary); await writeFile(join(root, filename + ".blockmap"), "fixture");
  await writeFile(join(root, "latest.yml"), `version: 1.0.0\npath: ${filename}\nsha512: ${createHash("sha512").update(binary).digest("base64")}\n`);
  assert.equal((await verifyRelease(root, "1.0.0")).length, 3);
  await writeFile(join(root, filename), "modified installer");
  await assert.rejects(verifyRelease(root, "1.0.0"), /does not match/);
});
