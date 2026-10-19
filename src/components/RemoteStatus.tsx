import { useLocale } from "../context/Locale";
import { tr } from "../lib/i18n";
import { isRemoteLibrary } from "../lib/remote";
export function RemoteStatus() {
  useLocale();
  return isRemoteLibrary ? <div className="remote-app-banner"><span>{tr("main.eefe563ef8")}</span><form method="post" action="/disconnect"><button type="submit">{tr("main.93fffbf7ce")}</button></form></div> : null;
}
