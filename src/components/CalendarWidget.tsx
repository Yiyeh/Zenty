import { newId } from "../lib/id";
import { ReminderAdvance } from "./ReminderAdvance";
import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  Clock3,
  Trash2,
  ArrowUpRight,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
import { useIntegrations } from "../context/IntegrationsStore";
import { localDate } from "../lib/dashboard";
export function CalendarWidget({ onConnect }: { onConnect: () => void }) {
  const { timeBlocks, setTimeBlocks, settings, notify } = useDashboard();
  const i = useIntegrations();
  const [monthDate, setMonthDate] = useState(new Date());
  const [selected, setSelected] = useState(localDate());
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [error, setError] = useState("");
  const [reminderMinutes, setReminderMinutes] = useState<number | undefined>(
    undefined,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const today = localDate();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells = Array.from(
    { length: Math.ceil((offset + count) / 7) * 7 },
    (_, idx) => {
      const date = new Date(year, month, idx - offset + 1, 12);
      return {
        date: localDate(date),
        day: date.getDate(),
        outside: date.getMonth() !== month,
      };
    },
  );
  const blocks = timeBlocks
    .filter((b) => b.date === selected)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  return (
    <section className="glass-panel calendar-card">
      <div className="widget-heading">
        <h3>
          <CalendarDays size={17} /> Tu agenda
        </h3>
        <button
          className="text-button"
          onClick={() => {
            setMonthDate(new Date());
            setSelected(today);
          }}
        >
          Hoy
        </button>
      </div>
      <div className="calendar-month">
        <strong>
          {monthDate.toLocaleDateString("es-CL", {
            month: "long",
            year: "numeric",
          })}
        </strong>
        <div>
          <button
            className="icon-button"
            aria-label="Mes anterior"
            onClick={() => setMonthDate(new Date(year, month - 1, 1))}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Mes siguiente"
            onClick={() => setMonthDate(new Date(year, month + 1, 1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="calendar-weekdays">
        {["L", "M", "M", "J", "V", "S", "D"].map((day, idx) => (
          <span key={idx}>{day}</span>
        ))}
      </div>
      <div className="calendar-days">
        {cells.map((cell) => (
          <button
            key={cell.date}
            className={`${cell.outside ? "outside-month" : ""} ${cell.date === today ? "is-today" : ""} ${cell.date === selected ? "is-selected" : ""}`}
            aria-label={new Date(`${cell.date}T12:00:00`).toLocaleDateString(
              "es-CL",
              {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              },
            )}
            aria-pressed={cell.date === selected}
            onClick={() => {
              setSelected(cell.date);
              if (cell.outside) setMonthDate(new Date(`${cell.date}T12:00:00`));
            }}
          >
            {cell.day}
            {timeBlocks.some((b) => b.date === cell.date) && <i />}
          </button>
        ))}
      </div>
      <div className="agenda-heading">
        <span>
          {selected === today
            ? "HOY"
            : new Date(`${selected}T12:00:00`).toLocaleDateString("es-CL", {
                day: "numeric",
                month: "short",
              })}
        </span>
        <button
          className="icon-button"
          aria-label="Añadir evento personal"
          aria-expanded={adding}
          onClick={() => {
            setAdding(!adding);
            setEditingId(null);
            setTitle("");
            setReminderMinutes(undefined);
            setError("");
          }}
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="agenda-list">
        {blocks.length ? (
          blocks.map((block) => (
            <div className="agenda-item" key={block.id}>
              <span
                className="agenda-line"
                style={{ background: block.color }}
              />
              <div>
                <strong>{block.title}</strong>
                <small>
                  <Clock3 size={11} /> {block.startTime} – {block.endTime}
                  {block.reminderMinutes !== undefined
                    ? ` · aviso ${block.reminderMinutes} min antes`
                    : ""}
                </small>
              </div>
              <button
                className="icon-button"
                aria-label={`Editar evento ${block.title}`}
                onClick={() => {
                  setEditingId(block.id);
                  setTitle(block.title);
                  setStart(block.startTime);
                  setEnd(block.endTime);
                  setReminderMinutes(block.reminderMinutes);
                  setError("");
                  setAdding(true);
                }}
              >
                <Pencil size={13} />
              </button>
              <button
                className="icon-button danger"
                aria-label={`Eliminar evento ${block.title}`}
                onClick={() => {
                  setTimeBlocks((p) => p.filter((b) => b.id !== block.id));
                  notify("Evento eliminado.", () =>
                    setTimeBlocks((p) =>
                      p.some((b) => b.id === block.id) ? p : [...p, block],
                    ),
                  );
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        ) : (
          <div className="agenda-empty">
            <span className="agenda-empty-dot" />
            <div>
              Tu día tiene espacio.<small>Añade algo que valga la pena.</small>
            </div>
          </div>
        )}
      </div>
      {adding && (
        <form
          className="form-stack event-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim() || start >= end) {
              setError(
                "Añade un nombre y una hora de fin posterior al inicio.",
              );
              return;
            }
            if (
              blocks.some(
                (b) =>
                  b.id !== editingId && start < b.endTime && end > b.startTime,
              )
            ) {
              setError(
                "Este horario coincide con otro bloque personal. Elige un horario libre.",
              );
              return;
            }
            const next = {
              id: editingId || newId(),
              title: title.trim(),
              date: selected,
              startTime: start,
              endTime: end,
              color: settings.accentColor,
              reminderMinutes,
            };
            setTimeBlocks((previous) =>
              editingId
                ? previous.map((block) =>
                    block.id === editingId ? next : block,
                  )
                : [...previous, next],
            );
            setEditingId(null);
            setReminderMinutes(undefined);
            setTitle("");
            setAdding(false);
            setError("");
          }}
        >
          <input
            autoFocus
            required
            aria-label="Nombre del evento"
            maxLength={200}
            placeholder="¿Qué tienes en mente?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="form-row">
            <label>
              Desde
              <input
                type="time"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              Hasta
              <input
                type="time"
                required
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
          <ReminderAdvance
            value={reminderMinutes}
            onChange={setReminderMinutes}
            label="Aviso del evento"
          />
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button className="secondary-button">
            <Plus size={14} />{" "}
            {editingId ? "Guardar cambios" : "Añadir a mi agenda"}
          </button>
        </form>
      )}
      {i.googleConnected ? (
        <div className="google-agenda">
          <div className="agenda-heading">
            <span>GOOGLE · PRÓXIMOS 7 DÍAS</span>
            <button
              className="icon-button"
              disabled={i.googleBusy}
              aria-label="Actualizar eventos de Google"
              onClick={() => void i.refreshCalendar()}
            >
              <RefreshCw size={13} />
            </button>
          </div>
          {i.googleBusy && (
            <p className="muted" role="status">
              Actualizando agenda…
            </p>
          )}
          {i.googleError && (
            <p className="error-message" role="alert">
              {i.googleError}
            </p>
          )}
          {i.events.slice(0, 6).map((event) => (
            <a
              className="google-event"
              key={event.id}
              href={event.url || "https://calendar.google.com/"}
              target="_blank"
              rel="noreferrer"
            >
              <span>
                {event.allDay
                  ? new Date(`${event.start}T12:00:00`).toLocaleDateString(
                      "es-CL",
                      { day: "numeric", month: "short" },
                    )
                  : new Date(event.start).toLocaleDateString("es-CL", {
                      day: "numeric",
                      month: "short",
                    })}
                <small>
                  {event.allDay
                    ? "Todo el día"
                    : new Date(event.start).toLocaleTimeString("es-CL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                </small>
              </span>
              <strong>{event.title}</strong>
              <ArrowUpRight size={13} />
            </a>
          ))}
          {!i.events.length && !i.googleBusy && !i.googleError && (
            <p className="muted">No hay próximos eventos.</p>
          )}
        </div>
      ) : (
        <button className="calendar-connect" onClick={onConnect}>
          <span className="google-g">G</span>
          <span>Conectar Google Calendar</span>
          <ArrowUpRight size={13} />
        </button>
      )}
    </section>
  );
}
