import { SpaceSwitcher } from "./components/SpaceSwitcher";
import { useLocale as useInterfaceLocale } from "./context/Locale.tsx";
import { translateMessage, tr, getFormatLocale } from "./lib/i18n.ts";
import { UpdateNotice } from "./components/UpdateNotice";
import { SyncStatus } from "./components/SyncStatus";
import { PinGate } from "./components/PinSecurity";
import { isRemoteLibrary } from "./lib/remote";
import { RemoteIntegrationsProvider } from "./context/RemoteIntegrationsContext";
import { RemindersRuntime } from "./components/RemindersRuntime";
import { Welcome } from "./components/Welcome";
import { RemindersWidget } from "./components/RemindersWidget";
import { APP_NAME } from "./lib/brand.ts";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  Home,
  CheckSquare,
  CalendarDays,
  StickyNote,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  Link2,
  Maximize2,
  Minimize2,
  Search,
  ArrowUpRight,
  LayoutGrid,
  GripVertical,
  Check,
  X,
  Target,
  Clock3,
  Leaf,
  ChevronRight,
  Menu,
  Plus,
  LibraryBig,
  Gamepad2,
  Newspaper,
} from "lucide-react";
import { DashboardProvider } from "./context/DashboardContext";
import { useDashboard } from "./context/DashboardStore";
import { TimerProvider } from "./context/TimerContext";
import { IntegrationsProvider } from "./context/IntegrationsContext";
import { useIntegrations } from "./context/IntegrationsStore";
import { SearchBar } from "./components/SearchBar";
import { Pomodoro } from "./components/Pomodoro";
import { TaskManager } from "./components/TaskManager";
import { HabitTracker } from "./components/HabitTracker";
import { CalendarWidget } from "./components/CalendarWidget";
import { StickyNotes } from "./components/StickyNotes";
import { QuickCapture } from "./components/QuickCapture";
import { StatsDashboard } from "./components/StatsDashboard";
import { NewsWidget } from "./components/NewsWidget";
import { MusicWidget } from "./components/MusicWidget";
import { GamingWidget } from "./components/GamingWidget";
import { WeatherWidget } from "./components/WeatherWidget";
import { Bookmarks } from "./components/Bookmarks";
const SettingsModal = lazy(() => import("./components/SettingsModal").then(module => ({ default: module.SettingsModal })));
import type { SettingsTab } from "./components/SettingsModal";
import { CommandPalette } from "./components/CommandPalette";
import { localDate, widgetLabels, defaultSettings } from "./lib/dashboard";
import type { WidgetId } from "./lib/dashboard";
import { DesktopTitlebar } from "./components/DesktopTitlebar";
import { SpotifyPlayerProvider } from "./context/SpotifyPlayerContext";
const Library = lazy(() =>
  import("./components/Library").then((module) => ({
    default: module.Library,
  })),
);
const Gaming = lazy(() =>
  import("./components/Gaming").then((module) => ({ default: module.Gaming })),
);
const NewsSection = lazy(() =>
  import("./components/NewsSection").then((module) => ({
    default: module.NewsSection,
  })),
);
type Section =
  | "all"
  | "focus"
  | "calendar"
  | "reading"
  | "notes"
  | "library"
  | "gaming";
