import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { translateMessage, tr } from "../lib/i18n.ts";
import { useEffect, useRef, useState } from "react";
import {
  Search,
  BookOpen,
  Plus,
  Check,
  X,
  Globe,
  Loader2,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { Dialog } from "./Dialog";
import { MangaSources } from "./MangaSources";
import {
  searchManga,
  addMangaToLibrary,
  MANGA_LANGUAGES,
  type MangaSearchResult,
} from "../lib/mangadex-client";
import type { LibraryDocument } from "../lib/library";

interface MangaSearchModalProps {
  open: boolean;
  onClose: () => void;
  existingDocuments: LibraryDocument[];
  onMangaAdded: (document: LibraryDocument, shouldOpen?: boolean) => void;
}

export function MangaSearchModal({
  open,
  onClose,
  existingDocuments,
  onMangaAdded,
}: MangaSearchModalProps) {
  useInterfaceLocale();
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("es-all");
  const [results, setResults] = useState<MangaSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [open]);

  // Load popular mangas or search results
  useEffect(() => {
    if (!open) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    setLoading(true);
    setError("");

    debounceTimer.current = setTimeout(async () => {
      try {
        const data = await searchManga(query.trim(), language, 24);
        setResults(data.results);
      } catch (err) {
        setError((err as Error).message || tr("MangaSearchModal.43f39a4c41"));
      } finally {
        setLoading(false);
      }
    }, query.trim() ? 350 : 0);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [open, query, language]);

  const isAlreadyInLibrary = (mangaId: string) => {
    return existingDocuments.some(
      (d) => !d.deletedAt && d.format === "manga" && d.manga?.mangadexId === mangaId,
    );
  };

  const getExistingDocument = (mangaId: string) => {
    return existingDocuments.find(
      (d) => !d.deletedAt && d.format === "manga" && d.manga?.mangadexId === mangaId,
    );
  };

  const handleAdd = async (manga: MangaSearchResult, shouldRead = false) => {
    if (shouldRead) setReadingId(manga.id);
    else setAddingId(manga.id);

    try {
      const res = await addMangaToLibrary(manga, language);
      onMangaAdded(res.document, shouldRead);
      if (shouldRead) {
        onClose();
      }
    } catch (err) {
      setError((err as Error).message || tr("MangaSearchModal.a551ade62d"));
    } finally {
      setAddingId(null);
      setReadingId(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={tr("MangaSearchModal.5910070458")}
      wide
      description={tr("MangaSearchModal.9b4a6cd237")}
    >
      <div className="manga-modal-content">
        <div className="manga-search-bar-row">
          <div className="manga-filter-field">
          <label htmlFor="mangadex-title">{tr("MangaSearchModal.705dda1fc3")}</label>
          <div className="input-icon manga-search-input-wrapper">
            <Search size={18} />
            <input
              ref={searchInputRef}
              type="text"
              id="mangadex-title"
              placeholder={tr("MangaSearchModal.2fa3a38a81")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={tr("MangaSearchModal.2b523870c9")}
            />
            {query && (
              <button
                className="icon-button manga-clear-btn"
                onClick={() => setQuery("")}
                aria-label={tr("MangaSearchModal.a7859bae87")}
              >
                <X size={15} />
              </button>
            )}
          </div>
          </div>
          <div className="manga-filter-field">
          <label htmlFor="mangadex-language">{tr("MangaSearchModal.997cd42eec")}</label>
          <div className="manga-lang-select-wrapper">
            <Globe size={16} className="lang-icon" aria-hidden="true" />
            <select
              id="mangadex-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              aria-label={tr("MangaSearchModal.ba399ab065")}
            >
              {MANGA_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <ChevronDown size={15} className="manga-select-chevron" aria-hidden="true" />
          </div>
          </div>
        </div>

        <div className="manga-modal-header-info">
          <span>
            {query.trim()
              ? tr("MangaSearchModal.3d128445e9", { v0: query.trim() })
              : tr("MangaSearchModal.a0fa875bc9")}
          </span>
          {results.length > 0 && !loading && (
            <small>{results.length} {tr("MangaSearchModal.c75d7dc75e")}</small>
          )}
        </div>
        <MangaSources title={query.trim()} />

        {error && (
          <div className="error-message manga-error-banner" role="alert">
            <p>{translateMessage(error)}</p>
          </div>
        )}

        <div className="manga-results-scroll">
          {loading ? (
            <div className="manga-loading-state" role="status">
              <Loader2 size={32} className="spinning" />
              <p>{tr("MangaSearchModal.3c6062e243")}</p>
            </div>
          ) : results.length === 0 ? (
            <div className="manga-empty-state">
              <BookOpen size={42} strokeWidth={1.2} />
              <h3>{tr("MangaSearchModal.34ced425d3")}</h3>
              <p>
                {tr("MangaSearchModal.d421a9003a")}</p>
            </div>
          ) : (
            <div className="manga-grid">
              {results.map((manga) => {
                const inLibrary = isAlreadyInLibrary(manga.id);
                const existing = getExistingDocument(manga.id);
                const isAdding = addingId === manga.id;
                const isReading = readingId === manga.id;

                return (
                  <article key={manga.id} className="manga-card">
                    <div className="manga-card-cover-wrapper">
                      {manga.coverThumb || manga.coverUrl ? (
                        <img
                          src={manga.coverThumb || manga.coverUrl!}
                          alt={manga.title}
                          loading="lazy"
                          className="manga-card-img"
                        />
                      ) : (
                        <div className="manga-cover-fallback">
                          <BookOpen size={28} />
                        </div>
                      )}
                      {manga.status && (
                        <span className={`manga-status-pill status-${manga.status}`} title={tr("MangaSearchModal.cbe596dcd8")}>
                          {manga.status === "completed"
                            ? tr("MangaSearchModal.a5affa11a6")
                            : manga.status === "ongoing"
                              ? tr("MangaSearchModal.273ad68f85")
                              : manga.status}
                        </span>
                      )}
                    </div>

                    <div className="manga-card-details">
                      <h4 className="manga-card-title" title={manga.title}>
                        {manga.title}
                      </h4>
                      {manga.author && (
                        <p className="manga-card-author">{manga.author}</p>
                      )}

                      {manga.tags.length > 0 && (
                        <div className="manga-tags-row">
                          {manga.tags.slice(0, 3).map((t) => (
                            <span key={t} className="manga-tag-chip">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}

                      <p className="manga-card-desc">
                        {manga.description
                          ? manga.description.slice(0, 140) + (manga.description.length > 140 ? "…" : "")
                          : tr("MangaSearchModal.f897ed55ee")}
                      </p>

                      <div className="manga-card-actions">
                        {inLibrary ? (
                          <>
                            <span className="manga-in-lib-badge">
                              <Check size={14} /> {tr("MangaSearchModal.496117e1a4")}</span>
                            <button
                              className="secondary-button compact-btn"
                              onClick={() => {
                                if (existing) {
                                  onMangaAdded(existing, true);
                                  onClose();
                                }
                              }}
                            >
                              {tr("MangaSearchModal.6f251a37d7")}<ChevronRight size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="primary-button compact-btn"
                              disabled={isAdding || isReading}
                              onClick={() => void handleAdd(manga, false)}
                            >
                              {isAdding ? (
                                <Loader2 size={14} className="spinning" />
                              ) : (
                                <Plus size={14} />
                              )}
                              {tr("MangaSearchModal.7542a5e800")}</button>
                            <button
                              className="secondary-button compact-btn"
                              disabled={isAdding || isReading}
                              onClick={() => void handleAdd(manga, true)}
                            >
                              {isReading ? (
                                <Loader2 size={14} className="spinning" />
                              ) : (
                                <BookOpen size={14} />
                              )}
                              {tr("MangaSearchModal.cd9727cf89")}</button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
