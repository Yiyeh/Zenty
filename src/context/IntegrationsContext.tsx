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
      "La autorización venció o no coincide. Vuelve a conectar Spotify.",
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
      "Spotify no pudo autorizar la aplicación. Revisa el Client ID y la URL de retorno.",
    );
  const body = await response.json();
  if (
    typeof body.access_token !== "string" ||
    !Number.isFinite(body.expires_in)
  )
    throw new Error("Respuesta de Spotify inválida.");
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
          new Error("Google no respondió. Reabre Conexiones para reintentar."),
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
            "No se pudo cargar el acceso de Google. Revisa tu conexión.",
          ),
        );
      };
      document.head.append(script);
    });
  return googleScript;
}
export function IntegrationsProvider({ children }: { children: ReactNode }) {
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
      if (!cancelled) setSpotifyError("No se pudo recuperar la conexión guardada. Conecta Spotify una vez para reemplazarla.");
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
      setSpotifyError("No se pudo borrar la conexión guardada de Spotify. Vuelve a intentar desconectar.");
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
      }).catch(() => setSpotifyError("No se pudo guardar la conexión de Spotify. Tendrás que conectarla al volver a abrir Zenty."));
    } else {
      try { localStorage.setItem("mia_spotify_session", JSON.stringify(spotify)); sessionStorage.removeItem("mia_spotify_session"); }
      catch { setSpotifyError("El navegador no permite conservar la conexión de Spotify."); }
    }
  }, [spotify]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const state = params.get("state") || "";
    if (!state.startsWith("mia-")) return;
    const code = params.get("code");
    if (!code || params.has("error")) {
      setSpotifyError(
        "No se concedió el acceso a Spotify. Puedes volver a intentarlo.",
      );
      sessionStorage.removeItem("mia_spotify_pending");
    } else {
      setSpotifyBusy(true);
      exchangePromise ??= exchangeSpotify(code, state);
      exchangePromise
        .then((session) => {
          setSpotify(session);
          notifyRef.current("Tu cuenta de Spotify está conectada.");
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
        "Introduce el Client ID público de tu aplicación de Spotify (32 caracteres).",
      );
      return;
    }
    if (
      location.protocol !== "https:" &&
      !["127.0.0.1", "[::1]"].includes(location.hostname)
    ) {
      setSpotifyError(
        "Spotify requiere HTTPS o http://127.0.0.1:5173/. Abre esa dirección y registra su URL de retorno.",
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
        "No se pudo iniciar la conexión. Revisa que el navegador permita el almacenamiento de sesión.",
      );
    }
  };
  const refreshLock = useRef<Promise<Session> | null>(null);
  const validSpotifySession = async () => {
    const session = spotifyRef.current;
    if (!session) throw new Error("Conecta tu cuenta de Spotify.");
    if (session.expiresAt > Date.now() + 30000) return session;
    if (!session.refreshToken) {
      disconnectSpotify();
      throw new Error("La sesión de Spotify venció. Conecta de nuevo.");
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
            ? "Spotify venció o revocó la autorización. Vuelve a conectar tu cuenta."
            : "Spotify no pudo renovar la conexión en este momento. Se conserva la sesión; vuelve a intentar en unos instantes.");
        }
        const body = await response.json();
        if (
          typeof body.access_token !== "string" ||
          !Number.isFinite(body.expires_in)
        )
          throw new Error("Spotify no pudo renovar la sesión.");
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
            ? "Spotify pidió esperar. Se reintentará en un minuto."
            : "No se pudo consultar Spotify. Revisa los permisos y usuarios autorizados de tu aplicación.",
        );
      const user = profile ? await profile.json() : null;
      const player = playback.status === 204 ? null : await playback.json();
      if (generation !== spotifyGeneration.current) return;
      if (user) profileName.current = user.display_name || "Mi cuenta";
      setSpotifyName(profileName.current || "Mi cuenta");
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
            : "Spotify no está disponible.";
        if (message.includes("esperar"))
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
            : "Spotify no pudo realizar el cambio.";
        if (message.includes("esperar"))
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
        "Introduce un Client ID OAuth de tipo Aplicación web de Google.",
      );
      return;
    }
    if (!window.google?.accounts.oauth2) {
      setGoogleError(
        "El acceso de Google todavía no está listo. Revisa la conexión y vuelve a intentarlo.",
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
              "Debes autorizar la lectura de eventos para mostrar tu calendario.",
            );
            return;
          }
          setGoogle({
            accessToken: result.access_token,
            expiresAt: Date.now() + Number(result.expires_in) * 1000,
            clientId: settings.googleClientId.trim(),
          });
          notify("Google Calendar conectado.");
        },
        error_callback: () => {
          setGoogleBusy(false);
          setGoogleError(
            "La ventana de Google se cerró o fue bloqueada. Puedes reintentar.",
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
      setGoogleError("La sesión venció. Vuelve a conectar Google Calendar.");
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
            ? "La sesión venció. Vuelve a conectar Google Calendar."
            : "Google Calendar no respondió. Comprueba que Calendar API esté habilitada y la cuenta autorizada.",
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
              title: e.summary || "Sin título",
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
            : "No se pudo actualizar el calendario.",
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
      if (typeof input !== "number" || !Number.isFinite(input) || input < 0 || input > 100) throw new Error("Volumen inválido.");
      ok = await current.setSpotifyVolume(input);
    } else if (action === "command") {
      const command = input as SpotifyCommand;
      if (!command || !["play", "pause", "next", "previous", "seek", "transfer"].includes(command.action) || typeof command.deviceId !== "string" || command.deviceId.length > 200) throw new Error("Acción inválida.");
      ok = await current.commandSpotify(command);
    } else if (action !== "snapshot") throw new Error("Acción inválida.");
    return { ok, snapshot: integrationSnapshot(remoteValue.current) };
  }), []);
  return (
    <IntegrationContext.Provider value={value}>
      {children}
    </IntegrationContext.Provider>
  );
}
