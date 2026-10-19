import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { translateMessage, tr } from "../lib/i18n.ts";
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
  useInterfaceLocale();
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
  const [saveStatus, setSaveStatus] = useState(tr("MangaReader.3a660ff5fb"));
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
      setChapterError(tr("MangaReader.80d51dab7d"));
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
          setChapterError(tr("MangaReader.84e69f48ee"));
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
          setChapterError((err as Error).message || tr("MangaReader.32ca824645"));
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
          setPagesError((err as Error).message || tr("MangaReader.86cb7c5de6"));
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

      setSaveStatus(tr("MangaReader.3c8dc4dc7a"));
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
          setSaveStatus(tr("MangaReader.3a660ff5fb"));
        } catch {
          setSaveStatus(tr("MangaReader.cfbf315662"));
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
    const label = tr("MangaReader.5b49535fc8", { v0: ch?.chapter || currentChapterIndex + 1, v1: currentPageIndex + 1 });
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
      setSaveStatus(tr("MangaReader.b029606d1f"));
      setTimeout(() => setSaveStatus(tr("MangaReader.3a660ff5fb")), 2000);
    } catch {
      setSaveStatus(tr("MangaReader.14432a6325"));
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
      aria-label={tr("a11y.MangaReader.475", { v0: document.title })}
    >
      {/* Top Header Bar */}
      <header className={`manga-reader-header ${showControls ? "visible" : "hidden"}`}>
        <div className="manga-header-left">
          <button
            className="icon-button manga-back-btn"
            onClick={onClose}
            aria-label={tr("MangaReader.183b5a7e67")}
            title={tr("MangaReader.183b5a7e67")}
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
                title={tr("MangaReader.7fe1d39dfd")}
              >
                <span>
                  {tr("MangaReader.cb954faf62")}{currentChapter.chapter}
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

          <div className="manga-mode-switcher" role="group" aria-label={tr("MangaReader.d1ca310264")}>
            <button
              className={`mode-btn ${readingMode === "rtl" ? "active" : ""}`}
              onClick={() => handleSetMode("rtl")}
              aria-pressed={readingMode === "rtl"}
              title={tr("MangaReader.ae29522f94")}
            >
              <span className="manga-mode-symbol" aria-hidden="true">📖</span> {tr("MangaReader.01e130d8de")}</button>
            <button
              className={`mode-btn ${readingMode === "ltr" ? "active" : ""}`}
              onClick={() => handleSetMode("ltr")}
              aria-pressed={readingMode === "ltr"}
              title={tr("MangaReader.394d1b96e5")}
            >
              <span className="manga-mode-symbol" aria-hidden="true">📄</span> {tr("MangaReader.51fd712bed")}</button>
            <button
              className={`mode-btn ${readingMode === "webtoon" ? "active" : ""}`}
              onClick={() => handleSetMode("webtoon")}
              aria-pressed={readingMode === "webtoon"}
              title={tr("MangaReader.77f28c4b84")}
            >
              <span className="manga-mode-symbol" aria-hidden="true">📜</span> {tr("MangaReader.a0ebe2199d")}</button>
          </div>

          <button
            className="icon-button"
            onClick={handleAddBookmark}
            title={tr("MangaReader.35755e6eab")}
            aria-label={tr("MangaReader.7ec394f252")}
          >
            <BookmarkPlus size={18} />
          </button>

          <button
            className="icon-button"
            onClick={() => setSettingsOpen((s) => !s)}
            title={tr("MangaReader.7dd7d3ef4b")}
            aria-label={tr("MangaReader.7dd7d3ef4b")}
          >
            <SlidersHorizontal size={18} />
          </button>

          <button
            className="icon-button"
            onClick={toggleFullscreen}
            title={fullscreen ? tr("MangaReader.2de6e8b7c9") : tr("MangaReader.93f2f91137")}
            aria-label={tr("MangaReader.93f2f91137")}
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
            <p>{tr("MangaReader.d7a02ac095")}</p>
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
              {tr("MangaReader.acabab5783")}{currentChapter?.chapter || ""}…
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
              <RotateCcw size={15} /> {tr("MangaReader.a8cd450971")}</button>
          </div>
        ) : currentChapter?.isExternal ? (
          <div className="manga-stage-state external-chapter-box">
            <ExternalLink size={42} />
            <h2>{tr("MangaReader.331cd5b176")}</h2>
            <p>
              {tr("MangaReader.20397c67e3")}</p>
            <MangaSources title={document.title} />
            {currentChapter.externalUrl && (
              <a
                href={currentChapter.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="primary-button"
                onClick={(e) => e.stopPropagation()}
              >
                {tr("MangaReader.2d4159daab")}<ExternalLink size={15} />
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
                  <ChevronLeft size={16} /> {tr("MangaReader.5fdb56921e")}</button>
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
                  {tr("MangaReader.5e07888c93")}<ChevronRight size={16} />
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
                  alt={tr("MangaReader.b253bd3e82", { v0: idx + 1 })}
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
                  {tr("MangaReader.b621a2cd73")}{chapters[currentChapterIndex + 1]?.chapter}
                  <ArrowRight size={18} />
                </button>
              ) : (
                <p className="manga-end-notice">
                  {tr("MangaReader.19ada4fbd7")}</p>
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
                alt={tr("MangaReader.b253bd3e82", { v0: currentPageIndex + 1 })}
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
            title={tr("MangaReader.32333919fc")}
          >
            <ChevronLeft size={16} /> {tr("MangaReader.eeadb2d1cc")}</button>
        </div>

        <div className="manga-footer-center">
          {readingMode !== "webtoon" && chapterPages.length > 0 && (
            <div className="manga-page-scrubber">
              <button
                className="icon-button"
                disabled={navReversed ? currentPageIndex >= chapterPages.length - 1 && currentChapterIndex >= chapters.length - 1 : currentPageIndex <= 0 && currentChapterIndex <= 0}
                onClick={navReversed ? goNextPage : goPrevPage}
                title={navReversed ? tr("MangaReader.9dd6b39842") : tr("MangaReader.9bcad73482")}
                aria-label={navReversed ? tr("MangaReader.9dd6b39842") : tr("MangaReader.9bcad73482")}
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
                aria-label={tr("MangaReader.b478181e15")}
              />

              <button
                className="icon-button"
                disabled={
                  navReversed ? currentPageIndex <= 0 && currentChapterIndex <= 0 : currentPageIndex >= chapterPages.length - 1 && currentChapterIndex >= chapters.length - 1
                }
                onClick={navReversed ? goPrevPage : goNextPage}
                title={navReversed ? tr("MangaReader.9bcad73482") : tr("MangaReader.9dd6b39842")}
                aria-label={navReversed ? tr("MangaReader.9bcad73482") : tr("MangaReader.9dd6b39842")}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}

          {readingMode !== "webtoon" && chapterPages.length > 0 && <span className="manga-footer-page-counter" aria-live="polite">{currentPageIndex + 1}/{chapterPages.length}</span>}
          <span className="manga-save-status-indicator" role="status">{translateMessage(saveStatus)}</span>
        </div>

        <div className="manga-footer-right">
          <button
            className="secondary-button compact-btn"
            disabled={currentChapterIndex >= chapters.length - 1}
            onClick={() => {
              setCurrentChapterIndex((c) => c + 1);
              setCurrentPageIndex(0);
            }}
            title={tr("MangaReader.89b1ad92b2")}
          >
            {tr("MangaReader.d564e74596")}<ChevronRight size={16} />
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
            aria-label={tr("MangaReader.3d97ab79f0")}
          >
            <div className="manga-drawer-header">
              <h3>{tr("MangaReader.7de4209187")}</h3>
              <button
                className="icon-button"
                onClick={() => setDrawerOpen(false)}
                aria-label={tr("MangaReader.fcbcef75b4")}
              >
                <X size={18} />
              </button>
            </div>

            <div className="manga-drawer-search">
              <input
                type="text"
                placeholder={tr("MangaReader.68d6b87407")}
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
                      <strong>{tr("MangaReader.3f7d2af0d3")}{ch.chapter}</strong>
                      {ch.title && <span>{ch.title}</span>}
                    </div>

                    <div className="manga-drawer-item-meta">
                      {ch.pages > 0 && <span>{ch.pages} {tr("MangaReader.7dd886df8f")}</span>}
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
            aria-label={tr("MangaReader.320f3e6f03")}
          >
            <div className="manga-drawer-header">
              <h3>{tr("MangaReader.2bcbd25c3f")}</h3>
              <button
                className="icon-button"
                onClick={() => setSettingsOpen(false)}
                aria-label={tr("MangaReader.0db8852ec4")}
              >
                <X size={18} />
              </button>
            </div>

            <div className="manga-settings-body"><p className="manga-touch-help">{tr("MangaReader.9f3f1c001c")}</p>
              <MangaSources title={document.title} />
              {/* Language Selection */}
              <div className="setting-group">
                <label htmlFor="manga-reader-language">{tr("MangaReader.a9345e8da6")}</label>
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
                <label>{tr("MangaReader.56a378d6c9")}</label>
                <div className="manga-theme-options">
                  <button
                    className={`theme-pill ${theme === "night" ? "active" : ""}`}
                    onClick={() => handleSetTheme("night")}
                  >
                    {tr("MangaReader.3d209e8a7d")}</button>
                  <button
                    className={`theme-pill ${theme === "sepia" ? "active" : ""}`}
                    onClick={() => handleSetTheme("sepia")}
                  >
                    {tr("MangaReader.b1e7ee821f")}</button>
                  <button
                    className={`theme-pill ${theme === "paper" ? "active" : ""}`}
                    onClick={() => handleSetTheme("paper")}
                  >
                    {tr("MangaReader.08b4c0affb")}</button>
                </div>
              </div>

              {/* Fit Mode */}
              <div className="setting-group">
                <label>{tr("MangaReader.cc3478ed50")}</label>
                <div className="manga-theme-options">
                  <button
                    className={`theme-pill ${fit === "width" ? "active" : ""}`}
                    onClick={() => setFit("width")}
                  >
                    {tr("MangaReader.b629b46b10")}</button>
                  <button
                    className={`theme-pill ${fit === "page" ? "active" : ""}`}
                    onClick={() => setFit("page")}
                  >
                    {tr("MangaReader.4812d2741c")}</button>
                </div>
              </div>

              {/* Zoom Controls */}
              <div className="setting-group">
                <label>{tr("MangaReader.efb94d17b5")}{Math.round(zoom * 100)}%)</label>
                <div className="zoom-controls-row">
                  <button
                    className="icon-button"
                    aria-label={tr("MangaReader.2370347a67")}
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
                    aria-label={tr("MangaReader.68eea7e00c")}
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
                  <strong>{tr("MangaReader.192211eab3")}</strong>
                  <p>{tr("MangaReader.12e66e6425")}</p>
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
                  <strong>{tr("MangaReader.d8cf796b8c")}</strong>
                  <p>{tr("MangaReader.d28efe1af6")}</p>
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
