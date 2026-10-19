import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { translateMessage, tr } from "../lib/i18n.ts";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import type { PinState } from "../lib/security";
import { APP_NAME } from "../lib/brand";
import { LanguageSelector } from "./LanguageSelector";

const pinError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("security.wait")) return tr("PinSecurity.8025a2d57b");
  if (message.includes("security.incorrect")) return tr("PinSecurity.25ee9f60e8");
  if (message.includes("security.invalid")) return tr("PinSecurity.c51ce19480");
  return tr("PinSecurity.9d9928cad6");
};

export function PinGate({ children }: { children: ReactNode }) {
  useInterfaceLocale();
  const api = window.zentyDesktop?.security;
  const [state, setState] = useState<PinState | null>(null);
  const [pin, setPin] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!api) return;
    const remove = api.onState(setState);
    void api.get().then(setState).catch(() => setError(tr("PinSecurity.dba05fece2")));
    return remove;
  }, [api]);
  useEffect(() => {
    if (!state?.retryAfter) return;
    const timer = setInterval(() => void api?.get().then(setState), 1000);
    return () => clearInterval(timer);
  }, [api, state?.retryAfter]);
  if (!api || (state && !state.locked)) return children;
  return <main className="pin-lock-screen"><form className="pin-lock-card form-stack" onSubmit={async (event) => {
    event.preventDefault(); if (busy || !state || state.retryAfter || state.damaged) return;
    setBusy(true); setError("");
    try { setState(await (recovery ? api.recover(pin.trim().toLowerCase().replace(/[-\s]/g, "")) : api.unlock(pin))); setPin(""); }
    catch (cause) { setError(pinError(cause)); setPin(""); }
    finally { setBusy(false); }
  }}>
    <LockKeyhole size={30} aria-hidden="true" />
    <h1>{APP_NAME}</h1>
    <LanguageSelector />
    <p>{recovery ? tr("PinSecurity.dc8549e8f3") : tr("PinSecurity.31c820ec5d")}</p>
    {state?.damaged ? <p role="alert">{tr("PinSecurity.fd9954c4b9")}</p> : <label>{recovery ? tr("PinSecurity.4841a70c13") : tr("PinSecurity.709e58acb6")}<input autoFocus type="password" inputMode={recovery ? "text" : "numeric"} autoComplete="off" maxLength={recovery ? 48 : 12} pattern={recovery ? undefined : "[0-9]{6,12}"} required value={pin} onChange={event => setPin(event.target.value)} disabled={!state || busy} /></label>}
    {error && <p role="alert" className="form-error">{translateMessage(error)}</p>}
    {!!state?.retryAfter && <p role="status">{tr("PinSecurity.87105ac7f5")}{state.retryAfter} {tr("PinSecurity.8c9353b744")}</p>}
    <button className="primary-button" disabled={!state || busy || !!state.retryAfter || state.damaged}>{busy ? tr("PinSecurity.d2a7094a2b") : recovery ? tr("PinSecurity.8f849bdb82") : tr("PinSecurity.d4c2d75416")}</button>
    <button type="button" className="text-button" disabled={busy} onClick={() => { setRecovery(!recovery); setPin(""); setError(""); }}>{recovery ? tr("PinSecurity.1c4d72aec5") : tr("PinSecurity.e02349e36e")}</button>
  </form></main>;
}

export function PinSettings() {
  useInterfaceLocale();
  const api = window.zentyDesktop?.security;
  const [state, setState] = useState<PinState | null>(null);
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [recovery, setRecovery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void api?.get().then(setState).catch(() => setError(tr("PinSecurity.15ffde1290"))); }, [api]);
  if (!api) return null;
  const run = async (action: "configure" | "disable" | "lock") => {
    if (busy) return;
    setError("");
    if (action === "configure" && (!/^\d{6,12}$/.test(pin) || pin !== confirm)) { setError(tr("PinSecurity.7da8bf4ff0")); return; }
    setBusy(true);
    try {
      const result = action === "configure" ? await api.configure(current, pin) : action === "disable" ? await api.disable(current) : await api.lock();
      setState(result); setCurrent(""); setPin(""); setConfirm("");
      if ("recovery" in result && typeof result.recovery === "string") setRecovery(result.recovery);
    } catch (cause) { setError(pinError(cause)); }
    finally { setBusy(false); }
  };
  return <fieldset className="pin-settings"><legend><ShieldCheck size={16} /> {tr("PinSecurity.00c3a10a2e")}</legend>
    <p>{tr("PinSecurity.14b40bdc1a")}</p>
    <p className="muted">{tr("PinSecurity.cb2ef66b04")}</p>
    {recovery ? <div className="pin-recovery" role="status"><strong>{tr("PinSecurity.831b447dcc")}</strong><p>{tr("PinSecurity.44b79840d1")}</p><code>{recovery.match(/.{1,4}/g)?.join("-")}</code><button type="button" className="secondary-button" onClick={() => setRecovery("")}>{tr("PinSecurity.437ca47340")}</button></div> : <>
      <p>{state?.enabled ? tr("PinSecurity.6bf655ccd6") : tr("PinSecurity.2485563b0d")}</p>
      {state?.enabled && <label>{tr("PinSecurity.ca2c483aef")}<input type="password" inputMode="numeric" autoComplete="off" maxLength={12} value={current} onChange={event => setCurrent(event.target.value)} /></label>}
      <label>{state?.enabled ? tr("PinSecurity.57f5c83e92") : tr("PinSecurity.7c30b8327b")}<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={12} value={pin} onChange={event => setPin(event.target.value)} /></label>
      <label>{tr("PinSecurity.2082388ad4")}<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={12} value={confirm} onChange={event => setConfirm(event.target.value)} /></label>
      <div className="dialog-actions"><button type="button" className="primary-button" disabled={!state || busy} onClick={() => void run("configure")}>{state?.enabled ? tr("PinSecurity.52519a89b7") : tr("PinSecurity.ac53e4d47d")}</button>{state?.enabled && <><button type="button" className="secondary-button" disabled={busy} onClick={() => void run("disable")}>{tr("PinSecurity.7b8336e227")}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void run("lock")}>{tr("PinSecurity.ca9a1a3bfc")}</button></>}</div>
    </>}
    {error && <p className="form-error" role="alert">{translateMessage(error)}</p>}
  </fieldset>;
}
