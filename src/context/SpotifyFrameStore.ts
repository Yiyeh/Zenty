import { createContext, useContext } from "react";
export const SpotifyFrameContext = createContext<
  ((anchor: HTMLElement, embed: string) => () => void) | null
>(null);
export function useSpotifyFrame() {
  const register = useContext(SpotifyFrameContext);
  if (!register) throw new Error("SpotifyPlayerProvider missing");
  return register;
}
