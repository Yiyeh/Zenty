import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { translateMessage, tr } from "../lib/i18n.ts";
import { UpdateSettings } from "./UpdateSettings";
import { PinSettings } from "./PinSecurity";
import { BackupSettings } from "./BackupSettings";
import { LanguageSelector } from "./LanguageSelector";
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
  ShieldCheck,
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
  | "updates"
  | "security";
const accents = ([
  { get name() { return tr("SettingsModal.f74bdc8e4d"); }, value: "#4a4b55" },
  { get name() { return tr("SettingsModal.46a5f1fafb"); }, value: "#5c62a9" },
  { get name() { return tr("SettingsModal.037fe5fbe2"); }, value: "#a9753f" },
  { get name() { return tr("SettingsModal.bdaddc3866"); }, value: "#39745b" },
  { get name() { return tr("SettingsModal.075e17b12b"); }, value: "#8260ac" },
  { get name() { return tr("SettingsModal.48d8285e64"); }, value: "#377e9a" },
  { get name() { return tr("SettingsModal.3d9f88d5b7"); }, value: "#b55f47" },
  { get name() { return tr("SettingsModal.75f9577a16"); }, value: "#b44f7b" },
  { get name() { return tr("SettingsModal.d18e4bf645"); }, value: "#586573" },
]);
const sectionDescriptions: Record<SectionId, string> = {
  get all() { return tr("SettingsModal.1d60d63c9b"); },
  get focus() { return tr("SettingsModal.7774c86357"); },
  get calendar() { return tr("SettingsModal.a454d28219"); },
  get notes() { return tr("SettingsModal.3faa56724a"); },
  get reading() { return tr("SettingsModal.ed594bebfd"); },
  get library() { return tr("SettingsModal.af12e470f3"); },
  get gaming() { return tr("SettingsModal.1adddb299a"); },
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
  useInterfaceLocale();
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
    void window.zentyDesktop.startup.get().then((value) => { if (active) setStartup(value); }).catch(() => { if (active) setError(tr("SettingsModal.3e2fd44595")); });
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
      notify(tr("SettingsModal.caf6a34c77"));
      return;
    }
    update("enabledNavSections", {
      ...settings.enabledNavSections,
      [id]: enabled,
    });
  };
  const tabs = [
    { id: "appearance", label: tr("SettingsModal.d15c3a78d6"), icon: Palette },
    { id: "navigation", label: tr("SettingsModal.991b8edb36"), icon: Menu },
    { id: "widgets", label: tr("SettingsModal.1fda79ffb6"), icon: LayoutGrid },
    { id: "integrations", label: tr("SettingsModal.b91b4b93c2"), icon: Link2 },
    { id: "data", label: tr("SettingsModal.2009220147"), icon: Database },
    ...(window.zentyDesktop ? [{ id: "security" as const, label: tr("security.tab"), icon: ShieldCheck }, { id: "updates" as const, label: tr("SettingsModal.f165314f21"), icon: Download }] : []),
  ] as const;
  const stageImport = async (value: string) => {
    try {
      parseBackup(value);
      setPendingImport(value);
      setError("");
    } catch {
      setError(
        tr("SettingsModal.8fda4c6950", { v0: APP_NAME }),
      );
    }
  };
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title={tr("SettingsModal.0b94491c48")}
      description={tr("SettingsModal.a376e24563")}
      wide
    >
      <div className="settings-tabs" role="tablist" aria-label={tr("SettingsModal.4f2debbbf4")}>
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
        {tab === "security" && <div className="form-stack"><PinSettings /></div>}
        {tab === "updates" && <div className="form-stack"><UpdateSettings /></div>}
        {tab === "appearance" && (
          <div className="form-stack">
            <LanguageSelector onChange={language => update("language", language)} />
            <p className="muted">{tr("spaces.deviceHint")}</p>
            <div className="settings-section-title">
              <span className="eyebrow">{tr("SettingsModal.77e3f84b31")}</span>
              <h3>{tr("SettingsModal.13717416e0")}</h3>
            </div>
            <label>
              {tr("SettingsModal.bb286bdcfb")}<input
                maxLength={40}
                value={settings.userName}
                onChange={(e) => update("userName", e.target.value)}
                placeholder={tr("SettingsModal.d36ae2c1bf")}
              />
            </label>
            <fieldset>
              <legend>{tr("SettingsModal.e3e9cbacca")}</legend>
              <div className="theme-options">
                {[
                  { id: "light", label: tr("SettingsModal.28a26bbee2"), icon: Sun },
                  { id: "dark", label: tr("SettingsModal.1f51d50289"), icon: Moon },
                  { id: "system", label: tr("SettingsModal.29c9f2a016"), icon: Monitor },
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
              <legend>{tr("SettingsModal.fc12137797")}</legend>
              <div className="surface-palette-options">
                {(
                  [
                    {
                      id: "stone",
                      name: tr("SettingsModal.1d60e649ed"),
                      background: "#efeeeb",
                      accent: "#586573",
                    },
                    {
                      id: "sand",
                      name: tr("SettingsModal.77d7cd9907"),
                      background: "#f0e7d8",
                      accent: "#9a744e",
                    },
                    {
                      id: "blue",
                      name: tr("SettingsModal.b0bf526b23"),
                      background: "#e4edf6",
                      accent: "#4e75a0",
                    },
                    {
                      id: "lavender",
                      name: tr("SettingsModal.075e17b12b"),
                      background: "#ece6f4",
                      accent: "#8260ac",
                    },
                    {
                      id: "rose",
                      name: tr("SettingsModal.75f9577a16"),
                      background: "#f5e7eb",
                      accent: "#aa647b",
                    },
                    {
                      id: "sage",
                      name: tr("SettingsModal.40598e1cb1"),
                      background: "#e5eddf",
                      accent: "#39745b",
                    },
                    {
                      id: "graphite",
                      name: tr("SettingsModal.d18e4bf645"),
                      background: "#e5e7eb",
                      accent: "#4a4b55",
                    },
                  ] as const
                ).map((palette) => (
                  <button
                    key={palette.id}
                    type="button"
                    aria-label={tr("a11y.SettingsModal.304", { v0: palette.name })}
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
                {tr("SettingsModal.1ccdfdcf5f")}</p>
            </fieldset>
            <fieldset>
              <legend>{tr("SettingsModal.c86ed6cd55")}</legend>
              <div className="accent-options">
                {accents.map((c) => (
                  <button
                    key={c.value}
                    className="accent-swatch"
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                    aria-label={tr("a11y.SettingsModal.341", { v0: c.name })}
                    aria-pressed={settings.accentColor === c.value}
                    onClick={() => update("accentColor", c.value)}
                  >
                    {settings.accentColor === c.value && <Check size={18} />}
                  </button>
                ))}
                <label className="custom-color" title={tr("SettingsModal.92e4934013")}>
                  <Palette size={19} />
                  <input
                    type="color"
                    aria-label={tr("SettingsModal.c7a1dfdffd")}
                    value={settings.accentColor}
                    onChange={(e) => update("accentColor", e.target.value)}
                  />
                </label>
              </div>
            </fieldset>
            <div className="form-row">
              <label>
                {tr("SettingsModal.0d2b7ca656")}<select
                  value={settings.background}
                  onChange={(e) =>
                    update(
                      "background",
                      e.target.value as DashboardSettings["background"],
                    )
                  }
                >
                  <option value="linen">{tr("SettingsModal.b193a7aabb")}</option>
                  <option value="aurora">{tr("SettingsModal.5c9b6895c0")}</option>
                  <option value="plain">{tr("SettingsModal.49bbddd4db")}</option>
                </select>
              </label>
              <label>
                {tr("SettingsModal.46b8240f70")}<select
                  value={settings.homeLayout}
                  onChange={(e) =>
                    update(
                      "homeLayout",
                      e.target.value as DashboardSettings["homeLayout"],
                    )
                  }
                >
                  <option value="compact">
                    {tr("SettingsModal.ef1268b2d1")}</option>
                  <option value="scenic">
                    {tr("SettingsModal.f04f796f3b")}</option>
                </select>
              </label>
              <label>
                {tr("SettingsModal.0d7d7140dd")}<select
                  value={settings.density}
                  onChange={(e) =>
                    update(
                      "density",
                      e.target.value as DashboardSettings["density"],
                    )
                  }
                >
                  <option value="comfortable">{tr("SettingsModal.3e9a311d71")}</option>
                  <option value="compact">{tr("SettingsModal.93e0cfe19c")}</option>
                </select>
              </label>
            </div>
            {window.zentyDesktop?.platform === "win32" && <fieldset>
              <legend>{tr("SettingsModal.d4d8fa3dfd")}</legend>
              <label className="switch-row">
                <span>{tr("SettingsModal.078a3737dc")}{APP_NAME} {tr("SettingsModal.d82bf3961f")}</span>
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
              <p className="muted">{tr("SettingsModal.b44ee05c60")}{startup && !startup.supported ? tr("SettingsModal.6086812108") : tr("SettingsModal.9b5798f3cb")}</p>
              {error && <p role="alert" className="error-message">{translateMessage(error)}</p>}
            </fieldset>}
            <LanSettings />
            <fieldset>
              <legend>{tr("SettingsModal.6490a4edf4")}</legend>
              <div className="settings-switches">
                {(
                  [
                    { key: "showClock", label: tr("SettingsModal.d9f887036f") },
                    { key: "clock24", label: tr("SettingsModal.cf5e22a3be") },
                    { key: "showSeconds", label: tr("SettingsModal.d81e48715b") },
                    {
                      key: "openInNewTab",
                      label: tr("SettingsModal.6aa0827e87"),
                    },
                    { key: "showBookmarks", label: tr("SettingsModal.4fd5d12370") },
                    { key: "showSummary", label: tr("SettingsModal.b3bed9d15b") },
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
              {tr("SettingsModal.962fe49fd2")}<select
                value={settings.searchEngine}
                onChange={(e) => update("searchEngine", e.target.value)}
              >
                <option value="google">{tr("SettingsModal.ce770667e5")}</option>
                <option value="duckduckgo">{tr("SettingsModal.1f571f93ab")}</option>
                <option value="bing">{tr("SettingsModal.7bd52326e6")}</option>
                <option value="brave">{tr("SettingsModal.e7d91391c1")}</option>
              </select>
            </label>
            <div className="settings-section-title">
              <SlidersHorizontal size={18} />
              <h3>{tr("SettingsModal.21075d1c9f")}</h3>
            </div>
            <div className="form-row">
              {(
                [
                  { key: "workMinutes", label: tr("SettingsModal.b1729e16e1") },
                  { key: "shortBreak", label: tr("SettingsModal.c7b3bff709") },
                  { key: "longBreak", label: tr("SettingsModal.8e11138ec3") },
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
              {tr("SettingsModal.dd21eed169")}<input
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
              {tr("SettingsModal.499543ecca")}</small>
          </div>
        )}
        {tab === "navigation" && (
          <div className="form-stack">
            <div className="settings-section-title">
              <span className="eyebrow">{tr("SettingsModal.639874ce61")}</span>
              <h3>{tr("SettingsModal.b7c706ccde")}</h3>
              <p>
                {tr("SettingsModal.7cc13d00e2")}</p>
            </div>

            <fieldset className="widget-settings-column">
              <legend>{tr("SettingsModal.26b86ff753")}</legend>
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
                              <small className="nav-home-badge">{tr("SettingsModal.58fcc9468f")}</small>
                            )}
                          </strong>
                          <small>{sectionDescriptions[id]}</small>
                        </div>
                      </label>

                      <div className="nav-setting-actions">
                        <button
                          className="icon-button"
                          aria-label={tr("a11y.SettingsModal.563", { v0: sectionLabels[id] })}
                          title={tr("SettingsModal.02c6aafbe2")}
                          disabled={index === 0}
                          onClick={() => moveNav(id, -1)}
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={tr("a11y.SettingsModal.572", { v0: sectionLabels[id] })}
                          title={tr("SettingsModal.d84c67821b")}
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
              <legend>{tr("SettingsModal.bfbb81de40")}</legend>
              <div className="settings-switches">
                <label className="switch-row">
                  <span>
                    {tr("SettingsModal.141a64d68a")}<small
                      style={{
                        display: "block",
                        color: "var(--muted)",
                        fontSize: "11px",
                      }}
                    >
                      {tr("SettingsModal.b9857b61de")}</small>
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
                notify(tr("SettingsModal.004d2a7258"));
              }}
            >
              <RotateCcw size={15} /> {tr("SettingsModal.2cf52b3dcf")}</button>
          </div>
        )}
        {tab === "widgets" && (
          <div className="form-stack">
            <div className="settings-section-title">
              <span className="eyebrow">{tr("SettingsModal.812daf2a02")}</span>
              <h3>{tr("SettingsModal.bb5dde8fd8")}</h3>
              <p>
                {tr("SettingsModal.2ba5e61d17")}</p>
            </div>
            <div className="preset-options">
              {[tr("SettingsModal.9123685a0d"), tr("SettingsModal.2a380a4d32"), tr("SettingsModal.4ff9f654f3")].map(
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
                      notify(tr("SettingsModal.410ac5ca0e", { v0: preset.toLowerCase() }));
                    }}
                  >
                    {preset}
                  </button>
                ),
              )}
            </div>
            {settings.columnLayout.map((column, index) => (
              <fieldset className="widget-settings-column" key={index}>
                <legend>{tr("SettingsModal.f5f33f6aa2")}{index + 1}</legend>
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
                      aria-label={tr("a11y.SettingsModal.700", { v0: widgetLabels[id] })}
                      value={index}
                      onChange={(e) => move(id, Number(e.target.value))}
                    >
                      {[0, 1, 2].map((n) => (
                        <option key={n} value={n}>
                          {tr("SettingsModal.f5f33f6aa2")}{n + 1}
                        </option>
                      ))}
                    </select>
                    <button
                      className="icon-button"
                      aria-label={tr("a11y.SettingsModal.712", { v0: widgetLabels[id] })}
                      disabled={position === 0}
                      onClick={() => move(id, index, -1)}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={tr("a11y.SettingsModal.720", { v0: widgetLabels[id] })}
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
              <RotateCcw size={15} /> {tr("SettingsModal.f5522edf7c")}</button>
          </div>
        )}
        {tab === "integrations" && <IntegrationsPanel />}
        {tab === "data" && (
          <div className="form-stack">
            <BackupSettings />
            <div className="settings-section-title">
              <span className="eyebrow">{tr("SettingsModal.7d22bff842")}</span>
              <h3>{tr("SettingsModal.d814e8cd06")}</h3>
              <p>
                {window.zentyDesktop
                  ? tr("SettingsModal.b7710d75bd", { v0: APP_NAME })
                  : tr("SettingsModal.ab0668b799")}
                {" "}{tr("SettingsModal.addbdbf64e")}</p>
            </div>
            {window.zentyDesktop && <>
              <button className="primary-button" disabled={exportingSave} onClick={async () => {
                setExportingSave(true); setError("");
                try {
                  const result = await window.zentyDesktop!.exportSave(exportData());
                  if (result) { setSavePath(result.path); notify(tr("interface.SettingsModal.e89fdaea47", { v0: result.files })); }
                } catch (error) { setError((error as Error).message); }
                finally { setExportingSave(false); }
              }}><Download size={17} /> {exportingSave ? tr("SettingsModal.fc244c1744") : tr("SettingsModal.08952f6dbe")}</button>
              <button className="secondary-button" onClick={() => void window.zentyDesktop!.openDataFolder()}>{tr("SettingsModal.bbb4a8a716")}</button>
              {savePath && <p role="status" style={{ overflowWrap: "anywhere" }}>{tr("SettingsModal.b20da20de3")}{savePath}{tr("SettingsModal.85d6154215")}</p>}
            </>}
            <p>{tr("SettingsModal.78941ce8e2")}</p>
            <button
              className="secondary-button"
              onClick={() =>
                download(
                  exportData(),
                  `${APP_SLUG}-respaldo-${localDate()}.json`,
                )
              }
            >
              <Download size={17} /> {tr("SettingsModal.f421904ce4")}</button>
            <label className="file-upload">
              <Upload size={20} />
              <span>{tr("SettingsModal.e385174bf7")}</span>
              <input
                type="file"
                accept=".json,application/json"
                aria-label={tr("SettingsModal.af64d0cf35")}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 5_000_000) {
                    setError(tr("SettingsModal.b42a062344"));
                    return;
                  }
                  try {
                    await stageImport(await file.text());
                  } catch {
                    setError(tr("SettingsModal.7a566c98ff"));
                  }
                  e.target.value = "";
                }}
              />
            </label>
            <details>
              <summary>{tr("SettingsModal.78e7f0ccbc")}</summary>
              <div className="form-stack">
                <textarea
                  aria-label={tr("SettingsModal.c7c2e80912")}
                  rows={5}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder={tr("SettingsModal.a488c1d6a4")}
                />
                <button
                  className="secondary-button"
                  disabled={!raw.trim()}
                  onClick={() => void stageImport(raw)}
                >
                  {tr("SettingsModal.82e10c987a")}</button>
              </div>
            </details>
            {pendingImport && (
              <div className="import-confirmation">
                <h4>{tr("SettingsModal.77dc7ca50a")}</h4>
                <p>
                  {tr("SettingsModal.0e3406ba73")}</p>
                <div className="form-row">
                  <button
                    className="secondary-button"
                    onClick={() => setPendingImport(null)}
                  >
                    {tr("SettingsModal.bb9dbb406d")}</button>
                  <button
                    className="primary-button"
                    onClick={() => {
                      if (importData(pendingImport)) {
                        setPendingImport(null);
                        setRaw("");
                        setError("");
                      } else
                        setError(
                          tr("SettingsModal.79d69fad2c"),
                        );
                    }}
                  >
                    {tr("SettingsModal.4a5ee0812b")}</button>
                </div>
              </div>
            )}
            {error && (
              <p className="error-message" role="alert">
                {translateMessage(error)}
              </p>
            )}
            <button
              className="text-button"
              onClick={() => {
                try {
                  const previous = localStorage.getItem("mia_before_import");
                  if (!previous) {
                    notify(
                      tr("SettingsModal.0de85deefe"),
                    );
                    return;
                  }
                  void stageImport(previous);
                } catch {
                  setError(tr("SettingsModal.29a1df3069"));
                }
              }}
            >
              <RotateCcw size={15} /> {tr("SettingsModal.3af019dbe9")}</button>
            <details>
              <summary>{tr("SettingsModal.42278c906c")}</summary>
              <p>
                {tr("SettingsModal.b224aae572")}</p>
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
                    setError(tr("SettingsModal.a0d1556a4d"));
                  }
                }}
              >
                {tr("SettingsModal.f79986a68e")}</button>
            </details>
          </div>
        )}
      </div>
      <div className="settings-footer">
        <span>
          <Check size={13} /> {tr("SettingsModal.02ff8cb165")}</span>
        <button className="primary-button" onClick={onClose}>
          {tr("SettingsModal.bc4852dd71")}</button>
      </div>
    </Dialog>
  );
}
