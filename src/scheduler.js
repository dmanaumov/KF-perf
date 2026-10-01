// Встроенный планировщик: раз в 10 минут проверяет, что пора обновить.
// Сами интервалы — в config (SYNC_INTERVAL_HOURS, SEO_INTERVAL_HOURS, GEO_INTERVAL_DAYS).
const sync = require('./sync');
const seo = require('./seo');
const geo = require('./geo');
const auth = require('./auth');

let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const s = await sync.syncDue();
    if (s.length) console.log(`[scheduler] ads: ${s.filter((x) => x.ok).length} ok, ${s.filter((x) => !x.ok).length} ошибок`);
    const k = await seo.checkDue();
    if (k.length) console.log(`[scheduler] seo: ${k.length} проект(ов)`);
    const g = await geo.checkDue();
    if (g.length) console.log(`[scheduler] geo: ${g.length} проект(ов)`);
    await auth.cleanup();
  } catch (err) {
    console.error('[scheduler]', err.message);
  } finally {
    busy = false;
  }
}

function start() {
  setTimeout(tick, 30 * 1000);
  setInterval(tick, 10 * 60 * 1000);
}

module.exports = { start, tick };
