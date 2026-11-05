const path = require('path');
const express = require('express');
const compression = require('compression');
const config = require('./config');
const db = require('./db');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(compression());
app.use(express.json({ limit: '5mb' }));

app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use('/api/cron', require('./routes/cron'));
app.use('/api/ingest', require('./routes/ingest'));
app.use('/api/client', require('./routes/client'));
app.use('/api', require('./routes/team'));

const pub = path.join(__dirname, '..', 'public');
// Версия ассетов = хеш содержимого public/*.js|css. В HTML ссылки получают ?v=<хеш>,
// поэтому после деплоя браузер сразу берёт новые app.js/charts.js/app.css, а не
// закэшированные на час старые. Сам HTML не кэшируется.
const fs = require('fs');
const crypto = require('crypto');
const assetVersion = crypto.createHash('md5')
  .update(fs.readdirSync(pub).filter((f) => /\.(js|css)$/.test(f)).sort().map((f) => fs.readFileSync(path.join(pub, f))).join(''))
  .digest('hex').slice(0, 10);
const htmlCache = {};
function sendHtml(res, file) {
  if (!htmlCache[file]) {
    htmlCache[file] = fs.readFileSync(path.join(pub, file), 'utf8')
      .replace(/(src|href)="\/([\w.-]+\.(?:js|css))"/g, `$1="/$2?v=${assetVersion}"`);
  }
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(htmlCache[file]);
}
app.get(['/', '/index.html'], (req, res) => sendHtml(res, 'index.html'));
app.use(express.static(pub, { index: false, maxAge: '1h' }));
app.get('/c/:token', (req, res) => sendHtml(res, 'client.html'));
app.get(/^\/(?!api\/).*/, (req, res) => sendHtml(res, 'index.html'));

app.use((err, req, res, next) => {
  console.error('[api]', req.method, req.path, err);
  res.status(500).json({ error: 'server_error', message: err.message });
});

(async () => {
  await db.init();
  await require('./settings').load();
  if (config.seedDemo) await require('./seed').seedIfEmpty();
  if (!config.appSecret) console.warn('[warn] APP_SECRET не задан — подключения с токенами работать не будут');
  app.listen(config.port, () => console.log(`[perf] слушаю :${config.port}`));
  if (config.schedulerEnabled) require('./scheduler').start();
})().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
