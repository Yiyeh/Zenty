import { ArrowUpRight, Gamepad2, Gift } from "lucide-react";
import { useGamingFeed } from "../lib/useGamingFeed";
import { giveawayExpired, matchesPlatform } from "../lib/gaming";
import { useDashboard } from "../context/DashboardStore";
export function GamingWidget({ onOpen }: { onOpen: () => void }) {
  const { settings, games } = useDashboard();
  const { feed, loading } = useGamingFeed("giveaways");
  const items = (feed?.items || [])
    .filter(
      (g) =>
        g.kind === "game" &&
        !giveawayExpired(g) &&
        matchesPlatform(g, settings.gamingPlatform) &&
        (!settings.gamingHideClaimed ||
          !games.some((s) => s.id === g.id && s.status === "claimed")),
    )
    .slice(0, 3);
  return (
    <section className="glass-panel gamer-widget">
      <div className="widget-heading">
        <h3>
          <Gamepad2 size={17} /> Radar gamer
        </h3>
        <Gift size={16} />
      </div>
      <p className="muted">Algo bueno para tu próxima partida.</p>
      {loading && !feed ? (
        <p role="status" className="muted">
          Buscando regalos…
        </p>
      ) : feed?.warning ? (
        <p className="muted">{feed.warning}</p>
      ) : items.length ? (
        items.map((g) => (
          <a
            className="gamer-mini-game"
            key={g.id}
            href={g.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>
              <strong>{g.title}</strong>
              <small>{g.platforms.join(" · ")}</small>
            </span>
            <ArrowUpRight size={15} />
          </a>
        ))
      ) : (
        <p className="muted">
          Sin juegos completos gratis para tu filtro en esta consulta.
        </p>
      )}
      <button className="secondary-button" onClick={onOpen}>
        Ir a mi rincón gamer <ArrowUpRight size={15} />
      </button>
      <small className="gamer-attribution">
        Regalos vía{" "}
        <a
          href="https://www.gamerpower.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          GamerPower
        </a>
      </small>
    </section>
  );
}
