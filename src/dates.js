// Все даты — строки 'YYYY-MM-DD' в часовом поясе Europe/Moscow.
const TZ = process.env.TZ_REPORTS || 'Europe/Moscow';

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}
function addDays(d, n) {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
function monthStart(d) { return d.slice(0, 8) + '01'; }
function daysInMonth(d) {
  const [y, m] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function monthEnd(d) { return d.slice(0, 8) + String(daysInMonth(d)).padStart(2, '0'); }
function diffDays(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000); }
function isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

module.exports = { today, addDays, monthStart, monthEnd, daysInMonth, diffDays, isDate };
