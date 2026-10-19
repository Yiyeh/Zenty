import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReminderPlan,
  createReminderEngine,
  nextReminderOccurrence,
  validateReminderPlan,
  validReminder,
  type Reminder,
  type ReminderOccurrence,
} from "../src/lib/reminders.ts";
import { defaultData, parseBackup, localDate } from "../src/lib/dashboard.ts";
const alarm = (changes: Partial<Reminder> = {}): Reminder => ({
  id: "alarm-one",
  title: "Recordatorio",
  date: "2026-10-19",
  time: "10:00",
  repeat: "once",
  advance: 15,
  enabled: true,
  sound: true,
  ...changes,
});
const local = (value: string) => new Date(value).getTime();
test("avisos: fechas, recurrencias y antelación se calculan en hora local", () => {
  const once = nextReminderOccurrence(alarm(), local("2026-10-19T09:00"))!;
  assert.equal(once.fireAt, local("2026-10-19T09:45"));
  assert.equal(
    nextReminderOccurrence(alarm(), local("2026-10-19T10:01")),
    null,
  );
  const weekdays = nextReminderOccurrence(
    alarm({ repeat: "weekdays", date: "2026-10-16", advance: 0 }),
    local("2026-10-16T11:00"),
  )!;
  assert.equal(localDate(new Date(weekdays.at)), "2026-10-19");
  const weekly = nextReminderOccurrence(
    alarm({ repeat: "weekly", date: "2026-10-30", advance: 0 }),
    local("2026-10-30T11:00"),
  )!;
  assert.equal(localDate(new Date(weekly.at)), "2026-11-06");
  assert.equal(new Date(weekly.at).getHours(), 10);
  assert.equal(validReminder(alarm({ date: "2026-02-30" })), false);
  assert.equal(validReminder(alarm({ time: "25:00" })), false);
  assert.throws(() =>
    validateReminderPlan({ enabled: true, entries: [alarm(), alarm()] }),
  );
});
test("avisos: respaldo conserva alarmas y tareas con hora, y rechaza alarmas inválidas", () => {
  const data = structuredClone(defaultData);
  data.reminders = [alarm()];
  data.tasks = [
    {
      id: "t",
      title: "Tarea",
      priority: "medium",
      completed: false,
      subtasks: [],
      pomodoros: 0,
      dueDate: "2026-10-19",
      dueTime: "11:00",
      reminderMinutes: 5,
    },
  ];
  assert.deepEqual(parseBackup(JSON.stringify({ ...data, version: 2 })), data);
  const plan = buildReminderPlan(data);
  assert.equal(plan.entries.length, 2);
  data.tasks[0].completed = true;
  assert.equal(buildReminderPlan(data).entries.length, 1);
  data.reminders[0].advance = -1;
  assert.throws(() => parseBackup(JSON.stringify(data)));
});
test("avisos: se disparan una sola vez, sobreviven al reinicio y se cancelan al pausar", async (t) => {
  let time = local("2026-10-19T09:44");
  const fired: ReminderOccurrence[] = [];
  let saved: Record<string, number> = {};
  const engine = createReminderEngine({
    now: () => time,
    notify: async (item) => {
      fired.push(item);
    },
    save: async (delivered) => {
      saved = structuredClone(delivered);
    },
  });
  t.after(() => engine.stop());
  await engine.sync({ enabled: true, entries: [alarm()] });
  assert.equal(fired.length, 0);
  time = local("2026-10-19T09:45");
  await engine.check();
  await engine.check();
  assert.equal(fired.length, 1);
  engine.stop();
  const restarted = createReminderEngine({
    now: () => time,
    delivered: saved,
    notify: async (item) => {
      fired.push(item);
    },
  });
  t.after(() => restarted.stop());
  await restarted.sync({ enabled: true, entries: [alarm()] });
  assert.equal(fired.length, 1);
  await restarted.sync({ enabled: false, entries: [alarm({ id: "paused" })] });
  assert.equal(fired.length, 1);
  await restarted.sync({ enabled: true, entries: [] });
  time += 60000;
  await restarted.check();
  assert.equal(fired.length, 1);
});
test("avisos: recuperación tras suspensión, antelación pasada y recurrencia del día siguiente", async (t) => {
  let time = local("2026-10-19T09:50");
  const fired: ReminderOccurrence[] = [];
  const engine = createReminderEngine({
    now: () => time,
    notify: async (item) => {
      fired.push(item);
    },
  });
  t.after(() => engine.stop());
  await engine.sync({ enabled: true, entries: [alarm({ repeat: "daily" })] });
  assert.equal(fired.length, 1);
  time = local("2026-10-20T09:45");
  await engine.check();
  assert.equal(fired.length, 2);
  await engine.sync({
    enabled: true,
    entries: [alarm({ id: "expired", date: "2026-10-18" })],
  });
  assert.equal(fired.length, 2);
  await engine.sync({
    enabled: true,
    entries: [
      alarm({ id: "new", date: "2026-10-20", time: "10:30", advance: 120 }),
    ],
  });
  assert.equal(fired.length, 3);
  await engine.check();
  assert.equal(fired.length, 3);
});
