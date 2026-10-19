const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("node:fs/promises");
const path = require("node:path");
function validAudioPreference(value) {
  return (
    value &&
    typeof value.volume === "number" &&
    Number.isFinite(value.volume) &&
    value.volume >= 0 &&
    value.volume <= 100 &&
    typeof value.muted === "boolean"
  );
}
function createAudioController({
  executable,
  preferenceFile,
  getPids,
  run = promisify(execFile),
}) {
  let preference = { volume: 100, muted: false },
    saved = false,
    revision = 0,
    running,
    applied = false;
  const ready = fs
    .readFile(preferenceFile, "utf8")
    .then((raw) => {
      const data = JSON.parse(raw);
      if (validAudioPreference(data)) {
        preference = data;
        saved = true;
      }
    })
    .catch(() => {});
  const snapshot = () => ({ supported: true, ...preference, applied });
  async function invoke(level) {
    const ids = [
      ...new Set(getPids().filter((id) => Number.isSafeInteger(id) && id > 0)),
    ];
    if (!ids.length)
      throw new Error(
        "No se encontraron los procesos de audio de la aplicación.",
      );
    const result = await run(executable, [level, ids.join(",")], {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 32768,
    });
    const body = JSON.parse(result.stdout);
    if (!body.ok || !Array.isArray(body.sessions))
      throw new Error("Windows no pudo ajustar el audio de la aplicación.");
    return body.sessions;
  }
  function flush() {
    if (running) return running;
    running = (async () => {
      await ready;
      for (;;) {
        const current = revision;
        const selected = { ...preference };
        const sessions = await invoke(
          String(selected.muted ? 0 : selected.volume / 100),
        );
        applied = sessions.length > 0;
        if (current !== revision) continue;
        await fs.mkdir(path.dirname(preferenceFile), { recursive: true });
        const temporary = preferenceFile + ".tmp";
        await fs.writeFile(temporary, JSON.stringify(selected));
        await fs.rename(temporary, preferenceFile);
        if (current === revision) return snapshot();
      }
    })().finally(() => {
      running = null;
    });
    return running;
  }
  return {
    async get() {
      await ready;
      if (running) return running;
      const sessions = await invoke("read");
      applied = sessions.length > 0;
      if (!saved && sessions.length && Number.isFinite(sessions[0].volume))
        preference = {
          volume: Math.round(
            Math.max(0, Math.min(1, sessions[0].volume)) * 100,
          ),
          muted: false,
        };
      return snapshot();
    },
    async set(value) {
      if (!validAudioPreference(value))
        throw new Error("El volumen debe estar entre 0 y 100.");
      await ready;
      preference = { volume: Math.round(value.volume), muted: value.muted };
      saved = true;
      revision++;
      return flush();
    },
    async reapply() {
      await ready;
      if (saved) {
        revision++;
        return flush();
      }
      return snapshot();
    },
  };
}
module.exports = { createAudioController, validAudioPreference };
