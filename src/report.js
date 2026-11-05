// PDF-отчёт по проекту: «Отчёт об эффективности лидогенерации».
// Формулировки намеренно нейтральные: никакой «рекламы», «рекламных кампаний»,
// «Instagram/Meta», «объявлений» — только формы лидогенерации, затраты и заявки
// (размещение рекламы в Meta официально не ведём).
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('./db');
const metrics = require('./metrics');
const { addDays } = require('./dates');

const FONT_DIR = path.dirname(require.resolve('@expo-google-fonts/manrope/package.json'));
const FONTS = {
  R: path.join(FONT_DIR, '400Regular/Manrope_400Regular.ttf'),
  M: path.join(FONT_DIR, '600SemiBold/Manrope_600SemiBold.ttf'),
  B: path.join(FONT_DIR, '800ExtraBold/Manrope_800ExtraBold.ttf'),
};

const C = {
  green: '#004643', deep: '#003940', coral: '#ff5f60', ink: '#0f2624', ink2: '#4b5f5c', ink3: '#7f918e',
  line: '#e2e8e6', soft: '#f3f6f5', bar: '#0b6b66', bar2: '#ff5f60', good: '#1a8f4c', bad: '#d93f40',
};

// Нейтральные названия источников для отчёта
const SOURCE_LABEL = {
  meta: 'Формы лидогенерации', yandex_direct: 'Яндекс', google_ads: 'Google', vk_ads: 'VK', telegram_ads: 'Telegram',
  avito: 'Авито', twogis: '2ГИС', yandex_maps: 'Яндекс Бизнес', ozon: 'Ozon', wb: 'Wildberries', other: 'Прочие источники',
};
// ₸ нет в шрифте — пишем «тг»
const SYM = { RUB: '₽', USD: '$', EUR: '€', KZT: 'тг' };

