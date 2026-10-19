import { UpdateNotice } from "./components/UpdateNotice";
import { isRemoteLibrary } from "./lib/remote";
import { RemoteIntegrationsProvider } from "./context/RemoteIntegrationsContext";
import { RemindersRuntime } from "./components/RemindersRuntime";
import { Welcome } from "./components/Welcome";
import { RemindersWidget } from "./components/RemindersWidget";
import { APP_NAME } from "./lib/brand.ts";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  Asterisk,
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
import { SettingsModal } from "./components/SettingsModal";
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
const menus = [
  { id: "all", label: "Mi espacio", icon: Home },
  { id: "focus", label: "Enfoque y tareas", icon: CheckSquare },
  { id: "calendar", label: "Mi agenda", icon: CalendarDays },
  { id: "notes", label: "Notas e ideas", icon: StickyNote },
  { id: "reading", label: "Noticias", icon: Newspaper },
  { id: "library", label: "Mi biblioteca", icon: LibraryBig },
  { id: "gaming", label: "Rincón gamer", icon: Gamepad2 },
] as const;
function Clock() {
  const { settings } = useDashboard();
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="hero-clock">
      <span>
        {time.toLocaleTimeString("es-CL", {
          hour: "2-digit",
          minute: "2-digit",
          second: settings.showSeconds ? "2-digit" : undefined,
          hour12: !settings.clock24,
        })}
      </span>
      <small>Un buen momento para empezar.</small>
    </div>
  );
}
function DashboardContent() {
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
      ? "Buenos días"
      : now.getHours() < 19
        ? "Buenas tardes"
        : "Buenas noches";
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
        Ir al contenido
      </a>
      {!immersive && (
        <>
          <button
            className="mobile-menu icon-button"
            aria-label="Abrir navegación"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={20} />
          </button>
          {mobileNav && (
            <button
              className="mobile-overlay"
              aria-label="Cerrar navegación"
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
              aria-label={`${APP_NAME}, ir al inicio`}
            >
              <span className="brand-mark">
                <Asterisk size={30} strokeWidth={1.7} />
              </span>
              <span className="brand-word">
                {APP_NAME}
                <span>UN ESPACIO MUY TUYO</span>
              </span>
            </a>
            <div className="sidebar-main">
              <div className="sidebar-caption-row">
                <span className="nav-caption">TU DÍA, A TU MANERA</span>
                <button
                  className="sidebar-edit-nav-btn"
                  onClick={() => openSettings("navigation")}
                  title="Personalizar barra de navegación"
                  aria-label="Personalizar barra de navegación"
                >
                  <SlidersHorizontal size={13} />
                </button>
              </div>
              <nav aria-label="Navegación principal">
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
              <span className="nav-caption">HAZLO TUYO</span>
              <nav aria-label="Personalización">
                <button
                  onClick={() => openSettings("integrations")}
                  title="Conexiones"
                >
                  <Link2 size={18} />
                  <span>Mis conexiones</span>
                  {(integrations.spotifyConnected ||
                    integrations.googleConnected) && (
                    <i className="connection-dot" />
                  )}
                </button>
                <button
                  onClick={() => openSettings("appearance")}
                  title="Personalizar"
                >
                  <SlidersHorizontal size={18} />
                  <span>Personalizar</span>
                </button>
              </nav>
              {settings.showSidebarFocus && (
                <div className="sidebar-focus">
                  <span className="sidebar-focus-icon">
                    <Leaf size={22} strokeWidth={1.3} />
                  </span>
                  <h3>
                    Menos ruido.
                    <br />
                    Más tú.
                  </h3>
                  <p>Regálate un momento para lo que importa.</p>
                  <button onClick={() => setImmersive(true)}>
                    Entrar en enfoque <ArrowUpRight size={15} />
                  </button>
                </div>
              )}
            </div>
            <div className="sidebar-bottom">
              <button className="profile-button" onClick={() => openSettings()}>
                <span className="avatar">
                  {settings.userName.slice(0, 1).toUpperCase() || "Z"}
                </span>
                <span>
                  {settings.userName || "Mi espacio"}
                  <small>Mi rincón personal</small>
                </span>
                <SlidersHorizontal size={15} />
              </button>
              <button
                className="collapse-button"
                aria-label={
                  sidebar ? "Contraer navegación" : "Expandir navegación"
                }
                onClick={() => setSidebar(!sidebar)}
              >
                {sidebar ? (
                  <PanelLeftClose size={16} />
                ) : (
                  <PanelLeftOpen size={16} />
                )}
                <span>Un poco más de espacio</span>
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
                Tu espacio personal
              </span>
              <button
                className="icon-button"
                aria-label="Buscar en mi espacio"
                onClick={() => setCommand(true)}
              >
                <Search size={17} />
              </button>
              <UpdateNotice />
              <span className="topbar-divider" />
              <button
                className="customize-button"
                onClick={() => openSettings()}
              >
                <SlidersHorizontal size={14} /> Personalizar
              </button>
            </div>
          </header>
        )}
        <main id="main-content" className="main-content">
          {storageWarning && (
            <div className="storage-warning" role="alert">
              {storageWarning}
              <button
                className="text-button"
                onClick={() => openSettings("data")}
              >
                Recuperar mis datos
              </button>
            </div>
          )}
          {immersive ? (
            <div className="immersive-content">
              <div className="immersive-top">
                <span className="brand">
                  <Asterisk size={28} /> {APP_NAME}
                </span>
                <button
                  className="secondary-button"
                  onClick={() => setImmersive(false)}
                >
                  <Minimize2 size={16} /> Volver a mi espacio <kbd>Esc</kbd>
                </button>
              </div>
              <span className="eyebrow">ESTE MOMENTO ES PARA TI</span>
              <h1>Una cosa a la vez.</h1>
              {settings.dailyIntention && <p>{settings.dailyIntention}</p>}
              <Pomodoro />
              <small>El temporizador continúa aunque cambies de vista.</small>
            </div>
          ) : (
            <>
              {section === "gaming" ? (
            <Suspense
              fallback={
                <div className="empty-state" role="status">
                  Preparando tu rincón gamer…
                </div>
              }
            >
              <Gaming />
            </Suspense>
          ) : section === "library" ? (
            <Suspense
              fallback={
                <div className="empty-state" role="status">
                  Preparando tu biblioteca…
                </div>
              }
            >
              <Library />
            </Suspense>
          ) : section === "reading" ? (
            <Suspense
              fallback={
                <div className="empty-state" role="status">
                  Preparando tu quiosco de noticias…
                </div>
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
                          {now.toLocaleDateString("es-CL", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })}
                        </p>
                        <h1>
                          {greeting},{" "}
                          <button
                            title="Cambiar mi nombre"
                            onClick={() => openSettings()}
                          >
                            {settings.userName || "bienvenido"}
                            <span>.</span>
                          </button>
                        </h1>
                        <p>
                          Todo lo que necesitas. Un lugar que se siente tuyo.
                        </p>
                        <span className="hero-note">
                          <span /> Hoy también puedes empezar de nuevo.
                        </span>
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
                        Mi intención de hoy
                      </label>
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
                        placeholder="¿Qué haría que hoy fuera un buen día?"
                      />
                      <span className="intention-end">
                        Un pequeño paso es suficiente.
                      </span>
                    </section>
                  )}
                  <div className="home-status-row">
                    {settings.showSummary && (
                      <div className="day-summary">
                        <span>
                          <CheckSquare size={14} />
                          <strong>{pending}</strong>{" "}
                          {pending === 1
                            ? "tarea pendiente"
                            : "tareas pendientes"}
                        </span>
                        <i />
                        <span>
                          <Clock3 size={14} />
                          <strong>{minutes}</strong> min de enfoque
                        </span>
                        <i />
                        <span>
                          <Leaf size={14} />
                          <strong>
                            {doneHabits}/{habits.length}
                          </strong>{" "}
                          hábitos de hoy
                        </span>
                        <div className="daily-progress">
                          <span>Tu ritmo de hoy</span>
                          <div
                            role="progressbar"
                            aria-label="Meta diaria de enfoque"
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
                          ? "Cerrar intención"
                          : settings.dailyIntention
                            ? "Mi intención"
                            : "Añadir intención"}
                      </button>
                    )}
                  </div>
                </>
              )}
              <div className="section-heading dashboard-heading">
                <h2>
                  {section === "all"
                    ? "Hecho para tu día"
                    : menus.find((m) => m.id === section)?.label}
                  <span>
                    {section === "all"
                      ? "Lo importante, en su lugar."
                      : "Un poco de claridad para lo que viene."}
                  </span>
                </h2>
                <div className="section-heading-actions">
                  <button
                    className="text-button"
                    onClick={() => setImmersive(true)}
                  >
                    <Maximize2 size={14} /> Modo enfoque
                  </button>
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
                      {organizing ? "Terminar" : "Organizar"}
                    </button>
                  )}
                </div>
              </div>
              {organizing && (
                <div className="organize-banner">
                  <GripVertical size={16} />
                  <span>
                    Arrastra desde el asa para cambiar de lugar. También puedes
                    moverlos en los ajustes.
                  </span>
                  <button
                    className="text-button"
                    onClick={() => openSettings("widgets")}
                  >
                    Ajustar widgets <ArrowUpRight size={14} />
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
                                  aria-label={`Arrastrar ${widgetLabels[id]}`}
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
                                  aria-label={`Ocultar ${widgetLabels[id]}`}
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
                          <Plus size={17} /> Añadir un widget
                        </button>
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
                  <h3>Un lienzo para tu día.</h3>
                  <p>
                    Elige qué quieres tener a mano. Puedes empezar con algo
                    pequeño.
                  </p>
                  <button
                    className="primary-button"
                    onClick={() => openSettings("widgets")}
                  >
                    Elegir mis widgets
                  </button>
                </div>
              )}
            </>
          )}
          <footer className="footer">
            <span>
              Hecho con{" "}
              <span className="footer-heart" role="img" aria-label="amor">
                ♥️
              </span>{" "}
              por <strong>YiyehDev</strong>
            </span>
            <span>
              {APP_NAME} · Tu espacio, a tu manera{" "}
              <button onClick={() => openSettings("data")}>
                Datos locales
              </button>
            </span>
          </footer>
        </>
      )}
        </main>
      </div>
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab={settingsTab}
      />
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
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo?.();
                dismissToast();
              }}
            >
              Deshacer
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Cerrar aviso"
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
  const Connections = isRemoteLibrary ? RemoteIntegrationsProvider : IntegrationsProvider;
  return (
    <DashboardProvider>
      <TimerProvider>
        <Connections>
          <SpotifyPlayerProvider>
            <RemindersRuntime />
            <DesktopTitlebar />
            <DashboardContent />
            <Welcome />
          </SpotifyPlayerProvider>
        </Connections>
      </TimerProvider>
    </DashboardProvider>
  );
}
