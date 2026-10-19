import { newId } from "../lib/id";
import { useState } from "react";
import { Plus, Trash2, Check, Leaf, Flame } from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
import { habitStreak, localDate } from "../lib/dashboard";
export function HabitTracker() {
  const { habits, setHabits, notify } = useDashboard();
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const today = localDate();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      date: localDate(d),
      label: d.toLocaleDateString("es-CL", { weekday: "narrow" }),
      day: d.getDate(),
    };
  });
  return (
    <section className="glass-panel habits-card">
      <div className="widget-heading">
        <h3>
          <Leaf size={17} /> Pequeños rituales
        </h3>
        <button
          className="icon-button"
          aria-label="Crear hábito"
          onClick={() => setAdding(!adding)}
        >
          <Plus size={17} />
        </button>
      </div>
      <p className="muted">La constancia se construye de a poco.</p>
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
            aria-label="Nombre del nuevo hábito"
            maxLength={100}
            placeholder="Leer, caminar, tomar agua…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="icon-button" aria-label="Guardar hábito">
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
                  <Flame size={12} /> {habitStreak(h.history)} días
                </span>
                <button
                  className="icon-button danger"
                  aria-label={`Eliminar hábito ${h.name}`}
                  onClick={() => {
                    setHabits((p) => p.filter((item) => item.id !== h.id));
                    notify("Hábito eliminado.", () =>
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
                          aria-label={`${done ? "Desmarcar" : "Completar"} ${h.name} hoy`}
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
                          title={`${day.date}: ${done ? "Completado" : "Sin registrar"}`}
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
          <span>Un hábito pequeño. Un cambio que crece.</span>
          <button className="text-button" onClick={() => setAdding(true)}>
            Crear mi primer hábito <Plus size={13} />
          </button>
        </div>
      )}
    </section>
  );
}
