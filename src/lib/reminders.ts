import type { DashboardData } from "./dashboard.ts";
export interface Reminder {
  id: string;
  title: string;
  date: string;
  time: string;
  repeat: "once" | "daily" | "weekdays" | "weekly";
  advance: number;
  enabled: boolean;
  sound: boolean;
}
export interface ReminderPlan {
  enabled: boolean;
  entries: Reminder[];
}
export interface ReminderOccurrence {
  key: string;
  entry: Reminder;
  at: number;
  fireAt: number;
}
const dateLabel = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function validReminder(value: unknown): value is Reminder {
  if (!value || typeof value !== "object") return false;
  const item = value as Reminder;
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    item.id.length <= 180 &&
    typeof item.title === "string" &&
    item.title.trim().length > 0 &&
    item.title.length <= 300 &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
    dateLabel(new Date(`${item.date}T12:00:00`)) === item.date &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time) &&
    ["once", "daily", "weekdays", "weekly"].includes(item.repeat) &&
    Number.isInteger(item.advance) &&
    item.advance >= 0 &&
    item.advance <= 10080 &&
    typeof item.enabled === "boolean" &&
    typeof item.sound === "boolean"
  );
}
export function validateReminderPlan(value: unknown): ReminderPlan {
  const plan = value as ReminderPlan;
  if (
    !plan ||
    typeof plan.enabled !== "boolean" ||
    !Array.isArray(plan.entries) ||
    plan.entries.length > 1000 ||
    !plan.entries.every(validReminder) ||
    new Set(plan.entries.map((item) => item.id)).size !== plan.entries.length
  )
    throw new Error("Programación de avisos inválida.");
  return {
    enabled: plan.enabled,
    entries: plan.entries.map((item) => ({ ...item })),
  };
}
export function buildReminderPlan(
  data: Pick<DashboardData, "tasks" | "timeBlocks" | "reminders" | "settings">,
): ReminderPlan {
  const entries: Reminder[] = data.reminders.map((item) => ({
    ...item,
    id: `alarm:${item.id}`,
  }));
  for (const task of data.tasks)
    if (
      !task.completed &&
      task.dueDate &&
      task.dueTime &&
      typeof task.reminderMinutes === "number"
    )
      entries.push({
        id: `task:${task.id}`,
        title: task.title,
        date: task.dueDate,
        time: task.dueTime,
        repeat: "once",
        advance: task.reminderMinutes,
        enabled: true,
        sound: true,
      });
  for (const block of data.timeBlocks)
    if (typeof block.reminderMinutes === "number")
      entries.push({
        id: `event:${block.id}`,
        title: block.title,
        date: block.date,
        time: block.startTime,
        repeat: "once",
        advance: block.reminderMinutes,
        enabled: true,
        sound: true,
      });
  return {
    enabled: data.settings.remindersEnabled,
    entries: entries.filter(validReminder).slice(0, 1000),
  };
}
/** Local calendar arithmetic preserves the wall clock across daylight saving changes. */
export function nextReminderOccurrence(
  entry: Reminder,
  after = Date.now(),
): ReminderOccurrence | null {
  if (!entry.enabled || !validReminder(entry)) return null;
  const base = new Date(`${entry.date}T${entry.time}:00`);
  if (!Number.isFinite(base.getTime())) return null;
  const advance = entry.advance * 60000;
  if (entry.repeat === "once") {
    const fireAt = base.getTime() - advance;
    return fireAt >= after
      ? { key: `${entry.id}:${fireAt}`, entry, at: base.getTime(), fireAt }
      : null;
  }
  const reference = new Date(Math.max(base.getTime(), after + advance));
  const day = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
    12,
  );
  for (let index = 0; index < 15; index++, day.setDate(day.getDate() + 1)) {
    if (entry.repeat === "weekdays" && [0, 6].includes(day.getDay())) continue;
    if (entry.repeat === "weekly" && day.getDay() !== base.getDay()) continue;
    const date = dateLabel(day),
      at = new Date(`${date}T${entry.time}:00`).getTime(),
      fireAt = at - advance;
    if (at < base.getTime() || fireAt < after) continue;
    return { key: `${entry.id}:${fireAt}`, entry, at, fireAt };
  }
  return null;
}
export function reminderMessage(
  occurrence: ReminderOccurrence,
  now = Date.now(),
): string {
  const at = new Date(occurrence.at);
  const time = at.toLocaleString("es-CL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const remaining = Math.ceil((occurrence.at - now) / 60000);
  return `${occurrence.entry.title}\n${time}${remaining > 0 ? ` · en ${remaining} min` : " · ahora"}`;
}
export function createReminderEngine({
  notify,
  delivered: initial = {},
  save = async () => {},
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}: {
  notify: (occurrence: ReminderOccurrence) => Promise<void>;
  delivered?: Record<string, number>;
  save?: (delivered: Record<string, number>) => Promise<void>;
  now?: () => number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}) {
  let plan: ReminderPlan = { enabled: false, entries: [] };
  let timer: ReturnType<typeof setTimeout> | undefined,
    stopped = false;
  let flight = Promise.resolve();
  let delivered: Record<string, number> = Object.fromEntries(
    Object.entries(initial && typeof initial === "object" ? initial : {})
      .filter(([key, value]) => key.length < 250 && Number.isFinite(value))
      .slice(-2000),
  );
  function check() {
    flight = flight
      .catch(() => {})
      .then(async () => {
        clearTimer(timer);
        if (
          stopped ||
          !plan.enabled ||
          !plan.entries.some((entry) => entry.enabled)
        )
          return;
        const current = now();
        let next = current + 60000;
        for (const entry of plan.entries) {
          let occurrence = nextReminderOccurrence(entry, current - 15 * 60000);
          if (!occurrence || occurrence.fireAt > current) {
            const nextDue = nextReminderOccurrence(
              { ...entry, advance: 0 },
              current,
            );
            if (nextDue && nextDue.at - entry.advance * 60000 <= current) {
              const fireAt = nextDue.at - entry.advance * 60000;
              occurrence = {
                ...nextDue,
                entry,
                fireAt,
                key: `${entry.id}:${fireAt}`,
              };
            }
          }
          if (
            occurrence &&
            occurrence.fireAt <= current &&
            !Object.hasOwn(delivered, occurrence.key)
          ) {
            try {
              await notify(occurrence);
              delivered[occurrence.key] = current;
              await save(delivered);
            } catch {
              /* Retry on the next bounded tick. */
            }
          }
          const upcoming = nextReminderOccurrence(entry, current + 1);
          if (upcoming) next = Math.min(next, upcoming.fireAt);
        }
        delivered = Object.fromEntries(
          Object.entries(delivered)
            .filter(([, time]) => current - time < 30 * 86400000)
            .slice(-2000),
        );
        if (!stopped) {
          timer = setTimer(
            () => {
              void check();
            },
            Math.max(100, Math.min(60000, next - now())),
          );
          timer.unref?.();
        }
      });
    return flight;
  }
  return {
    sync(value: unknown) {
      plan = validateReminderPlan(value);
      return check();
    },
    check,
    stop() {
      stopped = true;
      clearTimer(timer);
    },
  };
}
