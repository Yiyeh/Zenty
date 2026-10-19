import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { tr, getFormatLocale } from "../lib/i18n.ts";
import { newId } from "../lib/id";
import { useState } from "react";
import { Plus, Trash2, Check, Leaf, Flame } from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
import { habitStreak, localDate } from "../lib/dashboard";
export function HabitTracker() {
  useInterfaceLocale();
  const { habits, setHabits, notify } = useDashboard();
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const today = localDate();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      date: localDate(d),
      label: d.toLocaleDateString(getFormatLocale(), { weekday: "narrow" }),
      day: d.getDate(),
    };
  });
  return (
    <section className="glass-panel habits-card">
      <div className="widget-heading">
        <h3>
          <Leaf size={17} /> {tr("HabitTracker.7f67e60d89")}</h3>
        <button
          className="icon-button"
          aria-label={tr("HabitTracker.1d867ce79f")}
          onClick={() => setAdding(!adding)}
        >
          <Plus size={17} />
        </button>
      </div>
      <p className="muted">{tr("HabitTracker.c614266dd0")}</p>
      {adding && (
        <form
          className="inline-form habit-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setHabits((p) => [
              ...p,
              {
                id: newId(),
                name: name.trim(),
                streak: 0,
                history: [],
              },
            ]);
            setName("");
            setAdding(false);
          }}
        >
          <input
            autoFocus
            aria-label={tr("HabitTracker.a0a2ed81b2")}
            maxLength={100}
            placeholder={tr("HabitTracker.d4b9541d8b")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="icon-button" aria-label={tr("HabitTracker.fe50ab732d")}>
            <Check size={17} />
          </button>
        </form>
      )}
      {habits.length ? (
        <div className="habit-list">
          {habits.map((h) => (
            <div className="habit-item" key={h.id}>
              <div className="habit-title">
                <strong>{h.name}</strong>
                <span>
                  <Flame size={12} /> {habitStreak(h.history)} {tr("HabitTracker.cb3ee4ef47")}</span>
                <button
                  className="icon-button danger"
                  aria-label={tr("HabitTracker.c60bb4e73a", { v0: h.name })}
                  onClick={() => {
                    setHabits((p) => p.filter((item) => item.id !== h.id));
                    notify(tr("HabitTracker.b640ddce74"), () =>
                      setHabits((p) =>
                        p.some((item) => item.id === h.id) ? p : [...p, h],
                      ),
                    );
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="habit-days">
                {days.map((day) => {
                  const done = h.history.includes(day.date);
                  return (
                    <div key={day.date}>
                      <span>{day.label}</span>
                      {day.date === today ? (
                        <button
                          aria-label={tr("HabitTracker.b39be76255", { v0: done ? tr("HabitTracker.4a68467da3") : tr("HabitTracker.8975618f2a"), v1: h.name })}
                          aria-pressed={done}
                          className={done ? "habit-done" : "habit-today"}
                          onClick={() =>
                            setHabits((p) =>
                              p.map((item) => {
                                if (item.id !== h.id) return item;
                                const history = done
                                  ? item.history.filter((d) => d !== today)
                                  : [...item.history, today];
                                return {
                                  ...item,
                                  history,
                                  streak: habitStreak(history),
                                };
                              }),
                            )
                          }
                        >
                          {done ? <Check size={14} /> : day.day}
                        </button>
                      ) : (
                        <span
                          className={`habit-day ${done ? "habit-done" : ""}`}
                          title={`${day.date}: ${done ? tr("HabitTracker.856641d2b3") : tr("HabitTracker.4bd4c1909b")}`}
                        >
                          {done ? <Check size={14} /> : day.day}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state small-empty">
          <Leaf size={25} strokeWidth={1.3} />
          <span>{tr("HabitTracker.5b6f9b17a6")}</span>
          <button className="text-button" onClick={() => setAdding(true)}>
            {tr("HabitTracker.650b44149c")}<Plus size={13} />
          </button>
        </div>
      )}
    </section>
  );
}
