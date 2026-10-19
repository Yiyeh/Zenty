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
  const { settings } = useDashboard();
  return settings.spotifyMode === "connect" ? (
    <SpotifyConnectPlayer onConnect={onConnect} />
  ) : (
    <SpotifyEmbedWidget onConnect={onConnect} />
  );
}
function SpotifyEmbedWidget({ onConnect }: { onConnect: () => void }) {
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
              "No pudimos comprobar el enlace. Si Spotify muestra un error, revisa que el contenido sea público.",
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
          <Music2 size={17} /> La banda sonora de tu día
        </h3>
        <div className="music-heading-actions">
          {embed && (
            <button
              className="icon-button"
              aria-label={
                settings.spotifyCompact
                  ? "Ampliar reproductor de Spotify"
                  : "Usar reproductor compacto de Spotify"
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
            aria-label="Configurar playlist de Spotify"
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
          Comprobando enlace de Spotify…
        </div>
      ) : embed && current?.available === false ? (
        <div className="music-unavailable" role="status">
          <AlertCircle size={27} />
          <h4>Esta música no está disponible</h4>
          <p>{current.error}</p>
          <button className="secondary-button" onClick={() => setEditing(true)}>
            <Link2 size={15} /> Cambiar enlace
          </button>
          <a
            className="text-button"
            href={embed.replace("/embed/", "/")}
            target="_blank"
            rel="noreferrer"
          >
            Comprobar en Spotify <ArrowUpRight size={14} />
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
            Abrir en Spotify <ArrowUpRight size={13} />
          </a>
          <small className="music-hint">
            Si Spotify indica «Muestra», está reproduciendo un fragmento, aunque
            el álbum tenga canciones completas. Abre Spotify para escucharlas
            completas si el reproductor integrado no lo permite.
          </small>
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
            <span className="eyebrow">TU PROPIO AMBIENTE</span>
            <h4>Dale play a tu espacio.</h4>
            <p>Una playlist para acompañarte.</p>
            <button className="text-button" onClick={() => setEditing(true)}>
              Añadir mi playlist <ArrowUpRight size={14} />
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
                "Pega un enlace de Spotify a una playlist, álbum, canción o podcast.",
              );
              return;
            }
            setSettings((p) => ({ ...p, spotifyUrl: url }));
            setError("");
            setEditing(false);
          }}
        >
          <label>
            Enlace de Spotify
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://open.spotify.com/playlist/…"
            />
          </label>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button className="secondary-button">Guardar playlist</button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setEditing(false);
              setError("");
            }}
          >
            Cancelar
          </button>
          <small>
            En Spotify, usa Compartir → Copiar enlace. La playlist debe ser
            pública y estar disponible en tu región.
          </small>
        </form>
      )}
      <DesktopVolume />
      <div className="music-footer">
        {i.spotifyConnected ? (
          <>
            <span>
              <span className="connection-dot" />
              {i.nowPlaying
                ? `${i.nowPlaying.playing ? "Sonando" : "En pausa"} · ${i.nowPlaying.title} — ${i.nowPlaying.artist}`
                : `Conectado · ${i.spotifyName || "Spotify"}`}
            </span>
            <button
              className="icon-button"
              aria-label="Actualizar reproducción de Spotify"
              disabled={i.spotifyBusy}
              onClick={() => void i.refreshSpotify()}
            >
              <RefreshCw size={14} />
            </button>
          </>
        ) : (
          <>
            <span>Más tuyo con tu cuenta</span>
            <button className="text-button" onClick={onConnect}>
              Conectar Spotify <ArrowUpRight size={13} />
            </button>
          </>
        )}
      </div>
      {i.spotifyConnected && (
        <div className="spotify-volume-panel">
          <div className="spotify-volume-heading">
            <Volume2 size={15} />
            <span>Volumen de Spotify</span>
          </div>
          {!i.spotifyPlaybackControl ? (
            <>
              <p>
                Controla el volumen de tu dispositivo activo. Requiere Spotify
                Premium.
              </p>
              <button
                className="secondary-button"
                disabled={i.spotifyBusy}
                onClick={() => void i.connectSpotify(true)}
              >
                Activar control de volumen
              </button>
              <small>
                Spotify te pedirá permiso para controlar la reproducción.
              </small>
            </>
          ) : (
            <>
              <label className="spotify-volume-slider">
                <span>{i.spotifyDevice?.name || "Sin dispositivo activo"}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  aria-label="Volumen del dispositivo de Spotify"
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
                  ? "Abre Spotify, reproduce algo y pulsa Actualizar."
                  : !i.spotifyDevice.supported
                    ? "Este dispositivo no permite ajustar el volumen desde Spotify."
                    : "Controla ese dispositivo; el reproductor integrado administra su audio por separado."}
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
