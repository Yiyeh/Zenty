import { useState } from "react";
import { Globe2 } from "lucide-react";
import { languages, getLocale, setLocale, tr } from "../lib/i18n";
import type { Language } from "../lib/i18n";
import { useLocale } from "../context/Locale";
export function LanguageSelector({ onChange }: { onChange?: (language: Language) => void }) {
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return <label className="language-selector"><span><Globe2 size={16} />{tr("language.label")}</span>
    <select value={locale} disabled={busy} onChange={async event => {
      const next = event.target.value as Language; setBusy(true); setError(false);
      try { await setLocale(next); onChange?.(getLocale()); }
      catch { setError(true); }
      finally { setBusy(false); }
    }}>{languages.map(item => <option key={item.id} value={item.id} lang={item.id}>{item.name}</option>)}</select>
    {error && <span role="alert">{tr("language.error")}</span>}
  </label>;
}
