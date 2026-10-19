const fs = require('node:fs/promises');
const path = require('node:path');
const { createReadStream } = require('node:fs');
const { createHash, randomUUID } = require('node:crypto');
const allowed = ['data', 'audio.json', 'window.json', 'startup.json', 'reminders'];
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return !relative || (!relative.startsWith('..') && !path.isAbsolute(relative));
};
async function inventory(root) {
  const files = [];
  async function visit(relative) {
    const absolute = path.join(root, relative);
    let stat;
    try { stat = await fs.lstat(absolute); } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error('El save contiene un enlace externo: ' + relative);
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(absolute)).sort()) await visit(path.join(relative, name));
    } else if (stat.isFile() && !relative.endsWith('.tmp'))
      files.push({ path: relative, size: stat.size, modified: stat.mtimeMs });
  }
  for (const name of allowed) await visit(name);
  return files;
}
async function exportUserSave(profile, destination, snapshot, name) {
  profile = await fs.realpath(profile);
  destination = await fs.realpath(destination);
  if (inside(profile, destination)) throw new Error('Elige una carpeta fuera del save de la aplicación.');
  const folder = path.join(destination, `${name}-save-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
  const staging = folder + '.partial';
  await fs.mkdir(staging);
  try {
    const before = await inventory(profile);
    for (const file of before) {
      const target = path.join(staging, file.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(path.join(profile, file.path), target);
    }
    if (JSON.stringify(before) !== JSON.stringify(await inventory(profile)))
      throw new Error('El save cambió durante la copia. Espera a que terminen las descargas y vuelve a exportar.');
    const dashboard = path.join(staging, 'data', 'dashboard-data', 'dashboard.json');
    await fs.mkdir(path.dirname(dashboard), { recursive: true });
    await fs.writeFile(dashboard, snapshot);
    const files = [];
    for (const file of await inventory(staging)) {
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(path.join(staging, file.path))) hash.update(chunk);
      files.push({ path: file.path.split(path.sep).join('/'), bytes: file.size, sha256: hash.digest('hex') });
    }
    await fs.writeFile(path.join(staging, 'save-manifest.json'), JSON.stringify({ version: 1, app: name, createdAt: new Date().toISOString(), files }, null, 2));
    await fs.writeFile(path.join(staging, 'LEEME.txt'), `Respaldo de ${name}.\nPara restaurar: cierra la aplicación y copia data, reminders, audio.json, window.json y startup.json de este respaldo a %APPDATA%\\${name}. Conserva una copia del save anterior.\nEl inicio con Windows se activa manualmente desde Ajustes en cada equipo; restaurar el respaldo no registra un inicio automático.\nIncluye documentos, progreso, preferencias, alarmas, biblioteca gamer y caché. No incluye juegos instalados, ROMs externos, páginas de manga en línea ni sesiones de acceso.\n`);
    await fs.rename(staging, folder);
    return { path: folder, files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) };
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}
async function migrateProfile(legacy, target) {
  try { await fs.access(target); return false; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { await fs.access(legacy); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  const staging = target + '.migration-' + randomUUID();
  try {
    await fs.cp(legacy, staging, { recursive: true, filter: (source) => !['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'].includes(path.basename(source)) });
    await fs.rename(staging, target);
    return true;
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}
module.exports = { exportUserSave, migrateProfile };
module.exports.migrateProfileSync = (legacy, target) => {
  const sync = require('node:fs');
  if (sync.existsSync(target) || !sync.existsSync(legacy)) return false;
  const staging = target + '.migration-' + randomUUID();
  try {
    sync.cpSync(legacy, staging, { recursive: true, filter: (source) => !['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'].includes(path.basename(source)) });
    sync.renameSync(staging, target);
    return true;
  } catch (error) {
    sync.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
};
