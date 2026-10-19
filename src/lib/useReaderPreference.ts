import { useState } from "react";
import { isReadOnly } from "./remote";
import { useDashboard } from "../context/DashboardStore";
import type { Dispatch, SetStateAction } from "react";

// The dashboard save owns preferences; legacy localStorage is migrated by the provider.
export function useReaderPreference<T extends string | number | boolean>(
  key: string, fallback: T, valid: (value: unknown) => value is T, scope?: string,
): [T, Dispatch<SetStateAction<T>>] {
  const preferenceKey = scope ? key + "--" + scope : key;
  const { settings, setSettings } = useDashboard();
  const stored = settings.readerPreferences[preferenceKey] ?? settings.readerPreferences[key];
  const value = valid(stored) ? stored : fallback;
  const [local, setLocal] = useState<T | undefined>(undefined);
  if (isReadOnly()) return [local ?? value, next => setLocal(previous => typeof next === "function" ? next(previous ?? value) : next)];
  return [value, (next) => setSettings((previous) => {
    const old = previous.readerPreferences[preferenceKey] ?? previous.readerPreferences[key];
    const current = valid(old) ? old : fallback;
    const updated = typeof next === "function" ? next(current) : next;
    return { ...previous, readerPreferences: { ...previous.readerPreferences, [preferenceKey]: updated } };
  })];
}