const menus = ([
  { id: "all", get label() { return tr("App.dc14c4433b"); }, icon: Home },
  { id: "focus", get label() { return tr("App.a50681a9e6"); }, icon: CheckSquare },
  { id: "calendar", get label() { return tr("App.8216725467"); }, icon: CalendarDays },
  { id: "notes", get label() { return tr("App.e6513ed173"); }, icon: StickyNote },
  { id: "reading", get label() { return tr("App.ef133f9368"); }, icon: Newspaper },
  { id: "library", get label() { return tr("App.dbfb33f5ae"); }, icon: LibraryBig },
  { id: "gaming", get label() { return tr("App.4e407fb48d"); }, icon: Gamepad2 },
] as const);
function Clock() {
  useInterfaceLocale();
  const { settings } = useDashboard();
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="hero-clock">
      <span>
        {time.toLocaleTimeString(getFormatLocale(), {
          hour: "2-digit",
          minute: "2-digit",
          second: settings.showSeconds ? "2-digit" : undefined,
          hour12: !settings.clock24,
        })}
      </span>
      <small>{tr("App.2c112d86fe")}</small>
    </div>
  );
}
function DashboardContent() {
  useInterfaceLocale();
  const {
    settings,
    setSettings,
    tasks,
    habits,
    focusSessions,
    storageWarning,
    toast,
    dismissToast,
  } = useDashboard();
  const integrations = useIntegrations();
  useEffect(() => {
    const openAgenda = () => setSection("calendar");
    window.addEventListener("zenty-open-reminders", openAgenda);
    const removeNative = window.zentyDesktop?.reminders?.onOpen(openAgenda);
    return () => {
      window.removeEventListener("zenty-open-reminders", openAgenda);
      removeNative?.();
    };
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("appearance");
  const [section, setSection] = useState<Section>(() =>
    location.hash === "#library"
      ? "library"
      : location.hash === "#gaming"
        ? "gaming"
        : location.hash === "#reading" || location.hash === "#noticias"
          ? "reading"
          : "all",
  );
  useEffect(() => {
    const hash =
      section === "library" || section === "gaming" || section === "reading"
        ? `#${section}`
        : "";
    if (hash && location.hash !== hash)
      history.replaceState(
        null,
        "",
        location.pathname + location.search + hash,
      );
    else if (
      !hash &&
      ["#library", "#gaming", "#reading", "#noticias"].includes(location.hash)
    )
      history.replaceState(null, "", location.pathname + location.search);
  }, [section]);
  useEffect(() => {
    if (
      section !== "all" &&
      settings.enabledNavSections &&
      settings.enabledNavSections[section] === false
    ) {
      setSection("all");
    }
  }, [section, settings.enabledNavSections]);
  const navOrder = settings.navOrder || defaultSettings.navOrder;
  const enabledNav =
    settings.enabledNavSections || defaultSettings.enabledNavSections;
  const activeMenus = navOrder
    .filter((id) => enabledNav[id] !== false)
    .map((id) => menus.find((m) => m.id === id))
    .filter((m): m is (typeof menus)[number] => Boolean(m));
  const [sidebar, setSidebar] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [intentionExpanded, setIntentionExpanded] = useState(false);
  const [command, setCommand] = useState(false);
  const [dragged, setDragged] = useState<WidgetId | null>(null);
  const [dropColumn, setDropColumn] = useState<number | null>(null);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);
  const openSettings = (tab: SettingsTab = "appearance") => {
    setSettingsTab(tab);
    setSettingsOpen(true);
    setMobileNav(false);
  };
  useEffect(() => {
    const open = () => openSettings("updates");
    window.addEventListener("zenty-open-updates",open);
    return () => window.removeEventListener("zenty-open-updates",open);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!document.querySelector("dialog[open]") || command)
          setCommand((c) => !c);
      }
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) {
        setImmersive(false);
        setOrganizing(false);
        setMobileNav(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [command]);
  const today = localDate(now);
  const minutes = focusSessions.find((s) => s.date === today)?.minutes || 0;
  const pending = tasks.filter((t) => !t.completed).length;
  const doneHabits = habits.filter((h) => h.history.includes(today)).length;
  const greeting =
    now.getHours() < 12
      ? tr("App.21aebc4838")
      : now.getHours() < 19
        ? tr("App.ce3891f924")
        : tr("App.559690aadc");
  const drop = (column: number, before?: WidgetId) => {
    if (!dragged || dragged === before) {
      setDragged(null);
      setDropColumn(null);
      return;
    }
    setSettings((s) => {
      const layout = s.columnLayout.map((col) =>
        col.filter((id) => id !== dragged),
      );
      const index = before ? layout[column].indexOf(before) : -1;
      layout[column].splice(
        index < 0 ? layout[column].length : index,
        0,
        dragged,
      );
      return { ...s, columnLayout: layout };
    });
    setDragged(null);
    setDropColumn(null);
  };
  const renderWidget = (id: WidgetId) => {
    switch (id) {
      case "reminders":
        return <RemindersWidget />;
      case "tasks":
        return <TaskManager />;
      case "pomodoro":
        return <Pomodoro />;
      case "habits":
        return <HabitTracker />;
      case "calendar":
        return (
          <CalendarWidget onConnect={() => openSettings("integrations")} />
        );
      case "notes":
        return <StickyNotes />;
      case "ideas":
        return <QuickCapture />;
      case "stats":
        return <StatsDashboard />;
      case "news":
        return <NewsWidget onOpen={() => setSection("reading")} />;
      case "music":
        return <MusicWidget onConnect={() => openSettings("integrations")} />;
      case "weather":
        return <WeatherWidget />;
      case "gaming":
        return <GamingWidget onOpen={() => setSection("gaming")} />;
    }
  };
  const sectionWidgets: Record<Section, WidgetId[]> = {
    all: [],
    focus: ["tasks", "pomodoro", "habits", "stats"],
    calendar: ["calendar", "reminders"],
    notes: ["notes", "ideas"],
    reading: [],
    library: [],
    gaming: [],
  };
  const enabledCount = Object.values(settings.enabledWidgets).filter(
    Boolean,
  ).length;
  return (
    <div
      className={`app-shell ${settings.homeLayout === "compact" ? "home-compact" : ""} ${!sidebar ? "sidebar-collapsed" : ""} ${immersive ? "is-immersive" : ""}`}
    >
      <a href="#main-content" className="skip-link">
        {tr("App.bb2b678a30")}</a>
      {!immersive && (
        <>
          <button
            className="mobile-menu icon-button"
            aria-label={tr("App.3b1e8affeb")}
            onClick={() => setMobileNav(true)}
          >
            <Menu size={20} />
          </button>
          {mobileNav && (
            <button
              className="mobile-overlay"
              aria-label={tr("App.288e388668")}
              onClick={() => setMobileNav(false)}
            />
          )}
          <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
            <a
              className="brand"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setSection("all");
              }}
              aria-label={tr("App.be9b636770", { v0: APP_NAME })}
            >
              <span className="brand-mark">
                <img src="/favicon.svg" width={34} height={34} alt="" />
              </span>
              <span className="brand-word">
                {APP_NAME}
                <span>{tr("App.94d8b49e68")}</span>
              </span>
            </a>
            <div className="sidebar-main">
              <div className="sidebar-caption-row">
                <span className="nav-caption">{tr("App.639874ce61")}</span>
                <button
                  className="sidebar-edit-nav-btn"
                  onClick={() => openSettings("navigation")}
                  title={tr("App.b04fcaf533")}
                  aria-label={tr("App.b04fcaf533")}
                >
                  <SlidersHorizontal size={13} />
                </button>
              </div>
              <nav aria-label={tr("App.781509b25a")}>
                {activeMenus.map((menu) => (
                  <button
                    className={section === menu.id ? "active" : ""}
                    key={menu.id}
                    title={menu.label}
                    aria-current={section === menu.id ? "page" : undefined}
                    onClick={() => {
                      setSection(menu.id);
                      setMobileNav(false);
                      setOrganizing(false);
                    }}
                  >
                    <menu.icon size={18} />
                    <span>{menu.label}</span>
                    {menu.id === "focus" && pending > 0 && (
                      <small>{pending}</small>
                    )}
                  </button>
                ))}
              </nav>
              <div className="sidebar-divider" />
              <span className="nav-caption">{tr("App.14aa5aa9c5")}</span>
              <nav aria-label={tr("App.9c3e3e77e4")}>
                <button
                  onClick={() => openSettings("integrations")}
                  title={tr("App.b91b4b93c2")}
                >
                  <Link2 size={18} />
                  <span>{tr("App.fb1924a4dd")}</span>
                  {(integrations.spotifyConnected ||
                    integrations.googleConnected) && (
                    <i className="connection-dot" />
                  )}
                </button>
                <button
                  onClick={() => openSettings("appearance")}
                  title={tr("App.af283098bc")}
                >
                  <SlidersHorizontal size={18} />
                  <span>{tr("App.af283098bc")}</span>
                </button>
              </nav>
              {settings.showSidebarFocus && (
                <div className="sidebar-focus">
                  <span className="sidebar-focus-icon">
                    <Leaf size={22} strokeWidth={1.3} />
                  </span>
                  <h3>
                    {tr("App.b9ab3ef2dd")}<br />
                    {tr("App.6db4b1e25b")}</h3>
                  <p>{tr("App.1a78865177")}</p>
                  <button onClick={() => setImmersive(true)}>
                    {tr("App.a7023f62b1")}<ArrowUpRight size={15} />
                  </button>
                </div>
              )}
            </div>
            <div className="sidebar-bottom">
              <button className="profile-button" onClick={() => openSettings()}>
                <span className="avatar">
                  {settings.userName.slice(0, 1).toUpperCase() || tr("App.bbeebd879e")}
                </span>
                <span>
                  {settings.userName || tr("App.dc14c4433b")}
                  <small>{tr("App.fc20b62ada")}</small>
                </span>
                <SlidersHorizontal size={15} />
              </button>
              <button
                className="collapse-button"
                aria-label={
                  sidebar ? tr("App.ccf8703da7") : tr("App.15a5b31808")
                }
                onClick={() => setSidebar(!sidebar)}
              >
                {sidebar ? (
                  <PanelLeftClose size={16} />
                ) : (
                  <PanelLeftOpen size={16} />
                )}
                <span>{tr("App.a218d3c995")}</span>
              </button>
            </div>
          </aside>
        </>
      )}
      <div className="main-shell">
        {!immersive && (
          <header className="topbar">
            <div className="breadcrumbs">
              <Home size={14} />
              <ChevronRight size={12} />
              <span>{menus.find((m) => m.id === section)?.label}</span>
            </div>
            <div className="topbar-actions">
              <span className="private-label">
                <span className="connection-dot" />
                {tr("App.ad96093bce")}</span>
              <button
                className="icon-button"
                aria-label={tr("App.259173aa99")}
                onClick={() => setCommand(true)}
              >
                <Search size={17} />
              </button>
              <SpaceSwitcher /><SyncStatus /><UpdateNotice />
              <span className="topbar-divider" />
              <button
                className="customize-button"
                onClick={() => openSettings()}
              >
                <SlidersHorizontal size={14} /> {tr("App.9dd0ebfc85")}</button>
            </div>
          </header>
        )}
        <main id="main-content" className="main-content">
          {storageWarning && (
            <div className="storage-warning" role="alert">
              {translateMessage(storageWarning)}
              <button
                className="text-button"
                onClick={() => openSettings("data")}
              >
                {tr("App.a8e91b7dd2")}</button>
            </div>
          )}
          {immersive ? (
            <div className="immersive-content">
              <div className="immersive-top">
                <span className="brand">
                  <img src="/favicon.svg" width={28} height={28} alt="" /> {APP_NAME}
                </span>
                <button
                  className="secondary-button"
                  onClick={() => setImmersive(false)}
                >
                  <Minimize2 size={16} /> {tr("App.1d2f1cc2c8")}<kbd>{tr("App.52f878edb3")}</kbd>
                </button>
              </div>
              <span className="eyebrow">{tr("App.722578f6a7")}</span>
              <h1>{tr("App.3ec6138788")}</h1>
              {settings.dailyIntention && <p>{settings.dailyIntention}</p>}
              <Pomodoro />
              <small>{tr("App.250f58adce")}</small>
            </div>
          ) : (
            <>
              {section === "gaming" ? (
            <Suspense
              fallback={
                <div className="empty-state" role="status">
                  {tr("App.33cf5274b7")}</div>
              }
            >
              <Gaming />
            </Suspense>
          ) : section === "library" ? (
            <Suspense
              fallback={
                <div className="empty-state" role="status">
                  {tr("App.c854bfa4e7")}</div>
              }
            >
              <Library />
            </Suspense>
          ) : section === "reading" ? (
            <Suspense
              fallback={
                <div className="empty-state" role="status">
                  {tr("App.65f6c59a9c")}</div>
              }
            >
              <NewsSection />
            </Suspense>
          ) : (
            <>
              {section === "all" && (
                <>
                  <div className="home-intro">
                    <section className="welcome-hero">
                      <div className="hero-copy">
                        <p className="eyebrow hero-date">
                          {now.toLocaleDateString(getFormatLocale(), {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })}
                        </p>
                        <h1>
                          {greeting},{" "}
                          <button
                            title={tr("App.76ca033128")}
                            onClick={() => openSettings()}
                          >
                            {settings.userName || tr("App.01f11df122")}
                            <span>.</span>
                          </button>
                        </h1>
                        <p>
                          {tr("App.712ae2bc42")}</p>
                        <span className="hero-note">
                          <span /> {tr("App.ef5cf73fcd")}</span>
                      </div>
                      {settings.showClock && <Clock />}
                      <img
                        className="hero-landscape"
                        src="/landscape.svg"
                        alt=""
                      />
                    </section>
                    <SearchBar
                      onCommand={() => setCommand(true)}
                      compact={settings.homeLayout === "compact"}
                    />
                  </div>
                  {settings.showBookmarks && (
                    <Bookmarks compact={settings.homeLayout === "compact"} />
                  )}
                  {(settings.homeLayout !== "compact" || intentionExpanded) && (
                    <section className="intention-bar">
                      <span className="intention-icon">
                        <Target size={19} />
                      </span>
                      <label htmlFor="daily-intention">
                        {tr("App.306c18ca6d")}</label>
                      <input
                        id="daily-intention"
                        maxLength={200}
                        value={settings.dailyIntention}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            dailyIntention: e.target.value,
                            intentionDate: today,
                          }))
                        }
                        placeholder={tr("App.7c3348ee36")}
                      />
                      <span className="intention-end">
                        {tr("App.19a9a6c9ee")}</span>
                    </section>
                  )}
                  <div className="home-status-row">
                    {settings.showSummary && (
                      <div className="day-summary">
                        <span>
                          <CheckSquare size={14} />
                          <strong>{pending}</strong>{" "}
                          {pending === 1
                            ? tr("App.6b254a6890")
                            : tr("App.8dd5693439")}
                        </span>
                        <i />
                        <span>
                          <Clock3 size={14} />
                          <strong>{minutes}</strong> {tr("App.b65ba2fe07")}</span>
                        <i />
                        <span>
                          <Leaf size={14} />
                          <strong>
                            {doneHabits}/{habits.length}
                          </strong>{" "}
                          {tr("App.fa08e3a4b7")}</span>
                        <div className="daily-progress">
                          <span>{tr("App.cb8dadf90d")}</span>
                          <div
                            role="progressbar"
                            aria-label={tr("App.5cbc6f8080")}
                            aria-valuenow={minutes}
                            aria-valuemin={0}
                            aria-valuemax={Math.max(
                              minutes,
                              settings.dailyGoal,
                            )}
                          >
                            <i
                              style={{
                                width: `${Math.min(100, (minutes / settings.dailyGoal) * 100)}%`,
                              }}
                            />
                          </div>
                          <small>
                            {Math.round((minutes / settings.dailyGoal) * 100)}%
                          </small>
                        </div>
                      </div>
                    )}
                    {settings.homeLayout === "compact" && (
                      <button
                        className="text-button intention-toggle"
                        aria-expanded={intentionExpanded}
                        onClick={() => setIntentionExpanded((value) => !value)}
                      >
                        <Target size={15} />{" "}
                        {intentionExpanded
                          ? tr("App.9b83eadedd")
                          : settings.dailyIntention
                            ? tr("App.a171af409c")
                            : tr("App.42d9de589e")}
                      </button>
                    )}
                  </div>
                </>
              )}
              <div className="section-heading dashboard-heading">
                <h2>
                  {section === "all"
                    ? tr("App.01108dd596")
                    : menus.find((m) => m.id === section)?.label}
                  <span>
                    {section === "all"
                      ? tr("App.689326c5a3")
                      : tr("App.22780b1668")}
                  </span>
                </h2>
                <div className="section-heading-actions">
                  <button
                    className="text-button"
                    onClick={() => setImmersive(true)}
                  >
                    <Maximize2 size={14} /> {tr("App.96203bb570")}</button>
                  {section === "all" && (
                    <button
                      className={`organize-button ${organizing ? "selected" : ""}`}
                      aria-pressed={organizing}
                      onClick={() => setOrganizing(!organizing)}
                    >
                      {organizing ? (
                        <Check size={14} />
                      ) : (
                        <LayoutGrid size={14} />
                      )}
                      {organizing ? tr("App.cfcc6ad6ed") : tr("App.40dd592aa3")}
                    </button>
                  )}
                </div>
              </div>
              {organizing && (
                <div className="organize-banner">
                  <GripVertical size={16} />
                  <span>
                    {tr("App.e6eb381704")}</span>
                  <button
                    className="text-button"
                    onClick={() => openSettings("widgets")}
                  >
                    {tr("App.e3a61e3928")}<ArrowUpRight size={14} />
                  </button>
                </div>
              )}
              {section === "all" ? (
                <div className="dashboard-grid">
                  {settings.columnLayout.map((column, colIndex) => (
                    <div
                      key={colIndex}
                      className={`widget-column ${organizing ? "organizing" : ""} ${dropColumn === colIndex ? "drop-target" : ""}`}
                      onDragOver={(e) => {
                        if (dragged) {
                          e.preventDefault();
                          setDropColumn(colIndex);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        drop(colIndex);
                      }}
                    >
                      {column
                        .filter((id) => settings.enabledWidgets[id])
                        .map((id) => (
                          <div
                            className={`widget-wrapper ${dragged === id ? "is-dragged" : ""}`}
                            key={id}
                            onDragOver={(e) => {
                              if (dragged) e.preventDefault();
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              drop(colIndex, id);
                            }}
                          >
                            {organizing && (
                              <div className="widget-edit-bar">
                                <button
                                  className="drag-handle"
                                  draggable
                                  aria-label={tr("a11y.App.734", { v0: widgetLabels[id] })}
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData("text/plain", id);
                                    e.dataTransfer.effectAllowed = "move";
                                    setDragged(id);
                                  }}
                                  onDragEnd={() => {
                                    setDragged(null);
                                    setDropColumn(null);
                                  }}
                                >
                                  <GripVertical size={16} />
                                  <span>{widgetLabels[id]}</span>
                                </button>
                                <button
                                  className="icon-button"
                                  aria-label={tr("App.033a5996b4", { v0: widgetLabels[id] })}
                                  onClick={() =>
                                    setSettings((s) => ({
                                      ...s,
                                      enabledWidgets: {
                                        ...s.enabledWidgets,
                                        [id]: false,
                                      },
                                    }))
                                  }
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            )}
                            {renderWidget(id)}
                          </div>
                        ))}
                      {organizing && (
                        <button
                          className="add-widget-slot"
                          onClick={() => openSettings("widgets")}
                        >
                          <Plus size={17} /> {tr("App.10c7bc38de")}</button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`section-grid section-${section}`}>
                  {sectionWidgets[section].map((id) => (
                    <div key={id}>{renderWidget(id)}</div>
                  ))}
                </div>
              )}
              {section === "all" && enabledCount === 0 && (
                <div className="empty-dashboard">
                  <LayoutGrid size={32} />
                  <h3>{tr("App.172bda3738")}</h3>
                  <p>
                    {tr("App.887ab76502")}</p>
                  <button
                    className="primary-button"
                    onClick={() => openSettings("widgets")}
                  >
                    {tr("App.0a557885bf")}</button>
                </div>
              )}
            </>
          )}
          <footer className="footer">
            <span>
              {tr("App.b4bce70e20")}{" "}
              <span className="footer-heart" role="img" aria-label={tr("App.0048a973df")}>
                ♥️
              </span>{" "}
              {tr("App.2c2f624cea")}<strong>{tr("App.1b35f07309")}</strong>
            </span>
            <span>
              {APP_NAME} {tr("App.9903489623")}{" "}
              <button onClick={() => openSettings("data")}>
                {tr("App.bb9d1c72f0")}</button>
            </span>
          </footer>
        </>
      )}
        </main>
      </div>
      {settingsOpen && <Suspense fallback={null}><SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab={settingsTab}
      /></Suspense>}
      <CommandPalette
        open={command}
        onClose={() => setCommand(false)}
        onSettings={() => openSettings()}
        onFocus={() => setImmersive(true)}
        onSection={setSection}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{translateMessage(toast.message)}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo?.();
                dismissToast();
              }}
            >
              {tr("App.29fa864fd7")}</button>
          )}
          <button
            className="icon-button"
            aria-label={tr("App.a49387ee3e")}
            onClick={dismissToast}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
export default function App() {
  useInterfaceLocale();
  const Connections = isRemoteLibrary ? RemoteIntegrationsProvider : IntegrationsProvider;
  return (
    <><DesktopTitlebar /><PinGate><DashboardProvider>
      <TimerProvider>
        <Connections>
          <SpotifyPlayerProvider>
            <RemindersRuntime />
            <DashboardContent />
            <Welcome />
          </SpotifyPlayerProvider>
        </Connections>
      </TimerProvider>
    </DashboardProvider></PinGate></>
  );
}