const NB = ' ';
function fmtMoney(v, cur) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  const s = SYM[cur] || '₽';
  const a = Math.abs(v);
  const cents = (s === '$' || s === '€') && a < 1000 ? 2 : 0;
  return v.toLocaleString('ru-RU', { maximumFractionDigits: cents, minimumFractionDigits: cents }).replace(/\s/g, NB) + NB + s;
}
const fmtInt = (v) => (v === null || v === undefined || !isFinite(v) ? '—' : Math.round(v).toLocaleString('ru-RU').replace(/\s/g, NB));
const fmtPct = (v, d = 1) => (v === null || v === undefined || !isFinite(v) ? '—' : v.toLocaleString('ru-RU', { maximumFractionDigits: d }) + '%');
const fmtDate = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}.${m}.${y}`; };
const div = (a, b) => (b ? a / b : null);

function delta(cur, prev, goodUp = true) {
  if (!prev || cur === null || cur === undefined || !isFinite(cur) || !isFinite(prev)) return null;
  const d = (cur / prev - 1) * 100;
  if (Math.abs(d) < 0.5) return { text: '≈ без изменений', color: C.ink3 };
  const better = goodUp ? d > 0 : d < 0;
  return { text: `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(0)}% к прошлому периоду`, color: better ? C.good : C.bad };
}

async function vatNote(projectId) {
  const rows = await db.all(
    `SELECT settings FROM integrations WHERE project_id=$1 AND enabled AND (
       (platform='gsheet' AND settings->>'role'='spend') OR platform='meta')`, [projectId]);
  const v = rows.map((r) => parseFloat(String((r.settings || {}).vat || '').replace(',', '.'))).filter((x) => x > 0);
  return v.length ? `Затраты указаны с НДС ${[...new Set(v)].join(' / ')}%.` : '';
}

async function build(project, { from, to, ad = '' }) {
  const cur = project.currency || 'RUB';
  const s = await metrics.projectSummary(project.id, from, to, { ad });
  const note = await vatNote(project.id);
  const t = s.totals;
  const pv = s.prev;

  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: `Отчёт об эффективности лидогенерации — ${project.name}`, Author: 'КонтентФерма' } });
  Object.entries(FONTS).forEach(([k, f]) => doc.registerFont(k, f));
  const W = doc.page.width;
  const L = 40;
  const R = W - 40;
  const CW = R - L;
  const bottom = () => doc.page.height - 60;
  const ensure = (h) => { if (doc.y + h > bottom()) { doc.addPage(); doc.y = 40; } };

  // ---------- шапка ----------
  doc.rect(0, 0, W, 132).fill(C.green);
  doc.roundedRect(L, 30, 34, 34, 9).fill(C.coral);
  doc.font('B').fontSize(13).fillColor('#fff').text('КФ', L, 39, { width: 34, align: 'center' });
  doc.font('M').fontSize(10).fillColor('#ffffff').opacity(0.75).text('КонтентФерма', L + 44, 33).opacity(1);
  doc.font('B').fontSize(10).fillColor('#fff').text('Отчёт об эффективности лидогенерации', L + 44, 47);
  doc.font('B').fontSize(22).fillColor('#fff').text(project.name, L, 78, { width: CW });
  const sub = [`Период: ${fmtDate(from)} — ${fmtDate(to)}`, ad ? `Компания: ${ad}` : null, project.client_name && project.client_name !== project.name ? project.client_name : null].filter(Boolean).join('   ·   ');
  doc.font('R').fontSize(10).fillColor('#fff').opacity(0.85).text(sub, L, 106, { width: CW }).opacity(1);
  doc.y = 152;

  // ---------- ключевые показатели ----------
  const tiles = [
    ['Затраты на лидогенерацию', fmtMoney(t.spend, cur), delta(t.spend, pv.spend, null)],
    ['Заявки (лиды)', fmtInt(t.leads), delta(t.leads, pv.leads, true)],
    ['Стоимость заявки', fmtMoney(t.cpl, cur), delta(t.cpl, pv.cpl, false)],
    ['Конверсия переход → заявка', fmtPct(t.cr), delta(t.cr, pv.cr, true)],
    ['Показы формы', fmtInt(t.impressions), delta(t.impressions, pv.impressions, true)],
    ['Переходы в форму', fmtInt(t.clicks), delta(t.clicks, pv.clicks, true)],
    ['Конверсия показ → переход', fmtPct(t.ctr, 2), delta(t.ctr, pv.ctr, true)],
    ['Стоимость перехода', fmtMoney(t.cpc, cur), delta(t.cpc, pv.cpc, false)],
  ];
  const tw = (CW - 3 * 10) / 4;
  const th = 72;
  const y0 = doc.y;
  tiles.forEach(([label, value, d], i) => {
    const x = L + (i % 4) * (tw + 10);
    const y = y0 + Math.floor(i / 4) * (th + 10);
    doc.roundedRect(x, y, tw, th, 10).fillAndStroke(i < 4 ? '#ffffff' : C.soft, C.line);
    if (i < 4) doc.rect(x + 10, y, tw - 20, 2.5).fill(i === 2 ? C.coral : C.green);
    doc.font('M').fontSize(7.5).fillColor(C.ink2).text(label.toUpperCase(), x + 10, y + 10, { width: tw - 20, characterSpacing: 0.3 });
    doc.font('B').fontSize(i < 4 ? 17 : 14).fillColor(C.ink).text(value, x + 10, y + 32, { width: tw - 20, lineBreak: false });
    if (d && d.color !== undefined) {
      const col = d.text.startsWith('≈') || i === 0 ? C.ink3 : d.color;
      doc.font('R').fontSize(7).fillColor(col).text(d.text, x + 10, y + th - 16, { width: tw - 20, lineBreak: false });
    }
  });
  doc.y = y0 + 2 * th + 10 + 18;

  // ---------- динамика по дням ----------
  const chart = (x, y, w, h, data, color, title, fmt) => {
    doc.font('M').fontSize(8).fillColor(C.ink2).text(title.toUpperCase(), x, y, { characterSpacing: 0.3 });
    const top = y + 16;
    const ch = h - 30;
    const max = Math.max(...data.map((d) => d.v), 0) || 1;
    for (let i = 0; i <= 2; i++) {
      const gy = top + ch - (ch * i) / 2;
      doc.moveTo(x + 30, gy).lineTo(x + w, gy).lineWidth(0.5).strokeColor(C.line).stroke();
      doc.font('R').fontSize(6.5).fillColor(C.ink3).text(fmt((max * i) / 2), x - 4, gy - 4, { width: 32, align: 'right' });
    }
    const slot = (w - 34) / Math.max(1, data.length);
    const bw = Math.max(1.5, Math.min(14, slot - 1.5));
    data.forEach((d, i) => {
      const bh = (d.v / max) * ch;
      if (bh > 0) doc.rect(x + 34 + i * slot + (slot - bw) / 2, top + ch - bh, bw, bh).fill(color);
    });
    const step = Math.ceil(data.length / 6);
    data.forEach((d, i) => {
      if (i % step && i !== data.length - 1) return;
      doc.font('R').fontSize(6.5).fillColor(C.ink3).text(fmtDate(d.d).slice(0, 5), x + 34 + i * slot + slot / 2 - 15, top + ch + 4, { width: 30, align: 'center' });
    });
  };
  ensure(150);
  doc.font('B').fontSize(12).fillColor(C.ink).text('Динамика по дням', L, doc.y);
  const cy = doc.y + 8;
  const shortMoney = (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}к` : `${Math.round(v)}`);
  chart(L, cy, CW / 2 - 12, 120, s.daily.map((d) => ({ d: d.date, v: d.spend })), C.bar, `Затраты, ${SYM[cur] || '₽'}`, shortMoney);
  chart(L + CW / 2 + 12, cy, CW / 2 - 12, 120, s.daily.map((d) => ({ d: d.date, v: d.leads })), C.bar2, 'Заявки', (v) => `${Math.round(v * 10) / 10}`);
  doc.y = cy + 132;

  // ---------- таблицы ----------
  const table = (title, hint, cols, rows, opts = {}) => {
    if (!rows.length) return;
    ensure(80);
    doc.font('B').fontSize(12).fillColor(C.ink).text(title, L, doc.y + 6);
    if (hint) doc.font('R').fontSize(8).fillColor(C.ink3).text(hint, L, doc.y + 1);
    doc.y += 6;
    const widths = cols.map((c) => c.w * CW);
    const header = () => {
      const y = doc.y;
      doc.font('M').fontSize(6.8);
      const hh = Math.max(20, ...cols.map((c, i) => doc.heightOfString(c.t.toUpperCase(), { width: widths[i] - 12 }) + 12));
      doc.rect(L, y, CW, hh).fill(C.soft);
      let x = L;
      cols.forEach((c, i) => {
        doc.font('M').fontSize(6.8).fillColor(C.ink2).text(c.t.toUpperCase(), x + 6, y + 6, { width: widths[i] - 12, align: c.r ? 'right' : 'left' });
        x += widths[i];
      });
      doc.y = y + hh;
    };
    header();
    rows.forEach((row, ri) => {
      doc.font('R').fontSize(8.5);
      const h = Math.max(20, ...row.map((v, i) => (cols[i].r ? 0 : doc.heightOfString(String(v), { width: widths[i] - 12 }) + 10)));
      if (doc.y + h > bottom()) { doc.addPage(); doc.y = 40; header(); }
      const y = doc.y;
      const strong = opts.totalFirst && ri === 0;
      if (strong) doc.rect(L, y, CW, h).fill('#e9f1ef');
      let x = L;
      row.forEach((v, i) => {
        doc.font(strong || cols[i].b ? 'M' : 'R').fontSize(8.5).fillColor(C.ink)
          .text(String(v), x + 6, y + 6, { width: widths[i] - 12, align: cols[i].r ? 'right' : 'left' });
        x += widths[i];
      });
      doc.moveTo(L, y + h).lineTo(R, y + h).lineWidth(0.5).strokeColor(C.line).stroke();
      doc.y = y + h;
    });
    doc.y += 14;
  };

  const effCols = [
    { t: 'Компания', w: 0.27 }, { t: 'Затраты', w: 0.12, r: true }, { t: 'Показы', w: 0.11, r: true }, { t: 'Переходы', w: 0.1, r: true },
    { t: 'Заявки', w: 0.09, r: true, b: true }, { t: 'Стоим. заявки', w: 0.12, r: true, b: true }, { t: 'Конверсия в заявку', w: 0.11, r: true }, { t: 'Доля заявок', w: 0.08, r: true },
  ];
  if (s.byAd && s.byAd.length && !ad) {
    const sum = s.byAd.reduce((o, r) => { ['impressions', 'clicks', 'spend', 'leads'].forEach((k) => { o[k] += r[k]; }); return o; }, { impressions: 0, clicks: 0, spend: 0, leads: 0 });
    const line = (name, r) => [name, fmtMoney(r.spend, cur), fmtInt(r.impressions), fmtInt(r.clicks), fmtInt(r.leads), fmtMoney(div(r.spend, r.leads), cur), fmtPct(div(r.leads * 100, r.clicks)), fmtPct(div(r.leads * 100, sum.leads), 0)];
    table('Эффективность по компаниям', 'Сравнение форм лидогенерации по направлениям за период', effCols,
      [line('Все (суммарно)', sum), ...s.byAd.map((r) => line(r.ad_name || 'Без компании', r))], { totalFirst: true });
  }

  const flows = s.byCampaign.filter((c) => c.spend || c.leads);
  table('Эффективность по потокам заявок', 'Каждый поток — отдельная форма / сценарий сбора заявок', [
    { t: 'Поток', w: 0.34 }, { t: 'Компания', w: 0.18 }, { t: 'Затраты', w: 0.13, r: true }, { t: 'Переходы', w: 0.1, r: true },
    { t: 'Заявки', w: 0.1, r: true, b: true }, { t: 'Стоим. заявки', w: 0.15, r: true, b: true },
  ], flows.slice(0, 60).map((c) => [c.campaign_name || '—', c.ad_name || '—', fmtMoney(c.spend, cur), fmtInt(c.clicks), fmtInt(c.leads), fmtMoney(c.cpl, cur)]));

  if (s.byPlatform.length > 1) {
    table('Источники заявок', null, [
      { t: 'Источник', w: 0.34 }, { t: 'Затраты', w: 0.17, r: true }, { t: 'Переходы', w: 0.15, r: true }, { t: 'Заявки', w: 0.15, r: true, b: true }, { t: 'Стоим. заявки', w: 0.19, r: true, b: true },
    ], s.byPlatform.map((r) => [SOURCE_LABEL[r.platform] || 'Прочие источники', fmtMoney(r.spend, cur), fmtInt(r.clicks), fmtInt(r.leads), fmtMoney(r.cpl, cur)]));
  }

  // ---------- методика ----------
  ensure(70);
  doc.font('B').fontSize(10).fillColor(C.ink).text('Как считаются показатели', L, doc.y + 4);
  doc.font('R').fontSize(8).fillColor(C.ink2).text(
    [
      'Заявка — уникальная заполненная форма (тестовые и дублирующие заявки исключены).',
      'Стоимость заявки = затраты на лидогенерацию / число заявок. Конверсия переход → заявка = заявки / переходы в форму.',
      `Сравнение — с предыдущим периодом той же длины (${fmtDate(s.prevFrom)} — ${fmtDate(s.prevTo)}).`,
      note,
    ].filter(Boolean).join(' '), L, doc.y + 4, { width: CW, lineGap: 2 });

  // ---------- подвал на каждой странице ----------
  const range = doc.bufferedPageRange();
  const made = new Date().toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // иначе текст подвала ниже поля создаёт пустую страницу
    const y = doc.page.height - 36;
    doc.moveTo(L, y - 8).lineTo(R, y - 8).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.font('R').fontSize(7.5).fillColor(C.ink3)
      .text(`КонтентФерма · отчёт сформирован ${made}`, L, y, { width: CW / 2, lineBreak: false })
      .text(`${i - range.start + 1} / ${range.count}`, L + CW / 2, y, { width: CW / 2, align: 'right', lineBreak: false });
  }
  doc.end();
  return doc;
}

// Имя файла латиницей: браузеры (особенно встроенные/headless) не всегда принимают кириллицу в Content-Disposition
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ә: 'a', ғ: 'g', қ: 'k', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', і: 'i' };
const translit = (str) => String(str || '').split('').map((ch) => {
  const lo = ch.toLowerCase();
  if (TR[lo] === undefined) return ch;
  const t = TR[lo];
  return ch === lo ? t : t.charAt(0).toUpperCase() + t.slice(1);
}).join('');
function fileName(project, from, to, ad) {
  const slug = (x) => translit(x).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `Leadgen-${slug(project.name)}${ad ? `-${slug(ad)}` : ''}_${from}_${to}.pdf`;
}

// Отдаёт PDF в ответ express
async function send(res, project, { from, to, ad }) {
  const doc = await build(project, { from, to, ad });
  const name = fileName(project, from, to, ad);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Cache-Control', 'no-store');
  doc.pipe(res);
}

module.exports = { build, send, addDays };
