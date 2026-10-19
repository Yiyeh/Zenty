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
  const { settings, setSettings, games, setGames, notify } = useDashboard();
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
        ? "Juego visible otra vez."
        : "Juego oculto. Puedes recuperarlo en Ocultos.",
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
      notify("Quitado de tu juegoteca. Sigue instalado.", () =>
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
    notify("Añadido a tu juegoteca.");
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
          ? "Acceso restaurado."
          : `Acceso quitado de ${APP_NAME}. Los archivos siguen en tu equipo.`,
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
    <section className="installed-library">
      <div className="installed-heading">
        <div>
          <h2>Todos tus juegos. A un clic.</h2>
          <p>Instalados en tu PC, reunidos aquí. Busca y vuelve a jugar.</p>
        </div>
        <div className="installed-actions">
          {isRemoteLibrary && <small>Las aplicaciones y emuladores se añaden desde el PC.</small>}
          <button
            className="secondary-button"
            disabled={isRemoteLibrary} title={isRemoteLibrary ? "Configura los emuladores desde el PC" : undefined}
            onClick={() => setEmulatorsOpen(true)}
          >
            <Gamepad2 size={16} /> Emuladores
            {enabledEmulators.length > 0 && (
              <span>{enabledEmulators.length}</span>
            )}
          </button>
          <button className="primary-button" disabled={isRemoteLibrary} onClick={() => openAdd("game")}>
            <Plus size={16} /> Añadir juego
          </button>
        </div>
      </div>
      <div className="installed-toolbar">
        <label className="installed-search">
          <Search size={19} />
          <input
            ref={searchInput}
            autoComplete="off"
            aria-label="Buscar en mis juegos instalados"
            placeholder="Busca un juego, launcher o emulador…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(24);
            }}
          />
          {query && (
            <button
              className="icon-button"
              aria-label="Limpiar búsqueda de instalados"
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
          {loading ? "Cargando biblioteca…" : "Detectar juegos"}
        </button>
      </div>
      <div className="installed-filterbar">
        <select
          aria-label="Launcher de mis juegos"
          value={launcher}
          onChange={(e) => {
            setLauncher(e.target.value);
            setLimit(24);
          }}
        >
          <option value="all">Todos los launchers</option>
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
          <Bookmark size={15} /> En mi juegoteca
        </button>
        <button
          aria-pressed={hidden}
          className={hidden ? "active" : ""}
          onClick={() => {
            setHidden((p) => !p);
            setLimit(24);
          }}
        >
          <EyeOff size={15} /> Ocultos
          {hiddenIds.size > 0 && <span>{hiddenIds.size}</span>}
        </button>
        <select
          aria-label="Orden de mis juegos instalados"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recent">Abiertos recientemente</option>
          <option value="name">Nombre A–Z</option>
        </select>
        <div className="installed-view">
          <button
            className={view === "grid" ? "active" : ""}
            aria-label="Vista de carátulas"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            <Grid2X2 size={17} />
          </button>
          <button
            className={view === "list" ? "active" : ""}
            aria-label="Vista de lista"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List size={18} />
          </button>
        </div>
      </div>
      {error && (
        <div className="gamer-notice" role="alert">
          {error}
          <button className="text-button" onClick={() => void refresh()}>
            Reintentar
          </button>
        </div>
      )}
      {snapshot?.warnings.map((warning, i) => (
        <p className="installed-warning" key={i}>
          {warning}
        </p>
      ))}
      {loading && !snapshot ? (
        <div className="installed-loading" role="status">
          <MonitorDown size={30} />
          <h3>Encontrando tus juegos</h3>
          <p>
            Consultando bibliotecas de los launchers. No recorremos tus carpetas
            personales.
          </p>
        </div>
      ) : (
        <>
          <div className="installed-count" aria-live="polite">
            <span>
              {items.length} {items.length === 1 ? "juego" : "juegos"}
              {hidden ? " ocultos" : " en tu biblioteca"}
            </span>
            {snapshot && (
              <small>
                Detección:{" "}
                {new Date(snapshot.scannedAt).toLocaleTimeString("es-CL", {
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
                      aria-label={`Ver detalles de ${game.title}`}
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
                      <div className="installed-card-actions">
                        <button
                          className="installed-play"
                          disabled={!!launching}
                          onClick={() => void launch(game)}
                          aria-label={`Jugar ${game.title}`}
                        >
                          <Play size={15} fill="currentColor" />
                          {launching === game.id ? "Abriendo…" : isRemoteLibrary ? "Jugar en el PC" : "Jugar"}
                        </button>
                        <button
                          className="icon-button"
                          aria-pressed={savedIds.has(game.id)}
                          aria-label={`${savedIds.has(game.id) ? "Quitar de" : "Añadir a"} mi juegoteca: ${game.title}`}
                          title="Mi juegoteca"
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
                          aria-label={`${hidden ? "Mostrar" : "Ocultar"} ${game.title}`}
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
                  ? "No hay juegos con esos filtros"
                  : "Tu colección empieza aquí"}
              </h3>
              <p>
                {query || launcher !== "all" || hidden || onlyFavorites
                  ? "Prueba otro nombre o cambia los filtros."
                  : "Detecta tus juegos, añade un acceso o configura tu primer emulador."}
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
                  ? "Limpiar filtros"
                  : "Añadir un juego"}
              </button>
            </div>
          )}
          {items.length > limit && (
            <button
              className="secondary-button gamer-load-more"
              onClick={() => setLimit((p) => p + 24)}
            >
              Cargar 24 más <Plus size={15} />
            </button>
          )}
        </>
      )}
      <details className="installed-help">
        <summary>
          Compatibilidad y dónde se guardan mis accesos{" "}
          <ChevronRight size={14} />
        </summary>
        <p>
          Steam, Epic, GOG y Amazon Games usan sus registros o manifiestos de
          instalación. Ubisoft Connect, EA app, Battle.net y Riot se detectan
          cuando registran un ejecutable identificable. Xbox, Game Pass y Microsoft Store
          se buscan en los paquetes del usuario y en bibliotecas XboxGames de todas las unidades,
          incluidas las ubicaciones indicadas por Gaming Services. Solo aparecen juegos instalados;
          los títulos del catálogo o de la nube no se añaden. Si falta alguno, usa Añadir juego.
        </p>
        <p>
          La lista se conserva entre aperturas. Usa «Detectar juegos» para encontrar instalaciones nuevas o juegos eliminados.
          Los accesos y emuladores se guardan en la carpeta privada gaming-data
          de este equipo. Ocultar o quitar un acceso no desinstala ni elimina
          juegos o ROMs. Las fichas de Epic buscan también la portada de su tienda; las demás se completan desde Steam solo si se
          encuentra una coincidencia exacta; también puedes poner tu propia
          imagen.
        </p>
        {!!snapshot?.removed?.length && (
          <div>
            <h3>Accesos quitados</h3>
            {snapshot.removed.map((entry) => (
              <div className="installed-emulator" key={entry.id}>
                <span>{entry.title}</span>
                <button
                  className="secondary-button"
                  onClick={() => void disableEntry(entry.id, "manual", true)}
                >
                  Restaurar acceso
                </button>
              </div>
            ))}
          </div>
        )}
      </details>
      <Dialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.title || "Mi juego"}
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
                Completando ficha… Puedes abrir el juego mientras tanto.
              </p>
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
                {launching === detail.id ? "Abriendo…" : isRemoteLibrary ? "Jugar en el PC" : "Jugar ahora"}
              </button>
              <button
                className="secondary-button"
                onClick={() => saveGame(detail)}
              >
                <Bookmark size={15} />
                {savedIds.has(detail.id)
                  ? "Quitar de mi juegoteca"
                  : "Añadir a mi juegoteca"}
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
                  ? "Volver a mostrar"
                  : "Ocultar juego"}
              </button>
            </div>
            {meta?.source && (
              <small className="muted">
                Ficha: {meta.source}
                {meta.url && (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      href={meta.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver en la tienda <ArrowUpRight size={12} />
                    </a>
                  </>
                )}
              </small>
            )}
            <details className="installed-path">
              <summary>Ubicación y carátula</summary>
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
                      source: "Personalizada",
                      fetchedAt: new Date().toISOString(),
                    };
                    setMetadata((p) => ({ ...p, [detail.id]: value }));
                    notify("Carátula actualizada.");
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                <input
                  aria-label="URL de la carátula"
                  type="url"
                  placeholder="https://… imagen personalizada"
                  value={artwork}
                  onChange={(e) => setArtwork(e.target.value)}
                  required
                />
                <button className="secondary-button">Guardar carátula</button>
              </form>
            </details>
            {detail.id.startsWith("local:") && (
              <button
                className="text-button danger"
                onClick={() => void disableEntry(detail.id, "manual", false)}
              >
                <Trash2 size={15} /> Quitar acceso de {APP_NAME}
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
            ? "Tu emulador, tus juegos"
            : "Añadir un juego de tu PC"
        }
        description={
          add === "emulator"
            ? "Elige el emulador y la carpeta de ROMs que ya tienes."
            : "Crea un acceso a cualquier juego instalado."
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
                  'Los argumentos deben ser una lista, por ejemplo ["{rom}"].',
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
                  ? "Emulador añadido. Tus ROMs ya están en la biblioteca."
                  : "Acceso añadido a tus juegos.",
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
              Configurar para
              <select
                defaultValue=""
                onChange={(e) => {
                  const preset = emulatorPresets.find(
                    (p) => p.name === e.target.value,
                  );
                  if (preset)
                    setForm((p) => ({
                      ...p,
                      title: preset.name === "Otro emulador" ? "" : preset.name,
                      extensions: preset.extensions,
                      args: preset.args,
                    }));
                }}
              >
                <option value="" disabled>
                  Elegir emulador…
                </option>
                {emulatorPresets.map((p) => (
                  <option key={p.name}>{p.name}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            {add === "emulator" ? "Nombre del emulador" : "Nombre del juego"}
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
                  ? "Por ejemplo, Dolphin · GameCube"
                  : "Nombre del juego"
              }
            />
          </label>
          <label>
            Ejecutable (.exe)
            <div className="installed-path-input">
              <input
                required
                value={form.executable}
                placeholder="C:\Juegos\Mi juego\juego.exe"
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
                <FolderOpen size={16} /> Elegir
              </button>
            </div>
          </label>
          {add === "emulator" ? (
            <>
              <label>
                Carpeta de ROMs
                <div className="installed-path-input">
                  <input
                    required
                    value={form.folder}
                    placeholder="D:\ROMs\GameCube"
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
                    <FolderOpen size={16} /> Elegir
                  </button>
                </div>
              </label>
              <label>
                Formatos, separados por comas
                <input
                  required
                  value={form.extensions}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, extensions: e.target.value }))
                  }
                  placeholder="iso,rvz,gcm"
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
                Incluir subcarpetas (hasta 4 niveles)
              </label>
            </>
          ) : (
            <>
              <label>
                Launcher
                <select
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
                Carátula (opcional)
                <input
                  type="url"
                  value={form.image}
                  placeholder="https://…"
                  onChange={(e) =>
                    setForm((p) => ({ ...p, image: e.target.value }))
                  }
                />
              </label>
            </>
          )}
          <details>
            <summary>Opciones de inicio</summary>
            <label>
              Argumentos de inicio
              <input
                value={form.args}
                onChange={(e) =>
                  setForm((p) => ({ ...p, args: e.target.value }))
                }
              />
            </label>
            <p className="muted">
              {add === "emulator"
                ? "Cada argumento va entre comillas en una lista. {rom} se reemplaza por el archivo del juego. RetroArch requiere indicar el core real que tienes instalado."
                : 'Normalmente puedes dejar []. Si el juego necesita parámetros, añádelos como una lista: ["-fullscreen"].'}
            </p>
          </details>
          {picking && (
            <p role="status" className="muted">
              El selector de Windows está abierto. Elige el archivo o la carpeta
              para continuar.
            </p>
          )}
          {formError && (
            <p className="error-message" role="alert">
              {formError}
            </p>
          )}
          <button className="primary-button" disabled={busy || picking}>
            <Plus size={16} />
            {busy
              ? "Guardando…"
              : add === "emulator"
                ? "Añadir emulador y detectar ROMs"
                : "Guardar acceso"}
          </button>
        </form>
      </Dialog>
      <Dialog
        open={emulatorsOpen}
        onClose={() => setEmulatorsOpen(false)}
        title="Mis emuladores"
        description="Tus ROMs se abren con el emulador que elijas."
      >
        <div className="dialog-body form-stack">
          {!snapshot?.emulators.length && (
            <p className="muted">
              Configura un emulador para ver tus ROMs junto con los demás
              juegos.
            </p>
          )}
          {snapshot?.emulators.map((emulator: EmulatorConfig) => (
            <div className="installed-emulator" key={emulator.id}>
              <Gamepad2 size={22} />
              <div>
                <strong>{emulator.name}</strong>
                <small>{emulator.extensions.join(" · ")}</small>
                <span>
                  {emulator.enabled ? "Activo" : `Quitado de ${APP_NAME}`}
                </span>
              </div>
              <button
                className="secondary-button"
                onClick={() =>
                  void disableEntry(emulator.id, "emulators", !emulator.enabled)
                }
              >
                {emulator.enabled ? "Quitar" : "Restaurar"}
              </button>
            </div>
          ))}
          <button
            className="primary-button"
            onClick={() => openAdd("emulator")}
          >
            <Plus size={16} /> Añadir emulador
          </button>
          <p className="muted">
            {APP_NAME} no incluye emuladores, BIOS ni ROMs; usa los archivos que
            ya tengas. Quitar un emulador de {APP_NAME} conserva todos sus
            archivos.
          </p>
        </div>
      </Dialog>
    </section>
  );
}
