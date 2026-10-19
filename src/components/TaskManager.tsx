import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { tr, getFormatLocale } from "../lib/i18n.ts";
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
  useInterfaceLocale();
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
    notify(tr("TaskManager.3959c2046e"), () =>
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
    <section className="glass-panel tasks-card" aria-label={tr("TaskManager.11327f271b")}>
      <div className="widget-heading">
        <h3>
          <ListTodo size={17} /> {tr("TaskManager.7fee2a6035")}</h3>
        <span className="count-badge">{pending} {tr("TaskManager.ba9357fd25")}</span>
      </div>
      <div className="task-tabs">
        {(
          [
            { id: "pending", label: tr("TaskManager.bb6e430ce0") },
            {
              id: "done",
              label: `Completadas${completed ? ` · ${completed}` : ""}`,
            },
            { id: "all", label: tr("TaskManager.aff4d19d6e") },
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
            setScheduleError(tr("TaskManager.3f4d83dc62"));
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
            aria-label={tr("TaskManager.28acc44bc7")}
            maxLength={300}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={tr("TaskManager.6824dbafd5")}
          />
          <button
            className="add-task-button"
            aria-label={tr("TaskManager.04261cef7e")}
            disabled={!title.trim()}
          >
            <Plus size={18} />
          </button>
        </div>
        <details>
          <summary>{tr("TaskManager.d84234c628")}</summary>
          <div className="form-row">
            <select
              aria-label={tr("TaskManager.cabe0ca889")}
              value={priority}
              onChange={(e) => setPriority(e.target.value as Task["priority"])}
            >
              <option value="low">{tr("TaskManager.7a7c06f556")}</option>
              <option value="medium">{tr("TaskManager.20e6f9f3e4")}</option>
              <option value="high">{tr("TaskManager.a2bceccc02")}</option>
            </select>
            <input
              aria-label={tr("TaskManager.314bed12d5")}
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
          <label>
            {tr("TaskManager.a1b5a1f175")}<input
              type="time"
              aria-label={tr("TaskManager.aabff8a89a")}
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
            label={tr("TaskManager.d1e1b81adb")}
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
                ? tr("TaskManager.84ca279491")
                : tr("TaskManager.ca068d70b3")}
            </h4>
            <p>
              {filter === "done"
                ? tr("TaskManager.c60f097d10")
                : tr("TaskManager.67e6647782")}
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
                  aria-label={`${task.completed ? tr("TaskManager.c94c654ba7") : tr("TaskManager.8975618f2a")}: ${task.title}`}
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
                          ? tr("TaskManager.237c04e110", { v0: task.reminderMinutes })
                          : ""}
                      </span>
                    )}
                    <span
                      className={`priority-label priority-${task.priority}`}
                    >
                      <i />
                      {task.priority === "high"
                        ? tr("TaskManager.42719229fd")
                        : task.priority === "medium"
                          ? tr("TaskManager.d357175cfe")
                          : tr("TaskManager.0b6af7d377")}
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
                          ? tr("TaskManager.e9f5a45cb3")
                          : ""}
                        {new Date(
                          `${task.dueDate}T12:00:00`,
                        ).toLocaleDateString(getFormatLocale(), {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    )}
                    {task.subtasks.length > 0 && (
                      <span>
                        {task.subtasks.filter((s) => s.completed).length}/
                        {task.subtasks.length} {tr("TaskManager.5d5a292b63")}</span>
                    )}
                    {task.pomodoros > 0 && (
                      <span>{task.pomodoros} {tr("TaskManager.44b235acef")}</span>
                    )}
                  </div>
                </div>
                <div className="task-actions">
                  <button
                    className="icon-button"
                    aria-expanded={expanded === task.id}
                    aria-label={tr("a11y.TaskManager.285", { v0: task.title })}
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
                    aria-label={tr("a11y.TaskManager.299", { v0: task.title })}
                    onClick={() => remove(task)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {expanded === task.id && (
                <div className="task-details form-stack">
                  <label>
                    {tr("TaskManager.1ed9faaba9")}<input
                      aria-label={tr("a11y.TaskManager.310", { v0: task.title })}
                      value={task.title}
                      maxLength={300}
                      onChange={(e) =>
                        update(task.id, { title: e.target.value })
                      }
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      {tr("TaskManager.dbae0b2a1a")}<select
                        value={task.priority}
                        onChange={(e) =>
                          update(task.id, {
                            priority: e.target.value as Task["priority"],
                          })
                        }
                      >
                        <option value="low">{tr("TaskManager.0b6af7d377")}</option>
                        <option value="medium">{tr("TaskManager.d357175cfe")}</option>
                        <option value="high">{tr("TaskManager.42719229fd")}</option>
                      </select>
                    </label>
                    <label>
                      {tr("TaskManager.e1e71c5243")}<input
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
                    {tr("TaskManager.503f312cde")}<input
                      type="time"
                      aria-label={tr("a11y.TaskManager.351", { v0: task.title })}
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
                    label={tr("interface.TaskManager.22402bbba9", { v0: task.title })}
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
                        ? tr("TaskManager.6d7fb9ef68")
                        : tr("TaskManager.885aa11cd9")}
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
                        aria-label={tr("a11y.TaskManager.418", { v0: s.title })}
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
                      aria-label={tr("TaskManager.0972e89182")}
                      placeholder={tr("TaskManager.7170b7d704")}
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
                      aria-label={tr("TaskManager.17f1ea14b9")}
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
          {completed} {tr("TaskManager.553c27d45c")}{tasks.length} {tr("TaskManager.80d2fd4779")}</span>
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
