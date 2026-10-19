import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { translateMessage, tr } from "../lib/i18n.ts";
import {useEffect,useState} from "react";
import {Download,RefreshCw} from "lucide-react";
import type {UpdateState} from "../lib/updates";
export function UpdateSettings() {
  useInterfaceLocale();
  const [state,setState]=useState<UpdateState|null>(null);
  useEffect(()=>{const api=window.zentyDesktop?.updates;if(!api)return;let active=true;void api.get().then(value=>{if(active)setState(value);});const remove=api.onState(setState);return()=>{active=false;remove();};},[]);
  if(!state)return null;
  const api=window.zentyDesktop!.updates;
  const busy=["checking","downloading","installing"].includes(state.phase);
  return <fieldset className="update-settings"><legend><Download size={16}/> {tr("UpdateSettings.abd785af18")}</legend><p>{tr("UpdateSettings.83a002ca96")}<strong>{state.version}</strong>{state.latestVersion && state.latestVersion!==state.version && <> {tr("UpdateSettings.6a2e2aaea6")}<strong>{state.latestVersion}</strong></>}</p><p role="status" className="muted">{translateMessage(state.message)}</p>
    {state.phase==="downloading" && <progress aria-label={tr("UpdateSettings.400aeea901")} value={state.percent} max={100}/>}
    <div className="update-actions"><button className="secondary-button" disabled={!state.supported||busy} onClick={()=>void api.check().then(setState)}><RefreshCw size={15}/> {tr("UpdateSettings.2a588112bc")}</button>
    {state.phase==="available" && <button className="primary-button" onClick={()=>void api.download().then(setState)}><Download size={15}/> {tr("UpdateSettings.4c3ce72339")}</button>}
    {state.phase==="downloaded" && <button className="primary-button" onClick={()=>void api.install().then(setState)}>{tr("UpdateSettings.62ac2749f0")}</button>}
    <a href={state.releaseUrl} target="_blank" rel="noreferrer" className="text-button">{tr("UpdateSettings.a868878f6a")}</a></div>
    {state.notes && <details><summary>{tr("UpdateSettings.1b80511cdc")}</summary><p className="update-notes">{state.notes}</p></details>}
    {state.supported && <p className="muted">{tr("UpdateSettings.d409b9c909")}</p>}
  </fieldset>;
}
