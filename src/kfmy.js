// Роли из my.kontentferma (KF-my): CEO и лидеры направления Performance.
// Источник правды о том, кто руководит направлением, — «Настройки» в my.kontentferma.
// KF_MY_URL + KF_MY_API_KEY (= INGEST_API_KEY в KF-my). Кэш 5 минут; если KF-my
// недоступен — используем последний удачный ответ.
const config = require('./config');
const { json } = require('./http');

const TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, data: null };
let inflight = null;

function enabled() {
  return !!(config.kfMyUrl && config.kfMyApiKey);
}

async function load() {
  if (!enabled()) return null;
  if (cache.data && Date.now() - cache.at < TTL_MS) return cache.data;
  if (!inflight) {
    inflight = json(`${config.kfMyUrl}/api/ingest/roles`, { headers: { 'X-Api-Key': config.kfMyApiKey }, timeoutMs: 5000 })
      .then((data) => { cache = { at: Date.now(), data }; return data; })
      .catch((err) => { console.error('[kf-my] роли недоступны:', err.message); return cache.data; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

// 'admin' | 'lead' | null
async function roleFor(user) {
  const d = await load();
  if (!d) return null;
  const email = String(user.email || '').toLowerCase().trim();
  if (email && (d.ceoEmails || []).map((e) => String(e).toLowerCase()).includes(email)) return 'admin';
  const perf = (d.leads && d.leads[config.kfMyDirection]) || [];
  if (perf.includes(user.id)) return 'lead';
  return null;
}

module.exports = { enabled, roleFor, load };
