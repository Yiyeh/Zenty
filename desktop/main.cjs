const { tr } = require("./locale.cjs");
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
  const { setLocale, validLanguage } = require("./locale.cjs");
  try {
    const profile = JSON.parse(await fs.readFile(path.join(dataDirectory, "dashboard-data", "dashboard.json"), "utf8"));
    if (validLanguage(profile.settings?.language)) await setLocale(profile.settings.language);
  } catch { /* A new profile uses the renderer's initial language. */ }
  ipcMain.handle("zenty:locale:set", async (event, language) => {
    if (!trustedFrame(event, origin) || event.sender !== mainWindow.webContents || !validLanguage(language)) throw new Error(tr("main.b28493f6ab"));
    await setLocale(language);
  });
  const { createPinSecurity } = require("./pin-security.cjs");
  const pinSecurity = await createPinSecurity(path.join(currentProfile, "security", "pin.json"), {
    notify: (state) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("zenty:security:state", state); },
  });
  const handleProtected = (channel, listener) => ipcMain.handle(channel, (event, ...args) => {
    if (pinSecurity.isLocked()) throw new Error("security.locked");
    return listener(event, ...args);
  });
  const { startLocalServer } = await import(
    pathToFileURL(
      path.join(base, "desktop-server", "server", "local-server.js"),
    ).href
  );
  const local = await startLocalServer({
    root: path.join(base, "dist"),
    dataDirectory,
    port: 17731,
    isLocked: pinSecurity.isLocked,
  });
  localServer = local.server;
  origin = local.url;
  const { createLanSharing } = await import(pathToFileURL(path.join(base, "desktop-server/server/lan-server.js")).href);
  const integrationRequests = new Map();
  const requestIntegration = (action, input) => new Promise((resolve, reject) => {
    if (pinSecurity.isLocked() || !mainWindow || mainWindow.isDestroyed() || integrationRequests.size >= 16) { reject(new Error(tr("main.a8444fec30"))); return; }
    const id = require("node:crypto").randomUUID();
    const timeout = setTimeout(() => { integrationRequests.delete(id); reject(new Error(tr("main.8f6c10dcb3"))); }, 20000);
    integrationRequests.set(id, { resolve, reject, timeout });
    mainWindow.webContents.send("zenty:integration-request", { id, action, input });
  });
  ipcMain.on("zenty:integration-reply", (event, result) => {
    if (!trustedFrame(event, origin) || event.sender !== mainWindow?.webContents) return;
    const pending = integrationRequests.get(result?.id); if (!pending) return;
    integrationRequests.delete(result.id); clearTimeout(pending.timeout);
    if (result.ok) pending.resolve(result.value); else pending.reject(new Error(tr("main.4d8c09fb8e")));
  });
  lanSharing = createLanSharing(origin, 17732, path.join(dataDirectory, "lan-sharing"), requestIntegration);
  for (const action of ["get", "set", "forget"])
    handleProtected(`zenty:lan:${action}`, async (event, enabled) => {
      if (!trustedFrame(event, origin) || event.sender !== mainWindow.webContents)
        throw new Error(tr("main.2134334888"));
      try {
        if (action === "set" && typeof enabled !== "boolean") throw new Error(tr("main.10225406ca"));
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
          error: tr("main.b68fa81b79"),
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
          error: tr("main.66830629ae", { v0: APP_NAME }),
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
          error: String(error || tr("main.29ff8a87d8")),
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
        `${APP_NAME} · ${tr("security.reminderTitle")}`,
        pinSecurity.isLocked() ? tr("security.reminder") : reminderMessage(occurrence),
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
    handleProtected(`zenty:reminders:${action}`, async (event, value) => {
      if (
        !trustedFrame(event, origin) ||
        event.sender !== mainWindow.webContents
      )
        throw new Error(tr("main.2134334888"));
      if (action === "test")
        return sendReminderNotification(
          APP_NAME,
          tr("main.c95ddd60ba", { v0: APP_NAME }),
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
      handleProtected(`zenty:audio:${action}`, (event, value) => {
        if (
          !trustedFrame(event, origin) ||
          event.sender !== mainWindow.webContents
        )
          throw new Error(tr("main.2134334888"));
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
        throw new Error(tr("main.2134334888"));
      performWindowAction(mainWindow, action);
    });
  ipcMain.handle("zenty:state", (event) => {
    if (!trustedFrame(event, origin) || event.sender !== mainWindow.webContents)
      throw new Error(tr("main.2134334888"));
    return windowState(mainWindow);
  });
  handleProtected("zenty:data-folder", async (event) => {
    if (!trustedFrame(event, origin) || event.sender !== mainWindow.webContents)
      throw new Error(tr("main.2134334888"));
    await shell.openPath(app.getPath("userData"));
  });
  const startupSettings = createStartupSettings(app, process.execPath, app.getPath("userData"), APP_NAME);
  const spotifySessionStore = createSpotifySessionStore(path.join(app.getPath("userData"), "connections"), safeStorage);
  for (const action of ["get", "set"])
    handleProtected(`zenty:spotify-session:${action}`, (event, value) => {
      if (!trustedFrame(event, origin) || event.sender !== mainWindow.webContents)
        throw new Error(tr("main.2134334888"));
      return action === "get" ? spotifySessionStore.get() : spotifySessionStore.set(value);
    });
  for (const action of ["get", "set"])
    handleProtected(`zenty:startup:${action}`, async (event, enabled) => {
      if (!trustedFrame(event, origin) || event.sender !== mainWindow.webContents)
        throw new Error(tr("main.2134334888"));
      try {
        const value = action === "get" ? startupSettings.get() : await startupSettings.set(enabled);
        return { ok: true, value };
      } catch (error) {
        return { ok: false, error: error.message || tr("main.6c47cc6f51") };
      }
    });
  handleProtected("zenty:export-save", async (event, raw) => {
    if (!trustedFrame(event, origin) || event.sender !== mainWindow.webContents)
      throw new Error(tr("main.2134334888"));
    if (typeof raw !== "string" || Buffer.byteLength(raw) > 5_000_000)
      throw new Error(tr("main.53f0fad058"));
    const { parseBackup } = await import(pathToFileURL(path.join(base, "desktop-server/src/lib/dashboard.js")).href);
    const snapshot = JSON.stringify({ ...parseBackup(raw), version: 2 });
    const chosen = await dialog.showOpenDialog(mainWindow, { title: tr("main.5f6d2595ae"), properties: ["openDirectory", "createDirectory"] });
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
    if (!saveHandlerReady) throw new Error(tr("main.2f02507cee"));
    const ok = await new Promise((resolve) => {
      const timeout = setTimeout(() => { saveAcknowledged=undefined; resolve(false); },10000);
      saveAcknowledged=(ok)=>{clearTimeout(timeout);saveAcknowledged=undefined;resolve(ok);};
      mainWindow.webContents.send("zenty:save-before-close");
    });
    if (!ok) throw new Error(tr("main.49769798e6"));
    await spotifySessionStore.flush();
  };
  const {createUpdateController,backupUpdateMetadata}=require("./update-controller.cjs");
  const updateSupported=app.isPackaged && require("node:fs").existsSync(path.join(process.resourcesPath,"app-update.yml"));
  const updates=createUpdateController({
    updater:updateSupported?require("electron-updater").autoUpdater:null,version:app.getVersion(),supported:updateSupported,
    notify:(state)=>{if(!mainWindow.isDestroyed())mainWindow.webContents.send("zenty:updates:state",state);},
    prepare:async()=>{
      if(closing)throw new Error(tr("main.82dfda72c3"));
      mainWindow.setEnabled(false);
      try { await flushForUpdate(); await backupUpdateMetadata(app.getPath("userData"),app.getVersion()); installingUpdate=true; }
      finally { if(!installingUpdate && !mainWindow.isDestroyed())mainWindow.setEnabled(true); }
    },
  });
  for(const action of ["get","check","download","install"]) handleProtected(`zenty:updates:${action}`,async(event)=>{
    if(!trustedFrame(event,origin)||event.sender!==mainWindow.webContents)throw new Error(tr("main.2134334888"));
    const result=await updates[action]();
    if(result.phase==="error"){installingUpdate=false;if(!mainWindow.isDestroyed())mainWindow.setEnabled(true);}
    return result;
  });
  for (const action of ["get", "unlock", "lock", "configure", "disable", "recover"]) {
    ipcMain.handle(`zenty:security:${action}`, async (event, value, pin) => {
      if (!trustedFrame(event, origin) || event.sender !== mainWindow.webContents) throw new Error(tr("main.2134334888"));
      if (action === "get") return pinSecurity.state();
      if (action === "lock") {
        if (!pinSecurity.state().enabled || pinSecurity.isLocked()) return pinSecurity.state();
        await flushForUpdate();
        await lanSharing.stop();
        const state = await pinSecurity.lock(); saveHandlerReady = false; return state;
      }
      return pinSecurity[action](value, pin);
    });
  }
  const updateTimer=setTimeout(()=>void updates.check(),10000);updateTimer.unref();
  const updateInterval=setInterval(()=>void updates.check(),6*60*60*1000);updateInterval.unref();
  mainWindow.on("closed",()=>{clearTimeout(updateTimer);clearInterval(updateInterval);});
  mainWindow.on("close", (event) => {
    if (closing || installingUpdate) return;
    event.preventDefault();
    closing = true;
    const bounds = mainWindow.getNormalBounds();
    const flush = (pinSecurity.isLocked() || !saveHandlerReady) ? Promise.resolve(true) : new Promise((resolve) => {
      const timeout = setTimeout(() => { saveAcknowledged = undefined; resolve(false); }, 10000);
      saveAcknowledged = (ok) => { clearTimeout(timeout); saveAcknowledged = undefined; resolve(ok); };
      mainWindow.webContents.send("zenty:save-before-close");
    });
    mainWindow.setEnabled(false);
    void flush.then(async (ok) => {
      if (!ok) throw new Error(tr("main.4c35f1bf44"));
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
      dialog.showErrorBox(tr("main.1634cfd2df"), error.message);
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
          tr("main.38124048e7", { v0: APP_NAME }),
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
        tr("main.ad8cd4041a", { v0: APP_NAME }),
        error.code === "EADDRINUSE"
          ? tr("main.e7bb2fca5e", { v0: APP_NAME })
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
