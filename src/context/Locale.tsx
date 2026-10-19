import { useSyncExternalStore } from "react";
import { getLocale, subscribeLocale } from "../lib/i18n";
export function useLocale() { return useSyncExternalStore(subscribeLocale, getLocale, getLocale); }
