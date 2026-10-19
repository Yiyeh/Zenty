const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
function validSession(value) {
  return value && typeof value === 'object' &&
    typeof value.accessToken === 'string' && value.accessToken.length > 0 && value.accessToken.length <= 20000 &&
    typeof value.clientId === 'string' && /^[a-zA-Z0-9]{1,100}$/.test(value.clientId) &&
    Number.isFinite(value.expiresAt) && value.expiresAt > 0 &&
    (value.refreshToken === undefined || (typeof value.refreshToken === 'string' && value.refreshToken.length <= 20000)) &&
    (value.scope === undefined || (typeof value.scope === 'string' && value.scope.length <= 5000));
}
function createSpotifySessionStore(directory, safeStorage) {
  const target = path.join(directory, 'spotify-session.enc');
  let pending = Promise.resolve();
  const encryption = () => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows no permite cifrar la conexión de Spotify. No se guardarán credenciales sin cifrar.');
  };
  return {
    async get() {
      await pending.catch(() => {});
      let encrypted;
      try { encrypted = await fs.readFile(target); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      if (encrypted.length > 100000) throw new Error('La conexión guardada de Spotify no es válida.');
      encryption();
      const value = JSON.parse(safeStorage.decryptString(encrypted));
      if (!validSession(value)) throw new Error('La conexión guardada de Spotify no es válida.');
      return value;
    },
    set(value) {
      if (value !== null && !validSession(value)) return Promise.reject(new Error('Sesión de Spotify no válida.'));
      // Capture before queuing so caller mutation cannot replace the validated data.
      const raw = value === null ? null : JSON.stringify({ accessToken: value.accessToken, refreshToken: value.refreshToken, clientId: value.clientId, expiresAt: value.expiresAt, scope: value.scope });
      const work = pending.catch(() => {}).then(async () => {
        if (raw === null) { await fs.rm(target, { force: true }); return; }
        encryption();
        const encrypted = safeStorage.encryptString(raw);
        await fs.mkdir(directory, { recursive: true });
        const temporary = `${target}.${randomUUID()}.tmp`;
        try { await fs.writeFile(temporary, encrypted, { mode: 0o600 }); await fs.rename(temporary, target); }
        finally { await fs.rm(temporary, { force: true }); }
      });
      pending = work;
      return work;
    },
    flush: () => pending,
  };
}
module.exports = { createSpotifySessionStore };
