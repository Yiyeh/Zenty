import { RemoteStatus } from "./components/RemoteStatus";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { initializeLocale } from "./lib/i18n";
import { isRemoteLibrary } from "./lib/remote";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

if (isRemoteLibrary) document.documentElement.classList.add("remote-app");

void initializeLocale().then(() => createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <RemoteStatus />
      <App />
    </AppErrorBoundary>
  </StrictMode>,
));
