import { useEffect, useState } from "react";
import { Copy, Wifi } from "lucide-react";
import type { LanStatus } from "../../server/lan-server";
export function LanSettings() {
  const [state, setState] = useState<LanStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  useEffect(() => {
    let active = true;
    const load = () => { void window.zentyDesktop?.lan.get().then((value) => { if (active) setState(value); }).catch(() => { if (active) setError("No se pudo consultar el servidor web."); }); };
    load(); const timer = setInterval(load, 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  if (!window.zentyDesktop?.lan) return null;
  return <fieldset className="lan-settings"><legend><Wifi size={16} /> Acceso desde otros dispositivos</legend>
    <label className="switch-row"><span>Abrir servidor web en la red local</span><input type="checkbox" role="switch" checked={state?.enabled || false} disabled={!state || busy} onChange={async (event) => {
      const enabled = event.target.checked; setBusy(true); setError(""); setCopied("");
      try { setState(await window.zentyDesktop!.lan.set(enabled)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }} /></label>
    <p className="muted">Abre Zenty completo desde el teléfono o iPad en el mismo Wi-Fi. Desactivado por defecto; se apaga al cerrar Zenty.</p>
    {state?.enabled && <div className="lan-details"><p><strong>Abre esta dirección en el otro dispositivo:</strong></p>
      {state.urls.map((url) => <div className="lan-url" key={url}><div><small>{state.connections?.find((item) => item.url === url)?.name}</small><a href={url} target="_blank" rel="noreferrer">{url}</a></div><button type="button" className="icon-button" aria-label={`Copiar ${url}`} onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(url); } catch { setError("Selecciona y copia la dirección manualmente."); } }}><Copy size={16} /></button></div>)}
      {!state.urls.length && <p role="status">No encontramos una dirección de red local. Conecta este PC al Wi-Fi o por cable.</p>}
      <p>Código de acceso: <strong className="lan-code">{state.code}</strong></p><p className="muted">El código cambia al volver a activar el servidor. Los dispositivos recordados conservan su acceso durante 90 días. Tareas, notas, agenda, personalización, libros y progreso se sincronizan con el PC. Si aparecen varias direcciones, usa la de tu conexión Wi-Fi o Ethernet.</p>
      <p className="muted">Si Windows solicita permiso, permite el acceso en redes privadas. El PC debe estar encendido y Zenty abierto.</p>
      {copied && <p role="status">Dirección copiada.</p>}
    </div>}
    {state && <button type="button" className="secondary-button" disabled={busy} onClick={async () => {
        setBusy(true); setError("");
        try { setState(await window.zentyDesktop!.lan.forget()); setCopied(""); }
        catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>Olvidar dispositivos{state.enabled ? ` (${state.pairedDevices})` : ""}</button>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </fieldset>;
}
