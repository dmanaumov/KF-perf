// Meta Marketing API (Instagram / Facebook Ads) — Insights по кампаниям по дням.
const config = require('../config');
const { json } = require('../http');

const fields = [
  { key: 'token', label: 'Access token (System User)', secret: true, required: true },
  { key: 'ad_account_id', label: 'ID рекламного аккаунта (act_… или цифры)', required: true },
];
const settingsFields = [
  { key: 'lead_actions', label: 'Типы действий = лиды (через запятую)', placeholder: 'lead,onsite_conversion.lead_grouped,offsite_conversion.fb_pixel_lead,onsite_conversion.messaging_conversation_started_7d' },
];
const DEFAULT_LEADS = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'onsite_conversion.messaging_conversation_started_7d'];

const act = (id) => (String(id).startsWith('act_') ? id : `act_${String(id).replace(/\D/g, '')}`);

async function fetchStats(cred, settings, dateFrom, dateTo) {
  const leadTypes = String(settings.lead_actions || '').split(',').map((s) => s.trim()).filter(Boolean);
  const types = leadTypes.length ? leadTypes : DEFAULT_LEADS;
  const url = new URL(`https://graph.facebook.com/${config.metaApiVersion}/${act(cred.ad_account_id)}/insights`);
  url.searchParams.set('level', 'campaign');
  url.searchParams.set('time_increment', '1');
  url.searchParams.set('limit', '500');
  url.searchParams.set('fields', 'campaign_id,campaign_name,impressions,clicks,spend,actions,action_values');
  url.searchParams.set('time_range', JSON.stringify({ since: dateFrom, until: dateTo }));
  url.searchParams.set('access_token', cred.token);
  const rows = [];
  let next = url.toString();
  while (next) {
    const r = await json(next);
    for (const d of r.data || []) {
      const sum = (arr) => (arr || []).filter((a) => types.includes(a.action_type)).reduce((s, a) => s + (+a.value || 0), 0);
      rows.push({
        date: d.date_start,
        campaign_id: d.campaign_id,
        campaign_name: d.campaign_name,
        impressions: +d.impressions || 0,
        clicks: +d.clicks || 0,
        spend: +d.spend || 0,
        leads: sum(d.actions),
        revenue: sum(d.action_values),
      });
    }
    next = r.paging && r.paging.next;
  }
  return rows;
}

async function test(cred) {
  const r = await json(`https://graph.facebook.com/${config.metaApiVersion}/${act(cred.ad_account_id)}?fields=name,currency&access_token=${encodeURIComponent(cred.token)}`);
  return `Аккаунт: ${r.name} (${r.currency})`;
}

module.exports = { platform: 'meta', fields, settingsFields, fetchStats, test };
