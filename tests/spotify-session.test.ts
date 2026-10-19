import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
const { createSpotifySessionStore } = createRequire(import.meta.url)('../desktop/spotify-session.cjs');
test('Spotify: guardado cifrado, reinicio, rotación serializada y desconexión persistente', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zenty-spotify-'));
  const key = randomBytes(32);
  const encryption = {
    isEncryptionAvailable: () => true,
    encryptString: (raw: string) => { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); const data = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]); },
    decryptString: (raw: Buffer) => { const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12)); decipher.setAuthTag(raw.subarray(12, 28)); return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'); },
  };
  const session = { accessToken: 'test-access-sensitive', refreshToken: 'test-refresh-sensitive', clientId: 'client123', expiresAt: Date.now() - 10000, scope: 'user-read-playback-state' };
  try {
    const store = createSpotifySessionStore(directory, encryption);
    assert.equal(await store.get(), null);
    await store.set(session);
    const bytes = await readFile(join(directory, 'spotify-session.enc'));
    assert.equal(bytes.includes(Buffer.from(session.accessToken)), false);
    assert.equal(bytes.includes(Buffer.from(session.refreshToken)), false);
    assert.deepEqual(await createSpotifySessionStore(directory, encryption).get(), session);
    // An expired access token must retain its refresh token for automatic renewal.
    assert.equal((await store.get()).refreshToken, session.refreshToken);
    const rotation = store.set({ ...session, accessToken: 'rotated' });
    const disconnect = store.set(null);
    await Promise.all([rotation, disconnect]);
    assert.equal(await createSpotifySessionStore(directory, encryption).get(), null);
    await assert.rejects(store.set({ accessToken: 'bad' }));
    const unavailable = createSpotifySessionStore(directory, { ...encryption, isEncryptionAvailable: () => false });
    await assert.rejects(unavailable.set(session), /cifrar/);
    assert.equal(await store.get(), null);
    await writeFile(join(directory, 'spotify-session.enc'), 'corrupt');
    await assert.rejects(store.get());
  } finally { await rm(directory, { recursive: true, force: true }); }
});
