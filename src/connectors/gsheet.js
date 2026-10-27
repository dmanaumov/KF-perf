// Google-таблица как источник данных проекта: таблица с лидами и/или таблица
// с расходами. Читаем без ключей — через экспорт в CSV, поэтому таблица должна
// быть открыта «Всем, у кого есть ссылка → Читатель» (или опубликована в вебе).
//
// Колонки узнаём по заголовкам (регистр и порядок не важны, лишние колонки
// игнорируются):
//   дата       — обязательна (дата / день / дата заявки / created …)
//   канал      — источник / площадка / utm_source: «Директ», «VK», «Авито» … → площадка портала
//   кампания   — кампания / utm_campaign / объявление
//   расход     — расход / затраты / spend / cost
//   лиды       — лиды / заявки / количество; в таблице лидов без этой колонки 1 строка = 1 лид
//   выручка, показы, клики — по желанию
//   статус     — строки «спам», «дубль», «тест», «нецелевой» не считаются лидами
// Таблица перечитывается целиком при каждом обновлении (строки, удалённые из
// таблицы, исчезают и из портала).
const { request } = require('../http');

const fields = [];
const settingsFields = [
  { key: 'url', label: 'Ссылка на Google-таблицу' },
  { key: 'role', label: 'Что в таблице: leads | spend' },
  { key: 'default_platform', label: 'Канал по умолчанию' },
];

// ---------- ссылка → CSV ----------
function csvUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) throw new Error('Не указана ссылка на таблицу');
  let u;
  try { u = new URL(s); } catch (e) { throw new Error('Это не похоже на ссылку'); }
  if (u.hostname !== 'docs.google.com') {
    if (/\.csv($|\?)/i.test(u.pathname + u.search)) return u.toString();
    throw new Error('Нужна ссылка на Google-таблицу (docs.google.com/spreadsheets/…)');
  }
  const gid = (u.hash.match(/gid=(\d+)/) || u.search.match(/gid=(\d+)/) || [])[1];
  const pub = u.pathname.match(/\/spreadsheets\/d\/e\/([^/]+)/);
  if (pub) return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv${gid ? `&gid=${gid}` : ''}`;
  const id = u.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (!id) throw new Error('Не нашёл ID таблицы в ссылке');
  return `https://docs.google.com/spreadsheets/d/${id[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
}

async function download(url) {
  const res = await request(csvUrl(url), { redirect: 'follow', headers: { Accept: 'text/csv,*/*' } });
  const text = await res.text();
  if (res.status === 401 || res.status === 403 || /^\s*<(!doctype|html)/i.test(text)) {
    throw new Error('Таблица закрыта: откройте доступ «Всем, у кого есть ссылка → Читатель» (Настройки доступа в Google Таблицах)');
  }
  if (res.status === 404) throw new Error('Таблица или лист не найдены — проверьте ссылку');
  if (!res.ok) throw new Error(`Google вернул HTTP ${res.status}`);
  return text;
}

