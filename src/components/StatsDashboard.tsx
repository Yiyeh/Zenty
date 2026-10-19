import { ChartNoAxesColumnIncreasing } from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
import { habitStreak, localDate } from "../lib/dashboard";
export function StatsDashboard() {
  const { focusSessions, tasks, habits, settings } = useDashboard();
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return {
      date: localDate(date),
      label: date.toLocaleDateString("es-CL", { weekday: "narrow" }),
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
          <ChartNoAxesColumnIncreasing size={17} /> Mira cuánto has avanzado
        </h3>
      </div>
      <div className="stats-grid">
        <div className="stat">
          <span>Enfoque de hoy</span>
          <strong>
            {days[6].minutes}
            <small> min</small>
          </strong>
        </div>
        <div className="stat">
          <span>Últimos 7 días</span>
          <strong>
            {total}
            <small> min</small>
          </strong>
        </div>
        <div className="stat">
          <span>Tareas completadas · total</span>
          <strong>{tasks.filter((t) => t.completed).length}</strong>
        </div>
        <div className="stat">
          <span>Racha activa más larga</span>
          <strong>
            {Math.max(0, ...habits.map((h) => habitStreak(h.history)))}
            <small> días</small>
          </strong>
        </div>
      </div>
      <div
        className="weekly-bars"
        role="img"
        aria-label={`Enfoque de los últimos 7 días: ${days.map((d) => `${d.date}: ${d.minutes} minutos`).join(", ")}`}
      >
        {days.map((d) => (
          <div key={d.date} title={`${d.date}: ${d.minutes} min`}>
            <i style={{ height: `${(d.minutes / max) * 65}%` }} />
            <span>{d.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
