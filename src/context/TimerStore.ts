import { createContext, useContext } from "react";
export type TimerMode = "work" | "shortBreak" | "longBreak";
export interface TimerState {
  mode: TimerMode;
  remaining: number;
  duration: number;
  endAt: number | null;
  taskId: string | null;
}
export interface TimerValue extends TimerState {
  toggle: () => void;
  reset: () => void;
  changeMode: (m: TimerMode) => void;
  skip: () => void;
}
export const TimerContext = createContext<TimerValue | null>(null);
export function useTimer() {
  const value = useContext(TimerContext);
  if (!value) throw new Error("TimerProvider missing");
  return value;
}
