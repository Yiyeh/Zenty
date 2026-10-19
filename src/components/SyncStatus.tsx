import { useState } from "react";
import { CloudCheck, CloudOff, LoaderCircle, AlertTriangle } from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
import { useLocale } from "../context/Locale";
import { tr, getFormatLocale } from "../lib/i18n";
import { APP_NAME } from "../lib/brand";
import { Dialog } from "./Dialog";
export function SyncStatus() {
  useLocale();
  const { sync, retrySync, acknowledgeConflict } = useDashboard();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const problem = !!sync.conflict || sync.phase === "error" || sync.phase === "offline";
  const Icon = sync.conflict ? AlertTriangle : sync.phase === "offline" ? CloudOff : ["pending", "syncing", "loading"].includes(sync.phase) ? LoaderCircle : CloudCheck;
  const label = sync.conflict ? tr("sync.conflictLabel") : tr(`sync.phase.${sync.phase}`);
  const run = async (action: () => Promise<void>) => { if (busy) return; setBusy(true); setError(""); try { await action(); } catch { setError(tr("sync.retryError")); } finally { setBusy(false); } };
  return <><button type="button" className={`sync-status ${problem ? "sync-problem" : ""}`} aria-label={label} title={label} onClick={() => setOpen(true)}><Icon size={15} className={sync.phase === "syncing" ? "sync-spinning" : undefined} /><span>{label}</span></button>
    <Dialog open={open} onClose={() => setOpen(false)} title={tr("sync.title")} description={tr("sync.description")}>
      <div className="dialog-body form-stack"><p role="status">{label}</p>
        {sync.lastSavedAt && <p className="muted">{tr("sync.lastSaved", { time: new Date(sync.lastSavedAt).toLocaleTimeString(getFormatLocale()) })}</p>}
        {sync.phase === "offline" && <p>{tr("sync.offlineDescription")}</p>}
        {sync.conflict && <div className="sync-conflict"><p>{tr("sync.conflictDescription", { count: sync.conflict.fields.length })}</p><p className="muted">{tr("sync.copyDescription")}</p><button type="button" className="secondary-button" disabled={busy} onClick={() => void run(async () => {
          const response = await fetch(`/api/dashboard/conflicts/${sync.conflict!.id}`, { headers: { "X-MIA-Dashboard": "1" }, signal: AbortSignal.timeout(10000) });
          if (!response.ok) throw new Error("sync.copyMissing");
          const body = await response.json(); const url = URL.createObjectURL(new Blob([JSON.stringify(body.data, null, 2)], { type: "application/json" }));
          const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${APP_NAME}-conflict-${sync.conflict!.id}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
        })}>{tr("sync.downloadCopy")}</button><button type="button" className="text-button" disabled={busy} onClick={() => void run(acknowledgeConflict)}>{tr("sync.acknowledge")}</button></div>}
        <button type="button" className="primary-button" disabled={busy || sync.phase === "syncing"} onClick={() => void run(retrySync)}>{busy ? tr("sync.phase.syncing") : tr("sync.retry")}</button>
        {error && <p role="alert" className="error-message">{error}</p>}
      </div>
    </Dialog>
  </>;
}
