import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { translateMessage, tr } from "../lib/i18n.ts";
import { isRemoteLibrary } from "../lib/remote";
import { useReaderPreference } from "../lib/useReaderPreference";
import { useDashboard } from "../context/DashboardStore";
import type { SetStateAction } from "react";
import { APP_NAME } from "../lib/brand.ts";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  BookOpen,
  Upload,
  Search,
  FileText,
  ArrowUpRight,
  FolderOpen,
  Star,
  MoreHorizontal,
  Download,
  Trash2,
  RotateCcw,
  X,
  Pencil,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  LibraryBig,
  Image,
  Check,
  Compass,
  ExternalLink,
} from "lucide-react";
import type { LibraryDocument } from "../lib/library";
import {
  allowedFormats,
  documentFormat,
  MAX_DOCUMENT_BYTES,
} from "../lib/library";
import {
  libraryRequest,
  loadLibrary,
  updateDocument,
} from "../lib/library-client";
import type { LibraryResponse } from "../lib/library-client";
import { Dialog } from "./Dialog";
import { MangaSearchModal } from "./MangaSearchModal";
const DocumentReader = lazy(() =>
  import("./DocumentReader").then((module) => ({
    default: module.DocumentReader,
  })),
);
const MangaReader = lazy(() =>
  import("./MangaReader").then((module) => ({
    default: module.MangaReader,
  })),
);
const sources = ([
  {
    name: "Project Gutenberg",
    get type() { return tr("Library.8e2b96f021"); },
    get description() { return tr("Library.0e4fdb2c0a"); },
    url: "https://www.gutenberg.org/browse/languages/es",
    letter: "G",
    color: "#8e7053",
  },
  {
    get name() { return tr("Library.d5883600e6"); },
    get type() { return tr("Library.1ae4f08d6f"); },
    get description() { return tr("Library.f7f9857fdf"); },
    url: "https://standardebooks.org/ebooks",
    letter: "S",
    color: "#648278",
  },
  {
    name: "MANGA Plus",
    get type() { return tr("Library.68d5d51b74"); },
    get description() { return tr("Library.3e4c4e6268"); },
    url: "https://mangaplus.shueisha.co.jp/",
    letter: "M",
    color: "#b17361",
  },
]);
const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function resolveMangaCoverUrl(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("/api/mangadex/image")) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return `/api/mangadex/image?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export function Library() {
  useInterfaceLocale();
  const [state, setState] = useState<LibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<
    "all" | "reading" | "favorites" | "finished" | "trash"
  >("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "local" | "manga">("all");
  const [mangaCoverMode, setMangaCoverMode] = useReaderPreference<"official" | "lastPage">("zenty-manga-cover-mode", "official", (v): v is "official" | "lastPage" => v === "official" || v === "lastPage");
  const { settings, setSettings } = useDashboard();
  const cardPreviewOverrides = settings.mangaCoverOverrides;
  const setCardPreviewOverrides = (next: SetStateAction<Record<string, "official" | "lastPage">>) =>
    setSettings((previous) => ({ ...previous, mangaCoverOverrides: typeof next === "function" ? next(previous.mangaCoverOverrides) : next }));
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("all");
  const [sort, setSort] = useState("recent");
  const [uploading, setUploading] = useState("");
  const uploadLock = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [actions, setActions] = useState<LibraryDocument | null>(null);
  const [mangaModalOpen, setMangaModalOpen] = useState(false);
  const [rename, setRename] = useState("");
  const [remove, setRemove] = useState<LibraryDocument | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setState(await loadLibrary());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    const focus = () => {
      if (!uploadLock.current && !selected)
        void loadLibrary()
          .then(setState)
          .catch(() => {});
    };
    const timer = setInterval(() => { if (document.visibilityState === "visible") focus(); }, 15000);
    window.addEventListener("focus", focus);
    return () => { clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [selected]);
  const onUpdate = (document: LibraryDocument) =>
    setState((s) =>
      s
        ? {
            ...s,
            documents: s.documents.map((d) =>
              d.id === document.id ? document : d,
            ),
          }
        : s,
    );
  const importFiles = async (files: File[]) => {
    if (uploadLock.current || !files.length) return;
    uploadLock.current = true;
    setError("");
    setMessage("");
    let count = 0,
      duplicates = 0;
    const failures: string[] = [];
    for (const [index, file] of files.entries()) {
      if (!documentFormat(file.name)) {
        failures.push(tr("Library.d5379d4a9e", { v0: file.name }));
        continue;
      }
      if (file.size > MAX_DOCUMENT_BYTES || !file.size) {
        failures.push(tr("Library.120a1698ca", { v0: file.name }));
        continue;
      }
      setUploading(tr("interface.Library.a6b8d9edcd", { v0: index + 1, v1: files.length, v2: file.name }));
      try {
        const result = await libraryRequest<{
          document: LibraryDocument;
          duplicate: boolean;
        }>(`?name=${encodeURIComponent(file.name)}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
        });
        if (result.duplicate) duplicates++;
        else count++;
      } catch (e) {
        failures.push(`${file.name}: ${(e as Error).message}`);
      }
    }
    setUploading("");
    uploadLock.current = false;
    await reload();
    setMessage(
      `${tr("common.files", { count })}${duplicates ? tr("Library.2e03b828c9", { v0: duplicates }) : ""}.`,
    );
    if (failures.length) setError(failures.join("\n"));
    if (input.current) input.current.value = "";
  };
  const mutate = async (action: () => Promise<void>) => {
    setActionBusy(true);
    setError("");
    try {
      await action();
      setActions(null);
      setRemove(null);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionBusy(false);
    }
  };
  const documents = state?.documents || [];
  const active = documents.filter((d) => !d.deletedAt);
  const reading = active.filter(
    (d) => d.lastReadAt && d.position.progress < 0.995,
  );
  const last = reading
    .slice()
    .sort((a, b) => (b.lastReadAt || "").localeCompare(a.lastReadAt || ""))[0];

  const localCount = active.filter((d) => d.format !== "manga").length;
  const mangaCount = active.filter((d) => d.format === "manga").length;

  const getMangaCover = (doc: LibraryDocument) => {
    const override = cardPreviewOverrides[doc.id];
    const mode = override || mangaCoverMode;
    const hasLastPage = Boolean(doc.manga?.lastPagePreviewUrl);

    if (mode === "lastPage" && hasLastPage) {
      return {
        url: resolveMangaCoverUrl(doc.manga!.lastPagePreviewUrl!),
        isLastPage: true,
        canToggle: Boolean(doc.manga?.coverUrl),
      };
    }

    return {
      url: resolveMangaCoverUrl(doc.manga?.coverUrl || doc.manga?.lastPagePreviewUrl),
      isLastPage: false,
      canToggle: hasLastPage,
    };
  };

  const visible = documents
    .filter((d) => (filter === "trash" ? !!d.deletedAt : !d.deletedAt))
    .filter((d) =>
      filter === "reading"
        ? !!d.lastReadAt && d.position.progress < 0.995
        : filter === "favorites"
          ? d.favorite
          : filter === "finished"
            ? d.position.progress >= 0.995
            : true,
    )
    .filter((d) => {
      if (sourceFilter === "local") return d.format !== "manga";
      if (sourceFilter === "manga") return d.format === "manga";
      return true;
    })
    .filter(
      (d) =>
        (format === "all" || d.format === format) &&
        `${d.title} ${d.name}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "es")
        : sort === "added"
          ? b.addedAt.localeCompare(a.addedAt)
          : (b.lastReadAt || b.addedAt).localeCompare(
              a.lastReadAt || a.addedAt,
            ),
    );
  const current = selected ? documents.find((d) => d.id === selected) : null;
  if (current && state)
    return (
      <Suspense
        fallback={
          <div className="reader-loading" role="status">
            {tr("Library.4eb3ed0229")}</div>
        }
      >
        {current.format === "manga" ? (
          <MangaReader
            key={current.id}
            document={current}
            initialPreferences={state.preferences}
            onUpdate={onUpdate}
            onClose={() => {
              setSelected(null);
              void reload();
            }}
          />
        ) : (
          <DocumentReader
            key={current.id}
            document={current}
            initialPreferences={state.preferences}
            onUpdate={onUpdate}
            onClose={() => {
              setSelected(null);
              void reload();
            }}
          />
        )}
      </Suspense>
    );
  return (
    <div
      className="library-page"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <section className="library-hero">
        <div>
          <span className="eyebrow">{tr("Library.259ec15140")}</span>
          <h1>
            {tr("Library.2dbd6bb247")}<span>.</span>
          </h1>
          <p>
            {tr("Library.8865360ef2")}</p>
          <div className="library-storage-badge">
            <ShieldCheck size={13} />
            <span>{tr("Library.5510e79c79")}</span>
          </div>
        </div>
        <span className="library-hero-art">
          <BookOpen size={80} strokeWidth={0.8} />
          <i />
          <i />
        </span>
        <div className="library-hero-actions">
          <button
            className="secondary-button library-manga-btn"
            onClick={() => setMangaModalOpen(true)}
          >
            <Compass size={16} />
            {tr("Library.5910070458")}</button>
          <button
            className="primary-button"
            disabled={!!uploading || !state}
            onClick={() => input.current?.click()}
          >
            <Upload size={16} />
            {tr("Library.ecaaa289cb")}</button>
        </div>
        <input
          ref={input}
          type="file"
          multiple
          aria-label={tr("Library.457dd3d356")}
          accept={allowedFormats.map((f) => `.${f}`).join(",")}
          onChange={(e) => void importFiles(Array.from(e.target.files || []))}
          hidden
        />
      </section>
      {dragging && (
        <div className="library-drop-overlay">
          <Upload size={42} />
          <h2>{tr("Library.b8b2aea79e")}</h2>
          <p>{tr("Library.5cc3cbb17b")}</p>
        </div>
      )}
      {(error || message || uploading) && (
        <div className="library-feedback" aria-live="polite">
          {uploading && (
            <p className="info-banner">
              <Upload size={16} />
              {uploading}
            </p>
          )}
          {message && (
            <p className="library-success">
              <Check size={15} />
              {message}
              <button
                className="icon-button"
                aria-label={tr("Library.5c6324d1b0")}
                onClick={() => setMessage("")}
              >
                <X size={13} />
              </button>
            </p>
          )}
          {error && (
            <div className="error-message" role="alert">
              <p>{translateMessage(error)}</p>
              <button className="text-button" onClick={() => void reload()}>
                <RefreshCw size={13} />
                {tr("Library.a9254c5f81")}</button>
            </div>
          )}
        </div>
      )}
      {last && filter !== "trash" && !query && (
        <section className="continue-reading">
          <span className={`book-mini-cover cover-${last.format}`}>
            {last.format === "manga" ? (
              (() => {
                const cover = getMangaCover(last);
                return cover.url ? (
                  <img src={cover.url} alt="" className="manga-mini-cover-img" />
                ) : (
                  <BookOpen size={25} />
                );
              })()
            ) : (
              <BookOpen size={25} />
            )}
          </span>
          <div>
            <span className="eyebrow">{tr("Library.651a3dcb70")}</span>
            <h2>{last.title}</h2>
            <p>
              {last.format === "manga"
                ? tr("Library.b2585c59ba", { v0: last.manga?.currentChapterNumber || last.position.unit + 1, v1: last.position.anchor + 1, v2: last.manga?.totalPages ? tr("interface.Library.553c27d45c", { v0: last.manga.totalPages }) : "" })
                : ["pdf", "cbz", "jpg", "jpeg", "png", "webp"].includes(
                    last.format,
                  )
                  ? tr("Library.8f63f4d759")
                  : tr("Library.cf76294834")}{" "}
              {last.format !== "manga" && `${last.position.unit + 1}${last.totalUnits ? tr("interface.Library.553c27d45c", { v0: last.totalUnits }) : ""}`}
              {" · "}
              {Math.round(last.position.progress * 100)}{tr("Library.04fce4a79d")}</p>
          </div>
          <button
            className="secondary-button"
            onClick={() => setSelected(last.id)}
          >
            {tr("Library.70d0eb008b")}<ChevronRight size={16} />
          </button>
        </section>
      )}
      <div className="library-navigation">
        <div className="library-filters" aria-label={tr("Library.29bf08c1d7")}>
          {(
            [
              { id: "all", label: tr("Library.79d4e64cf6"), count: active.length },
              { id: "reading", label: tr("Library.5cbb853b1f"), count: reading.length },
              {
                id: "favorites",
                label: tr("Library.ad2c8ba9ac"),
                count: active.filter((d) => d.favorite).length,
              },
              {
                id: "finished",
                label: tr("Library.4a76229cd4"),
                count: active.filter((d) => d.position.progress >= 0.995)
                  .length,
              },
              {
                id: "trash",
                label: tr("Library.c5181f9453"),
                count: documents.filter((d) => d.deletedAt).length,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              aria-pressed={filter === tab.id}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
              <span>{tab.count}</span>
            </button>
          ))}
        </div>
        <button
          className="icon-button"
          aria-label={tr("Library.da735c2eb6")}
          onClick={() => void reload()}
          disabled={loading}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="library-source-filter-bar">
        <div className="library-source-segmented" role="radiogroup" aria-label={tr("Library.5e692c19cb")}>
          <button
            type="button"
            className={`source-segment-btn ${sourceFilter === "all" ? "active" : ""}`}
            onClick={() => setSourceFilter("all")}
          >
            <LibraryBig size={14} />
            <span>{tr("Library.77e946a85e")}</span>
            <span className="source-segment-count">{active.length}</span>
          </button>
          <button
            type="button"
            className={`source-segment-btn ${sourceFilter === "local" ? "active" : ""}`}
            onClick={() => setSourceFilter("local")}
          >
            <FolderOpen size={14} />
            <span>{tr("Library.3c1bbefb07")}</span>
            <span className="source-segment-count">{localCount}</span>
          </button>
          <button
            type="button"
            className={`source-segment-btn ${sourceFilter === "manga" ? "active" : ""}`}
            onClick={() => setSourceFilter("manga")}
          >
            <BookOpen size={14} />
            <span>{tr("Library.a95c310773")}</span>
            <span className="source-segment-count">{mangaCount}</span>
          </button>
        </div>

        {mangaCount > 0 && (
          <div className="library-preview-mode-pill" title={tr("Library.a8cd13d807")}>
            <span className="preview-mode-label">{tr("Library.71af2609ba")}</span>
            <button
              type="button"
              className={`preview-pill-btn ${mangaCoverMode === "official" ? "active" : ""}`}
              onClick={() => {
                setMangaCoverMode("official");
                setCardPreviewOverrides({});
              }}
              title={tr("Library.62df2a1437")}
            >
              <Image size={13} />
              {tr("Library.e222cd1538")}</button>
            <button
              type="button"
              className={`preview-pill-btn ${mangaCoverMode === "lastPage" ? "active" : ""}`}
              onClick={() => {
                setMangaCoverMode("lastPage");
                setCardPreviewOverrides({});
              }}
              title={tr("Library.3b148f5476")}
            >
              <FileText size={13} />
              {tr("Library.3dae461dde")}</button>
          </div>
        )}
      </div>

      <div className="library-search-row">
        <div className="input-icon">
          <Search size={17} />
          <input
            aria-label={tr("Library.b8c44f4adf")}
            placeholder={tr("Library.ed5706402f")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label={tr("Library.2097ed7214")}
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          <option value="all">{tr("Library.e4e50fe62f")}</option>
          <option value="manga">{tr("Library.48839435ad")}</option>
          {allowedFormats.map((f) => (
            <option value={f} key={f}>
              {f.toUpperCase()}
            </option>
          ))}
        </select>
        <select
          aria-label={tr("Library.a6181501c1")}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recent">{tr("Library.0b0a936a7d")}</option>
          <option value="added">{tr("Library.a991f6ac15")}</option>
          <option value="title">{tr("Library.5b3d39a6af")}</option>
        </select>
      </div>
      {loading && !state ? (
        <div className="empty-state" role="status">
          {tr("Library.c854bfa4e7")}</div>
      ) : visible.length ? (
        <div className="library-grid">
          {visible.map((document) => {
            const mangaCover = document.format === "manga" ? getMangaCover(document) : null;
            return (
              <article className="library-book" key={document.id}>
                <div className="library-cover-container">
                  <button
                    className={`library-cover cover-${document.format} ${mangaCover?.url ? "has-real-cover" : ""}`}
                    disabled={!!document.deletedAt}
                    onClick={() => setSelected(document.id)}
                    aria-label={tr("a11y.Library.611", { v0: document.title })}
                  >
                    <span className="book-format">
                      {document.format.toUpperCase()}
                    </span>
                    {mangaCover?.url ? (
                      <img
                        src={mangaCover.url}
                        alt=""
                        className="book-card-manga-img"
                        loading="lazy"
                      />
                    ) : ["cbz", "jpg", "jpeg", "png", "webp"].includes(
                      document.format,
                    ) ? (
                      <Image size={37} strokeWidth={1.1} />
                    ) : document.format === "epub" || document.format === "manga" ? (
                      <BookOpen size={39} strokeWidth={1.1} />
                    ) : (
                      <FileText size={38} strokeWidth={1.1} />
                    )}
                    {!mangaCover?.url && <strong>{document.title}</strong>}
                    <span className="book-cover-line" />
                  </button>

                  {mangaCover?.canToggle && (
                    <button
                      type="button"
                      className="manga-cover-card-toggle"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCardPreviewOverrides((prev) => ({
                          ...prev,
                          [document.id]: mangaCover.isLastPage ? "official" : "lastPage",
                        }));
                      }}
                      title={
                        mangaCover.isLastPage
                          ? tr("Library.21f57bbcdd")
                          : tr("Library.ae453f3f88")
                      }
                      aria-label={tr("Library.ee73005cf2")}
                    >
                      {mangaCover.isLastPage ? tr("Library.e595ad1b43") : tr("Library.2a6f468ed5")}
                    </button>
                  )}
                </div>
              <div className="book-card-body">
                <div className="book-card-title">
                  <button
                    disabled={!!document.deletedAt}
                    onClick={() => setSelected(document.id)}
                  >
                    {document.title}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={tr("a11y.Library.668", { v0: document.title })}
                    onClick={() => {
                      setActions(document);
                      setRename(document.title);
                    }}
                  >
                    <MoreHorizontal size={17} />
                  </button>
                </div>
                <p>
                  {document.format === "manga"
                    ? document.deletedAt
                      ? tr("Library.1414d5e2e6")
                      : document.lastReadAt
                        ? tr("Library.90bf701f28", { v0: document.manga?.currentChapterNumber || document.position.unit + 1, v1: document.position.anchor + 1, v2: document.manga?.totalPages ? ` / ${document.manga.totalPages}` : "" })
                        : tr("Library.f42576ac83", { v0: document.totalUnits ? tr("interface.Library.0912e3e9aa", { v0: document.totalUnits }) : "Manga" })
                    : `${formatSize(document.size)} · ${
                        document.deletedAt
                          ? tr("Library.1414d5e2e6")
                          : document.lastReadAt
                            ? `${document.position.unit + 1}${document.totalUnits ? ` / ${document.totalUnits}` : ""} ${["epub", "docx", "txt", "md"].includes(document.format) ? tr("Library.8adf82c5a1") : tr("Library.594f311bb7")}`
                            : tr("Library.21fab5755e")
                      }`}
                </p>
                <div className="book-progress">
                  <div>
                    <i
                      style={{ width: `${document.position.progress * 100}%` }}
                    />
                  </div>
                  <span>{Math.round(document.position.progress * 100)}%</span>
                  <button
                    className="icon-button"
                    aria-label={`${document.favorite ? tr("Library.66ba4c7c28") : tr("Library.e7a2c0c4db")} ${document.title}`}
                    aria-pressed={document.favorite}
                    onClick={() =>
                      void updateDocument(document.id, {
                        favorite: !document.favorite,
                      })
                        .then(onUpdate)
                        .catch((e) => setError(e.message))
                    }
                  >
                    <Star
                      size={14}
                      fill={document.favorite ? "currentColor" : "none"}
                    />
                  </button>
                </div>
                {document.deletedAt && (
                  <button
                    className="text-button"
                    onClick={() =>
                      void mutate(async () => {
                        await updateDocument(document.id, { restore: true });
                      })
                    }
                  >
                    <RotateCcw size={13} />
                    {tr("Library.555168865b")}</button>
                )}
              </div>
            </article>
          );
        })}
        </div>
      ) : (
        <div className="library-empty">
          <span>
            <LibraryBig size={39} strokeWidth={1} />
          </span>
          <h2>
            {query
              ? tr("Library.a9b4c7b534")
              : filter === "trash"
                ? tr("Library.d4cb35436d")
                : filter === "all"
                  ? tr("Library.a2f0a48086")
                  : tr("Library.eaa05166b8")}
          </h2>
          <p>
            {filter === "trash"
              ? tr("Library.265048bb1b")
              : filter === "all" && !query
                ? tr("Library.654cf8f4b6")
                : tr("Library.f47dbd9fbc")}
          </p>
          {filter === "all" && !query && (
            <button
              className="secondary-button"
              disabled={!state}
              onClick={() => input.current?.click()}
            >
              <Upload size={16} />
              {tr("Library.ea50a0d85e")}</button>
          )}
          <small>
            {tr("Library.deb3d6d85b")}<br />
            {tr("Library.d3fe49c20c")}</small>
        </div>
      )}
      <section className="library-discover">
        <div className="section-heading">
          <h2>
            {tr("Library.1a9b8f3062")}<span>
              {tr("Library.8d335a9229")}</span>
          </h2>
        </div>
        <div className="library-sources">
          {sources.map((source) => (
            <a
              key={source.name}
              href={source.url}
              target="_blank"
              rel="noreferrer"
            >
              <span
                className="source-monogram"
                style={{ color: source.color, background: `${source.color}15` }}
              >
                {source.letter}
              </span>
              <div>
                <h3>
                  {source.name}
                  <ArrowUpRight size={15} />
                </h3>
                <small>{source.type}</small>
                <p>{source.description}</p>
                <span>
                  {tr("Library.cd39a98c54")}<ArrowUpRight size={12} />
                </span>
              </div>
            </a>
          ))}
        </div>
        <p className="library-source-note">
          {tr("Library.e3691a5ade")}{APP_NAME} {tr("Library.17cddf8ad6")}</p>
      </section>
      {!isRemoteLibrary && <details className="library-folder-info">
        <summary>
          <FolderOpen size={16} />
          {tr("Library.e7016b4149")}</summary>
        <p>
          {tr("Library.d728fb0e61")}</p>
        <code>
          {state?.storagePath || tr("interface.Library.676f05531f", { v0: APP_NAME })}
        </code>
        <p>
          {tr("Library.6cfe96e499")}{APP_NAME} {tr("Library.38301f7e78")}</p>
      </details>}
      <Dialog
        open={!!actions}
        onClose={() => setActions(null)}
        title={tr("Library.1a6f2aa5da")}
        description={actions?.name}
      >
        <div className="dialog-body form-stack">
          <label>
            {tr("Library.c56574701d")}<input
              aria-label={tr("Library.5ded91c4bb")}
              maxLength={200}
              value={rename}
              onChange={(e) => setRename(e.target.value)}
            />
          </label>
          <button
            className="primary-button"
            disabled={actionBusy || !rename.trim()}
            onClick={() =>
              void mutate(async () => {
                await updateDocument(actions!.id, { title: rename });
              })
            }
          >
            <Pencil size={14} />
            {tr("Library.ec75893e43")}</button>
          {actions?.format === "manga" ? (
            <a
              className="secondary-button"
              href={`https://mangadex.org/title/${actions.manga?.mangadexId}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={15} />
              {tr("Library.d25652226b")}</a>
          ) : (
            <a
              className="secondary-button"
              href={actions ? `/api/library/${actions.id}/file` : undefined}
              download={actions?.name}
            >
              <Download size={15} />
              {tr("Library.11e3fdc2ed")}</a>
          )}
          {actions?.deletedAt ? (
            <>
              <button
                className="secondary-button"
                disabled={actionBusy}
                onClick={() =>
                  void mutate(async () => {
                    await updateDocument(actions.id, { restore: true });
                  })
                }
              >
                <RotateCcw size={15} />
                {tr("Library.17926a329a")}</button>
              <button
                className="text-button danger"
                onClick={() => {
                  setRemove(actions);
                  setActions(null);
                }}
              >
                <Trash2 size={15} />
                {tr("Library.0724538ab4")}</button>
            </>
          ) : (
            <button
              className="text-button danger"
              disabled={actionBusy}
              onClick={() =>
                void mutate(async () => {
                  await libraryRequest(`/${actions!.id}`, { method: "DELETE" });
                  setMessage(
                    tr("Library.8e1feda273"),
                  );
                })
              }
            >
              <Trash2 size={15} />
              {tr("Library.b9a042ebc7")}</button>
          )}
        </div>
      </Dialog>
      <Dialog
        open={!!remove}
        onClose={() => setRemove(null)}
        title={tr("Library.35b260cb80")}
        description={tr("Library.ed4fe9e859", { v0: remove?.title, v1: APP_NAME })}
      >
        <div className="dialog-body dialog-actions">
          <button className="secondary-button" onClick={() => setRemove(null)}>
            {tr("Library.f5ef95037b")}</button>
          <button
            className="primary-button destructive-button"
            disabled={actionBusy}
            onClick={() =>
              void mutate(async () => {
                await libraryRequest(`/${remove!.id}?permanent=1`, {
                  method: "DELETE",
                });
                setMessage(tr("Library.7a111da5d6"));
              })
            }
          >
            {tr("Library.161314a27e")}</button>
        </div>
      </Dialog>
      <MangaSearchModal
        open={mangaModalOpen}
        onClose={() => setMangaModalOpen(false)}
        existingDocuments={documents}
        onMangaAdded={(doc, shouldOpen) => {
          void reload().then(() => {
            if (shouldOpen) setSelected(doc.id);
          });
        }}
      />
    </div>
  );
}
