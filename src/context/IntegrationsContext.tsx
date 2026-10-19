import { useLocale as useInterfaceLocale } from "./Locale.tsx";
import { tr } from "../lib/i18n.ts";
import { integrationSnapshot } from "../lib/remote-integrations";
import type { IntegrationValue } from "./IntegrationsStore";
import { IntegrationContext } from "./IntegrationsStore";
import type {
  Session,
  CalendarEvent,
  NowPlaying,
  SpotifyDevice,
  SpotifyCommand,
} from "./IntegrationsStore";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useDashboard } from "./DashboardStore";
import { safeUrl } from "../lib/dashboard";
import {
  requestSpotifyVolume,
  requestSpotifyDevices,
  requestSpotifyCommand,
  normalizeSpotifyDevice,
  normalizeSpotifyPlayback,
} from "../lib/spotify";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const randomString = () =>
  base64url(crypto.getRandomValues(new Uint8Array(48)));
let exchangePromise: Promise<Session> | null = null;
async function exchangeSpotify(code: string, state: string): Promise<Session> {
  const pending = JSON.parse(
    sessionStorage.getItem("mia_spotify_pending") || "null",
  );
  if (
    !pending ||
    pending.state !== state ||
    Date.now() - pending.createdAt > 600000
  )
    throw new Error(
      tr("IntegrationsContext.c0248c6f01"),
    );
  sessionStorage.removeItem("mia_spotify_pending");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: pending.redirectUri,
      client_id: pending.clientId,
      code_verifier: pending.verifier,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      tr("IntegrationsContext.c0e36e211d"),
    );
  const body = await response.json();
  if (
    typeof body.access_token !== "string" ||
    !Number.isFinite(body.expires_in)
  )
    throw new Error(tr("IntegrationsContext.b3d1f327b7"));
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + body.expires_in * 1000,
    clientId: pending.clientId,
    scope: typeof body.scope === "string" ? body.scope : "",
  };
}
let googleScript: Promise<void> | null = null;
function loadGoogle() {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  if (!googleScript)
    googleScript = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      const timer = setTimeout(() => {
        script.remove();
        googleScript = null;
        reject(
          new Error(tr("IntegrationsContext.0c9d1ce29d")),
        );
      }, 15000);
      script.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        googleScript = null;
        reject(
          new Error(
            tr("IntegrationsContext.de8707997e"),
          ),
        );
      };
      document.head.append(script);
    });
  return googleScript;
}
export function IntegrationsProvider({ children }: { children: ReactNode }) {
  useInterfaceLocale();
  const { settings, notify } = useDashboard();
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const [spotify, setSpotify] = useState<Session | null>(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("mia_spotify_session") || localStorage.getItem("mia_spotify_session") || "null",
      );
      return saved?.clientId === settings.spotifyClientId &&
        typeof saved.accessToken === "string" &&
        Number.isFinite(saved.expiresAt)
        ? saved
        : null;
    } catch {
      return null;
    }
  });
  const [spotifyName, setSpotifyName] = useState("");
  const [spotifyBusy, setSpotifyBusy] = useState(false);
  const [spotifyError, setSpotifyError] = useState("");
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [spotifyDevice, setSpotifyDevice] = useState<SpotifyDevice | null>(
    null,
  );
  const [spotifyDevices, setSpotifyDevices] = useState<SpotifyDevice[]>([]);
  const [spotifyActionBusy, setSpotifyActionBusy] = useState(false);
  const playerLock = useRef(false);
  const playerRefreshLock = useRef(false);
  const profileName = useRef<string | null>(null);
  const deviceTime = useRef(0);
  const cooldownUntil = useRef(0);
  const [spotifyVolumeBusy, setSpotifyVolumeBusy] = useState(false);
  const spotifyPlaybackControl = !!spotify?.scope
    ?.split(" ")
    .includes("user-modify-playback-state");
  const [google, setGoogle] = useState<Session | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const spotifyRef = useRef(spotify);
  spotifyRef.current = spotify;
  const googleRef = useRef(google);
  googleRef.current = google;
  const googleGeneration = useRef(0);
  const spotifyGeneration = useRef(0);
  useEffect(() => {
    const store = window.zentyDesktop?.spotifySession;
    if (!store || !settings.spotifyClientId || spotifyRef.current) return;
    let cancelled = false;
    const generation = spotifyGeneration.current;
    void store.get().then((saved) => {
      if (!cancelled && generation === spotifyGeneration.current && !spotifyRef.current && saved?.clientId === settings.spotifyClientId) {
        spotifyRef.current = saved;
        setSpotify(saved);
      }
    }).catch(() => {
      if (!cancelled) setSpotifyError(tr("IntegrationsContext.23f5d77ae6"));
    });
    return () => { cancelled = true; };
  }, [settings.spotifyClientId]);
  const disconnectSpotify = () => {
    spotifyGeneration.current++;
    spotifyRef.current = null;
    setSpotify(null);
    setSpotifyName("");
    setNowPlaying(null);
    setSpotifyDevice(null);
    setSpotifyDevices([]);
    profileName.current = null;
    deviceTime.current = 0;
    setSpotifyError("");
    try {
      sessionStorage.removeItem("mia_spotify_session");
      localStorage.removeItem("mia_spotify_session");
      sessionStorage.removeItem("mia_spotify_pending");
    } catch {
      /* No saved session. */
    }
    void window.zentyDesktop?.spotifySession?.set(null).catch(() => {
      setSpotifyError(tr("IntegrationsContext.a16ab00db6"));
    });
  };
  const disconnectGoogle = () => {
    googleGeneration.current++;
    const token = googleRef.current?.accessToken;
    googleRef.current = null;
    setGoogle(null);
    setEvents([]);
    setGoogleError("");
    if (token) window.google?.accounts.oauth2.revoke(token, () => {});
  };
  useEffect(() => {
    if (
      spotifyRef.current &&
      spotifyRef.current.clientId !== settings.spotifyClientId
    )
      disconnectSpotify();
  }, [settings.spotifyClientId]);
  useEffect(() => {
    if (
      googleRef.current &&
      googleRef.current.clientId !== settings.googleClientId
    )
      disconnectGoogle();
    setGoogleReady(false);
    if (!settings.googleClientId) return;
    let cancelled = false;
    loadGoogle()
      .then(() => {
        if (!cancelled) setGoogleReady(true);
      })
      .catch((e) => {
        if (!cancelled) setGoogleError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [settings.googleClientId]);
  useEffect(() => {
    if (!spotify) return;
    if (window.zentyDesktop?.spotifySession) {
      void window.zentyDesktop.spotifySession.set(spotify).then(() => {
        sessionStorage.removeItem("mia_spotify_session");
        localStorage.removeItem("mia_spotify_session");
      }).catch(() => setSpotifyError(tr("IntegrationsContext.86e63fa5be")));
    } else {
      try { localStorage.setItem("mia_spotify_session", JSON.stringify(spotify)); sessionStorage.removeItem("mia_spotify_session"); }
      catch { setSpotifyError(tr("IntegrationsContext.e40223ce60")); }
    }
  }, [spotify]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const state = params.get("state") || "";
    if (!state.startsWith("mia-")) return;
    const code = params.get("code");
    if (!code || params.has("error")) {
      setSpotifyError(
        tr("IntegrationsContext.353dd8d9ff"),
      );
      sessionStorage.removeItem("mia_spotify_pending");
    } else {
      setSpotifyBusy(true);
      exchangePromise ??= exchangeSpotify(code, state);
      exchangePromise
        .then((session) => {
          setSpotify(session);
          notifyRef.current(tr("IntegrationsContext.960b391222"));
        })
        .catch((e) => setSpotifyError(e.message))
        .finally(() => setSpotifyBusy(false));
    }
    for (const key of ["code", "state", "error", "error_description"])
      params.delete(key);
    history.replaceState(
      null,
      "",
      location.pathname + (params.size ? `?${params}` : "") + location.hash,
    );
  }, []);
  const connectSpotify = async (controlPlayback = false) => {
    setSpotifyError("");
    if (!/^[a-f\d]{32}$/i.test(settings.spotifyClientId.trim())) {
      setSpotifyError(
        tr("IntegrationsContext.ac5ae0df3a"),
      );
      return;
    }
    if (
      location.protocol !== "https:" &&
      !["127.0.0.1", "[::1]"].includes(location.hostname)
    ) {
      setSpotifyError(
        tr("IntegrationsContext.e3ded5a591"),
      );
      return;
    }
    setSpotifyBusy(true);
    try {
      const verifier = randomString();
      const state = `mia-${randomString()}`;
      const challenge = base64url(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(verifier),
          ),
        ),
      );
      const redirectUri = location.origin + location.pathname;
      sessionStorage.setItem(
        "mia_spotify_pending",
        JSON.stringify({
          verifier,
          state,
          redirectUri,
          clientId: settings.spotifyClientId.trim(),
          createdAt: Date.now(),
        }),
      );
      const params = new URLSearchParams({
        response_type: "code",
        client_id: settings.spotifyClientId.trim(),
        scope:
          "user-read-private user-read-currently-playing" +
          (controlPlayback || spotifyPlaybackControl
            ? " user-read-playback-state user-modify-playback-state"
            : ""),
        redirect_uri: redirectUri,
        state,
        code_challenge_method: "S256",
        code_challenge: challenge,
      });
      location.assign(`https://accounts.spotify.com/authorize?${params}`);
    } catch {
      setSpotifyBusy(false);
      setSpotifyError(
        tr("IntegrationsContext.e64a9a6a25"),
      );
    }
  };
  const refreshLock = useRef<Promise<Session> | null>(null);
  const validSpotifySession = async () => {
    const session = spotifyRef.current;
    if (!session) throw new Error(tr("IntegrationsContext.dcede473c3"));
    if (session.expiresAt > Date.now() + 30000) return session;
    if (!session.refreshToken) {
      disconnectSpotify();
      throw new Error(tr("IntegrationsContext.80352f1416"));
    }
    if (!refreshLock.current)
      refreshLock.current = (async () => {
        const response = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: session.refreshToken!,
            client_id: session.clientId,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          const failure = await response.json().catch(() => ({}));
          throw new Error(failure.error === "invalid_grant"
            ? tr("IntegrationsContext.221b23bd5f")
            : tr("IntegrationsContext.89479ec878"));
        }
        const body = await response.json();
        if (
          typeof body.access_token !== "string" ||
          !Number.isFinite(body.expires_in)
        )
          throw new Error(tr("IntegrationsContext.0acb3ec59b"));
        return {
          ...session,
          accessToken: body.access_token,
          refreshToken: body.refresh_token || session.refreshToken,
          expiresAt: Date.now() + body.expires_in * 1000,
          scope: typeof body.scope === "string" ? body.scope : session.scope,
        };
      })().finally(() => {
        refreshLock.current = null;
      });
    const next = await refreshLock.current;
    if (spotifyRef.current === session) {
      spotifyRef.current = next;
      setSpotify(next);
    }
    return next;
  };
  const refreshSpotify = async (forceDevices = true) => {
    if (
      !spotifyRef.current ||
      playerRefreshLock.current ||
      Date.now() < cooldownUntil.current
    )
      return;
    const generation = spotifyGeneration.current;
    playerRefreshLock.current = true;
    setSpotifyBusy(true);
    setSpotifyError("");
    try {
      const session = await validSpotifySession();
      const headers = { Authorization: `Bearer ${session.accessToken}` };
      const canReadDevices = session.scope
        ?.split(" ")
        .includes("user-read-playback-state");
      const fetchDevices =
        canReadDevices &&
        (forceDevices || Date.now() - deviceTime.current > 60_000);
      const [profile, playback, devices] = await Promise.all([
        profileName.current
          ? null
          : fetch("https://api.spotify.com/v1/me", {
              headers,
              signal: AbortSignal.timeout(15000),
            }),
        fetch(
          `https://api.spotify.com/v1/me/player${canReadDevices ? "" : "/currently-playing"}`,
          { headers, signal: AbortSignal.timeout(15000) },
        ),
        fetchDevices ? requestSpotifyDevices(session.accessToken) : null,
      ]);
      if (profile?.status === 429 || playback.status === 429)
        cooldownUntil.current = Date.now() + 60_000;
      if ((profile && !profile.ok) || (playback.status !== 204 && !playback.ok))
        throw new Error(
          playback.status === 429
            ? tr("IntegrationsContext.220e32e18f")
            : tr("IntegrationsContext.ffcd14ca9f"),
        );
      const user = profile ? await profile.json() : null;
      const player = playback.status === 204 ? null : await playback.json();
      if (generation !== spotifyGeneration.current) return;
      if (user) profileName.current = user.display_name || tr("common.myAccount");
      setSpotifyName(profileName.current || tr("common.myAccount"));
      if (devices) {
        setSpotifyDevices(devices);
        deviceTime.current = Date.now();
      }
      setSpotifyDevice(normalizeSpotifyDevice(player?.device));
      setNowPlaying(normalizeSpotifyPlayback(player));
    } catch (error) {
      if (generation === spotifyGeneration.current) {
        const message =
          error instanceof Error
            ? error.message
            : tr("IntegrationsContext.a300039d82");
        if (error instanceof Error && "status" in error && error.status === 429)
          cooldownUntil.current = Date.now() + 60_000;
        setSpotifyError(message);
      }
    } finally {
      playerRefreshLock.current = false;
      setSpotifyBusy(false);
    }
  };
  const commandSpotify = async (command: SpotifyCommand) => {
    if (
      !spotifyPlaybackControl ||
      playerLock.current ||
      Date.now() < cooldownUntil.current
    )
      return false;
    const generation = spotifyGeneration.current;
    playerLock.current = true;
    setSpotifyActionBusy(true);
    setSpotifyError("");
    try {
      const session = await validSpotifySession();
      await requestSpotifyCommand(session.accessToken, command);
      if (generation !== spotifyGeneration.current) return false;
      await new Promise((resolve) => setTimeout(resolve, 400));
      await refreshSpotify(command.action === "transfer");
      return true;
    } catch (error) {
      if (generation === spotifyGeneration.current) {
        const message =
          error instanceof Error
            ? error.message
            : tr("IntegrationsContext.4df96a9ac8");
        if (error instanceof Error && "status" in error && error.status === 429)
          cooldownUntil.current = Date.now() + 60_000;
        setSpotifyError(message);
      }
      return false;
    } finally {
      playerLock.current = false;
      setSpotifyActionBusy(false);
    }
  };
  const volumeLock = useRef(false);
  const setSpotifyVolume = async (volume: number) => {
    if (
      !spotifyPlaybackControl ||
      !spotifyDevice?.supported ||
      !Number.isFinite(volume) ||
      volumeLock.current
    )
      return false;
    volumeLock.current = true;
    setSpotifyVolumeBusy(true);
    setSpotifyError("");
    const generation = spotifyGeneration.current;
    try {
      const session = await validSpotifySession();
      const percent = await requestSpotifyVolume(
        session.accessToken,
        spotifyDevice.id,
        volume,
      );
      if (generation !== spotifyGeneration.current) return false;
      setSpotifyDevice((old) =>
        old?.id === spotifyDevice.id ? { ...old, volume: percent } : old,
      );
      return true;
    } catch (error) {
      if (generation === spotifyGeneration.current)
        setSpotifyError((error as Error).message);
      return false;
    } finally {
      volumeLock.current = false;
      setSpotifyVolumeBusy(false);
    }
  };
  useEffect(() => {
    if (spotify?.clientId) void refreshSpotify();
  }, [spotify?.clientId]);
  const connectGoogle = () => {
    setGoogleError("");
    if (
      !settings.googleClientId.trim().endsWith(".apps.googleusercontent.com")
    ) {
      setGoogleError(
        tr("IntegrationsContext.72c500bdb7"),
      );
      return;
    }
    if (!window.google?.accounts.oauth2) {
      setGoogleError(
        tr("IntegrationsContext.c3c7c91a23"),
      );
      return;
    }
    const generation = googleGeneration.current;
    setGoogleBusy(true);
    window.google.accounts.oauth2
      .initTokenClient({
        client_id: settings.googleClientId.trim(),
        scope: GOOGLE_SCOPE,
        callback: (result) => {
          if (generation !== googleGeneration.current) return;
          setGoogleBusy(false);
          if (
            result.error ||
            !result.access_token ||
            !result.scope?.split(" ").includes(GOOGLE_SCOPE)
          ) {
            setGoogleError(
              tr("IntegrationsContext.b6411afb76"),
            );
            return;
          }
          setGoogle({
            accessToken: result.access_token,
            expiresAt: Date.now() + Number(result.expires_in) * 1000,
            clientId: settings.googleClientId.trim(),
          });
          notify(tr("IntegrationsContext.d4b8e7a482"));
        },
        error_callback: () => {
          setGoogleBusy(false);
          setGoogleError(
            tr("IntegrationsContext.a47ec02927"),
          );
        },
      })
      .requestAccessToken({ prompt: "" });
  };
  const refreshCalendar = async () => {
    const session = googleRef.current;
    if (!session) return;
    if (session.expiresAt <= Date.now()) {
      googleRef.current = null;
      setGoogle(null);
      setEvents([]);
      setGoogleError(tr("IntegrationsContext.8e45bd8ad8"));
      return;
    }
    const generation = googleGeneration.current;
    setGoogleBusy(true);
    setGoogleError("");
    try {
      const end = new Date();
      end.setDate(end.getDate() + 7);
      const params = new URLSearchParams({
        timeMin: new Date().toISOString(),
        timeMax: end.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "50",
      });
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        {
          headers: { Authorization: `Bearer ${session.accessToken}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? tr("IntegrationsContext.8e45bd8ad8")
            : tr("IntegrationsContext.9c36a34bf2"),
        );
      const body = await response.json();
      if (generation !== googleGeneration.current) return;
      setEvents(
        (body.items || [])
          .filter((e: { status: string }) => e.status !== "cancelled")
          .map(
            (e: {
              id: string;
              summary?: string;
              start: { dateTime?: string; date?: string };
              end: { dateTime?: string; date?: string };
              htmlLink?: string;
            }) => ({
              id: e.id,
              title: e.summary || tr("IntegrationsContext.30d1a8cd45"),
              start: e.start.dateTime || e.start.date || "",
              end: e.end.dateTime || e.end.date || "",
              allDay: !e.start.dateTime,
              url: safeUrl(e.htmlLink || ""),
            }),
          ),
      );
    } catch (e) {
      if (generation === googleGeneration.current)
        setGoogleError(
          e instanceof Error
            ? e.message
            : tr("IntegrationsContext.b1b0d932bb"),
        );
    } finally {
      setGoogleBusy(false);
    }
  };
  useEffect(() => {
    if (google) {
      void refreshCalendar();
      const interval = setInterval(() => void refreshCalendar(), 300000);
      return () => clearInterval(interval);
    }
  }, [google]);
  const value: IntegrationValue = {
        spotifyConnected: !!spotify,
        spotifyName,
        spotifyBusy,
        spotifyError,
        nowPlaying,
        connectSpotify,
        disconnectSpotify,
        refreshSpotify,
        spotifyPlaybackControl,
        spotifyDevice,
        spotifyDevices,
        spotifyActionBusy,
        commandSpotify,
        spotifyVolumeBusy,
        setSpotifyVolume,
        googleConnected: !!google,
        googleBusy,
        googleReady,
        googleError,
        events,
        connectGoogle,
        disconnectGoogle,
        refreshCalendar,
  };
  const remoteValue = useRef(value);
  remoteValue.current = value;
  useEffect(() => window.zentyDesktop?.onIntegrationRequest?.(async (action, input) => {
    const current = remoteValue.current;
    let ok = true;
    if (action === "refresh") { if (input === "calendar") await current.refreshCalendar(); else await current.refreshSpotify(); }
    else if (action === "volume") {
      if (typeof input !== "number" || !Number.isFinite(input) || input < 0 || input > 100) throw new Error(tr("IntegrationsContext.6351b82c0b"));
      ok = await current.setSpotifyVolume(input);
    } else if (action === "command") {
      const command = input as SpotifyCommand;
      if (!command || !["play", "pause", "next", "previous", "seek", "transfer"].includes(command.action) || typeof command.deviceId !== "string" || command.deviceId.length > 200) throw new Error(tr("IntegrationsContext.de70e71794"));
      ok = await current.commandSpotify(command);
    } else if (action !== "snapshot") throw new Error(tr("IntegrationsContext.de70e71794"));
    return { ok, snapshot: integrationSnapshot(remoteValue.current) };
  }), []);
  return (
    <IntegrationContext.Provider value={value}>
      {children}
    </IntegrationContext.Provider>
  );
}
