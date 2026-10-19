import { UpdateSettings } from "./UpdateSettings";
import { LanSettings } from "./LanSettings";
import { APP_NAME, APP_SLUG } from "../lib/brand.ts";
import { useEffect, useState } from "react";
import {
  Palette,
  LayoutGrid,
  Link2,
  Database,
  Moon,
  Sun,
  Monitor,
  Check,
  Download,
  Upload,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  SlidersHorizontal,
  Home,
  CheckSquare,
  CalendarDays,
  StickyNote,
  Newspaper,
  LibraryBig,
  Gamepad2,
  Menu,
} from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
import {
  defaultSettings,
  localDate,
  widgetLabels,
  sectionLabels,
  parseBackup,
} from "../lib/dashboard";
import type { DashboardSettings, WidgetId, SectionId } from "../lib/dashboard";
import { Dialog } from "./Dialog";
import { IntegrationsPanel } from "./IntegrationsPanel";
export type SettingsTab =
  | "appearance"
  | "navigation"
  | "widgets"
  | "integrations"
  | "data"
  | "updates";
const accents = [
  { name: "Carbón", value: "#4a4b55" },
  { name: "Índigo", value: "#5c62a9" },
  { name: "Cobre", value: "#a9753f" },
  { name: "Bosque", value: "#39745b" },
  { name: "Lavanda", value: "#8260ac" },
  { name: "Océano", value: "#377e9a" },
  { name: "Terracota", value: "#b55f47" },
  { name: "Rosa", value: "#b44f7b" },
  { name: "Grafito", value: "#586573" },
];
const sectionDescriptions: Record<SectionId, string> = {
  all: "Panel principal con reloj, tu intención diaria y los widgets habilitados.",
  focus:
    "Gestión de tareas, sesiones de enfoque Pomodoro, hábitos y estadísticas.",
  calendar: "Agenda diaria, bloques de tiempo y conexión con Google Calendar.",
  notes: "Bloc de notas adhesivas e ideas rápidas.",
  reading: "Quiosco de noticias por temas/fuentes y lecturas guardadas.",
  library:
    "Tu biblioteca con libros EPUB/PDF, documentos y mangas de MangaDex.",
  gaming: "Radar gamer con juegos gratis, ofertas destacadas y lanzamientos.",
};
const sectionIcons: Record<SectionId, typeof Home> = {
  all: Home,
  focus: CheckSquare,
  calendar: CalendarDays,
  notes: StickyNote,
  reading: Newspaper,
  library: LibraryBig,
  gaming: Gamepad2,
};
export function SettingsModal({
  isOpen,
  onClose,
  initialTab = "appearance",
}: {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}) {
  const { settings, setSettings, exportData, importData, notify } =
    useDashboard();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const [exportingSave, setExportingSave] = useState(false);
  const [savePath, setSavePath] = useState("");
  const [startup, setStartup] = useState<{ supported: boolean; enabled: boolean } | null>(null);
  const [startupBusy, setStartupBusy] = useState(false);
  useEffect(() => {
    if (!isOpen || !window.zentyDesktop?.startup) return;
    let active = true;
    void window.zentyDesktop.startup.get().then((value) => { if (active) setStartup(value); }).catch(() => { if (active) setError("No se pudo consultar el inicio con Windows."); });
    return () => { active = false; };
  }, [isOpen]);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setPendingImport(null);
      setError("");
    }
  }, [isOpen, initialTab]);
  const update = <K extends keyof DashboardSettings>(
    key: K,
    value: DashboardSettings[K],
  ) => setSettings((s) => ({ ...s, [key]: value }));
  const download = (content: string, name: string) => {
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const move = (id: WidgetId, destination: number, offset?: number) =>
    setSettings((s) => {
      const layout = s.columnLayout.map((col) => [...col]);
      const source = layout.findIndex((col) => col.includes(id));
      const index = layout[source].indexOf(id);
      layout[source].splice(index, 1);
      const position =
        offset === undefined
          ? layout[destination].length
          : Math.max(0, Math.min(layout[destination].length, index + offset));
      layout[destination].splice(position, 0, id);
      return { ...s, columnLayout: layout };
    });
  const moveNav = (id: SectionId, offset: number) => {
    const order = [...settings.navOrder];
    const index = order.indexOf(id);
    if (index === -1) return;
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= order.length) return;
    const [moved] = order.splice(index, 1);
    order.splice(targetIndex, 0, moved);
    update("navOrder", order);
  };
  const toggleNavSection = (id: SectionId, enabled: boolean) => {
    const currentEnabled = Object.entries(settings.enabledNavSections).filter(
      ([k, v]) => v && k !== id,
    );
    if (!enabled && currentEnabled.length === 0) {
      notify("Debes mantener al menos una sección visible.");
      return;
    }
    update("enabledNavSections", {
      ...settings.enabledNavSections,
      [id]: enabled,
    });
  };
  const tabs = [
    { id: "appearance", label: "Tu estilo", icon: Palette },
    { id: "navigation", label: "Barra lateral", icon: Menu },
    { id: "widgets", label: "Widgets", icon: LayoutGrid },
    { id: "integrations", label: "Conexiones", icon: Link2 },
    { id: "data", label: "Tus datos", icon: Database },
    ...(window.zentyDesktop ? [{ id: "updates" as const, label: "Actualizaciones", icon: Download }] : []),
  ] as const;
  const stageImport = async (value: string) => {
    try {
      parseBackup(value);
      setPendingImport(value);
      setError("");
    } catch {
      setError(
        `El archivo no es un respaldo válido de ${APP_NAME}. Revisa su estructura y que no supere 5 MB. Tus datos no se han modificado.`,
      );
    }
  };
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Un espacio muy tuyo"
      description="Los pequeños detalles hacen la diferencia."
      wide
    >
      <div className="settings-tabs" role="tablist" aria-label="Ajustes">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="settings-panel"
            onClick={() => setTab(t.id)}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>
      <div
        className="dialog-body settings-body"
        id="settings-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
      >
        {tab === "updates" && <div className="form-stack"><UpdateSettings /></div>}
        {tab === "appearance" && (
          <div className="form-stack">
            <div className="settings-section-title">
              <span className="eyebrow">EMPIEZA POR TI</span>
              <h3>Bienvenido a casa.</h3>
            </div>
            <label>
              Cómo te llamamos
              <input
                maxLength={40}
                value={settings.userName}
                onChange={(e) => update("userName", e.target.value)}
                placeholder="Tu nombre"
              />
            </label>
            <fieldset>
              <legend>Apariencia</legend>
              <div className="theme-options">
                {[
                  { id: "light", label: "Luz de día", icon: Sun },
                  { id: "dark", label: "Al anochecer", icon: Moon },
                  { id: "system", label: "Con tu sistema", icon: Monitor },
                ].map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    aria-pressed={settings.theme === t.id}
                    onClick={() =>
                      update("theme", t.id as DashboardSettings["theme"])
                    }
                  >
                    <t.icon size={22} />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Paleta de toda la página</legend>
              <div className="surface-palette-options">
                {(
                  [
                    {
                      id: "stone",
                      name: "Neutra",
                      background: "#efeeeb",
                      accent: "#586573",
                    },
                    {
                      id: "sand",
                      name: "Arena",
                      background: "#f0e7d8",
                      accent: "#9a744e",
                    },
                    {
                      id: "blue",
                      name: "Azul",
                      background: "#e4edf6",
                      accent: "#4e75a0",
                    },
                    {
                      id: "lavender",
                      name: "Lavanda",
                      background: "#ece6f4",
                      accent: "#8260ac",
                    },
                    {
                      id: "rose",
                      name: "Rosa",
                      background: "#f5e7eb",
                      accent: "#aa647b",
                    },
                    {
                      id: "sage",
                      name: "Verde",
                      background: "#e5eddf",
                      accent: "#39745b",
                    },
                    {
                      id: "graphite",
                      name: "Grafito",
                      background: "#e5e7eb",
                      accent: "#4a4b55",
                    },
                  ] as const
                ).map((palette) => (
                  <button
                    key={palette.id}
                    type="button"
                    aria-label={`Paleta ${palette.name}`}
                    aria-pressed={settings.surfaceTone === palette.id}
                    onClick={() =>
                      setSettings((s) => ({
                        ...s,
                        surfaceTone: palette.id,
                        accentColor: palette.accent,
                      }))
                    }
                  >
                    <span
                      className="surface-palette-preview"
                      style={{ background: palette.background }}
                    >
                      <i style={{ background: palette.accent }} />
                      <i style={{ background: palette.accent }} />
                      <span />
                      {settings.surfaceTone === palette.id && (
                        <Check size={13} style={{ color: palette.accent }} />
                      )}
                    </span>
                    <span>{palette.name}</span>
                  </button>
                ))}
              </div>
              <p className="palette-hint">
                Cambia fondos, paneles y ambiente. Después puedes combinarla con
                cualquier color de acento.
              </p>
            </fieldset>
            <fieldset>
              <legend>Color de acento</legend>
              <div className="accent-options">
                {accents.map((c) => (
                  <button
                    key={c.value}
                    className="accent-swatch"
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                    aria-label={`Color ${c.name}`}
                    aria-pressed={settings.accentColor === c.value}
                    onClick={() => update("accentColor", c.value)}
                  >
                    {settings.accentColor === c.value && <Check size={18} />}
                  </button>
                ))}
                <label className="custom-color" title="Elegir cualquier color">
                  <Palette size={19} />
                  <input
                    type="color"
                    aria-label="Color de acento personalizado"
                    value={settings.accentColor}
                    onChange={(e) => update("accentColor", e.target.value)}
                  />
                </label>
              </div>
            </fieldset>
            <div className="form-row">
              <label>
                Ambiente
                <select
                  value={settings.background}
                  onChange={(e) =>
                    update(
                      "background",
                      e.target.value as DashboardSettings["background"],
                    )
                  }
                >
                  <option value="linen">Lino · cálido y natural</option>
                  <option value="aurora">Aurora · un toque de color</option>
                  <option value="plain">Esencial · sin distracciones</option>
                </select>
              </label>
              <label>
                Cabecera del inicio
                <select
                  value={settings.homeLayout}
                  onChange={(e) =>
                    update(
                      "homeLayout",
                      e.target.value as DashboardSettings["homeLayout"],
                    )
                  }
                >
                  <option value="compact">
                    Compacta · más contenido a mano
                  </option>
                  <option value="scenic">
                    Panorámica · saludo e ilustración
                  </option>
                </select>
              </label>
              <label>
                Densidad
                <select
                  value={settings.density}
                  onChange={(e) =>
                    update(
                      "density",
                      e.target.value as DashboardSettings["density"],
                    )
                  }
                >
                  <option value="comfortable">Con espacio para respirar</option>
                  <option value="compact">Todo más compacto</option>
                </select>
              </label>
            </div>
            {window.zentyDesktop?.platform === "win32" && <fieldset>
              <legend>Aplicación de escritorio</legend>
              <label className="switch-row">
                <span>Iniciar {APP_NAME} con Windows</span>
                <input type="checkbox" role="switch" checked={startup?.enabled ?? false}
                  disabled={!startup?.supported || startupBusy}
                  onChange={async (event) => {
                    const enabled = event.target.checked;
                    setStartupBusy(true); setError("");
                    try { setStartup(await window.zentyDesktop!.startup.set(enabled)); }
                    catch (error) { setError((error as Error).message); }
                    finally { setStartupBusy(false); }
                  }} />
              </label>
              <p className="muted">Desactivado por defecto. Se aplica a este usuario de Windows. {startup && !startup.supported ? "Disponible en la versión compilada." : "Mantén la carpeta de la aplicación en su ubicación para que Windows pueda abrirla."}</p>
              {error && <p role="alert" className="error-message">{error}</p>}
            </fieldset>}
            <LanSettings />
            <fieldset>
              <legend>Reloj y navegación</legend>
              <div className="settings-switches">
                {(
                  [
                    { key: "showClock", label: "Mostrar reloj" },
                    { key: "clock24", label: "Formato de 24 horas" },
                    { key: "showSeconds", label: "Mostrar segundos" },
                    {
                      key: "openInNewTab",
                      label: "Abrir enlaces en otra pestaña",
                    },
                    { key: "showBookmarks", label: "Mostrar accesos rápidos" },
                    { key: "showSummary", label: "Mostrar resumen del día" },
                  ] as const
                ).map((t) => (
                  <label className="switch-row" key={t.key}>
                    <span>{t.label}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={settings[t.key]}
                      onChange={(e) => update(t.key, e.target.checked)}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              Buscador predeterminado
              <select
                value={settings.searchEngine}
                onChange={(e) => update("searchEngine", e.target.value)}
              >
                <option value="google">Google</option>
                <option value="duckduckgo">DuckDuckGo</option>
                <option value="bing">Bing</option>
                <option value="brave">Brave</option>
              </select>
            </label>
            <div className="settings-section-title">
              <SlidersHorizontal size={18} />
              <h3>Tu ritmo de enfoque</h3>
            </div>
            <div className="form-row">
              {(
                [
                  { key: "workMinutes", label: "Enfoque (min)" },
                  { key: "shortBreak", label: "Pausa corta (min)" },
                  { key: "longBreak", label: "Pausa larga (min)" },
                ] as const
              ).map((f) => (
                <label key={f.key}>
                  {f.label}
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={settings[f.key]}
                    onChange={(e) =>
                      update(
                        f.key,
                        Math.max(1, Math.min(180, Number(e.target.value) || 1)),
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <label>
              Meta diaria de enfoque (minutos)
              <input
                type="number"
                min={1}
                max={720}
                value={settings.dailyGoal}
                onChange={(e) =>
                  update(
                    "dailyGoal",
                    Math.max(1, Math.min(720, Number(e.target.value) || 1)),
                  )
                }
              />
            </label>
            <small>
              Los cambios de duración se aplican a sesiones nuevas. La sesión en
              curso conserva su duración.
            </small>
          </div>
        )}
        {tab === "navigation" && (
          <div className="form-stack">
            <div className="settings-section-title">
              <span className="eyebrow">TU DÍA, A TU MANERA</span>
              <h3>Personaliza la barra lateral</h3>
              <p>
                Elige qué secciones quieres ver en tu menú y en qué orden
                aparecen. Puedes ocultar las que no uses y reordenarlas según tu
                flujo de trabajo.
              </p>
            </div>

            <fieldset className="widget-settings-column">
              <legend>Secciones del menú</legend>
              <div className="nav-settings-list">
                {settings.navOrder.map((id, index) => {
                  const Icon = sectionIcons[id] || Home;
                  const isVisible = settings.enabledNavSections[id];
                  const isHome = id === "all";

                  return (
                    <div
                      className={`widget-setting nav-setting-item ${!isVisible ? "is-hidden" : ""}`}
                      key={id}
                    >
                      <label className="nav-setting-label">
                        <input
                          type="checkbox"
                          checked={isVisible}
                          disabled={
                            isHome &&
                            Object.values(settings.enabledNavSections).filter(
                              Boolean,
                            ).length <= 1
                          }
                          onChange={(e) =>
                            toggleNavSection(id, e.target.checked)
                          }
                        />
                        <span className="nav-setting-icon">
                          <Icon size={16} />
                        </span>
                        <div className="nav-setting-text">
                          <strong>
                            {sectionLabels[id]}
                            {isHome && (
                              <small className="nav-home-badge">Inicio</small>
                            )}
                          </strong>
                          <small>{sectionDescriptions[id]}</small>
                        </div>
                      </label>

                      <div className="nav-setting-actions">
                        <button
                          className="icon-button"
                          aria-label={`Subir ${sectionLabels[id]}`}
                          title="Subir sección"
                          disabled={index === 0}
                          onClick={() => moveNav(id, -1)}
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Bajar ${sectionLabels[id]}`}
                          title="Bajar sección"
                          disabled={index === settings.navOrder.length - 1}
                          onClick={() => moveNav(id, 1)}
                        >
                          <ArrowDown size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend>Elementos opcionales de la barra lateral</legend>
              <div className="settings-switches">
                <label className="switch-row">
                  <span>
                    Mostrar tarjeta de bienvenida y enfoque («Menos ruido. Más
                    tú.»)
                    <small
                      style={{
                        display: "block",
                        color: "var(--muted)",
                        fontSize: "11px",
                      }}
                    >
                      Tarjeta decorativa con acceso al modo enfoque en la parte
                      inferior.
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={settings.showSidebarFocus}
                    onChange={(e) =>
                      update("showSidebarFocus", e.target.checked)
                    }
                  />
                </label>
              </div>
            </fieldset>

            <button
              className="text-button"
              onClick={() => {
                update("navOrder", [...defaultSettings.navOrder]);
                update("enabledNavSections", {
                  ...defaultSettings.enabledNavSections,
                });
                update("showSidebarFocus", false);
                notify("Barra lateral restablecida a valores originales.");
              }}
            >
              <RotateCcw size={15} /> Restaurar menú original
            </button>
          </div>
        )}
        {tab === "widgets" && (
          <div className="form-stack">
            <div className="settings-section-title">
              <span className="eyebrow">SOLO LO QUE NECESITAS</span>
              <h3>Diseña tu día a tu manera.</h3>
              <p>
                Activa tus widgets y elige su columna y orden. También puedes
                arrastrarlos desde «Organizar» en el inicio.
              </p>
            </div>
            <div className="preset-options">
              {["Equilibrado", "Esencial", "Productivo"].map(
                (preset, index) => (
                  <button
                    className="secondary-button"
                    key={preset}
                    onClick={() => {
                      const enabled =
                        index === 0
                          ? [
                              "tasks",
                              "pomodoro",
                              "calendar",
                              "habits",
                              "music",
                              "notes",
                            ]
                          : index === 1
                            ? ["tasks", "pomodoro", "music"]
                            : [
                                "tasks",
                                "pomodoro",
                                "calendar",
                                "habits",
                                "stats",
                                "ideas",
                              ];
                      setSettings((s) => ({
                        ...s,
                        columnLayout: structuredClone(
                          defaultSettings.columnLayout,
                        ),
                        enabledWidgets: Object.fromEntries(
                          Object.keys(widgetLabels).map((key) => [
                            key,
                            enabled.includes(key),
                          ]),
                        ) as DashboardSettings["enabledWidgets"],
                      }));
                      notify(`Distribución ${preset.toLowerCase()} aplicada.`);
                    }}
                  >
                    {preset}
                  </button>
                ),
              )}
            </div>
            {settings.columnLayout.map((column, index) => (
              <fieldset className="widget-settings-column" key={index}>
                <legend>Columna {index + 1}</legend>
                {column.map((id, position) => (
                  <div className="widget-setting" key={id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={settings.enabledWidgets[id]}
                        onChange={(e) =>
                          update("enabledWidgets", {
                            ...settings.enabledWidgets,
                            [id]: e.target.checked,
                          })
                        }
                      />
                      <span>{widgetLabels[id]}</span>
                    </label>
                    <select
                      aria-label={`Columna de ${widgetLabels[id]}`}
                      value={index}
                      onChange={(e) => move(id, Number(e.target.value))}
                    >
                      {[0, 1, 2].map((n) => (
                        <option key={n} value={n}>
                          Columna {n + 1}
                        </option>
                      ))}
                    </select>
                    <button
                      className="icon-button"
                      aria-label={`Subir ${widgetLabels[id]}`}
                      disabled={position === 0}
                      onClick={() => move(id, index, -1)}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Bajar ${widgetLabels[id]}`}
                      disabled={position === column.length - 1}
                      onClick={() => move(id, index, 1)}
                    >
                      <ArrowDown size={15} />
                    </button>
                  </div>
                ))}
              </fieldset>
            ))}
            <button
              className="text-button"
              onClick={() =>
                update(
                  "columnLayout",
                  structuredClone(defaultSettings.columnLayout),
                )
              }
            >
              <RotateCcw size={15} /> Restaurar orden original
            </button>
          </div>
        )}
        {tab === "integrations" && <IntegrationsPanel />}
        {tab === "data" && (
          <div className="form-stack">
            <div className="settings-section-title">
              <span className="eyebrow">SIEMPRE BAJO TU CONTROL</span>
              <h3>Tu espacio te pertenece.</h3>
              <p>
                {window.zentyDesktop
                  ? `Tu save está en %APPDATA%\\${APP_NAME}. El respaldo completo incluye documentos, progreso de lectura, ajustes, alarmas, datos gamer e imágenes descargadas.`
                  : "Los ajustes se guardan en este navegador y los documentos en el servidor local. La exportación completa está disponible en la app de escritorio."}
                {" "}Las cuentas conectadas no sincronizan tu espacio. Las sesiones de acceso y los juegos o ROMs externos no se incluyen en el respaldo.
              </p>
            </div>
            {window.zentyDesktop && <>
              <button className="primary-button" disabled={exportingSave} onClick={async () => {
                setExportingSave(true); setError("");
                try {
                  const result = await window.zentyDesktop!.exportSave(exportData());
                  if (result) { setSavePath(result.path); notify(`Respaldo completo guardado: ${result.files} archivos.`); }
                } catch (error) { setError((error as Error).message); }
                finally { setExportingSave(false); }
              }}><Download size={17} /> {exportingSave ? "Preparando respaldo…" : "Exportar save completo en carpeta"}</button>
              <button className="secondary-button" onClick={() => void window.zentyDesktop!.openDataFolder()}>Abrir carpeta de mi save</button>
              {savePath && <p role="status" style={{ overflowWrap: "anywhere" }}>Respaldo guardado en {savePath}. Incluye instrucciones de restauración y un manifiesto para verificar los archivos.</p>}
            </>}
            <p>El JSON ligero contiene tareas, notas, hábitos, agenda, alarmas y ajustes. No contiene documentos ni archivos de la biblioteca gamer.</p>
            <button
              className="secondary-button"
              onClick={() =>
                download(
                  exportData(),
                  `${APP_SLUG}-respaldo-${localDate()}.json`,
                )
              }
            >
              <Download size={17} /> Exportar datos y ajustes (JSON)
            </button>
            <label className="file-upload">
              <Upload size={20} />
              <span>Seleccionar un respaldo JSON</span>
              <input
                type="file"
                accept=".json,application/json"
                aria-label="Seleccionar respaldo"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 5_000_000) {
                    setError("El archivo supera el máximo de 5 MB.");
                    return;
                  }
                  try {
                    await stageImport(await file.text());
                  } catch {
                    setError("No se pudo leer el archivo.");
                  }
                  e.target.value = "";
                }}
              />
            </label>
            <details>
              <summary>Pegar el contenido de un respaldo</summary>
              <div className="form-stack">
                <textarea
                  aria-label="Contenido del respaldo JSON"
                  rows={5}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder='{"version":2, …}'
                />
                <button
                  className="secondary-button"
                  disabled={!raw.trim()}
                  onClick={() => void stageImport(raw)}
                >
                  Revisar respaldo
                </button>
              </div>
            </details>
            {pendingImport && (
              <div className="import-confirmation">
                <h4>Respaldo válido, listo para restaurar</h4>
                <p>
                  Reemplazará tus tareas, hábitos, notas, accesos, juegoteca y
                  ajustes actuales. Se guardará una copia de recuperación de tu
                  espacio anterior.
                </p>
                <div className="form-row">
                  <button
                    className="secondary-button"
                    onClick={() => setPendingImport(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => {
                      if (importData(pendingImport)) {
                        setPendingImport(null);
                        setRaw("");
                        setError("");
                      } else
                        setError(
                          "No se pudo restaurar el respaldo ni crear la copia de recuperación. Exporta tus datos actuales antes de reintentar.",
                        );
                    }}
                  >
                    Restaurar este respaldo
                  </button>
                </div>
              </div>
            )}
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <button
              className="text-button"
              onClick={() => {
                try {
                  const previous = localStorage.getItem("mia_before_import");
                  if (!previous) {
                    notify(
                      "Todavía no hay una copia anterior a una importación.",
                    );
                    return;
                  }
                  void stageImport(previous);
                } catch {
                  setError("No se pudo leer la copia de recuperación.");
                }
              }}
            >
              <RotateCcw size={15} /> Recuperar el espacio anterior a la última
              importación
            </button>
            <details>
              <summary>Recuperar datos que el navegador no pudo leer</summary>
              <p>
                Descarga los datos originales para revisarlos sin
                sobrescribirlos.
              </p>
              <button
                className="secondary-button"
                onClick={() => {
                  try {
                    const originals = Object.fromEntries(
                      Object.keys(localStorage)
                        .filter(
                          (k) =>
                            k.startsWith("dash_") || k === "mia_dashboard_v2",
                        )
                        .map((k) => [k, localStorage.getItem(k)]),
                    );
                    download(
                      JSON.stringify(originals, null, 2),
                      `${APP_SLUG}-recuperacion-original.json`,
                    );
                  } catch {
                    setError("El navegador no permite leer el almacenamiento.");
                  }
                }}
              >
                Descargar datos originales
              </button>
            </details>
          </div>
        )}
      </div>
      <div className="settings-footer">
        <span>
          <Check size={13} /> Los ajustes se aplican al instante
        </span>
        <button className="primary-button" onClick={onClose}>
          Listo, volver a mi espacio
        </button>
      </div>
    </Dialog>
  );
}
