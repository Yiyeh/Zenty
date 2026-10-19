import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { tr } from "../lib/i18n.ts";
import {useEffect,useState} from "react";
import {Download} from "lucide-react";
import type {UpdateState} from "../lib/updates";
export function UpdateNotice() {
  useInterfaceLocale();
  const [state,setState]=useState<UpdateState|null>(null);
  useEffect(()=>{const api=window.zentyDesktop?.updates;if(!api)return;let active=true;void api.get().then(value=>{if(active)setState(value);});const remove=api.onState(setState);return()=>{active=false;remove();};},[]);
  if(!state || !["available","downloaded"].includes(state.phase))return null;
  return <button className="update-notice" title={tr("a11y.UpdateNotice.11", { v0: state.latestVersion })} onClick={()=>window.dispatchEvent(new Event("zenty-open-updates"))}><Download size={15}/><span>{state.phase==="downloaded"?tr("UpdateNotice.302285b0d0"):tr("UpdateNotice.88c9bb2d67")}</span></button>;
}
