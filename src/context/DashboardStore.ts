import { tr } from "../lib/i18n.ts";
import { createContext, useContext } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DashboardData } from "../lib/dashboard";
export type Setter<K extends keyof DashboardData> = Dispatch<
  SetStateAction<DashboardData[K]>
>;
export interface ContextValue extends DashboardData {
  ready: boolean;
  sync: import("../lib/sync").SyncState;
  retrySync: () => Promise<void>;
  acknowledgeConflict: () => Promise<void>;
  setTasks: Setter<"tasks">;
  setHabits: Setter<"habits">;
  setNotes: Setter<"notes">;
  setIdeas: Setter<"ideas">;
  setTimeBlocks: Setter<"timeBlocks">;
  setReminders: Setter<"reminders">;
  setFocusSessions: Setter<"focusSessions">;
  setSettings: Setter<"settings">;
  setBookmarks: Setter<"bookmarks">;
  setGames: Setter<"games">;
  activeTaskId: string | null;
  setActiveTaskId: Dispatch<SetStateAction<string | null>>;
  addFocusMinutes: (minutes: number, taskId?: string | null) => void;
  importData: (raw: string) => boolean;
  exportData: () => string;
  storageWarning: string;
  toast: { message: string; undo?: () => void } | null;
  notify: (message: string, undo?: () => void) => void;
  dismissToast: () => void;
}
export const DashboardContext = createContext<ContextValue | undefined>(
  undefined,
);
export function useDashboard() {
  const value = useContext(DashboardContext);
  if (!value) throw new Error(tr("DashboardStore.abb32c3e42"));
  return value;
}
