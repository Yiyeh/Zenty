import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { translateMessage, tr } from "../lib/i18n.ts";
import { useEffect, useState } from "react";
import { Copy, Wifi } from "lucide-react";
import type { LanStatus } from "../../server/lan-server";
export function LanSettings() {
  useInterfaceLocale();
  const [state, setState] = useState<LanStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  useEffect(() => {
    let active = true;
    const load = () => { void window.zentyDesktop?.lan.get().then((value) => { if (active) setState(value); }).catch(() => { if (active) setError(tr("LanSettings.da638a5b73")); }); };
    load(); const timer = setInterval(load, 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  if (!window.zentyDesktop?.lan) return null;
  return <fieldset className="lan-settings"><legend><Wifi size={16} /> {tr("LanSettings.413927a28c")}</legend>
    <label className="switch-row"><span>{tr("LanSettings.cb124d2647")}</span><input type="checkbox" role="switch" checked={state?.enabled || false} disabled={!state || busy} onChange={async (event) => {
      const enabled = event.target.checked; setBusy(true); setError(""); setCopied("");
      try { setState(await window.zentyDesktop!.lan.set(enabled)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }} /></label>
    <p className="muted">{tr("LanSettings.fcf1291922")}</p>
    {state?.enabled && <div className="lan-details"><p><strong>{tr("LanSettings.5d61301a9a")}</strong></p>
      {state.urls.map((url) => <div className="lan-url" key={url}><div><small>{state.connections?.find((item) => item.url === url)?.name}</small><a href={url} target="_blank" rel="noreferrer">{url}</a></div><button type="button" className="icon-button" aria-label={tr("LanSettings.65c736104f", { v0: url })} onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(url); } catch { setError(tr("LanSettings.a54c1e2cb7")); } }}><Copy size={16} /></button></div>)}
      {!state.urls.length && <p role="status">{tr("LanSettings.ff10e8b121")}</p>}
      <p>{tr("LanSettings.721a47aca8")}<strong className="lan-code">{state.code}</strong></p><p className="muted">{tr("LanSettings.5d0eb57d59")}</p>
      <p className="muted">{tr("LanSettings.ad4ccc6fdb")}</p>
      {copied && <p role="status">{tr("LanSettings.71ec1e3877")}</p>}
    </div>}
    {state && <button type="button" className="secondary-button" disabled={busy} onClick={async () => {
        setBusy(true); setError("");
        try { setState(await window.zentyDesktop!.lan.forget()); setCopied(""); }
        catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>{tr("LanSettings.9647bebfe4")}{state.enabled ? ` (${state.pairedDevices})` : ""}</button>}
    {error && <p className="error-message" role="alert">{translateMessage(error)}</p>}
  </fieldset>;
}
