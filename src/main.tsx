import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { isRemoteLibrary } from "./lib/remote";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

if (isRemoteLibrary) document.documentElement.classList.add("remote-app");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      {isRemoteLibrary && <div className="remote-app-banner"><span>Conectado a tu PC · Cambios sincronizados</span><form method="post" action="/disconnect"><button type="submit">Salir</button></form></div>}
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
