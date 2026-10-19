import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { tr } from "../lib/i18n.ts";
import { useState } from "react";
import { useDashboard } from "../context/DashboardStore";
import { APP_NAME } from "../lib/brand";
import { Dialog } from "./Dialog";
import { LanguageSelector } from "./LanguageSelector";
import { getLocale } from "../lib/i18n";

export function Welcome() {
  useInterfaceLocale();
  const { settings, setSettings, ready } = useDashboard();
  const [name, setName] = useState("");
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!ready || settings.welcomeCompleted) return null;
  return <Dialog open onClose={() => setSettings((previous) => ({ ...previous, language: getLocale(), welcomeCompleted: true }))} title={tr("Welcome.b7060e6c03", { v0: APP_NAME })} description={tr("Welcome.336b888b9c")}>
    <form className="dialog-body form-stack" onSubmit={(event) => {
      event.preventDefault();
      if (!normalized) return;
      setSettings((previous) => ({ ...previous, userName: normalized, language: getLocale(), welcomeCompleted: true }));
    }}>
      <LanguageSelector onChange={language => setSettings(previous => ({ ...previous, language }))} />
      <label htmlFor="welcome-name">{tr("Welcome.c3b31850d7")}<input id="welcome-name" autoFocus autoComplete="given-name" maxLength={60} required value={name} onChange={(event) => setName(event.target.value)} placeholder={tr("Welcome.d85ef3135e")} />
      </label>
      <p className="muted">{tr("Welcome.1fc398d998")}</p>
      <div className="dialog-actions">
        <button type="button" className="text-button" onClick={() => setSettings((previous) => ({ ...previous, language: getLocale(), welcomeCompleted: true }))}>{tr("Welcome.6c64e27848")}</button>
        <button type="submit" className="primary-button" disabled={!normalized}>{tr("Welcome.46febbe605")}</button>
      </div>
    </form>
  </Dialog>;
}
