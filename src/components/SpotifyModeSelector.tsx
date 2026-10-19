import { useDashboard } from "../context/DashboardStore";
export function SpotifyModeSelector() {
  const { settings, setSettings } = useDashboard();
  return (
    <label className="spotify-mode-select">
      <span>Reproductor</span>
      <select
        aria-label="Tipo de reproductor de Spotify"
        value={settings.spotifyMode}
        onChange={(event) =>
          setSettings((previous) => ({
            ...previous,
            spotifyMode: event.target.value === "embed" ? "embed" : "connect",
          }))
        }
      >
        <option value="connect">Controlar app / navegador</option>
        <option value="embed">Integrado · puede ofrecer muestras</option>
      </select>
    </label>
  );
}
