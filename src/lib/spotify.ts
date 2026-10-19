import { safeUrl, spotifyEmbed } from "./dashboard.ts";
import type {
  NowPlaying,
  SpotifyDevice,
  SpotifyCommand,
} from "../context/IntegrationsStore.ts";
export function normalizeSpotifyDevice(value: unknown): SpotifyDevice | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || !item.id || item.id.length > 300)
    return null;
  return {
    id: item.id,
    name: typeof item.name === "string" ? item.name : "Spotify",
    type: typeof item.type === "string" ? item.type : "unknown",
    volume:
      typeof item.volume_percent === "number" &&
      Number.isFinite(item.volume_percent)
        ? Math.max(0, Math.min(100, Math.round(item.volume_percent)))
        : null,
    supported: item.supports_volume === true && item.is_restricted !== true,
    active: item.is_active === true,
    restricted: item.is_restricted === true,
  };
}
export function normalizeSpotifyPlayback(
  value: unknown,
  now = Date.now(),
): NowPlaying | null {
  if (!value || typeof value !== "object") return null;
  const player = value as {
    item?: {
      name?: string;
      artists?: { name: string }[];
      show?: { name?: string };
      album?: { images?: { url: string }[] };
      images?: { url: string }[];
      duration_ms?: number;
      external_urls?: { spotify?: string };
    };
    is_playing?: boolean;
    progress_ms?: number;
  };
  const item = player.item;
  if (!item || typeof item.name !== "string") return null;
  const image = safeUrl(
    item.album?.images?.[0]?.url || item.images?.[0]?.url || "",
  );
  return {
    title: item.name,
    artist: Array.isArray(item.artists)
      ? item.artists.map((artist) => artist.name).join(", ")
      : item.show?.name || "Spotify",
    url: safeUrl(item.external_urls?.spotify || ""),
    playing: player.is_playing === true,
    image:
      image &&
      new URL(image).protocol === "https:" &&
      /(^|\.)scdn\.co$/.test(new URL(image).hostname)
        ? image
        : null,
    duration: Number.isFinite(item.duration_ms)
      ? Math.max(0, item.duration_ms!)
      : 0,
    progress: Number.isFinite(player.progress_ms)
      ? Math.max(0, player.progress_ms!)
      : 0,
    observedAt: now,
  };
}
function spotifyError(status: number) {
  return new Error(
    status === 403
      ? "Spotify no permite este control. Comprueba Premium, los permisos y los usuarios autorizados de tu aplicación."
      : status === 404
        ? "No hay un dispositivo disponible. Abre Spotify en Windows o en el navegador y actualiza los dispositivos."
        : status === 401
          ? "La sesión de Spotify venció. Vuelve a conectar tu cuenta."
          : status === 429
            ? "Spotify pidió esperar. Inténtalo de nuevo dentro de un minuto."
            : "Spotify no pudo realizar el cambio. Vuelve a intentarlo.",
  );
}
export async function requestSpotifyDevices(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<SpotifyDevice[]> {
  const response = await fetcher(
    "https://api.spotify.com/v1/me/player/devices",
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw spotifyError(response.status);
  const body = await response.json();
  return Array.isArray(body.devices)
    ? body.devices
        .map(normalizeSpotifyDevice)
        .filter(
          (device: SpotifyDevice | null): device is SpotifyDevice =>
            device !== null,
        )
    : [];
}
export async function requestSpotifyCommand(
  token: string,
  command: SpotifyCommand,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!command.deviceId || command.deviceId.length > 300)
    throw new Error("Selecciona un dispositivo de Spotify.");
  const routes = {
    play: "play",
    pause: "pause",
    next: "next",
    previous: "previous",
    seek: "seek",
    transfer: "",
  } as const;
  if (!Object.hasOwn(routes, command.action))
    throw new Error("Control de Spotify inválido.");
  const query = new URLSearchParams({ device_id: command.deviceId });
  let body: unknown;
  if (command.action === "seek") {
    if (
      !Number.isFinite(command.position) ||
      command.position! < 0 ||
      command.position! > 86_400_000
    )
      throw new Error("Posición de reproducción inválida.");
    query.set("position_ms", String(Math.round(command.position!)));
  }
  if (command.action === "play" && command.url) {
    const embed = spotifyEmbed(command.url);
    const match = embed?.match(/\/(album|playlist|track)\/([a-zA-Z0-9]{22})$/);
    if (!match)
      throw new Error(
        "Usa un enlace de Spotify a un álbum, playlist o canción.",
      );
    const uri = `spotify:${match[1]}:${match[2]}`;
    body = match[1] === "track" ? { uris: [uri] } : { context_uri: uri };
  }
  if (command.action === "transfer")
    body = { device_ids: [command.deviceId], play: command.play === true };
  const response = await fetcher(
    `https://api.spotify.com/v1/me/player${command.action === "transfer" ? "" : `/${routes[command.action]}?${query}`}`,
    {
      method: ["next", "previous"].includes(command.action) ? "POST" : "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw spotifyError(response.status);
}
export async function requestSpotifyVolume(
  accessToken: string,
  deviceId: string,
  volume: number,
  fetcher: typeof fetch = fetch,
): Promise<number> {
  if (!Number.isFinite(volume) || !deviceId || deviceId.length > 300)
    throw new Error("No hay un volumen o dispositivo válido.");
  const percent = Math.max(0, Math.min(100, Math.round(volume)));
  const query = new URLSearchParams({
    volume_percent: String(percent),
    device_id: deviceId,
  });
  const response = await fetcher(
    `https://api.spotify.com/v1/me/player/volume?${query}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? "Spotify no permite cambiar el volumen. Requiere Premium, permiso de reproducción y un dispositivo compatible."
        : response.status === 404
          ? "No hay un dispositivo activo. Abre Spotify, reproduce algo y pulsa Actualizar."
          : response.status === 429
            ? "Spotify pidió esperar antes de cambiar el volumen de nuevo."
            : "Spotify no pudo ajustar el volumen. Inténtalo de nuevo.",
    );
  return percent;
}
