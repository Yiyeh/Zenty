export const launcherNames = {
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG",
  amazon: "Amazon Games",
  ubisoft: "Ubisoft Connect",
  ea: "EA app",
  battlenet: "Battle.net",
  xbox: "Xbox / Game Pass / Microsoft Store",
  riot: "Riot Games",
  manual: "Añadido por ti",
  emulator: "Emulador",
};
export type LauncherId = keyof typeof launcherNames;
export interface InstalledGame {
  id: string;
  title: string;
  launcher: LauncherId;
  installPath: string;
  image: string;
  steamId: string | null;
  emulatorId?: string;
  system?: string;
}
export interface EmulatorConfig {
  id: string;
  name: string;
  executable: string;
  folder: string;
  extensions: string[];
  args: string[];
  recursive: boolean;
  enabled: boolean;
}
export interface InstalledSnapshot {
  games: InstalledGame[];
  emulators: EmulatorConfig[];
  removed: { id: string; title: string }[];
  warnings: string[];
  scannedAt: string;
  durationMs: number;
  supported: boolean;
}
export interface GameMetadata {
  image: string;
  description: string;
  url: string;
  matchedTitle: string;
  genres: string[];
  source: string;
  fetchedAt: string;
}
export const emulatorPresets = [
  {
    name: "RetroArch",
    extensions: "nes,sfc,smc,gb,gbc,gba,md,gen,pce,zip",
    args: '["-L", "RUTA_AL_CORE.dll", "{rom}"]',
  },
  { name: "Dolphin", extensions: "iso,gcm,rvz,wbfs", args: '["-e", "{rom}"]' },
  { name: "PCSX2", extensions: "iso,chd,cso,bin", args: '["{rom}"]' },
  { name: "DuckStation", extensions: "cue,chd,pbp,m3u", args: '["{rom}"]' },
  { name: "PPSSPP", extensions: "iso,cso,pbp", args: '["{rom}"]' },
  {
    name: "Otro emulador",
    extensions: "nes,sfc,gba,nds,iso,chd,zip",
    args: '["{rom}"]',
  },
];
export function searchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export function createGameSearchIndex(
  items: InstalledGame[],
): Map<string, string> {
  return new Map(
    items.map((g) => [
      g.id,
      searchKey(`${g.title} ${launcherNames[g.launcher]} ${g.system || ""}`),
    ]),
  );
}
export function searchInstalled(
  items: InstalledGame[],
  query: string,
  index?: Map<string, string>,
): InstalledGame[] {
  const words = searchKey(query).split(/\s+/).filter(Boolean);
  return items.filter((g) => {
    const haystack =
      index?.get(g.id) ??
      searchKey(`${g.title} ${launcherNames[g.launcher]} ${g.system || ""}`);
    return words.every((w) => haystack.includes(w));
  });
}
