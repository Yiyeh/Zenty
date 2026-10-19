import { useCallback, useLayoutEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Music2, ChevronDown, ChevronUp } from "lucide-react";
import { SpotifyFrameContext } from "./SpotifyFrameStore";
import { useDashboard } from "./DashboardStore";
import { spotifyEmbed } from "../lib/dashboard";
import { DesktopVolume } from "../components/DesktopVolume";

export function SpotifyPlayerProvider({ children }: { children: ReactNode }) {
  const { settings } = useDashboard();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [source, setSource] = useState<{ url: string; embed: string } | null>(
    null,
  );
  const [geometry, setGeometry] = useState<CSSProperties>({
    visibility: "hidden",
  });
  const [expanded, setExpanded] = useState(true);
  const activeSource =
    settings.spotifyMode === "embed" && source?.url === settings.spotifyUrl
      ? source.embed
      : null;
  const register = useCallback(
    (element: HTMLElement, embed: string) => {
      const validated = spotifyEmbed(embed);
      if (!validated || validated !== spotifyEmbed(settings.spotifyUrl))
        return () => {};
      setSource({ url: settings.spotifyUrl, embed: validated });
      setAnchor(element);
      return () =>
        setAnchor((current) => (current === element ? null : current));
    },
    [settings.spotifyUrl],
  );
  useLayoutEffect(() => {
    if (!anchor) return;
    let frame = 0;
    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      const header = document.querySelector(".topbar")?.getBoundingClientRect();
      const top = Math.max(header?.bottom || 0, window.zentyDesktop ? 35 : 0);
      setGeometry({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        visibility: rect.width > 0 && rect.height > 0 ? "visible" : "hidden",
        clipPath: `inset(${Math.min(rect.height, Math.max(0, top - rect.top))}px 0 ${Math.min(rect.height, Math.max(0, rect.bottom - innerHeight))}px 0)`,
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(anchor);
    for (const element of document.querySelectorAll(
      ".widget-column, .main-content",
    ))
      observer.observe(element);
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [anchor]);
  return (
    <SpotifyFrameContext.Provider value={register}>
      {children}
      {activeSource &&
        createPortal(
          <div
            className={`persistent-spotify ${anchor ? "at-widget" : "floating-player"} ${expanded ? "expanded" : "collapsed"}`}
            style={
              anchor
                ? geometry
                : {
                    top: "auto",
                    left: "auto",
                    width: "min(370px, calc(100vw - 44px))",
                    height: expanded ? "auto" : 56,
                    visibility: "visible",
                    clipPath: "none",
                  }
            }
          >
            <div className="floating-player-heading" hidden={!!anchor}>
              <Music2 size={16} />
              <span>Tu música sigue aquí</span>
              <button
                className="icon-button"
                aria-label={
                  expanded
                    ? "Contraer reproductor flotante"
                    : "Mostrar reproductor flotante"
                }
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
              </button>
            </div>
            <iframe
              id="persistent-spotify-frame"
              title="Reproductor oficial de Spotify"
              src={`${activeSource}?utm_source=generator&theme=0`}
              width="100%"
              height={anchor ? "100%" : "152"}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              className="spotify-embed"
              tabIndex={!anchor && !expanded ? -1 : undefined}
              aria-hidden={!anchor && !expanded}
            />
            <div
              className="floating-player-volume"
              hidden={!!anchor || !expanded}
            >
              {!anchor && expanded && <DesktopVolume />}
            </div>
          </div>,
          document.body,
        )}
    </SpotifyFrameContext.Provider>
  );
}
