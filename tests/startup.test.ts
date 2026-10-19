import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { createStartupSettings } = createRequire(import.meta.url)('../desktop/startup-settings.cjs');
test('inicio con Windows: desactivado por defecto, cambios explícitos y persistencia', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zenty-startup-'));
  try {
    let enabled = false;
    const calls: unknown[] = [];
    const app = { isPackaged: true,
      getLoginItemSettings: (options: unknown) => { assert.deepEqual(options, { path: 'C:\\Zenty\\Zenty.exe', args: [] }); return { openAtLogin: enabled, executableWillLaunchAtLogin: enabled }; },
      setLoginItemSettings: (options: { openAtLogin: boolean }) => { calls.push(options); enabled = options.openAtLogin; },
    };
    const settings = createStartupSettings(app, 'C:\\Zenty\\Zenty.exe', directory, 'Zenty', 'win32');
    assert.deepEqual(settings.get(), { supported: true, enabled: false });
    assert.equal(calls.length, 0);
    assert.equal((await settings.set(true)).enabled, true);
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'startup.json'), 'utf8')), { enabled: true });
    assert.equal((await settings.set(false)).enabled, false);
    await assert.rejects(settings.set('true'));
    assert.equal(calls.length, 2);
    const development = createStartupSettings({ ...app, isPackaged: false }, '', directory, 'Zenty', 'win32');
    assert.deepEqual(development.get(), { supported: false, enabled: false });
    await assert.rejects(development.set(true));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('inicio: la entrada Zenty prevalece sobre el falso openAtLogin del identificador interno', () => {
  const executable = 'C:\\Zenty\\Zenty.exe';
  let entries = [{ name: 'Zenty', path: executable, args: [], scope: 'user', enabled: true }];
  const app = { isPackaged: true, getLoginItemSettings: () => ({ openAtLogin: false, executableWillLaunchAtLogin: true, launchItems: entries }) };
  const settings = createStartupSettings(app, executable, '', 'Zenty', 'win32');
  assert.equal(settings.get().enabled, true);
  entries[0].enabled = false;
  assert.equal(settings.get().enabled, false);
  entries = [{ ...entries[0], enabled: true, path: 'C:\\Other\\Zenty.exe' }];
  assert.equal(settings.get().enabled, false);
  entries = [{ ...entries[0], path: executable, name: 'Other' }];
  assert.equal(settings.get().enabled, false);
  entries = [];
  assert.equal(settings.get().enabled, false);
});
