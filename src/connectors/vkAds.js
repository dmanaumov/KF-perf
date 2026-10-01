// VK Реклама (ads.vk.com) — API v2.
// Два варианта доступа:
//  1) готовый access token (поле token);
//  2) client_id + client_secret из «Настройки → Доступ к API» — токен портал получает
//     сам (permanent=true, бессрочный) и кэширует; для агентского кабинета укажите
//     логин клиента (agency_client_name) — тогда grant agency_client_credentials.
// Ограничение VK: не больше 5 токенов на пару client_id — пользователь; при
// упоре в лимит старые токены удаляются через /oauth2/token/delete.json.
const { json, request } = require('../http');

const fields = [
  { key: 'client_id', label: 'Client ID (из «Доступ к API»)' },
  { key: 'client_secret', label: 'Client secret', secret: true },
  { key: 'agency_client_name', label: 'Логин клиента в агентском кабинете (если доступ агентский)' },
  { key: 'token', label: '…или готовый access token', secret: true },
];
const settingsFields = [];
const HOST = 'https://ads.vk.com';
const BASE = `${HOST}/api/v2`;

// кэш токенов, полученных по client_credentials: ключ — client_id|клиент
const tokenCache = new Map();

async function form(path, params) {
  const res = await request(HOST + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch (e) { /* не JSON */ }
  return { ok: res.ok, status: res.status, body, text };
}

async function issueToken(cred) {
  const params = { client_id: cred.client_id, client_secret: cred.client_secret, permanent: 'true' };
  if (cred.agency_client_name) Object.assign(params, { grant_type: 'agency_client_credentials', agency_client_name: cred.agency_client_name });
  else params.grant_type = 'client_credentials';
  let r = await form('/api/v2/oauth2/token.json', params);
  const limitHit = !r.ok && /limit|лимит|too many/i.test(r.text);
  if (limitHit) {
    // удаляем все токены этой пары и пробуем снова
    const del = { client_id: cred.client_id, client_secret: cred.client_secret };
    if (cred.agency_client_name) del.username = cred.agency_client_name;
    await form('/api/v2/oauth2/token/delete.json', del);
    r = await form('/api/v2/oauth2/token.json', params);
  }
  if (!r.ok || !r.body || !r.body.access_token) {
    const msg = (r.body && (r.body.error_description || r.body.error)) || r.text.slice(0, 200);
    throw new Error(`VK Реклама: не удалось получить токен (HTTP ${r.status}): ${msg}`);
  }
  return r.body.access_token;
}

async function accessToken(cred, { fresh = false } = {}) {
  if (cred.client_id && cred.client_secret) {
    const key = `${cred.client_id}|${cred.agency_client_name || ''}`;
    if (!fresh && tokenCache.has(key)) return tokenCache.get(key);
    const t = await issueToken(cred);
    tokenCache.set(key, t);
    return t;
  }
  if (cred.token) return cred.token;
  throw new Error('VK Реклама: укажите Client ID + Client secret или готовый access token');
}

async function get(cred, path, params = {}) {
  const url = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  try {
    return await json(url.toString(), { headers: { Authorization: `Bearer ${await accessToken(cred)}` } });
  } catch (err) {
    // токен отозван/протух — один раз перевыпускаем
    if (err.status === 401 && cred.client_id && cred.client_secret) {
      return json(url.toString(), { headers: { Authorization: `Bearer ${await accessToken(cred, { fresh: true })}` } });
    }
    throw err;
  }
}

async function campaigns(cred) {
  const out = [];
  for (let offset = 0; offset < 10000; offset += 250) {
    const r = await get(cred, '/ad_plans.json', { fields: 'id,name', limit: 250, offset });
    out.push(...(r.items || []));
    if (!r.items || r.items.length < 250) break;
  }
  return out;
}

async function fetchStats(cred, settings, dateFrom, dateTo) {
  const list = await campaigns(cred);
  const names = Object.fromEntries(list.map((c) => [String(c.id), c.name]));
  const rows = [];
  for (let i = 0; i < list.length; i += 100) {
    const ids = list.slice(i, i + 100).map((c) => c.id).join(',');
    const r = await get(cred, '/statistics/ad_plans/day.json', { id: ids, date_from: dateFrom, date_to: dateTo, metrics: 'base' });
    for (const item of r.items || []) {
      for (const d of item.rows || []) {
        const b = d.base || {};
        if (!+b.shows && !+b.clicks && !+b.spent) continue;
        rows.push({
          date: d.date,
          campaign_id: String(item.id),
          campaign_name: names[String(item.id)] || `Кампания ${item.id}`,
          impressions: +b.shows || 0,
          clicks: +b.clicks || 0,
          spend: +b.spent || 0,
          leads: +b.goals || 0,
          revenue: 0,
        });
      }
    }
  }
  return rows;
}

async function test(cred) {
  const r = await get(cred, '/user.json');
  return `Аккаунт: ${r.username || r.id}`;
}

module.exports = { platform: 'vk_ads', fields, settingsFields, fetchStats, test };
