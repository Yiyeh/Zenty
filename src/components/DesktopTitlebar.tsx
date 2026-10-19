import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { tr } from "../lib/i18n.ts";
import { APP_NAME } from "../lib/brand.ts";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Copy,
  FolderOpen,
  Maximize,
  Minus,
  Minimize,
  Square,
  X,
} from "lucide-react";
export function DesktopTitlebar() {
  useInterfaceLocale();
  const api = window.zentyDesktop;
  const [locked, setLocked] = useState(!!api?.security);
  useEffect(() => {
    if (!api?.security) return;
    const remove = api.security.onState(value => setLocked(value.locked));
    void api.security.get().then(value => setLocked(value.locked)).catch(() => setLocked(true));
    return remove;
  }, [api]);
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
        <img src="/favicon.svg" width={20} height={20} alt="" />
        <strong>{APP_NAME}</strong>
        <span>{tr("DesktopTitlebar.ad96093bce")}</span>
      </div>
      <div
        className="desktop-titlebar-controls"
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <button
          title={tr("DesktopTitlebar.f9e5cdbeae")}
          aria-label={tr("DesktopTitlebar.77e6d4f489", { v0: APP_NAME })}
          onClick={() => void api.openDataFolder()}
          disabled={locked}
        >
          <FolderOpen size={13} />
        </button>
        <button
          title={
            state.fullscreen
              ? tr("DesktopTitlebar.a160ccf2bb")
              : tr("DesktopTitlebar.62ed146992")
          }
          aria-label={
            state.fullscreen
              ? tr("DesktopTitlebar.2de6e8b7c9")
              : tr("DesktopTitlebar.93f2f91137")
          }
          onClick={() => void api.fullscreen()}
        >
          {state.fullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
        </button>
        <button
          aria-label={tr("DesktopTitlebar.a5209dc332")}
          title={tr("DesktopTitlebar.3fc5f90b27")}
          onClick={() => void api.minimize()}
        >
          <Minus size={14} />
        </button>
        <button
          aria-label={
            state.maximized || state.fullscreen
              ? tr("DesktopTitlebar.a36ab91521")
              : tr("DesktopTitlebar.ce16368f6a")
          }
          title={
            state.maximized || state.fullscreen ? tr("DesktopTitlebar.eda02893d3") : tr("DesktopTitlebar.092b9ccfbf")
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
          aria-label={tr("DesktopTitlebar.335580ee44", { v0: APP_NAME })}
          title={tr("DesktopTitlebar.aeccae342e")}
          onClick={() => void api.close()}
        >
          <X size={15} />
        </button>
      </div>
    </div>,
    target,
  );
}
