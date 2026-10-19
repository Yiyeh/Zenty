import { newId } from "../lib/id";
import { useState, useMemo } from "react";
import {
  Newspaper,
  Search,
  RefreshCw,
  Bookmark,
  BookmarkCheck,
  BookmarkPlus,
  ExternalLink,
  Tag,
  Plus,
  X,
  Clock,
  Sparkles,
  Trash2,
  LayoutGrid,
  List,
  Compass,
  Share2,
  Check,
  Layers,
  BookOpen,
} from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
import { useNewsFeed } from "../lib/news-client";
import {
  NEWS_CATEGORIES,
  DEFAULT_PRESET_TAGS,
  parseNewsTags,
  formatRelativeTime,
  matchesKeyword,
  type NewsCategory,
  type NewsArticle,
} from "../lib/news";
import { Dialog } from "./Dialog";
import { safeUrl } from "../lib/dashboard";
import "../news.css";

export function NewsSection() {
  const { bookmarks, setBookmarks, settings, setSettings, notify } =
    useDashboard();
  const {
    articles,
    sources,
    updatedAt,
    stale,
    unavailableSources,
    loading,
    refreshing,
    error,
    refresh,
  } = useNewsFeed();

  const [activeCategory, setActiveCategory] = useState<NewsCategory>("all");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSource, setSelectedSource] = useState("all");
  const [page, setPage] = useState({ key: "", count: 24 });
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Tag manager modal
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");

  // Manual bookmark form
  const [manualTitle, setManualTitle] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualError, setManualError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Parse user tags from settings
  const userTags = useMemo(
    () => parseNewsTags(settings.newsTags),
    [settings.newsTags],
  );

  // Saved bookmarks in "Para leer"
  const savedArticles = useMemo(
    () => bookmarks.filter((b) => b.group === "Para leer"),
    [bookmarks],
  );

  // Filtered articles
  const filteredArticles = useMemo(() => {
    return articles.filter((article) => {
      // 1. Category
      if (activeCategory !== "all" && activeCategory !== "saved") {
        if (article.category !== activeCategory) return false;
      }
      // 2. Source
      if (selectedSource !== "all" && article.source.id !== selectedSource) {
        return false;
      }
      // 3. Tag
      if (activeTag) {
        const matchesTag =
          article.tags.some(
            (t) => t.toLowerCase() === activeTag.toLowerCase(),
          ) || matchesKeyword(article, activeTag);
        if (!matchesTag) return false;
      }
      // 4. Search query
      if (searchQuery.trim()) {
        if (!matchesKeyword(article, searchQuery)) return false;
      }
      return true;
    });
  }, [articles, activeCategory, selectedSource, activeTag, searchQuery]);

  // Featured Hero Article (first article if not in saved mode and no search)
  const featuredArticle = useMemo(() => {
    if (activeCategory === "saved" || searchQuery.trim() || activeTag) {
      return null;
    }
    return filteredArticles[0] || null;
  }, [filteredArticles, activeCategory, searchQuery, activeTag]);

  // Remaining articles
  const listArticles = useMemo(() => {
    if (featuredArticle) {
      return filteredArticles.slice(1);
    }
    return filteredArticles;
  }, [filteredArticles, featuredArticle]);

  const pageKey = [activeCategory, activeTag, searchQuery, selectedSource].join(
    "|",
  );
  const visibleCount = page.key === pageKey ? page.count : 24;
  const visibleArticles = listArticles.slice(0, visibleCount);

  // Tag operations
  const handleAddTag = (tagToAdd: string) => {
    const trimmed = tagToAdd.trim().replace(/^#/, "");
    if (!trimmed) return;
    if (userTags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      notify("Este tema ya está en tus etiquetas.");
      return;
    }
    const updated = [...userTags, trimmed].join(", ");
    setSettings((s) => ({ ...s, newsTags: updated }));
    setNewTagInput("");
    notify(`Tema "${trimmed}" guardado.`);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updated = userTags
      .filter((t) => t.toLowerCase() !== tagToRemove.toLowerCase())
      .join(", ");
    setSettings((s) => ({ ...s, newsTags: updated }));
    if (activeTag?.toLowerCase() === tagToRemove.toLowerCase()) {
      setActiveTag(null);
    }
    notify(`Tema "${tagToRemove}" eliminado.`);
  };

  // Bookmark toggle
  const toggleBookmark = (article: NewsArticle) => {
    const isSaved = savedArticles.some((b) => b.url === article.link);
    if (isSaved) {
      setBookmarks((prev) =>
        prev.filter(
          (b) => !(b.group === "Para leer" && b.url === article.link),
        ),
      );
      notify("Artículo eliminado de guardados.");
    } else {
      setBookmarks((prev) => [
        ...prev,
        {
          id: newId(),
          title: article.title,
          url: article.link,
          group: "Para leer",
          color: settings.accentColor,
        },
      ]);
      notify("Artículo guardado para leer con calma.");
    }
  };

  const isArticleSaved = (url: string) => {
    return savedArticles.some((b) => b.url === url);
  };

  // Copy article link
  const handleCopyLink = async (article: NewsArticle) => {
    try {
      await navigator.clipboard.writeText(article.link);
      setCopiedId(article.id);
      setTimeout(() => setCopiedId(null), 2000);
      notify("Enlace copiado al portapapeles.");
    } catch {
      notify("No se pudo copiar el enlace.");
    }
  };

  // Add manual bookmark
  const handleAddManualBookmark = (e: React.FormEvent) => {
    e.preventDefault();
    const link = safeUrl(manualUrl);
    if (!link || !manualTitle.trim()) {
      setManualError(
        "Introduce un título y una dirección web válida (https://...)",
      );
      return;
    }
    if (savedArticles.some((item) => item.url === link)) {
      setManualError("Esta lectura ya está guardada.");
      return;
    }
    setBookmarks((prev) => [
      ...prev,
      {
        id: newId(),
        title: manualTitle.trim(),
        url: link,
        group: "Para leer",
        color: settings.accentColor,
      },
    ]);
    setManualTitle("");
    setManualUrl("");
    setManualError("");
    notify("Lectura guardada correctamente.");
  };

  return (
    <div className="news-page">
      {/* Hero Header */}
      <section className="news-hero">
        <div className="news-hero-content">
          <p className="eyebrow">TU QUIOSCO PERSONAL</p>
          <h1>
            Noticias & <span>Lecturas</span>
          </h1>
          <p>
            Información seleccionada de tus fuentes favoritas, organizada por
            los temas que más te importan. Todo en un solo lugar.
          </p>
        </div>
        <div className="news-hero-actions">
          <div className="news-hero-status">
            <span
              className={`status-dot ${stale || error ? "status-stale" : ""}`}
            />
            <span>
              {refreshing
                ? "Actualizando noticias…"
                : stale || error
                  ? "Últimas noticias guardadas · sin conexión"
                  : unavailableSources.length
                    ? `${sources.length - unavailableSources.length} de ${sources.length} fuentes disponibles`
                    : updatedAt
                      ? `Actualizado ${formatRelativeTime(updatedAt)}`
                      : "Listo"}
            </span>
          </div>
          <div className="news-hero-buttons">
            <button
              className="secondary-button"
              onClick={() => refresh()}
              disabled={refreshing || loading}
              title="Actualizar feeds de noticias"
            >
              <RefreshCw
                size={15}
                className={refreshing ? "animate-spin" : ""}
              />
              {refreshing ? "Actualizando…" : "Actualizar"}
            </button>
            <button
              className="primary-button"
              onClick={() => setActiveCategory("saved")}
            >
              <BookmarkPlus size={15} />
              Guardados ({savedArticles.length})
            </button>
          </div>
        </div>
      </section>

      {/* Saved Tags Bar */}
      <div className="news-tags-bar" role="region" aria-label="Temas guardados">
        <span className="news-tags-label">
          <Tag size={13} />
          Temas:
        </span>
        <button
          className={`news-tag-chip ${!activeTag ? "active" : ""}`}
          onClick={() => setActiveTag(null)}
        >
          Todos los temas
        </button>
        {userTags.map((tag) => (
          <div key={tag} className="news-tag-group">
            <button
              className={`news-tag-chip ${activeTag === tag ? "active" : ""}`}
              aria-pressed={activeTag === tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            >
              #{tag}
            </button>
            <button
              className="tag-delete"
              aria-label={`Eliminar tema ${tag}`}
              onClick={() => handleRemoveTag(tag)}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          className="news-add-tag-btn"
          onClick={() => setTagModalOpen(true)}
          title="Gestionar y añadir temas"
        >
          <Plus size={13} />
          Añadir tema
        </button>
      </div>

      {/* Categories Navigation Bar */}
      <div className="news-nav-bar">
        <div className="news-categories-list" role="tablist">
          {NEWS_CATEGORIES.map((cat) => {
            const count =
              cat.id === "saved"
                ? savedArticles.length
                : cat.id === "all"
                  ? articles.length
                  : articles.filter((a) => a.category === cat.id).length;

            return (
              <button
                key={cat.id}
                role="tab"
                aria-selected={activeCategory === cat.id}
                className={`news-category-btn ${activeCategory === cat.id ? "active" : ""}`}
                onClick={() => {
                  setActiveCategory(cat.id);
                  if (cat.id === "saved") {
                    setActiveTag(null);
                  }
                }}
              >
                {cat.id === "saved" ? (
                  <Bookmark size={15} />
                ) : cat.id === "all" ? (
                  <Compass size={15} />
                ) : (
                  <Layers size={15} />
                )}
                <span>{cat.label}</span>
                {count > 0 && <span className="category-badge">{count}</span>}
              </button>
            );
          })}
        </div>

        <div className="news-nav-controls">
          <div className="news-view-toggle">
            <button
              className={viewMode === "grid" ? "active" : ""}
              onClick={() => setViewMode("grid")}
              title="Vista cuadrícula"
              aria-label="Vista cuadrícula"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              className={viewMode === "list" ? "active" : ""}
              onClick={() => setViewMode("list")}
              title="Vista lista compacta"
              aria-label="Vista lista compacta"
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar: Search & Sources */}
      {activeCategory !== "saved" && (
        <div className="news-toolbar">
          <div className="news-search-box">
            <Search size={16} />
            <input
              type="search"
              placeholder="Buscar por título, tema, palabras clave..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="news-search-clear"
                onClick={() => setSearchQuery("")}
                title="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <select
            className="news-source-select"
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            aria-label="Filtrar por fuente de noticias"
          >
            <option value="all">Todas las fuentes ({sources.length})</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.language.toUpperCase()})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Active Filter Pill indicator */}
      {(activeTag || searchQuery || selectedSource !== "all") &&
        activeCategory !== "saved" && (
          <div className="news-active-filter-banner">
            <span>
              Filtro activo: {activeTag && <strong>Tema #{activeTag} </strong>}
              {searchQuery && <strong>Texto &quot;{searchQuery}&quot; </strong>}
              {selectedSource !== "all" && (
                <strong>
                  Fuente{" "}
                  {sources.find((s) => s.id === selectedSource)?.name}{" "}
                </strong>
              )}
              ({filteredArticles.length} resultados)
            </span>
            <button
              className="text-button"
              onClick={() => {
                setActiveTag(null);
                setSearchQuery("");
                setSelectedSource("all");
              }}
            >
              Limpiar todos los filtros
            </button>
          </div>
        )}

      {/* Content Rendering */}
      {activeCategory === "saved" ? (
        /* Saved Articles View */
        <div className="news-saved-section">
          <div className="news-add-manual-form">
            <h3>
              <BookmarkPlus size={17} />
              Añadir lectura manual por enlace web
            </h3>
            <form onSubmit={handleAddManualBookmark}>
              <div className="news-add-manual-grid">
                <input
                  required
                  placeholder="Título del artículo o tema"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                />
                <input
                  required
                  type="url"
                  placeholder="https://ejemplo.com/articulo"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                />
                <button className="primary-button" type="submit">
                  Guardar lectura
                </button>
              </div>
              {manualError && (
                <p className="error-message" role="alert">
                  {manualError}
                </p>
              )}
            </form>
          </div>

          {savedArticles.length === 0 ? (
            <div className="news-empty-state">
              <BookOpen size={36} />
              <h3>Tu lista de lectura está vacía</h3>
              <p>
                Puedes pulsar en el botón de guardar de cualquier noticia para
                leerla más tarde con tranquilidad, o agregar cualquier enlace
                con el formulario superior.
              </p>
            </div>
          ) : (
            <div className="news-list-view">
              {savedArticles.map((item) => (
                <div key={item.id} className="news-list-row">
                  <div className="news-list-main">
                    <span className="news-source-pill">
                      {(() => {
                        try {
                          return new URL(item.url).hostname;
                        } catch {
                          return "Web";
                        }
                      })()}
                    </span>
                    <h3>
                      <a
                        href={item.url}
                        target={settings.openInNewTab ? "_blank" : "_self"}
                        rel="noreferrer"
                      >
                        {item.title}
                      </a>
                    </h3>
                  </div>
                  <div className="news-action-btns">
                    <a
                      href={item.url}
                      className="icon-button"
                      target={settings.openInNewTab ? "_blank" : "_self"}
                      rel="noreferrer"
                      title="Abrir enlace"
                    >
                      <ExternalLink size={15} />
                    </a>
                    <button
                      className="icon-button"
                      title="Eliminar de guardados"
                      onClick={() => {
                        setBookmarks((prev) =>
                          prev.filter((b) => b.id !== item.id),
                        );
                        notify("Lectura eliminada.", () =>
                          setBookmarks((prev) =>
                            prev.some((b) => b.id === item.id)
                              ? prev
                              : [...prev, item],
                          ),
                        );
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : loading && articles.length === 0 ? (
        <div className="news-empty-state">
          <RefreshCw size={36} className="animate-spin" />
          <h3>Cargando las últimas noticias…</h3>
          <p>
            Consultando fuentes de tecnología, videojuegos, manga y ciencia.
          </p>
        </div>
      ) : error && articles.length === 0 ? (
        <div className="news-empty-state">
          <Sparkles size={36} />
          <h3>No se pudieron cargar las noticias</h3>
          <p>{error}</p>
          <button className="primary-button" onClick={() => refresh()}>
            Reintentar
          </button>
        </div>
      ) : filteredArticles.length === 0 ? (
        <div className="news-empty-state">
          <Search size={36} />
          <h3>No se encontraron noticias</h3>
          <p>
            No hay artículos que coincidan con los filtros o etiquetas
            seleccionadas. Intenta cambiar de tema o ampliar la búsqueda.
          </p>
          <button
            className="secondary-button"
            onClick={() => {
              setActiveTag(null);
              setSearchQuery("");
              setSelectedSource("all");
              setActiveCategory("all");
            }}
          >
            Ver todas las noticias
          </button>
        </div>
      ) : (
        <>
          {/* Featured Breaking News Card */}
          {featuredArticle && (
            <article className="news-featured-card">
              <div className="news-featured-media">
                {featuredArticle.imageUrl ? (
                  <img
                    src={`/api/news/image?url=${encodeURIComponent(featuredArticle.imageUrl)}`}
                    alt={featuredArticle.title}
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="news-card-thumb-fallback">
                    <Newspaper size={40} />
                    <span>{featuredArticle.source.name}</span>
                  </div>
                )}
              </div>
              <div className="news-featured-body">
                <div className="news-meta-row">
                  <span className="news-source-pill">
                    <i
                      className="source-dot"
                      style={{
                        background:
                          sources.find(
                            (s) => s.id === featuredArticle.source.id,
                          )?.color || "var(--accent-color)",
                      }}
                    />
                    {featuredArticle.source.name}
                  </span>
                  <span className="news-category-pill">
                    {NEWS_CATEGORIES.find(
                      (c) => c.id === featuredArticle.category,
                    )?.label || featuredArticle.category}
                  </span>
                  <span className="news-time-pill">
                    <Clock size={12} />
                    {formatRelativeTime(featuredArticle.publishedAt)}
                  </span>
                </div>

                <h2>
                  <a
                    href={featuredArticle.link}
                    target={settings.openInNewTab ? "_blank" : "_self"}
                    rel="noreferrer"
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    {featuredArticle.title}
                  </a>
                </h2>

                <p>{featuredArticle.summary}</p>

                {featuredArticle.tags.length > 0 && (
                  <div className="news-card-tags">
                    {featuredArticle.tags.map((t) => (
                      <button
                        key={t}
                        className="news-mini-tag"
                        onClick={() => setActiveTag(t)}
                        title={`Filtrar por #${t}`}
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                )}

                <div className="news-card-footer">
                  <a
                    href={featuredArticle.link}
                    target={settings.openInNewTab ? "_blank" : "_self"}
                    rel="noreferrer"
                    className="news-read-link"
                  >
                    Leer noticia completa
                    <ExternalLink size={14} />
                  </a>
                  <div className="news-action-btns">
                    <button
                      className="icon-button"
                      title={
                        isArticleSaved(featuredArticle.link)
                          ? "Eliminar de guardados"
                          : "Guardar para después"
                      }
                      onClick={() => toggleBookmark(featuredArticle)}
                    >
                      {isArticleSaved(featuredArticle.link) ? (
                        <BookmarkCheck size={16} color="var(--accent-color)" />
                      ) : (
                        <Bookmark size={16} />
                      )}
                    </button>
                    <button
                      className="icon-button"
                      title="Copiar enlace"
                      onClick={() => handleCopyLink(featuredArticle)}
                    >
                      {copiedId === featuredArticle.id ? (
                        <Check size={16} color="#10b981" />
                      ) : (
                        <Share2 size={16} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </article>
          )}

          {/* Grid View */}
          {viewMode === "grid" ? (
            <div className="news-grid">
              {visibleArticles.map((article) => {
                const isSaved = isArticleSaved(article.link);
                const sourceColor =
                  sources.find((s) => s.id === article.source.id)?.color ||
                  "var(--accent-color)";

                return (
                  <article key={article.id} className="news-card">
                    <div className="news-card-thumb">
                      {article.imageUrl ? (
                        <img
                          src={`/api/news/image?url=${encodeURIComponent(article.imageUrl)}`}
                          alt={article.title}
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="news-card-thumb-fallback">
                          <Newspaper size={28} />
                          <span>{article.source.name}</span>
                        </div>
                      )}
                    </div>

                    <div className="news-card-content">
                      <div className="news-meta-row">
                        <span className="news-source-pill">
                          <i
                            className="source-dot"
                            style={{ background: sourceColor }}
                          />
                          {article.source.name}
                        </span>
                        <span className="news-time-pill">
                          <Clock size={11} />
                          {formatRelativeTime(article.publishedAt)}
                        </span>
                      </div>

                      <h3 className="news-card-title">
                        <a
                          href={article.link}
                          target={settings.openInNewTab ? "_blank" : "_self"}
                          rel="noreferrer"
                        >
                          {article.title}
                        </a>
                      </h3>

                      <p className="news-card-excerpt">{article.summary}</p>

                      {article.tags.length > 0 && (
                        <div className="news-card-tags">
                          {article.tags.slice(0, 3).map((t) => (
                            <button
                              key={t}
                              className="news-mini-tag"
                              onClick={() => setActiveTag(t)}
                              title={`Filtrar por #${t}`}
                            >
                              #{t}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="news-card-footer">
                        <a
                          href={article.link}
                          target={settings.openInNewTab ? "_blank" : "_self"}
                          rel="noreferrer"
                          className="news-read-link"
                        >
                          Leer
                          <ExternalLink size={13} />
                        </a>
                        <div className="news-action-btns">
                          <button
                            className="icon-button"
                            title={
                              isSaved
                                ? "Eliminar de guardados"
                                : "Guardar para leer después"
                            }
                            onClick={() => toggleBookmark(article)}
                          >
                            {isSaved ? (
                              <BookmarkCheck
                                size={15}
                                color="var(--accent-color)"
                              />
                            ) : (
                              <Bookmark size={15} />
                            )}
                          </button>
                          <button
                            className="icon-button"
                            title="Copiar enlace"
                            onClick={() => handleCopyLink(article)}
                          >
                            {copiedId === article.id ? (
                              <Check size={15} color="#10b981" />
                            ) : (
                              <Share2 size={15} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            /* List View */
            <div className="news-list-view">
              {visibleArticles.map((article) => {
                const isSaved = isArticleSaved(article.link);
                return (
                  <div key={article.id} className="news-list-row">
                    <div className="news-list-main">
                      <div className="news-meta-row">
                        <span className="news-source-pill">
                          {article.source.name}
                        </span>
                        <span className="news-time-pill">
                          {formatRelativeTime(article.publishedAt)}
                        </span>
                        <span className="news-category-pill">
                          {NEWS_CATEGORIES.find(
                            (c) => c.id === article.category,
                          )?.label || article.category}
                        </span>
                      </div>
                      <h3>
                        <a
                          href={article.link}
                          target={settings.openInNewTab ? "_blank" : "_self"}
                          rel="noreferrer"
                        >
                          {article.title}
                        </a>
                      </h3>
                      <p className="news-card-excerpt">{article.summary}</p>
                    </div>
                    <div className="news-action-btns">
                      <button
                        className="icon-button"
                        title={isSaved ? "Quitar guardado" : "Guardar lectura"}
                        onClick={() => toggleBookmark(article)}
                      >
                        {isSaved ? (
                          <BookmarkCheck
                            size={16}
                            color="var(--accent-color)"
                          />
                        ) : (
                          <Bookmark size={16} />
                        )}
                      </button>
                      <a
                        href={article.link}
                        className="icon-button"
                        target={settings.openInNewTab ? "_blank" : "_self"}
                        rel="noreferrer"
                        title="Abrir artículo"
                      >
                        <ExternalLink size={16} />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeCategory !== "saved" && visibleCount < listArticles.length && (
        <button
          className="secondary-button news-load-more"
          onClick={() => setPage({ key: pageKey, count: visibleCount + 24 })}
        >
          Cargar más noticias ({listArticles.length - visibleCount})
        </button>
      )}
      <Dialog
        open={tagModalOpen}
        onClose={() => setTagModalOpen(false)}
        title="Tus temas guardados"
        description="Elige los temas que quieres tener a mano como filtros."
      >
        <div className="dialog-body news-topic-manager">
          <form
            className="news-modal-add-row"
            onSubmit={(event) => {
              event.preventDefault();
              handleAddTag(newTagInput);
            }}
          >
            <input
              aria-label="Nuevo tema"
              placeholder="Berserk, IA, Steam Deck…"
              maxLength={40}
              value={newTagInput}
              onChange={(event) => setNewTagInput(event.target.value)}
            />
            <button className="primary-button" type="submit">
              <Plus size={15} /> Añadir
            </button>
          </form>
          <div className="news-modal-tags-list">
            {userTags.length ? (
              userTags.map((tag) => (
                <span key={tag} className="news-tag-chip">
                  #{tag}
                  <button
                    className="tag-delete"
                    aria-label={`Eliminar tema ${tag}`}
                    onClick={() => handleRemoveTag(tag)}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))
            ) : (
              <p className="muted">Todavía no has guardado temas.</p>
            )}
          </div>
          <div className="news-modal-suggestions">
            <span>Sugerencias</span>
            <div className="news-suggestions-chips">
              {DEFAULT_PRESET_TAGS.filter(
                (tag) =>
                  !userTags.some(
                    (saved) => saved.toLowerCase() === tag.toLowerCase(),
                  ),
              ).map((tag) => (
                <button
                  key={tag}
                  className="news-suggestion-pill"
                  onClick={() => handleAddTag(tag)}
                >
                  + {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
