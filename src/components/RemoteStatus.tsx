import { useLocale } from "../context/Locale";
import { tr } from "../lib/i18n";
import { useEffect, useState } from "react";
import { isReadOnly, setRemotePermission, isRemoteLibrary } from "../lib/remote";
export function RemoteStatus() {
  useLocale();
  const [readOnly, setReadOnly] = useState(isReadOnly);
  useEffect(() => { if (!isRemoteLibrary) return; let active = true; const load = () => { void fetch("/api/remote/device").then(response => response.ok ? response.json() : null).then(value => { if (active && value) { setRemotePermission(value.permission); setReadOnly(isReadOnly()); } }).catch(() => {}); }; load(); const timer = setInterval(load, 5000); return () => { active = false; clearInterval(timer); }; }, []);
  return isRemoteLibrary ? <div className="remote-app-banner"><span>{tr(readOnly ? "devices.readOnly" : "main.eefe563ef8")}</span><form method="post" action="/disconnect"><button type="submit">{tr("main.93fffbf7ce")}</button></form></div> : null;
}
