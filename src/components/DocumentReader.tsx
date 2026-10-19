import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  BookmarkPlus,
  Download,
  BookOpen,
  X,
  Check,
  Bookmark,
  Maximize,
  Minimize,
} from "lucide-react";
import type {
  LibraryDocument,
  ReadingPosition,
  ReaderPreferences,
} from "../lib/library";
import type { ReaderBook } from "../lib/book-parser";
import { openBook } from "../lib/book-parser";
import { updateDocument, updateReaderPreferences } from "../lib/library-client";
function PdfPage({
  book,
  index,
  preferences,
  onReady,
  onError,
}: {
  book: ReaderBook;
  index: number;
  preferences: ReaderPreferences;
  onReady: () => void;
  onError: (message: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 800 });
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      setSize({ width: box.width, height: box.height });
    });
    observer.observe(area.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    let render: { cancel: () => void } | undefined;
    void (async () => {
      try {
        const page = await book.pdf!.getPage(index + 1);
        if (cancelled) return;
        const original = page.getViewport({ scale: 1 });
        const fit =
          preferences.fit === "page"
            ? Math.min(
                (size.width - 36) / original.width,
                (size.height - 36) / original.height,
              )
            : (size.width - 36) / original.width;
        const scale = Math.max(0.1, Math.min(2, fit)) * preferences.zoom;
        const viewport = page.getViewport({ scale });
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const element = canvas.current!;
        element.width = Math.round(viewport.width * dpr);
        element.height = Math.round(viewport.height * dpr);
        element.style.width = `${viewport.width}px`;
        element.style.height = `${viewport.height}px`;
        const task = page.render({
          canvas: element,
          canvasContext: element.getContext("2d")!,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        render = task;
        await task.promise;
        if (!cancelled) callbacks.current.onReady();
      } catch (error) {
        if (
          !cancelled &&
          (error as Error).name !== "RenderingCancelledException"
        )
          callbacks.current.onError(
            "No se pudo mostrar esta página del PDF. Prueba otra página o descarga el original.",
          );
      }
    })();
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [book, index, preferences.zoom, preferences.fit, size.width, size.height]);
  return (
    <div ref={area} className="reader-visual-scroll">
      <canvas ref={canvas} aria-label={`Página ${index + 1} del PDF`} />
    </div>
  );
}
function ImagePage({
  book,
  index,
  preferences,
  onReady,
  onError,
}: {
  book: ReaderBook;
  index: number;
  preferences: ReaderPreferences;
  onReady: () => void;
  onError: (message: string) => void;
}) {
  const [url, setUrl] = useState("");
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  useEffect(() => {
    let cancelled = false;
    setUrl("");
    book.image!(index)
      .then((value) => {
        if (!cancelled) setUrl(value);
      })
      .catch(() => {
        if (!cancelled)
          callbacks.current.onError("No se pudo abrir esta imagen del cómic.");
      });
    return () => {
      cancelled = true;
    };
  }, [book, index]);
  return (
    <div className={`reader-visual-scroll comic-page fit-${preferences.fit}`}>
      <img
        src={url || undefined}
        alt={`Página ${index + 1}`}
        onLoad={() => callbacks.current.onReady()}
        onError={() => {
          if (url)
            callbacks.current.onError("La imagen no se pudo decodificar.");
        }}
        style={{
          width:
            preferences.fit === "width"
              ? `${preferences.zoom * 100}%`
              : undefined,
          maxHeight:
            preferences.fit === "page"
              ? `${preferences.zoom * 100}%`
              : undefined,
        }}
      />
    </div>
  );
}
const themes = {
  paper: { bg: "#ffffff", ink: "#2e3430", muted: "#717b72" },
  sepia: { bg: "#f5eedf", ink: "#4d4637", muted: "#8b806a" },
  night: { bg: "#202125", ink: "#d6d7db", muted: "#93959d" },
};
export function DocumentReader({
  document,
  initialPreferences,
  onClose,
  onUpdate,
}: {
  document: LibraryDocument;
  initialPreferences: ReaderPreferences;
  onClose: () => void;
  onUpdate: (doc: LibraryDocument) => void;
}) {
  const [book, setBook] = useState<ReaderBook | null>(null);
  const [unit, setUnit] = useState(document.position.unit);
  const [html, setHtml] = useState("");
  const [preferences, setPreferences] = useState(initialPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("Guardado");
  const [saveError, setSaveError] = useState(false);
  const [full, setFull] = useState(false);
  const [currentDoc, setCurrentDoc] = useState(document);
  const originalDocument = useRef(document);
  const frame = useRef<HTMLIFrameElement>(null);
  const root = useRef<HTMLDialogElement>(null);
  const latest = useRef<ReadingPosition>({ ...document.position });
  const saved = useRef<ReadingPosition>({ ...document.position });
  const queuedPosition = useRef<ReadingPosition | null>({
    ...document.position,
  });
  const pending = useRef<ReadingPosition | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef(Promise.resolve(true));
  const updateRef = useRef(onUpdate);
  updateRef.current = onUpdate;
  const writePosition = (position: ReadingPosition) => {
    if (JSON.stringify(position) === JSON.stringify(queuedPosition.current))
      return queue.current;
    queuedPosition.current = { ...position };
    setSaveStatus("Guardando…");
    queue.current = queue.current.then(async () => {
      try {
        const next = await updateDocument(document.id, { position });
        saved.current = { ...position };
        setCurrentDoc(next);
        updateRef.current(next);
        setSaveStatus("Guardado en tu carpeta");
        setSaveError(false);
        return true;
      } catch {
        setSaveStatus("No se pudo guardar · reintenta al salir");
        if (JSON.stringify(queuedPosition.current) === JSON.stringify(position))
          queuedPosition.current = null;
        setSaveError(true);
        return false;
      }
    });
    return queue.current;
  };
  const writeRef = useRef(writePosition);
  writeRef.current = writePosition;
  const remember = (position: ReadingPosition) => {
    latest.current = position;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(
      () => void writeRef.current({ ...position }),
      500,
    );
  };
  const rememberRef = useRef(remember);
  rememberRef.current = remember;
  useEffect(() => {
    const document = originalDocument.current;
    const controller = new AbortController();
    let loaded: ReaderBook | null = null;
    void openBook(document, controller.signal)
      .then((value) => {
        loaded = value;
        if (controller.signal.aborted) {
          value.cleanup();
          return;
        }
        setBook(value);
        const index = Math.min(value.total - 1, document.position.unit);
        setUnit(index);
        if (index !== document.position.unit)
          latest.current = { unit: index, anchor: 0, fraction: 0, progress: 0 };
        void updateDocument(document.id, { totalUnits: value.total })
          .then((doc) => {
            setCurrentDoc(doc);
            updateRef.current(doc);
          })
          .catch(() =>
            setSaveStatus("No se pudo guardar el número de páginas"),
          );
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(
            e.name === "PasswordException"
              ? "Este PDF está protegido con contraseña. Importa una copia desbloqueada que tengas derecho a leer."
              : e.message || "No se pudo abrir el documento.",
          );
          setBusy(false);
        }
      });
    return () => {
      controller.abort();
      loaded?.cleanup();
    };
  }, []);
  useEffect(() => {
    const previous = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    const dialog = root.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      window.document.body.style.overflow = previous;
      dialog?.close();
    };
  }, []);
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (prefTimer.current) clearTimeout(prefTimer.current);
    },
    [],
  );
  useEffect(() => {
    const flush = () => {
      if (!book) return;
      const position = latest.current;
      if (JSON.stringify(position) === JSON.stringify(saved.current)) return;
      void fetch(`/api/library/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-MIA-Library": "1" },
        body: JSON.stringify({ position }),
        keepalive: true,
      }).catch(() => {});
    };
    const hidden = () => {
      if (window.document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    window.document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.document.removeEventListener("visibilitychange", hidden);
    };
  }, [book, document.id]);
  useEffect(() => {
    if (!book) return;
    setError("");
    setBusy(true);
    if (book.kind === "reflow") {
      let cancelled = false;
      book.chapter!(unit)
        .then((content) => {
          if (!cancelled) setHtml(content);
        })
        .catch((e) => {
          if (!cancelled) {
            setError(e.message || "No se pudo abrir el capítulo.");
            setBusy(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }
  }, [book, unit]);
  const go = (next: number, position?: ReadingPosition) => {
    if (!book) return;
    const index = Math.max(0, Math.min(book.total - 1, next));
    pending.current = position || {
      unit: index,
      anchor: 0,
      fraction: 0,
      progress: index / book.total,
    };
    latest.current = pending.current;
    setUnit(index);
    if (index === unit && book.kind === "reflow") restoreFrame();
  };
  const navigateRef = useRef({ go, unit, book, preferences });
  navigateRef.current = { go, unit, book, preferences };
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (
        ["INPUT", "SELECT", "TEXTAREA"].includes(
          (e.target as HTMLElement)?.tagName,
        ) ||
        window.document.querySelector("dialog[open]")
      )
        return;
      const state = navigateRef.current;
      if (e.key === "Escape") {
        setSettingsOpen(false);
        setContentsOpen(false);
      }
      const direction =
        state.preferences.rtl && state.book?.kind === "images" ? -1 : 1;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        state.go(state.unit + direction);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        state.go(state.unit - direction);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  useEffect(() => {
    const changed = () => setFull(!!window.document.fullscreenElement);
    window.document.addEventListener("fullscreenchange", changed);
    return () =>
      window.document.removeEventListener("fullscreenchange", changed);
  }, []);
  const apply = (patch: Partial<ReaderPreferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    setSaveStatus("Guardando ajustes…");
    if (prefTimer.current) clearTimeout(prefTimer.current);
    prefTimer.current = setTimeout(() => {
      void updateReaderPreferences(next)
        .then(() => setSaveStatus("Ajustes guardados"))
        .catch(() => setSaveStatus("No se pudieron guardar los ajustes"));
    }, 400);
  };
  const close = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const stored = await writeRef.current({ ...latest.current });
    if (!stored) return;
    if (prefTimer.current) {
      clearTimeout(prefTimer.current);
      await updateReaderPreferences(preferences).catch(() => {});
    }
    if (window.document.fullscreenElement)
      await window.document.exitFullscreen();
    onClose();
  };
  const restoreFrame = () => {
    const doc = frame.current?.contentDocument;
    if (!doc || !book) return;
    const p = pending.current || latest.current;
    const children = Array.from(doc.body.children) as HTMLElement[];
    const child = children[Math.min(children.length - 1, p.anchor)];
    const top = child
      ? child.offsetTop + Math.max(0, child.offsetHeight) * p.fraction
      : 0;
    frame.current?.contentWindow?.scrollTo(0, top);
    pending.current = null;
  };
  const frameLoad = () => {
    const doc = frame.current?.contentDocument;
    const win = frame.current?.contentWindow;
    if (!doc || !win || !book) return;
    let ready = false;
    const track = () => {
      if (!ready) return;
      const top = doc.documentElement.scrollTop || doc.body.scrollTop;
      const children = Array.from(doc.body.children) as HTMLElement[];
      const anchor = Math.max(
        0,
        children.findIndex(
          (node) => node.offsetTop + node.offsetHeight > top + 2,
        ),
      );
      const node = children[anchor];
      const fraction = node
        ? Math.max(
            0,
            Math.min(
              1,
              (top - node.offsetTop) / Math.max(1, node.offsetHeight),
            ),
          )
        : 0;
      const max = Math.max(
        1,
        doc.documentElement.scrollHeight - win.innerHeight,
      );
      const ratio =
        doc.documentElement.scrollHeight <= win.innerHeight + 2
          ? 1
          : Math.min(1, top / max);
      rememberRef.current({
        unit,
        anchor,
        fraction,
        progress: Math.min(1, (unit + ratio) / book.total),
      });
    };
    const finish = () =>
      win.requestAnimationFrame(() => {
        restoreFrame();
        ready = true;
        setBusy(false);
        track();
      });
    void Promise.all(
      Array.from(doc.images).map((image) => image.decode().catch(() => {})),
    ).then(finish);
    win.addEventListener("scroll", track, { passive: true });
    doc.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const n = navigateRef.current;
        n.go(n.unit + (e.key === "ArrowRight" ? 1 : -1));
      }
    });
  };
  const visualReady = () => {
    setBusy(false);
    remember({
      unit,
      anchor: 0,
      fraction: 0,
      progress: book ? (unit + 1) / book.total : 0,
    });
  };
  const palette = themes[preferences.theme];
  const source = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>*{box-sizing:border-box}html{background:${palette.bg};color:${palette.ink};scrollbar-width:thin}body{max-width:${preferences.width}px;margin:0 auto;padding:42px 26px 100px;font-family:${preferences.font === "serif" ? "Georgia,serif" : "system-ui,sans-serif"};font-size:${preferences.fontSize}px;line-height:${preferences.lineHeight};overflow-wrap:anywhere}p{margin:0 0 1.1em;white-space:pre-wrap}h1,h2,h3{line-height:1.35;margin:1.6em 0 .7em}img{max-width:100%;height:auto;display:block;margin:1.5em auto}table{border-collapse:collapse;max-width:100%;font-size:.85em}td,th{border:1px solid ${palette.muted};padding:.5em}a{color:inherit}pre{white-space:pre-wrap}blockquote{border-left:2px solid ${palette.muted};margin-left:0;padding-left:1em}::selection{background:#b7bf9360}@media(max-width:500px){body{padding:25px 22px 75px}}</style></head><body>${html}</body></html>`;
  return (
    <dialog
      ref={root}
      aria-label={`Leyendo: ${currentDoc.title}`}
      onCancel={(event) => {
        event.preventDefault();
        if (settingsOpen || contentsOpen) {
          setSettingsOpen(false);
          setContentsOpen(false);
        } else void close();
      }}
      className={`document-reader reader-theme-${preferences.theme}`}
      style={
        {
          "--reader-bg": palette.bg,
          "--reader-ink": palette.ink,
        } as React.CSSProperties
      }
    >
      <header className="reader-toolbar">
        <button className="secondary-button" onClick={() => void close()}>
          <ArrowLeft size={16} />
          <span>Mi biblioteca</span>
        </button>
        <div className="reader-title">
          <strong>{currentDoc.title}</strong>
          <small>
            {currentDoc.format.toUpperCase()} ·{" "}
            {book?.kind === "reflow"
              ? "Lectura adaptable"
              : "Páginas originales"}
          </small>
        </div>
        {saveError && (
          <button className="text-button danger" onClick={onClose}>
            Salir sin guardar
          </button>
        )}
        <div className="reader-toolbar-actions">
          <button
            className="icon-button"
            aria-label="Índice y marcadores"
            aria-expanded={contentsOpen}
            onClick={() => {
              setContentsOpen(!contentsOpen);
              setSettingsOpen(false);
            }}
          >
            <BookOpen size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="Añadir marcador de lectura"
            disabled={!book || busy}
            onClick={() =>
              void updateDocument(document.id, {
                bookmark: {
                  label: `${book?.kind === "reflow" ? "Sección" : "Página"} ${unit + 1}`,
                  position: { ...latest.current },
                },
              })
                .then((doc) => {
                  setCurrentDoc(doc);
                  updateRef.current(doc);
                  setSaveStatus("Marcador guardado");
                })
                .catch(() => setSaveStatus("No se pudo guardar el marcador"))
            }
          >
            <BookmarkPlus size={19} />
          </button>
          <a
            className="icon-button"
            aria-label="Descargar documento original"
            href={`/api/library/${document.id}/file`}
            download={document.name}
          >
            <Download size={18} />
          </a>
          <button
            className="icon-button reader-fullscreen"
            aria-label={
              full ? "Salir de pantalla completa" : "Pantalla completa"
            }
            onClick={() => {
              if (!root.current) return;
              void (
                full
                  ? window.document.exitFullscreen()
                  : root.current.requestFullscreen()
              ).catch(() =>
                setSaveStatus("El navegador no permite pantalla completa"),
              );
            }}
          >
            {full ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
          <button
            className="reader-settings-toggle"
            aria-label="Ajustar modo de lectura"
            aria-expanded={settingsOpen}
            onClick={() => {
              setSettingsOpen(!settingsOpen);
              setContentsOpen(false);
            }}
          >
            <SlidersHorizontal size={17} />
            <span>Aa</span>
          </button>
        </div>
      </header>
      <div
        className="reader-stage"
        style={{ filter: `brightness(${preferences.brightness})` }}
      >
        {error ? (
          <div className="reader-message" role="alert">
            <BookOpen size={32} />
            <h2>No pudimos abrir esta lectura</h2>
            <p>{error}</p>
            <button className="secondary-button" onClick={() => void close()}>
              Volver a la biblioteca
            </button>
          </div>
        ) : (
          <>
            {book?.kind === "pdf" && (
              <PdfPage
                book={book}
                index={unit}
                preferences={preferences}
                onReady={visualReady}
                onError={setError}
              />
            )}{" "}
            {book?.kind === "images" && (
              <ImagePage
                book={book}
                index={unit}
                preferences={preferences}
                onReady={visualReady}
                onError={setError}
              />
            )}{" "}
            {book?.kind === "reflow" && html && (
              <iframe
                ref={frame}
                title="Contenido del documento"
                className="reader-frame"
                sandbox="allow-same-origin"
                srcDoc={source}
                onLoad={frameLoad}
              />
            )}{" "}
            {busy && (
              <div className="reader-loading" role="status">
                Preparando tu lectura…
              </div>
            )}
          </>
        )}
      </div>
      {settingsOpen && (
        <aside className="reader-sidepanel" aria-label="Opciones de lectura">
          <div className="widget-heading">
            <h3>Encuentra tu comodidad</h3>
            <button
              className="icon-button"
              aria-label="Cerrar opciones de lectura"
              onClick={() => setSettingsOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="form-stack">
            <fieldset>
              <legend>Ambiente</legend>
              <div className="reader-theme-choices">
                {(["paper", "sepia", "night"] as const).map((theme) => (
                  <button
                    key={theme}
                    aria-pressed={preferences.theme === theme}
                    onClick={() => apply({ theme })}
                    style={{
                      background: themes[theme].bg,
                      color: themes[theme].ink,
                    }}
                  >
                    {theme === "paper"
                      ? "Papel"
                      : theme === "sepia"
                        ? "Sepia"
                        : "Noche"}
                    {preferences.theme === theme && <Check size={13} />}
                  </button>
                ))}
              </div>
            </fieldset>
            {book?.kind === "reflow" ? (
              <>
                <label>
                  Tipografía
                  <select
                    value={preferences.font}
                    onChange={(e) =>
                      apply({
                        font: e.target.value as ReaderPreferences["font"],
                      })
                    }
                  >
                    <option value="serif">Libro · con serifas</option>
                    <option value="sans">Simple · sin serifas</option>
                  </select>
                </label>
                <label>
                  Tamaño de letra · {preferences.fontSize}px
                  <input
                    aria-label="Tamaño de letra"
                    type="range"
                    min="14"
                    max="32"
                    value={preferences.fontSize}
                    onChange={(e) =>
                      apply({ fontSize: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Interlineado · {preferences.lineHeight.toFixed(2)}
                  <input
                    aria-label="Interlineado"
                    type="range"
                    min="1.3"
                    max="2.5"
                    step="0.05"
                    value={preferences.lineHeight}
                    onChange={(e) =>
                      apply({ lineHeight: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Ancho del texto · {preferences.width}px
                  <input
                    aria-label="Ancho del texto"
                    type="range"
                    min="440"
                    max="1200"
                    step="20"
                    value={preferences.width}
                    onChange={(e) => apply({ width: Number(e.target.value) })}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Escala · {Math.round(preferences.zoom * 100)}%
                  <input
                    aria-label="Escala de página"
                    type="range"
                    min="0.5"
                    max="3"
                    step="0.1"
                    value={preferences.zoom}
                    onChange={(e) => apply({ zoom: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Ajustar página
                  <select
                    value={preferences.fit}
                    onChange={(e) =>
                      apply({ fit: e.target.value as ReaderPreferences["fit"] })
                    }
                  >
                    <option value="width">Al ancho disponible</option>
                    <option value="page">Página completa</option>
                  </select>
                </label>
                {book?.kind === "images" && (
                  <label className="switch-row">
                    <span>Manga · avanzar de derecha a izquierda</span>
                    <input
                      type="checkbox"
                      checked={preferences.rtl}
                      onChange={(e) => apply({ rtl: e.target.checked })}
                    />
                  </label>
                )}
                <small>
                  Los PDF y las imágenes conservan sus colores originales. El
                  tema cambia el entorno; el brillo atenúa también la página.
                </small>
              </>
            )}
            <label>
              Brillo de la lectura · {Math.round(preferences.brightness * 100)}%
              <input
                aria-label="Brillo de la lectura"
                type="range"
                min="0.55"
                max="1"
                step="0.05"
                value={preferences.brightness}
                onChange={(e) => apply({ brightness: Number(e.target.value) })}
              />
            </label>
            <small>
              Tu posición y tus preferencias se guardan en tu carpeta. DOCX y
              texto usan secciones adaptables, no la paginación de Word.
            </small>
          </div>
        </aside>
      )}
      {contentsOpen && (
        <aside className="reader-sidepanel" aria-label="Índice del documento">
          <div className="widget-heading">
            <h3>Tu lugar en la lectura</h3>
            <button
              className="icon-button"
              aria-label="Cerrar índice"
              onClick={() => setContentsOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          {book?.chapters.length ? (
            book.chapters.map((chapter, index) => (
              <button
                className={`chapter-link ${unit === index ? "active" : ""}`}
                key={index}
                onClick={() => {
                  go(index);
                  setContentsOpen(false);
                }}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                {chapter.title}
              </button>
            ))
          ) : (
            <p className="muted">
              Navega por páginas desde los controles inferiores.
            </p>
          )}
          <h4 className="bookmarks-title">
            <Bookmark size={15} />
            Mis marcadores
          </h4>
          {currentDoc.bookmarks.length ? (
            currentDoc.bookmarks.map((mark) => (
              <div className="reader-bookmark" key={mark.id}>
                <button
                  onClick={() => {
                    go(mark.position.unit, mark.position);
                    setContentsOpen(false);
                  }}
                >
                  {mark.label}
                  <small>
                    {Math.round(mark.position.progress * 100)}% de la lectura
                  </small>
                </button>
                <button
                  className="icon-button"
                  aria-label={`Quitar marcador ${mark.label}`}
                  onClick={() =>
                    void updateDocument(document.id, {
                      removeBookmark: mark.id,
                    }).then((doc) => {
                      setCurrentDoc(doc);
                      updateRef.current(doc);
                    })
                  }
                >
                  <X size={13} />
                </button>
              </div>
            ))
          ) : (
            <p className="muted">Guarda un marcador para volver a un pasaje.</p>
          )}
        </aside>
      )}
      <footer className="reader-footer">
        <span className="reader-save-status" role="status">
          {saveStatus}
        </span>
        <div
          className="reader-pagination"
          style={{
            flexDirection:
              preferences.rtl && book?.kind === "images"
                ? "row-reverse"
                : "row",
          }}
        >
          <button
            className="icon-button"
            aria-label="Anterior"
            disabled={!book || unit === 0}
            onClick={() => go(unit - 1)}
          >
            <ChevronLeft size={20} />
          </button>
          <label>
            <span>{book?.kind === "reflow" ? "Sección" : "Página"}</span>
            <input
              aria-label="Ir a página o sección"
              type="number"
              min={1}
              max={book?.total || 1}
              value={unit + 1}
              onChange={(e) => {
                if (e.target.value) go(Number(e.target.value) - 1);
              }}
            />
            <span>de {book?.total || "…"}</span>
          </label>
          <button
            className="icon-button"
            aria-label="Siguiente"
            disabled={!book || unit >= book.total - 1}
            onClick={() => go(unit + 1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <span className="reader-percent">
          {Math.round(latest.current.progress * 100)}%{" "}
          <span>· Tu propio ritmo</span>
        </span>
      </footer>
    </dialog>
  );
}