// ---------- CSV (кавычки, переносы строк внутри ячеек) ----------
function parseCsvTable(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

function parseDate(v) {
  const s = String(v || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const mo = +m[2];
    const d = +m[1];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  m = /^(\d{1,2})\s+([а-яё]+)\.?\s+(\d{4})/i.exec(s);
  if (m) {
    const w = m[2].toLowerCase();
    const idx = MONTHS.findIndex((p, i) => (i === 4 ? /^ма[йя]/.test(w) : w.startsWith(p)));
    if (idx >= 0) return `${m[3]}-${String(idx + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function parseNumber(v) {
  let s = String(v || '').replace(/[\s ]/g, '').replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// ---------- заголовки ----------
const ALIASES = {
  date: ['дата', 'день', 'date', 'дата заявки', 'дата лида', 'дата создания', 'создано', 'создан', 'created', 'created_at', 'day'],
  channel: ['канал', 'источник', 'площадка', 'source', 'utm_source', 'канал привлечения', 'рекламный канал', 'откуда', 'channel', 'платформа'],
  campaign: ['кампания', 'campaign', 'utm_campaign', 'название кампании', 'рк', 'объявление'],
  spend: ['расход', 'расходы', 'затраты', 'spend', 'cost', 'потрачено', 'сумма расхода', 'расход руб', 'бюджет'],
  leads: ['лиды', 'лидов', 'заявки', 'заявок', 'leads', 'кол-во лидов', 'количество лидов', 'количество', 'конверсии', 'обращения'],
  impressions: ['показы', 'impressions', 'просмотры', 'охват'],
  clicks: ['клики', 'clicks', 'переходы'],
  revenue: ['выручка', 'доход', 'revenue', 'сумма сделки', 'сумма продажи', 'сумма'],
  status: ['статус', 'status', 'качество', 'квалификация', 'стадия'],
};
const norm = (h) => String(h || '').toLowerCase().replace(/ё/g, 'е').replace(/[,()₽*:]/g, ' ').replace(/\s+/g, ' ').trim();

function mapHeader(head) {
  const h = head.map(norm);
  const col = {};
  const used = new Set();
  const pass = (test) => {
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (col[field] !== undefined) continue;
      const i = h.findIndex((x, idx) => !used.has(idx) && x && aliases.some((a) => test(x, a)));
      if (i >= 0) { col[field] = i; used.add(i); }
    }
  };
  pass((x, a) => x === a);
  pass((x, a) => x.startsWith(a + ' ') || x.startsWith(a));
  pass((x, a) => a.length >= 4 && x.includes(a));
  return col;
}

// ---------- канал → площадка портала ----------
const CHANNEL_RULES = [
  ['yandex_maps', /карт|яндекс\s*бизнес|yandex\s*(maps|business)|геосервис/],
  ['yandex_direct', /директ|direct|рся|яндекс|yandex|ya\.ru/],
  ['google_ads', /google|гугл|adwords|g-ads/],
  ['vk_ads', /вконтакте|vkontakte|mytarget|май\s*таргет|(^|[^a-zа-я])(vk|вк)([^a-zа-я]|$)/],
  ['meta', /instagram|инстаграм|инста|insta|facebook|фейсбук|(^|[^a-zа-я])(meta|fb|ig)([^a-zа-я]|$)/],
  ['telegram_ads', /telegram|телеграм|(^|[^a-zа-я])(tg|тг)([^a-zа-я]|$)/],
  ['avito', /авито|avito/],
  ['twogis', /2\s*гис|2\s*gis|дубль\s*гис/],
  ['ozon', /ozon|озон/],
  ['wb', /wildberries|вайлдберриз|(^|[^a-zа-я])(wb|вб)([^a-zа-я]|$)/],
];
function channelToPlatform(text) {
  const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
  if (!t) return null;
  const hit = CHANNEL_RULES.find(([, re]) => re.test(t));
  return hit ? hit[0] : null;
}

const JUNK = /спам|spam|дубл|duplicate|тест|test|нецелев|не\s*целев|мусор|ошибк/i;

// Разбор таблицы → строки stats_daily (с полем platform у каждой строки)
function toRows(text, settings = {}) {
  const role = settings.role === 'spend' ? 'spend' : 'leads';
  const fallback = settings.default_platform || 'other';
  const table = parseCsvTable(text);
  if (!table.length) throw new Error('Таблица пустая');
  // заголовок — первая из первых 10 строк, где нашлась колонка с датой
  let headIdx = -1;
  let col = null;
  for (let i = 0; i < Math.min(10, table.length); i++) {
    const c = mapHeader(table[i]);
    if (c.date !== undefined) { headIdx = i; col = c; break; }
  }
  if (headIdx < 0) throw new Error('Не нашёл колонку с датой. Назовите её «Дата» в первой строке листа');
  if (role === 'spend' && col.spend === undefined) throw new Error('В таблице расходов нет колонки «Расход» (или «Затраты»)');

  const merged = new Map();
  const stat = { read: 0, used: 0, badDate: 0, junk: 0, unknownChannels: new Set() };
  for (const r of table.slice(headIdx + 1)) {
    stat.read++;
    const date = parseDate(r[col.date]);
    if (!date) { stat.badDate++; continue; }
    if (col.status !== undefined && JUNK.test(r[col.status] || '')) { stat.junk++; continue; }
    const chText = col.channel !== undefined ? r[col.channel] : '';
    const mapped = channelToPlatform(chText);
    if (chText && !mapped) stat.unknownChannels.add(chText);
    const platform = mapped || fallback;
    const campaign = (col.campaign !== undefined && r[col.campaign]) || (!mapped && chText) || '';
    // Роль решает, какие цифры берём: таблица лидов → лиды и выручка, таблица
    // расходов → расход, показы, клики. Поэтому одну и ту же таблицу можно
    // указать в обеих ролях — ничего не задвоится.
    const num = (f) => (col[f] !== undefined ? parseNumber(r[col[f]]) : 0);
    const isLeads = role === 'leads';
    const row = {
      date, platform,
      campaign_id: campaign.toLowerCase().slice(0, 200),
      campaign_name: campaign || chText || null,
      impressions: isLeads ? 0 : num('impressions'),
      clicks: isLeads ? 0 : num('clicks'),
      spend: isLeads ? 0 : num('spend'),
      leads: isLeads ? (col.leads !== undefined ? num('leads') : 1) : 0,
      revenue: isLeads ? num('revenue') : 0,
    };
    const k = `${date}|${platform}|${row.campaign_id}`;
    const prev = merged.get(k);
    if (prev) ['impressions', 'clicks', 'spend', 'leads', 'revenue'].forEach((f) => { prev[f] += row[f]; });
    else merged.set(k, row);
    stat.used++;
  }
  const rows = [...merged.values()].map((x) => ({ ...x, campaign_id: `${x.platform}|${x.campaign_id}` }));
  rows.meta = { ...stat, unknownChannels: [...stat.unknownChannels].slice(0, 10), columns: Object.keys(col) };
  return rows;
}

async function fetchStats(cred, settings) {
  return toRows(await download(settings.url), settings);
}

async function test(cred, settings) {
  const rows = await fetchStats(cred, settings);
  const m = rows.meta;
  const sum = (f) => Math.round(rows.reduce((s, r) => s + r[f], 0));
  const parts = [`строк ${m.used} из ${m.read}`, `колонки: ${m.columns.join(', ')}`];
  if (settings.role === 'spend') parts.push(`расход ${sum('spend').toLocaleString('ru')} ₽`);
  else parts.push(`лидов ${sum('leads')}`);
  if (m.badDate) parts.push(`без даты: ${m.badDate}`);
  if (m.junk) parts.push(`спам/дубли: ${m.junk}`);
  if (m.unknownChannels.length) parts.push(`каналы без сопоставления → «по умолчанию»: ${m.unknownChannels.join(', ')}`);
  return parts.join(' · ');
}

module.exports = {
  platform: 'gsheet', fields, settingsFields, fetchStats, test,
  noCreds: true, replace: true, csvUrl, toRows, channelToPlatform, parseDate,
};
