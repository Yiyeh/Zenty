import { newId } from "../lib/id";
import { APP_NAME, APP_SLUG } from "../lib/brand.ts";
import { lazy, Suspense, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Gamepad2,
  Gift,
  Heart,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Tag,
  Trash2,
  X,
  MonitorDown,
  Play,
} from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
import {
  dateOnly,
  displayGameDate,
  emptyGame,
  gameStatuses,
  giveawayExpired,
  httpsUrl,
  kindNames,
  matchesPlatform,
  platformOptions,
  sourceNames,
  localGameFavorite,
  cachedGameImage,
} from "../lib/gaming";
import type { GameItem, GameStatus } from "../lib/gaming";
import { useGamingFeed } from "../lib/useGamingFeed";
import type { FeedKind } from "../lib/useGamingFeed";
import { Dialog } from "./Dialog";
import { localDate } from "../lib/dashboard";
import { installedRequest } from "../lib/installed-client";
const InstalledGames = lazy(() =>
  import("./InstalledGames").then((module) => ({
    default: module.InstalledGames,
  })),
);
const tabs = [
  { id: "installed", label: "Mis juegos", icon: MonitorDown },
  { id: "giveaways", label: "Juegos gratis", icon: Gift },
  { id: "releases", label: "Lanzamientos", icon: CalendarDays },
  { id: "deals", label: "Ofertas de PC", icon: Tag },
  { id: "saved", label: "Mi juegoteca", icon: Heart },
] as const;
type Tab = (typeof tabs)[number]["id"];
const sources: Record<FeedKind, { title: string; url: string }> = {
  giveaways: { title: "GamerPower", url: "https://www.gamerpower.com/" },
  releases: {
    title: "Steam",
    url: "https://store.steampowered.com/explore/upcoming/",
  },
  deals: { title: "CheapShark", url: "https://www.cheapshark.com/" },
};
function Price({ game }: { game: GameItem }) {
  return game.price !== null ? (
    <span className="gamer-price">
      <strong>
        {new Intl.NumberFormat("es-CL", {
          style: "currency",
          currency: "USD",
          currencyDisplay: "code",
        }).format(game.price)}
      </strong>
      {game.regularPrice !== null && (
        <del>
          {new Intl.NumberFormat("es-CL", {
            style: "currency",
            currency: "USD",
            currencyDisplay: "code",
          }).format(game.regularPrice)}
        </del>
      )}
    </span>
  ) : null;
}
function exportDate(game: GameItem) {
  if (!game.releaseDate) return;
  const date = new Date(`${game.releaseDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  const escape = (value: string) =>
    value
      .replace(/\\/g, "\\\\")
      .replace(/[\r\n]+/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${APP_NAME}//Gaming//ES`,
    "BEGIN:VEVENT",
    `UID:${escape(game.id)}@${APP_SLUG}.local`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${game.releaseDate.replace(/-/g, "")}`,
    `DTEND;VALUE=DATE:${date.toISOString().slice(0, 10).replace(/-/g, "")}`,
    `SUMMARY:${escape(game.title)}`,
    `DESCRIPTION:${escape("Lanzamiento según la fuente. La fecha puede cambiar. " + game.url)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/calendar;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${APP_SLUG}-lanzamiento.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Gaming() {
  const { settings, setSettings, games, setGames, notify } = useDashboard();
  const [tab, setTab] = useState<Tab>("installed");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("game");
  const [releaseFilter, setReleaseFilter] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("recommended");
  const [limit, setLimit] = useState(12);
  const [detail, setDetail] = useState<GameItem | null>(null);
  const [preferences, setPreferences] = useState(false);
  const [adding, setAdding] = useState(false);
  const [manual, setManual] = useState({
    title: "",
    platform: "PC",
    url: "",
    date: "",
  });
  const [formError, setFormError] = useState("");
  const [launching, setLaunching] = useState("");
  const { feed, loading, reload } = useGamingFeed(
    tab === "saved" || tab === "installed" ? null : tab,
  );
  const selected = games.find((s) => s.id === detail?.id);
  const launchSaved = async (game: GameItem) => {
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
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setLaunching("");
    }
  };
  const save = (game: GameItem) => {
    if (games.some((s) => s.id === game.id)) {
      notify("Ya está en tu juegoteca.");
      return;
    }
    setGames((p) =>
      p.some((s) => s.id === game.id)
        ? p
        : [
            {
              id: game.id,
              game,
              status: "pending",
              note: "",
              addedAt: new Date().toISOString(),
            },
            ...p,
          ],
    );
    notify("Guardado en tu juegoteca.");
  };
  const remove = (id: string) => {
    const previous = games.find((g) => g.id === id);
    setGames((p) => p.filter((g) => g.id !== id));
    if (previous)
      notify("Juego quitado de tu lista.", () =>
        setGames((p) => (p.some((g) => g.id === id) ? p : [previous, ...p])),
      );
  };
  const items = useMemo(() => {
    const list = tab === "saved" ? games.map((s) => s.game) : feed?.items || [];
    const filtered = list.filter((g) => {
      if (
        !matchesPlatform(g, settings.gamingPlatform) ||
        !`${g.title} ${g.platforms.join(" ")} ${g.store}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase())
      )
        return false;
      if (
        tab === "giveaways" &&
        (giveawayExpired(g) ||
          (kind !== "all" && g.kind !== kind) ||
          (settings.gamingHideClaimed &&
            games.some((s) => s.id === g.id && s.status === "claimed")))
      )
        return false;
      if (
        tab === "releases" &&
        ((!settings.gamingShowDemos && g.demo) ||
          (releaseFilter === "upcoming" && !g.comingSoon) ||
          (releaseFilter === "recent" && g.comingSoon))
      )
        return false;
      if (
        tab === "saved" &&
        status !== "all" &&
        games.find((s) => s.id === g.id)?.status !== status
      )
        return false;
      return true;
    });
    return sort === "title"
      ? filtered.sort((a, b) => a.title.localeCompare(b.title))
      : sort === "ending"
        ? filtered.sort((a, b) =>
            (a.endDate || "9999").localeCompare(b.endDate || "9999"),
          )
        : sort === "price"
          ? filtered.sort(
              (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
            )
          : sort === "date"
            ? filtered.sort((a, b) =>
                (a.releaseDate || "9999").localeCompare(
                  b.releaseDate || "9999",
                ),
              )
            : filtered;
  }, [
    tab,
    games,
    feed,
    settings.gamingPlatform,
    settings.gamingShowDemos,
    settings.gamingHideClaimed,
    query,
    kind,
    releaseFilter,
    status,
    sort,
  ]);
  const changeTab = (next: Tab) => {
    setTab(next);
    setLimit(12);
    setSort("recommended");
    setQuery("");
  };
  const feedTime = feed?.updatedAt
    ? new Date(feed.updatedAt).toLocaleString("es-CL", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Sin consulta disponible";
  return (
    <div
      className={`gaming-page ${tab === "installed" ? "gaming-library-active" : ""}`}
    >
      <section className="gamer-hero">
        <div className="gamer-hero-copy">
          <span className="gamer-eyebrow">
            <span /> TU PRÓXIMA PARTIDA EMPIEZA AQUÍ
          </span>
          <h1>
            Tu rincón <em>gamer.</em>
          </h1>
          <p>
            Descubre, guarda y juega. Un lugar para todo lo que te entusiasma.
          </p>
          <div className="gamer-hero-actions">
            <button onClick={() => changeTab("saved")}>
              <Heart size={16} /> Mi juegoteca <span>{games.length}</span>
            </button>
            <button onClick={() => setPreferences(true)}>
              <Settings2 size={16} /> A mi manera
            </button>
          </div>
        </div>
        <div className="gamer-hero-art" aria-hidden="true">
          <i />
          <i />
          <Gamepad2 strokeWidth={0.85} />
          <span>PRESS PLAY. MAKE TIME.</span>
        </div>
      </section>
      <div className="gamer-quick-links">
        <span>TUS PUNTOS DE ENCUENTRO</span>
        {[
          { name: "Steam", url: "https://store.steampowered.com/" },
          {
            name: "Epic Games",
            url: "https://store.epicgames.com/es-ES/free-games",
          },
          { name: "GOG", url: "https://www.gog.com/" },
          { name: "Twitch", url: "https://www.twitch.tv/" },
          { name: "Discord", url: "https://discord.com/channels/@me" },
        ].map((a) => (
          <a
            key={a.name}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {a.name}
            <ArrowUpRight size={12} />
          </a>
        ))}
      </div>
      <div className="gamer-tabbar">
        <div className="gamer-tabs" aria-label="Secciones gamer">
          {tabs.map((t) => (
            <button
              key={t.id}
              aria-pressed={tab === t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => changeTab(t.id)}
            >
              <t.icon size={17} />
              {t.label}
              {t.id === "saved" && <span>{games.length}</span>}
            </button>
          ))}
        </div>
        <button
          className="icon-button"
          aria-label="Preferencias del rincón gamer"
          onClick={() => setPreferences(true)}
        >
          <Settings2 size={18} />
        </button>
      </div>
      {tab === "installed" ? (
        <Suspense
          fallback={
            <div className="empty-state" role="status">
              Preparando tus juegos…
            </div>
          }
        >
          <InstalledGames />
        </Suspense>
      ) : (
        <>
          <div className="gamer-section-heading">
            <div>
              <span className="eyebrow">
                {tab === "giveaways"
                  ? "QUE NO SE TE ESCAPEN"
                  : tab === "releases"
                    ? "EN TU RADAR"
                    : tab === "deals"
                      ? "MÁS JUEGOS POR MENOS"
                      : "TU LISTA, TU RITMO"}
              </span>
              <h2>
                {tab === "giveaways"
                  ? "Una buena excusa para jugar"
                  : tab === "releases"
                    ? "Lo que viene. Lo que acaba de llegar."
                    : tab === "deals"
                      ? "Ofertas para tu próxima aventura"
                      : "Tu colección de próximas partidas"}
              </h2>
              <p>
                {tab === "giveaways"
                  ? "Promociones publicadas por GamerPower. Revisa los requisitos antes de reclamarlas."
                  : tab === "releases"
                    ? "Selección de próximos y nuevos lanzamientos de Steam para PC; puede incluir demos."
                    : tab === "deals"
                      ? "Una selección de descuentos en tiendas de PC. Precios en USD; confirma tu región al comprar."
                      : "Tus favoritos, pendientes y juegos terminados, con tus propias notas."}
              </p>
            </div>
            {tab === "saved" ? (
              <button
                className="primary-button"
                onClick={() => {
                  setAdding(true);
                  setFormError("");
                }}
              >
                <Plus size={16} /> Añadir juego
              </button>
            ) : (
              <button
                className="secondary-button"
                disabled={loading}
                onClick={() => void reload()}
              >
                <RefreshCw
                  size={15}
                  className={loading ? "gamer-spinning" : ""}
                />
                {loading ? "Consultando…" : "Actualizar"}
              </button>
            )}
          </div>
          <div className="gamer-filters">
            <label className="gamer-search">
              <Search size={16} />
              <input
                aria-label="Buscar juegos"
                placeholder="Encuentra tu próxima aventura…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(12);
                }}
              />
              {query && (
                <button
                  className="icon-button"
                  aria-label="Limpiar búsqueda de juegos"
                  onClick={() => setQuery("")}
                >
                  <X size={14} />
                </button>
              )}
            </label>
            <select
              aria-label="Plataforma de juegos"
              value={settings.gamingPlatform}
              onChange={(e) => {
                setSettings((s) => ({ ...s, gamingPlatform: e.target.value }));
                setLimit(12);
              }}
            >
              <option value="all">Todas las plataformas</option>
              {platformOptions.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            {tab === "giveaways" && (
              <select
                aria-label="Tipo de regalo"
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  setLimit(12);
                }}
              >
                <option value="game">Juegos completos</option>
                <option value="loot">DLC y contenido</option>
                <option value="beta">Betas y pruebas</option>
                <option value="all">Todos los regalos</option>
              </select>
            )}
            {tab === "releases" && (
              <select
                aria-label="Estado del lanzamiento"
                value={releaseFilter}
                onChange={(e) => setReleaseFilter(e.target.value)}
              >
                <option value="all">Próximos y recientes</option>
                <option value="upcoming">Próximamente</option>
                <option value="recent">Ya disponibles</option>
              </select>
            )}
            {tab === "saved" && (
              <select
                aria-label="Estado de mis juegos"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">Todos los estados</option>
                {Object.entries(gameStatuses).map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
              </select>
            )}
            <select
              aria-label="Ordenar juegos"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recommended">
                {tab === "saved"
                  ? "Guardados recientemente"
                  : "Orden de la fuente"}
              </option>
              <option value="title">Nombre A–Z</option>
              {tab === "giveaways" && (
                <option value="ending">Terminan antes</option>
              )}
              {tab === "deals" && <option value="price">Menor precio</option>}
              {tab === "releases" && (
                <option value="date">Fecha de lanzamiento</option>
              )}
            </select>
          </div>
          {tab !== "saved" && (
            <div className="gamer-source-line">
              <span>
                <span
                  className={
                    feed?.stale ? "gamer-status-dot stale" : "gamer-status-dot"
                  }
                />
                {loading
                  ? "Consultando la fuente…"
                  : `Última consulta: ${feedTime}`}
              </span>
              <span>
                Fuente:{" "}
                <a
                  href={sources[tab].url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {sources[tab].title}
                  <ArrowUpRight size={11} />
                </a>{" "}
                · Consultas cada 15 min
              </span>
            </div>
          )}
          {feed?.warning && tab !== "saved" && (
            <div className="gamer-notice" role="alert">
              <Clock3 size={18} />
              <span>{feed.warning}</span>
            </div>
          )}
          {tab === "releases" &&
            !["all", "PC"].includes(settings.gamingPlatform) && (
              <div className="gamer-notice">
                <CalendarDays size={18} />
                <span>
                  Esta selección automática cubre PC. Para consolas, abre sus
                  calendarios oficiales más abajo o añade un juego a tu
                  juegoteca.
                </span>
              </div>
            )}
          {loading && !feed ? (
            <div className="gamer-loading" role="status">
              <Sparkles size={26} />
              <h3>Preparando tu próxima partida</h3>
              <p>
                Estamos consultando{" "}
                {tab === "saved" ? "tus juegos" : sources[tab].title}. Puede
                tardar unos segundos.
              </p>
              <div className="gamer-skeletons">
                {[1, 2, 3].map((i) => (
                  <span key={i} />
                ))}
              </div>
            </div>
          ) : items.length ? (
            <>
              <div className="gamer-result-count">
                {items.length}{" "}
                {items.length === 1
                  ? "juego en tu radar"
                  : "resultados en tu radar"}
                {settings.gamingPlatform !== "all" && (
                  <span> · {settings.gamingPlatform}</span>
                )}
              </div>
              <div className="gamer-grid">
                {items.slice(0, limit).map((g) => {
                  const saved = games.find((s) => s.id === g.id);
                  const expired = giveawayExpired(g);
                  return (
                    <article className="gamer-card" key={g.id}>
                      <div className="gamer-cover">
                        <Gamepad2
                          className="gamer-cover-placeholder"
                          size={50}
                          strokeWidth={1}
                        />
                        {g.image && (
                          <img
                            src={cachedGameImage(g.image)}
                            alt=""
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onLoad={(event) => {
                              event.currentTarget.style.visibility = "visible";
                            }}
                            onError={(e) => {
                              e.currentTarget.style.visibility = "hidden";
                            }}
                          />
                        )}
                        <span className={`gamer-kind kind-${g.kind}`}>
                          {g.kind === "deal"
                            ? `−${g.discount}%`
                            : g.kind === "release"
                              ? g.demo
                                ? "Demo"
                                : g.comingSoon
                                  ? "Próximamente"
                                  : "Ya disponible"
                              : kindNames[g.kind]}
                        </span>
                        <button
                          className={`gamer-save ${saved ? "saved" : ""}`}
                          aria-label={`${saved ? "Ver" : "Guardar"} ${g.title}`}
                          title={
                            saved
                              ? "Ya está en tu juegoteca"
                              : "Guardar en mi juegoteca"
                          }
                          onClick={() => (saved ? setDetail(g) : save(g))}
                        >
                          {saved ? (
                            <BookmarkCheck size={18} />
                          ) : (
                            <Bookmark size={18} />
                          )}
                        </button>
                      </div>
                      <div className="gamer-card-body">
                        <span className="gamer-platforms">
                          {g.store ||
                            g.platforms.join(" · ") ||
                            "Ver plataforma en la fuente"}
                        </span>
                        <button
                          className="gamer-title"
                          onClick={() => setDetail(g)}
                        >
                          <h3>{g.title}</h3>
                        </button>
                        <div className="gamer-card-meta">
                          {g.kind === "deal" ? (
                            <Price game={g} />
                          ) : g.kind === "release" ? (
                            <span>
                              <CalendarDays size={13} />
                              {g.releaseDate
                                ? displayGameDate(g.releaseDate)
                                : g.releaseLabel ||
                                  (g.comingSoon
                                    ? "Fecha por confirmar"
                                    : "Disponible en Steam")}
                            </span>
                          ) : (
                            <span className={expired ? "gamer-expired" : ""}>
                              <Clock3 size={13} />
                              {expired
                                ? "Fecha de cierre pasada"
                                : g.endDate
                                  ? `Finaliza el ${displayGameDate(g.endDate)}`
                                  : "Sin fecha de cierre indicada"}
                            </span>
                          )}
                        </div>
                        {tab === "saved" && saved && (
                          <label className="gamer-status-label">
                            Estado
                            <select
                              aria-label={`Estado de ${g.title}`}
                              value={saved.status}
                              onChange={(e) =>
                                setGames((p) =>
                                  p.map((s) =>
                                    s.id === g.id
                                      ? {
                                          ...s,
                                          status: e.target.value as GameStatus,
                                        }
                                      : s,
                                  ),
                                )
                              }
                            >
                              {Object.entries(gameStatuses).map(
                                ([id, label]) => (
                                  <option key={id} value={id}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                        )}
                        {tab === "saved" && localGameFavorite(g) && (
                          <button
                            className="installed-play gamer-saved-play"
                            disabled={!!launching}
                            onClick={() => void launchSaved(g)}
                          >
                            <Play size={15} fill="currentColor" />
                            {launching === g.id ? "Abriendo…" : "Jugar"}
                          </button>
                        )}
                        <div className="gamer-card-bottom">
                          <button onClick={() => setDetail(g)}>
                            {tab === "saved"
                              ? "Detalles y notas"
                              : "Ver detalles"}
                            <ChevronRight size={14} />
                          </button>
                          {saved?.status === "claimed" ? (
                            <span className="gamer-claimed">
                              <Check size={13} />
                              Reclamado
                            </span>
                          ) : (
                            <small>{sourceNames[g.source]}</small>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              {items.length > limit && (
                <button
                  className="secondary-button gamer-load-more"
                  onClick={() => setLimit((n) => n + 12)}
                >
                  Ver más juegos <Plus size={15} />
                </button>
              )}
            </>
          ) : (
            <div className="gamer-empty">
              <Gamepad2 size={40} strokeWidth={1} />
              <h3>
                {tab === "saved" && !games.length
                  ? "Tus próximas aventuras viven aquí"
                  : "No hay juegos para estos filtros"}
              </h3>
              <p>
                {tab === "saved" && !games.length
                  ? "Guarda un juego desde el radar o añade uno que ya tengas en mente."
                  : "Prueba otra plataforma, otro tipo de regalo o una búsqueda más corta."}
              </p>
              <button
                className="secondary-button"
                onClick={() => {
                  setQuery("");
                  setKind("all");
                  setReleaseFilter("all");
                  setStatus("all");
                  setSettings((s) => ({ ...s, gamingPlatform: "all" }));
                  if (tab === "saved" && !games.length) changeTab("giveaways");
                }}
              >
                {tab === "saved" && !games.length
                  ? "Explorar regalos"
                  : "Limpiar filtros"}
              </button>
            </div>
          )}
          <section className="gamer-bottom-panel">
            <div>
              <CalendarDays size={22} />
              <h3>Más allá de tu PC</h3>
              <p>Calendarios y novedades de las plataformas oficiales.</p>
            </div>
            <div className="gamer-console-links">
              <a
                href="https://www.playstation.com/es-cl/editorial/this-month-on-playstation/"
                target="_blank"
                rel="noopener noreferrer"
              >
                PlayStation <ArrowUpRight size={14} />
              </a>
              <a
                href="https://www.xbox.com/es-CL/games/all-games"
                target="_blank"
                rel="noopener noreferrer"
              >
                Xbox <ArrowUpRight size={14} />
              </a>
              <a
                href="https://www.nintendo.com/us/store/games/coming-soon/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Nintendo <ArrowUpRight size={14} />
              </a>
            </div>
          </section>
          <p className="gamer-footnote">
            Los regalos pueden requerir cuenta, región o un juego base.
            Disponibilidad y fechas pueden cambiar; confirma siempre en la
            fuente. Tus juegos guardados y preferencias se incluyen en el
            respaldo de {APP_NAME}.
          </p>
        </>
      )}
      <Dialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.title || "Detalles del juego"}
        description={
          detail
            ? `${kindNames[detail.kind]} · ${sourceNames[detail.source]}`
            : ""
        }
      >
        {detail && (
          <div className="dialog-body gamer-detail">
            {detail.image && (
              <img
                className="gamer-detail-image"
                src={cachedGameImage(detail.image)}
                alt=""
                referrerPolicy="no-referrer"
              />
            )}
            <div className="gamer-detail-tags">
              {detail.platforms.map((p) => (
                <span key={p}>{p}</span>
              ))}
              {detail.demo && <span>Demo</span>}
            </div>
            <Price game={detail} />
            {giveawayExpired(detail) && (
              <p className="error-message">
                La fecha de cierre publicada ya pasó. Este favorito se conserva
                como referencia.
              </p>
            )}
            {detail.description && (
              <div>
                <h3>Sobre este juego</h3>
                <p>{detail.description}</p>
              </div>
            )}
            {detail.instructions && (
              <div>
                <h3>Cómo reclamarlo</h3>
                <p className="gamer-instructions">{detail.instructions}</p>
                <small className="muted">
                  Texto original de GamerPower. Revisa los requisitos y la
                  vigencia antes de continuar.
                </small>
              </div>
            )}
            {detail.endDate && (
              <p className="muted">
                Cierre indicado: {displayGameDate(detail.endDate)}. La fuente no
                especifica zona horaria.
              </p>
            )}
            {detail.kind === "release" && (
              <p className="muted">
                {detail.releaseDate
                  ? `Fecha: ${displayGameDate(detail.releaseDate)}`
                  : detail.releaseLabel || "Fecha por confirmar"}
                . Puede cambiar según plataforma y región.
              </p>
            )}
            <div className="gamer-detail-actions">
              {localGameFavorite(detail) && (
                <button
                  className="primary-button"
                  disabled={!!launching}
                  onClick={() => void launchSaved(detail)}
                >
                  <Play size={16} />
                  {launching === detail.id ? "Abriendo…" : "Jugar ahora"}
                </button>
              )}
              {detail.url && (
                <a
                  className={
                    localGameFavorite(detail)
                      ? "secondary-button"
                      : "primary-button"
                  }
                  href={detail.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {detail.source === "gamerpower"
                    ? "Ver promoción y requisitos"
                    : detail.source === "cheapshark"
                      ? "Ver oferta en CheapShark"
                      : "Abrir página del juego"}
                  <ArrowUpRight size={16} />
                </a>
              )}
              {!selected && (
                <button
                  className="secondary-button"
                  onClick={() => save(detail)}
                >
                  <Bookmark size={16} /> Guardar juego
                </button>
              )}
              {detail.releaseDate && (
                <button
                  className="secondary-button"
                  onClick={() => exportDate(detail)}
                >
                  <ArrowDownToLine size={15} /> Añadir a mi calendario (.ics)
                </button>
              )}
            </div>
            {selected && (
              <div className="gamer-saved-editor">
                <h3>
                  <CheckCircle2 size={17} /> En tu juegoteca
                </h3>
                <label>
                  Estado
                  <select
                    aria-label="Estado del juego guardado"
                    value={selected.status}
                    onChange={(e) =>
                      setGames((p) =>
                        p.map((s) =>
                          s.id === selected.id
                            ? { ...s, status: e.target.value as GameStatus }
                            : s,
                        ),
                      )
                    }
                  >
                    {Object.entries(gameStatuses).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Mis notas
                  <textarea
                    aria-label="Mis notas del juego"
                    placeholder="Con quién jugarlo, por qué te llama la atención, dónde lo tienes…"
                    maxLength={5000}
                    rows={3}
                    value={selected.note}
                    onChange={(e) =>
                      setGames((p) =>
                        p.map((s) =>
                          s.id === selected.id
                            ? { ...s, note: e.target.value }
                            : s,
                        ),
                      )
                    }
                  />
                </label>
                <span className="muted">Se guarda al escribir.</span>
                <button
                  className="text-button danger"
                  onClick={() => {
                    remove(selected.id);
                    setDetail(null);
                  }}
                >
                  <Trash2 size={14} /> Quitar de mi lista
                </button>
              </div>
            )}
          </div>
        )}
      </Dialog>
      <Dialog
        open={preferences}
        onClose={() => setPreferences(false)}
        title="Tu radar, a tu manera"
        description="Estas preferencias se guardan con tu espacio."
      >
        <div className="dialog-body form-stack gamer-preferences">
          <label>
            Mi plataforma favorita
            <select
              value={settings.gamingPlatform}
              onChange={(e) =>
                setSettings((s) => ({ ...s, gamingPlatform: e.target.value }))
              }
            >
              <option value="all">Todas las plataformas</option>
              {platformOptions.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="gamer-check">
            <input
              type="checkbox"
              checked={settings.gamingHideClaimed}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  gamingHideClaimed: e.target.checked,
                }))
              }
            />
            Ocultar regalos que marqué como reclamados
          </label>
          <label className="gamer-check">
            <input
              type="checkbox"
              checked={settings.gamingShowDemos}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  gamingShowDemos: e.target.checked,
                }))
              }
            />
            Incluir demos en los lanzamientos
          </label>
          <label className="gamer-check">
            <input
              type="checkbox"
              checked={settings.enabledWidgets.gaming}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  enabledWidgets: {
                    ...s.enabledWidgets,
                    gaming: e.target.checked,
                  },
                }))
              }
            />
            Mostrar el widget Radar gamer en Mi espacio
          </label>
          <p className="muted">
            El radar consulta las fuentes al abrir cada apartado y reutiliza la
            consulta durante 15 minutos. Puedes explorar sin conectar cuentas.
            Reclama los juegos en el sitio de cada promoción.
          </p>
          <button
            className="primary-button"
            onClick={() => setPreferences(false)}
          >
            Listo, a jugar <Gamepad2 size={16} />
          </button>
        </div>
      </Dialog>
      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Una aventura para tu lista"
        description="Añade cualquier juego, de cualquier plataforma."
      >
        <form
          className="dialog-body form-stack gamer-manual"
          onSubmit={(e) => {
            e.preventDefault();
            const link = manual.url.trim() ? httpsUrl(manual.url.trim()) : "";
            if (
              !manual.title.trim() ||
              (manual.url.trim() && !link) ||
              (manual.date && !dateOnly(manual.date))
            ) {
              setFormError(
                "Escribe un nombre, un enlace HTTPS válido (si lo incluyes) y una fecha real.",
              );
              return;
            }
            const id = `manual:${newId()}`;
            save(
              emptyGame({
                id,
                title: manual.title.trim(),
                url: link,
                platforms: [manual.platform],
                releaseDate: manual.date || null,
                releaseLabel: manual.date ? displayGameDate(manual.date) : "",
                kind: manual.date ? "release" : "game",
                comingSoon: !!manual.date && manual.date > localDate(),
              }),
            );
            setManual({ title: "", platform: "PC", url: "", date: "" });
            setAdding(false);
            changeTab("saved");
          }}
        >
          <label>
            Nombre del juego
            <input
              autoFocus
              required
              maxLength={500}
              value={manual.title}
              onChange={(e) =>
                setManual((p) => ({ ...p, title: e.target.value }))
              }
              placeholder="Ese juego que tienes en mente"
            />
          </label>
          <label>
            Plataforma
            <select
              value={manual.platform}
              onChange={(e) =>
                setManual((p) => ({ ...p, platform: e.target.value }))
              }
            >
              {platformOptions.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Página del juego (opcional)
            <input
              type="url"
              placeholder="https://…"
              value={manual.url}
              onChange={(e) =>
                setManual((p) => ({ ...p, url: e.target.value }))
              }
            />
          </label>
          <label>
            Fecha de lanzamiento (opcional)
            <input
              type="date"
              value={manual.date}
              onChange={(e) =>
                setManual((p) => ({ ...p, date: e.target.value }))
              }
            />
          </label>
          {formError && (
            <p className="error-message" role="alert">
              {formError}
            </p>
          )}
          <button className="primary-button">
            <Plus size={16} /> Guardar en mi juegoteca
          </button>
        </form>
      </Dialog>
    </div>
  );
}
