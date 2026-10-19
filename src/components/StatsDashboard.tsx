import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { tr, getFormatLocale } from "../lib/i18n.ts";
import { ChartNoAxesColumnIncreasing } from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
import { habitStreak, localDate } from "../lib/dashboard";
export function StatsDashboard() {
  useInterfaceLocale();
  const { focusSessions, tasks, habits, settings } = useDashboard();
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return {
      date: localDate(date),
      label: date.toLocaleDateString(getFormatLocale(), { weekday: "narrow" }),
      minutes:
        focusSessions.find((s) => s.date === localDate(date))?.minutes || 0,
    };
  });
  const total = days.reduce((sum, d) => sum + d.minutes, 0);
  const max = Math.max(...days.map((d) => d.minutes), settings.workMinutes);
  return (
    <section className="glass-panel stats-card">
      <div className="widget-heading">
        <h3>
          <ChartNoAxesColumnIncreasing size={17} /> {tr("StatsDashboard.069e743a12")}</h3>
      </div>
      <div className="stats-grid">
        <div className="stat">
          <span>{tr("StatsDashboard.bb2bc4a12b")}</span>
          <strong>
            {days[6].minutes}
            <small> {tr("StatsDashboard.2e75737a6b")}</small>
          </strong>
        </div>
        <div className="stat">
          <span>{tr("StatsDashboard.bb16b73fa6")}</span>
          <strong>
            {total}
            <small> {tr("StatsDashboard.2e75737a6b")}</small>
          </strong>
        </div>
        <div className="stat">
          <span>{tr("StatsDashboard.ab0baf8b78")}</span>
          <strong>{tasks.filter((t) => t.completed).length}</strong>
        </div>
        <div className="stat">
          <span>{tr("StatsDashboard.cdbc7c8f2d")}</span>
          <strong>
            {Math.max(0, ...habits.map((h) => habitStreak(h.history)))}
            <small> {tr("StatsDashboard.cb3ee4ef47")}</small>
          </strong>
        </div>
      </div>
      <div
        className="weekly-bars"
        role="img"
        aria-label={tr("StatsDashboard.af3707639b", { v0: days.map((d) => tr("StatsDashboard.eef67ad199", { v0: d.date, v1: d.minutes })).join(", ") })}
      >
        {days.map((d) => (
          <div key={d.date} title={tr("a11y.StatsDashboard.60", { v0: d.date, v1: d.minutes })}>
            <i style={{ height: `${(d.minutes / max) * 65}%` }} />
            <span>{d.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
