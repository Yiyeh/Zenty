import { tr, getFormatLocale } from "./i18n.ts";
export type NewsCategory =
  | "all"
  | "tech"
  | "gaming"
  | "anime"
  | "science"
  | "culture"
  | "general"
  | "saved";

export interface NewsSourceInfo {
  id: string;
  name: string;
  siteUrl: string;
  feedUrl: string;
  category: NewsCategory;
  language: "es" | "en";
  color: string;
  enabled: boolean;
}

export interface NewsArticle {
  id: string;
  title: string;
  link: string;
  summary: string;
  publishedAt: string | null;
  source: {
    id: string;
    name: string;
    siteUrl?: string;
  };
  category: NewsCategory;
  imageUrl: string | null;
  tags: string[];
  readTimeMinutes: number;
}

export interface NewsFeedResponse {
  items: NewsArticle[];
  sources: NewsSourceInfo[];
  updatedAt: string;
  total: number;
  stale?: boolean;
  unavailableSources?: string[];
}

/** Discard unsafe links and malformed cached/provider data before rendering. */
export function normalizeNewsFeed(value: unknown): NewsFeedResponse {
  if (!value || typeof value !== "object")
    throw new Error(tr("news.288350b72b"));
  const feed = value as NewsFeedResponse;
  if (
    !Array.isArray(feed.items) ||
    !Array.isArray(feed.sources) ||
    !Number.isFinite(Date.parse(feed.updatedAt))
  )
    throw new Error(tr("news.288350b72b"));
  const webUrl = (url: unknown) => {
    if (typeof url !== "string") return false;
    try {
      const parsed = new URL(url);
      return (
        ["http:", "https:"].includes(parsed.protocol) &&
        !parsed.username &&
        !parsed.password
      );
    } catch {
      return false;
    }
  };
  const items = feed.items
    .slice(0, 500)
    .filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        webUrl(item.link) &&
        typeof item.summary === "string" &&
        item.source &&
        typeof item.source.id === "string" &&
        typeof item.source.name === "string" &&
        NEWS_CATEGORIES.some((category) => category.id === item.category),
    )
    .map((item) => ({
      ...item,
      imageUrl: webUrl(item.imageUrl) ? item.imageUrl : null,
      publishedAt: Number.isFinite(Date.parse(item.publishedAt || ""))
        ? item.publishedAt
        : null,
      tags: Array.isArray(item.tags)
        ? item.tags.filter((tag) => typeof tag === "string").slice(0, 12)
        : [],
    }));
  return {
    items,
    sources: feed.sources.filter(
      (source) =>
        source &&
        typeof source.id === "string" &&
        typeof source.name === "string" &&
        webUrl(source.siteUrl) &&
        /^#[a-f\d]{6}$/i.test(source.color),
    ),
    updatedAt: feed.updatedAt,
    total: Math.max(
      items.length,
      Number.isFinite(feed.total) ? feed.total : items.length,
    ),
    stale: feed.stale === true,
    unavailableSources: Array.isArray(feed.unavailableSources)
      ? feed.unavailableSources.filter((id) => typeof id === "string")
      : [],
  };
}

export const NEWS_CATEGORIES: {
  id: NewsCategory;
  label: string;
  description: string;
  color: string;
}[] = ([
  {
    id: "all",
    get label() { return tr("news.aff4d19d6e"); },
    get description() { return tr("news.edff70de39"); },
    color: "#6366f1",
  },
  {
    id: "tech",
    get label() { return tr("news.17c282eff9"); },
    get description() { return tr("news.91330426b7"); },
    color: "#3b82f6",
  },
  {
    id: "gaming",
    get label() { return tr("news.9bd45efffa"); },
    get description() { return tr("news.e45111e5b1"); },
    color: "#10b981",
  },
  {
    id: "anime",
    get label() { return tr("news.b52b15d2c3"); },
    get description() { return tr("news.1f326f74f0"); },
    color: "#f43f5e",
  },
  {
    id: "science",
    get label() { return tr("news.f8bb82bbd6"); },
    get description() { return tr("news.5c8c2c3c4f"); },
    color: "#8b5cf6",
  },
  {
    id: "culture",
    get label() { return tr("news.580480ed32"); },
    get description() { return tr("news.a98291395f"); },
    color: "#f59e0b",
  },
  {
    id: "general",
    get label() { return tr("news.43c6d4bb0a"); },
    get description() { return tr("news.a61e64f7ef"); },
    color: "#06b6d4",
  },
  {
    id: "saved",
    get label() { return tr("news.2a5c020df6"); },
    get description() { return tr("news.f040a3a67c"); },
    color: "#ec4899",
  },
]);

export const DEFAULT_PRESET_TAGS = [
  "Inteligencia Artificial",
  "PlayStation",
  "Nintendo",
  "PC Gaming",
  "Manga",
  "Anime",
  "Ciencia",
  "Hardware",
  "Smartphones",
  "Ciberseguridad",
  "Cine & Series",
  "Open Source",
];

export function parseNewsTags(
  input: string | string[] | undefined | null,
): string[] {
  if (!input) return [];
  const rawList = Array.isArray(input) ? input : input.split(/[,;\n]+/);
  return [
    ...new Set(
      rawList
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length <= 40),
    ),
  ];
}

export function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const time = Date.parse(dateStr);
  if (isNaN(time)) return "";
  const diffSec = Math.floor((Date.now() - time) / 1000);
  if (diffSec < 60) return tr("news.daf2008954");
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return new Intl.RelativeTimeFormat(getFormatLocale(), { numeric: "auto", style: "short" }).format(-diffMin, "minute");
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return new Intl.RelativeTimeFormat(getFormatLocale(), { numeric: "auto", style: "short" }).format(-diffHours, "hour");
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return new Intl.RelativeTimeFormat(getFormatLocale(), { numeric: "auto" }).format(-1, "day");
  if (diffDays < 7) return tr("news.42cb2d9105", { v0: diffDays });
  return new Date(time).toLocaleDateString(getFormatLocale(), {
    day: "numeric",
    month: "short",
  });
}

export function calculateReadTime(text: string): number {
  if (!text) return 2;
  const words = text.trim().split(/\s+/).length;
  // Average reading speed ~ 200 words per min
  const estimate = Math.ceil(words / 150);
  return Math.max(2, Math.min(10, estimate));
}

export function matchesKeyword(article: NewsArticle, keyword: string): boolean {
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const normKey = normalize(keyword.trim());
  if (!normKey) return true;

  const inTitle = normalize(article.title).includes(normKey);
  const inSummary = normalize(article.summary).includes(normKey);
  const inSource = normalize(article.source.name).includes(normKey);
  const inTags = article.tags.some((t) => normalize(t).includes(normKey));
  const inCategory = article.category.toLowerCase().includes(normKey);

  return inTitle || inSummary || inSource || inTags || inCategory;
}
