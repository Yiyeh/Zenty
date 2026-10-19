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
      aria-label="Widget de noticias"
    >
      <div className="widget-heading">
        <h3>
          <Newspaper size={17} /> Noticias
        </h3>
        <select
          aria-label="Tema del widget de noticias"
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
              {item.id === "all" ? "Todos los temas" : item.label}
            </option>
          ))}
        </select>
      </div>
      <div
        className="news-widget-tabs"
        role="group"
        aria-label="Contenido de noticias"
      >
        <button
          aria-pressed={tab === "headlines"}
          onClick={() => setTab("headlines")}
        >
          Titulares
        </button>
        <button aria-pressed={tab === "saved"} onClick={() => setTab("saved")}>
          Guardados{saved.length ? ` · ${saved.length}` : ""}
        </button>
      </div>
      {tab === "headlines" && (error || stale) && (
        <p className="news-widget-status" role="status">
          {articles.length
            ? "Mostrando las últimas noticias guardadas. No se pudo actualizar."
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
                  aria-label={`${isSaved ? "Quitar de guardados" : "Guardar noticia"}: ${item.title}`}
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
                              group: "Para leer",
                              color: settings.accentColor,
                            },
                          ],
                    );
                    notify(
                      isSaved
                        ? "Noticia quitada de guardados."
                        : "Noticia guardada para después.",
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
            ? "Guarda un titular para encontrarlo aquí."
            : loading
              ? "Buscando los últimos titulares…"
              : "No hay titulares para este tema. Prueba con otro o actualiza."}
        </p>
      )}
      <div className="news-widget-footer">
        {onOpen && (
          <button className="text-button" onClick={onOpen}>
            Abrir noticias <ArrowUpRight size={14} />
          </button>
        )}
        <button
          className="icon-button"
          aria-label="Actualizar noticias"
          disabled={loading || refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>
    </section>
  );
}
