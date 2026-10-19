import { tr } from "../lib/i18n.ts";
import { APP_NAME, APP_SLUG } from "../lib/brand.ts";
import { Component } from "react";
import type { ReactNode } from "react";
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="empty-dashboard" style={{ minHeight: "100vh" }}>
        <h1>{tr("AppErrorBoundary.d8460949f3")}</h1>
        <p>
          {tr("AppErrorBoundary.a889ebb810")}</p>
        <button className="primary-button" onClick={() => location.reload()}>
          {tr("AppErrorBoundary.780d4d88b9")}{APP_NAME}
        </button>
        <button
          className="secondary-button"
          onClick={() => {
            try {
              const saved = Object.fromEntries(
                Object.keys(localStorage)
                  .filter(
                    (key) =>
                      key.startsWith("dash_") ||
                      key.startsWith("mia_dashboard") ||
                      key === "mia_before_import",
                  )
                  .map((key) => [key, localStorage.getItem(key)]),
              );
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(saved, null, 2)], {
                  type: "application/json",
                }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = `${APP_SLUG}-recuperacion.json`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch {
              /* Storage may be disabled by the browser. */
            }
          }}
        >
          {tr("AppErrorBoundary.4ae2e13e0d")}</button>
      </main>
    );
  }
}
