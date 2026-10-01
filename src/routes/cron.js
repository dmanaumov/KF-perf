// Эндпоинты для n8n / внешнего планировщика. Заголовок X-Api-Key: AUTOMATION_API_KEY.
const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const sync = require('../sync');
const seo = require('../seo');
const geo = require('../geo');

const r = express.Router();
r.use((req, res, next) => {
  const key = String(req.headers['x-api-key'] || '');
  const ok = config.automationApiKey && key.length === config.automationApiKey.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(config.automationApiKey));
  return ok ? next() : res.status(401).json({ error: 'unauthorized' });
});
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
r.post('/sync', wrap(async (req, res) => res.json(await sync.syncDue())));
r.post('/seo', wrap(async (req, res) => res.json(await seo.checkDue())));
r.post('/geo', wrap(async (req, res) => res.json(await geo.checkDue())));
module.exports = r;
