import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { tr } from "../lib/i18n.ts";
import { useEffect, useRef } from "react";
import { useSpotifyFrame } from "../context/SpotifyFrameStore";
export function SpotifyFrameSlot({
  embed,
  compact,
}: {
  embed: string;
  compact: boolean;
}) {
  useInterfaceLocale();
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
      aria-label={tr("SpotifyFrameSlot.01fdbcb179")}
    />
  );
}
