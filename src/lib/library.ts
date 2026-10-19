export type DocumentFormat =
  | "pdf"
  | "docx"
  | "epub"
  | "cbz"
  | "txt"
  | "md"
  | "jpg"
  | "jpeg"
  | "png"
  | "webp"
  | "manga";
export const allowedFormats: DocumentFormat[] = [
  "pdf",
  "docx",
  "epub",
  "cbz",
  "txt",
  "md",
  "jpg",
  "jpeg",
  "png",
  "webp",
];
export const MAX_DOCUMENT_BYTES = 150 * 1024 * 1024;
export interface ReadingPosition {
  unit: number;
  anchor: number;
  fraction: number;
  progress: number;
}
export interface ReaderPreferences {
  theme: "paper" | "sepia" | "night";
  fontSize: number;
  lineHeight: number;
  width: number;
  font: "serif" | "sans";
  zoom: number;
  brightness: number;
  rtl: boolean;
  fit: "width" | "page";
}
export const readerDefaults: ReaderPreferences = {
  theme: "sepia",
  fontSize: 19,
  lineHeight: 1.85,
  width: 740,
  font: "serif",
  zoom: 1,
  brightness: 1,
  rtl: false,
  fit: "width",
};
export interface MangaMetadata {
  mangadexId: string;
  coverUrl?: string;
  lastPagePreviewUrl?: string;
  language: string;
  description?: string;
  author?: string;
  status?: string;
  currentChapterId?: string;
  currentChapterNumber?: string;
  currentChapterTitle?: string;
  chapterIndex?: number;
  pageIndex?: number;
  totalPages?: number;
}
export interface LibraryDocument {
  author?: string;
  collection?: string;
  tags?: string[];
  series?: string;
  volume?: string;
  preferences?: ReaderPreferences;
  mangaPreferences?: Record<string, string | number | boolean>;
  id: string;
  name: string;
  title: string;
  format: DocumentFormat;
  size: number;
  hash: string;
  addedAt: string;
  lastReadAt: string | null;
  deletedAt: string | null;
  favorite: boolean;
  totalUnits: number;
  position: ReadingPosition;
  bookmarks: {
    id: string;
    label: string;
    position: ReadingPosition;
    createdAt: string;
  }[];
  manga?: MangaMetadata;
}
export interface LibraryState {
  version: 1;
  documents: LibraryDocument[];
  preferences: ReaderPreferences;
}
export function documentFormat(name: string): DocumentFormat | null {
  const ext = name.split(".").at(-1)?.toLowerCase();
  return allowedFormats.includes(ext as DocumentFormat)
    ? (ext as DocumentFormat)
    : null;
}
export function clampPosition(value: unknown): ReadingPosition {
  const p =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const number = (key: string, max: number) =>
    typeof p[key] === "number" && Number.isFinite(p[key])
      ? Math.max(0, Math.min(max, p[key] as number))
      : 0;
  return {
    unit: Math.floor(number("unit", 100000)),
    anchor: Math.floor(number("anchor", 1000000)),
    fraction: number("fraction", 1),
    progress: number("progress", 1),
  };
}
export function normalizeReaderPreferences(input: unknown): ReaderPreferences {
  const p =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const result = { ...readerDefaults };
  for (const [key, min, max] of [
    ["fontSize", 14, 32],
    ["lineHeight", 1.3, 2.5],
    ["width", 440, 1200],
    ["zoom", 0.5, 3],
    ["brightness", 0.55, 1],
  ] as const)
    if (typeof p[key] === "number" && Number.isFinite(p[key]))
      result[key] = Math.min(max, Math.max(min, p[key] as number));
  if (["paper", "sepia", "night"].includes(String(p.theme)))
    result.theme = p.theme as ReaderPreferences["theme"];
  if (p.font === "sans") result.font = "sans";
  if (p.font === "serif") result.font = "serif";
  if (typeof p.rtl === "boolean") result.rtl = p.rtl;
  if (p.fit === "width" || p.fit === "page") result.fit = p.fit;
  return result;
}
/** Resolve archive references without allowing remote URLs or paths outside the archive. */
export function archivePath(base: string, href: string): string | null {
  try {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href) || href.startsWith("/"))
      return null;
    const segments = base.split("/").slice(0, -1);
    for (const piece of decodeURIComponent(href.split(/[?#]/)[0]).split("/")) {
      if (!piece || piece === ".") continue;
      if (piece === "..") {
        if (!segments.length) return null;
        segments.pop();
      } else {
        if (piece.includes("\\") || piece.includes("\0")) return null;
        segments.push(piece);
      }
    }
    return segments.join("/");
  } catch {
    return null;
  }
}
export function naturalPageSort(names: string[]): string[] {
  return [...names].sort((a, b) =>
    a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }),
  );
}
