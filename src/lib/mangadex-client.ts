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

export const MANGA_LANGUAGES: LanguageOption[] = [
  { code: "es-all", label: "Español (Todos)", flag: "🇪🇸" },
  { code: "es-la", label: "Español (Latinoamérica)", flag: "🇲🇽" },
  { code: "es", label: "Español (España)", flag: "🇪🇸" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ja", label: "Japonés (日本語)", flag: "🇯🇵" },
  { code: "pt-br", label: "Português (Brasil)", flag: "🇧🇷" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "all", label: "Todos los idiomas", flag: "🌐" },
];

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
    throw new Error(errorBody.error || "No se pudo buscar mangas en MangaDex.");
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
    throw new Error(errorBody.error || "No se pudieron obtener los capítulos de este manga.");
  }
  return res.json();
}

export async function getChapterPages(chapterId: string): Promise<ChapterPagesResponse> {
  const res = await fetch(`/api/mangadex/chapter/${chapterId}/pages`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || "No se pudieron cargar las páginas de este capítulo.");
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
