const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { exportUserSave, saveRoots } = require('./user-save.cjs');
const inside = (root, target) => target !== root && !path.relative(root, target).startsWith('..') && !path.isAbsolute(path.relative(root, target));
function child(root, value) {
  const target = path.resolve(root, value);
  if (!inside(root, target)) throw new Error('backup.path');
  return target;
}
async function atomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = file + '.' + randomUUID() + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(value)); await fs.rename(temporary, file);
}
const exists = async file => { try { await fs.lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
async function checkedFile(root, relative) {
  if (typeof relative !== 'string' || relative.includes('\\') || relative.includes(':') || relative.includes('\0') || relative.split('/').some(part => !part || part === '.' || part === '..') || !saveRoots.includes(relative.split('/')[0])) throw new Error('backup.path');
  let cursor = root;
  for (const part of relative.split('/')) {
    cursor = child(cursor, part);
    if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error('backup.path');
  }
  const stat = await fs.stat(cursor);
  if (!stat.isFile()) throw new Error('backup.path');
  return { path: cursor, bytes: stat.size };
}
async function hashFile(file) { const hash = createHash('sha256'); for await (const part of createReadStream(file)) hash.update(part); return hash.digest('hex'); }
async function inspectBackup(source, parseSnapshot) {
  source = await fs.realpath(source);
  const manifestPath = path.join(source, 'save-manifest.json');
  const stat = await fs.lstat(manifestPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 10_000_000) throw new Error('backup.invalid');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 100000 || !Number.isFinite(Date.parse(manifest.createdAt))) throw new Error('backup.invalid');
  const seen = new Set(); let bytes = 0;
  for (const item of manifest.files) {
    if (seen.has(item.path) || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('backup.invalid');
    seen.add(item.path);
    const file = await checkedFile(source, item.path);
    if (file.bytes !== item.bytes || await hashFile(file.path) !== item.sha256) throw new Error('backup.changed');
    bytes += file.bytes;
  }
  const snapshot = 'data/dashboard-data/dashboard.json';
  if (!seen.has(snapshot)) throw new Error('backup.invalid');
  parseSnapshot(await fs.readFile(child(source, snapshot), 'utf8'));
  return { source, manifest, files: manifest.files.length, bytes, createdAt: manifest.createdAt };
}
async function recoverInterruptedRestore(profile) {
  try { if ((await fs.lstat(path.join(profile, 'backups'))).isSymbolicLink()) throw new Error('backup.path'); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  const journalPath = path.join(profile, 'backups/restore-journal.json');
  if (!await exists(journalPath)) return false;
  const journal = JSON.parse(await fs.readFile(journalPath, 'utf8'));
  if (journal.version !== 1 || !['applying', 'committed'].includes(journal.phase) || !/^[a-f0-9-]{36}$/.test(journal.id) || !Array.isArray(journal.original) || journal.original.some(name => !saveRoots.includes(name))) throw new Error('backup.recovery');
  const staging = child(profile, '.restore-stage-' + journal.id), previous = child(profile, 'backups/.restore-previous-' + journal.id);
  if (journal.phase !== 'committed' && (!await exists(staging) || !await exists(previous))) throw new Error('backup.recovery');
  if (journal.phase !== 'committed') for (const name of saveRoots) {
    const old = child(previous, name), target = child(profile, name);
    if (await exists(old)) { await fs.rm(target, { recursive: true, force: true }); await fs.rename(old, target); }
    else if (!journal.original.includes(name)) await fs.rm(target, { recursive: true, force: true });
  }
  await fs.rm(staging, { recursive: true, force: true });
  await fs.rm(previous, { recursive: true, force: true });
  await fs.unlink(journalPath); return true;
}
async function createBackupManager(profile, { name, parseSnapshot, now = Date.now, fault = () => {} }) {
  profile = await fs.realpath(profile);
  const root = child(profile, 'backups');
  await fs.mkdir(root, { recursive: true });
  if ((await fs.lstat(root)).isSymbolicLink()) throw new Error('backup.path');
  await recoverInterruptedRestore(profile);
  const settingsPath = child(profile, 'backup-settings.json');
  let settings = { automatic: true, keep: 3 }, busy = false, error = '';
  try {
    const value = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
    if (typeof value.automatic === 'boolean' && Number.isInteger(value.keep) && value.keep >= 1 && value.keep <= 10) settings = { automatic: value.automatic, keep: value.keep };
  } catch (cause) { if (cause.code !== 'ENOENT') { settings.automatic = false; error = 'backup.settingsError'; } }
  async function list() {
    const result = [];
    for (const kind of ['automatic', 'manual']) {
      const folder = child(root, kind); await fs.mkdir(folder, { recursive: true });
      for (const entry of (await fs.readdir(folder, { withFileTypes: true })).filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.endsWith('.partial'))) {
        try {
          const manifest = JSON.parse(await fs.readFile(path.join(folder, entry.name, 'save-manifest.json'), 'utf8'));
          if (manifest.version === 1 && Array.isArray(manifest.files) && Number.isFinite(Date.parse(manifest.createdAt))) result.push({ id: `${kind}/${entry.name}`, kind, createdAt: manifest.createdAt, files: manifest.files.length, bytes: manifest.files.reduce((sum, item) => sum + Number(item.bytes || 0), 0) });
        } catch { /* An incomplete backup is never offered for restoration. */ }
      }
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function snapshot(automatic = false) {
    const raw = await fs.readFile(path.join(profile, 'data/dashboard-data/dashboard.json'), 'utf8'); parseSnapshot(raw);
    const destination = child(root, automatic ? 'automatic' : 'manual'); await fs.mkdir(destination, { recursive: true });
    const result = await exportUserSave(profile, destination, raw, name, { internal: true });
    if (automatic) {
      const old = (await list()).filter(item => item.kind === 'automatic').slice(settings.keep);
      for (const item of old) await fs.rm(child(root, item.id), { recursive: true });
    }
    return result;
  }
  const serial = async work => {
    if (busy) throw new Error('backup.busy'); busy = true; error = '';
    try { return await work(); } catch (cause) { error = /^backup\./.test(cause.message) ? cause.message : 'backup.failed'; throw new Error(error); } finally { busy = false; }
  };
  return {
    status: async () => ({ ...settings, busy, error, snapshots: await list() }),
    configure: async value => { if (busy) throw new Error('backup.busy'); if (!value || typeof value.automatic !== 'boolean' || !Number.isInteger(value.keep) || value.keep < 1 || value.keep > 10) throw new Error('backup.invalid'); await atomic(settingsPath, value); settings = { automatic: value.automatic, keep: value.keep }; },
    create: () => serial(() => snapshot(false)),
    automatic: () => serial(async () => { if (!settings.automatic) return false; const last = (await list()).find(item => item.kind === 'automatic'); if (last && now() - Date.parse(last.createdAt) < 86400000) return false; await snapshot(true); return true; }),
    inspect: source => serial(async () => { const value = await inspectBackup(source, parseSnapshot); return { source: value.source, files: value.files, bytes: value.bytes, createdAt: value.createdAt }; }),
    internalPath: id => { if (typeof id !== 'string' || id.split('/').length !== 2 || !['automatic', 'manual'].includes(id.split('/')[0]) || id.includes('\\')) throw new Error('backup.path'); return child(root, id); },
    restore: source => serial(async () => {
      const checked = await inspectBackup(source, parseSnapshot);
      if (inside(source, profile) || source === profile || inside(path.join(profile, 'data'), source)) throw new Error('backup.path');
      await snapshot(false);
      const id = randomUUID(), staging = child(profile, '.restore-stage-' + id), previous = child(root, '.restore-previous-' + id), journalPath = child(root, 'restore-journal.json');
      await fs.mkdir(staging); await fs.mkdir(previous);
      try {
        for (const file of checked.manifest.files) { const target = child(staging, file.path); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile((await checkedFile(checked.source, file.path)).path, target); }
        await fs.writeFile(path.join(staging, 'save-manifest.json'), JSON.stringify(checked.manifest));
        await inspectBackup(staging, parseSnapshot);
        const original = []; for (const name of saveRoots) if (await exists(child(profile, name))) original.push(name);
        await atomic(journalPath, { version: 1, id, original, phase: 'applying' });
        for (const name of saveRoots) {
          if (original.includes(name)) await fs.rename(child(profile, name), child(previous, name));
          if (await exists(child(staging, name))) await fs.rename(child(staging, name), child(profile, name));
          await fault(name);
        }
        await atomic(journalPath, { version: 1, id, original, phase: 'committed' });
        await recoverInterruptedRestore(profile);
      } catch (cause) {
        if (await exists(journalPath)) await recoverInterruptedRestore(profile);
        else { await fs.rm(staging, { recursive: true, force: true }); await fs.rm(previous, { recursive: true, force: true }); }
        throw cause;
      }
      return true;
    }),
  };
}
module.exports = { createBackupManager, inspectBackup, recoverInterruptedRestore };
