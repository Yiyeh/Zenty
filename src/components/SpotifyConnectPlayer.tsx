import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { tr } from "../lib/i18n.ts";
import { useEffect, useRef, useState } from "react";
import {
  Music2,
  MonitorSpeaker,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RefreshCw,
  ArrowUpRight,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
import { useIntegrations } from "../context/IntegrationsStore";
import { spotifyEmbed } from "../lib/dashboard";
import { SpotifyModeSelector } from "./SpotifyModeSelector";
const timeLabel = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
export function SpotifyConnectPlayer({ onConnect }: { onConnect: () => void }) {
  useInterfaceLocale();
  const i = useIntegrations();
  const { settings, setSettings } = useDashboard();
  const [clock, setClock] = useState(Date.now());
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const [volume, setVolume] = useState(i.spotifyDevice?.volume ?? 50);
  const [url, setUrl] = useState(settings.spotifyUrl);
  const [error, setError] = useState("");
  const refresh = useRef(i.refreshSpotify);
  refresh.current = i.refreshSpotify;
  const previousVolume = useRef(50);
  useEffect(() => {
    setVolume(i.spotifyDevice?.volume ?? 50);
  }, [i.spotifyDevice?.id, i.spotifyDevice?.volume]);
  useEffect(() => {
    setUrl(settings.spotifyUrl);
  }, [settings.spotifyUrl]);
  useEffect(() => {
    if (!i.spotifyConnected) return;
    void refresh.current(true);
    const update = () => {
      if (!document.hidden) void refresh.current(false);
    };
    const interval = setInterval(update, 15000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, [i.spotifyConnected, i.spotifyPlaybackControl]);
  useEffect(() => {
    if (!i.nowPlaying?.playing || document.hidden) return;
    const interval = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [i.nowPlaying?.playing, i.nowPlaying?.observedAt]);
  const playing = i.nowPlaying;
  const devices = i.spotifyDevices;
  const device = i.spotifyDevice;
  const deviceId =
    device?.id || devices.find((item) => !item.restricted)?.id || "";
  const selected = devices.find((item) => item.id === deviceId);
  const disabled =
    !i.spotifyPlaybackControl ||
    !deviceId ||
    selected?.restricted ||
    i.spotifyActionBusy;
  const progress = Math.min(
    playing?.duration || 0,
    (playing?.progress || 0) +
      (playing?.playing
        ? Math.max(0, clock - (playing.observedAt || clock))
        : 0),
  );
  const commitSeek = () => {
    if (seekDraft === null) return;
    void i.commandSpotify({ action: "seek", deviceId, position: seekDraft });
    setSeekDraft(null);
  };
  const commitVolume = () => {
    if (volume !== device?.volume) void i.setSpotifyVolume(volume);
  };
  const rangeKey = (key: string) =>
    [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
      "PageUp",
      "PageDown",
    ].includes(key);
  return (
    <section
      className="glass-panel music-card spotify-connect"
      aria-label={tr("SpotifyConnectPlayer.0820c31263")}
    >
      <div className="widget-heading">
        <h3>
          <Music2 size={17} /> {tr("SpotifyConnectPlayer.3be440b636")}</h3>
        <button
          className="icon-button"
          aria-label={tr("SpotifyConnectPlayer.1900cba131")}
          disabled={!i.spotifyConnected || i.spotifyBusy}
          onClick={() => void i.refreshSpotify()}
        >
          <RefreshCw
            size={15}
            className={i.spotifyBusy ? "animate-spin" : ""}
          />
        </button>
      </div>
      <SpotifyModeSelector />
      <div className="spotify-connect-track">
        <div className="spotify-connect-cover">
          {playing?.image ? (
            <img
              src={playing.image}
              alt={tr("SpotifyConnectPlayer.d116f0db8c")}
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.visibility = "hidden";
              }}
            />
          ) : (
            <Music2 size={28} />
          )}
        </div>
        <div>
          <small>
            {playing?.playing ? tr("SpotifyConnectPlayer.a87fc25bff") : tr("SpotifyConnectPlayer.2d6822c3cd")}
          </small>
          <h4>{playing?.title || tr("SpotifyConnectPlayer.c69d7b1cfe")}</h4>
          <p>
            {playing?.artist || tr("SpotifyConnectPlayer.7f5289e540")}
          </p>
        </div>
      </div>
      {!i.spotifyConnected ? (
        <div className="spotify-connect-setup">
          <p>
            {tr("SpotifyConnectPlayer.c0f50d3fae")}</p>
          <button
            className="primary-button"
            onClick={() =>
              settings.spotifyClientId
                ? void i.connectSpotify(true)
                : onConnect()
            }
          >
            {tr("SpotifyConnectPlayer.ef3699cbb4")}</button>
        </div>
      ) : !i.spotifyPlaybackControl ? (
        <div className="spotify-connect-setup">
          <p>
            {tr("SpotifyConnectPlayer.9fc57451be")}</p>
          <button
            className="primary-button"
            disabled={i.spotifyBusy}
            onClick={() => void i.connectSpotify(true)}
          >
            {tr("SpotifyConnectPlayer.4b5f63573d")}</button>
        </div>
      ) : (
        <>
          <label className="spotify-device-select">
            <MonitorSpeaker size={16} />
            <span>{tr("SpotifyConnectPlayer.9a6393220e")}</span>
            <select
              aria-label={tr("SpotifyConnectPlayer.09c14d6aa5")}
              value={deviceId}
              disabled={!devices.length || i.spotifyActionBusy}
              onChange={(event) =>
                void i.commandSpotify({
                  action: "transfer",
                  deviceId: event.target.value,
                  play: playing?.playing === true,
                })
              }
            >
              {!devices.length && (
                <option value="">{tr("SpotifyConnectPlayer.7f446339fd")}</option>
              )}
              {device && !devices.some((item) => item.id === device.id) && (
                <option value={device.id}>{device.name}</option>
              )}
              {devices.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                  disabled={item.restricted}
                >
                  {item.name}
                  {item.active ? tr("SpotifyConnectPlayer.ececb757f7") : ""}
                </option>
              ))}
            </select>
          </label>
          {!devices.length && (
            <p className="music-hint">
              {tr("SpotifyConnectPlayer.169840ce88")}</p>
          )}
          <div className="spotify-connect-transport">
            <button
              className="icon-button"
              aria-label={tr("SpotifyConnectPlayer.3c452e3c5c")}
              disabled={disabled}
              onClick={() =>
                void i.commandSpotify({ action: "previous", deviceId })
              }
            >
              <SkipBack size={20} />
            </button>
            <button
              className="primary-button spotify-connect-play"
              aria-label={
                playing?.playing ? tr("SpotifyConnectPlayer.ac4cce101e") : tr("SpotifyConnectPlayer.22c9ea8c4f")
              }
              disabled={disabled}
              onClick={() =>
                void i.commandSpotify({
                  action: playing?.playing ? "pause" : "play",
                  deviceId,
                })
              }
            >
              {playing?.playing ? (
                <Pause size={22} fill="currentColor" />
              ) : (
                <Play size={22} fill="currentColor" />
              )}
            </button>
            <button
              className="icon-button"
              aria-label={tr("SpotifyConnectPlayer.4f83d341cb")}
              disabled={disabled}
              onClick={() =>
                void i.commandSpotify({ action: "next", deviceId })
              }
            >
              <SkipForward size={20} />
            </button>
          </div>
          <div className="spotify-connect-progress">
            <input
              type="range"
              aria-label={tr("SpotifyConnectPlayer.732210787b")}
              aria-valuetext={timeLabel(seekDraft ?? progress)}
              min="0"
              max={playing?.duration || 1}
              step="1000"
              disabled={disabled || !playing?.duration}
              value={seekDraft ?? progress}
              onChange={(event) => setSeekDraft(Number(event.target.value))}
              onPointerUp={commitSeek}
              onBlur={commitSeek}
              onKeyUp={(event) => {
                if (rangeKey(event.key)) commitSeek();
              }}
            />
            <div>
              <span>{timeLabel(seekDraft ?? progress)}</span>
              <span>{timeLabel(playing?.duration || 0)}</span>
            </div>
          </div>
          <div className="spotify-connect-volume">
            <button
              className="icon-button"
              aria-label={
                volume
                  ? tr("SpotifyConnectPlayer.704e15a3b9")
                  : tr("SpotifyConnectPlayer.78fb606f0f")
              }
              disabled={!device?.supported || i.spotifyVolumeBusy}
              onClick={() => {
                if (volume > 0) previousVolume.current = volume;
                const next = volume ? 0 : previousVolume.current;
                setVolume(next);
                void i.setSpotifyVolume(next);
              }}
            >
              {volume ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
            <label>
              <span>{tr("SpotifyConnectPlayer.a143b31354")}{device?.name || "Spotify"}</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                aria-label={tr("SpotifyConnectPlayer.62372b6234")}
                aria-valuetext={`${volume}%`}
                disabled={
                  !device?.supported ||
                  device.volume === null ||
                  i.spotifyVolumeBusy
                }
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
                onPointerUp={commitVolume}
                onBlur={commitVolume}
                onKeyUp={(event) => {
                  if (rangeKey(event.key)) commitVolume();
                }}
              />
            </label>
            <output>
              {device?.volume === null || !device ? "—" : `${volume}%`}
            </output>
          </div>
          {device && !device.supported && (
            <p className="music-hint">
              {tr("SpotifyConnectPlayer.fd5b8e93b8")}</p>
          )}
        </>
      )}
      <details className="spotify-play-link">
        <summary>{tr("SpotifyConnectPlayer.dc0139a28e")}</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const embed = spotifyEmbed(url);
            if (!embed) {
              setError(tr("SpotifyConnectPlayer.7357ab4e31"));
              return;
            }
            setError("");
            setSettings((previous) => ({
              ...previous,
              spotifyUrl: url.trim(),
            }));
            if (!disabled)
              void i.commandSpotify({
                action: "play",
                deviceId,
                url: url.trim(),
              });
          }}
        >
          <input
            aria-label={tr("SpotifyConnectPlayer.10813a9930")}
            placeholder={tr("SpotifyConnectPlayer.b1eb798643")}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <button className="secondary-button" type="submit">
            {disabled ? tr("SpotifyConnectPlayer.3c530d7af3") : tr("SpotifyConnectPlayer.6fc464606e")}
          </button>
        </form>
      </details>
      {(error || i.spotifyError) && (
        <p className="error-message" role="status">
          {error || i.spotifyError}
        </p>
      )}
      <div className="music-footer">
        <span>
          {device
            ? tr("SpotifyConnectPlayer.c93bc4669f", { v0: device.name })
            : tr("SpotifyConnectPlayer.be7cae543e")}
        </span>
        <a
          className="text-button"
          href="https://open.spotify.com"
          target="_blank"
          rel="noreferrer"
        >
          {tr("SpotifyConnectPlayer.2a726fca93")}<ArrowUpRight size={13} />
        </a>
      </div>
    </section>
  );
}
