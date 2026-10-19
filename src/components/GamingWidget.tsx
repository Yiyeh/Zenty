import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { tr } from "../lib/i18n.ts";
import { ArrowUpRight, Gamepad2, Gift } from "lucide-react";
import { useGamingFeed } from "../lib/useGamingFeed";
import { giveawayExpired, matchesPlatform } from "../lib/gaming";
import { useDashboard } from "../context/DashboardStore";
export function GamingWidget({ onOpen }: { onOpen: () => void }) {
  useInterfaceLocale();
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
          <Gamepad2 size={17} /> {tr("GamingWidget.14d6b0261c")}</h3>
        <Gift size={16} />
      </div>
      <p className="muted">{tr("GamingWidget.7167e9fe5f")}</p>
      {loading && !feed ? (
        <p role="status" className="muted">
          {tr("GamingWidget.01a8dc57c7")}</p>
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
          {tr("GamingWidget.51fac93562")}</p>
      )}
      <button className="secondary-button" onClick={onOpen}>
        {tr("GamingWidget.a28bff1894")}<ArrowUpRight size={15} />
      </button>
      <small className="gamer-attribution">
        {tr("GamingWidget.39076fc6a9")}{" "}
        <a
          href="https://www.gamerpower.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          {tr("GamingWidget.f8e0aae1be")}</a>
      </small>
    </section>
  );
}
