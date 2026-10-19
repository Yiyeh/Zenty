import { mangaSwipe } from "../lib/manga-gestures";
import { useReaderPreference } from "../lib/useReaderPreference";
import { MangaSources } from "./MangaSources";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  List,
  SlidersHorizontal,
  BookmarkPlus,
  Maximize,
  Minimize,
  X,
  Check,
  Globe,
  Loader2,
  ExternalLink,
  BookOpen,
  ArrowRight,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { LibraryDocument, ReaderPreferences } from "../lib/library";
import {
  getMangaChapters,
  getChapterPages,
  MANGA_LANGUAGES,
  type MangaChapter,
} from "../lib/mangadex-client";
import { updateDocument } from "../lib/library-client";

interface MangaReaderProps {
  document: LibraryDocument;
  initialPreferences: ReaderPreferences;
  onUpdate: (doc: LibraryDocument) => void;
  onClose: () => void;
}

export function MangaReader({
  document,
  initialPreferences,
  onUpdate,
  onClose,
}: MangaReaderProps) {
  const mangaMeta = document.manga;
  const mangaId = mangaMeta?.mangadexId || "";

  // Chapters & Pages state
  const [chapters, setChapters] = useState<MangaChapter[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(true);
  const [chapterError, setChapterError] = useState("");
  const [currentChapterIndex, setCurrentChapterIndex] = useState(
    mangaMeta?.chapterIndex ?? document.position.unit ?? 0,
  );
  const [chapterPages, setChapterPages] = useState<string[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [pagesError, setPagesError] = useState("");
  const [currentPageIndex, setCurrentPageIndex] = useState(
    mangaMeta?.pageIndex ?? document.position.anchor ?? 0,
  );

  // Settings & Navigation
  const [language, setLanguage] = useState(mangaMeta?.language || "es-all");
  const [readingMode, setReadingMode] = useReaderPreference<"rtl" | "ltr" | "webtoon">("zenty-manga-mode", "rtl", (v): v is "rtl" | "ltr" | "webtoon" => v === "rtl" || v === "ltr" || v === "webtoon");
  const [fit, setFit] = useReaderPreference<"width" | "page">("zenty-manga-fit", initialPreferences.fit || "width", (v): v is "width" | "page" => v === "width" || v === "page");
  const [zoom, setZoom] = useReaderPreference<number>("zenty-manga-zoom", 1, (v): v is number => typeof v === "number" && v >= 0.5 && v <= 2.5);
  const [theme, setTheme] = useReaderPreference<"night" | "sepia" | "paper">("zenty-manga-theme", "night", (v): v is "night" | "sepia" | "paper" => v === "night" || v === "sepia" || v === "paper");
  const [invertNav, setInvertNav] = useReaderPreference<boolean>("zenty-manga-invert-nav", false, (v): v is boolean => typeof v === "boolean");
  const navReversed = (readingMode === "rtl") !== invertNav;
  const gesture = useRef<{x:number; y:number; at:number} | null>(null);
  const lastSwipe = useRef(0);
  const [dataSaver, setDataSaver] = useReaderPreference<boolean>("zenty-manga-data-saver", false, (v): v is boolean => typeof v === "boolean");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chapterSearch, setChapterSearch] = useState("");
  const [saveStatus, setSaveStatus] = useState("Guardado");
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Each paged view starts at the image's upper edge, including after cascade.
    if (readingMode !== "webtoon")
      containerRef.current?.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [currentChapterIndex, currentPageIndex, readingMode, fit]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentDocRef = useRef(document);
  currentDocRef.current = document;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // Prevent background scroll
  useEffect(() => {
    const prev = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    return () => {
      window.document.body.style.overflow = prev;
      d?.close();
    };
  }, []);

  // Save mode to localStorage
  const handleSetMode = (mode: "rtl" | "ltr" | "webtoon") => {
    setReadingMode(mode);
  };

  const handleSetTheme = (t: "night" | "sepia" | "paper") => {
    setTheme(t);
  };

  const handleToggleInvertNav = (val: boolean) => {
    setInvertNav(val);
  };

  // 1. Fetch chapters on mount or when language changes
  useEffect(() => {
    if (!mangaId) {
      setChapterError("Identificador de manga no encontrado.");
      setLoadingChapters(false);
      return;
    }

    let cancelled = false;
    setLoadingChapters(true);
    setChapterError("");

    void getMangaChapters(mangaId, language)
      .then((data) => {
        if (cancelled) return;
        setChapters(data.chapters);

        if (data.chapters.length === 0) {
          setChapterError("No se encontraron capítulos en este idioma para este manga.");
        } else {
          // Find matching chapter from saved metadata or index
          let idx = 0;
          if (mangaMeta?.currentChapterId) {
            const foundIdx = data.chapters.findIndex((c) => c.id === mangaMeta.currentChapterId);
            if (foundIdx >= 0) idx = foundIdx;
          } else if (
            typeof mangaMeta?.chapterIndex === "number" &&
            mangaMeta.chapterIndex < data.chapters.length
          ) {
            idx = mangaMeta.chapterIndex;
          } else if (document.position.unit < data.chapters.length) {
            idx = document.position.unit;
          }

          setCurrentChapterIndex(idx);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setChapterError((err as Error).message || "No se pudieron cargar los capítulos.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingChapters(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    mangaId,
    language,
    mangaMeta?.chapterIndex,
    mangaMeta?.currentChapterId,
    document.position.unit,
  ]);

  // 2. Fetch pages when currentChapterIndex changes
  useEffect(() => {
    if (!chapters.length || currentChapterIndex < 0 || currentChapterIndex >= chapters.length) {
      return;
    }

    const chapter = chapters[currentChapterIndex];
    if (chapter.isExternal || !chapter.id) {
      setChapterPages([]);
      setLoadingPages(false);
      return;
    }

    let cancelled = false;
    setLoadingPages(true);
    setPagesError("");

    void getChapterPages(chapter.id)
      .then((data) => {
        if (cancelled) return;
        const pageList = dataSaver && data.pagesDataSaver.length ? data.pagesDataSaver : data.pages;
        setChapterPages(pageList);

        // Adjust current page index to stay in bounds
        setCurrentPageIndex((prev) => {
          if (prev >= pageList.length) return 0;
          return prev;
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setPagesError((err as Error).message || "Error al descargar las páginas del capítulo.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPages(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chapters, currentChapterIndex, dataSaver]);

  // 3. Preload adjacent pages for instantaneous flipping
  useEffect(() => {
    if (!chapterPages.length) return;
    const preload = (url?: string) => {
      if (url) {
        const img = new Image();
        img.src = url;
      }
    };
    // Preload next 2 pages
    preload(chapterPages[currentPageIndex + 1]);
    preload(chapterPages[currentPageIndex + 2]);
    // Preload previous page
    if (currentPageIndex > 0) preload(chapterPages[currentPageIndex - 1]);
  }, [chapterPages, currentPageIndex]);

  // 4. Debounced save progress
  const persistProgress = useCallback(
    (chIdx: number, pIdx: number) => {
      if (!chapters.length || chIdx < 0 || chIdx >= chapters.length) return;
      const ch = chapters[chIdx];
      const totalCh = chapters.length;
      const totalPg = ch.pages || chapterPages.length || 1;
      const fraction = Math.min(1, Math.max(0, (pIdx + 1) / totalPg));
      const overallProgress = Math.min(0.999, (chIdx + fraction) / Math.max(1, totalCh));

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      setSaveStatus("Guardando…");
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const updated = await updateDocument(document.id, {
            totalUnits: totalCh,
            position: {
              unit: chIdx,
              anchor: pIdx,
              fraction,
              progress: overallProgress,
            },
            manga: {
              currentChapterId: ch.id,
              currentChapterNumber: ch.chapter,
              currentChapterTitle: ch.title,
              chapterIndex: chIdx,
              pageIndex: pIdx,
              totalPages: totalPg,
              language,
              lastPagePreviewUrl: chapterPages[pIdx] || undefined,
            },
          });
          onUpdateRef.current(updated);
          setSaveStatus("Guardado");
        } catch {
          setSaveStatus("Error al guardar");
        }
      }, 400);
    },
    [chapters, chapterPages, document.id, language],
  );

  // Trigger save whenever chapter or page index changes
  useEffect(() => {
    persistProgress(currentChapterIndex, currentPageIndex);
  }, [currentChapterIndex, currentPageIndex, persistProgress]);

  // Flush save on unmount or blur
  useEffect(() => {
    const flush = () => {
      if (chapters.length && currentChapterIndex < chapters.length) {
        const ch = chapters[currentChapterIndex];
        const totalCh = chapters.length;
        const totalPg = ch.pages || chapterPages.length || 1;
        const fraction = Math.min(1, Math.max(0, (currentPageIndex + 1) / totalPg));
        const overallProgress = Math.min(0.999, (currentChapterIndex + fraction) / Math.max(1, totalCh));

        void fetch(`/api/library/${document.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-MIA-Library": "1" },
          body: JSON.stringify({
            totalUnits: totalCh,
            position: {
              unit: currentChapterIndex,
              anchor: currentPageIndex,
              fraction,
              progress: overallProgress,
            },
            manga: {
              currentChapterId: ch.id,
              currentChapterNumber: ch.chapter,
              currentChapterTitle: ch.title,
              chapterIndex: currentChapterIndex,
              pageIndex: currentPageIndex,
              totalPages: totalPg,
              language,
              lastPagePreviewUrl: chapterPages[currentPageIndex] || undefined,
            },
          }),
          keepalive: true,
        }).catch(() => {});
      }
    };

    const hidden = () => { if (window.document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    window.document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.document.removeEventListener("visibilitychange", hidden);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      flush();
    };
  }, [chapters, currentChapterIndex, currentPageIndex, chapterPages.length, document.id, language]);

  // Page navigation helpers
  const goNextPage = useCallback(() => {
    if (currentPageIndex < chapterPages.length - 1) {
      setCurrentPageIndex((p) => p + 1);
    } else if (currentChapterIndex < chapters.length - 1) {
      // Go to next chapter page 0
      setCurrentChapterIndex((c) => c + 1);
      setCurrentPageIndex(0);
    }
  }, [currentPageIndex, chapterPages.length, currentChapterIndex, chapters.length]);

  const goPrevPage = useCallback(() => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex((p) => p - 1);
    } else if (currentChapterIndex > 0) {
      // Go to previous chapter last page
      const prevCh = chapters[currentChapterIndex - 1];
      setCurrentChapterIndex((c) => c - 1);
      setCurrentPageIndex(Math.max(0, (prevCh.pages || 1) - 1));
    }
  }, [currentPageIndex, currentChapterIndex, chapters]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (drawerOpen || settingsOpen) {
        if (e.key === "Escape") {
          setDrawerOpen(false);
          setSettingsOpen(false);
        }
        return;
      }

      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (navReversed) goPrevPage();
        else goNextPage();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (navReversed) goNextPage();
        else goPrevPage();
      } else if (e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        goNextPage();
      } else if (e.key === "PageUp") {
        e.preventDefault();
        goPrevPage();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen, settingsOpen, navReversed, goNextPage, goPrevPage, onClose]);

  // Handle clicking on page (left/right half for turn, center for controls)
  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (Date.now() - lastSwipe.current < 500 || zoom > 1.05) return;
    if (readingMode === "webtoon") {
      setShowControls((s) => !s);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    // Center 20% toggles controls
    if (x > width * 0.4 && x < width * 0.6) {
      setShowControls((s) => !s);
      return;
    }

    if (x < width * 0.4) {
      // Clicked left side -> go to previous page (or next if inverted)
      if (navReversed) goNextPage();
      else goPrevPage();
    } else {
      // Clicked right side -> go to next page (or prev if inverted)
      if (navReversed) goPrevPage();
      else goNextPage();
    }
  };

  // Add bookmark
  const handleAddBookmark = async () => {
    const ch = chapters[currentChapterIndex];
    const label = `Cap. ${ch?.chapter || currentChapterIndex + 1}, Pág. ${currentPageIndex + 1}`;
    try {
      const updated = await updateDocument(document.id, {
        bookmark: {
          label,
          position: {
            unit: currentChapterIndex,
            anchor: currentPageIndex,
            fraction: (currentPageIndex + 1) / (chapterPages.length || 1),
            progress: (currentChapterIndex + (currentPageIndex + 1) / (chapterPages.length || 1)) / (chapters.length || 1),
          },
        },
      });
      onUpdateRef.current(updated);
      setSaveStatus("Marcador guardado");
      setTimeout(() => setSaveStatus("Guardado"), 2000);
    } catch {
      setSaveStatus("Error al guardar marcador");
    }
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!documentRefAvailable()) return;
    if (!window.document.fullscreenElement) {
      window.document.documentElement.requestFullscreen?.().catch(() => {});
      setFullscreen(true);
    } else {
      window.document.exitFullscreen?.().catch(() => {});
      setFullscreen(false);
    }
  };

  function documentRefAvailable() {
    return typeof window !== "undefined" && typeof window.document !== "undefined";
  }

  const currentChapter = chapters[currentChapterIndex];
  const filteredChapters = chapters.filter(
    (c) =>
      c.chapter.includes(chapterSearch) ||
      (c.title && c.title.toLowerCase().includes(chapterSearch.toLowerCase())),
  );

  return (
    <dialog
      ref={dialogRef}
      className={`manga-reader-dialog theme-${theme}`}
      aria-label={`Lector de ${document.title}`}
    >
      {/* Top Header Bar */}
      <header className={`manga-reader-header ${showControls ? "visible" : "hidden"}`}>
        <div className="manga-header-left">
          <button
            className="icon-button manga-back-btn"
            onClick={onClose}
            aria-label="Volver a la biblioteca"
            title="Volver a la biblioteca"
          >
            <ArrowLeft size={19} />
          </button>

          <div className="manga-header-title-block">
            <h1 className="manga-title" title={document.title}>
              {document.title}
            </h1>
            {currentChapter && (
              <button
                className="manga-chapter-selector-pill"
                onClick={() => setDrawerOpen(true)}
                title="Cambiar de capítulo"
              >
                <span>
                  Cap. {currentChapter.chapter}
                  {currentChapter.title ? `: ${currentChapter.title}` : ""}
                </span>
                <List size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="manga-header-right">
          {chapterPages.length > 0 && readingMode !== "webtoon" && (
            <span className="manga-page-counter">
              {currentPageIndex + 1} / {chapterPages.length}
            </span>
          )}

          <div className="manga-mode-switcher" role="group" aria-label="Modo de lectura">
            <button
              className={`mode-btn ${readingMode === "rtl" ? "active" : ""}`}
              onClick={() => handleSetMode("rtl")}
              aria-pressed={readingMode === "rtl"}
              title="Manga (Derecha a izquierda)"
            >
              <span className="manga-mode-symbol" aria-hidden="true">📖</span> Manga
            </button>
            <button
              className={`mode-btn ${readingMode === "ltr" ? "active" : ""}`}
              onClick={() => handleSetMode("ltr")}
              aria-pressed={readingMode === "ltr"}
              title="Occidental (Izquierda a derecha)"
            >
              <span className="manga-mode-symbol" aria-hidden="true">📄</span> Comic
            </button>
            <button
              className={`mode-btn ${readingMode === "webtoon" ? "active" : ""}`}
              onClick={() => handleSetMode("webtoon")}
              aria-pressed={readingMode === "webtoon"}
              title="Cascada vertical (Webtoon)"
            >
              <span className="manga-mode-symbol" aria-hidden="true">📜</span> Cascada
            </button>
          </div>

          <button
            className="icon-button"
            onClick={handleAddBookmark}
            title="Añadir marcador a esta página"
            aria-label="Añadir marcador"
          >
            <BookmarkPlus size={18} />
          </button>

          <button
            className="icon-button"
            onClick={() => setSettingsOpen((s) => !s)}
            title="Ajustes de lectura"
            aria-label="Ajustes de lectura"
          >
            <SlidersHorizontal size={18} />
          </button>

          <button
            className="icon-button"
            onClick={toggleFullscreen}
            title={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            aria-label="Pantalla completa"
          >
            {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </header>

      {/* Main Reading Stage */}
      <main
        ref={containerRef}
        className={`manga-reader-stage fit-${fit} mode-${readingMode}`}
        onClick={handlePageClick}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          gesture.current = event.touches.length === 1 ? {x:touch.clientX,y:touch.clientY,at:Date.now()} : null;
        }}
        onTouchMove={(event) => { if (event.touches.length !== 1) gesture.current = null; }}
        onTouchCancel={() => { gesture.current = null; }}
        onTouchEnd={(event) => {
          const start = gesture.current; gesture.current = null;
          const end = event.changedTouches[0];
          if (!start || !end || event.touches.length || loadingPages || settingsOpen || drawerOpen) return;
          const action = mangaSwipe({dx:end.clientX-start.x,dy:end.clientY-start.y,elapsed:Date.now()-start.at,mode:readingMode,inverted:invertNav,zoom});
          if (!action) return;
          lastSwipe.current = Date.now();
          if (action === "next") goNextPage(); else goPrevPage();
        }}
      >
        {loadingChapters ? (
          <div className="manga-stage-state">
            <Loader2 size={36} className="spinning" />
            <p>Cargando lista de capítulos de MangaDex…</p>
          </div>
        ) : chapterError ? (
          <div className="manga-stage-state">
            <BookOpen size={40} />
            <p>{chapterError}</p>
            <MangaSources title={document.title} />
            <div className="manga-stage-actions">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="manga-lang-switch-select"
              >
                {MANGA_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : loadingPages ? (
          <div className="manga-stage-state">
            <Loader2 size={36} className="spinning" />
            <p>
              Cargando páginas del capítulo {currentChapter?.chapter || ""}…
            </p>
          </div>
        ) : pagesError ? (
          <div className="manga-stage-state">
            <BookOpen size={40} />
            <p>{pagesError}</p>
            <button
              className="primary-button"
              onClick={() => {
                const ch = chapters[currentChapterIndex];
                if (ch) {
                  setLoadingPages(true);
                  setPagesError("");
                  getChapterPages(ch.id)
                    .then((d) => setChapterPages(d.pages))
                    .catch((e) => setPagesError(e.message))
                    .finally(() => setLoadingPages(false));
                }
              }}
            >
              <RotateCcw size={15} /> Reintentar
            </button>
          </div>
        ) : currentChapter?.isExternal ? (
          <div className="manga-stage-state external-chapter-box">
            <ExternalLink size={42} />
            <h2>Capítulo en fuente externa</h2>
            <p>
              Este capítulo está disponible a través de la editorial oficial.
            </p>
            <MangaSources title={document.title} />
            {currentChapter.externalUrl && (
              <a
                href={currentChapter.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="primary-button"
                onClick={(e) => e.stopPropagation()}
              >
                Leer en la web oficial
                <ExternalLink size={15} />
              </a>
            )}
            <div className="manga-stage-actions">
              {currentChapterIndex > 0 && (
                <button
                  className="secondary-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentChapterIndex((c) => c - 1);
                    setCurrentPageIndex(0);
                  }}
                >
                  <ChevronLeft size={16} /> Capítulo anterior
                </button>
              )}
              {currentChapterIndex < chapters.length - 1 && (
                <button
                  className="secondary-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentChapterIndex((c) => c + 1);
                    setCurrentPageIndex(0);
                  }}
                >
                  Siguiente capítulo <ChevronRight size={16} />
                </button>
              )}
            </div>
          </div>
        ) : readingMode === "webtoon" ? (
          /* Webtoon / Vertical Cascade View */
          <div className="manga-webtoon-stream" onClick={(e) => e.stopPropagation()}>
            {chapterPages.map((pageUrl, idx) => (
              <div key={idx} className="manga-webtoon-page-wrapper">
                <img
                  src={pageUrl}
                  alt={`Página ${idx + 1}`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="manga-webtoon-img"
                  style={{
                    maxWidth: fit === "page" ? "800px" : `${zoom * 100}%`,
                  }}
                />
                <span className="manga-page-watermark">{idx + 1}</span>
              </div>
            ))}

            {/* Next Chapter CTA at end of webtoon */}
            <div className="manga-webtoon-footer">
              {currentChapterIndex < chapters.length - 1 ? (
                <button
                  className="primary-button large-btn"
                  onClick={() => {
                    setCurrentChapterIndex((c) => c + 1);
                    setCurrentPageIndex(0);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Siguiente capítulo: Cap. {chapters[currentChapterIndex + 1]?.chapter}
                  <ArrowRight size={18} />
                </button>
              ) : (
                <p className="manga-end-notice">
                  ¡Has llegado al último capítulo disponible en este idioma!
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Page-by-Page View (RTL Manga or LTR Comic) */
          <div
            className="manga-single-page-wrapper"
            style={{
              transform: zoom !== 1 ? `scale(${zoom})` : undefined,
              transformOrigin: "center top",
            }}
          >
            {chapterPages[currentPageIndex] && (
              <img
                key={chapterPages[currentPageIndex]}
                src={chapterPages[currentPageIndex]}
                alt={`Página ${currentPageIndex + 1}`}
                referrerPolicy="no-referrer"
                className="manga-active-page-img"
              />
            )}
          </div>
        )}
      </main>

      {/* Bottom Navigation Controls Bar */}
      <footer className={`manga-reader-footer ${showControls ? "visible" : "hidden"}`}>
        <div className="manga-footer-left">
          <button
            className="secondary-button compact-btn"
            disabled={currentChapterIndex <= 0}
            onClick={() => {
              setCurrentChapterIndex((c) => c - 1);
              setCurrentPageIndex(0);
            }}
            title="Capítulo anterior"
          >
            <ChevronLeft size={16} /> Cap. anterior
          </button>
        </div>

        <div className="manga-footer-center">
          {readingMode !== "webtoon" && chapterPages.length > 0 && (
            <div className="manga-page-scrubber">
              <button
                className="icon-button"
                disabled={navReversed ? currentPageIndex >= chapterPages.length - 1 && currentChapterIndex >= chapters.length - 1 : currentPageIndex <= 0 && currentChapterIndex <= 0}
                onClick={navReversed ? goNextPage : goPrevPage}
                title={navReversed ? "Página siguiente" : "Página anterior"}
                aria-label={navReversed ? "Página siguiente" : "Página anterior"}
              >
                <ChevronLeft size={18} />
              </button>

              <input
                type="range"
                min={0}
                max={Math.max(0, chapterPages.length - 1)}
                value={currentPageIndex}
                onChange={(e) => setCurrentPageIndex(parseInt(e.target.value, 10))}
                className="manga-range-slider"
                aria-label="Página del capítulo"
              />

              <button
                className="icon-button"
                disabled={
                  navReversed ? currentPageIndex <= 0 && currentChapterIndex <= 0 : currentPageIndex >= chapterPages.length - 1 && currentChapterIndex >= chapters.length - 1
                }
                onClick={navReversed ? goPrevPage : goNextPage}
                title={navReversed ? "Página anterior" : "Página siguiente"}
                aria-label={navReversed ? "Página anterior" : "Página siguiente"}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}

          {readingMode !== "webtoon" && chapterPages.length > 0 && <span className="manga-footer-page-counter" aria-live="polite">{currentPageIndex + 1}/{chapterPages.length}</span>}
          <span className="manga-save-status-indicator" role="status">{saveStatus}</span>
        </div>

        <div className="manga-footer-right">
          <button
            className="secondary-button compact-btn"
            disabled={currentChapterIndex >= chapters.length - 1}
            onClick={() => {
              setCurrentChapterIndex((c) => c + 1);
              setCurrentPageIndex(0);
            }}
            title="Siguiente capítulo"
          >
            Sig. capítulo <ChevronRight size={16} />
          </button>
        </div>
      </footer>

      {/* Chapters Drawer / Modal */}
      {drawerOpen && (
        <div className="manga-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div
            className="manga-drawer-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Capítulos de manga"
          >
            <div className="manga-drawer-header">
              <h3>Índice de capítulos</h3>
              <button
                className="icon-button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Cerrar índice"
              >
                <X size={18} />
              </button>
            </div>

            <div className="manga-drawer-search">
              <input
                type="text"
                placeholder="Buscar capítulo..."
                value={chapterSearch}
                onChange={(e) => setChapterSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className="manga-drawer-list">
              {filteredChapters.map((ch) => {
                const isSelected = ch.id === currentChapter?.id;
                return (
                  <button
                    key={ch.id}
                    className={`manga-drawer-item ${isSelected ? "active" : ""}`}
                    onClick={() => {
                      const realIndex = chapters.findIndex((c) => c.id === ch.id);
                      if (realIndex >= 0) {
                        setCurrentChapterIndex(realIndex);
                        setCurrentPageIndex(0);
                        setDrawerOpen(false);
                      }
                    }}
                  >
                    <div className="manga-drawer-item-title">
                      <strong>Capítulo {ch.chapter}</strong>
                      {ch.title && <span>{ch.title}</span>}
                    </div>

                    <div className="manga-drawer-item-meta">
                      {ch.pages > 0 && <span>{ch.pages} págs.</span>}
                      {ch.scanlationGroup && <small>{ch.scanlationGroup}</small>}
                      {ch.isExternal && <ExternalLink size={12} />}
                      {isSelected && <Check size={16} className="selected-icon" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Settings Dialog */}
      {settingsOpen && (
        <div className="manga-drawer-overlay" onClick={() => setSettingsOpen(false)}>
          <div
            className="manga-settings-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Ajustes del lector de manga"
          >
            <div className="manga-drawer-header">
              <h3>Ajustes del lector</h3>
              <button
                className="icon-button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Cerrar ajustes"
              >
                <X size={18} />
              </button>
            </div>

            <div className="manga-settings-body"><p className="manga-touch-help">Desliza a la derecha para avanzar en Manga; a la izquierda en Comic. En Cascada, desplázate verticalmente. Puedes ampliar con dos dedos.</p>
              <MangaSources title={document.title} />
              {/* Language Selection */}
              <div className="setting-group">
                <label htmlFor="manga-reader-language">Idioma de traducción</label>
                <div className="manga-lang-picker">
                  <Globe size={16} />
                  <select
                    id="manga-reader-language"
                    value={language}
                    onChange={(e) => {
                      setLanguage(e.target.value);
                      setCurrentPageIndex(0);
                    }}
                  >
                    {MANGA_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Theme Selection */}
              <div className="setting-group">
                <label>Ambiente de lectura</label>
                <div className="manga-theme-options">
                  <button
                    className={`theme-pill ${theme === "night" ? "active" : ""}`}
                    onClick={() => handleSetTheme("night")}
                  >
                    🌙 Noche
                  </button>
                  <button
                    className={`theme-pill ${theme === "sepia" ? "active" : ""}`}
                    onClick={() => handleSetTheme("sepia")}
                  >
                    📜 Sepia
                  </button>
                  <button
                    className={`theme-pill ${theme === "paper" ? "active" : ""}`}
                    onClick={() => handleSetTheme("paper")}
                  >
                    ☀️ Papel
                  </button>
                </div>
              </div>

              {/* Fit Mode */}
              <div className="setting-group">
                <label>Ajuste de página</label>
                <div className="manga-theme-options">
                  <button
                    className={`theme-pill ${fit === "width" ? "active" : ""}`}
                    onClick={() => setFit("width")}
                  >
                    Ajustar ancho
                  </button>
                  <button
                    className={`theme-pill ${fit === "page" ? "active" : ""}`}
                    onClick={() => setFit("page")}
                  >
                    Ajustar pantalla
                  </button>
                </div>
              </div>

              {/* Zoom Controls */}
              <div className="setting-group">
                <label>Zoom ({Math.round(zoom * 100)}%)</label>
                <div className="zoom-controls-row">
                  <button
                    className="icon-button"
                    aria-label="Reducir zoom"
                    disabled={zoom <= 0.6}
                    onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))}
                  >
                    <ZoomOut size={16} />
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setZoom(1)}
                  >
                    100%
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Aumentar zoom"
                    disabled={zoom >= 2.5}
                    onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.15).toFixed(2))))}
                  >
                    <ZoomIn size={16} />
                  </button>
                </div>
              </div>

              {/* Invert Navigation Toggle */}
              <div className="setting-group toggle-group">
                <div>
                  <strong>Invertir dirección de navegación</strong>
                  <p>Invierte las flechas, los toques y los deslizamientos del modo elegido.</p>
                </div>
                <input
                  type="checkbox"
                  checked={invertNav}
                  onChange={(e) => handleToggleInvertNav(e.target.checked)}
                />
              </div>

              {/* Data Saver Mode Toggle */}
              <div className="setting-group toggle-group">
                <div>
                  <strong>Modo Ahorro de Datos</strong>
                  <p>Descarga imágenes comprimidas para conexiones lentas.</p>
                </div>
                <input
                  type="checkbox"
                  checked={dataSaver}
                  onChange={(e) => setDataSaver(e.target.checked)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
