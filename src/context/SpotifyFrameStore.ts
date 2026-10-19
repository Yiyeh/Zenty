import { tr } from "../lib/i18n.ts";
import { createContext, useContext } from "react";
export const SpotifyFrameContext = createContext<
  ((anchor: HTMLElement, embed: string) => () => void) | null
>(null);
export function useSpotifyFrame() {
  const register = useContext(SpotifyFrameContext);
  if (!register) throw new Error(tr("SpotifyFrameStore.efb75b2cd5"));
  return register;
}
