export type GameSource = "gamerpower" | "cheapshark" | "steam" | "manual";
export type GameKind = "game" | "loot" | "beta" | "deal" | "release";
export interface GameItem {
  id: string;
  title: string;
  source: GameSource;
  kind: GameKind;
  url: string;
  image: string;
  platforms: string[];
  description: string;
  instructions: string;
  endDate: string | null;
  releaseDate: string | null;
  releaseLabel: string;
  comingSoon: boolean;
  demo: boolean;
  price: number | null;
  regularPrice: number | null;
  discount: number;
  store: string;
}
export type GameStatus = "pending" | "playing" | "completed" | "claimed";
export interface SavedGame {
  id: string;
  game: GameItem;
  status: GameStatus;
  note: string;
  addedAt: string;
}
export interface GamingFeed {
  items: GameItem[];
  updatedAt: string | null;
  stale: boolean;
  warning: string;
}
export const gameStatuses: Record<GameStatus, string> = {
  pending: "Pendiente",
  playing: "Jugando",
  completed: "Terminado",
  claimed: "Reclamado",
};
export const platformOptions = [
  "PC",
  "Steam",
  "Epic Games Store",
  "GOG",
  "PlayStation",
  "Xbox",
  "Nintendo",
  "Android",
  "iOS",
];
export const sourceNames = {
  gamerpower: "GamerPower",
  cheapshark: "CheapShark",
  steam: "Steam",
  manual: "Añadido por ti",
};
export const kindNames: Record<GameKind, string> = {
  game: "Juego completo",
  loot: "DLC / contenido",
  beta: "Beta / prueba",
  deal: "Oferta",
  release: "Lanzamiento",
};
export function httpsUrl(value: unknown, hosts?: string[]): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!hosts || hosts.includes(url.hostname))
      ? url.href
      : "";
  } catch {
    return "";
  }
}
/** Keep the original HTTPS URL in backups; resolve displayed art through the persistent local cache. */
export function cachedGameImage(value: string): string {
  const url = httpsUrl(value);
  return url ? `/api/game-assets/image?url=${encodeURIComponent(url)}` : "";
}
export function dateOnly(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(day)) &&
    new Date(day).toISOString().slice(0, 10) === day
    ? day
    : null;
}
export function matchesPlatform(game: GameItem, selected: string): boolean {
  if (selected === "all") return true;
  const aliases: Record<string, RegExp> = {
    PC: /pc|steam|epic|gog|itch|drm/i,
    PlayStation: /playstation|ps[45]/i,
    Xbox: /xbox/i,
    Nintendo: /switch|nintendo/i,
  };
  return game.platforms.some((p) =>
    aliases[selected]
      ? aliases[selected].test(p)
      : p.toLowerCase() === selected.toLowerCase(),
  );
}
/** The provider does not publish a timezone. Only consider it expired after that date everywhere. */
export function giveawayExpired(game: GameItem, now = Date.now()): boolean {
  return !!game.endDate && Date.parse(`${game.endDate}T23:59:59-12:00`) < now;
}
export function displayGameDate(value: string | null): string {
  return value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("es-CL", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Sin fecha anunciada";
}
export function emptyGame(overrides: Partial<GameItem> = {}): GameItem {
  return {
    id: "",
    title: "",
    source: "manual",
    kind: "game",
    url: "",
    image: "",
    platforms: ["PC"],
    description: "",
    instructions: "",
    endDate: null,
    releaseDate: null,
    releaseLabel: "",
    comingSoon: false,
    demo: false,
    price: null,
    regularPrice: null,
    discount: 0,
    store: "",
    ...overrides,
  };
}
export function localGameFavorite(game: GameItem): boolean {
  return (
    game.source === "manual" &&
    /^(steam|epic|gog|amazon|ubisoft|ea|battlenet|xbox|riot|local|rom-[a-f\d-]+):/.test(
      game.id,
    )
  );
}
export function validSavedGame(value: unknown): value is SavedGame {
  if (!value || typeof value !== "object") return false;
  const saved = value as SavedGame;
  const g = saved.game;
  return (
    typeof saved.id === "string" &&
    saved.id.length > 0 &&
    saved.id === g?.id &&
    Object.hasOwn(gameStatuses, saved.status) &&
    typeof saved.note === "string" &&
    saved.note.length <= 5000 &&
    typeof saved.addedAt === "string" &&
    Number.isFinite(Date.parse(saved.addedAt)) &&
    typeof g.title === "string" &&
    g.title.length > 0 &&
    g.title.length <= 500 &&
    Object.hasOwn(sourceNames, g.source) &&
    Object.hasOwn(kindNames, g.kind) &&
    (g.url === "" || !!httpsUrl(g.url)) &&
    (g.image === "" || !!httpsUrl(g.image)) &&
    Array.isArray(g.platforms) &&
    g.platforms.length <= 20 &&
    g.platforms.every((p) => typeof p === "string" && p.length <= 100) &&
    [g.description, g.instructions, g.releaseLabel, g.store].every(
      (s) => typeof s === "string" && s.length <= 20_000,
    ) &&
    (g.endDate === null || dateOnly(g.endDate) === g.endDate) &&
    (g.releaseDate === null || dateOnly(g.releaseDate) === g.releaseDate) &&
    typeof g.comingSoon === "boolean" &&
    typeof g.demo === "boolean" &&
    [g.price, g.regularPrice].every(
      (n) =>
        n === null || (typeof n === "number" && Number.isFinite(n) && n >= 0),
    ) &&
    typeof g.discount === "number" &&
    Number.isFinite(g.discount) &&
    g.discount >= 0 &&
    g.discount <= 100
  );
}
