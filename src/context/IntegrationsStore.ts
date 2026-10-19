import { tr } from "../lib/i18n.ts";
import { createContext, useContext } from "react";
export interface Session {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  clientId: string;
  scope?: string;
}
export interface GoogleResponse {
  access_token: string;
  expires_in: number;
  error?: string;
  scope?: string;
}
export interface GoogleOAuth {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleResponse) => void;
    error_callback: () => void;
  }) => { requestAccessToken: (options: { prompt: string }) => void };
  revoke: (token: string, callback: () => void) => void;
}
declare global {
  export interface Window {
    google?: { accounts: { oauth2: GoogleOAuth } };
  }
}
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  url: string | null;
}
export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  volume: number | null;
  supported: boolean;
  active: boolean;
  restricted: boolean;
}
export type SpotifyCommand = {
  action: "play" | "pause" | "next" | "previous" | "seek" | "transfer";
  deviceId: string;
  position?: number;
  url?: string;
  play?: boolean;
};
export interface NowPlaying {
  title: string;
  artist: string;
  url: string | null;
  playing: boolean;
  image?: string | null;
  duration?: number;
  progress?: number;
  observedAt?: number;
}
export interface IntegrationValue {
  spotifyConnected: boolean;
  spotifyName: string;
  spotifyBusy: boolean;
  spotifyError: string;
  nowPlaying: NowPlaying | null;
  connectSpotify: (controlPlayback?: boolean) => Promise<void>;
  spotifyPlaybackControl: boolean;
  spotifyDevice: {
    id: string;
    name: string;
    volume: number | null;
    supported: boolean;
  } | null;
  spotifyDevices: SpotifyDevice[];
  spotifyActionBusy: boolean;
  commandSpotify: (command: SpotifyCommand) => Promise<boolean>;
  spotifyVolumeBusy: boolean;
  setSpotifyVolume: (volume: number) => Promise<boolean>;
  disconnectSpotify: () => void;
  refreshSpotify: (forceDevices?: boolean) => Promise<void>;
  googleConnected: boolean;
  googleBusy: boolean;
  googleReady: boolean;
  googleError: string;
  events: CalendarEvent[];
  connectGoogle: () => void;
  disconnectGoogle: () => void;
  refreshCalendar: () => Promise<void>;
}
export const IntegrationContext = createContext<IntegrationValue | null>(null);
export function useIntegrations() {
  const value = useContext(IntegrationContext);
  if (!value) throw new Error(tr("IntegrationsStore.fbc92bf22c"));
  return value;
}
