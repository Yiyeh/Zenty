import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { APP_NAME } from "../lib/brand";
import type { DesktopAudioState } from "../desktop";
export function DesktopVolume() {
  const audio = window.zentyDesktop?.audio;
  const [state, setState] = useState<DesktopAudioState | null>(null);
  const [error, setError] = useState("");
  const latest = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<{ volume: number; muted: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    if (audio)
      void audio
        .get()
        .then((value) => {
          if (active) setState(value);
        })
        .catch(() => {
          if (active)
            setError(
              "No se pudo acceder al audio de la aplicación. Intenta mover el control de nuevo.",
            );
        });
    return () => {
      active = false;
      clearTimeout(timer.current);
      if (pending.current && audio)
        void audio.set(pending.current).catch(() => {});
    };
  }, [audio]);
  if (!audio) return null;
  function change(next: DesktopAudioState) {
    setState(next);
    setError("");
    clearTimeout(timer.current);
    const version = ++latest.current;
    pending.current = { volume: next.volume, muted: next.muted };
    timer.current = setTimeout(() => {
      pending.current = null;
      void audio!
        .set({ volume: next.volume, muted: next.muted })
        .then((value) => {
          if (version === latest.current) setState(value);
        })
        .catch(() => {
          if (version === latest.current)
            setError(
              "Windows no pudo cambiar el volumen. Vuelve a intentarlo.",
            );
        });
    }, 120);
  }
  const current = state || {
    supported: true,
    volume: 100,
    muted: false,
    applied: false,
  };
  return (
    <div className="desktop-volume-panel" aria-label={`Audio de ${APP_NAME}`}>
      <div className="desktop-volume-row">
        <button
          type="button"
          className="icon-button"
          aria-label={
            current.muted || current.volume === 0
              ? `Activar sonido de ${APP_NAME}`
              : `Silenciar ${APP_NAME}`
          }
          aria-pressed={current.muted}
          onClick={() =>
            change({
              ...current,
              muted: !(current.muted || current.volume === 0),
              volume: current.volume || 50,
            })
          }
        >
          {current.muted || current.volume === 0 ? (
            <VolumeX size={18} />
          ) : (
            <Volume2 size={18} />
          )}
        </button>
        <label className="desktop-volume-label">
          <span>Volumen de {APP_NAME}</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            aria-label={`Volumen de ${APP_NAME}`}
            aria-valuetext={`${current.muted ? 0 : current.volume}%`}
            value={current.muted ? 0 : current.volume}
            onChange={(e) =>
              change({
                ...current,
                volume: Number(e.target.value),
                muted: false,
              })
            }
          />
        </label>
        <output>{current.muted ? 0 : current.volume}%</output>
      </div>
      <small>
        {error ||
          "Incluye este reproductor. No modifica el volumen de otras aplicaciones."}
      </small>
    </div>
  );
}
