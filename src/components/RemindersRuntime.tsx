import { useEffect, useMemo, useRef } from "react";
import { useDashboard } from "../context/DashboardStore";
import {
  buildReminderPlan,
  createReminderEngine,
  reminderMessage,
} from "../lib/reminders";
import { APP_NAME } from "../lib/brand";
const cacheKey = "mia_reminders_delivered";
function readDelivered(): Record<string, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(cacheKey) || "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved)
      ? saved
      : {};
  } catch {
    return {};
  }
}
export function RemindersRuntime() {
  const { tasks, timeBlocks, reminders, settings, notify, storageWarning } =
    useDashboard();
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const engine = useRef<ReturnType<typeof createReminderEngine> | null>(null);
  const plan = useMemo(
    () => buildReminderPlan({ tasks, timeBlocks, reminders, settings }),
    [tasks, timeBlocks, reminders, settings],
  );
  useEffect(() => {
    const native = window.zentyDesktop?.reminders;
    if (native)
      return native.onFired((value) => notifyRef.current(value.message));
    const emit = async (occurrence: Parameters<typeof reminderMessage>[0]) => {
      const display = async () => {
        if (Object.hasOwn(readDelivered(), occurrence.key)) return;
        const message = reminderMessage(occurrence);
        notifyRef.current(message);
        if ("Notification" in window && Notification.permission === "granted") {
          const notification = new Notification(`${APP_NAME} · Recordatorio`, {
            body: message,
            tag: occurrence.key,
            silent: !occurrence.entry.sound,
          });
          notification.onclick = () => {
            window.focus();
            window.dispatchEvent(new Event("zenty-open-reminders"));
            notification.close();
          };
        }
        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({
              ...readDelivered(),
              [occurrence.key]: Date.now(),
            }),
          );
        } catch {
          /* In-app notices still work without storage. */
        }
      };
      if (navigator.locks)
        await navigator.locks.request("zenty-reminder-notification", display);
      else await display();
    };
    const current = createReminderEngine({
      delivered: readDelivered(),
      notify: emit,
      save: async (delivered) => {
        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({ ...readDelivered(), ...delivered }),
          );
        } catch {
          /* Cache is optional. */
        }
      },
    });
    engine.current = current;
    const wake = () => void current.check();
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      current.stop();
      engine.current = null;
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);
  useEffect(() => {
    if (storageWarning) return;
    const timer = setTimeout(() => {
      const native = window.zentyDesktop?.reminders;
      const sync = native ? native.sync(plan) : engine.current?.sync(plan);
      void sync?.catch(() =>
        notifyRef.current(
          "No se pudo actualizar la programación de avisos. Vuelve a abrir la agenda.",
        ),
      );
    }, 250);
    return () => clearTimeout(timer);
  }, [plan, storageWarning]);
  return null;
}
