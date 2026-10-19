import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { tr } from "../lib/i18n.ts";
import { newId } from "../lib/id";
import { useState } from "react";
import {
  Newspaper,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  RefreshCw,
} from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
import { useNewsFeed } from "../lib/news-client";
import { NEWS_CATEGORIES, formatRelativeTime } from "../lib/news";
import type { DashboardSettings } from "../lib/dashboard";
export function NewsWidget({ onOpen }: { onOpen?: () => void }) {
  useInterfaceLocale();
  const { bookmarks, setBookmarks, settings, setSettings, notify } =
    useDashboard();
  const { articles, loading, refreshing, error, stale, refresh } =
    useNewsFeed();
  const [tab, setTab] = useState<"headlines" | "saved">("headlines");
  const saved = bookmarks.filter((item) => item.group === "Para leer");
  const category = settings.newsWidgetCategory;
  const headlines = articles
    .filter((article) => category === "all" || article.category === category)
    .slice(0, 4);
  const items =
    tab === "saved"
      ? saved
          .slice(-4)
          .reverse()
          .map((item) => ({
            id: item.id,
            title: item.title,
            link: item.url,
            source: { name: new URL(item.url).hostname },
            publishedAt: null,
          }))
      : headlines;
  return (
    <section
      className="glass-panel news-widget"
      aria-label={tr("NewsWidget.ca7df519b6")}
    >
      <div className="widget-heading">
        <h3>
          <Newspaper size={17} /> {tr("NewsWidget.2039b01649")}</h3>
        <select
          aria-label={tr("NewsWidget.da0ff3eca9")}
          value={category}
          onChange={(event) =>
            setSettings((previous) => ({
              ...previous,
              newsWidgetCategory: event.target
                .value as DashboardSettings["newsWidgetCategory"],
            }))
          }
        >
          {NEWS_CATEGORIES.filter((item) => item.id !== "saved").map((item) => (
            <option key={item.id} value={item.id}>
              {item.id === "all" ? tr("NewsWidget.59abf9d784") : item.label}
            </option>
          ))}
        </select>
      </div>
      <div
        className="news-widget-tabs"
        role="group"
        aria-label={tr("NewsWidget.42f53808b2")}
      >
        <button
          aria-pressed={tab === "headlines"}
          onClick={() => setTab("headlines")}
        >
          {tr("NewsWidget.e1c983199e")}</button>
        <button aria-pressed={tab === "saved"} onClick={() => setTab("saved")}>
          {tr("NewsWidget.2a5c020df6")}{saved.length ? ` · ${saved.length}` : ""}
        </button>
      </div>
      {tab === "headlines" && (error || stale) && (
        <p className="news-widget-status" role="status">
          {articles.length
            ? tr("NewsWidget.1e57db5e7a")
            : error}
        </p>
      )}
      {items.length ? (
        <ul className="news-widget-list">
          {items.map((item) => {
            const isSaved = saved.some(
              (bookmark) => bookmark.url === item.link,
            );
            return (
              <li key={item.id}>
                <a
                  href={item.link}
                  target={settings.openInNewTab ? "_blank" : "_self"}
                  rel="noreferrer"
                >
                  <small>
                    {item.source.name}
                    {item.publishedAt
                      ? ` · ${formatRelativeTime(item.publishedAt)}`
                      : ""}
                  </small>
                  <strong>{item.title}</strong>
                </a>
                <button
                  className="icon-button"
                  aria-label={`${isSaved ? tr("NewsWidget.2660cdca46") : tr("NewsWidget.9ded631acf")}: ${item.title}`}
                  aria-pressed={isSaved}
                  onClick={() => {
                    setBookmarks((previous) =>
                      isSaved
                        ? previous.filter(
                            (bookmark) =>
                              !(
                                bookmark.group === "Para leer" &&
                                bookmark.url === item.link
                              ),
                          )
                        : [
                            ...previous,
                            {
                              id: newId(),
                              title: item.title,
                              url: item.link,
                              group: tr("NewsWidget.79cc9d2c71"),
                              color: settings.accentColor,
                            },
                          ],
                    );
                    notify(
                      isSaved
                        ? "Noticia quitada de guardados."
                        : tr("NewsWidget.634ed7caf6"),
                    );
                  }}
                >
                  {isSaved ? (
                    <BookmarkCheck size={16} />
                  ) : (
                    <Bookmark size={16} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="news-widget-empty" role="status">
          {tab === "saved"
            ? tr("NewsWidget.ab3a550d97")
            : loading
              ? tr("NewsWidget.80a216b369")
              : tr("NewsWidget.28ec908258")}
        </p>
      )}
      <div className="news-widget-footer">
        {onOpen && (
          <button className="text-button" onClick={onOpen}>
            {tr("NewsWidget.a47840eb96")}<ArrowUpRight size={14} />
          </button>
        )}
        <button
          className="icon-button"
          aria-label={tr("NewsWidget.b9a0a4a5c7")}
          disabled={loading || refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>
    </section>
  );
}
