import { useLocale as useInterfaceLocale } from "./Locale.tsx";
import { translateMessage, tr } from "../lib/i18n.ts";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { IntegrationContext } from "./IntegrationsStore";
import type { SpotifyCommand } from "./IntegrationsStore";
import type { IntegrationSnapshot } from "../lib/remote-integrations";
const empty: IntegrationSnapshot = { spotifyConnected: false, spotifyName: "", spotifyBusy: false, spotifyError: "", nowPlaying: null, spotifyPlaybackControl: false, spotifyDevice: null, spotifyDevices: [], spotifyActionBusy: false, spotifyVolumeBusy: false, googleConnected: false, googleBusy: false, googleReady: false, googleError: "", events: [] };
export function RemoteIntegrationsProvider({children}: {children: ReactNode}) {
  useInterfaceLocale();
  const [state, setState] = useState(empty);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const request = async (action?: string, input?: unknown) => {
    const response = await fetch("/api/remote/integrations", { method: action ? "POST" : "GET", headers: { "X-Zenty-Remote": "1", "Content-Type": "application/json" }, body: action ? JSON.stringify({action, input}) : undefined });
    const result = await response.json();
    if (!response.ok) throw new Error(translateMessage(result.error || tr("RemoteIntegrationsContext.ee38169196")));
    if (mounted.current) setState(result.snapshot);
    return result.ok !== false;
  };
  const refresh = async () => { try { await request(); } catch (error) { if (mounted.current) setState((previous) => ({...previous, spotifyError:(error as Error).message})); } };
  useEffect(() => {
    mounted.current = true; void refresh();
    const wake = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = setInterval(wake, 15000); window.addEventListener("focus", wake);
    return () => { mounted.current = false; clearInterval(timer); window.removeEventListener("focus", wake); };
  }, []);
  const action = async (name: string, input?: unknown) => {
    setBusy(true);
    try { return await request(name, input); } catch (error) { setState((previous) => ({...previous, spotifyError:(error as Error).message})); return false; }
    finally { setBusy(false); }
  };
  const configure = () => setState((previous) => ({...previous, spotifyError:tr("RemoteIntegrationsContext.09f6ee0ac9"), googleError:tr("RemoteIntegrationsContext.a44ca6c732")}));
  return <IntegrationContext.Provider value={{...state, spotifyActionBusy:busy, spotifyVolumeBusy:busy,
    connectSpotify:async () => configure(), disconnectSpotify:configure, connectGoogle:configure, disconnectGoogle:configure,
    refreshSpotify:async () => { await action("refresh", "spotify"); }, refreshCalendar:async () => { await action("refresh", "calendar"); },
    commandSpotify:(command:SpotifyCommand) => action("command", command), setSpotifyVolume:(volume:number) => action("volume", volume),
  }}>{children}</IntegrationContext.Provider>;
}
