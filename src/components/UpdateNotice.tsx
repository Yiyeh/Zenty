import {useEffect,useState} from "react";
import {Download} from "lucide-react";
import type {UpdateState} from "../lib/updates";
export function UpdateNotice() {
  const [state,setState]=useState<UpdateState|null>(null);
  useEffect(()=>{const api=window.zentyDesktop?.updates;if(!api)return;let active=true;void api.get().then(value=>{if(active)setState(value);});const remove=api.onState(setState);return()=>{active=false;remove();};},[]);
  if(!state || !["available","downloaded"].includes(state.phase))return null;
  return <button className="update-notice" title={`Zenty ${state.latestVersion} disponible`} onClick={()=>window.dispatchEvent(new Event("zenty-open-updates"))}><Download size={15}/><span>{state.phase==="downloaded"?"Actualización lista":"Nueva versión"}</span></button>;
}
