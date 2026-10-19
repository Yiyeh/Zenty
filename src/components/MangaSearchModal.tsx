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
        setError((err as Error).message || "No se pudo conectar con MangaDex.");
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
      setError((err as Error).message || "No se pudo añadir el manga a la biblioteca.");
    } finally {
      setAddingId(null);
      setReadingId(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Explorar MangaDex"
      wide
      description="Descubre y añade mangas a tu biblioteca personal con guardado automático de capítulos y páginas."
    >
      <div className="manga-modal-content">
        <div className="manga-search-bar-row">
          <div className="manga-filter-field">
          <label htmlFor="mangadex-title">Buscar manga</label>
          <div className="input-icon manga-search-input-wrapper">
            <Search size={18} />
            <input
              ref={searchInputRef}
              type="text"
              id="mangadex-title"
              placeholder="Título del manga…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar mangas en MangaDex"
            />
            {query && (
              <button
                className="icon-button manga-clear-btn"
                onClick={() => setQuery("")}
                aria-label="Limpiar búsqueda"
              >
                <X size={15} />
              </button>
            )}
          </div>
          </div>
          <div className="manga-filter-field">
          <label htmlFor="mangadex-language">Idioma de los capítulos</label>
          <div className="manga-lang-select-wrapper">
            <Globe size={16} className="lang-icon" aria-hidden="true" />
            <select
              id="mangadex-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              aria-label="Filtrar por idioma"
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
              ? `Resultados para «${query.trim()}»`
              : "Mangas populares y recomendados en MangaDex"}
          </span>
          {results.length > 0 && !loading && (
            <small>{results.length} títulos disponibles</small>
          )}
        </div>
        <MangaSources title={query.trim()} />

        {error && (
          <div className="error-message manga-error-banner" role="alert">
            <p>{error}</p>
          </div>
        )}

        <div className="manga-results-scroll">
          {loading ? (
            <div className="manga-loading-state" role="status">
              <Loader2 size={32} className="spinning" />
              <p>Consultando MangaDex...</p>
            </div>
          ) : results.length === 0 ? (
            <div className="manga-empty-state">
              <BookOpen size={42} strokeWidth={1.2} />
              <h3>No se encontraron mangas</h3>
              <p>
                Prueba con otro título o cambia el filtro de idioma a «Todos los idiomas».
              </p>
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
                        <span className={`manga-status-pill status-${manga.status}`} title="Estado de publicación de la obra; las traducciones pueden estar incompletas.">
                          {manga.status === "completed"
                            ? "Finalizado"
                            : manga.status === "ongoing"
                              ? "En emisión"
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
                          : "Sin descripción disponible en este idioma."}
                      </p>

                      <div className="manga-card-actions">
                        {inLibrary ? (
                          <>
                            <span className="manga-in-lib-badge">
                              <Check size={14} /> En biblioteca
                            </span>
                            <button
                              className="secondary-button compact-btn"
                              onClick={() => {
                                if (existing) {
                                  onMangaAdded(existing, true);
                                  onClose();
                                }
                              }}
                            >
                              Leer <ChevronRight size={14} />
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
                              Añadir
                            </button>
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
                              Leer ahora
                            </button>
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
