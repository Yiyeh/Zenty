import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { tr } from "../lib/i18n.ts";
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
  useInterfaceLocale();
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
          aria-label={`${visible ? tr("IntegrationsPanel.dd68077287") : tr("IntegrationsPanel.5c492f37a6")} ${label}`}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      <small>
        {value
          ? tr("IntegrationsPanel.46b2277171")
          : tr("IntegrationsPanel.bc38e9438c")}
      </small>
    </div>
  );
}
export function IntegrationsPanel() {
  useInterfaceLocale();
  const { settings, setSettings } = useDashboard();
  const i = useIntegrations();
  const redirect = location.origin + location.pathname;
  if (isRemoteLibrary) return <div className="form-stack integrations-panel"><div className="info-banner"><ShieldCheck size={20}/><p>{tr("IntegrationsPanel.c4195744c9")}</p></div><section className="integration-card"><h3>{tr("IntegrationsPanel.7005c0064b")}</h3><p>{i.spotifyConnected ? `Conectado · ${i.spotifyName || tr("IntegrationsPanel.fa82a9b951")}` : tr("IntegrationsPanel.f81a8a4ae9")}</p><p className="muted">{tr("IntegrationsPanel.079796b1f9")}</p><button className="secondary-button" onClick={() => void i.refreshSpotify()}>{tr("IntegrationsPanel.1e850dd4cd")}</button>{i.spotifyError && <p role="alert">{i.spotifyError}</p>}</section><section className="integration-card"><h3>{tr("IntegrationsPanel.b074310e91")}</h3><p>{i.googleConnected ? `Conectado · ${i.events.length} eventos` : tr("IntegrationsPanel.f81a8a4ae9")}</p><button className="secondary-button" onClick={() => void i.refreshCalendar()}>{tr("IntegrationsPanel.e812cff079")}</button>{i.googleError && <p role="alert">{i.googleError}</p>}</section></div>;
  return (
    <div className="form-stack integrations-panel">
      <div className="info-banner">
        <ShieldCheck size={20} />
        <p>
          {tr("IntegrationsPanel.edd7ce357b")}{window.zentyDesktop
            ? tr("IntegrationsPanel.9ba8042bf9")
            : tr("IntegrationsPanel.f08d665ff8")}
          {" "}{tr("IntegrationsPanel.cba3ba287c")}</p>
      </div>
      <section className="integration-card">
        <div className="integration-heading">
          <span className="service-logo spotify-logo">
            <Music2 size={24} />
          </span>
          <div>
            <h3>{tr("IntegrationsPanel.7005c0064b")}</h3>
            <p>
              {i.spotifyConnected
                ? i.spotifyName || tr("IntegrationsPanel.7b35a0a0b9")
                : tr("IntegrationsPanel.cf50d64a80")}
            </p>
          </div>
          <span
            className={`status-pill ${i.spotifyConnected ? "connected" : ""}`}
          >
            {i.spotifyConnected ? tr("IntegrationsPanel.7444e37ea6") : tr("IntegrationsPanel.48e64302cb")}
          </span>
        </div>
        <p className="muted">
          {tr("IntegrationsPanel.b6858505fe")}</p>
        <ClientIdField
          label={tr("IntegrationsPanel.ab9b9f6058")}
          value={settings.spotifyClientId}
          onChange={(value) =>
            setSettings((p) => ({ ...p, spotifyClientId: value }))
          }
          placeholder={tr("IntegrationsPanel.1ca9675394")}
        />
        <details>
          <summary>{tr("IntegrationsPanel.ae5bff8c9c")}</summary>
          <ol>
            <li>
              {tr("IntegrationsPanel.3f462607bd")}{" "}
              <a
                href="https://developer.spotify.com/dashboard"
                target="_blank"
                rel="noreferrer"
              >
                {tr("IntegrationsPanel.5113c89ca9")}<ExternalLink size={12} />
              </a>
              .
            </li>
            <li>
              {tr("IntegrationsPanel.b6b40d588c")}{" "}
              <code>{redirect}</code>{tr("IntegrationsPanel.ccac7b4ec9")}{" "}
              <code>{tr("IntegrationsPanel.f91f474a9c")}</code>{tr("IntegrationsPanel.73d669dc48")}</li>
            <li>{tr("IntegrationsPanel.e2890d8f3f")}</li>
            <li>
              {tr("IntegrationsPanel.5de8c61b0f")}</li>
          </ol>
          <a
            href="https://developer.spotify.com/documentation/web-api/concepts/quota-modes"
            target="_blank"
            rel="noreferrer"
          >
            {tr("IntegrationsPanel.e8b44dc708")}<ExternalLink size={12} />
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
                <RefreshCw size={15} /> {tr("IntegrationsPanel.56f0039eec")}</button>
              <button
                className="text-button danger"
                onClick={i.disconnectSpotify}
              >
                <LogOut size={15} /> {tr("IntegrationsPanel.4eb0ae820f")}</button>
            </>
          ) : (
            <button
              className="primary-button"
              disabled={i.spotifyBusy || !settings.spotifyClientId}
              onClick={() => void i.connectSpotify()}
            >
              <LogIn size={16} />{" "}
              {i.spotifyBusy ? tr("IntegrationsPanel.cc190ab9f5") : tr("IntegrationsPanel.153fbd6f3d")}
            </button>
          )}
        </div>
        <small>
          {tr("IntegrationsPanel.b79fd75140")}{" "}
          <a
            href="https://www.spotify.com/account/apps/"
            target="_blank"
            rel="noreferrer"
          >
            {tr("IntegrationsPanel.def3ad31fd")}</a>
          .
        </small>
      </section>
      <section className="integration-card">
        <div className="integration-heading">
          <span className="service-logo calendar-logo">
            <CalendarDays size={24} />
          </span>
          <div>
            <h3>{tr("IntegrationsPanel.b074310e91")}</h3>
            <p>{tr("IntegrationsPanel.0f1d2c53cf")}</p>
          </div>
          <span
            className={`status-pill ${i.googleConnected ? "connected" : ""}`}
          >
            {i.googleConnected ? tr("IntegrationsPanel.7444e37ea6") : tr("IntegrationsPanel.48e64302cb")}
          </span>
        </div>
        <p className="muted">
          {tr("IntegrationsPanel.ff1fb718de")}{APP_NAME}.
        </p>
        <ClientIdField
          label={tr("IntegrationsPanel.46f82d887a")}
          value={settings.googleClientId}
          onChange={(value) =>
            setSettings((p) => ({ ...p, googleClientId: value }))
          }
          placeholder={tr("IntegrationsPanel.a73b424993")}
        />
        <details>
          <summary>{tr("IntegrationsPanel.0cb6b84273")}</summary>
          <ol>
            <li>
              {tr("IntegrationsPanel.fb92c7e381")}{" "}
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
              >
                {tr("IntegrationsPanel.187e622fcf")}<ExternalLink size={12} />
              </a>
              {tr("IntegrationsPanel.2054eaa4f5")}</li>
            <li>
              {tr("IntegrationsPanel.b08ac404d0")}</li>
            <li>
              {tr("IntegrationsPanel.96d8ad855c")}{" "}
              <code>{location.origin}</code> {tr("IntegrationsPanel.3dc28a20f4")}</li>
            <li>
              {tr("IntegrationsPanel.8adbba130f")}</li>
          </ol>
          <p>
            {tr("IntegrationsPanel.6be8d2eb49")}</p>
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
                <RefreshCw size={15} /> {tr("IntegrationsPanel.56f0039eec")}</button>
              <button
                className="text-button danger"
                onClick={i.disconnectGoogle}
              >
                <LogOut size={15} /> {tr("IntegrationsPanel.4eb0ae820f")}</button>
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
                ? tr("IntegrationsPanel.cc190ab9f5")
                : settings.googleClientId && !i.googleReady
                  ? tr("IntegrationsPanel.75ba5c5f9f")
                  : tr("IntegrationsPanel.6549ed52d3")}
            </button>
          )}
        </div>
        <small>
          {tr("IntegrationsPanel.16d03e324c")}</small>
      </section>
      <div className="info-banner">
        <Link2 size={20} />
        <p>
          {tr("IntegrationsPanel.4d724de980")}</p>
      </div>
    </div>
  );
}
