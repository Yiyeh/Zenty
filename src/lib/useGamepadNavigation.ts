import { useEffect } from "react";
import type { RefObject } from "react";
export function useGamepadNavigation(root: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return; let frame = 0, last = 0, pressed = false, backPressed = false;
    const tick = (now: number) => {
      const pad = navigator.getGamepads?.().find(Boolean);
      const modal = document.querySelector<HTMLDialogElement>("dialog[open]");
      const scope = modal ? root.current?.contains(modal) ? modal : null : root.current;
      if (pad && scope) {
        const back = !!pad.buttons[1]?.pressed;
        if (back && !backPressed && modal) modal.querySelector<HTMLButtonElement>(".dialog-header > button")?.click();
        backPressed = back;
        const buttons = [...scope.querySelectorAll<HTMLElement>('button:not(:disabled),select,input,a[href]')].filter(element => element.getClientRects().length && element.tabIndex >= 0);
        const current = document.activeElement as HTMLElement;
        const direction = pad.buttons[15]?.pressed || pad.axes[0] > .6 ? [1, 0] : pad.buttons[14]?.pressed || pad.axes[0] < -.6 ? [-1, 0] : pad.buttons[13]?.pressed || pad.axes[1] > .6 ? [0, 1] : pad.buttons[12]?.pressed || pad.axes[1] < -.6 ? [0, -1] : null;
        if (direction && now - last > 190) {
          last = now;
          if (!buttons.includes(current)) buttons[0]?.focus();
          else { const box = current.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
            const next = buttons.filter(element => element !== current).map(element => { const rect = element.getBoundingClientRect(), dx = rect.x + rect.width / 2 - x, dy = rect.y + rect.height / 2 - y; const forward = dx * direction[0] + dy * direction[1], sideways = Math.abs(dx * direction[1] - dy * direction[0]); return { element, forward, score: forward + sideways * 3 }; }).filter(item => item.forward > 4).sort((a, b) => a.score - b.score)[0]; next?.element.focus(); }
        }
        const activate = !!pad.buttons[0]?.pressed; if (activate && !pressed && buttons.includes(current) && current.tagName !== "INPUT" && current.tagName !== "SELECT") current.click(); pressed = activate;
      }
      frame = requestAnimationFrame(tick);
    }; frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [root, enabled]);
}
