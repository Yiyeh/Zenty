import { useEffect, useState } from "react";
import { ArchiveRestore, HardDriveDownload } from "lucide-react";
import { useLocale } from "../context/Locale";
import { tr, getFormatLocale } from "../lib/i18n";
import type { BackupReview, BackupStatus } from "../lib/backups";
import { Dialog } from "./Dialog";
const errorMessage = (error: unknown) => tr((error instanceof Error ? error.message.match(/backup\.[a-zA-Z]+/)?.[0] : "") || "backup.failed");
export function BackupSettings() {
  useLocale();
  const api = window.zentyDesktop?.backups;
  const [state, setState] = useState<BackupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<BackupReview | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { let active = true; void api?.get().then(value => { if (active) setState(value); }).catch(cause => { if (active) setError(errorMessage(cause)); }); return () => { active = false; }; }, [api]);
  if (!api) return null;
  const run = async (operation: () => Promise<unknown>) => {
    if (busy) return; setBusy(true); setError(""); setMessage("");
    try { await operation(); setState(await api.get()); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  const inspect = (id?: string) => run(async () => setReview(await api.review(id)));
  const size = (bytes: number) => new Intl.NumberFormat(getFormatLocale(), { style: "unit", unit: "megabyte", maximumFractionDigits: 1 }).format(bytes / 1048576);
  return <fieldset className="backup-settings"><legend><ArchiveRestore size={17} /> {tr("backup.title")}</legend>
    <p>{tr("backup.description")}</p>
    {state && <><label className="switch-row"><span>{tr("backup.automatic")}</span><input type="checkbox" role="switch" checked={state.automatic} disabled={busy} onChange={event => void run(() => api.configure({ automatic: event.target.checked, keep: state.keep }))} /></label>
      <label>{tr("backup.retention")}<select value={state.keep} disabled={busy} onChange={event => void run(() => api.configure({ automatic: state.automatic, keep: Number(event.target.value) }))}>{[1, 2, 3, 5, 10].map(count => <option key={count} value={count}>{count}</option>)}</select></label>
      <p className="muted">{tr("backup.schedule", { count: state.keep })}</p></>}
    <div className="dialog-actions"><button type="button" className="secondary-button" disabled={busy || !state} onClick={() => void run(async () => { await api.create(); setMessage(tr("backup.created")); })}><HardDriveDownload size={16} />{busy ? tr("backup.working") : tr("backup.create")}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void inspect()}>{tr("backup.choose")}</button></div>
    {state?.snapshots.length ? <ul className="backup-list">{state.snapshots.map(item => <li key={item.id}><div><strong>{new Date(item.createdAt).toLocaleString(getFormatLocale(), { dateStyle: "medium", timeStyle: "short" })}</strong><small>{tr(item.kind === "automatic" ? "backup.automaticKind" : "backup.manualKind")} · {tr("backup.files", { count: item.files })} · {size(item.bytes)}</small></div><button type="button" className="text-button" disabled={busy} onClick={() => void inspect(item.id)}>{tr("backup.review")}</button></li>)}</ul> : <p className="muted">{tr("backup.empty")}</p>}
    {(error || state?.error) && <p className="error-message" role="alert">{error || tr(state!.error)}</p>}
    {message && <p role="status">{message}</p>}
    <Dialog open={!!review} onClose={() => { if (!busy) setReview(null); }} title={tr("backup.confirmTitle")} description={tr("backup.confirmDescription")}>
      <div className="dialog-body form-stack">{review && <p>{new Date(review.createdAt).toLocaleString(getFormatLocale())} · {tr("backup.files", { count: review.files })} · {size(review.bytes)}</p>}<p>{tr("backup.recoveryCopy")}</p><div className="dialog-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => setReview(null)}>{tr("backup.cancel")}</button><button className="primary-button" type="button" disabled={busy || !review} onClick={() => void run(async () => { await api.restore(review!.ticket); setReview(null); })}>{busy ? tr("backup.working") : tr("backup.restore")}</button></div></div>
    </Dialog>
  </fieldset>;
}
