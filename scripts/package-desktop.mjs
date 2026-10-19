import { packager } from "@electron/packager";
import {
  cp,
  mkdir,
  mkdtemp,
  writeFile,
  rm,
  rename,
  access,
  readFile,
} from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { APP_NAME, APP_SLUG, APP_ID } from "../src/lib/brand.ts";
const project = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const cache = resolve("node_modules/.cache");
const target = resolve("releases", APP_NAME);
if (
  target === resolve("releases") ||
  !target.startsWith(resolve("releases") + sep) ||
  !APP_NAME.trim() ||
  APP_NAME.length > 64 ||
  /[. ]$/.test(APP_NAME) ||
  /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(APP_NAME) ||
  /[<>:"/\\|?*]/.test(APP_NAME) ||
  [...APP_NAME].some((character) => character.charCodeAt(0) < 32)
)
  throw new Error("APP_NAME debe ser un nombre válido de carpeta de Windows.");
await mkdir(cache, { recursive: true });
const staging = await mkdtemp(join(cache, "zenty-package-"));
const packageOutput = await mkdtemp(join(cache, "zenty-output-"));
try {
  for (const folder of ["desktop", "desktop-server", "dist"])
    await cp(resolve(folder), join(staging, folder), { recursive: true });
  await writeFile(
    join(staging, "package.json"),
    JSON.stringify({
      name: `${APP_SLUG}-personal`,
      productName: APP_NAME,
      version: project.version,
      description: "Tu espacio personal de escritorio",
      main: "desktop/main.cjs",
      private: true,
    }),
  );
  const output = await packager({
    dir: staging,
    name: APP_NAME,
    platform: "win32",
    arch: "x64",
    electronVersion: "44.9.0",
    out: packageOutput,
    asar: { unpack: "**/native-audio/audio-helper.exe" },
    icon: resolve("desktop/icon.ico"),
    prune: false,
    overwrite: true,
    appBundleId: APP_ID,
    win32metadata: {
      ProductName: APP_NAME,
      FileDescription: `${APP_NAME} · Tu espacio personal`,
      CompanyName: APP_NAME,
    },
  });
  await mkdir(resolve("releases"), { recursive: true });
  let previous;
  try {
    await access(target);
    previous = join(
      resolve("releases", ".previous"),
      `${APP_NAME}-${Date.now()}`,
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let copiedInPlace = false;
  if (previous) {
    await mkdir(resolve("releases", ".previous"), { recursive: true });
    try {
      await rename(target, previous);
    } catch (error) {
      if (!["EPERM", "EBUSY"].includes(error.code)) throw error;
      // Windows may keep a directory handle after the app has closed.
      // Preserve a full snapshot before replacing files in that directory.
      await cp(target, previous, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
      try {
        await cp(output[0], target, { recursive: true, force: true });
      } catch (copyError) {
        await cp(previous, target, { recursive: true, force: true });
        throw copyError;
      }
      copiedInPlace = true;
    }
  }
  if (!copiedInPlace) {
    try {
      await rename(output[0], target);
    } catch (error) {
      if (previous) await rename(previous, target);
      throw error;
    }
  }
  process.stdout.write(join(target, `${APP_NAME}.exe`) + "\n");
} finally {
  for (const temporary of [staging, packageOutput]) {
    const actual = resolve(temporary);
    if (
      actual.startsWith(cache + sep) &&
      /^(zenty-package-|zenty-output-)/.test(actual.split(sep).at(-1))
    )
      await rm(actual, { recursive: true, force: true });
  }
}
