import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { tr } from "../lib/i18n.ts";
import { useDashboard } from "../context/DashboardStore";
export function SpotifyModeSelector() {
  useInterfaceLocale();
  const { settings, setSettings } = useDashboard();
  return (
    <label className="spotify-mode-select">
      <span>{tr("SpotifyModeSelector.7fa2ee4395")}</span>
      <select
        aria-label={tr("SpotifyModeSelector.0f1a5e8d28")}
        value={settings.spotifyMode}
        onChange={(event) =>
          setSettings((previous) => ({
            ...previous,
            spotifyMode: event.target.value === "embed" ? "embed" : "connect",
          }))
        }
      >
        <option value="connect">{tr("SpotifyModeSelector.ef69da5ed3")}</option>
        <option value="embed">{tr("SpotifyModeSelector.4a5997d9af")}</option>
      </select>
    </label>
  );
}
