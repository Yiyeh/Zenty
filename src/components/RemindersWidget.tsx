import { newId } from "../lib/id";
import { APP_NAME } from "../lib/brand";
import { useMemo, useState } from "react";
import {
  AlarmClock,
  Plus,
  Bell,
  BellOff,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
import { localDate } from "../lib/dashboard";
import {
  buildReminderPlan,
  nextReminderOccurrence,
  validReminder,
  type Reminder,
} from "../lib/reminders";
import { Dialog } from "./Dialog";
import { ReminderAdvance } from "./ReminderAdvance";
const repeatLabels = {
  once: "Una vez",
  daily: "Cada día",
  weekdays: "Lunes a viernes",
  weekly: "Cada semana",
};
function freshReminder(): Reminder {
  const date = new Date(Date.now() + 30 * 60000);
  return {
    id: newId(),
    title: "",
    date: localDate(date),
    time: date.toTimeString().slice(0, 5),
    repeat: "once",
    advance: 0,
    enabled: true,
    sound: true,
  };
}
export function RemindersWidget() {
  const {
    reminders,
    setReminders,
    tasks,
    timeBlocks,
    settings,
    setSettings,
    notify,
  } = useDashboard();
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [testing, setTesting] = useState(false);
  const [all, setAll] = useState(false);
  const plan = useMemo(
    () => buildReminderPlan({ reminders, tasks, timeBlocks, settings }),
    [reminders, tasks, timeBlocks, settings],
  );
  const entries = plan.entries
    .map((entry) => ({
      entry,
      next:
        nextReminderOccurrence(entry) ||
        nextReminderOccurrence({ ...entry, advance: 0 }),
      alarm: entry.id.startsWith("alarm:"),
    }))
    .sort(
      (a, b) => (a.next?.fireAt ?? Infinity) - (b.next?.fireAt ?? Infinity),
    );
  const test = async () => {
    setTesting(true);
    setStatus("");
    try {
      const native = window.zentyDesktop?.reminders;
      if (native) {
        const result = await native.test();
        setStatus(
          result.ok
            ? "Aviso enviado a las notificaciones de Windows."
            : result.error || "Windows no pudo mostrar el aviso.",
        );
      } else if ("Notification" in window) {
        const permission =
          Notification.permission === "default"
            ? await Notification.requestPermission()
            : Notification.permission;
        if (permission === "granted") {
          new Notification(APP_NAME, {
            body: "Los recordatorios están listos.",
          });
          setStatus("Avisos de escritorio activados para esta página.");
        } else
          setStatus(
            `El navegador bloquea los avisos. Puedes habilitarlos en los permisos de este sitio. Seguirás viendo avisos dentro de ${APP_NAME}.`,
          );
      } else
        setStatus(`Este navegador permite solo avisos dentro de ${APP_NAME}.`);
    } catch {
      setStatus("No se pudo mostrar la notificación de prueba.");
    } finally {
      setTesting(false);
    }
  };
  return (
    <section
      className="glass-panel reminders-card"
      aria-label="Alarmas y recordatorios"
    >
      <div className="widget-heading">
        <h3>
          <AlarmClock size={17} /> Alarmas y avisos
        </h3>
        <button
          className="icon-button"
          aria-label="Crear alarma"
          onClick={() => {
            setEditing(freshReminder());
            setError("");
          }}
        >
          <Plus size={18} />
        </button>
      </div>
      <div className="reminders-status">
        <label className="check-label">
          <input
            type="checkbox"
            checked={settings.remindersEnabled}
            onChange={(event) =>
              setSettings((previous) => ({
                ...previous,
                remindersEnabled: event.target.checked,
              }))
            }
          />
          {settings.remindersEnabled ? "Avisos activados" : "Avisos pausados"}
        </label>
        <button
          className="text-button"
          disabled={testing}
          onClick={() => void test()}
        >
          <Bell size={14} />
          {testing
            ? "Enviando…"
            : window.zentyDesktop
              ? "Probar aviso"
              : "Permitir y probar"}
        </button>
      </div>
      {status && (
        <p className="music-hint" role="status">
          {status}
        </p>
      )}
      <p className="reminders-description">
        Alarmas, tareas con hora y eventos con antelación, en un lugar.
      </p>
      {!settings.remindersEnabled && (
        <p className="reminders-paused" role="status">
          <BellOff size={15} /> No se enviarán avisos hasta que los actives.
        </p>
      )}
      {entries.length ? (
        <ul className="reminders-list">
          {entries
            .slice(0, all ? entries.length : 5)
            .map(({ entry, next, alarm }) => (
              <li
                key={entry.id}
                className={!entry.enabled ? "reminder-disabled" : ""}
              >
                <div className="reminder-time">
                  <strong>{entry.time}</strong>
                  <small>
                    {alarm
                      ? repeatLabels[entry.repeat]
                      : entry.id.startsWith("task:")
                        ? "Tarea"
                        : "Agenda"}
                  </small>
                </div>
                <div className="reminder-main">
                  <strong>{entry.title}</strong>
                  <small>
                    {next
                      ? new Date(next.at).toLocaleDateString("es-CL", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })
                      : entry.enabled
                        ? "Finalizada"
                        : "Pausada"}
                    {entry.advance
                      ? ` · aviso ${entry.advance} min antes`
                      : " · a la hora"}
                  </small>
                </div>
                {alarm && (
                  <div className="reminder-actions">
                    <button
                      className="icon-button"
                      aria-label={`${entry.enabled ? "Pausar" : "Activar"} alarma ${entry.title}`}
                      aria-pressed={entry.enabled}
                      onClick={() =>
                        setReminders((previous) =>
                          previous.map((item) =>
                            `alarm:${item.id}` === entry.id
                              ? { ...item, enabled: !item.enabled }
                              : item,
                          ),
                        )
                      }
                    >
                      {entry.enabled ? (
                        <Bell size={14} />
                      ) : (
                        <BellOff size={14} />
                      )}
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Editar alarma ${entry.title}`}
                      onClick={() => {
                        setEditing(
                          reminders.find(
                            (item) => `alarm:${item.id}` === entry.id,
                          ) || null,
                        );
                        setError("");
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Quitar alarma ${entry.title}`}
                      onClick={() => {
                        const removed = reminders.find(
                          (item) => `alarm:${item.id}` === entry.id,
                        );
                        setReminders((previous) =>
                          previous.filter(
                            (item) => `alarm:${item.id}` !== entry.id,
                          ),
                        );
                        if (removed)
                          notify("Alarma eliminada.", () =>
                            setReminders((previous) =>
                              previous.some((item) => item.id === removed.id)
                                ? previous
                                : [...previous, removed],
                            ),
                          );
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </li>
            ))}
        </ul>
      ) : (
        <div className="reminders-empty">
          <AlarmClock size={28} />
          <p>Aquí aparecerán tus próximos avisos.</p>
          <button
            className="secondary-button"
            onClick={() => {
              setEditing(freshReminder());
              setError("");
            }}
          >
            <Plus size={15} />
            Crear mi primera alarma
          </button>
        </div>
      )}
      {entries.length > 5 && (
        <button
          className="text-button"
          onClick={() => setAll((value) => !value)}
        >
          {all ? "Ver menos" : `Ver todos (${entries.length})`}
        </button>
      )}
      <p className="reminders-footnote">
        {window.zentyDesktop
          ? `Los avisos funcionan con ${APP_NAME} abierto o minimizado. Si lo cierras por completo, se detienen.`
          : "Mantén esta página abierta. El navegador puede retrasar los avisos en segundo plano."}
      </p>
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={
          editing && reminders.some((item) => item.id === editing.id)
            ? "Editar alarma"
            : "Nueva alarma"
        }
        description="Elige cuándo quieres recibir el aviso."
      >
        {editing && (
          <form
            className="dialog-body form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (!validReminder(editing)) {
                setError("Completa el nombre, la fecha y una hora válida.");
                return;
              }
              if (
                editing.repeat === "once" &&
                new Date(`${editing.date}T${editing.time}`).getTime() <=
                  Date.now()
              ) {
                setError("Elige una fecha y hora futuras.");
                return;
              }
              setReminders((previous) =>
                previous.some((item) => item.id === editing.id)
                  ? previous.map((item) =>
                      item.id === editing.id
                        ? { ...editing, title: editing.title.trim() }
                        : item,
                    )
                  : [...previous, { ...editing, title: editing.title.trim() }],
              );
              setEditing(null);
              notify("Alarma guardada.");
            }}
          >
            <label>
              Nombre
              <input
                autoFocus
                required
                maxLength={200}
                placeholder="Volver al trabajo, reunión, descanso…"
                value={editing.title}
                onChange={(event) =>
                  setEditing({ ...editing, title: event.target.value })
                }
              />
            </label>
            <div className="form-row">
              <label>
                Fecha
                <input
                  required
                  type="date"
                  value={editing.date}
                  onChange={(event) =>
                    setEditing({ ...editing, date: event.target.value })
                  }
                />
              </label>
              <label>
                Hora
                <input
                  required
                  type="time"
                  value={editing.time}
                  onChange={(event) =>
                    setEditing({ ...editing, time: event.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Repetir
              <select
                value={editing.repeat}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    repeat: event.target.value as Reminder["repeat"],
                  })
                }
              >
                {Object.entries(repeatLabels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <ReminderAdvance
              value={editing.advance || undefined}
              onChange={(value) =>
                setEditing({ ...editing, advance: value ?? 0 })
              }
              label="Avisarme con antelación"
            />
            <label className="check-label">
              <input
                type="checkbox"
                checked={editing.sound}
                onChange={(event) =>
                  setEditing({ ...editing, sound: event.target.checked })
                }
              />
              Sonido de notificación
            </label>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditing(null)}
              >
                <X size={15} />
                Cancelar
              </button>
              <button className="primary-button" type="submit">
                <Check size={15} />
                Guardar alarma
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </section>
  );
}
