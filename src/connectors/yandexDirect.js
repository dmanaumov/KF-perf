// Яндекс Директ — Reports API v5 (CAMPAIGN_PERFORMANCE_REPORT, TSV).
// Доступ: OAuth-токен приложения с правом direct:api. Для агентского
// аккаунта — Client-Login клиента.
const { request, sleep } = require('../http');

const fields = [
  { key: 'token', label: 'OAuth-токен', secret: true, required: true },
  { key: 'client_login', label: 'Client-Login (для агентского аккаунта)' },
];
const settingsFields = [
  { key: 'goal_ids', label: 'ID целей Метрики для лидов (через запятую; пусто — приоритетные цели кампаний)' },
  { key: 'sandbox', label: 'Песочница API (true/false)' },
];

function num(v) {
  if (v === undefined || v === null || v === '--' || v === '') return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

async function report(cred, settings, dateFrom, dateTo) {
  const host = String(settings.sandbox) === 'true' ? 'api-sandbox.direct.yandex.com' : 'api.direct.yandex.com';
  const goals = String(settings.goal_ids || '').split(',').map((s) => s.trim()).filter(Boolean);
  const params = {
    SelectionCriteria: { DateFrom: dateFrom, DateTo: dateTo },
    FieldNames: ['Date', 'CampaignId', 'CampaignName', 'Impressions', 'Clicks', 'Cost', 'Conversions', 'Revenue'],
    ReportName: `kf-perf ${dateFrom} ${dateTo} ${Date.now()}`,
    ReportType: 'CAMPAIGN_PERFORMANCE_REPORT',
    DateRangeType: 'CUSTOM_DATE',
    Format: 'TSV',
    IncludeVAT: 'YES',
    IncludeDiscount: 'NO',
  };
  if (goals.length) {
    params.Goals = goals;
    params.AttributionModels = ['AUTO'];
  }
  const headers = {
    Authorization: `Bearer ${cred.token}`,
    'Accept-Language': 'ru',
    'Content-Type': 'application/json; charset=utf-8',
    processingMode: 'auto',
    returnMoneyInMicros: 'false',
    skipReportHeader: 'true',
    skipReportSummary: 'true',
  };
  if (cred.client_login) headers['Client-Login'] = cred.client_login;

  for (let attempt = 0; attempt < 40; attempt++) {
    const res = await request(`https://${host}/json/v5/reports`, { method: 'POST', headers, body: JSON.stringify({ params }) });
    const text = await res.text();
    if (res.status === 200) return text;
    if (res.status === 201 || res.status === 202) {
      const wait = Math.min(parseInt(res.headers.get('retryIn') || '5', 10), 30);
      await sleep(wait * 1000);
      continue;
    }
    let msg = text.slice(0, 300);
    try {
      const e = JSON.parse(text).error;
      msg = `${e.error_string}: ${e.error_detail}`;
    } catch (e) { /* TSV/текст */ }
    throw new Error(`Директ HTTP ${res.status}: ${msg}`);
  }
  throw new Error('Директ: отчёт не сформировался за отведённое время');
}

function parseTsv(text) {
  const lines = text.split('\n').filter((l) => l.trim());
  if (!lines.length) return [];
  const head = lines[0].split('\t');
  const idx = (name) => head.indexOf(name);
  const convCols = head.map((h, i) => (h === 'Conversions' || h.startsWith('Conversions_') ? i : -1)).filter((i) => i >= 0);
  const revCols = head.map((h, i) => (h === 'Revenue' || h.startsWith('Revenue_') ? i : -1)).filter((i) => i >= 0);
  return lines.slice(1).map((line) => {
    const c = line.split('\t');
    return {
      date: c[idx('Date')],
      campaign_id: c[idx('CampaignId')],
      campaign_name: c[idx('CampaignName')],
      impressions: num(c[idx('Impressions')]),
      clicks: num(c[idx('Clicks')]),
      spend: num(c[idx('Cost')]),
      leads: convCols.reduce((s, i) => s + num(c[i]), 0),
      revenue: revCols.reduce((s, i) => s + num(c[i]), 0),
    };
  });
}

async function fetchStats(cred, settings, dateFrom, dateTo) {
  return parseTsv(await report(cred, settings, dateFrom, dateTo));
}

async function test(cred, settings) {
  const { today, addDays } = require('../dates');
  const rows = await fetchStats(cred, settings, addDays(today(), -3), addDays(today(), -1));
  return `Доступ есть, строк за 3 дня: ${rows.length}`;
}

module.exports = { platform: 'yandex_direct', fields, settingsFields, fetchStats, test, parseTsv };
