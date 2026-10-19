import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { defaultData, parseBackup } from '../src/lib/dashboard.ts';
const { exportUserSave, migrateProfileSync } = createRequire(import.meta.url)('../desktop/user-save.cjs');
test('save completo: archivos, progreso, preferencias, hashes y exclusión de sesiones', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zenty-save-'));
  try {
    const profile = join(root, 'profile'), out = join(root, 'exports');
    await mkdir(out); await mkdir(join(profile, 'data/library-data/books'), { recursive: true });
    for (const [name, content] of Object.entries({
      'data/library-data/books/book.pdf': 'book fixture',
      'data/library-data/library.json': '{"page":42}',
      'data/gaming-data/local-games.json': '{"favorite":true}',
      'data/gaming-data/images/cover.jpg': 'cover fixture',
      'data/dashboard-data/dashboard.json': '{"old":true}',
      'reminders/plan.json': '{"enabled":true}', 'reminders/delivered.json': '["sent"]',
      'audio.json': '{"volume":40}', 'window.json': '{"fullscreen":true}',
      'Network/Cookies': 'secret session',
      'connections/spotify-session.enc': 'encrypted token fixture',
    })) {
      await mkdir(join(profile, name, '..'), { recursive: true });
      await writeFile(join(profile, name), content);
    }
    const data = structuredClone(defaultData);
    data.settings.readerPreferences = { 'zenty-manga-mode': 'ltr', 'zenty-manga-zoom': 1.6 };
    const snapshot = JSON.stringify({ ...data, version: 2 });
    const result = await exportUserSave(profile, out, snapshot, 'Zenty');
    const manifest = JSON.parse(await readFile(join(result.path, 'save-manifest.json'), 'utf8'));
    assert.equal(manifest.files.length, 9);
    for (const file of manifest.files) {
      const bytes = await readFile(join(result.path, file.path));
      assert.equal(bytes.length, file.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
      assert.ok(!file.path.includes('Cookies'));
    }
    assert.equal(parseBackup(await readFile(join(result.path, 'data/dashboard-data/dashboard.json'), 'utf8')).settings.readerPreferences['zenty-manga-mode'], 'ltr');
    assert.equal(await readFile(join(profile, 'data/dashboard-data/dashboard.json'), 'utf8'), '{"old":true}');
    await assert.rejects(exportUserSave(profile, profile, snapshot, 'Zenty'), /fuera/);
    assert.equal((await readdir(out)).length, 1);
    const migrated = join(root, 'Zenty');
    assert.equal(migrateProfileSync(profile, migrated), true);
    assert.equal(await readFile(join(migrated, 'Network/Cookies'), 'utf8'), 'secret session');
    await writeFile(join(migrated, 'audio.json'), 'new');
    assert.equal(migrateProfileSync(profile, migrated), false);
    assert.equal(await readFile(join(migrated, 'audio.json'), 'utf8'), 'new');
    assert.equal(await readFile(join(profile, 'audio.json'), 'utf8'), '{"volume":40}');
  } finally { await rm(root, { recursive: true, force: true }); }
});
