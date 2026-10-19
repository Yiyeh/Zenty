const { contextBridge, ipcRenderer } = require("electron");
if (process.isMainFrame)
  contextBridge.exposeInMainWorld("zentyDesktop", {
    platform: process.platform,
    updates: {
      get:()=>ipcRenderer.invoke("zenty:updates:get"),check:()=>ipcRenderer.invoke("zenty:updates:check"),download:()=>ipcRenderer.invoke("zenty:updates:download"),install:()=>ipcRenderer.invoke("zenty:updates:install"),
      onState:(listener)=>{const callback=(_event,state)=>listener(state);ipcRenderer.on("zenty:updates:state",callback);return()=>ipcRenderer.removeListener("zenty:updates:state",callback);},
    },
    onIntegrationRequest: (listener) => {
      const callback = async (_event, request) => {
        try { ipcRenderer.send("zenty:integration-reply", { id: request.id, ok: true, value: await listener(request.action, request.input) }); }
        catch { ipcRenderer.send("zenty:integration-reply", { id: request.id, ok: false }); }
      };
      ipcRenderer.on("zenty:integration-request", callback);
      return () => ipcRenderer.removeListener("zenty:integration-request", callback);
    },
    spotifySession: {
      get: () => ipcRenderer.invoke("zenty:spotify-session:get"),
      set: (value) => ipcRenderer.invoke("zenty:spotify-session:set", value),
    },
    lan: {
      forget: async () => { const result = await ipcRenderer.invoke("zenty:lan:forget"); if (!result.ok) throw new Error(result.error); return result.value; },
      get: async () => { const result = await ipcRenderer.invoke("zenty:lan:get"); if (!result.ok) throw new Error(result.error); return result.value; },
      set: async (enabled) => { const result = await ipcRenderer.invoke("zenty:lan:set", enabled); if (!result.ok) throw new Error(result.error); return result.value; },
    },
    startup: {
      get: async () => {
        const result = await ipcRenderer.invoke("zenty:startup:get");
        if (!result.ok) throw new Error(result.error);
        return result.value;
      },
      set: async (enabled) => {
        const result = await ipcRenderer.invoke("zenty:startup:set", enabled);
        if (!result.ok) throw new Error(result.error);
        return result.value;
      },
    },
    exportSave: (raw) => ipcRenderer.invoke("zenty:export-save", raw),
    onBeforeClose: (listener) => {
      const callback = async () => {
        let ok = false;
        try { await listener(); ok = true; } catch { /* Main keeps the app open. */ }
        ipcRenderer.send("zenty:save-ready", ok);
      };
      ipcRenderer.on("zenty:save-before-close", callback);
      ipcRenderer.send("zenty:save-handler-ready");
      return () => ipcRenderer.removeListener("zenty:save-before-close", callback);
    },
    reminders: {
      sync: (value) => ipcRenderer.invoke("zenty:reminders:sync", value),
      test: () => ipcRenderer.invoke("zenty:reminders:test"),
      onOpen: (listener) => {
        const callback = () => listener();
        ipcRenderer.on("zenty:reminders:open", callback);
        return () => ipcRenderer.removeListener("zenty:reminders:open", callback);
      },
      onFired: (listener) => {
        const callback = (_event, value) => listener(value);
        ipcRenderer.on("zenty:reminders:fired", callback);
        return () =>
          ipcRenderer.removeListener("zenty:reminders:fired", callback);
      },
    },
    audio:
      process.platform === "win32"
        ? {
            get: () => ipcRenderer.invoke("zenty:audio:get"),
            set: (value) => ipcRenderer.invoke("zenty:audio:set", value),
          }
        : undefined,
    minimize: () => ipcRenderer.invoke("zenty:minimize"),
    maximize: () => ipcRenderer.invoke("zenty:maximize"),
    close: () => ipcRenderer.invoke("zenty:close"),
    fullscreen: () => ipcRenderer.invoke("zenty:fullscreen"),
    getState: () => ipcRenderer.invoke("zenty:state"),
    openDataFolder: () => ipcRenderer.invoke("zenty:data-folder"),
    onState: (listener) => {
      const callback = (_event, state) => listener(state);
      ipcRenderer.on("zenty:state-changed", callback);
      return () => ipcRenderer.removeListener("zenty:state-changed", callback);
    },
  });
