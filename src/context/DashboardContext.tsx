import { mergeDashboard } from "../lib/dashboard-sync";
import { isRemoteLibrary } from "../lib/remote";
import { DashboardContext } from "./DashboardStore";
import type { ContextValue, Setter } from "./DashboardStore";
import type { DashboardData } from "../lib/dashboard";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  defaultData,
  habitStreak,
  loadData,
  localDate,
  parseBackup,
} from "../lib/dashboard";
export function DashboardProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => {
    try {
      const loaded = loadData(localStorage);
      for (const key of ["zenty-manga-mode", "zenty-manga-theme", "zenty-manga-cover-mode", "zenty-manga-invert-nav"]) {
        const legacy = localStorage.getItem(key);
        if (legacy !== null && loaded.data.settings.readerPreferences[key] === undefined)
          loaded.data.settings.readerPreferences[key] = key.endsWith("invert-nav") ? legacy === "1" : legacy;
      }
      return loaded;
    } catch {
      return {
        data: structuredClone(defaultData),
        warning:
          "El navegador no permite guardar datos. Exporta tu respaldo antes de cerrar.",
      };
    }
  });
  const [data, setData] = useState(initial.data);
  const [storageWarning, setStorageWarning] = useState(initial.warning);
  const [diskWarning, setDiskWarning] = useState("");
  const [diskReady, setDiskReady] = useState(false);
  const diskReadyRef = useRef(diskReady);
  diskReadyRef.current = diskReady;
  const dataRef = useRef(data);
  dataRef.current = data;
  const diskTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingDiskWrite = useRef<Promise<void>>(Promise.resolve());
  const diskTag = useRef<string | null>(null);
  const confirmed = useRef<DashboardData | null>(null);
  const writeDisk = (_raw?: string) => {
    const next = pendingDiskWrite.current.catch(() => {}).then(async () => {
      const base = confirmed.current;
      if (!base) return;
      const local = dataRef.current;
      const changed = JSON.stringify(base) !== JSON.stringify(local);
      const response = await fetch("/api/dashboard", {
        method: changed ? "PATCH" : "GET",
        headers: { "X-MIA-Dashboard": "1", "Content-Type": "application/json", ...(!changed && diskTag.current ? { "If-None-Match": diskTag.current } : {}) },
        body: changed ? JSON.stringify({ base, data: local }) : undefined,
      });
      if (response.status === 304) return;
      diskTag.current = response.headers.get("ETag");
      if (!response.ok) throw new Error(response.status === 401 ? "La sesión terminó. Guarda un respaldo y vuelve a entrar desde la dirección del PC." : "No se pudo sincronizar con el PC. Los cambios siguen en este dispositivo y se reintentarán.");
      const body = await response.json();
      const remote = body.data ? parseBackup(JSON.stringify(body.data)) : base;
      confirmed.current = remote;
      setData((previous) => {
        const merged = mergeDashboard(local, previous, remote);
        dataRef.current = merged;
        return JSON.stringify(previous) === JSON.stringify(merged) ? previous : merged;
      });
    });
    pendingDiskWrite.current = next;
    return next;
  };
  const canSave = useRef(!initial.warning);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [toast, setToast] = useState<ContextValue["toast"]>(null);
  const dismissToast = () => setToast(null);
  const notify = (message: string, undo?: () => void) =>
    setToast({ message, undo });
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismissToast, toast.undo ? 12000 : 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const setter =
    <K extends keyof DashboardData>(key: K): Setter<K> =>
    (value) =>
      setData((prev) => ({
        ...prev,
        [key]:
          typeof value === "function"
            ? (value as (old: DashboardData[K]) => DashboardData[K])(prev[key])
            : value,
      }));
  useEffect(() => {
    if (!canSave.current) return;
    try {
      localStorage.setItem(
        "mia_dashboard_v2",
        JSON.stringify({ ...data, version: 2 }),
      );
      for (const key of Object.keys(data.settings.readerPreferences))
        localStorage.removeItem(key);
      setStorageWarning("");
    } catch {
      setStorageWarning(
        "No se pudieron guardar los últimos cambios. Exporta un respaldo para conservarlos.",
      );
    }
  }, [data]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/dashboard", {
          headers: { "X-MIA-Dashboard": "1" },
        });
        if (!response.ok) {
          if (response.status === 500 || window.zentyDesktop)
            throw new Error("No se pudo leer la copia de tu espacio en disco.");
          return;
        }
        diskTag.current = response.headers.get("ETag");
        const body = await response.json();
        if (!active) return;
        const restored = body.data ? parseBackup(JSON.stringify(body.data)) : (isRemoteLibrary ? structuredClone(defaultData) : initial.data);
        confirmed.current = restored;
        setData((previous) => mergeDashboard(initial.data, previous, restored));
        setDiskReady(true);
      } catch (error) {
        if (active)
          setDiskWarning((error as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, [initial.data]);
  useEffect(() => {
    if (!diskReady || !canSave.current) return;
    const timer = setTimeout(() => {
      void writeDisk(JSON.stringify({ ...data, version: 2 }))
        .then(() => {
          setDiskWarning("");
        })
        .catch((error) => setDiskWarning(error.message));
    }, 500);
    diskTimer.current = timer;
    return () => clearTimeout(timer);
  }, [data, diskReady]);
  useEffect(() => window.zentyDesktop?.onBeforeClose(async () => {
    clearTimeout(diskTimer.current);
    if (!canSave.current || !diskReadyRef.current) throw new Error("El save aún no está listo.");
    await writeDisk(JSON.stringify({ ...dataRef.current, version: 2 }));
  }), []);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== "mia_dashboard_v2" || !event.newValue) return;
      try {
        if (localStorage.getItem(event.key) !== event.newValue) return;
        const next = parseBackup(event.newValue);
        setData((previous) =>
          JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
        );
      } catch {
        setStorageWarning(
          "Otra pestaña guardó datos que no pudimos leer. Exporta un respaldo antes de continuar.",
        );
        canSave.current = false;
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (!diskReady) return;
    const sync = () => { if (window.zentyDesktop || document.visibilityState === "visible") void writeDisk().then(() => setDiskWarning("")).catch((error) => setDiskWarning(error.message)); };
    const timer = setInterval(sync, 3000);
    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);
    const flush = () => {
      const base = confirmed.current, local = dataRef.current;
      if (!base || JSON.stringify(base) === JSON.stringify(local)) return;
      const body = JSON.stringify({ base, data: local });
      if (new Blob([body]).size <= 60000) void fetch("/api/dashboard", { method: "PATCH", headers: { "X-MIA-Dashboard": "1", "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    };
    const hidden = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => { clearInterval(timer); window.removeEventListener("focus", sync); window.removeEventListener("online", sync); window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", hidden); };
  }, [diskReady]);
  const settings = data.settings;
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark =
        settings.theme === "dark" ||
        (settings.theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
    };
    apply();
    media.addEventListener("change", apply);
    const root = document.documentElement;
    root.dataset.background = settings.background;
    root.dataset.tone = settings.surfaceTone;
    root.dataset.density = settings.density;
    root.style.setProperty("--accent-color", settings.accentColor);
    root.style.setProperty("--accent-color-light", settings.accentColor);
    root.style.setProperty("--accent-color-dark", settings.accentColor);
    root.style.setProperty("--accent-soft", `${settings.accentColor}12`);
    root.style.setProperty("--accent-glow-color", `${settings.accentColor}30`);
    const rgb = settings.accentColor
      .slice(1)
      .match(/../g)!
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    root.style.setProperty(
      "--on-accent",
      luminance > 0.179 ? "#15251c" : "#ffffff",
    );
    return () => media.removeEventListener("change", apply);
  }, [
    settings.theme,
    settings.accentColor,
    settings.background,
    settings.density,
    settings.surfaceTone,
  ]);
  useEffect(() => {
    const updateDay = () =>
      setData((prev) => {
        const today = localDate();
        if (prev.settings.intentionDate === today) return prev;
        return {
          ...prev,
          habits: prev.habits.map((h) => ({
            ...h,
            streak: habitStreak(h.history),
          })),
          settings: {
            ...prev.settings,
            dailyIntention: "",
            intentionDate: today,
          },
        };
      });
    updateDay();
    const timer = setInterval(updateDay, 30000);
    window.addEventListener("focus", updateDay);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", updateDay);
    };
  }, []);
  const addFocusMinutes = (minutes: number, taskId = activeTaskId) => {
    const today = localDate();
    setData((prev) => ({
      ...prev,
      focusSessions: prev.focusSessions.some((s) => s.date === today)
        ? prev.focusSessions.map((s) =>
            s.date === today ? { ...s, minutes: s.minutes + minutes } : s,
          )
        : [...prev.focusSessions, { date: today, minutes }],
      tasks: prev.tasks.map((t) =>
        t.id === taskId ? { ...t, pomodoros: t.pomodoros + 1 } : t,
      ),
    }));
  };
  const importData = (raw: string) => {
    try {
      const next = parseBackup(raw);
      if (canSave.current)
        localStorage.setItem(
          "mia_before_import",
          JSON.stringify({ ...data, version: 2 }),
        );
      canSave.current = true;
      setData(next);
      setActiveTaskId(null);
      setStorageWarning("");
      notify("Respaldo restaurado.");
      return true;
    } catch {
      return false;
    }
  };
  return (
    <DashboardContext.Provider
      value={{
        ...data,
        ready: diskReady || (!window.zentyDesktop && !isRemoteLibrary),
        setTasks: setter("tasks"),
        setHabits: setter("habits"),
        setNotes: setter("notes"),
        setIdeas: setter("ideas"),
        setTimeBlocks: setter("timeBlocks"),
        setReminders: setter("reminders"),
        setFocusSessions: setter("focusSessions"),
        setSettings: setter("settings"),
        setBookmarks: setter("bookmarks"),
        setGames: setter("games"),
        activeTaskId,
        setActiveTaskId,
        addFocusMinutes,
        importData,
        exportData: () =>
          JSON.stringify(
            { ...data, version: 2, exportedAt: new Date().toISOString() },
            null,
            2,
          ),
        storageWarning: storageWarning || diskWarning,
        toast,
        notify,
        dismissToast,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}
