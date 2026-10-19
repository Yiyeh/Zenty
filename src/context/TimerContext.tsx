import { useLocale as useInterfaceLocale } from "./Locale.tsx";
import { tr } from "../lib/i18n.ts";
import { APP_NAME } from "../lib/brand.ts";
import { TimerContext } from "./TimerStore";
import type { TimerState, TimerMode } from "./TimerStore";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useDashboard } from "./DashboardStore";
export function TimerProvider({ children }: { children: ReactNode }) {
  useInterfaceLocale();
  const { settings, activeTaskId, addFocusMinutes, notify } = useDashboard();
  const durationFor = (mode: TimerMode) =>
    (mode === "work" ? settings.workMinutes : settings[mode]) * 60;
  const [timer, setTimer] = useState<TimerState>(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem("mia_timer") || "null");
      if (
        value &&
        ["work", "shortBreak", "longBreak"].includes(value.mode) &&
        Number.isFinite(value.remaining) &&
        value.remaining >= 0 &&
        value.remaining <= 10800 &&
        Number.isFinite(value.duration) &&
        value.duration > 0 &&
        value.duration <= 10800 &&
        (value.endAt === null || Number.isFinite(value.endAt))
      )
        return value;
    } catch {
      /* An expired session is safe to discard. */
    }
    return {
      mode: "work",
      remaining: durationFor("work"),
      duration: durationFor("work"),
      endAt: null,
      taskId: null,
    };
  });
  const live = useRef(timer);
  live.current = timer;
  const callbacks = useRef({ addFocusMinutes, notify, durationFor });
  callbacks.current = { addFocusMinutes, notify, durationFor };
  useEffect(() => {
    try {
      sessionStorage.setItem("mia_timer", JSON.stringify(timer));
    } catch {
      /* Timer still works in memory. */
    }
  }, [timer]);
  useEffect(() => {
    const tick = () => {
      const current = live.current;
      if (!current.endAt) return;
      const remaining = Math.max(
        0,
        Math.ceil((current.endAt - Date.now()) / 1000),
      );
      if (remaining > 0) {
        if (remaining !== current.remaining)
          setTimer({ ...current, remaining });
        return;
      }
      const nextMode = current.mode === "work" ? "shortBreak" : "work";
      const next: TimerState = {
        mode: nextMode,
        remaining: callbacks.current.durationFor(nextMode),
        duration: callbacks.current.durationFor(nextMode),
        endAt: null,
        taskId: null,
      };
      live.current = next;
      setTimer(next);
      if (current.mode === "work")
        callbacks.current.addFocusMinutes(
          current.duration / 60,
          current.taskId,
        );
      const message =
        current.mode === "work"
          ? tr("TimerContext.95db901fb3")
          : tr("TimerContext.6cbe819906");
      callbacks.current.notify(message);
      if ("Notification" in window && Notification.permission === "granted")
        new Notification(tr("TimerContext.deff560989", { v0: APP_NAME }), {
          body: message,
          icon: "/favicon.svg",
        });
    };
    tick();
    const interval = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  const changeMode = (mode: TimerMode) =>
    setTimer({
      mode,
      remaining: durationFor(mode),
      duration: durationFor(mode),
      endAt: null,
      taskId: null,
    });
  useEffect(() => {
    setTimer((prev) =>
      !prev.endAt && prev.remaining === prev.duration
        ? {
            ...prev,
            remaining: callbacks.current.durationFor(prev.mode),
            duration: callbacks.current.durationFor(prev.mode),
          }
        : prev,
    );
  }, [settings.workMinutes, settings.shortBreak, settings.longBreak]);
  const toggle = () =>
    setTimer((prev) =>
      prev.endAt
        ? {
            ...prev,
            remaining: Math.max(1, Math.ceil((prev.endAt - Date.now()) / 1000)),
            endAt: null,
          }
        : {
            ...prev,
            endAt: Date.now() + prev.remaining * 1000,
            taskId:
              prev.remaining === prev.duration ? activeTaskId : prev.taskId,
          },
    );
  return (
    <TimerContext.Provider
      value={{
        ...timer,
        toggle,
        reset: () => changeMode(timer.mode),
        changeMode,
        skip: () => changeMode(timer.mode === "work" ? "shortBreak" : "work"),
      }}
    >
      {children}
    </TimerContext.Provider>
  );
}
