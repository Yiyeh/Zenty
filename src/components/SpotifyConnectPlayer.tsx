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
      aria-label="Control remoto de Spotify"
    >
      <div className="widget-heading">
        <h3>
          <Music2 size={17} /> Tu música
        </h3>
        <button
          className="icon-button"
          aria-label="Actualizar dispositivos de Spotify"
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
              alt="Portada del álbum"
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
            {playing?.playing ? "SONANDO EN SPOTIFY" : "SPOTIFY CONNECT"}
          </small>
          <h4>{playing?.title || "Tu música, sin muestras"}</h4>
          <p>
            {playing?.artist || "Controla Spotify de Windows o del navegador."}
          </p>
        </div>
      </div>
      {!i.spotifyConnected ? (
        <div className="spotify-connect-setup">
          <p>
            Las canciones completas suenan en Spotify. Conecta tu cuenta Premium
            para controlarlas desde aquí.
          </p>
          <button
            className="primary-button"
            onClick={() =>
              settings.spotifyClientId
                ? void i.connectSpotify(true)
                : onConnect()
            }
          >
            Conectar mi Spotify
          </button>
        </div>
      ) : !i.spotifyPlaybackControl ? (
        <div className="spotify-connect-setup">
          <p>
            Autoriza el control de reproducción para elegir el dispositivo y
            manejar tu música.
          </p>
          <button
            className="primary-button"
            disabled={i.spotifyBusy}
            onClick={() => void i.connectSpotify(true)}
          >
            Activar controles de Spotify
          </button>
        </div>
      ) : (
        <>
          <label className="spotify-device-select">
            <MonitorSpeaker size={16} />
            <span>Reproducir en</span>
            <select
              aria-label="Dispositivo de Spotify"
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
                <option value="">Sin dispositivos disponibles</option>
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
                  {item.active ? " · activo" : ""}
                </option>
              ))}
            </select>
          </label>
          {!devices.length && (
            <p className="music-hint">
              Abre Spotify en tu PC o en otra pestaña con la misma cuenta.
              Reproduce una canción y pulsa Actualizar.
            </p>
          )}
          <div className="spotify-connect-transport">
            <button
              className="icon-button"
              aria-label="Canción anterior en Spotify"
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
                playing?.playing ? "Pausar Spotify" : "Reproducir en Spotify"
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
              aria-label="Canción siguiente en Spotify"
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
              aria-label="Posición de la canción en Spotify"
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
                  ? "Silenciar dispositivo de Spotify"
                  : "Activar sonido del dispositivo de Spotify"
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
              <span>Volumen de {device?.name || "Spotify"}</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                aria-label="Volumen del dispositivo de Spotify"
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
              Spotify no permite cambiar el volumen de este dispositivo. Usa su
              control de volumen propio.
            </p>
          )}
        </>
      )}
      <details className="spotify-play-link">
        <summary>Playlist, álbum o canción</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const embed = spotifyEmbed(url);
            if (!embed) {
              setError("Introduce un enlace válido de Spotify.");
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
            aria-label="Enlace para reproducir en Spotify"
            placeholder="https://open.spotify.com/playlist/…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <button className="secondary-button" type="submit">
            {disabled ? "Guardar enlace" : "Reproducir enlace"}
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
            ? `Sonido en ${device.name}`
            : "Audio en la app o web de Spotify"}
        </span>
        <a
          className="text-button"
          href="https://open.spotify.com"
          target="_blank"
          rel="noreferrer"
        >
          Abrir Spotify <ArrowUpRight size={13} />
        </a>
      </div>
    </section>
  );
}
