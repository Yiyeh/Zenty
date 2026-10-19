const { APP_NAME, APP_ID } = require("../desktop-server/src/lib/brand.js");
const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  dialog,
  session,
  Menu,
  screen,
  Notification,
  safeStorage,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const { createAudioController } = require("./audio-controller.cjs");
const { exportUserSave, migrateProfileSync } = require("./user-save.cjs");
const { createStartupSettings } = require("./startup-settings.cjs");
const { createSpotifySessionStore } = require("./spotify-session.cjs");
const {
  windowState,
  performWindowAction,
  safeExternalUrl,
  authUrl,
  trustedFrame,
} = require("./window-controls.cjs");
app.setName(APP_NAME);
// Copy before Electron opens Chromium storage; retain the old profile for recovery.
const legacyProfile = path.join(app.getPath("appData"), "MIA Personal");
const currentProfile = path.join(app.getPath("appData"), APP_NAME);
migrateProfileSync(legacyProfile, currentProfile);
app.setPath("userData", currentProfile);
app.setAppUserModelId(APP_ID);
const base = path.resolve(__dirname, "..");
let mainWindow,
  localServer,
  lanSharing,
  origin,
  installingUpdate = false,
  quitting = false;
const diagnostic = process.argv.includes("--diagnostics");
const diagnosticPath = path.join(base, "artifacts", "desktop-runtime.json");
function external(value) {
  const url = safeExternalUrl(value);
  if (url) void shell.openExternal(url);
}
function configureAuth(window) {
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(({ url }) => {
    external(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin === origin && new URL(url).pathname === "/") {
      event.preventDefault();
      void mainWindow.loadURL(url);
      window.close();
    } else if (!authUrl(url) && url !== "about:blank") {
      event.preventDefault();
      external(url);
    }
  });
}
function authWindow(url) {
  const window = new BrowserWindow({
    width: 500,
    height: 720,
    parent: mainWindow,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "auth-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  configureAuth(window);
  void window.loadURL(url);
}
async function migrateData(destination) {
  await fs.mkdir(destination, { recursive: true });
  const marker = path.join(destination, "migration.json");
  try {
    await fs.access(marker);
    return;
  } catch {
    /* First desktop launch. */
  }
  const copied = [];
  for (const name of ["library-data", "gaming-data", "dashboard-data"]) {
    const source = path.join(base, name),
      target = path.join(destination, name);
    try {
      await fs.access(target);
      continue;
    } catch {
      /* Never overwrite an existing desktop library. */
    }
    try {
      await fs.access(source);
    } catch {
      continue;
    }
    const temporary = path.join(destination, `${name}.migrating`);
    // A previous interrupted copy may be resumed; originals are always preserved.
    await fs.cp(source, temporary, {
      recursive: true,
      force: false,
      errorOnExist: false,
      preserveTimestamps: true,
    });
    await fs.rename(temporary, target);
    copied.push(name);
  }
  await fs.writeFile(
    marker,
    JSON.stringify({ at: new Date().toISOString(), copied }),
  );
}
async function startup() {
  const dataDirectory = path.join(app.getPath("userData"), "data");
  await migrateData(dataDirectory);
  const { startLocalServer } = await import(
    pathToFileURL(
      path.join(base, "desktop-server", "server", "local-server.js"),
    ).href
  );
  const local = await startLocalServer({
    root: path.join(base, "dist"),
    dataDirectory,
    port: 17731,
  });
  localServer = local.server;
  origin = local.url;
  const { createLanSharing } = await import(pathToFileURL(path.join(base, "desktop-server/server/lan-server.js")).href);
  const integrationRequests = new Map();
  const requestIntegration = (action, input) => new Promise((resolve, reject) => {
    if (!mainWindow || mainWindow.isDestroyed() || integrationRequests.size >= 16) { reject(new Error("El PC no está listo.")); return; }
    const id = require("node:crypto").randomUUID();
    const timeout = setTimeout(() => { integrationRequests.delete(id); reject(new Error("El PC no respondió.")); }, 20000);
    integrationRequests.set(id, { resolve, reject, timeout });
    mainWindow.webContents.send("zenty:integration-request", { id, action, input });
  });
  ipcMain.on("zenty:integration-reply", (event, result) => {
    if (!trustedFrame(event, origin) || event.sender !== mainWindow?.webContents) return;
    const pending = integrationRequests.get(result?.id); if (!pending) return;
    integrationRequests.delete(result.id); clearTimeout(pending.timeout);
    if (result.ok) pending.resolve(result.value); else pending.reject(new Error("No se pudo completar la acción."));
  });
  lanSharing = createLanSharing(origin, 17732, path.join(dataDirectory, "lan-sharing"), requestIntegration);
  for (const action of ["get", "set", "forget"])
    ipcMain.handle(`zenty:lan:${action}`, async (event, enabled) => {
      if (!trustedFrame(event, origin) || event.sender !== mainWindow.webContents)
        throw new Error("Untrusted desktop request");
      try {
        if (action === "set" && typeof enabled !== "boolean") throw new Error("Opción inválida.");
        return { ok: true, value: action === "get" ? lanSharing.status() : action === "forget" ? await lanSharing.forget() : await lanSharing.set(enabled) };
      } catch (error) { return { ok: false, error: error.message }; }
    });
  let saved = {};
  try {
    saved = JSON.parse(
      await fs.readFile(
        path.join(app.getPath("userData"), "window.json"),
        "utf8",
      ),
    );
  } catch {
    /* Fullscreen is the first-launch default. */
  }
  const work = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(
      Math.max(Number(saved.width) || 1280, 900),
      work.width,
    ),
    height = Math.min(Math.max(Number(saved.height) || 850, 620), work.height);
  mainWindow = new BrowserWindow({
    title: `${APP_NAME}`,
    width,
    height,
    minWidth: 850,
    minHeight: 600,
    frame: false,
    fullscreen: typeof saved.fullscreen === "boolean" ? saved.fullscreen : true,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f7f7f5",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: true,
    },
  });
  const { createReminderEngine, validateReminderPlan, reminderMessage } =
    await import(
      pathToFileURL(
        path.join(base, "desktop-server", "src", "lib", "reminders.js"),
      ).href
    );
  const remindersDirectory = path.join(app.getPath("userData"), "reminders");
  await fs.mkdir(remindersDirectory, { recursive: true });
  const readReminderFile = async (name, fallback) => {
    try {
      return JSON.parse(
        await fs.readFile(path.join(remindersDirectory, name), "utf8"),
      );
    } catch {
      return fallback;
    }
  };
  const writeReminderFile = async (name, value) => {
    const target = path.join(remindersDirectory, name),
      temporary = `${target}.${require("node:crypto").randomUUID()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(value));
    await fs.rename(temporary, target);
  };
  const showAgenda = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send("zenty:reminders:open");
    }
  };
  const activeNotifications = new Set();
  const sendReminderNotification = (title, body, sound = true) =>
    new Promise((resolve) => {
      if (!Notification.isSupported()) {
        resolve({
          ok: false,
          error: "Las notificaciones no están disponibles en este equipo.",
        });
        return;
      }
      const notification = new Notification({
        title,
        body,
        silent: !sound,
        icon: path.join(__dirname, "icon.png"),
      });
      activeNotifications.add(notification);
      const timeout = setTimeout(() => {
        resolve({
          ok: false,
          error: `Windows no confirmó el aviso. Revisa las notificaciones de ${APP_NAME}.`,
        });
      }, 5000);
      notification.once("show", () => {
        clearTimeout(timeout);
        resolve({ ok: true });
      });
      notification.once("failed", (_event, error) => {
        clearTimeout(timeout);
        activeNotifications.delete(notification);
        resolve({
          ok: false,
          error: String(error || "Windows no pudo mostrar el aviso."),
        });
      });
      notification.once("close", () =>
        activeNotifications.delete(notification),
      );
      notification.on("click", showAgenda);
      notification.show();
    });
  const reminderEngine = createReminderEngine({
    delivered: await readReminderFile("delivered.json", {}),
    save: (delivered) => writeReminderFile("delivered.json", delivered),
    notify: async (occurrence) => {
      if (!mainWindow.isDestroyed())
        mainWindow.webContents.send("zenty:reminders:fired", {
          title: occurrence.entry.title,
          message: reminderMessage(occurrence),
        });
      await sendReminderNotification(
        `${APP_NAME} · Recordatorio`,
        reminderMessage(occurrence),
        occurrence.entry.sound,
      );
    },
  });
  try {
    await reminderEngine.sync(
      await readReminderFile("plan.json", { enabled: false, entries: [] }),
    );
  } catch {
    /* The renderer can rebuild this derived schedule from the dashboard. */
  }
  let reminderPlanFlight = Promise.resolve();
  for (const action of ["sync", "test"])
    ipcMain.handle(`zenty:reminders:${action}`, async (event, value) => {
      if (
        !trustedFrame(event, origin) ||
        event.sender !== mainWindow.webContents
      )
        throw new Error("Untrusted desktop request");
      if (action === "test")
        return sendReminderNotification(
          APP_NAME,
          `Los recordatorios de ${APP_NAME} están listos.`,
        );
      const plan = validateReminderPlan(value);
      reminderPlanFlight = reminderPlanFlight
        .catch(() => {})
        .then(async () => {
          await writeReminderFile("plan.json", plan);
          await reminderEngine.sync(plan);
        });
      await reminderPlanFlight;
      return { supported: Notification.isSupported() };
    });
  mainWindow.on("closed", () => {
    reminderEngine.stop();
    for (const notification of activeNotifications) notification.close();
  });
  Menu.setApplicationMenu(null);
  if (process.platform === "win32") {
    const executable = app.isPackaged
      ? path.join(
          process.resourcesPath,
          "app.asar.unpacked",
          "desktop",
          "native-audio",
          "audio-helper.exe",
        )
      : path.join(__dirname, "native-audio", "audio-helper.exe");
    const audio = createAudioController({
      executable,
      preferenceFile: path.join(app.getPath("userData"), "audio.json"),
      getPids: () => app.getAppMetrics().map((metric) => metric.pid),
    });
    for (const action of ["get", "set"])
      ipcMain.handle(`zenty:audio:${action}`, (event, value) => {
        if (
          !trustedFrame(event, origin) ||
          event.sender !== mainWindow.webContents
        )
          throw new Error("Untrusted desktop request");
        return action === "get" ? audio.get() : audio.set(value);
      });
    let audioTimers = [];
    mainWindow.webContents.on("media-started-playing", () => {
      audioTimers.forEach(clearTimeout);
      audioTimers = [0, 300, 1200].map((delay) =>
        setTimeout(() => {
          void audio.reapply().catch(() => {});
        }, delay),
      );
    });
    mainWindow.on("closed", () => audioTimers.forEach(clearTimeout));
  }
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback) =>
      callback(
        contents === mainWindow.webContents && permission === "fullscreen",
      ),
  );
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission, requestingOrigin) =>
      contents === mainWindow.webContents &&
      permission === "fullscreen" &&
      requestingOrigin === origin,
  );
  for (const action of ["minimize", "maximize", "fullscreen", "close"])
    ipcMain.handle(`zenty:${action}`, (event) => {
      if (
        !trustedFrame(event, origin) ||
        event.sender !== mainWindow.webContents
      )
        throw new Error("Untrusted desktop request");
      performWindowAction(mainWindow, action);
    });
  ipcMain.handle("zenty:state", (event) => {
    if (!trustedFrame(event, origin) || event.sender !== mainWindow.webContents)
      throw new Error("Untrusted desktop request");
    return windowState(mainWindow);
  });
  ipcMain.handle("zenty:data-folder", async (event) => {
    if (!trustedFrame(event, origin) || event.sender !== mainWindow.webContents)
      throw new Error("Untrusted desktop request");
    await shell.openPath(app.getPath("userData"));
  });
  const startupSettings = createStartupSettings(app, process.execPath, app.getPath("userData"), APP_NAME);
  const spotifySessionStore = createSpotifySessionStore(path.join(app.getPath("userData"), "connections"), safeStorage);
  for (const action of ["get", "set"])
    ipcMain.handle(`zenty:spotify-session:${action}`, (event, value) => {
      if (!trustedFrame(event, origin) || event.sender !== mainWindow.webContents)
        throw new Error("Untrusted desktop request");
      return action === "get" ? spotifySessionStore.get() : spotifySessionStore.set(value);
    });
  for (const action of ["get", "set"])
    ipcMain.handle(`zenty:startup:${action}`, async (event, enabled) => {
      if (!trustedFrame(event, origin) || event.sender !== mainWindow.webContents)
        throw new Error("Untrusted desktop request");
      try {
        const value = action === "get" ? startupSettings.get() : await startupSettings.set(enabled);
        return { ok: true, value };
      } catch (error) {
        return { ok: false, error: error.message || "No se pudo cambiar el inicio de Zenty con Windows." };
      }
    });
  ipcMain.handle("zenty:export-save", async (event, raw) => {
    if (!trustedFrame(event, origin) || event.sender !== mainWindow.webContents)
      throw new Error("Untrusted desktop request");
    if (typeof raw !== "string" || Buffer.byteLength(raw) > 5_000_000)
      throw new Error("El respaldo supera el tamaño permitido.");
    const { parseBackup } = await import(pathToFileURL(path.join(base, "desktop-server/src/lib/dashboard.js")).href);
    const snapshot = JSON.stringify({ ...parseBackup(raw), version: 2 });
    const chosen = await dialog.showOpenDialog(mainWindow, { title: "Guardar respaldo completo", properties: ["openDirectory", "createDirectory"] });
    if (chosen.canceled || !chosen.filePaths[0]) return null;
    return exportUserSave(app.getPath("userData"), chosen.filePaths[0], snapshot, APP_NAME);
  });
  for (const event of [
    "maximize",
    "unmaximize",
    "enter-full-screen",
    "leave-full-screen",
    "focus",
    "blur",
  ])
    mainWindow.on(event, () => {
      if (!mainWindow.isDestroyed())
        mainWindow.webContents.send(
          "zenty:state-changed",
          windowState(mainWindow),
        );
    });
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F11") {
      event.preventDefault();
      performWindowAction(mainWindow, "fullscreen");
    }
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin === origin && new URL(url).pathname === "/") return;
    event.preventDefault();
    if (authUrl(url)) authWindow(url);
    else external(url);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (authUrl(url) || url === "about:blank")
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 500,
          height: 720,
          autoHideMenuBar: true,
          webPreferences: {
            preload: path.join(__dirname, "auth-preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
          },
        },
      };
    external(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("did-create-window", (child) =>
    configureAuth(child),
  );
  let closing = false;
  let saveHandlerReady = false;
  let saveAcknowledged;
  ipcMain.on("zenty:save-handler-ready", (event) => {
    if (trustedFrame(event, origin) && event.sender === mainWindow.webContents) saveHandlerReady = true;
  });
  ipcMain.on("zenty:save-ready", (event, ok) => {
    if (trustedFrame(event, origin) && event.sender === mainWindow.webContents) saveAcknowledged?.(ok === true);
  });
  const flushForUpdate = async () => {
    if (!saveHandlerReady) throw new Error("El espacio aún no está listo.");
    const ok = await new Promise((resolve) => {
      const timeout = setTimeout(() => { saveAcknowledged=undefined; resolve(false); },10000);
      saveAcknowledged=(ok)=>{clearTimeout(timeout);saveAcknowledged=undefined;resolve(ok);};
      mainWindow.webContents.send("zenty:save-before-close");
    });
    if (!ok) throw new Error("No se pudo guardar el espacio.");
    await spotifySessionStore.flush();
  };
  const {createUpdateController,backupUpdateMetadata}=require("./update-controller.cjs");
  const updateSupported=app.isPackaged && require("node:fs").existsSync(path.join(process.resourcesPath,"app-update.yml"));
  const updates=createUpdateController({
    updater:updateSupported?require("electron-updater").autoUpdater:null,version:app.getVersion(),supported:updateSupported,
    notify:(state)=>{if(!mainWindow.isDestroyed())mainWindow.webContents.send("zenty:updates:state",state);},
    prepare:async()=>{
      if(closing)throw new Error("La aplicación se está cerrando.");
      mainWindow.setEnabled(false);
      try { await flushForUpdate(); await backupUpdateMetadata(app.getPath("userData"),app.getVersion()); installingUpdate=true; }
      finally { if(!installingUpdate && !mainWindow.isDestroyed())mainWindow.setEnabled(true); }
    },
  });
  for(const action of ["get","check","download","install"]) ipcMain.handle(`zenty:updates:${action}`,async(event)=>{
    if(!trustedFrame(event,origin)||event.sender!==mainWindow.webContents)throw new Error("Untrusted desktop request");
    const result=await updates[action]();
    if(result.phase==="error"){installingUpdate=false;if(!mainWindow.isDestroyed())mainWindow.setEnabled(true);}
    return result;
  });
  const updateTimer=setTimeout(()=>void updates.check(),10000);updateTimer.unref();
  const updateInterval=setInterval(()=>void updates.check(),6*60*60*1000);updateInterval.unref();
  mainWindow.on("closed",()=>{clearTimeout(updateTimer);clearInterval(updateInterval);});
  mainWindow.on("close", (event) => {
    if (closing || installingUpdate) return;
    event.preventDefault();
    closing = true;
    const bounds = mainWindow.getNormalBounds();
    const flush = !saveHandlerReady ? Promise.resolve(true) : new Promise((resolve) => {
      const timeout = setTimeout(() => { saveAcknowledged = undefined; resolve(false); }, 10000);
      saveAcknowledged = (ok) => { clearTimeout(timeout); saveAcknowledged = undefined; resolve(ok); };
      mainWindow.webContents.send("zenty:save-before-close");
    });
    mainWindow.setEnabled(false);
    void flush.then(async (ok) => {
      if (!ok) throw new Error("No se pudo confirmar el guardado. La aplicación sigue abierta; exporta un respaldo o vuelve a intentar cerrar.");
      await spotifySessionStore.flush().catch(() => {});
      await fs.writeFile(
        path.join(app.getPath("userData"), "window.json"),
        JSON.stringify({
          width: bounds.width,
          height: bounds.height,
          fullscreen: mainWindow.isFullScreen(),
          maximized: mainWindow.isMaximized(),
        }),
      );
      mainWindow.close();
    }).catch((error) => {
      closing = false;
      mainWindow.setEnabled(true);
      dialog.showErrorBox("No se pudo guardar", error.message);
    });
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (saved.maximized && !mainWindow.isFullScreen()) mainWindow.maximize();
  });
  mainWindow.webContents.on("render-process-gone", () => {
    if (!mainWindow.isDestroyed()) mainWindow.reload();
  });
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, code, _description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3)
        dialog.showErrorBox(
          `${APP_NAME}`,
          `No se pudo cargar tu espacio. Tus datos siguen conservados en la carpeta de ${APP_NAME}.`,
        );
    },
  );
  await mainWindow.loadURL(origin);
  if (diagnostic) {
    await fs.mkdir(path.dirname(diagnosticPath), { recursive: true });
    await fs.writeFile(
      diagnosticPath,
      JSON.stringify({
        electron: process.versions.electron,
        node: process.versions.node,
        url: origin,
        dataDirectory,
        ...windowState(mainWindow),
        sandbox: mainWindow.webContents.getLastWebPreferences().sandbox,
        contextIsolation:
          mainWindow.webContents.getLastWebPreferences().contextIsolation,
        nodeIntegration:
          mainWindow.webContents.getLastWebPreferences().nodeIntegration,
      }),
    );
  }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady()
    .then(startup)
    .catch((error) => {
      dialog.showErrorBox(
        `No se pudo abrir ${APP_NAME}`,
        error.code === "EADDRINUSE"
          ? `El puerto local de ${APP_NAME} está ocupado. Cierra la otra instancia y vuelve a abrir la aplicación.`
          : String(error.message),
      );
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (installingUpdate) { void lanSharing?.stop(); localServer?.close(); return; }
    if (quitting || !localServer) return;
    event.preventDefault();
    quitting = true;
    void lanSharing?.stop().finally(() => localServer.close(() => app.quit()));
    setTimeout(() => app.quit(), 2000).unref();
  });
}
