import { readFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { APP_NAME } from "../src/lib/brand.ts";
export async function verifyRelease(directory, version) {
  const filename = `${APP_NAME}-Setup-${version}.exe`;
  const [binary, manifest] = await Promise.all([readFile(join(directory, filename)), readFile(join(directory, "latest.yml"), "utf8")]);
  const expectedHash = manifest.match(/^sha512:\s*([^\s]+)\s*$/m)?.[1];
  const expectedVersion = manifest.match(/^version:\s*([^\s]+)\s*$/m)?.[1];
  if (expectedVersion !== version || !manifest.includes(filename) || !expectedHash || createHash("sha512").update(binary).digest("base64") !== expectedHash)
    throw new Error("Release metadata does not match the installer");
  const blockmap = await readFile(join(directory, filename + ".blockmap"));
  if (!blockmap.length) throw new Error("Missing update blockmap");
  return [filename, filename + ".blockmap", "latest.yml"];
}
async function publish() {
  const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const tag = `v${version}`, repository = "Yiyeh/Zenty", directory = resolve("releases/Zenty-Installer");
  if (process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME !== tag) throw new Error("Tag and package version must match");
  const files = await verifyRelease(directory, version);
  await copyFile("public/favicon.ico", join(directory, `${APP_NAME}.ico`)); files.push(`${APP_NAME}.ico`);
  const run = promisify(execFile);
  const gh = async (...args) => (await run("gh", [...args, "--repo", repository], { windowsHide: true })).stdout.trim();
  let release;
  try { release = JSON.parse(await gh("release", "view", tag, "--json", "isDraft,assets")); }
  catch (error) { if (!String(error.stderr).includes("release not found")) throw error; }
  if (release && !release.isDraft) throw new Error("This version is already public; increment package.json instead of replacing it");
  if (!release) await gh("release", "create", tag, "--verify-tag", "--draft", "--title", `${APP_NAME} ${version}`, "--generate-notes");
  // One draft, sequential uploads, verify the complete asset set, then make it public.
  for (const file of files) await gh("release", "upload", tag, join(directory, file), "--clobber");
  release = JSON.parse(await gh("release", "view", tag, "--json", "isDraft,assets"));
  if (!release.isDraft || files.some(file => !release.assets.some(asset => asset.name === file && asset.state === "uploaded"))) throw new Error("Release assets are incomplete");
  await gh("release", "edit", tag, "--draft=false");
  console.log(`Published ${repository} ${tag} with verified update metadata.`);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await publish();
