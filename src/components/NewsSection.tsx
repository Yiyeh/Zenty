import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { translateMessage, tr } from "../lib/i18n.ts";
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
  useInterfaceLocale();
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
      notify(tr("NewsSection.a0b642cf6d"));
      return;
    }
    const updated = [...userTags, trimmed].join(", ");
    setSettings((s) => ({ ...s, newsTags: updated }));
    setNewTagInput("");
    notify(tr("interface.NewsSection.912ff9aec1", { v0: trimmed }));
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updated = userTags
      .filter((t) => t.toLowerCase() !== tagToRemove.toLowerCase())
      .join(", ");
    setSettings((s) => ({ ...s, newsTags: updated }));
    if (activeTag?.toLowerCase() === tagToRemove.toLowerCase()) {
      setActiveTag(null);
    }
    notify(tr("interface.NewsSection.663a7efc7e", { v0: tagToRemove }));
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
      notify(tr("NewsSection.489dded19d"));
    } else {
      setBookmarks((prev) => [
        ...prev,
        {
          id: newId(),
          title: article.title,
          url: article.link,
          group: tr("NewsSection.79cc9d2c71"),
          color: settings.accentColor,
        },
      ]);
      notify(tr("NewsSection.56251ca84f"));
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
      notify(tr("NewsSection.1087133e59"));
    } catch {
      notify(tr("NewsSection.08dff6f8f2"));
    }
  };

  // Add manual bookmark
  const handleAddManualBookmark = (e: React.FormEvent) => {
    e.preventDefault();
    const link = safeUrl(manualUrl);
    if (!link || !manualTitle.trim()) {
      setManualError(
        tr("NewsSection.87cb46645b"),
      );
      return;
    }
    if (savedArticles.some((item) => item.url === link)) {
      setManualError(tr("NewsSection.11dcb870c1"));
      return;
    }
    setBookmarks((prev) => [
      ...prev,
      {
        id: newId(),
        title: manualTitle.trim(),
        url: link,
        group: tr("NewsSection.79cc9d2c71"),
        color: settings.accentColor,
      },
    ]);
    setManualTitle("");
    setManualUrl("");
    setManualError("");
    notify(tr("NewsSection.e0d35df1f6"));
  };

  return (
    <div className="news-page">
      {/* Hero Header */}
      <section className="news-hero">
        <div className="news-hero-content">
          <p className="eyebrow">{tr("NewsSection.2920f18869")}</p>
          <h1>
            {tr("NewsSection.d6dd61f02f")}<span>{tr("NewsSection.c9920b5994")}</span>
          </h1>
          <p>
            {tr("NewsSection.fca84c6f87")}</p>
        </div>
        <div className="news-hero-actions">
          <div className="news-hero-status">
            <span
              className={`status-dot ${stale || error ? "status-stale" : ""}`}
            />
            <span>
              {refreshing
                ? tr("NewsSection.31d871060c")
                : stale || error
                  ? tr("NewsSection.db33acdc6f")
                  : unavailableSources.length
                    ? tr("interface.NewsSection.85a8516eb3", { v0: sources.length - unavailableSources.length, v1: sources.length })
                    : updatedAt
                      ? `Actualizado ${formatRelativeTime(updatedAt)}`
                      : tr("NewsSection.b5fa51d564")}
            </span>
          </div>
          <div className="news-hero-buttons">
            <button
              className="secondary-button"
              onClick={() => refresh()}
              disabled={refreshing || loading}
              title={tr("NewsSection.71ea738f4a")}
            >
              <RefreshCw
                size={15}
                className={refreshing ? "animate-spin" : ""}
              />
              {refreshing ? tr("NewsSection.211b1c3745") : tr("NewsSection.fe5f6628c7")}
            </button>
            <button
              className="primary-button"
              onClick={() => setActiveCategory("saved")}
            >
              <BookmarkPlus size={15} />
              {tr("NewsSection.cb80117fa8")}{savedArticles.length})
            </button>
          </div>
        </div>
      </section>

      {/* Saved Tags Bar */}
      <div className="news-tags-bar" role="region" aria-label={tr("NewsSection.18b8a6614f")}>
        <span className="news-tags-label">
          <Tag size={13} />
          {tr("NewsSection.e34361f52a")}</span>
        <button
          className={`news-tag-chip ${!activeTag ? "active" : ""}`}
          onClick={() => setActiveTag(null)}
        >
          {tr("NewsSection.59abf9d784")}</button>
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
              aria-label={tr("a11y.NewsSection.306", { v0: tag })}
              onClick={() => handleRemoveTag(tag)}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          className="news-add-tag-btn"
          onClick={() => setTagModalOpen(true)}
          title={tr("NewsSection.80bdcd4d7c")}
        >
          <Plus size={13} />
          {tr("NewsSection.ab2d42cf18")}</button>
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
              title={tr("NewsSection.aa425ab6c1")}
              aria-label={tr("NewsSection.aa425ab6c1")}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              className={viewMode === "list" ? "active" : ""}
              onClick={() => setViewMode("list")}
              title={tr("NewsSection.15a048adba")}
              aria-label={tr("NewsSection.15a048adba")}
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
              placeholder={tr("NewsSection.cc13d5dba1")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="news-search-clear"
                onClick={() => setSearchQuery("")}
                title={tr("NewsSection.a7859bae87")}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <select
            className="news-source-select"
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            aria-label={tr("NewsSection.4e5f997b16")}
          >
            <option value="all">{tr("NewsSection.1c15d92fd2")}{sources.length})</option>
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
              {tr("NewsSection.8624fe4671")}{activeTag && <strong>{tr("NewsSection.9c5da071b7")}{activeTag} </strong>}
              {searchQuery && <strong>{tr("NewsSection.7090a9d8d2")}{searchQuery}{tr("NewsSection.905ef1839d")}</strong>}
              {selectedSource !== "all" && (
                <strong>
                  {tr("NewsSection.382897b636")}{" "}
                  {sources.find((s) => s.id === selectedSource)?.name}{" "}
                </strong>
              )}
              ({filteredArticles.length} {tr("NewsSection.54402a727a")}</span>
            <button
              className="text-button"
              onClick={() => {
                setActiveTag(null);
                setSearchQuery("");
                setSelectedSource("all");
              }}
            >
              {tr("NewsSection.bcab4f79e9")}</button>
          </div>
        )}

      {/* Content Rendering */}
      {activeCategory === "saved" ? (
        /* Saved Articles View */
        <div className="news-saved-section">
          <div className="news-add-manual-form">
            <h3>
              <BookmarkPlus size={17} />
              {tr("NewsSection.ab1d0b92dd")}</h3>
            <form onSubmit={handleAddManualBookmark}>
              <div className="news-add-manual-grid">
                <input
                  required
                  placeholder={tr("NewsSection.535f61c214")}
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                />
                <input
                  required
                  type="url"
                  placeholder={tr("NewsSection.fdc3daa8bd")}
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                />
                <button className="primary-button" type="submit">
                  {tr("NewsSection.a83ffc5563")}</button>
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
              <h3>{tr("NewsSection.84777daf43")}</h3>
              <p>
                {tr("NewsSection.9c4163b5ea")}</p>
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
                      title={tr("NewsSection.3225b785c5")}
                    >
                      <ExternalLink size={15} />
                    </a>
                    <button
                      className="icon-button"
                      title={tr("NewsSection.8630af8089")}
                      onClick={() => {
                        setBookmarks((prev) =>
                          prev.filter((b) => b.id !== item.id),
                        );
                        notify(tr("NewsSection.edf1f0d558"), () =>
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
          <h3>{tr("NewsSection.6d85c13cb1")}</h3>
          <p>
            {tr("NewsSection.616e99c170")}</p>
        </div>
      ) : error && articles.length === 0 ? (
        <div className="news-empty-state">
          <Sparkles size={36} />
          <h3>{tr("NewsSection.ad210cdf5d")}</h3>
          <p>{translateMessage(error)}</p>
          <button className="primary-button" onClick={() => refresh()}>
            {tr("NewsSection.a9254c5f81")}</button>
        </div>
      ) : filteredArticles.length === 0 ? (
        <div className="news-empty-state">
          <Search size={36} />
          <h3>{tr("NewsSection.682606be2d")}</h3>
          <p>
            {tr("NewsSection.e49a0fd272")}</p>
          <button
            className="secondary-button"
            onClick={() => {
              setActiveTag(null);
              setSearchQuery("");
              setSelectedSource("all");
              setActiveCategory("all");
            }}
          >
            {tr("NewsSection.760eaa7b07")}</button>
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
                        title={tr("NewsSection.af4bfbddec", { v0: t })}
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
                    {tr("NewsSection.fa78b914ee")}<ExternalLink size={14} />
                  </a>
                  <div className="news-action-btns">
                    <button
                      className="icon-button"
                      title={
                        isArticleSaved(featuredArticle.link)
                          ? tr("NewsSection.8630af8089")
                          : tr("NewsSection.6b73aa64de")
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
                      title={tr("NewsSection.db164690a5")}
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
                              title={tr("NewsSection.af4bfbddec", { v0: t })}
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
                          {tr("NewsSection.f4e0ac0804")}<ExternalLink size={13} />
                        </a>
                        <div className="news-action-btns">
                          <button
                            className="icon-button"
                            title={
                              isSaved
                                ? tr("NewsSection.8630af8089")
                                : tr("NewsSection.ec6d42c994")
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
                            title={tr("NewsSection.db164690a5")}
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
                        title={isSaved ? tr("NewsSection.1d23d7765e") : tr("NewsSection.a83ffc5563")}
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
                        title={tr("NewsSection.affa1ba3d4")}
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
          {tr("NewsSection.443a0888e6")}{listArticles.length - visibleCount})
        </button>
      )}
      <Dialog
        open={tagModalOpen}
        onClose={() => setTagModalOpen(false)}
        title={tr("NewsSection.74ef575f9f")}
        description={tr("NewsSection.81f7871e76")}
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
              aria-label={tr("NewsSection.e2bc8aafe2")}
              placeholder={tr("NewsSection.84037d3389")}
              maxLength={40}
              value={newTagInput}
              onChange={(event) => setNewTagInput(event.target.value)}
            />
            <button className="primary-button" type="submit">
              <Plus size={15} /> {tr("NewsSection.87aa1c4aa8")}</button>
          </form>
          <div className="news-modal-tags-list">
            {userTags.length ? (
              userTags.map((tag) => (
                <span key={tag} className="news-tag-chip">
                  #{tag}
                  <button
                    className="tag-delete"
                    aria-label={tr("a11y.NewsSection.915", { v0: tag })}
                    onClick={() => handleRemoveTag(tag)}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))
            ) : (
              <p className="muted">{tr("NewsSection.34e8f4457f")}</p>
            )}
          </div>
          <div className="news-modal-suggestions">
            <span>{tr("NewsSection.70cf296fe1")}</span>
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
