import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { translateMessage, tr, getFormatLocale } from "../lib/i18n.ts";
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
  get once() { return tr("RemindersWidget.1edf08bca5"); },
  get daily() { return tr("RemindersWidget.102a46cd79"); },
  get weekdays() { return tr("RemindersWidget.7d4a3c148a"); },
  get weekly() { return tr("RemindersWidget.81df48e603"); },
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
  useInterfaceLocale();
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
            ? tr("RemindersWidget.5d72b6b056")
            : result.error || tr("RemindersWidget.29ff8a87d8"),
        );
      } else if ("Notification" in window) {
        const permission =
          Notification.permission === "default"
            ? await Notification.requestPermission()
            : Notification.permission;
        if (permission === "granted") {
          new Notification(APP_NAME, {
            body: tr("RemindersWidget.b2f4c39c63"),
          });
          setStatus(tr("RemindersWidget.7a19a45409"));
        } else
          setStatus(
            tr("RemindersWidget.8f9fba9865", { v0: APP_NAME }),
          );
      } else
        setStatus(tr("RemindersWidget.d2892d081b", { v0: APP_NAME }));
    } catch {
      setStatus(tr("RemindersWidget.048db8900b"));
    } finally {
      setTesting(false);
    }
  };
  return (
    <section
      className="glass-panel reminders-card"
      aria-label={tr("RemindersWidget.f87b3dca0a")}
    >
      <div className="widget-heading">
        <h3>
          <AlarmClock size={17} /> {tr("RemindersWidget.b6de969828")}</h3>
        <button
          className="icon-button"
          aria-label={tr("RemindersWidget.89e6b95fa8")}
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
          {settings.remindersEnabled ? tr("RemindersWidget.0f6aa1f81c") : tr("RemindersWidget.4fb8bda02c")}
        </label>
        <button
          className="text-button"
          disabled={testing}
          onClick={() => void test()}
        >
          <Bell size={14} />
          {testing
            ? tr("RemindersWidget.9415ac2416")
            : window.zentyDesktop
              ? tr("RemindersWidget.1f800baa0d")
              : tr("RemindersWidget.b97d220612")}
        </button>
      </div>
      {status && (
        <p className="music-hint" role="status">
          {status}
        </p>
      )}
      <p className="reminders-description">
        {tr("RemindersWidget.ff44bd400c")}</p>
      {!settings.remindersEnabled && (
        <p className="reminders-paused" role="status">
          <BellOff size={15} /> {tr("RemindersWidget.e937a91da9")}</p>
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
                        ? tr("RemindersWidget.981fc146f0")
                        : tr("RemindersWidget.0fdf485f5b")}
                  </small>
                </div>
                <div className="reminder-main">
                  <strong>{entry.title}</strong>
                  <small>
                    {next
                      ? new Date(next.at).toLocaleDateString(getFormatLocale(), {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })
                      : entry.enabled
                        ? tr("RemindersWidget.636c7b850c")
                        : tr("RemindersWidget.2c762c7006")}
                    {entry.advance
                      ? tr("RemindersWidget.237c04e110", { v0: entry.advance })
                      : tr("RemindersWidget.85dcc78d4c")}
                  </small>
                </div>
                {alarm && (
                  <div className="reminder-actions">
                    <button
                      className="icon-button"
                      aria-label={tr("a11y.RemindersWidget.207", { v0: entry.enabled ? tr("RemindersWidget.cd25ee5b1d") : tr("RemindersWidget.8e38c2571d"), v1: entry.title })}
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
                      aria-label={tr("a11y.RemindersWidget.227", { v0: entry.title })}
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
                      aria-label={tr("RemindersWidget.f9f315d28d", { v0: entry.title })}
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
                          notify(tr("RemindersWidget.5200e5af01"), () =>
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
          <p>{tr("RemindersWidget.a3d630b16e")}</p>
          <button
            className="secondary-button"
            onClick={() => {
              setEditing(freshReminder());
              setError("");
            }}
          >
            <Plus size={15} />
            {tr("RemindersWidget.08c01f02e6")}</button>
        </div>
      )}
      {entries.length > 5 && (
        <button
          className="text-button"
          onClick={() => setAll((value) => !value)}
        >
          {all ? tr("RemindersWidget.8e38161a1c") : tr("RemindersWidget.5cadf16c1a", { v0: entries.length })}
        </button>
      )}
      <p className="reminders-footnote">
        {window.zentyDesktop
          ? tr("RemindersWidget.641709db41", { v0: APP_NAME })
          : tr("RemindersWidget.4976fc655b")}
      </p>
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={
          editing && reminders.some((item) => item.id === editing.id)
            ? tr("RemindersWidget.7dc4d5a2ad")
            : tr("RemindersWidget.812cc6f2b3")
        }
        description={tr("RemindersWidget.7567fa8aec")}
      >
        {editing && (
          <form
            className="dialog-body form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (!validReminder(editing)) {
                setError(tr("RemindersWidget.5cc581f4cd"));
                return;
              }
              if (
                editing.repeat === "once" &&
                new Date(`${editing.date}T${editing.time}`).getTime() <=
                  Date.now()
              ) {
                setError(tr("RemindersWidget.81a4c6752b"));
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
              notify(tr("RemindersWidget.a5ded97567"));
            }}
          >
            <label>
              {tr("RemindersWidget.562bb15757")}<input
                autoFocus
                required
                maxLength={200}
                placeholder={tr("RemindersWidget.119557cddb")}
                value={editing.title}
                onChange={(event) =>
                  setEditing({ ...editing, title: event.target.value })
                }
              />
            </label>
            <div className="form-row">
              <label>
                {tr("RemindersWidget.93b2a9ef78")}<input
                  required
                  type="date"
                  value={editing.date}
                  onChange={(event) =>
                    setEditing({ ...editing, date: event.target.value })
                  }
                />
              </label>
              <label>
                {tr("RemindersWidget.503f312cde")}<input
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
              {tr("RemindersWidget.91a7a94f21")}<select
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
              label={tr("RemindersWidget.2a1116073a")}
            />
            <label className="check-label">
              <input
                type="checkbox"
                checked={editing.sound}
                onChange={(event) =>
                  setEditing({ ...editing, sound: event.target.checked })
                }
              />
              {tr("RemindersWidget.fae15f2081")}</label>
            {error && (
              <p className="error-message" role="alert">
                {translateMessage(error)}
              </p>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditing(null)}
              >
                <X size={15} />
                {tr("RemindersWidget.bb9dbb406d")}</button>
              <button className="primary-button" type="submit">
                <Check size={15} />
                {tr("RemindersWidget.cf3ed3ab27")}</button>
            </div>
          </form>
        )}
      </Dialog>
    </section>
  );
}
