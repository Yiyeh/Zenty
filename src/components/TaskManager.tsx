import { newId } from "../lib/id";
import { ReminderAdvance } from "./ReminderAdvance";
import { useState } from "react";
import {
  Plus,
  Trash2,
  Check,
  Circle,
  ChevronDown,
  ChevronUp,
  ListTodo,
  Target,
  CalendarDays,
  ArrowRight,
} from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
import type { Task } from "../lib/dashboard";
import { localDate } from "../lib/dashboard";
export function TaskManager() {
  const { tasks, setTasks, activeTaskId, setActiveTaskId, notify } =
    useDashboard();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [due, setDue] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [reminderMinutes, setReminderMinutes] = useState<number | undefined>(
    undefined,
  );
  const [scheduleError, setScheduleError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [subtask, setSubtask] = useState("");
  const [filter, setFilter] = useState<"pending" | "all" | "done">("pending");
  const pending = tasks.filter((t) => !t.completed).length;
  const completed = tasks.length - pending;
  const update = (id: string, patch: Partial<Task>) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const remove = (task: Task) => {
    const index = tasks.findIndex((t) => t.id === task.id);
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    if (activeTaskId === task.id) setActiveTaskId(null);
    notify("Tarea eliminada.", () =>
      setTasks((prev) => {
        const next = prev.filter((t) => t.id !== task.id);
        next.splice(index, 0, task);
        return next;
      }),
    );
  };
  const addSubtask = (task: Task) => {
    if (!subtask.trim()) return;
    update(task.id, {
      subtasks: [
        ...task.subtasks,
        { id: newId(), title: subtask.trim(), completed: false },
      ],
    });
    setSubtask("");
  };
  const visible = tasks.filter(
    (t) => filter === "all" || (filter === "done" ? t.completed : !t.completed),
  );
  return (
    <section className="glass-panel tasks-card" aria-label="Tareas y objetivos">
      <div className="widget-heading">
        <h3>
          <ListTodo size={17} /> Un paso a la vez
        </h3>
        <span className="count-badge">{pending} pendientes</span>
      </div>
      <div className="task-tabs">
        {(
          [
            { id: "pending", label: "Pendientes" },
            {
              id: "done",
              label: `Completadas${completed ? ` · ${completed}` : ""}`,
            },
            { id: "all", label: "Todas" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            aria-pressed={filter === tab.id}
            onClick={() => setFilter(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <form
        className="task-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          if (reminderMinutes !== undefined && (!due || !dueTime)) {
            setScheduleError("Elige una fecha y hora para el aviso.");
            return;
          }
          setScheduleError("");
          setTasks((prev) => [
            {
              id: newId(),
              title: title.trim(),
              priority,
              completed: false,
              dueDate: due || undefined,
              dueTime: dueTime || undefined,
              reminderMinutes,
              subtasks: [],
              pomodoros: 0,
            },
            ...prev,
          ]);
          setTitle("");
          setDue("");
          setDueTime("");
          setReminderMinutes(undefined);
          setPriority("medium");
          setFilter("pending");
        }}
      >
        <div className="inline-form">
          <input
            aria-label="Nueva tarea"
            maxLength={300}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="¿Qué quieres lograr hoy?"
          />
          <button
            className="add-task-button"
            aria-label="Añadir tarea"
            disabled={!title.trim()}
          >
            <Plus size={18} />
          </button>
        </div>
        <details>
          <summary>Prioridad, fecha y recordatorio</summary>
          <div className="form-row">
            <select
              aria-label="Prioridad de la nueva tarea"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Task["priority"])}
            >
              <option value="low">Prioridad baja</option>
              <option value="medium">Prioridad media</option>
              <option value="high">Prioridad alta</option>
            </select>
            <input
              aria-label="Fecha límite de la nueva tarea"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
          <label>
            Hora de la tarea
            <input
              type="time"
              aria-label="Hora de la nueva tarea"
              value={dueTime}
              onChange={(event) => setDueTime(event.target.value)}
            />
          </label>
          <ReminderAdvance
            value={reminderMinutes}
            onChange={(value) => {
              setReminderMinutes(value);
              if (value !== undefined) {
                const next = new Date(Date.now() + 30 * 60000);
                if (!due) setDue(localDate(next));
                if (!dueTime) setDueTime(next.toTimeString().slice(0, 5));
              }
            }}
            label="Aviso de la nueva tarea"
          />
        </details>
        {scheduleError && (
          <p className="error-message" role="alert">
            {scheduleError}
          </p>
        )}
      </form>
      <div className="task-list">
        {visible.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">
              <Check size={27} strokeWidth={1.3} />
            </span>
            <h4>
              {filter === "done"
                ? "Cada paso cuenta."
                : "Un poco de espacio mental."}
            </h4>
            <p>
              {filter === "done"
                ? "Tus tareas completadas aparecerán aquí."
                : "Anota lo importante. Lo demás puede esperar."}
            </p>
          </div>
        ) : (
          visible.map((task) => (
            <article
              className={`task-row ${task.completed ? "completed" : ""} ${activeTaskId === task.id ? "task-active" : ""}`}
              key={task.id}
            >
              <div className="task-main">
                <button
                  className={`task-check ${task.completed ? "checked" : ""}`}
                  aria-label={`${task.completed ? "Marcar pendiente" : "Completar"}: ${task.title}`}
                  aria-pressed={task.completed}
                  onClick={() => {
                    update(task.id, { completed: !task.completed });
                    if (!task.completed && activeTaskId === task.id)
                      setActiveTaskId(null);
                  }}
                >
                  {task.completed ? <Check size={13} /> : <Circle size={19} />}
                </button>
                <div className="task-content">
                  <button
                    className="task-title"
                    onClick={() => {
                      setExpanded(expanded === task.id ? null : task.id);
                      setSubtask("");
                    }}
                  >
                    {task.title}
                  </button>
                  <div className="task-meta">
                    {task.dueTime && (
                      <span>
                        {task.dueTime}
                        {task.reminderMinutes !== undefined
                          ? ` · aviso ${task.reminderMinutes} min antes`
                          : ""}
                      </span>
                    )}
                    <span
                      className={`priority-label priority-${task.priority}`}
                    >
                      <i />
                      {task.priority === "high"
                        ? "Alta"
                        : task.priority === "medium"
                          ? "Media"
                          : "Baja"}
                    </span>
                    {task.dueDate && (
                      <span
                        className={
                          task.dueDate < localDate() && !task.completed
                            ? "overdue"
                            : ""
                        }
                      >
                        <CalendarDays size={11} />
                        {task.dueDate < localDate() && !task.completed
                          ? "Vencida · "
                          : ""}
                        {new Date(
                          `${task.dueDate}T12:00:00`,
                        ).toLocaleDateString("es-CL", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    )}
                    {task.subtasks.length > 0 && (
                      <span>
                        {task.subtasks.filter((s) => s.completed).length}/
                        {task.subtasks.length} pasos
                      </span>
                    )}
                    {task.pomodoros > 0 && (
                      <span>{task.pomodoros} sesiones</span>
                    )}
                  </div>
                </div>
                <div className="task-actions">
                  <button
                    className="icon-button"
                    aria-expanded={expanded === task.id}
                    aria-label={`Detalles de ${task.title}`}
                    onClick={() => {
                      setExpanded(expanded === task.id ? null : task.id);
                      setSubtask("");
                    }}
                  >
                    {expanded === task.id ? (
                      <ChevronUp size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={`Eliminar tarea ${task.title}`}
                    onClick={() => remove(task)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {expanded === task.id && (
                <div className="task-details form-stack">
                  <label>
                    Nombre de la tarea
                    <input
                      aria-label={`Editar tarea ${task.title}`}
                      value={task.title}
                      maxLength={300}
                      onChange={(e) =>
                        update(task.id, { title: e.target.value })
                      }
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Prioridad
                      <select
                        value={task.priority}
                        onChange={(e) =>
                          update(task.id, {
                            priority: e.target.value as Task["priority"],
                          })
                        }
                      >
                        <option value="low">Baja</option>
                        <option value="medium">Media</option>
                        <option value="high">Alta</option>
                      </select>
                    </label>
                    <label>
                      Fecha límite
                      <input
                        type="date"
                        value={task.dueDate || ""}
                        onChange={(e) =>
                          update(task.id, {
                            dueDate: e.target.value || undefined,
                            reminderMinutes: e.target.value
                              ? task.reminderMinutes
                              : undefined,
                          })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Hora
                    <input
                      type="time"
                      aria-label={`Hora de ${task.title}`}
                      value={task.dueTime || ""}
                      onChange={(event) =>
                        update(task.id, {
                          dueTime: event.target.value || undefined,
                          reminderMinutes: event.target.value
                            ? task.reminderMinutes
                            : undefined,
                        })
                      }
                    />
                  </label>
                  <ReminderAdvance
                    value={task.reminderMinutes}
                    onChange={(value) => {
                      const next = new Date(Date.now() + 30 * 60000);
                      update(task.id, {
                        reminderMinutes: value,
                        ...(value !== undefined
                          ? {
                              dueDate: task.dueDate || localDate(next),
                              dueTime:
                                task.dueTime || next.toTimeString().slice(0, 5),
                            }
                          : {}),
                      });
                    }}
                    label={`Aviso de ${task.title}`}
                  />
                  {!task.completed && (
                    <button
                      className="text-button"
                      onClick={() =>
                        setActiveTaskId(
                          activeTaskId === task.id ? null : task.id,
                        )
                      }
                    >
                      <Target size={14} />
                      {activeTaskId === task.id
                        ? "Quitar del temporizador"
                        : "Enfocarme en esta tarea"}
                      <ArrowRight size={13} />
                    </button>
                  )}
                  {task.subtasks.map((s) => (
                    <div className="subtask" key={s.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={s.completed}
                          onChange={(e) =>
                            update(task.id, {
                              subtasks: task.subtasks.map((st) =>
                                st.id === s.id
                                  ? { ...st, completed: e.target.checked }
                                  : st,
                              ),
                            })
                          }
                        />
                        <span className={s.completed ? "line-through" : ""}>
                          {s.title}
                        </span>
                      </label>
                      <button
                        className="icon-button danger"
                        aria-label={`Eliminar subtarea ${s.title}`}
                        onClick={() =>
                          update(task.id, {
                            subtasks: task.subtasks.filter(
                              (st) => st.id !== s.id,
                            ),
                          })
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <div className="inline-form">
                    <input
                      aria-label="Nueva subtarea"
                      placeholder="Divídela en un paso pequeño…"
                      value={subtask}
                      onChange={(e) => setSubtask(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSubtask(task);
                        }
                      }}
                    />
                    <button
                      className="icon-button"
                      aria-label="Añadir subtarea"
                      onClick={() => addSubtask(task)}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))
        )}
      </div>
      <div className="widget-footnote">
        <span>
          {completed} de {tasks.length} completadas
        </span>
        <div className="mini-progress">
          <i
            style={{
              width: `${tasks.length ? (completed / tasks.length) * 100 : 0}%`,
            }}
          />
        </div>
      </div>
    </section>
  );
}
