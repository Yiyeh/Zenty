import { useDashboard } from "../context/DashboardStore";
import type { Dispatch, SetStateAction } from "react";

// The dashboard save owns preferences; legacy localStorage is migrated by the provider.
export function useReaderPreference<T extends string | number | boolean>(
  key: string, fallback: T, valid: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>] {
  const { settings, setSettings } = useDashboard();
  const stored = settings.readerPreferences[key];
  const value = valid(stored) ? stored : fallback;
  return [value, (next) => setSettings((previous) => {
    const old = previous.readerPreferences[key];
    const current = valid(old) ? old : fallback;
    const updated = typeof next === "function" ? next(current) : next;
    return { ...previous, readerPreferences: { ...previous.readerPreferences, [key]: updated } };
  })];
}
