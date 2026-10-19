import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { tr } from "../lib/i18n.ts";
import { useState } from "react";
import { Play, Pause, RotateCcw, SkipForward, Bell, Timer } from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
import { useTimer } from "../context/TimerStore";
import type { TimerMode } from "../context/TimerStore";
const modes: Record<TimerMode, string> = {
  get work(){return tr("Pomodoro.02d6a8538e");},
  get shortBreak() { return tr("Pomodoro.980df6258c"); },
  get longBreak() { return tr("Pomodoro.6de3a433f7"); },
};
export function Pomodoro() {
  useInterfaceLocale();
  const { tasks, activeTaskId, setActiveTaskId, notify } = useDashboard();
  const timer = useTimer();
  const sessionStarted = !!timer.endAt || timer.remaining !== timer.duration;
  const [notifications, setNotifications] = useState(
    "Notification" in window && Notification.permission === "granted",
  );
  const progress = 1 - timer.remaining / timer.duration;
  return (
    <section
      className="glass-panel timer-card"
      aria-label={tr("Pomodoro.e4e70c2d10")}
    >
      <div className="widget-heading">
        <h3>
          <Timer size={17} /> {tr("Pomodoro.847cf4178f")}</h3>
        <button
          className="icon-button"
          aria-label={tr("Pomodoro.7d5b1a5b5c")}
          aria-pressed={notifications}
          onClick={async () => {
            if (!("Notification" in window)) {
              notify(tr("Pomodoro.adbc8929f2"));
              return;
            }
            const result = await Notification.requestPermission();
            setNotifications(result === "granted");
            notify(
              result === "granted"
                ? "Notificaciones activadas."
                : tr("Pomodoro.613e5a7fae"),
            );
          }}
        >
          <Bell size={15} />
        </button>
      </div>
      <div className="segmented">
        {(Object.keys(modes) as TimerMode[]).map((mode) => (
          <button
            key={mode}
            aria-pressed={timer.mode === mode}
            onClick={() => timer.changeMode(mode)}
          >
            {modes[mode]}
          </button>
        ))}
      </div>
      <div className="timer-circle">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="88" className="timer-track" />
          <circle
            cx="100"
            cy="100"
            r="88"
            className="timer-progress"
            strokeDasharray={553}
            strokeDashoffset={553 * progress}
          />
        </svg>
        <div>
          <span className="timer-digits" role="timer">
            {String(Math.floor(timer.remaining / 60)).padStart(2, "0")}
            <span>:</span>
            {String(timer.remaining % 60).padStart(2, "0")}
          </span>
          <span className="eyebrow">
            {timer.endAt
              ? tr("Pomodoro.c9a5488346")
              : tr("Pomodoro.e653fa55cf")}
          </span>
        </div>
      </div>
      <div className="timer-controls">
        <button
          className="icon-button"
          onClick={timer.reset}
          aria-label={tr("Pomodoro.1c0c0ed467")}
        >
          <RotateCcw size={17} />
        </button>
        <button className="primary-button" onClick={timer.toggle}>
          {timer.endAt ? (
            <Pause size={16} />
          ) : (
            <Play size={16} fill="currentColor" />
          )}
          {timer.endAt ? tr("Pomodoro.67fc6bf00d") : tr("Pomodoro.aba1037440")}
        </button>
        <button
          className="icon-button"
          onClick={timer.skip}
          aria-label={tr("Pomodoro.7fb3eda183")}
        >
          <SkipForward size={17} />
        </button>
      </div>
      <label className="timer-task">
        <span className="eyebrow">{tr("Pomodoro.b0304edfac")}</span>
        <select
          aria-label={tr("Pomodoro.1fe95042bf")}
          disabled={sessionStarted}
          value={(sessionStarted ? timer.taskId : activeTaskId) || ""}
          onChange={(e) => setActiveTaskId(e.target.value || null)}
        >
          <option value="">{tr("Pomodoro.dea1691dcb")}</option>
          {tasks
            .filter((t) => !t.completed)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
        </select>
      </label>
    </section>
  );
}
