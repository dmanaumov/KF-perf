// Клиентский кабинет по секретной ссылке /c/:token — только чтение,
// только то, что помечено «видно клиенту». Без названий внутренних полей и кредов.
const express = require('express');
const db = require('../db');
const metrics = require('../metrics');
const { today, monthStart, isDate } = require('../dates');
const { BY_ID } = require('../platforms');

const r = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

r.use('/:token', wrap(async (req, res, next) => {
  const p = await db.one('SELECT * FROM projects WHERE client_token=$1 AND client_enabled', [req.params.token]);
  if (!p) return res.status(404).json({ error: 'not_found', message: 'Ссылка недействительна' });
  req.project = p;
  next();
}));

r.get('/:token', wrap(async (req, res) => {
  const p = req.project;
  const to = isDate(req.query.to) ? req.query.to : today();
  const from = isDate(req.query.from) ? req.query.from : monthStart(to);
  const [summary, pace, tasks, changelog, integ, manager] = await Promise.all([
    metrics.projectSummary(p.id, from, to),
    metrics.pacing(p.id),
    db.all(`SELECT id, title, area, platform, type, status, due_date, result, done_at FROM tasks WHERE project_id=$1 AND client_visible
            AND (status<>'done' OR done_at > now() - interval '45 days') ORDER BY (status='done'), due_date NULLS LAST`, [p.id]),
    db.all('SELECT date, area, platform, text FROM changelog WHERE project_id=$1 AND client_visible ORDER BY date DESC, id DESC LIMIT 60', [p.id]),
    db.all('SELECT DISTINCT platform FROM integrations WHERE project_id=$1 AND enabled', [p.id]),
    p.manager_id ? db.one('SELECT name FROM users WHERE id=$1', [p.manager_id]) : null,
  ]);
  const out = {
    project: { name: p.name, client_name: p.client_name, site_url: p.site_url, services: p.services, kpi_type: p.kpi_type, manager: manager && manager.name },
    platforms: integ.map((i) => ({ id: i.platform, label: (BY_ID[i.platform] || {}).label })),
    summary,
    pacing: { month: pace.month, elapsed: pace.elapsed, total: pace.total, plan: pace.plan, fact: pace.fact, spendPct: pace.spendPct, leadsPct: pace.leadsPct, forecastSpend: pace.forecastSpend, forecastLeads: pace.forecastLeads },
    tasks,
    changelog,
  };
  if (p.services.includes('seo')) {
    const s = await metrics.seoSummary(p.id);
    out.seo = { ...s, keywords: s.keywords.map(({ id, keyword, engine, group_name, position, prev_position, date, history }) => ({ id, keyword, engine, group_name, position, prev_position, date, history })) };
  }
  if (p.services.includes('geo')) {
    const g = await metrics.geoSummary(p.id);
    out.geo = { ...g, prompts: g.prompts.filter((x) => x.active).map(({ id, prompt, topic }) => ({ id, prompt, topic })) };
  }
  res.json(out);
}));

module.exports = r;
