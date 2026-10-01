// Google Ads API (REST, googleAds:searchStream). Developer token и OAuth-клиент —
// глобально в env, refresh token и customer id — на подключение.
const config = require('../config');
const { json } = require('../http');

const fields = [
  { key: 'refresh_token', label: 'OAuth refresh token', secret: true, required: true },
  { key: 'customer_id', label: 'Customer ID (xxx-xxx-xxxx)', required: true },
  { key: 'login_customer_id', label: 'Login customer ID (MCC), если через управляющий аккаунт' },
];
const settingsFields = [];

async function accessToken(cred) {
  const g = config.googleAds;
  if (!g.developerToken || !g.clientId || !g.clientSecret) throw new Error('Google Ads: задайте GOOGLE_ADS_DEVELOPER_TOKEN / CLIENT_ID / CLIENT_SECRET в env');
  const body = new URLSearchParams({ client_id: g.clientId, client_secret: g.clientSecret, refresh_token: cred.refresh_token, grant_type: 'refresh_token' });
  const r = await json('https://oauth2.googleapis.com/token', { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  return r.access_token;
}

const digits = (s) => String(s || '').replace(/\D/g, '');

async function gaql(cred, query) {
  const token = await accessToken(cred);
  const headers = { Authorization: `Bearer ${token}`, 'developer-token': config.googleAds.developerToken, 'Content-Type': 'application/json' };
  if (cred.login_customer_id) headers['login-customer-id'] = digits(cred.login_customer_id);
  const url = `https://googleads.googleapis.com/${config.googleAds.apiVersion}/customers/${digits(cred.customer_id)}/googleAds:searchStream`;
  const chunks = await json(url, { method: 'POST', headers, body: JSON.stringify({ query }) });
  return (chunks || []).flatMap((c) => c.results || []);
}

async function fetchStats(cred, settings, dateFrom, dateTo) {
  const rows = await gaql(cred, `SELECT segments.date, campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'`);
  return rows.map((r) => ({
    date: r.segments.date,
    campaign_id: String(r.campaign.id),
    campaign_name: r.campaign.name,
    impressions: +r.metrics.impressions || 0,
    clicks: +r.metrics.clicks || 0,
    spend: (+r.metrics.costMicros || 0) / 1e6,
    leads: +r.metrics.conversions || 0,
    revenue: +r.metrics.conversionsValue || 0,
  }));
}

async function test(cred) {
  const rows = await gaql(cred, 'SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1');
  const c = rows[0] && rows[0].customer;
  return c ? `Аккаунт: ${c.descriptiveName} (${c.currencyCode})` : 'Доступ есть';
}

module.exports = { platform: 'google_ads', fields, settingsFields, fetchStats, test };
