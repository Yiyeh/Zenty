import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { createAudioController } = createRequire(import.meta.url)(
  "../desktop/audio-controller.cjs",
);
test("audio local: solo procesos propios, sin shell y preferencias al reiniciar", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "zenty-audio-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls: {
    executable: string;
    args: string[];
    options: { windowsHide: boolean; timeout: number };
  }[] = [];
  const options = {
    executable: "audio-helper.exe",
    preferenceFile: join(directory, "audio.json"),
    getPids: () => [12, 12, 45, -1, NaN, "steam.exe"],
    run: async (
      executable: string,
      args: string[],
      options: { windowsHide: boolean; timeout: number },
    ) => {
      calls.push({ executable, args, options });
      return {
        stdout: JSON.stringify({
          ok: true,
          sessions: [
            { pid: 12, volume: args[0] === "read" ? 0.8 : Number(args[0]) },
          ],
        }),
      };
    },
  };
  const audio = createAudioController(options);
  assert.equal((await audio.get()).volume, 80);
  const changed = await audio.set({
    volume: 35,
    muted: false,
    pids: [999],
    command: "bad",
  });
  assert.equal(changed.volume, 35);
  assert.equal(changed.applied, true);
  assert.deepEqual(calls[1].args, ["0.35", "12,45"]);
  assert.equal(calls[1].options.windowsHide, true);
  assert.deepEqual(JSON.parse(await readFile(options.preferenceFile, "utf8")), {
    volume: 35,
    muted: false,
  });
  const restarted = createAudioController(options);
  assert.equal((await restarted.get()).volume, 35);
  await restarted.reapply();
  assert.equal(calls.at(-1)!.args[0], "0.35");
  await restarted.set({ volume: 35, muted: true });
  assert.equal(calls.at(-1)!.args[0], "0");
});
test("audio local: valida valores y conserva el último cambio cuando se arrastra rápido", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "zenty-audio-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const values: string[] = [];
  let release: (() => void) | undefined;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  let began: (() => void) | undefined;
  const started = new Promise<void>((done) => {
    began = done;
  });
  const audio = createAudioController({
    executable: "native.exe",
    preferenceFile: join(directory, "audio.json"),
    getPids: () => [12],
    run: async (_file: string, args: string[]) => {
      values.push(args[0]);
      if (values.length === 1) {
        began!();
        await gate;
      }
      return { stdout: '{"ok":true,"sessions":[]}' };
    },
  });
  for (const value of [
    { volume: -1, muted: false },
    { volume: 101, muted: false },
    { volume: NaN, muted: false },
    { volume: "20", muted: false },
    { volume: 20, muted: "yes" },
  ])
    await assert.rejects(audio.set(value));
  assert.equal(values.length, 0);
  const first = audio.set({ volume: 10, muted: false });
  await started;
  const updates = [20, 40, 60, 70].map((volume) =>
    audio.set({ volume, muted: false }),
  );
  await Promise.resolve();
  release!();
  await Promise.all([first, ...updates]);
  assert.deepEqual(values, ["0.1", "0.7"]);
  assert.deepEqual(
    JSON.parse(await readFile(join(directory, "audio.json"), "utf8")),
    { volume: 70, muted: false },
  );
});
