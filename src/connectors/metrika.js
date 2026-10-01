// Яндекс Метрика — Stat API. Пишем в stats_daily «кампании» вида:
//   src:<источник>  — визиты/цели по источникам трафика (organic, ad, direct…)
//   ai:<домен>      — переходы из AI-сервисов (для GEO)
// clicks = визиты, leads = достижения целей (если указаны goal_ids).
const { json } = require('../http');
const { AI_REFERRERS } = require('../platforms');

const fields = [
  { key: 'token', label: 'OAuth-токен (metrika:read)', secret: true, required: true },
  { key: 'counter_id', label: 'Номер счётчика', required: true },
];
const settingsFields = [
  { key: 'goal_ids', label: 'ID целей (лиды), через запятую' },
];

const SOURCE_LABELS = {
  organic: 'Поисковые системы', ad: 'Реклама', direct: 'Прямые заходы', internal: 'Внутренние',
  referral: 'Ссылки на сайтах', social: 'Соцсети', email: 'Email', messenger: 'Мессенджеры',
  recommend: 'Рекомендательные системы', saved: 'Сохранённые страницы', undefined: 'Не определено',
};

async function stat(cred, params) {
  const url = new URL('https://api-metrika.yandex.net/stat/v1/data');
  Object.entries({ ids: cred.counter_id, accuracy: 'full', limit: 10000, ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
  return json(url.toString(), { headers: { Authorization: `OAuth ${cred.token}` } });
}

function metricsList(goals) {
  return ['ym:s:visits', ...goals.map((g) => `ym:s:goal${g}reaches`), ...goals.map((g) => `ym:s:goal${g}revenue`)].join(',');
}

async function fetchStats(cred, settings, dateFrom, dateTo) {
  const goals = String(settings.goal_ids || '').split(',').map((s) => s.trim()).filter(Boolean);
  const metrics = metricsList(goals);
  const pick = (m) => ({
    clicks: m[0] || 0,
    leads: goals.reduce((s, _, i) => s + (m[1 + i] || 0), 0),
    revenue: goals.reduce((s, _, i) => s + (m[1 + goals.length + i] || 0), 0),
  });
  const rows = [];

  const bySource = await stat(cred, { date1: dateFrom, date2: dateTo, dimensions: 'ym:s:date,ym:s:lastsignTrafficSource', metrics });
  for (const r of bySource.data || []) {
    const src = r.dimensions[1].id || 'undefined';
    rows.push({ date: r.dimensions[0].name, campaign_id: `src:${src}`, campaign_name: SOURCE_LABELS[src] || r.dimensions[1].name || src, impressions: 0, spend: 0, ...pick(r.metrics) });
  }

  const byRef = await stat(cred, {
    date1: dateFrom, date2: dateTo,
    dimensions: 'ym:s:date,ym:s:lastsignReferalSource',
    filters: "ym:s:lastsignTrafficSource=='referral'",
    metrics,
  });
  const agg = new Map();
  for (const r of byRef.data || []) {
    const host = String(r.dimensions[1].name || '').replace(/^www\./, '');
    const label = AI_REFERRERS[host] || AI_REFERRERS['www.' + host];
    if (!label) continue;
    const key = `${r.dimensions[0].name}|${label}`;
    const v = pick(r.metrics);
    const prev = agg.get(key) || { date: r.dimensions[0].name, campaign_id: `ai:${label}`, campaign_name: label, impressions: 0, spend: 0, clicks: 0, leads: 0, revenue: 0 };
    prev.clicks += v.clicks; prev.leads += v.leads; prev.revenue += v.revenue;
    agg.set(key, prev);
  }
  rows.push(...agg.values());
  return rows;
}

async function test(cred) {
  const r = await json(`https://api-metrika.yandex.net/management/v1/counter/${encodeURIComponent(cred.counter_id)}`, { headers: { Authorization: `OAuth ${cred.token}` } });
  return `Счётчик: ${r.counter.name || r.counter.site}`;
}

module.exports = { platform: 'metrika', fields, settingsFields, fetchStats, test };
