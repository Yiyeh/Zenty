import { useState } from "react";
import { Play, Pause, RotateCcw, SkipForward, Bell, Timer } from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
import { useTimer } from "../context/TimerStore";
import type { TimerMode } from "../context/TimerStore";
const modes: Record<TimerMode, string> = {
  work: "Enfoque",
  shortBreak: "Pausa corta",
  longBreak: "Pausa larga",
};
export function Pomodoro() {
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
      aria-label="Temporizador de enfoque"
    >
      <div className="widget-heading">
        <h3>
          <Timer size={17} /> Un momento de enfoque
        </h3>
        <button
          className="icon-button"
          aria-label="Activar notificaciones del temporizador"
          aria-pressed={notifications}
          onClick={async () => {
            if (!("Notification" in window)) {
              notify("Este navegador no admite notificaciones.");
              return;
            }
            const result = await Notification.requestPermission();
            setNotifications(result === "granted");
            notify(
              result === "granted"
                ? "Notificaciones activadas."
                : "Las notificaciones no están permitidas.",
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
              ? "A tu ritmo. Una cosa a la vez."
              : "Haz espacio para lo importante"}
          </span>
        </div>
      </div>
      <div className="timer-controls">
        <button
          className="icon-button"
          onClick={timer.reset}
          aria-label="Reiniciar temporizador"
        >
          <RotateCcw size={17} />
        </button>
        <button className="primary-button" onClick={timer.toggle}>
          {timer.endAt ? (
            <Pause size={16} />
          ) : (
            <Play size={16} fill="currentColor" />
          )}
          {timer.endAt ? "Pausar sesión" : "Comenzar sesión"}
        </button>
        <button
          className="icon-button"
          onClick={timer.skip}
          aria-label="Saltar sesión sin registrar minutos"
        >
          <SkipForward size={17} />
        </button>
      </div>
      <label className="timer-task">
        <span className="eyebrow">DEDICAR ESTA SESIÓN A</span>
        <select
          aria-label="Tarea de la sesión"
          disabled={sessionStarted}
          value={(sessionStarted ? timer.taskId : activeTaskId) || ""}
          onChange={(e) => setActiveTaskId(e.target.value || null)}
        >
          <option value="">Mi enfoque personal</option>
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
