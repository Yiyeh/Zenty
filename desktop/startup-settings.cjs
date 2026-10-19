const { tr } = require("./locale.cjs");
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
function createStartupSettings(app, executable, profile, name, platform = process.platform) {
  const supported = platform === 'win32' && app.isPackaged;
  const options = { path: executable, args: [] };
  const get = () => {
    if (!supported) return { supported: false, enabled: false };
    const actual = app.getLoginItemSettings(options);
    // openAtLogin queries Electron's default AppUserModelId, whereas our Run
    // entry uses the product name. Inspect the matching named user entry.
    const normalize = (value) => path.resolve(value.replace(/^"|"$/g, '')).toLowerCase();
    if (Array.isArray(actual.launchItems)) {
      const entry = actual.launchItems.find((item) => item.name === name && item.scope === 'user' &&
        typeof item.path === 'string' && normalize(item.path) === normalize(executable) &&
        Array.isArray(item.args) && item.args.length === 0);
      return { supported: true, enabled: entry?.enabled === true };
    }
    return { supported: true, enabled: actual.openAtLogin === true && actual.executableWillLaunchAtLogin !== false };
  };
  return {
    get,
    async set(enabled) {
      if (!supported || typeof enabled !== 'boolean') throw new Error(tr("startup_settings.787d710a1a"));
      app.setLoginItemSettings({ ...options, name, openAtLogin: enabled, enabled });
      const actual = get();
      if (actual.enabled !== enabled) throw new Error(tr("startup_settings.cdd491414e"));
      await fs.mkdir(profile, { recursive: true });
      const temporary = path.join(profile, `startup.${randomUUID()}.tmp`);
      await fs.writeFile(temporary, JSON.stringify({ enabled: actual.enabled }));
      await fs.rename(temporary, path.join(profile, 'startup.json'));
      return actual;
    },
  };
}
module.exports = { createStartupSettings };
