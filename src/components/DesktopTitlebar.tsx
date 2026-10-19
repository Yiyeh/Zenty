import { APP_NAME } from "../lib/brand.ts";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Asterisk,
  Copy,
  FolderOpen,
  Maximize,
  Minus,
  Minimize,
  Square,
  X,
} from "lucide-react";
export function DesktopTitlebar() {
  const api = window.zentyDesktop;
  const [state, setState] = useState({
    maximized: false,
    fullscreen: true,
    focused: true,
  });
  const [target, setTarget] = useState<Element>(document.body);
  useEffect(() => {
    if (!api) return;
    document.documentElement.classList.add("desktop-app");
    void api.getState().then(setState);
    return api.onState(setState);
  }, [api]);
  useEffect(() => {
    if (!api) return;
    const update = () => {
      const dialogs = [...document.querySelectorAll("dialog[open]")];
      setTarget(dialogs.at(-1) || document.body);
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    update();
    return () => observer.disconnect();
  }, [api]);
  if (!api) return null;
  return createPortal(
    <div
      className={`desktop-titlebar ${state.focused ? "" : "window-inactive"}`}
      onDoubleClick={() => void api.maximize()}
    >
      <div className="desktop-titlebar-brand">
        <Asterisk size={16} strokeWidth={1.6} />
        <strong>{APP_NAME}</strong>
        <span>Tu espacio personal</span>
      </div>
      <div
        className="desktop-titlebar-controls"
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <button
          title="Abrir mis datos"
          aria-label={`Abrir carpeta de datos de ${APP_NAME}`}
          onClick={() => void api.openDataFolder()}
        >
          <FolderOpen size={13} />
        </button>
        <button
          title={
            state.fullscreen
              ? "Salir de pantalla completa (F11)"
              : "Pantalla completa (F11)"
          }
          aria-label={
            state.fullscreen
              ? "Salir de pantalla completa"
              : "Pantalla completa"
          }
          onClick={() => void api.fullscreen()}
        >
          {state.fullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
        </button>
        <button
          aria-label="Minimizar ventana"
          title="Minimizar"
          onClick={() => void api.minimize()}
        >
          <Minus size={14} />
        </button>
        <button
          aria-label={
            state.maximized || state.fullscreen
              ? "Restaurar ventana"
              : "Maximizar ventana"
          }
          title={
            state.maximized || state.fullscreen ? "Restaurar" : "Maximizar"
          }
          onClick={() => void api.maximize()}
        >
          {state.maximized || state.fullscreen ? (
            <Copy size={12} />
          ) : (
            <Square size={12} />
          )}
        </button>
        <button
          className="desktop-close"
          aria-label={`Cerrar ${APP_NAME}`}
          title="Cerrar"
          onClick={() => void api.close()}
        >
          <X size={15} />
        </button>
      </div>
    </div>,
    target,
  );
}
