import { tr } from "./i18n.ts";
import type { LibraryDocument } from "./library.ts";
import { libraryRequest } from "./library-client.ts";

export interface MangaSearchResult {
  id: string;
  title: string;
  altTitle?: string;
  description: string;
  coverUrl: string | null;
  coverThumb: string | null;
  status?: string;
  year?: number;
  contentRating?: string;
  availableLanguages: string[];
  tags: string[];
  author?: string;
}

export interface MangaChapter {
  id: string;
  chapter: string;
  volume: string | null;
  title: string;
  pages: number;
  language: string;
  publishAt: string;
  externalUrl: string | null;
  isExternal: boolean;
  scanlationGroup: string | null;
}

export interface ChapterPagesResponse {
  chapterId: string;
  baseUrl: string;
  hash: string;
  pages: string[];
  pagesDataSaver: string[];
  totalPages: number;
}

export interface LanguageOption {
  code: string;
  label: string;
  flag: string;
}

export const MANGA_LANGUAGES: LanguageOption[] = ([
  { code: "es-all", get label() { return tr("mangadex_client.9d0bb303f3"); }, flag: "🇪🇸" },
  { code: "es-la", get label() { return tr("mangadex_client.2781d74cee"); }, flag: "🇲🇽" },
  { code: "es", get label() { return tr("mangadex_client.d3b018a72f"); }, flag: "🇪🇸" },
  { code: "en", get label() { return tr("mangadex_client.ba118bf7fc"); }, flag: "🇬🇧" },
  { code: "ja", get label() { return tr("mangadex_client.165eab2ae6"); }, flag: "🇯🇵" },
  { code: "pt-br", get label() { return tr("mangadex_client.25c0623b1a"); }, flag: "🇧🇷" },
  { code: "fr", get label() { return tr("mangadex_client.e495d53b96"); }, flag: "🇫🇷" },
  { code: "it", get label() { return tr("mangadex_client.432a99a172"); }, flag: "🇮🇹" },
  { code: "de", get label() { return tr("mangadex_client.801cfe0fa1"); }, flag: "🇩🇪" },
  { code: "all", get label() { return tr("mangadex_client.9dc0bf86c4"); }, flag: "🌐" },
]);

export async function searchManga(
  query = "",
  lang = "es-all",
  limit = 20,
  offset = 0,
): Promise<{ results: MangaSearchResult[]; total: number; offset: number; limit: number }> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (lang) params.set("lang", lang);
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const res = await fetch(`/api/mangadex/search?${params.toString()}`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || tr("mangadex_client.cf48d3a374"));
  }
  return res.json();
}

export async function getMangaChapters(
  mangaId: string,
  lang = "es-all",
): Promise<{ chapters: MangaChapter[]; total: number }> {
  const params = new URLSearchParams();
  if (lang) params.set("lang", lang);

  const res = await fetch(`/api/mangadex/manga/${mangaId}/chapters?${params.toString()}`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || tr("mangadex_client.5381f57374"));
  }
  return res.json();
}

export async function getChapterPages(chapterId: string): Promise<ChapterPagesResponse> {
  const res = await fetch(`/api/mangadex/chapter/${chapterId}/pages`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || tr("mangadex_client.86cd24d4e3"));
  }
  return res.json();
}

export async function addMangaToLibrary(
  manga: MangaSearchResult,
  language = "es-all",
  totalChapters = 0,
): Promise<{ document: LibraryDocument; duplicate: boolean }> {
  return libraryRequest<{ document: LibraryDocument; duplicate: boolean }>("/manga", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mangadexId: manga.id,
      title: manga.title,
      coverUrl: manga.coverUrl || manga.coverThumb || "",
      language,
      description: manga.description,
      author: manga.author,
      status: manga.status,
      totalChapters,
    }),
  });
}
