// AES-256-GCM для токенов рекламных кабинетов. Ключ = sha256(APP_SECRET).
const crypto = require('crypto');
const config = require('./config');

function key() {
  if (!config.appSecret) throw new Error('APP_SECRET не задан — нельзя сохранять доступы к кабинетам');
  return crypto.createHash('sha256').update(config.appSecret).digest();
}

function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj || {}), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

function decrypt(str) {
  if (!str) return {};
  const [iv, tag, data] = str.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString('utf8'));
}

module.exports = { encrypt, decrypt };
