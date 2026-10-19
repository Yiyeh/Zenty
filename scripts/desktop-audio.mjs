import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, rename, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
export async function buildDesktopAudio() {
  if (process.platform !== "win32") return;
  const source = resolve("desktop/native-audio/AudioControl.cs");
  const output = resolve("desktop/native-audio/audio-helper.exe");
  const digest = createHash("sha256")
    .update(await readFile(source))
    .digest("hex");
  try {
    if ((await readFile(output + ".sha256", "utf8")) === digest) {
      await access(output);
      return;
    }
  } catch {
    /* Build first version. */
  }
  const temporary = output + ".next.exe";
  const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
  const command = `$ErrorActionPreference='Stop'; Add-Type -Path ${quote(source)} -OutputAssembly ${quote(temporary)} -OutputType ConsoleApplication`;
  await promisify(execFile)(
    join(
      process.env.SystemRoot || "C:/Windows",
      "System32/WindowsPowerShell/v1.0/powershell.exe",
    ),
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(command, "utf16le").toString("base64"),
    ],
    { windowsHide: true, timeout: 30000 },
  );
  await rename(temporary, output);
  await writeFile(output + ".sha256", digest);
}
