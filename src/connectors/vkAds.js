// VK Реклама (ads.vk.com) — API v2. Токен клиента/агентства (Bearer).
const { json } = require('../http');

const fields = [{ key: 'token', label: 'Access token VK Рекламы', secret: true, required: true }];
const settingsFields = [];
const BASE = 'https://ads.vk.com/api/v2';

async function get(cred, path, params = {}) {
  const url = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return json(url.toString(), { headers: { Authorization: `Bearer ${cred.token}` } });
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
