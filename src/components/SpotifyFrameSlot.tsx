import { useEffect, useRef } from "react";
import { useSpotifyFrame } from "../context/SpotifyFrameStore";
export function SpotifyFrameSlot({
  embed,
  compact,
}: {
  embed: string;
  compact: boolean;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const register = useSpotifyFrame();
  useEffect(() => {
    if (anchor.current) return register(anchor.current, embed);
  }, [embed, register]);
  return (
    <div
      ref={anchor}
      className="spotify-frame-slot"
      style={{ height: compact ? 152 : 352 }}
      aria-label="Espacio del reproductor de Spotify"
    />
  );
}
