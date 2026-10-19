import { isRemoteLibrary } from "../lib/remote";
import { APP_NAME } from "../lib/brand.ts";
import {
  CalendarDays,
  Music2,
  ExternalLink,
  LogIn,
  LogOut,
  RefreshCw,
  Link2,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useDashboard } from "../context/DashboardStore";
import { useIntegrations } from "../context/IntegrationsStore";
function ClientIdField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), 30000);
    const hide = () => {
      if (document.hidden) setVisible(false);
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [visible]);
  return (
    <div className="client-id-field">
      <label htmlFor={id}>{label}</label>
      <div className="client-id-input">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="icon-button"
          aria-label={`${visible ? "Ocultar" : "Mostrar"} ${label}`}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      <small>
        {value
          ? "Configurado. Se oculta automáticamente después de 30 segundos."
          : "Usa el identificador público de tu aplicación."}
      </small>
    </div>
  );
}
export function IntegrationsPanel() {
  const { settings, setSettings } = useDashboard();
  const i = useIntegrations();
  const redirect = location.origin + location.pathname;
  if (isRemoteLibrary) return <div className="form-stack integrations-panel"><div className="info-banner"><ShieldCheck size={20}/><p>Usas las conexiones del PC anfitrión. Las credenciales permanecen en el PC; conecta o desconecta las cuentas desde allí.</p></div><section className="integration-card"><h3>Spotify</h3><p>{i.spotifyConnected ? `Conectado · ${i.spotifyName || "Cuenta del PC"}` : "Sin conectar en el PC"}</p><p className="muted">Controla la música y el volumen desde el widget de inicio.</p><button className="secondary-button" onClick={() => void i.refreshSpotify()}>Actualizar Spotify</button>{i.spotifyError && <p role="alert">{i.spotifyError}</p>}</section><section className="integration-card"><h3>Google Calendar</h3><p>{i.googleConnected ? `Conectado · ${i.events.length} eventos` : "Sin conectar en el PC"}</p><button className="secondary-button" onClick={() => void i.refreshCalendar()}>Actualizar agenda</button>{i.googleError && <p role="alert">{i.googleError}</p>}</section></div>;
  return (
    <div className="form-stack integrations-panel">
      <div className="info-banner">
        <ShieldCheck size={20} />
        <p>
          Tú decides qué conectar. La autorización ocurre en cada servicio. Los
          {window.zentyDesktop
            ? "datos de acceso de Spotify se guardan cifrados en tu perfil de Windows para recordar la conexión."
            : "datos de acceso de Spotify se conservan en este navegador para recordar la conexión."}
          {" "}Google se conserva solo en memoria. Las credenciales no se incluyen en tus respaldos.
        </p>
      </div>
      <section className="integration-card">
        <div className="integration-heading">
          <span className="service-logo spotify-logo">
            <Music2 size={24} />
          </span>
          <div>
            <h3>Spotify</h3>
            <p>
              {i.spotifyConnected
                ? i.spotifyName || "Cuenta autorizada"
                : "Tu música, dentro de tu espacio"}
            </p>
          </div>
          <span
            className={`status-pill ${i.spotifyConnected ? "connected" : ""}`}
          >
            {i.spotifyConnected ? "Conectado" : "Sin conectar"}
          </span>
        </div>
        <p className="muted">
          Conecta tu cuenta para ver qué está sonando, o pega una playlist en el
          widget para usar el reproductor oficial.
        </p>
        <ClientIdField
          label="Client ID público de Spotify"
          value={settings.spotifyClientId}
          onChange={(value) =>
            setSettings((p) => ({ ...p, spotifyClientId: value }))
          }
          placeholder="Client ID de tu aplicación"
        />
        <details>
          <summary>Configurar mi aplicación de Spotify</summary>
          <ol>
            <li>
              Crea una aplicación en{" "}
              <a
                href="https://developer.spotify.com/dashboard"
                target="_blank"
                rel="noreferrer"
              >
                Spotify for Developers <ExternalLink size={12} />
              </a>
              .
            </li>
            <li>
              Activa Web API y añade esta Redirect URI exacta:{" "}
              <code>{redirect}</code>. Para desarrollo usa{" "}
              <code>http://127.0.0.1:5173/</code>; Spotify no acepta localhost.
            </li>
            <li>Copia el Client ID aquí. No uses un Client Secret.</li>
            <li>
              Autoriza tu cuenta como usuario de prueba de la aplicación. El
              acceso depende de las restricciones y del plan exigido por
              Spotify.
            </li>
          </ol>
          <a
            href="https://developer.spotify.com/documentation/web-api/concepts/quota-modes"
            target="_blank"
            rel="noreferrer"
          >
            Consultar requisitos actuales <ExternalLink size={12} />
          </a>
        </details>
        {i.spotifyError && (
          <p className="error-message" role="alert">
            {i.spotifyError}
          </p>
        )}
        <div className="form-row">
          {i.spotifyConnected ? (
            <>
              <button
                className="secondary-button"
                disabled={i.spotifyBusy}
                onClick={() => void i.refreshSpotify()}
              >
                <RefreshCw size={15} /> Actualizar
              </button>
              <button
                className="text-button danger"
                onClick={i.disconnectSpotify}
              >
                <LogOut size={15} /> Desconectar
              </button>
            </>
          ) : (
            <button
              className="primary-button"
              disabled={i.spotifyBusy || !settings.spotifyClientId}
              onClick={() => void i.connectSpotify()}
            >
              <LogIn size={16} />{" "}
              {i.spotifyBusy ? "Conectando…" : "Ingresar con Spotify"}
            </button>
          )}
        </div>
        <small>
          Lectura del perfil y reproducción; el control de volumen solicita
          permiso adicional al activarlo. Al desconectar se borra la sesión
          local. Puedes revocar el permiso en{" "}
          <a
            href="https://www.spotify.com/account/apps/"
            target="_blank"
            rel="noreferrer"
          >
            tu cuenta de Spotify
          </a>
          .
        </small>
      </section>
      <section className="integration-card">
        <div className="integration-heading">
          <span className="service-logo calendar-logo">
            <CalendarDays size={24} />
          </span>
          <div>
            <h3>Google Calendar</h3>
            <p>Tu agenda de los próximos siete días</p>
          </div>
          <span
            className={`status-pill ${i.googleConnected ? "connected" : ""}`}
          >
            {i.googleConnected ? "Conectado" : "Sin conectar"}
          </span>
        </div>
        <p className="muted">
          Consulta los eventos de tu calendario principal. Tus bloques
          personales continúan guardándose en {APP_NAME}.
        </p>
        <ClientIdField
          label="Client ID OAuth de Google"
          value={settings.googleClientId}
          onChange={(value) =>
            setSettings((p) => ({ ...p, googleClientId: value }))
          }
          placeholder="….apps.googleusercontent.com"
        />
        <details>
          <summary>Configurar mi aplicación de Google</summary>
          <ol>
            <li>
              En{" "}
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
              >
                Google Cloud Console <ExternalLink size={12} />
              </a>
              , habilita Google Calendar API.
            </li>
            <li>
              Configura la pantalla de consentimiento y añade tu cuenta como
              usuario de prueba si la aplicación está en pruebas.
            </li>
            <li>
              Crea un Client ID OAuth de tipo Aplicación web. Añade{" "}
              <code>{location.origin}</code> como origen de JavaScript
              autorizado.
            </li>
            <li>
              Copia el Client ID aquí y autoriza la lectura de eventos. No se
              necesita Client Secret.
            </li>
          </ol>
          <p>
            Google requiere renovar el acceso cuando vence. Para sincronización
            continua y varias cuentas se necesita un servidor con almacenamiento
            seguro de credenciales.
          </p>
        </details>
        {i.googleError && (
          <p className="error-message" role="alert">
            {i.googleError}
          </p>
        )}
        <div className="form-row">
          {i.googleConnected ? (
            <>
              <button
                className="secondary-button"
                disabled={i.googleBusy}
                onClick={() => void i.refreshCalendar()}
              >
                <RefreshCw size={15} /> Actualizar
              </button>
              <button
                className="text-button danger"
                onClick={i.disconnectGoogle}
              >
                <LogOut size={15} /> Desconectar
              </button>
            </>
          ) : (
            <button
              className="primary-button"
              disabled={
                i.googleBusy || !settings.googleClientId || !i.googleReady
              }
              onClick={i.connectGoogle}
            >
              <LogIn size={16} />{" "}
              {i.googleBusy
                ? "Conectando…"
                : settings.googleClientId && !i.googleReady
                  ? "Preparando Google…"
                  : "Ingresar con Google"}
            </button>
          )}
        </div>
        <small>
          Permiso de solo lectura de eventos. Desconectar revoca la autorización
          de Google.
        </small>
      </section>
      <div className="info-banner">
        <Link2 size={20} />
        <p>
          Notion, GitHub, Gmail y otras aplicaciones pueden añadirse como
          accesos rápidos. La sincronización de sus datos requiere una
          integración específica; los accesos abren el servicio con tu sesión
          habitual.
        </p>
      </div>
    </div>
  );
}
