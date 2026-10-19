import { useEffect, useState } from "react";
import { CloudSun, MapPin, Search, RefreshCw } from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
type Place = {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
};
const condition = (code: number) =>
  code === 0
    ? "Despejado"
    : code <= 3
      ? "Parcialmente nublado"
      : code <= 48
        ? "Niebla"
        : code <= 67
          ? "Lluvia"
          : code <= 77
            ? "Nieve"
            : code <= 82
              ? "Chubascos"
              : "Tormentas";
export function WeatherWidget() {
  const { settings, setSettings } = useDashboard();
  const place = settings.weatherLocation;
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [editing, setEditing] = useState(!place);
  const [weather, setWeather] = useState<{
    temperature: number;
    code: number;
    min: number;
    max: number;
    updated: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!place) return;
    const controller = new AbortController();
    let disposed = false;
    setBusy(true);
    setError("");
    setWeather(null);
    const timeout = setTimeout(() => {
      if (!disposed) {
        setError("La consulta tardó demasiado. Vuelve a intentarlo.");
        setBusy(false);
      }
      controller.abort();
    }, 15000);
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`,
      { signal: controller.signal },
    )
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (!controller.signal.aborted)
          setWeather({
            temperature: data.current.temperature_2m,
            code: data.current.weather_code,
            min: data.daily.temperature_2m_min[0],
            max: data.daily.temperature_2m_max[0],
            updated: new Date().toLocaleTimeString("es", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("No se pudo consultar el tiempo. Vuelve a intentarlo.");
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => {
      disposed = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [place, refresh]);
  useEffect(() => {
    if (!place) return;
    const interval = setInterval(() => setRefresh((n) => n + 1), 1800000);
    return () => clearInterval(interval);
  }, [place]);
  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=5&language=es&format=json`,
        { signal: AbortSignal.timeout(15000) },
      );
      if (!response.ok) throw new Error();
      const data = await response.json();
      setPlaces(data.results || []);
      if (!data.results?.length)
        setError(
          "No encontramos esa ciudad. Prueba con un nombre más completo.",
        );
    } catch {
      setError("No se pudo buscar la ciudad. Revisa tu conexión.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="glass-panel weather-card">
      <div className="widget-heading">
        <h3>
          <CloudSun size={17} /> Fuera de tu ventana
        </h3>
        <button
          className="icon-button"
          aria-label="Cambiar ciudad del tiempo"
          onClick={() => setEditing(!editing)}
        >
          <MapPin size={15} />
        </button>
      </div>
      {editing && (
        <div className="form-stack">
          <form className="inline-form" onSubmit={find}>
            <input
              aria-label="Ciudad del tiempo"
              placeholder="Busca tu ciudad…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              minLength={2}
              required
            />
            <button
              className="icon-button"
              aria-label="Buscar ciudad"
              disabled={busy}
            >
              <Search size={17} />
            </button>
          </form>
          {places.map((p, index) => (
            <button
              className="place-result"
              key={index}
              onClick={() => {
                setSettings((s) => ({
                  ...s,
                  weatherLocation: {
                    name: p.name,
                    latitude: p.latitude,
                    longitude: p.longitude,
                  },
                }));
                setEditing(false);
                setPlaces([]);
              }}
            >
              {p.name} · {p.admin1 ? `${p.admin1}, ` : ""}
              {p.country}
            </button>
          ))}
          <small>
            Se consulta la ciudad elegida a Open-Meteo. No se solicita tu
            ubicación precisa.
          </small>
        </div>
      )}
      {weather && (
        <div className="weather-content">
          <CloudSun size={45} strokeWidth={1.3} />
          <div>
            <strong>{Math.round(weather.temperature)}°</strong>
            <span>
              {condition(weather.code)} · {place?.name}
            </span>
            <small>
              Máx. {Math.round(weather.max)}° · Mín. {Math.round(weather.min)}°
            </small>
          </div>
        </div>
      )}
      {busy && (
        <p className="muted" role="status">
          Consultando el tiempo…
        </p>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {place && (
        <div className="music-footer">
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Open-Meteo{weather ? ` · ${weather.updated}` : ""}
          </a>
          <button
            className="icon-button"
            aria-label="Actualizar el tiempo"
            disabled={busy}
            onClick={() => setRefresh((n) => n + 1)}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      )}
    </section>
  );
}
