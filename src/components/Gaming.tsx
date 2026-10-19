import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { tr, getFormatLocale } from "../lib/i18n.ts";
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
const tabs = ([
  { id: "installed", get label() { return tr("Gaming.93810150ff"); }, icon: MonitorDown },
  { id: "giveaways", get label() { return tr("Gaming.7b620f49f8"); }, icon: Gift },
  { id: "releases", get label() { return tr("Gaming.2a0d096ded"); }, icon: CalendarDays },
  { id: "deals", get label() { return tr("Gaming.ebf8f47b9f"); }, icon: Tag },
  { id: "saved", get label() { return tr("Gaming.7cd4459f57"); }, icon: Heart },
] as const);
type Tab = (typeof tabs)[number]["id"];
const sources: Record<FeedKind, { title: string; url: string }> = {
  giveaways: { get title() { return tr("Gaming.f8e0aae1be"); }, url: "https://www.gamerpower.com/" },
  releases: {
    title: "Steam",
    url: "https://store.steampowered.com/explore/upcoming/",
  },
  deals: { get title() { return tr("Gaming.727c458fd7"); }, url: "https://www.cheapshark.com/" },
};
function Price({ game }: { game: GameItem }) {
  useInterfaceLocale();
  return game.price !== null ? (
    <span className="gamer-price">
      <strong>
        {new Intl.NumberFormat(getFormatLocale(), {
          style: "currency",
          currency: "USD",
          currencyDisplay: "code",
        }).format(game.price)}
      </strong>
      {game.regularPrice !== null && (
        <del>
          {new Intl.NumberFormat(getFormatLocale(), {
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
    `DESCRIPTION:${escape(tr("Gaming.f7cbf7dea0") + game.url)}`,
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
  useInterfaceLocale();
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
      notify(tr("Gaming.cdc22f214c"));
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
    notify(tr("Gaming.5b3c2e0c43"));
  };
  const remove = (id: string) => {
    const previous = games.find((g) => g.id === id);
    setGames((p) => p.filter((g) => g.id !== id));
    if (previous)
      notify(tr("Gaming.7a7ab9be6c"), () =>
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
    ? new Date(feed.updatedAt).toLocaleString(getFormatLocale(), {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : tr("Gaming.b687c1dd9a");
  return (
    <div
      className={`gaming-page ${tab === "installed" ? "gaming-library-active" : ""}`}
    >
      <section className="gamer-hero">
        <div className="gamer-hero-copy">
          <span className="gamer-eyebrow">
            <span /> {tr("Gaming.3176301bcb")}</span>
          <h1>
            {tr("Gaming.8f15da15ba")}<em>{tr("Gaming.53d807042f")}</em>
          </h1>
          <p>
            {tr("Gaming.0f3b311974")}</p>
          <div className="gamer-hero-actions">
            <button onClick={() => changeTab("saved")}>
              <Heart size={16} /> {tr("Gaming.08d1ae9569")}<span>{games.length}</span>
            </button>
            <button onClick={() => setPreferences(true)}>
              <Settings2 size={16} /> {tr("Gaming.3f3d1c15be")}</button>
          </div>
        </div>
        <div className="gamer-hero-art" aria-hidden="true">
          <i />
          <i />
          <Gamepad2 strokeWidth={0.85} />
          <span>{tr("Gaming.071cce523a")}</span>
        </div>
      </section>
      <div className="gamer-quick-links">
        <span>{tr("Gaming.5f415a8d73")}</span>
        {[
          { name: "Steam", url: "https://store.steampowered.com/" },
          {
            name: "Epic Games",
            url: "https://store.epicgames.com/es-ES/free-games",
          },
          { name: "GOG", url: "https://www.gog.com/" },
          { name: tr("Gaming.a731a58c4c"), url: "https://www.twitch.tv/" },
          { name: tr("Gaming.053bc65874"), url: "https://discord.com/channels/@me" },
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
        <div className="gamer-tabs" aria-label={tr("Gaming.056db8cad2")}>
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
          aria-label={tr("Gaming.ea4866f02c")}
          onClick={() => setPreferences(true)}
        >
          <Settings2 size={18} />
        </button>
      </div>
      {tab === "installed" ? (
        <Suspense
          fallback={
            <div className="empty-state" role="status">
              {tr("Gaming.f4740a3db8")}</div>
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
                  ? tr("Gaming.3307ff5b5b")
                  : tab === "releases"
                    ? tr("Gaming.996bba849c")
                    : tab === "deals"
                      ? tr("Gaming.9c982f0ee3")
                      : tr("Gaming.86e485d9b2")}
              </span>
              <h2>
                {tab === "giveaways"
                  ? tr("Gaming.ad8d17acd6")
                  : tab === "releases"
                    ? tr("Gaming.f08b46bafa")
                    : tab === "deals"
                      ? tr("Gaming.2c8cfcd4c8")
                      : tr("Gaming.6c7aea43df")}
              </h2>
              <p>
                {tab === "giveaways"
                  ? tr("Gaming.0384f83f53")
                  : tab === "releases"
                    ? tr("Gaming.0fab4c647b")
                    : tab === "deals"
                      ? tr("Gaming.ed26088a27")
                      : tr("Gaming.cd51e451ab")}
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
                <Plus size={16} /> {tr("Gaming.cff3f9a490")}</button>
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
                {loading ? tr("Gaming.75c4bfe48d") : tr("Gaming.fe5f6628c7")}
              </button>
            )}
          </div>
          <div className="gamer-filters">
            <label className="gamer-search">
              <Search size={16} />
              <input
                aria-label={tr("Gaming.42f759fc1a")}
                placeholder={tr("Gaming.378aa05e10")}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(12);
                }}
              />
              {query && (
                <button
                  className="icon-button"
                  aria-label={tr("Gaming.1e32cebcdb")}
                  onClick={() => setQuery("")}
                >
                  <X size={14} />
                </button>
              )}
            </label>
            <select
              aria-label={tr("Gaming.94525bedd1")}
              value={settings.gamingPlatform}
              onChange={(e) => {
                setSettings((s) => ({ ...s, gamingPlatform: e.target.value }));
                setLimit(12);
              }}
            >
              <option value="all">{tr("Gaming.b9878aa1da")}</option>
              {platformOptions.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            {tab === "giveaways" && (
              <select
                aria-label={tr("Gaming.926574ebbd")}
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  setLimit(12);
                }}
              >
                <option value="game">{tr("Gaming.f37b469740")}</option>
                <option value="loot">{tr("Gaming.2a08544b02")}</option>
                <option value="beta">{tr("Gaming.f1530710d5")}</option>
                <option value="all">{tr("Gaming.66d78ef837")}</option>
              </select>
            )}
            {tab === "releases" && (
              <select
                aria-label={tr("Gaming.235ac74c89")}
                value={releaseFilter}
                onChange={(e) => setReleaseFilter(e.target.value)}
              >
                <option value="all">{tr("Gaming.b92c58a457")}</option>
                <option value="upcoming">{tr("Gaming.f44cddb1bb")}</option>
                <option value="recent">{tr("Gaming.137c2f8b46")}</option>
              </select>
            )}
            {tab === "saved" && (
              <select
                aria-label={tr("Gaming.70b7057851")}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">{tr("Gaming.ecda92faab")}</option>
                {Object.entries(gameStatuses).map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
              </select>
            )}
            <select
              aria-label={tr("Gaming.c913c519aa")}
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recommended">
                {tab === "saved"
                  ? tr("Gaming.bbbb3f5ee0")
                  : tr("Gaming.cca6e2b503")}
              </option>
              <option value="title">{tr("Gaming.15d998a2ae")}</option>
              {tab === "giveaways" && (
                <option value="ending">{tr("Gaming.8b8e55c6b5")}</option>
              )}
              {tab === "deals" && <option value="price">{tr("Gaming.64d7a5a9da")}</option>}
              {tab === "releases" && (
                <option value="date">{tr("Gaming.31b614ced2")}</option>
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
                  ? tr("Gaming.c0815c0652")
                  : tr("Gaming.09d5213e89", { v0: feedTime })}
              </span>
              <span>
                {tr("Gaming.afbe242aa0")}{" "}
                <a
                  href={sources[tab].url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {sources[tab].title}
                  <ArrowUpRight size={11} />
                </a>{" "}
                {tr("Gaming.bf7d7f4336")}</span>
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
                  {tr("Gaming.d6f419bdf6")}</span>
              </div>
            )}
          {loading && !feed ? (
            <div className="gamer-loading" role="status">
              <Sparkles size={26} />
              <h3>{tr("Gaming.086e839b52")}</h3>
              <p>
                {tr("Gaming.226934e3d3")}{" "}
                {tab === "saved" ? tr("Gaming.5f3f6b4d93") : sources[tab].title}{tr("Gaming.a39d183bf8")}</p>
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
                  ? tr("Gaming.794c88d1e4")
                  : tr("Gaming.2d16bbff53")}
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
                                ? tr("Gaming.8a2cc0673b")
                                : g.comingSoon
                                  ? tr("Gaming.f44cddb1bb")
                                  : tr("Gaming.1d0471fb0e")
                              : kindNames[g.kind]}
                        </span>
                        <button
                          className={`gamer-save ${saved ? "saved" : ""}`}
                          aria-label={`${saved ? tr("Gaming.20ab386d12") : tr("Gaming.13e51a210f")} ${g.title}`}
                          title={
                            saved
                              ? tr("Gaming.ed1b5976ef")
                              : tr("Gaming.6309e313ab")
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
                            tr("Gaming.001a330b15")}
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
                                    ? tr("Gaming.8dc549b61f")
                                    : tr("Gaming.8a22cbfd7c"))}
                            </span>
                          ) : (
                            <span className={expired ? "gamer-expired" : ""}>
                              <Clock3 size={13} />
                              {expired
                                ? tr("Gaming.1dbb36839f")
                                : g.endDate
                                  ? tr("Gaming.54865e1528", { v0: displayGameDate(g.endDate) })
                                  : tr("Gaming.e909824c87")}
                            </span>
                          )}
                        </div>
                        {tab === "saved" && saved && (
                          <label className="gamer-status-label">
                            {tr("Gaming.98e5acddb6")}<select
                              aria-label={tr("a11y.Gaming.674", { v0: g.title })}
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
                            {launching === g.id ? tr("Gaming.2d5bf11d9a") : tr("Gaming.b61eda6f4b")}
                          </button>
                        )}
                        <div className="gamer-card-bottom">
                          <button onClick={() => setDetail(g)}>
                            {tab === "saved"
                              ? tr("Gaming.fb3af826f5")
                              : tr("Gaming.73389e60ff")}
                            <ChevronRight size={14} />
                          </button>
                          {saved?.status === "claimed" ? (
                            <span className="gamer-claimed">
                              <Check size={13} />
                              {tr("Gaming.2869d2c9d8")}</span>
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
                  {tr("Gaming.c6d977a68a")}<Plus size={15} />
                </button>
              )}
            </>
          ) : (
            <div className="gamer-empty">
              <Gamepad2 size={40} strokeWidth={1} />
              <h3>
                {tab === "saved" && !games.length
                  ? tr("Gaming.283d388fdb")
                  : tr("Gaming.6048037f10")}
              </h3>
              <p>
                {tab === "saved" && !games.length
                  ? tr("Gaming.6d35b04810")
                  : tr("Gaming.46ef15f32a")}
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
                  ? tr("Gaming.781a6c60dc")
                  : tr("Gaming.bfc2d16235")}
              </button>
            </div>
          )}
          <section className="gamer-bottom-panel">
            <div>
              <CalendarDays size={22} />
              <h3>{tr("Gaming.143ebb2496")}</h3>
              <p>{tr("Gaming.77bb30d9ba")}</p>
            </div>
            <div className="gamer-console-links">
              <a
                href="https://www.playstation.com/es-cl/editorial/this-month-on-playstation/"
                target="_blank"
                rel="noopener noreferrer"
              >
                {tr("Gaming.6d7ba99c81")}<ArrowUpRight size={14} />
              </a>
              <a
                href="https://www.xbox.com/es-CL/games/all-games"
                target="_blank"
                rel="noopener noreferrer"
              >
                {tr("Gaming.313deb7d7b")}<ArrowUpRight size={14} />
              </a>
              <a
                href="https://www.nintendo.com/us/store/games/coming-soon/"
                target="_blank"
                rel="noopener noreferrer"
              >
                {tr("Gaming.81ffab4798")}<ArrowUpRight size={14} />
              </a>
            </div>
          </section>
          <p className="gamer-footnote">
            {tr("Gaming.3ddc08030c")}{APP_NAME}.
          </p>
        </>
      )}
      <Dialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.title || tr("Gaming.dec48422ec")}
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
              {detail.demo && <span>{tr("Gaming.8a2cc0673b")}</span>}
            </div>
            <Price game={detail} />
            {giveawayExpired(detail) && (
              <p className="error-message">
                {tr("Gaming.6c6171b025")}</p>
            )}
            {detail.description && (
              <div>
                <h3>{tr("Gaming.47ba145715")}</h3>
                <p>{detail.description}</p>
              </div>
            )}
            {detail.instructions && (
              <div>
                <h3>{tr("Gaming.a7d467cc96")}</h3>
                <p className="gamer-instructions">{detail.instructions}</p>
                <small className="muted">
                  {tr("Gaming.17ba2e074a")}</small>
              </div>
            )}
            {detail.endDate && (
              <p className="muted">
                {tr("Gaming.101b794c1c")}{displayGameDate(detail.endDate)}{tr("Gaming.db08cd5a3d")}</p>
            )}
            {detail.kind === "release" && (
              <p className="muted">
                {detail.releaseDate
                  ? `Fecha: ${displayGameDate(detail.releaseDate)}`
                  : detail.releaseLabel || tr("Gaming.8dc549b61f")}
                {tr("Gaming.d10699bebc")}</p>
            )}
            <div className="gamer-detail-actions">
              {localGameFavorite(detail) && (
                <button
                  className="primary-button"
                  disabled={!!launching}
                  onClick={() => void launchSaved(detail)}
                >
                  <Play size={16} />
                  {launching === detail.id ? tr("Gaming.2d5bf11d9a") : tr("Gaming.ee42856979")}
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
                    ? tr("Gaming.6db0107f9b")
                    : detail.source === "cheapshark"
                      ? tr("Gaming.a90a78d228")
                      : tr("Gaming.6733875d17")}
                  <ArrowUpRight size={16} />
                </a>
              )}
              {!selected && (
                <button
                  className="secondary-button"
                  onClick={() => save(detail)}
                >
                  <Bookmark size={16} /> {tr("Gaming.f4ed64c9ef")}</button>
              )}
              {detail.releaseDate && (
                <button
                  className="secondary-button"
                  onClick={() => exportDate(detail)}
                >
                  <ArrowDownToLine size={15} /> {tr("Gaming.6060262ed5")}</button>
              )}
            </div>
            {selected && (
              <div className="gamer-saved-editor">
                <h3>
                  <CheckCircle2 size={17} /> {tr("Gaming.5cc3498176")}</h3>
                <label>
                  {tr("Gaming.98e5acddb6")}<select
                    aria-label={tr("Gaming.fa0a6b0fca")}
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
                  {tr("Gaming.53699273ec")}<textarea
                    aria-label={tr("Gaming.28c22ef272")}
                    placeholder={tr("Gaming.f2e22e2a8b")}
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
                <span className="muted">{tr("Gaming.86a81e1247")}</span>
                <button
                  className="text-button danger"
                  onClick={() => {
                    remove(selected.id);
                    setDetail(null);
                  }}
                >
                  <Trash2 size={14} /> {tr("Gaming.f4e602ef67")}</button>
              </div>
            )}
          </div>
        )}
      </Dialog>
      <Dialog
        open={preferences}
        onClose={() => setPreferences(false)}
        title={tr("Gaming.3e55b5926b")}
        description={tr("Gaming.9e1cb8de7d")}
      >
        <div className="dialog-body form-stack gamer-preferences">
          <label>
            {tr("Gaming.b9e3fd4d3f")}<select
              value={settings.gamingPlatform}
              onChange={(e) =>
                setSettings((s) => ({ ...s, gamingPlatform: e.target.value }))
              }
            >
              <option value="all">{tr("Gaming.b9878aa1da")}</option>
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
            {tr("Gaming.5bc96bb571")}</label>
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
            {tr("Gaming.e6231c02af")}</label>
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
            {tr("Gaming.67fb02b86f")}</label>
          <p className="muted">
            {tr("Gaming.f5fe37b235")}</p>
          <button
            className="primary-button"
            onClick={() => setPreferences(false)}
          >
            {tr("Gaming.6256597055")}<Gamepad2 size={16} />
          </button>
        </div>
      </Dialog>
      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title={tr("Gaming.88b6e03bd0")}
        description={tr("Gaming.4514687dad")}
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
                tr("Gaming.5d93e6cd7e"),
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
            {tr("Gaming.27839f10af")}<input
              autoFocus
              required
              maxLength={500}
              value={manual.title}
              onChange={(e) =>
                setManual((p) => ({ ...p, title: e.target.value }))
              }
              placeholder={tr("Gaming.2de99b73e0")}
            />
          </label>
          <label>
            {tr("Gaming.5d7325dd00")}<select
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
            {tr("Gaming.c7f66b46c0")}<input
              type="url"
              placeholder={tr("Gaming.ab04e20ed4")}
              value={manual.url}
              onChange={(e) =>
                setManual((p) => ({ ...p, url: e.target.value }))
              }
            />
          </label>
          <label>
            {tr("Gaming.e7a13fabaf")}<input
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
            <Plus size={16} /> {tr("Gaming.b4a652a29c")}</button>
        </form>
      </Dialog>
    </div>
  );
}
