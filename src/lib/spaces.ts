import { newId } from "./id.ts";
import type { DashboardSettings } from "./dashboard.ts";
export type SpaceId = "personal" | "work" | "gaming" | "reading";
export const spaceIds: SpaceId[] = ["personal", "work", "gaming", "reading"];
export const visualKeys = ["homeLayout", "density", "theme", "accentColor", "surfaceTone", "background", "showSidebarFocus", "showBookmarks", "showSummary", "showClock", "showSeconds", "clock24"] as const;
export type VisualSettings = Partial<Pick<DashboardSettings, typeof visualKeys[number]>>;
export interface DevicePreferences extends VisualSettings { space?: SpaceId }
export interface SpacePreferences { enabledWidgets?: DashboardSettings["enabledWidgets"]; columnLayout?: DashboardSettings["columnLayout"] }
export function deviceId(): string {
  try { const current = localStorage.getItem("zenty.device-id"); if (current && /^[a-z0-9-]{8,64}$/i.test(current)) return current; const id = newId(); localStorage.setItem("zenty.device-id", id); return id; } catch { return "desktop-default"; }
}
export function effectiveSettings(settings: DashboardSettings, id: string, mobile = false): DashboardSettings {
  const device = settings.devicePreferences?.[id] || {};
  const space = device.space || "personal";
  const preset = space === "work" ? ["tasks", "pomodoro", "calendar", "notes", "reminders"] : space === "gaming" ? ["gaming", "music", "news"] : space === "reading" ? ["notes", "music", "news"] : null;
  const profile = settings.spaces?.[space];
  const enabledWidgets = profile?.enabledWidgets || (preset ? Object.fromEntries(Object.keys(settings.enabledWidgets).map(key => [key, preset.includes(key)])) as DashboardSettings["enabledWidgets"] : settings.enabledWidgets);
  return { ...settings, ...(mobile ? { density: "compact", homeLayout: "compact" } as const : {}), ...device, enabledWidgets, columnLayout: profile?.columnLayout || settings.columnLayout };
}
export function applySettings(settings: DashboardSettings, next: DashboardSettings, id: string, mobile = false): DashboardSettings {
  const current = effectiveSettings(settings, id, mobile), result = { ...settings };
  const device = { ...settings.devicePreferences?.[id] };
  const space = device.space || "personal";
  const profile = { ...settings.spaces?.[space] };
  for (const key of Object.keys(next) as (keyof DashboardSettings)[]) {
    if (JSON.stringify(next[key]) === JSON.stringify(current[key])) continue;
    if ((visualKeys as readonly string[]).includes(key)) Object.assign(device, { [key]: next[key] });
    else if (key === "enabledWidgets" || key === "columnLayout") Object.assign(profile, { [key]: next[key] });
    else { Object.assign(result, { [key]: next[key] }); if (key === "devicePreferences") Object.assign(device, next.devicePreferences[id]); }
  }
  return { ...result, devicePreferences: { ...result.devicePreferences, [id]: device }, spaces: { ...result.spaces, [space]: profile } };
}
