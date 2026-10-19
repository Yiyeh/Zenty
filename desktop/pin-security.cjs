const { randomBytes, scrypt: derive, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const scrypt = promisify(derive);
const validPin = (value) => typeof value === 'string' && /^\d{6,12}$/.test(value);
const digest = async (value, salt) => (await scrypt(value, salt, 32)).toString('hex');
const equal = (a, b) => /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
async function createPinSecurity(file, { now = Date.now, notify = () => {} } = {}) {
  let record = null, corrupt = false, locked = false, queue = Promise.resolve();
  try {
    record = JSON.parse(await fs.readFile(file, 'utf8'));
    if (record.version !== 1 || !/^[a-f0-9]{32}$/.test(record.salt) || !/^[a-f0-9]{64}$/.test(record.hash) || !/^[a-f0-9]{64}$/.test(record.recoveryHash) || !Number.isSafeInteger(record.failures) || record.failures < 0 || !Number.isFinite(record.retryAt)) throw new Error();
    locked = true;
  } catch (error) { if (error.code !== 'ENOENT') { corrupt = true; locked = true; } }
  const state = () => ({ enabled: !!record || corrupt, locked, damaged: corrupt, retryAfter: Math.max(0, Math.ceil(((record?.retryAt || 0) - now()) / 1000)) });
  const publish = () => { const value = state(); notify(value); return value; };
  async function save(next) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = file + '.tmp';
    await fs.writeFile(temporary, JSON.stringify(next), { mode: 0o600 });
    await fs.rename(temporary, file);
    record = next;
  }
  async function verify(value, recovery = false) {
    if (corrupt) throw new Error('security.damaged');
    if (!record) return;
    if (record.retryAt > now()) throw new Error('security.wait');
    const valid = recovery ? typeof value === 'string' && /^[a-f0-9]{32}$/.test(value) : validPin(value);
    if (!valid || !equal(await digest(value, record.salt), recovery ? record.recoveryHash : record.hash)) {
      const failures = record.failures + 1;
      await save({ ...record, failures, retryAt: failures >= 5 ? now() + Math.min(300000, 30000 * 2 ** Math.min(4, failures - 5)) : 0 });
      publish(); throw new Error('security.incorrect');
    }
    await save({ ...record, failures: 0, retryAt: 0 });
  }
  const serial = (run) => { const next = queue.then(run); queue = next.catch(() => {}); return next; };
  return {
    state,
    isLocked: () => locked,
    unlock: (pin) => serial(async () => { await verify(pin); locked = false; return publish(); }),
    lock: () => serial(async () => { if (record || corrupt) locked = true; return publish(); }),
    configure: (current, pin) => serial(async () => {
      if (locked) throw new Error('security.locked');
      if (!validPin(pin)) throw new Error('security.invalid');
      await verify(current);
      const salt = randomBytes(16).toString('hex'), recovery = randomBytes(16).toString('hex');
      await save({ version: 1, salt, hash: await digest(pin, salt), recoveryHash: await digest(recovery, salt), failures: 0, retryAt: 0 });
      return { ...publish(), recovery };
    }),
    disable: (pin) => serial(async () => { if (locked) throw new Error('security.locked'); await verify(pin); await fs.unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; }); record = null; return publish(); }),
    recover: (code) => serial(async () => { await verify(code, true); await fs.unlink(file); record = null; locked = false; return publish(); }),
  };
}
module.exports = { createPinSecurity };
