import {useEffect,useState} from "react";
import {Download,RefreshCw} from "lucide-react";
import type {UpdateState} from "../lib/updates";
export function UpdateSettings() {
  const [state,setState]=useState<UpdateState|null>(null);
  useEffect(()=>{const api=window.zentyDesktop?.updates;if(!api)return;let active=true;void api.get().then(value=>{if(active)setState(value);});const remove=api.onState(setState);return()=>{active=false;remove();};},[]);
  if(!state)return null;
  const api=window.zentyDesktop!.updates;
  const busy=["checking","downloading","installing"].includes(state.phase);
  return <fieldset className="update-settings"><legend><Download size={16}/> Actualizaciones de Zenty</legend><p>Versión instalada: <strong>{state.version}</strong>{state.latestVersion && state.latestVersion!==state.version && <> · Disponible: <strong>{state.latestVersion}</strong></>}</p><p role="status" className="muted">{state.message}</p>
    {state.phase==="downloading" && <progress aria-label="Descarga de la actualización" value={state.percent} max={100}/>}
    <div className="update-actions"><button className="secondary-button" disabled={!state.supported||busy} onClick={()=>void api.check().then(setState)}><RefreshCw size={15}/> Buscar actualizaciones</button>
    {state.phase==="available" && <button className="primary-button" onClick={()=>void api.download().then(setState)}><Download size={15}/> Descargar actualización</button>}
    {state.phase==="downloaded" && <button className="primary-button" onClick={()=>void api.install().then(setState)}>Reiniciar y actualizar</button>}
    <a href={state.releaseUrl} target="_blank" rel="noreferrer" className="text-button">Ver versiones en GitHub</a></div>
    {state.notes && <details><summary>Novedades de la versión</summary><p className="update-notes">{state.notes}</p></details>}
    {state.supported && <p className="muted">Comprueba novedades al iniciar y cada seis horas. Solo descarga al pulsar el botón. Al actualizar guarda tu espacio y respalda ajustes e índices en tu perfil; los documentos originales permanecen en su carpeta.</p>}
  </fieldset>;
}
