import { useDashboard } from "../context/DashboardStore";
import { useLocale } from "../context/Locale";
import { deviceId, spaceIds } from "../lib/spaces";
import type { SpaceId } from "../lib/spaces";
import { tr } from "../lib/i18n";
export function SpaceSwitcher() {
  useLocale(); const { settings, setSettings } = useDashboard(); const id = deviceId();
  return <select className="space-switcher" aria-label={tr("spaces.label")} value={settings.devicePreferences[id]?.space || "personal"} onChange={event => setSettings(previous => ({ ...previous, devicePreferences: { ...previous.devicePreferences, [id]: { ...previous.devicePreferences[id], space: event.target.value as SpaceId } } }))}>{spaceIds.map(space => <option key={space} value={space}>{tr(`spaces.${space}`)}</option>)}</select>;
}
