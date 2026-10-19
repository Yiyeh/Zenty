const { app } = require('electron');
const path = require('node:path');
app.setName('Zenty');
app.setAppUserModelId('com.zenty.personal-dashboard');
app.whenReady().then(async () => {
  const executable = path.resolve('releases/Zenty/Zenty.exe');
  const state = app.getLoginItemSettings({ path: executable, args: [] });
  console.log(JSON.stringify({ ...state, launchItems: state.launchItems?.filter(item => item.name === 'Zenty' || item.path?.toLowerCase().includes('zenty.exe')) }, null, 2));
  const { createStartupSettings } = require('../desktop/startup-settings.cjs');
  const settings = createStartupSettings({ isPackaged: true, getLoginItemSettings: (options) => app.getLoginItemSettings(options), setLoginItemSettings: (options) => app.setLoginItemSettings(options) }, executable, path.join(app.getPath('appData'), 'Zenty'), 'Zenty');
  console.log('Zenty startup:', JSON.stringify(settings.get()));
  if (process.argv.includes('--verify-set')) {
    // Preserve the user's current choice while exercising the real write/read path.
    console.log('Verified write:', JSON.stringify(await settings.set(settings.get().enabled)));
  }
  app.quit();
}).catch((error) => { console.error(error.message); app.exit(1); });
