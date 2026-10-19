import { newId } from "../lib/id";
import { useGamepadNavigation } from "../lib/useGamepadNavigation";
import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { translateMessage, tr, getFormatLocale } from "../lib/i18n.ts";
import { isRemoteLibrary } from "../lib/remote";
import { APP_NAME } from "../lib/brand.ts";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  FolderOpen,
  Gamepad2,
  Grid2X2,
  List,
  MonitorDown,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Dialog } from "./Dialog";
import { useDashboard } from "../context/DashboardStore";
import { installedRequest } from "../lib/installed-client";
import {
  createGameSearchIndex,
  emulatorPresets,
  launcherNames,
  searchInstalled,
} from "../lib/installed-games";
import type {
  InstalledGame,
  InstalledSnapshot,
  GameMetadata,
  EmulatorConfig,
} from "../lib/installed-games";
import { emptyGame, cachedGameImage } from "../lib/gaming";
type AddTab = "game" | "emulator";
let cachedSnapshot: InstalledSnapshot | null = null;
export function InstalledGames() {
  useInterfaceLocale();
  const { settings, setSettings, games, setGames, notify } = useDashboard();
  const controllerRoot = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState(false);
  useGamepadNavigation(controllerRoot, controller);
  const [snapshot, setSnapshot] = useState<InstalledSnapshot | null>(
    cachedSnapshot,
  );
  const [loading, setLoading] = useState(!cachedSnapshot);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query);
  const [launcher, setLauncher] = useState("all");
  const [view, setView] = useState("grid");
  const [hidden, setHidden] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [sort, setSort] = useState("recent");
  const [limit, setLimit] = useState(24);
  const [metadata, setMetadata] = useState<Record<string, GameMetadata>>({});
  const metadataRef = useRef(metadata);
  metadataRef.current = metadata;
  const metadataAttempted = useRef(new Set<string>());
  const [failedImages, setFailedImages] = useState<Set<string>>(
    () => new Set(),
  );
  const [detail, setDetail] = useState<InstalledGame | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequest = useRef(0);
  const [launching, setLaunching] = useState("");
  const [add, setAdd] = useState<AddTab | null>(null);
  const [emulatorsOpen, setEmulatorsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [formError, setFormError] = useState("");
  const [artwork, setArtwork] = useState("");
  const [form, setForm] = useState({
    title: "",
    executable: "",
    launcher: "manual",
    image: "",
    folder: "",
    extensions: "iso,chd,gba,nes,zip",
    args: '["{rom}"]',
    recursive: false,
  });
  const refresh = async (force = false) => {
    setLoading(true);
    setError("");
    try {
      const next = await installedRequest<InstalledSnapshot>(
        "scan",
        force ? {} : undefined,
      );
      cachedSnapshot = next;
      setSnapshot(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let active = true;
    installedRequest<InstalledSnapshot>("scan")
      .then((value) => {
        cachedSnapshot = value;
        if (active) setSnapshot(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.key !== "/" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        document.querySelector("dialog[open]") ||
        (event.target instanceof HTMLElement &&
          (event.target.matches("input, textarea, select") ||
            event.target.isContentEditable))
      )
        return;
      event.preventDefault();
      searchInput.current?.focus();
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const savedIds = useMemo(() => new Set(games.map((g) => g.id)), [games]);
  const hiddenIds = useMemo(
    () => new Set(settings.gamingHiddenIds),
    [settings.gamingHiddenIds],
  );
  const searchIndex = useMemo(
    () => createGameSearchIndex(snapshot?.games || []),
    [snapshot],
  );
  const items = useMemo(() => {
    const filtered = searchInstalled(
      snapshot?.games || [],
      deferredQuery,
      searchIndex,
    ).filter(
      (g) =>
        hidden === hiddenIds.has(g.id) &&
        (launcher === "all" || launcher === g.launcher) &&
        (!onlyFavorites || savedIds.has(g.id)),
    );
    if (sort === "recent") {
      const order = new Map(
        settings.gamingRecentIds.map((id, index) => [id, index]),
      );
      filtered.sort(
        (a, b) =>
          (order.get(a.id) ?? 100) - (order.get(b.id) ?? 100) ||
          a.title.localeCompare(b.title),
      );
    } else filtered.sort((a, b) => a.title.localeCompare(b.title));
    return filtered;
  }, [
    snapshot,
    deferredQuery,
    hidden,
    hiddenIds,
    launcher,
    onlyFavorites,
    savedIds,
    sort,
    settings.gamingRecentIds,
    searchIndex,
  ]);
  const visible = items.slice(0, limit);
  const visibleKey = visible.map((g) => g.id).join("|");
  useEffect(() => {
    let active = true;
    // Only enrich visible cards. Two workers keep the library usable on slow connections.
    const queue = visible.filter(
      (g) =>
        (!g.image || failedImages.has(g.id)) &&
        !metadataAttempted.current.has(g.id),
    );
    async function worker() {
      while (active && queue.length) {
        const game = queue.shift()!;
        metadataAttempted.current.add(game.id);
        try {
          const meta = await installedRequest<GameMetadata>("metadata", {
            id: game.id,
          });
          if (active) setMetadata((p) => ({ ...p, [game.id]: meta }));
          else metadataAttempted.current.delete(game.id);
        } catch {
          metadataAttempted.current.delete(game.id);
        }
      }
    }
    void Promise.all([worker(), worker()]);
    return () => {
      active = false;
    };
    // IDs determine the bounded queue; metadata updates must not start another scan.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, failedImages]);
  const openDetail = async (game: InstalledGame) => {
    const ticket = ++detailRequest.current;
    setDetail(game);
    setDetailLoading(true);
    setArtwork("");
    try {
      const meta = await installedRequest<GameMetadata>("metadata", {
        id: game.id,
        priority: true,
      });
      setMetadata((p) => ({ ...p, [game.id]: meta }));
    } catch {
      /* Local controls work without online data. */
    } finally {
      if (ticket === detailRequest.current) setDetailLoading(false);
    }
  };
  const launch = async (game: InstalledGame) => {
    if (launching) return;
    setLaunching(game.id);
    try {
      const result = await installedRequest<{ message: string }>("launch", {
        id: game.id,
      });
      setSettings((s) => ({
        ...s,
        gamingSessions: [...s.gamingSessions.map(session => !session.endedAt ? { ...session, endedAt: new Date().toISOString() } : session), { id: newId(), gameId: game.id, title: game.title, startedAt: new Date().toISOString(), endedAt: null }].slice(-10000),
        gamingRecentIds: [
          game.id,
          ...s.gamingRecentIds.filter((id) => id !== game.id),
        ].slice(0, 30),
      }));
      notify(result.message);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLaunching("");
    }
  };
  const hideGame = (game: InstalledGame) => {
    const wasHidden = hiddenIds.has(game.id);
    setSettings((s) => ({
      ...s,
      gamingHiddenIds: wasHidden
        ? s.gamingHiddenIds.filter((id) => id !== game.id)
        : [...s.gamingHiddenIds, game.id],
    }));
    setDetail(null);
    notify(
      wasHidden
        ? tr("InstalledGames.f22cd34697")
        : tr("InstalledGames.dadd08cb59"),
      () =>
        setSettings((s) => ({
          ...s,
          gamingHiddenIds: wasHidden
            ? [...s.gamingHiddenIds, game.id]
            : s.gamingHiddenIds.filter((id) => id !== game.id),
        })),
    );
  };
  const saveGame = (game: InstalledGame) => {
    if (savedIds.has(game.id)) {
      const previous = games.find((g) => g.id === game.id)!;
      setGames((p) => p.filter((g) => g.id !== game.id));
      notify(tr("InstalledGames.7b760aa38d"), () =>
        setGames((p) =>
          p.some((g) => g.id === previous.id) ? p : [previous, ...p],
        ),
      );
      return;
    }
    const meta = metadataRef.current[game.id];
    const item = emptyGame({
      id: game.id,
      title: game.title,
      image: meta?.image || game.image,
      description: meta?.description || "",
      source: "manual",
      platforms: ["PC", launcherNames[game.launcher]],
      url: meta?.url || "",
      store: launcherNames[game.launcher],
    });
    setGames((p) =>
      p.some((g) => g.id === game.id)
        ? p
        : [
            {
              id: game.id,
              game: item,
              status: "pending",
              note: "",
              addedAt: new Date().toISOString(),
            },
            ...p,
          ],
    );
    notify(tr("InstalledGames.09978f9c2a"));
  };
  const openAdd = (tab: AddTab) => {
    setAdd(tab);
    setEmulatorsOpen(false);
    setFormError("");
    setForm({
      title: "",
      executable: "",
      launcher: "manual",
      image: "",
      folder: "",
      extensions: "iso,chd,gba,nes,zip",
      args: tab === "game" ? "[]" : '["{rom}"]',
      recursive: false,
    });
  };
  const pick = async (kind: "executable" | "folder") => {
    setPicking(true);
    setFormError("");
    try {
      const result = await installedRequest<{ path: string }>("pick", { kind });
      if (result.path)
        setForm((p) => ({
          ...p,
          [kind === "folder" ? "folder" : "executable"]: result.path,
        }));
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setPicking(false);
    }
  };
  const disableEntry = async (
    id: string,
    type: "manual" | "emulators",
    enabled: boolean,
  ) => {
    try {
      await installedRequest(type, { id, enabled }, "PATCH");
      await refresh(true);
      setDetail(null);
      notify(
        enabled
          ? tr("InstalledGames.b24844e9a0")
          : tr("InstalledGames.f39c72bd05", { v0: APP_NAME }),
        () => {
          void disableEntry(id, type, !enabled);
        },
      );
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const meta = detail ? metadata[detail.id] : undefined;
  const enabledEmulators = snapshot?.emulators.filter((e) => e.enabled) || [];
  return (
    <section className="installed-library" ref={controllerRoot}>
      <div className="gaming-session-toolbar"><button type="button" className="secondary-button" aria-pressed={controller} onClick={() => setController(value => !value)}><Gamepad2 size={16} />{tr("gaming.controller")}</button><small>{tr("gaming.sessionHint")}</small></div>
      {settings.gamingSessions.filter(session => !session.endedAt).map(session => <div className="gaming-active-session" key={session.id}><span>{tr("gaming.activeSession", { title: session.title })}</span><button type="button" className="secondary-button" onClick={() => setSettings(previous => ({ ...previous, gamingSessions: previous.gamingSessions.map(item => item.id === session.id ? { ...item, endedAt: new Date().toISOString() } : item) }))}>{tr("gaming.endSession")}</button></div>)}

      <div className="installed-heading">
        <div>
          <h2>{tr("InstalledGames.a1b0d869f3")}</h2>
          <p>{tr("InstalledGames.d5fbffef0f")}</p>
        </div>
        <div className="installed-actions">
          {isRemoteLibrary && <small>{tr("InstalledGames.9f304db462")}</small>}
          <button
            className="secondary-button"
            disabled={isRemoteLibrary} title={isRemoteLibrary ? tr("InstalledGames.b0874f7926") : undefined}
            onClick={() => setEmulatorsOpen(true)}
          >
            <Gamepad2 size={16} /> {tr("InstalledGames.45fe0d7965")}{enabledEmulators.length > 0 && (
              <span>{enabledEmulators.length}</span>
            )}
          </button>
          <button className="primary-button" disabled={isRemoteLibrary} onClick={() => openAdd("game")}>
            <Plus size={16} /> {tr("InstalledGames.cff3f9a490")}</button>
        </div>
      </div>
      <div className="installed-toolbar">
        <label className="installed-search">
          <Search size={19} />
          <input
            ref={searchInput}
            autoComplete="off"
            aria-label={tr("InstalledGames.d6b8208520")}
            placeholder={tr("InstalledGames.c914489894")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(24);
            }}
          />
          {query && (
            <button
              className="icon-button"
              aria-label={tr("InstalledGames.e7c988689d")}
              onClick={() => setQuery("")}
            >
              <X size={16} />
            </button>
          )}
        </label>
        <button
          className="secondary-button"
          disabled={loading}
          onClick={() => void refresh(true)}
        >
          <RefreshCw size={16} className={loading ? "gamer-spinning" : ""} />
          {loading ? tr("InstalledGames.daf2f4eb7a") : tr("InstalledGames.d976d69f8e")}
        </button>
      </div>
      <div className="installed-filterbar">
        <select
          aria-label={tr("InstalledGames.621ece7d4a")}
          value={launcher}
          onChange={(e) => {
            setLauncher(e.target.value);
            setLimit(24);
          }}
        >
          <option value="all">{tr("InstalledGames.2789cc338f")}</option>
          {Object.entries(launcherNames)
            .filter(([id]) => snapshot?.games.some((g) => g.launcher === id))
            .map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
        </select>
        <button
          aria-pressed={onlyFavorites}
          className={onlyFavorites ? "active" : ""}
          onClick={() => setOnlyFavorites((p) => !p)}
        >
          <Bookmark size={15} /> {tr("InstalledGames.99875b2363")}</button>
        <button
          aria-pressed={hidden}
          className={hidden ? "active" : ""}
          onClick={() => {
            setHidden((p) => !p);
            setLimit(24);
          }}
        >
          <EyeOff size={15} /> {tr("InstalledGames.cb154e7199")}{hiddenIds.size > 0 && <span>{hiddenIds.size}</span>}
        </button>
        <select
          aria-label={tr("InstalledGames.656f95ccba")}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recent">{tr("InstalledGames.16d42e9717")}</option>
          <option value="name">{tr("InstalledGames.15d998a2ae")}</option>
        </select>
        <div className="installed-view">
          <button
            className={view === "grid" ? "active" : ""}
            aria-label={tr("InstalledGames.eb0bbf2719")}
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            <Grid2X2 size={17} />
          </button>
          <button
            className={view === "list" ? "active" : ""}
            aria-label={tr("InstalledGames.2eaa9ea4b3")}
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List size={18} />
          </button>
        </div>
      </div>
      {error && (
        <div className="gamer-notice" role="alert">
          {translateMessage(error)}
          <button className="text-button" onClick={() => void refresh()}>
            {tr("InstalledGames.a9254c5f81")}</button>
        </div>
      )}
      {snapshot?.warnings.map((warning, i) => (
        <p className="installed-warning" key={i}>
          {translateMessage(warning)}
        </p>
      ))}
      {loading && !snapshot ? (
        <div className="installed-loading" role="status">
          <MonitorDown size={30} />
          <h3>{tr("InstalledGames.246eb5829e")}</h3>
          <p>
            {tr("InstalledGames.8754cf0c7d")}</p>
        </div>
      ) : (
        <>
          <div className="installed-count" aria-live="polite">
            <span>
              {tr("common.games", { count: items.length })}
              {hidden ? tr("InstalledGames.46122cc9bf") : tr("InstalledGames.e19f9626c4")}
            </span>
            {snapshot && (
              <small>
                {tr("InstalledGames.8a00bb88c3")}{" "}
                {new Date(snapshot.scannedAt).toLocaleTimeString(getFormatLocale(), {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </small>
            )}
          </div>
          {items.length ? (
            <div
              className={`installed-grid ${view === "list" ? "installed-list" : ""}`}
            >
              {visible.map((game) => {
                const image = metadata[game.id]?.image || game.image;
                return (
                  <article className="installed-card" key={game.id}>
                    <button
                      className="installed-cover"
                      aria-label={tr("a11y.InstalledGames.528", { v0: game.title })}
                      onClick={() => void openDetail(game)}
                    >
                      <Gamepad2
                        className="installed-placeholder"
                        size={42}
                        strokeWidth={1}
                      />
                      {image && (
                        <img
                          loading="lazy"
                          decoding="async"
                          src={cachedGameImage(image)}
                          alt=""
                          referrerPolicy="no-referrer"
                          onLoad={(event) => {
                            event.currentTarget.style.visibility = "visible";
                          }}
                          onError={(e) => {
                            e.currentTarget.style.visibility = "hidden";
                            setFailedImages((previous) =>
                              previous.has(game.id)
                                ? previous
                                : new Set([...previous, game.id]),
                            );
                          }}
                        />
                      )}
                      <span>{launcherNames[game.launcher]}</span>
                    </button>
                    <div className="installed-card-info">
                      <button
                        className="installed-title"
                        onClick={() => void openDetail(game)}
                      >
                        <h3>{game.title}</h3>
                      </button>
                      <small>
                        {game.system || launcherNames[game.launcher]}
                      </small>
                      <select aria-label={tr("gaming.progress")} value={settings.installedStatuses[game.id] || "pending"} onChange={event => setSettings(previous => ({ ...previous, installedStatuses: { ...previous.installedStatuses, [game.id]: event.target.value as "pending" | "playing" | "completed" } }))}>{(["pending", "playing", "completed"] as const).map(status => <option key={status} value={status}>{tr(`gaming.state.${status}`)}</option>)}</select>
                      <small>{tr("gaming.recordedTime", { minutes: Math.round(settings.gamingSessions.filter(session => session.gameId === game.id && session.endedAt).reduce((sum, session) => sum + (Date.parse(session.endedAt!) - Date.parse(session.startedAt)) / 60000, 0)) })}</small>
                      <div className="installed-card-actions">
                        <button
                          className="installed-play"
                          disabled={!!launching}
                          onClick={() => void launch(game)}
                          aria-label={tr("a11y.InstalledGames.573", { v0: game.title })}
                        >
                          <Play size={15} fill="currentColor" />
                          {launching === game.id ? tr("InstalledGames.2d5bf11d9a") : isRemoteLibrary ? tr("InstalledGames.65291f2faa") : tr("InstalledGames.b61eda6f4b")}
                        </button>
                        <button
                          className="icon-button"
                          aria-pressed={savedIds.has(game.id)}
                          aria-label={tr("a11y.InstalledGames.581", { v0: savedIds.has(game.id) ? tr("InstalledGames.e803dc9f36") : tr("InstalledGames.1765be422c"), v1: game.title })}
                          title={tr("InstalledGames.7cd4459f57")}
                          onClick={() => saveGame(game)}
                        >
                          {savedIds.has(game.id) ? (
                            <Check size={17} />
                          ) : (
                            <Bookmark size={17} />
                          )}
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`${hidden ? tr("InstalledGames.5c492f37a6") : tr("InstalledGames.dd68077287")} ${game.title}`}
                          onClick={() => hideGame(game)}
                        >
                          {hidden ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="gamer-empty">
              <Gamepad2 size={38} strokeWidth={1} />
              <h3>
                {query || launcher !== "all" || hidden || onlyFavorites
                  ? tr("InstalledGames.6028bd8694")
                  : tr("InstalledGames.e0ca8d5cd9")}
              </h3>
              <p>
                {query || launcher !== "all" || hidden || onlyFavorites
                  ? tr("InstalledGames.128fdee283")
                  : tr("InstalledGames.2465dc5f80")}
              </p>
              <button
                className="secondary-button"
                onClick={() => {
                  if (query || launcher !== "all" || hidden || onlyFavorites) {
                    setQuery("");
                    setLauncher("all");
                    setHidden(false);
                    setOnlyFavorites(false);
                  } else openAdd("game");
                }}
              >
                {query || launcher !== "all" || hidden || onlyFavorites
                  ? tr("InstalledGames.bfc2d16235")
                  : tr("InstalledGames.cf0057b629")}
              </button>
            </div>
          )}
          {items.length > limit && (
            <button
              className="secondary-button gamer-load-more"
              onClick={() => setLimit((p) => p + 24)}
            >
              {tr("InstalledGames.367670810e")}<Plus size={15} />
            </button>
          )}
        </>
      )}
      <details className="installed-help">
        <summary>
          {tr("InstalledGames.27b3c8284c")}{" "}
          <ChevronRight size={14} />
        </summary>
        <p>
          {tr("InstalledGames.ab20a2fc0e")}</p>
        <p>
          {tr("InstalledGames.478cdddd84")}</p>
        {!!snapshot?.removed?.length && (
          <div>
            <h3>{tr("InstalledGames.65894be87f")}</h3>
            {snapshot.removed.map((entry) => (
              <div className="installed-emulator" key={entry.id}>
                <span>{entry.title}</span>
                <button
                  className="secondary-button"
                  onClick={() => void disableEntry(entry.id, "manual", true)}
                >
                  {tr("InstalledGames.1e64c5c51f")}</button>
              </div>
            ))}
          </div>
        )}
      </details>
      {!!settings.gamingSessions.length && <details className="gaming-history"><summary>{tr("gaming.history")}</summary><ol>{[...settings.gamingSessions].reverse().slice(0, 30).map(session => <li key={session.id}><strong>{session.title}</strong><time>{new Date(session.startedAt).toLocaleString(getFormatLocale())}</time><span>{session.endedAt ? tr("gaming.recordedTime", { minutes: Math.round((Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 60000) }) : tr("gaming.openSession")}</span></li>)}</ol></details>}
      <Dialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.title || tr("InstalledGames.7ec2cf30f8")}
        description={
          detail
            ? `${launcherNames[detail.launcher]}${detail.system ? " · " + detail.system : ""}`
            : ""
        }
      >
        {detail && (
          <div className="dialog-body gamer-detail">
            {detailLoading && (
              <p role="status" className="muted">
                {tr("InstalledGames.0d76a6764a")}</p>
            )}
            {(meta?.image || detail.image) && (
              <img
                className="gamer-detail-image"
                src={cachedGameImage(meta?.image || detail.image)}
                alt=""
                referrerPolicy="no-referrer"
              />
            )}
            {meta?.description && <p>{meta.description}</p>}
            {meta?.genres?.length ? (
              <div className="gamer-detail-tags">
                {meta.genres.map((g) => (
                  <span key={g}>{g}</span>
                ))}
              </div>
            ) : null}
            <div className="gamer-detail-actions">
              <button
                className="primary-button"
                disabled={!!launching}
                onClick={() => void launch(detail)}
              >
                <Play size={16} />
                {launching === detail.id ? tr("InstalledGames.2d5bf11d9a") : isRemoteLibrary ? tr("InstalledGames.65291f2faa") : tr("InstalledGames.ee42856979")}
              </button>
              <button
                className="secondary-button"
                onClick={() => saveGame(detail)}
              >
                <Bookmark size={15} />
                {savedIds.has(detail.id)
                  ? tr("InstalledGames.e891a78f38")
                  : tr("InstalledGames.0be3a66555")}
              </button>
              <button
                className="secondary-button"
                onClick={() => hideGame(detail)}
              >
                {hiddenIds.has(detail.id) ? (
                  <Eye size={15} />
                ) : (
                  <EyeOff size={15} />
                )}
                {hiddenIds.has(detail.id)
                  ? tr("InstalledGames.d73a60d3a7")
                  : tr("InstalledGames.11a1cc4537")}
              </button>
            </div>
            {meta?.source && (
              <small className="muted">
                {tr("InstalledGames.0cb4b76830")}{meta.source}
                {meta.url && (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      href={meta.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {tr("InstalledGames.770682a231")}<ArrowUpRight size={12} />
                    </a>
                  </>
                )}
              </small>
            )}
            <details className="installed-path">
              <summary>{tr("InstalledGames.6af39a948c")}</summary>
              <p>{detail.installPath}</p>
              <form
                className="form-stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await installedRequest(
                      "artwork",
                      { id: detail.id, image: artwork },
                      "PATCH",
                    );
                    const value = {
                      image: artwork,
                      description: meta?.description || "",
                      url: meta?.url || "",
                      genres: meta?.genres || [],
                      matchedTitle: detail.title,
                      source: tr("InstalledGames.399810b42c"),
                      fetchedAt: new Date().toISOString(),
                    };
                    setMetadata((p) => ({ ...p, [detail.id]: value }));
                    notify(tr("InstalledGames.9e9a626c5a"));
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                <input
                  aria-label={tr("InstalledGames.bd2983fab3")}
                  type="url"
                  placeholder={tr("InstalledGames.240f9c3148")}
                  value={artwork}
                  onChange={(e) => setArtwork(e.target.value)}
                  required
                />
                <button className="secondary-button">{tr("InstalledGames.34a90e7109")}</button>
              </form>
            </details>
            {detail.id.startsWith("local:") && (
              <button
                className="text-button danger"
                onClick={() => void disableEntry(detail.id, "manual", false)}
              >
                <Trash2 size={15} /> {tr("InstalledGames.6f6e7fc27f")}{APP_NAME}
              </button>
            )}
          </div>
        )}
      </Dialog>
      <Dialog
        open={!!add}
        onClose={() => {
          if (!busy && !picking) setAdd(null);
        }}
        title={
          add === "emulator"
            ? tr("InstalledGames.f6850394f6")
            : tr("InstalledGames.99f312f4d7")
        }
        description={
          add === "emulator"
            ? tr("InstalledGames.97c645703e")
            : tr("InstalledGames.07c79dc950")
        }
      >
        <form
          className="dialog-body form-stack installed-add"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setFormError("");
            try {
              let args;
              try {
                args = JSON.parse(form.args);
              } catch {
                throw new Error(
                  tr("InstalledGames.a614f8075a"),
                );
              }
              if (add === "emulator")
                await installedRequest("emulators", {
                  name: form.title,
                  executable: form.executable,
                  folder: form.folder,
                  extensions: form.extensions.split(","),
                  args,
                  recursive: form.recursive,
                });
              else
                await installedRequest("manual", {
                  title: form.title,
                  executable: form.executable,
                  args,
                  launcher: form.launcher,
                  image: form.image,
                });
              setAdd(null);
              await refresh(true);
              notify(
                add === "emulator"
                  ? tr("InstalledGames.e784266e07")
                  : tr("InstalledGames.0b9e149973"),
              );
            } catch (e) {
              setFormError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {add === "emulator" && (
            <label>
              {tr("InstalledGames.76c0827159")}<select
                defaultValue=""
                onChange={(e) => {
                  const preset = emulatorPresets.find(
                    (p) => p.name === e.target.value,
                  );
                  if (preset)
                    setForm((p) => ({
                      ...p,
                      title: preset === emulatorPresets.at(-1) ? "" : preset.name,
                      extensions: preset.extensions,
                      args: preset.args,
                    }));
                }}
              >
                <option value="" disabled>
                  {tr("InstalledGames.17ca5a0e75")}</option>
                {emulatorPresets.map((p) => (
                  <option key={p.name}>{p.name}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            {add === "emulator" ? tr("InstalledGames.4ea7559637") : tr("InstalledGames.27839f10af")}
            <input
              autoFocus
              required
              maxLength={500}
              value={form.title}
              onChange={(e) =>
                setForm((p) => ({ ...p, title: e.target.value }))
              }
              placeholder={
                add === "emulator"
                  ? tr("InstalledGames.560d5f48ad")
                  : tr("InstalledGames.27839f10af")
              }
            />
          </label>
          <label>
            {tr("InstalledGames.2e6c43bf41")}<div className="installed-path-input">
              <input
                required
                value={form.executable}
                placeholder={tr("InstalledGames.200568590f")}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    executable: e.target.value.replace(/^"|"$/g, ""),
                  }))
                }
              />
              <button
                type="button"
                className="secondary-button"
                disabled={picking}
                onClick={() => void pick("executable")}
              >
                <FolderOpen size={16} /> {tr("InstalledGames.842ca60786")}</button>
            </div>
          </label>
          {add === "emulator" ? (
            <>
              <label>
                {tr("InstalledGames.7f7a68084c")}<div className="installed-path-input">
                  <input
                    required
                    value={form.folder}
                    placeholder={tr("InstalledGames.69e9869966")}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        folder: e.target.value.replace(/^"|"$/g, ""),
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={picking}
                    onClick={() => void pick("folder")}
                  >
                    <FolderOpen size={16} /> {tr("InstalledGames.842ca60786")}</button>
                </div>
              </label>
              <label>
                {tr("InstalledGames.edc98d2072")}<input
                  required
                  value={form.extensions}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, extensions: e.target.value }))
                  }
                  placeholder={tr("InstalledGames.0745249aaa")}
                />
              </label>
              <label className="gamer-check">
                <input
                  type="checkbox"
                  checked={form.recursive}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, recursive: e.target.checked }))
                  }
                />
                {tr("InstalledGames.0d66450232")}</label>
            </>
          ) : (
            <>
              <label>
                {tr("InstalledGames.22614ace1a")}<select
                  value={form.launcher}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, launcher: e.target.value }))
                  }
                >
                  {Object.entries(launcherNames)
                    .filter(([id]) => id !== "emulator")
                    .map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {tr("InstalledGames.655bdeb5e6")}<input
                  type="url"
                  value={form.image}
                  placeholder={tr("InstalledGames.ab04e20ed4")}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, image: e.target.value }))
                  }
                />
              </label>
            </>
          )}
          <details>
            <summary>{tr("InstalledGames.50dc6fd313")}</summary>
            <label>
              {tr("InstalledGames.fefb57cda5")}<input
                value={form.args}
                onChange={(e) =>
                  setForm((p) => ({ ...p, args: e.target.value }))
                }
              />
            </label>
            <p className="muted">
              {add === "emulator"
                ? tr("InstalledGames.c6539021ac")
                : tr("InstalledGames.26239bf059")}
            </p>
          </details>
          {picking && (
            <p role="status" className="muted">
              {tr("InstalledGames.4f920ea1d7")}</p>
          )}
          {formError && (
            <p className="error-message" role="alert">
              {formError}
            </p>
          )}
          <button className="primary-button" disabled={busy || picking}>
            <Plus size={16} />
            {busy
              ? tr("InstalledGames.3c8dc4dc7a")
              : add === "emulator"
                ? tr("InstalledGames.d300bd7ece")
                : tr("InstalledGames.4ed1bb1fe1")}
          </button>
        </form>
      </Dialog>
      <Dialog
        open={emulatorsOpen}
        onClose={() => setEmulatorsOpen(false)}
        title={tr("InstalledGames.6ae2ddcf7f")}
        description={tr("InstalledGames.31f5432c8d")}
      >
        <div className="dialog-body form-stack">
          {!snapshot?.emulators.length && (
            <p className="muted">
              {tr("InstalledGames.7fb1ddc27c")}</p>
          )}
          {snapshot?.emulators.map((emulator: EmulatorConfig) => (
            <div className="installed-emulator" key={emulator.id}>
              <Gamepad2 size={22} />
              <div>
                <strong>{emulator.name}</strong>
                <small>{emulator.extensions.join(" · ")}</small>
                <span>
                  {emulator.enabled ? tr("InstalledGames.723858144b") : tr("interface.InstalledGames.e1200b67ca", { v0: APP_NAME })}
                </span>
              </div>
              <button
                className="secondary-button"
                onClick={() =>
                  void disableEntry(emulator.id, "emulators", !emulator.enabled)
                }
              >
                {emulator.enabled ? tr("InstalledGames.f039f4a8c9") : tr("InstalledGames.eda02893d3")}
              </button>
            </div>
          ))}
          <button
            className="primary-button"
            onClick={() => openAdd("emulator")}
          >
            <Plus size={16} /> {tr("InstalledGames.6245382148")}</button>
          <p className="muted">
            {APP_NAME} {tr("InstalledGames.3eea02cf42")}{APP_NAME} {tr("InstalledGames.53633486a7")}</p>
        </div>
      </Dialog>
    </section>
  );
}
