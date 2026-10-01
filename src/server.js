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
app.use('/api/client', require('./routes/client'));
app.use('/api', require('./routes/team'));

const pub = path.join(__dirname, '..', 'public');
app.use(express.static(pub, { index: false, maxAge: '1h' }));
app.get('/c/:token', (req, res) => res.sendFile(path.join(pub, 'client.html')));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(pub, 'index.html')));

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
