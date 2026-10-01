const config = require('./config');
const db = require('./db');
const secrets = require('./secrets');
const connectors = require('./connectors');
const { today, addDays } = require('./dates');

async function upsertRows(integration, rows) {
  if (!rows.length) return 0;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(
        `INSERT INTO stats_daily (integration_id, project_id, platform, date, campaign_id, campaign_name, impressions, clicks, spend, leads, revenue)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (integration_id, date, campaign_id) DO UPDATE SET
           campaign_name=EXCLUDED.campaign_name, impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks,
           spend=EXCLUDED.spend, leads=EXCLUDED.leads, revenue=EXCLUDED.revenue`,
        [integration.id, integration.project_id, integration.platform, r.date, String(r.campaign_id || ''), r.campaign_name || null,
          Math.round(r.impressions || 0), Math.round(r.clicks || 0), r.spend || 0, r.leads || 0, r.revenue || 0]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return rows.length;
}

const running = new Set();

async function syncIntegration(id, { dateFrom, dateTo } = {}) {
  if (running.has(id)) throw new Error('Синхронизация уже идёт');
  const integ = await db.one('SELECT * FROM integrations WHERE id=$1', [id]);
  if (!integ) throw new Error('Подключение не найдено');
  const conn = connectors.get(integ.platform);
  if (!conn) throw new Error('Для этой площадки нет API-коннектора — используйте ручной ввод или CSV');
  running.add(id);
  const run = await db.one("INSERT INTO sync_runs (kind, integration_id, project_id) VALUES ('ads',$1,$2) RETURNING id", [id, integ.project_id]);
  try {
    const to = dateTo || addDays(today(), 0);
    const from = dateFrom || addDays(to, -(integ.last_sync_at ? config.syncLookbackDays : config.syncInitialDays));
    const rows = await conn.fetchStats(secrets.decrypt(integ.credentials_enc), integ.settings || {}, from, to);
    const n = await upsertRows(integ, rows);
    await db.q("UPDATE integrations SET status='ok', last_sync_at=now(), last_error=NULL WHERE id=$1", [id]);
    await db.q("UPDATE sync_runs SET status='ok', finished_at=now(), rows=$2 WHERE id=$1", [run.id, n]);
    return { rows: n, from, to };
  } catch (err) {
    await db.q("UPDATE integrations SET status='error', last_error=$2 WHERE id=$1", [id, err.message.slice(0, 1000)]);
    await db.q("UPDATE sync_runs SET status='error', finished_at=now(), error=$2 WHERE id=$1", [run.id, err.message.slice(0, 1000)]);
    throw err;
  } finally {
    running.delete(id);
  }
}

async function syncDue() {
  const due = await db.all(
    `SELECT i.id FROM integrations i JOIN projects p ON p.id=i.project_id
     WHERE i.enabled AND p.status <> 'archived' AND i.credentials_enc IS NOT NULL
       AND i.platform = ANY($1)
       AND (i.last_sync_at IS NULL OR i.last_sync_at < now() - ($2 || ' hours')::interval)`,
    [['yandex_direct', 'metrika', 'google_ads', 'vk_ads', 'meta'], String(config.syncIntervalHours)]
  );
  const results = [];
  for (const { id } of due) {
    try {
      results.push({ id, ok: true, ...(await syncIntegration(id)) });
    } catch (err) {
      results.push({ id, ok: false, error: err.message });
    }
  }
  return results;
}

// --- CSV-импорт для площадок без API (Telegram Ads, Авито, 2ГИС, маркетплейсы…) ---
// Колонки (заголовок обязателен, порядок любой, разделитель ; или , или таб):
// date, campaign, impressions, clicks, spend, leads, revenue
const HEADER_ALIASES = {
  date: ['date', 'дата', 'день'],
  campaign: ['campaign', 'кампания', 'campaign_name', 'название'],
  impressions: ['impressions', 'показы', 'shows', 'views', 'просмотры'],
  clicks: ['clicks', 'клики', 'переходы'],
  spend: ['spend', 'cost', 'расход', 'затраты', 'потрачено', 'бюджет'],
  leads: ['leads', 'лиды', 'conversions', 'конверсии', 'заявки', 'обращения', 'контакты'],
  revenue: ['revenue', 'выручка', 'доход'],
};

function parseNumber(s) {
  const n = parseFloat(String(s || '').replace(/\s| /g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
function parseDate(s) {
  s = String(s || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/.exec(s);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
function splitLine(line, sep) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
    } else if (ch === sep && !quoted) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsv(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('CSV пуст: нужна строка заголовков и хотя бы одна строка данных');
  const sep = ['\t', ';', ','].map((s) => [s, lines[0].split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const head = splitLine(lines[0], sep).map((h) => h.toLowerCase());
  const col = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) col[key] = head.findIndex((h) => aliases.includes(h));
  if (col.date < 0) throw new Error('В CSV нет колонки date / дата');
  const rows = [];
  const errors = [];
  lines.slice(1).forEach((line, i) => {
    const c = splitLine(line, sep);
    const date = parseDate(c[col.date]);
    if (!date) { errors.push(`строка ${i + 2}: не распознана дата «${c[col.date]}»`); return; }
    const name = col.campaign >= 0 ? c[col.campaign] : '';
    rows.push({
      date,
      campaign_id: name ? name.toLowerCase().slice(0, 200) : '',
      campaign_name: name || null,
      impressions: col.impressions >= 0 ? parseNumber(c[col.impressions]) : 0,
      clicks: col.clicks >= 0 ? parseNumber(c[col.clicks]) : 0,
      spend: col.spend >= 0 ? parseNumber(c[col.spend]) : 0,
      leads: col.leads >= 0 ? parseNumber(c[col.leads]) : 0,
      revenue: col.revenue >= 0 ? parseNumber(c[col.revenue]) : 0,
    });
  });
  // одинаковые (дата, кампания) в файле — суммируем
  const merged = new Map();
  for (const r of rows) {
    const k = `${r.date}|${r.campaign_id}`;
    const p = merged.get(k);
    if (!p) merged.set(k, { ...r });
    else ['impressions', 'clicks', 'spend', 'leads', 'revenue'].forEach((f) => { p[f] += r[f]; });
  }
  return { rows: [...merged.values()], errors };
}

async function importRows(integrationId, rows, source = 'manual') {
  const integ = await db.one('SELECT * FROM integrations WHERE id=$1', [integrationId]);
  if (!integ) throw new Error('Подключение не найдено');
  const n = await upsertRows(integ, rows);
  await db.q("UPDATE integrations SET status=CASE WHEN status='error' THEN status ELSE 'manual' END, last_sync_at=now() WHERE id=$1 AND credentials_enc IS NULL", [integrationId]);
  await db.q("INSERT INTO sync_runs (kind, integration_id, project_id, status, finished_at, rows, error) VALUES ('ads',$1,$2,'ok',now(),$3,$4)", [integrationId, integ.project_id, n, source]);
  return n;
}

module.exports = { syncIntegration, syncDue, parseCsv, importRows, upsertRows };
