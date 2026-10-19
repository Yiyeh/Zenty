import { APP_NAME } from "./brand.ts";
import spanish from "../locales/es/index.ts";
export const languages = [
  { id: "es", name: "Español", format: "es-ES" },
  { id: "en", name: "English", format: "en-US" },
  { id: "pt", name: "Português", format: "pt-BR" },
  { id: "fr", name: "Français", format: "fr-FR" },
  { id: "de", name: "Deutsch", format: "de-DE" },
  { id: "it", name: "Italiano", format: "it-IT" },
  { id: "ja", name: "日本語", format: "ja-JP" },
  { id: "zh", name: "简体中文", format: "zh-CN" },
  { id: "ko", name: "한국어", format: "ko-KR" },
] as const;
export type Language = typeof languages[number]["id"];
type Catalog = Record<string, string>;
const base: Catalog = spanish;
const catalogs: Partial<Record<Language, Catalog>> = { es: base };
const loaders = {
  en: () => import("../locales/en/index.ts"),
  pt: () => import("../locales/pt/index.ts"),
  fr: () => import("../locales/fr/index.ts"),
  de: () => import("../locales/de/index.ts"),
  it: () => import("../locales/it/index.ts"),
  ja: () => import("../locales/ja/index.ts"),
  zh: () => import("../locales/zh/index.ts"),
  ko: () => import("../locales/ko/index.ts"),
};
let language: Language = "es", requested = 0;
const listeners = new Set<() => void>();
export const validLanguage = (value: unknown): value is Language => languages.some(item => item.id === value);
export const getLocale = () => language;
export const getFormatLocale = () => languages.find(item => item.id === language)!.format;
export const subscribeLocale = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export async function setLocale(value: Language) {
  if (!validLanguage(value)) return;
  const revision = ++requested;
  if (!catalogs[value]) catalogs[value] = (await loaders[value as keyof typeof loaders]()).default;
  if (revision !== requested) return;
  language = value;
  if (typeof document !== "undefined") {
    document.documentElement.lang = value;
    document.title = tr("app.title", { app: APP_NAME });
    document.querySelector('meta[name="description"]')?.setAttribute("content", tr("app.description", { app: APP_NAME }));
    try { localStorage.setItem("zenty.locale", value); } catch { /* Persistence may be unavailable in a browser. */ }
    void (window as Window & { zentyDesktop?: { setLocale?: (language: string) => Promise<void> } }).zentyDesktop?.setLocale?.(value).catch(() => {});
  }
  listeners.forEach(listener => listener());
}
export async function initializeLocale() {
  let value: string = "es";
  try { value = localStorage.getItem("zenty.locale") || navigator.language.split("-")[0]; } catch { /* Use Spanish fallback. */ }
  await setLocale(validLanguage(value) ? value : "es").catch(() => setLocale("es"));
}
export function tr(key: string, values: Record<string, string | number | undefined | null> = {}): string {
  values = { app: APP_NAME, ...values };
  const count = values.count;
  const form = typeof count === "number" ? new Intl.PluralRules(getFormatLocale()).select(count) : null;
  const catalog = catalogs[language] || base;
  const message = (form && catalog[`${key}.${form}`]) || catalog[key] || (form && base[`${key}.${form}`]) || base[key] || key;
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) => Object.hasOwn(values, name) ? String(values[name] ?? "") : placeholder);
}
const sourceKeys = new Map(Object.entries(base).map(([key, value]) => [value, key]));
/** Translate server/native messages at the presentation boundary; never user documents. */
export function translateMessage(value: string): string {
  if (Object.hasOwn(base, value)) return tr(value);
  const key = sourceKeys.get(value);
  if (key) return tr(key);
  for (const catalog of Object.values(catalogs)) {
    const entry = Object.entries(catalog).find(([, message]) => message === value);
    if (entry) { sourceKeys.set(value, entry[0]); return tr(entry[0]); }
  }
  return value;
}
