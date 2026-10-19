import { useState } from "react";
import { useDashboard } from "../context/DashboardStore";
import { APP_NAME } from "../lib/brand";
import { Dialog } from "./Dialog";

export function Welcome() {
  const { settings, setSettings, ready } = useDashboard();
  const [name, setName] = useState("");
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!ready || settings.welcomeCompleted) return null;
  return <Dialog open onClose={() => setSettings((previous) => ({ ...previous, welcomeCompleted: true }))} title={`Te damos la bienvenida a ${APP_NAME}`} description="Vamos a hacer que este espacio se sienta tuyo.">
    <form className="dialog-body form-stack" onSubmit={(event) => {
      event.preventDefault();
      if (!normalized) return;
      setSettings((previous) => ({ ...previous, userName: normalized, welcomeCompleted: true }));
    }}>
      <label htmlFor="welcome-name">¿Cómo quieres que te llamemos?
        <input id="welcome-name" autoFocus autoComplete="given-name" maxLength={60} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Tu nombre o apodo" />
      </label>
      <p className="muted">Aparecerá en el inicio y podrás cambiarlo cuando quieras en Personalizar. Se guarda en tu perfil de este equipo.</p>
      <div className="dialog-actions">
        <button type="button" className="text-button" onClick={() => setSettings((previous) => ({ ...previous, welcomeCompleted: true }))}>Ahora no</button>
        <button type="submit" className="primary-button" disabled={!normalized}>Entrar a mi espacio</button>
      </div>
    </form>
  </Dialog>;
}
