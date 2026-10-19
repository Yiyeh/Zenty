import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { translateMessage, tr } from "../lib/i18n.ts";
import { useEffect, useState } from "react";
import {
  Music2,
  ArrowUpRight,
  Link2,
  Headphones,
  RefreshCw,
  Maximize2,
  Minimize2,
  Volume2,
  AlertCircle,
} from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
import { useIntegrations } from "../context/IntegrationsStore";
import { spotifyEmbed } from "../lib/dashboard";
import { DesktopVolume } from "./DesktopVolume";
import { SpotifyFrameSlot } from "./SpotifyFrameSlot";
import { SpotifyConnectPlayer } from "./SpotifyConnectPlayer";
import { SpotifyModeSelector } from "./SpotifyModeSelector";
export function MusicWidget({ onConnect }: { onConnect: () => void }) {
  useInterfaceLocale();
  const { settings } = useDashboard();
  return settings.spotifyMode === "connect" ? (
    <SpotifyConnectPlayer onConnect={onConnect} />
  ) : (
    <SpotifyEmbedWidget onConnect={onConnect} />
  );
}
function SpotifyEmbedWidget({ onConnect }: { onConnect: () => void }) {
  useInterfaceLocale();
  const { settings, setSettings } = useDashboard();
  const i = useIntegrations();
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(settings.spotifyUrl);
  const [error, setError] = useState("");
  const embed = spotifyEmbed(settings.spotifyUrl);
  const [check, setCheck] = useState<{
    embed: string;
    available: boolean | null;
    title: string;
    error: string;
  } | null>(null);
  const [volume, setVolume] = useState(i.spotifyDevice?.volume ?? 50);
  useEffect(() => {
    setVolume(i.spotifyDevice?.volume ?? 50);
  }, [i.spotifyDevice?.volume, i.spotifyDevice?.id]);
  useEffect(() => {
    if (!embed) return;
    const controller = new AbortController();
    void fetch(`/api/music/spotify?url=${encodeURIComponent(embed)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((body) => {
        if (!controller.signal.aborted)
          setCheck({
            embed,
            available:
              typeof body.available === "boolean" ? body.available : null,
            title: body.title || "",
            error: body.error || "",
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setCheck({
            embed,
            available: null,
            title: "",
            error:
              tr("MusicWidget.623f4e133a"),
          });
      });
    return () => controller.abort();
  }, [embed]);
  const current = check?.embed === embed ? check : null;
  const commitVolume = async () => {
    if (volume === i.spotifyDevice?.volume) return;
    if (!(await i.setSpotifyVolume(volume)))
      setVolume(i.spotifyDevice?.volume ?? 50);
  };
  return (
    <section className="glass-panel music-card">
      <div className="widget-heading">
        <h3>
          <Music2 size={17} /> {tr("MusicWidget.8119461562")}</h3>
        <div className="music-heading-actions">
          {embed && (
            <button
              className="icon-button"
              aria-label={
                settings.spotifyCompact
                  ? tr("MusicWidget.1f0c32d46d")
                  : tr("MusicWidget.102601b934")
              }
              onClick={() =>
                setSettings((p) => ({
                  ...p,
                  spotifyCompact: !p.spotifyCompact,
                }))
              }
            >
              {settings.spotifyCompact ? (
                <Maximize2 size={15} />
              ) : (
                <Minimize2 size={15} />
              )}
            </button>
          )}
          <button
            className="icon-button"
            aria-label={tr("MusicWidget.7b5a7b0609")}
            onClick={() => {
              setEditing(!editing);
              setUrl(settings.spotifyUrl);
            }}
          >
            <Link2 size={15} />
          </button>
        </div>
      </div>
      <SpotifyModeSelector />
      {embed && !current ? (
        <div
          className="music-loading"
          style={{ height: settings.spotifyCompact ? 152 : 352 }}
          role="status"
        >
          {tr("MusicWidget.87aac10338")}</div>
      ) : embed && current?.available === false ? (
        <div className="music-unavailable" role="status">
          <AlertCircle size={27} />
          <h4>{tr("MusicWidget.a9f4071be5")}</h4>
          <p>{current.error}</p>
          <button className="secondary-button" onClick={() => setEditing(true)}>
            <Link2 size={15} /> {tr("MusicWidget.e577b03030")}</button>
          <a
            className="text-button"
            href={embed.replace("/embed/", "/")}
            target="_blank"
            rel="noreferrer"
          >
            {tr("MusicWidget.840b9dddb1")}<ArrowUpRight size={14} />
          </a>
        </div>
      ) : embed ? (
        <>
          {current?.title && (
            <p className="music-content-title">{current.title}</p>
          )}
          <SpotifyFrameSlot embed={embed} compact={settings.spotifyCompact} />
          {current?.error && (
            <small className="music-hint">{current.error}</small>
          )}
          <a
            className="text-button music-external"
            href={embed.replace("/embed/", "/")}
            target="_blank"
            rel="noreferrer"
          >
            {tr("MusicWidget.ef2a845252")}<ArrowUpRight size={13} />
          </a>
          <small className="music-hint">
            {tr("MusicWidget.522f12cd49")}</small>
        </>
      ) : (
        <div className="music-empty">
          <span className="music-art">
            <Headphones size={38} strokeWidth={1.1} />
            <i />
            <i />
            <i />
          </span>
          <div>
            <span className="eyebrow">{tr("MusicWidget.9d72a83d9e")}</span>
            <h4>{tr("MusicWidget.c04bd6b5e4")}</h4>
            <p>{tr("MusicWidget.147c89e017")}</p>
            <button className="text-button" onClick={() => setEditing(true)}>
              {tr("MusicWidget.a281fa3cd5")}<ArrowUpRight size={14} />
            </button>
          </div>
        </div>
      )}
      {editing && (
        <form
          className="form-stack playlist-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (url && !spotifyEmbed(url)) {
              setError(
                tr("MusicWidget.8e9ab77997"),
              );
              return;
            }
            setSettings((p) => ({ ...p, spotifyUrl: url }));
            setError("");
            setEditing(false);
          }}
        >
          <label>
            {tr("MusicWidget.acf528dd1c")}<input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={tr("MusicWidget.b1eb798643")}
            />
          </label>
          {error && (
            <p className="error-message" role="alert">
              {translateMessage(error)}
            </p>
          )}
          <button className="secondary-button">{tr("MusicWidget.c938a262cc")}</button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setEditing(false);
              setError("");
            }}
          >
            {tr("MusicWidget.bb9dbb406d")}</button>
          <small>
            {tr("MusicWidget.3681512a62")}</small>
        </form>
      )}
      <DesktopVolume />
      <div className="music-footer">
        {i.spotifyConnected ? (
          <>
            <span>
              <span className="connection-dot" />
              {i.nowPlaying
                ? `${i.nowPlaying.playing ? tr("MusicWidget.4b027a78de") : tr("MusicWidget.c28d816de9")} · ${i.nowPlaying.title} — ${i.nowPlaying.artist}`
                : `Conectado · ${i.spotifyName || "Spotify"}`}
            </span>
            <button
              className="icon-button"
              aria-label={tr("MusicWidget.ecdca8c985")}
              disabled={i.spotifyBusy}
              onClick={() => void i.refreshSpotify()}
            >
              <RefreshCw size={14} />
            </button>
          </>
        ) : (
          <>
            <span>{tr("MusicWidget.67e86894fa")}</span>
            <button className="text-button" onClick={onConnect}>
              {tr("MusicWidget.1b108abf7a")}<ArrowUpRight size={13} />
            </button>
          </>
        )}
      </div>
      {i.spotifyConnected && (
        <div className="spotify-volume-panel">
          <div className="spotify-volume-heading">
            <Volume2 size={15} />
            <span>{tr("MusicWidget.bac325102a")}</span>
          </div>
          {!i.spotifyPlaybackControl ? (
            <>
              <p>
                {tr("MusicWidget.24c0556c5b")}</p>
              <button
                className="secondary-button"
                disabled={i.spotifyBusy}
                onClick={() => void i.connectSpotify(true)}
              >
                {tr("MusicWidget.bb70f165b9")}</button>
              <small>
                {tr("MusicWidget.9380c5f32f")}</small>
            </>
          ) : (
            <>
              <label className="spotify-volume-slider">
                <span>{i.spotifyDevice?.name || tr("MusicWidget.bd6e67ae2a")}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  aria-label={tr("MusicWidget.62372b6234")}
                  aria-valuetext={`${volume}%`}
                  value={volume}
                  disabled={
                    !i.spotifyDevice?.supported ||
                    i.spotifyDevice.volume === null ||
                    i.spotifyVolumeBusy
                  }
                  onChange={(e) => setVolume(Number(e.target.value))}
                  onPointerUp={() => void commitVolume()}
                  onKeyUp={(e) => {
                    if (
                      [
                        "ArrowLeft",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowDown",
                        "Home",
                        "End",
                        "PageUp",
                        "PageDown",
                      ].includes(e.key)
                    )
                      void commitVolume();
                  }}
                />
                <output>
                  {i.spotifyDevice?.volume === null || !i.spotifyDevice
                    ? "—"
                    : `${volume}%`}
                </output>
              </label>
              <small>
                {!i.spotifyDevice
                  ? tr("MusicWidget.11efb181b2")
                  : !i.spotifyDevice.supported
                    ? tr("MusicWidget.2d4db3db42")
                    : tr("MusicWidget.8bf3545efb")}
              </small>
            </>
          )}
        </div>
      )}
      {i.spotifyError && (
        <p className="error-message" role="status">
          {i.spotifyError}
        </p>
      )}
    </section>
  );
}
