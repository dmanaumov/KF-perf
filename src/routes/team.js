const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const auth = require('../auth');
const secrets = require('../secrets');
const metrics = require('../metrics');
const sync = require('../sync');
const seo = require('../seo');
const geo = require('../geo');
const connectors = require('../connectors');
const settings = require('../settings');
const { PLATFORMS, BY_ID, AREAS, TASK_STATUSES } = require('../platforms');
const { today, monthStart, monthEnd, isDate, addDays } = require('../dates');

const r = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, message, code = 400) => res.status(code).json({ error: 'bad_request', message });
const arr = (v) => (Array.isArray(v) ? v : String(v || '').split(/\n|,/)).map((s) => String(s).trim()).filter(Boolean);
const numOrNull = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(+v) ? null : +v);

// ---------- auth ----------
r.post('/login', wrap(async (req, res) => {
  const { login, password } = req.body || {};
  if (!login || !password) return bad(res, 'Введите логин и пароль');
  try {
    const user = await auth.login(String(login).trim(), String(password));
    await auth.createSession(res, user);
    res.json({ user });
  } catch (err) {
    res.status(401).json({ error: 'login_failed', message: err.message });
  }
}));
r.post('/logout', wrap(async (req, res) => { await auth.destroySession(req, res); res.json({ ok: true }); }));

r.use(auth.requireUser);

r.get('/me', (req, res) => res.json({ user: req.user }));

r.get('/meta', (req, res) => res.json({
  platforms: PLATFORMS,
  areas: AREAS,
  taskStatuses: TASK_STATUSES,
  connectors: connectors.describe(),
  aiEngines: geo.ENGINES.map((e) => ({ ...e, enabled: geo.enabledEngines().some((x) => x.id === e.id) })),
  seoConfigured: seo.isConfigured(),
  today: today(),
}));

r.get('/users', wrap(async (req, res) => {
  const list = await db.all('SELECT id, username, name, email, role, last_login_at FROM users ORDER BY name');
  res.json(await Promise.all(list.map((u) => auth.withEffectiveRole(u))));
}));
r.put('/users/:id', auth.requireRole('admin'), wrap(async (req, res) => {
  const role = req.body.role;
  if (!['admin', 'lead', 'specialist'].includes(role)) return bad(res, 'Неизвестная роль');
  if (req.params.id === req.user.id && role !== 'admin') return bad(res, 'Нельзя снять админа с самого себя');
  await db.q('UPDATE users SET role=$2 WHERE id=$1', [req.params.id, role]);
  res.json({ ok: true });
}));

// ---------- сервисы и ключи (лидер Performance / админ) ----------
const leadOnly = auth.requireRole('admin', 'lead');
r.get('/settings', leadOnly, (req, res) => res.json(settings.describe()));
r.put('/settings', leadOnly, wrap(async (req, res) => {
  await settings.save(req.body && req.body.values, req.user.id);
  res.json(settings.describe());
}));
r.post('/settings/test/:service', leadOnly, wrap(async (req, res) => {
  const svc = req.params.service;
  try {
    if (svc === 'seo') {
      if (!seo.isConfigured()) throw new Error('Заполните API-ключ и ID каталога');
      const urls = await seo.serp('контент ферма', 213, 10);
      return res.json({ ok: true, message: `Yandex Search API отвечает: ${urls.length} результатов` });
    }
    if (svc === 'google') {
      const g = settings.googleAds();
      const miss = [['Developer token', g.developerToken], ['Client ID', g.clientId], ['Client secret', g.clientSecret]].filter(([, v]) => !v).map(([k]) => k);
      if (miss.length) throw new Error(`Не заполнено: ${miss.join(', ')}`);
      return res.json({ ok: true, message: 'Заполнено. Реальная проверка — кнопкой «Проверить» у канала Google Ads в проекте (нужен refresh token клиента).' });
    }
    const eng = geo.ENGINES.find((e) => e.id === svc);
    if (eng) {
      if (!geo.enabledEngines().some((e) => e.id === svc)) throw new Error('Ключ не задан');
      const t0 = Date.now();
      const a = await geo.ask(svc, 'Ответь одним словом: столица России?');
      return res.json({ ok: true, message: `${eng.label} отвечает за ${((Date.now() - t0) / 1000).toFixed(1)} с: «${String(a.text).trim().slice(0, 60)}»` });
    }
    return bad(res, 'Неизвестный сервис');
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
}));

// ---------- project access ----------
async function loadProject(req, res, next) {
  const id = parseInt(req.params.pid, 10);
  const p = Number.isFinite(id) && (await db.one('SELECT * FROM projects WHERE id=$1', [id]));
  if (!p) return res.status(404).json({ error: 'not_found', message: 'Проект не найден' });
  if (!(await auth.canAccessProject(req.user, id))) return res.status(403).json({ error: 'forbidden', message: 'Нет доступа к проекту' });
  req.project = p;
  next();
}
const P = '/projects/:pid';
const canManage = (u) => u.role === 'admin' || u.role === 'lead';

// ---------- overview ----------
r.get('/overview', wrap(async (req, res) => {
  const f = auth.projectFilterSql(req.user);
  const projects = await db.all(
    `SELECT p.*, u.name AS manager_name FROM projects p LEFT JOIN users u ON u.id=p.manager_id
     WHERE p.status <> 'archived' AND ${f.sql} ORDER BY p.status, p.name`, f.params);
  // ?month=YYYY-MM-01 — прошлый месяц смотрим «на конец месяца»
  const t = today();
  const m = isDate(req.query.month) ? monthStart(req.query.month) : monthStart(t);
  const d = m === monthStart(t) ? t : (m > t ? t : monthEnd(m));
  const rows = [];
  const allAlerts = [];
  for (const p of projects) {
    const pace = await metrics.pacing(p.id, d);
    const [al, tasks, seoS, geoS, integ] = await Promise.all([
      metrics.alerts(p, pace),
      db.one(`SELECT count(*) FILTER (WHERE status<>'done')::int AS open, count(*) FILTER (WHERE status<>'done' AND due_date < $2)::int AS overdue FROM tasks WHERE project_id=$1`, [p.id, d]),
      p.services.includes('seo') ? metrics.seoSummary(p.id) : null,
      p.services.includes('geo') ? metrics.geoSummary(p.id) : null,
      db.all('SELECT platform, status FROM integrations WHERE project_id=$1 AND enabled', [p.id]),
    ]);
    allAlerts.push(...al);
    rows.push({
      id: p.id, name: p.name, client_name: p.client_name, status: p.status, services: p.services, kpi_type: p.kpi_type, manager_name: p.manager_name,
      platforms: [...new Set(integ.map((i) => i.platform))],
      syncErrors: integ.filter((i) => i.status === 'error').length,
      pacing: { budget: pace.plan && pace.plan.budget, leadsPlan: pace.plan && pace.plan.leads, cplTarget: pace.plan && pace.plan.cpl_target, spend: pace.fact.spend, leads: pace.fact.leads, cpl: pace.fact.cpl, revenue: pace.fact.revenue, romi: pace.fact.romi, spendPct: pace.spendPct, pacePct: pace.pacePct, leadsPct: pace.leadsPct, expectedSpend: pace.expectedSpend },
      tasks,
      seo: seoS && { top10: seoS.top10, total: seoS.total, avgPosition: seoS.avgPosition },
      geo: geoS && { visibility: geoS.visibility, shareOfVoice: geoS.shareOfVoice, checks: geoS.checks },
      alerts: al.length,
      alertsHigh: al.filter((a) => a.level === 'high').length,
    });
  }
  const ms = monthStart(d);
  const ids = projects.map((p) => p.id);
  const totals = ids.length ? await db.one(
    `SELECT COALESCE(sum(spend),0)::float AS spend, COALESCE(sum(leads),0)::float AS leads, COALESCE(sum(revenue),0)::float AS revenue
     FROM stats_daily WHERE project_id = ANY($1) AND date BETWEEN $2 AND $3 AND platform <> 'metrika'`, [ids, ms, d]) : { spend: 0, leads: 0, revenue: 0 };
  const budget = rows.reduce((s, x) => s + (x.pacing.budget || 0), 0);
  const daily = ids.length ? await db.all(
    `SELECT date, COALESCE(sum(spend),0)::float AS spend, COALESCE(sum(leads),0)::float AS leads FROM stats_daily
     WHERE project_id = ANY($1) AND date BETWEEN $2 AND $3 AND platform <> 'metrika' GROUP BY date ORDER BY date`, [ids, addDays(d, -29), d]) : [];
  const levelOrder = { high: 0, mid: 1, low: 2 };
  res.json({
    date: d, month: ms,
    totals: { ...totals, budget, cpl: totals.leads ? totals.spend / totals.leads : null, projects: rows.length },
    daily,
    projects: rows,
    alerts: allAlerts.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]),
  });
}));

// ---------- projects ----------
r.get('/projects', wrap(async (req, res) => {
  const f = auth.projectFilterSql(req.user);
  res.json(await db.all(`SELECT p.id, p.name, p.client_name, p.status, p.services FROM projects p WHERE ${f.sql} ORDER BY p.status, p.name`, f.params));
}));

function projectFields(b) {
  return {
    name: String(b.name || '').trim(),
    client_name: b.client_name || null,
    site_url: b.site_url || null,
    status: ['active', 'paused', 'archived'].includes(b.status) ? b.status : 'active',
    kpi_type: ['leads', 'sales', 'traffic'].includes(b.kpi_type) ? b.kpi_type : 'leads',
    currency: b.currency || 'RUB',
    manager_id: b.manager_id || null,
    brand_terms: arr(b.brand_terms),
    competitors: arr(b.competitors),
    services: arr(b.services).filter((s) => ['ads', 'seo', 'geo'].includes(s)),
    notes: b.notes || null,
  };
}

r.post('/projects', wrap(async (req, res) => {
  if (!canManage(req.user)) return bad(res, 'Создавать проекты могут руководитель и админ', 403);
  const f = projectFields(req.body || {});
  if (!f.name) return bad(res, 'Укажите название');
  const p = await db.one(
    `INSERT INTO projects (name, client_name, site_url, status, kpi_type, currency, manager_id, brand_terms, competitors, services, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [f.name, f.client_name, f.site_url, f.status, f.kpi_type, f.currency, f.manager_id || req.user.id, f.brand_terms, f.competitors, f.services.length ? f.services : ['ads'], f.notes]
  );
  res.json(p);
}));

r.get(P, loadProject, wrap(async (req, res) => {
  const members = await db.all('SELECT u.id, u.name, u.username FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=$1', [req.project.id]);
  const manager = req.project.manager_id ? await db.one('SELECT id, name FROM users WHERE id=$1', [req.project.manager_id]) : null;
  res.json({ ...req.project, members, manager, canManage: canManage(req.user) });
}));

r.put(P, loadProject, wrap(async (req, res) => {
  if (!canManage(req.user) && req.project.manager_id !== req.user.id) return bad(res, 'Нет прав на редактирование проекта', 403);
  const f = projectFields({ ...req.project, ...req.body });
  if (!f.name) return bad(res, 'Укажите название');
  const p = await db.one(
    `UPDATE projects SET name=$2, client_name=$3, site_url=$4, status=$5, kpi_type=$6, currency=$7, manager_id=$8, brand_terms=$9, competitors=$10, services=$11, notes=$12 WHERE id=$1 RETURNING *`,
    [req.project.id, f.name, f.client_name, f.site_url, f.status, f.kpi_type, f.currency, f.manager_id, f.brand_terms, f.competitors, f.services, f.notes]
  );
  if (Array.isArray(req.body.member_ids)) {
    await db.q('DELETE FROM project_members WHERE project_id=$1', [p.id]);
    for (const uid of req.body.member_ids) await db.q('INSERT INTO project_members VALUES ($1,$2) ON CONFLICT DO NOTHING', [p.id, uid]);
  }
  res.json(p);
}));

r.delete(P, loadProject, auth.requireRole('admin'), wrap(async (req, res) => {
  await db.q('DELETE FROM projects WHERE id=$1', [req.project.id]);
  res.json({ ok: true });
}));

r.post(`${P}/client-link`, loadProject, wrap(async (req, res) => {
  const { action } = req.body || {};
  let token = req.project.client_token;
  if (action === 'regenerate' || !token) token = crypto.randomBytes(18).toString('base64url');
  const enabled = action === 'disable' ? false : true;
  await db.q('UPDATE projects SET client_token=$2, client_enabled=$3 WHERE id=$1', [req.project.id, token, enabled]);
  res.json({ token, enabled });
}));

// ---------- analytics ----------
r.get(`${P}/summary`, loadProject, wrap(async (req, res) => {
  const to = isDate(req.query.to) ? req.query.to : today();
  const from = isDate(req.query.from) ? req.query.from : monthStart(to);
  if (from > to) return bad(res, 'Неверный период');
  const [summary, pace] = await Promise.all([metrics.projectSummary(req.project.id, from, to), metrics.pacing(req.project.id)]);
  res.json({ ...summary, pacing: pace, alerts: await metrics.alerts(req.project, pace) });
}));

r.get(`${P}/plans`, loadProject, wrap(async (req, res) => {
  const month = isDate(req.query.month) ? monthStart(req.query.month) : monthStart(today());
  res.json({ month, rows: await db.all('SELECT * FROM plans WHERE project_id=$1 AND month=$2 ORDER BY platform', [req.project.id, month]) });
}));

r.put(`${P}/plans`, loadProject, wrap(async (req, res) => {
  const month = isDate(req.body.month) ? monthStart(req.body.month) : null;
  if (!month) return bad(res, 'Укажите месяц');
  await db.q('DELETE FROM plans WHERE project_id=$1 AND month=$2', [req.project.id, month]);
  for (const row of req.body.rows || []) {
    const vals = [numOrNull(row.budget), numOrNull(row.leads), numOrNull(row.cpl_target), numOrNull(row.revenue)];
    if (vals.every((v) => v === null)) continue;
    await db.q('INSERT INTO plans (project_id, month, platform, budget, leads, cpl_target, revenue) VALUES ($1,$2,$3,$4,$5,$6,$7)', [req.project.id, month, row.platform || '', ...vals]);
  }
  res.json({ ok: true });
}));

r.get(`${P}/syncs`, loadProject, wrap(async (req, res) => {
  res.json(await db.all(
    `SELECT r.*, i.platform, i.title FROM sync_runs r LEFT JOIN integrations i ON i.id=r.integration_id
     WHERE r.project_id=$1 ORDER BY r.started_at DESC LIMIT 30`, [req.project.id]));
}));

// ---------- integrations ----------
function publicIntegration(i) {
  let credKeys = [];
  try { credKeys = Object.entries(secrets.decrypt(i.credentials_enc)).filter(([, v]) => v).map(([k]) => k); } catch (e) { credKeys = ['?']; }
  const { credentials_enc, ...rest } = i;
  return { ...rest, credKeys, hasApi: !!connectors.get(i.platform), label: (BY_ID[i.platform] || {}).label || i.platform };
}

r.get(`${P}/integrations`, loadProject, wrap(async (req, res) => {
  const list = await db.all(
    `SELECT i.*, (SELECT max(date) FROM stats_daily s WHERE s.integration_id=i.id) AS last_date,
            (SELECT min(date) FROM stats_daily s WHERE s.integration_id=i.id) AS first_date
     FROM integrations i WHERE project_id=$1 ORDER BY id`, [req.project.id]);
  res.json(list.map(publicIntegration));
}));

r.post(`${P}/integrations`, loadProject, wrap(async (req, res) => {
  const { platform, title, credentials = {}, settings = {} } = req.body || {};
  if (!BY_ID[platform]) return bad(res, 'Неизвестная площадка');
  const conn = connectors.get(platform);
  const hasCreds = conn && Object.values(credentials).some(Boolean);
  if (conn) {
    const missing = conn.fields.filter((f) => f.required && !credentials[f.key]);
    if (hasCreds && missing.length) return bad(res, `Заполните: ${missing.map((m) => m.label).join(', ')}`);
  }
  const i = await db.one(
    'INSERT INTO integrations (project_id, platform, title, credentials_enc, settings, status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.project.id, platform, title || null, hasCreds ? secrets.encrypt(credentials) : null, settings, hasCreds ? 'never' : 'manual']
  );
  res.json(publicIntegration(i));
}));

async function loadIntegration(req, res, next) {
  const i = await db.one('SELECT * FROM integrations WHERE id=$1 AND project_id=$2', [req.params.iid, req.project.id]);
  if (!i) return res.status(404).json({ error: 'not_found', message: 'Подключение не найдено' });
  req.integration = i;
  next();
}
const I = `${P}/integrations/:iid`;

r.put(I, loadProject, wrap(loadIntegration), wrap(async (req, res) => {
  const i = req.integration;
  const { title, credentials, settings, enabled } = req.body || {};
  let enc = i.credentials_enc;
  if (credentials && Object.values(credentials).some(Boolean)) {
    // пустые поля = «оставить как было»
    const prev = i.credentials_enc ? secrets.decrypt(i.credentials_enc) : {};
    const merged = { ...prev };
    Object.entries(credentials).forEach(([k, v]) => { if (v) merged[k] = v; });
    enc = secrets.encrypt(merged);
  }
  const out = await db.one(
    `UPDATE integrations SET title=$2, credentials_enc=$3, settings=$4, enabled=$5,
       status = CASE WHEN $3::text IS NULL THEN 'manual' WHEN $3::text IS DISTINCT FROM credentials_enc THEN 'never' ELSE status END
     WHERE id=$1 RETURNING *`,
    [i.id, title !== undefined ? title : i.title, enc, settings || i.settings, enabled !== undefined ? !!enabled : i.enabled]
  );
  res.json(publicIntegration(out));
}));

r.delete(I, loadProject, wrap(loadIntegration), wrap(async (req, res) => {
  await db.q('DELETE FROM integrations WHERE id=$1', [req.integration.id]);
  res.json({ ok: true });
}));

r.post(`${I}/test`, loadProject, wrap(loadIntegration), wrap(async (req, res) => {
  const conn = connectors.get(req.integration.platform);
  if (!conn) return bad(res, 'Для площадки нет API');
  try {
    res.json({ ok: true, message: await conn.test(secrets.decrypt(req.integration.credentials_enc), req.integration.settings || {}) });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
}));

r.post(`${I}/sync`, loadProject, wrap(loadIntegration), wrap(async (req, res) => {
  const { from, to } = req.body || {};
  try {
    res.json({ ok: true, ...(await sync.syncIntegration(req.integration.id, { dateFrom: isDate(from) ? from : undefined, dateTo: isDate(to) ? to : undefined })) });
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message });
  }
}));

r.post(`${I}/import`, loadProject, wrap(loadIntegration), wrap(async (req, res) => {
  let parsed;
  try { parsed = sync.parseCsv(req.body.csv); } catch (err) { return bad(res, err.message); }
  if (!parsed.rows.length) return bad(res, `Нет строк для импорта. ${parsed.errors.slice(0, 3).join('; ')}`);
  const n = await sync.importRows(req.integration.id, parsed.rows, 'csv');
  res.json({ ok: true, rows: n, errors: parsed.errors });
}));

r.post(`${I}/manual`, loadProject, wrap(loadIntegration), wrap(async (req, res) => {
  const b = req.body || {};
  if (!isDate(b.date)) return bad(res, 'Укажите дату');
  const name = String(b.campaign || '').trim();
  const n = await sync.importRows(req.integration.id, [{
    date: b.date, campaign_id: name.toLowerCase(), campaign_name: name || null,
    impressions: +b.impressions || 0, clicks: +b.clicks || 0, spend: +b.spend || 0, leads: +b.leads || 0, revenue: +b.revenue || 0,
  }], 'manual');
  res.json({ ok: true, rows: n });
}));

// ---------- tasks ----------
r.get('/tasks', wrap(async (req, res) => {
  const f = auth.projectFilterSql(req.user, 'p', 1);
  const params = [...f.params];
  const where = [f.sql];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (req.query.project_id) add('t.project_id = ?', +req.query.project_id);
  if (req.query.assignee === 'me') add('t.assignee_id = ?', req.user.id);
  else if (req.query.assignee) add('t.assignee_id = ?', req.query.assignee);
  if (req.query.area) add('t.area = ?', req.query.area);
  if (req.query.open === '1') where.push("t.status <> 'done'");
  res.json(await db.all(
    `SELECT t.*, p.name AS project_name, u.name AS assignee_name FROM tasks t
     JOIN projects p ON p.id=t.project_id LEFT JOIN users u ON u.id=t.assignee_id
     WHERE ${where.join(' AND ')}
     ORDER BY (t.status='done'), t.due_date NULLS LAST, CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, t.id DESC
     LIMIT 500`, params));
}));

function taskFields(b) {
  return {
    title: String(b.title || '').trim(),
    description: b.description || null,
    area: AREAS.some((a) => a.id === b.area) ? b.area : 'ads',
    platform: b.platform || null,
    type: ['task', 'hypothesis', 'report'].includes(b.type) ? b.type : 'task',
    status: TASK_STATUSES.some((s) => s.id === b.status) ? b.status : 'todo',
    priority: ['low', 'normal', 'high'].includes(b.priority) ? b.priority : 'normal',
    assignee_id: b.assignee_id || null,
    due_date: isDate(b.due_date) ? b.due_date : null,
    client_visible: b.client_visible === undefined ? true : !!b.client_visible,
    result: b.result || null,
  };
}

r.post('/tasks', wrap(async (req, res) => {
  const pid = +req.body.project_id;
  if (!pid || !(await auth.canAccessProject(req.user, pid))) return bad(res, 'Выберите проект', 403);
  const t = taskFields(req.body);
  if (!t.title) return bad(res, 'Укажите название задачи');
  res.json(await db.one(
    `INSERT INTO tasks (project_id, title, description, area, platform, type, status, priority, assignee_id, due_date, client_visible, result, created_by, done_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, CASE WHEN $7='done' THEN now() END) RETURNING *`,
    [pid, t.title, t.description, t.area, t.platform, t.type, t.status, t.priority, t.assignee_id, t.due_date, t.client_visible, t.result, req.user.id]));
}));

r.put('/tasks/:id', wrap(async (req, res) => {
  const cur = await db.one('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
  if (!cur || !(await auth.canAccessProject(req.user, cur.project_id))) return res.status(404).json({ error: 'not_found' });
  const t = taskFields({ ...cur, ...req.body });
  if (!t.title) return bad(res, 'Укажите название задачи');
  res.json(await db.one(
    `UPDATE tasks SET title=$2, description=$3, area=$4, platform=$5, type=$6, status=$7, priority=$8, assignee_id=$9, due_date=$10, client_visible=$11, result=$12,
       updated_at=now(), done_at = CASE WHEN $7='done' AND status<>'done' THEN now() WHEN $7<>'done' THEN NULL ELSE done_at END
     WHERE id=$1 RETURNING *`,
    [cur.id, t.title, t.description, t.area, t.platform, t.type, t.status, t.priority, t.assignee_id, t.due_date, t.client_visible, t.result]));
}));

r.delete('/tasks/:id', wrap(async (req, res) => {
  const cur = await db.one('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
  if (!cur || !(await auth.canAccessProject(req.user, cur.project_id))) return res.status(404).json({ error: 'not_found' });
  await db.q('DELETE FROM tasks WHERE id=$1', [cur.id]);
  res.json({ ok: true });
}));

// ---------- changelog ----------
r.get(`${P}/changelog`, loadProject, wrap(async (req, res) => {
  res.json(await db.all(
    `SELECT c.*, u.name AS author_name FROM changelog c LEFT JOIN users u ON u.id=c.author_id
     WHERE c.project_id=$1 ORDER BY c.date DESC, c.id DESC LIMIT 300`, [req.project.id]));
}));
r.post(`${P}/changelog`, loadProject, wrap(async (req, res) => {
  const b = req.body || {};
  if (!String(b.text || '').trim()) return bad(res, 'Опишите изменение');
  res.json(await db.one(
    'INSERT INTO changelog (project_id, date, area, platform, text, client_visible, author_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [req.project.id, isDate(b.date) ? b.date : today(), b.area || 'ads', b.platform || null, b.text.trim(), b.client_visible !== false, req.user.id]));
}));
r.delete(`${P}/changelog/:cid`, loadProject, wrap(async (req, res) => {
  await db.q('DELETE FROM changelog WHERE id=$1 AND project_id=$2', [req.params.cid, req.project.id]);
  res.json({ ok: true });
}));

// ---------- SEO ----------
r.get(`${P}/seo`, loadProject, wrap(async (req, res) => {
  const [s, traffic] = await Promise.all([
    metrics.seoSummary(req.project.id),
    db.all(`SELECT to_char(date_trunc('week', date), 'YYYY-MM-DD') AS week, COALESCE(sum(clicks),0)::float AS visits, COALESCE(sum(leads),0)::float AS leads
            FROM stats_daily WHERE project_id=$1 AND platform='metrika' AND campaign_id='src:organic'
              AND date >= date_trunc('week', $2::date) AND date < date_trunc('week', $3::date) GROUP BY 1 ORDER BY 1`, [req.project.id, addDays(today(), -7 * 16), today()]),
  ]);
  const lastRun = await db.one("SELECT * FROM sync_runs WHERE project_id=$1 AND kind='seo' ORDER BY started_at DESC LIMIT 1", [req.project.id]);
  res.json({ ...s, organic: traffic, lastRun, configured: seo.isConfigured() });
}));

r.post(`${P}/seo/keywords`, loadProject, wrap(async (req, res) => {
  const b = req.body || {};
  const engine = b.engine === 'google' ? 'google' : 'yandex';
  const region = parseInt(b.region, 10) || 213;
  let n = 0;
  for (const line of arr(String(b.keywords || '').replace(/,/g, '\n'))) {
    await db.q(`INSERT INTO seo_keywords (project_id, keyword, engine, region, group_name) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, [req.project.id, line.toLowerCase(), engine, region, b.group_name || null]);
    n++;
  }
  res.json({ ok: true, added: n });
}));
r.put(`${P}/seo/keywords/:kid`, loadProject, wrap(async (req, res) => {
  const b = req.body || {};
  await db.q('UPDATE seo_keywords SET group_name=COALESCE($3, group_name), target_url=COALESCE($4, target_url), active=COALESCE($5, active), frequency=COALESCE($6, frequency) WHERE id=$1 AND project_id=$2',
    [req.params.kid, req.project.id, b.group_name ?? null, b.target_url ?? null, typeof b.active === 'boolean' ? b.active : null, numOrNull(b.frequency)]);
  res.json({ ok: true });
}));
r.delete(`${P}/seo/keywords/:kid`, loadProject, wrap(async (req, res) => {
  await db.q('DELETE FROM seo_keywords WHERE id=$1 AND project_id=$2', [req.params.kid, req.project.id]);
  res.json({ ok: true });
}));
r.post(`${P}/seo/check`, loadProject, wrap(async (req, res) => {
  if (!seo.isConfigured()) return bad(res, 'Yandex Search API не настроен');
  seo.checkProject(req.project.id).catch((err) => console.error('[seo]', err.message));
  res.json({ ok: true, started: true });
}));
r.post(`${P}/seo/import`, loadProject, wrap(async (req, res) => {
  // keyword;engine;date;position;url
  const lines = String(req.body.csv || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const sep = lines[0] && lines[0].includes(';') ? ';' : lines[0] && lines[0].includes('\t') ? '\t' : ',';
  const rows = [];
  for (const l of lines) {
    const [keyword, engine, date, position, url] = l.split(sep).map((s) => s.trim());
    if (!keyword || !isDate(date) || /^keyword|^запрос/i.test(keyword)) continue;
    rows.push({ keyword: keyword.toLowerCase(), engine: engine === 'yandex' ? 'yandex' : 'google', date, position: parseInt(position, 10) || null, url });
  }
  if (!rows.length) return bad(res, 'Нет строк в формате: запрос;google;2026-09-30;7;url');
  res.json({ ok: true, rows: await seo.importPositions(req.project.id, rows) });
}));

// ---------- GEO ----------
r.get(`${P}/geo`, loadProject, wrap(async (req, res) => {
  const [s, lastRun, aiTraffic] = await Promise.all([
    metrics.geoSummary(req.project.id),
    db.one("SELECT * FROM sync_runs WHERE project_id=$1 AND kind='geo' ORDER BY started_at DESC LIMIT 1", [req.project.id]),
    db.all(`SELECT campaign_name AS name, COALESCE(sum(clicks),0)::float AS visits, COALESCE(sum(leads),0)::float AS leads FROM stats_daily
            WHERE project_id=$1 AND platform='metrika' AND campaign_id LIKE 'ai:%' AND date > $2 GROUP BY 1 ORDER BY 2 DESC`, [req.project.id, addDays(today(), -30)]),
  ]);
  res.json({ ...s, lastRun, aiTraffic, enginesAvailable: geo.ENGINES.map((e) => ({ ...e, enabled: geo.enabledEngines().some((x) => x.id === e.id) })) });
}));
r.post(`${P}/geo/prompts`, loadProject, wrap(async (req, res) => {
  let n = 0;
  for (const line of String(req.body.prompts || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
    await db.q('INSERT INTO geo_prompts (project_id, prompt, topic) VALUES ($1,$2,$3)', [req.project.id, line, req.body.topic || null]);
    n++;
  }
  res.json({ ok: true, added: n });
}));
r.put(`${P}/geo/prompts/:gid`, loadProject, wrap(async (req, res) => {
  const b = req.body || {};
  await db.q('UPDATE geo_prompts SET prompt=COALESCE($3,prompt), topic=COALESCE($4,topic), active=COALESCE($5,active) WHERE id=$1 AND project_id=$2',
    [req.params.gid, req.project.id, b.prompt || null, b.topic ?? null, typeof b.active === 'boolean' ? b.active : null]);
  res.json({ ok: true });
}));
r.delete(`${P}/geo/prompts/:gid`, loadProject, wrap(async (req, res) => {
  await db.q('DELETE FROM geo_prompts WHERE id=$1 AND project_id=$2', [req.params.gid, req.project.id]);
  res.json({ ok: true });
}));
r.post(`${P}/geo/check`, loadProject, wrap(async (req, res) => {
  if (!geo.enabledEngines().length) return bad(res, 'Не подключён ни один AI-движок (ключи в env)');
  geo.checkProject(req.project.id, { promptId: req.body.prompt_id }).catch((err) => console.error('[geo]', err.message));
  res.json({ ok: true, started: true });
}));
r.get(`${P}/geo/checks/:cid`, loadProject, wrap(async (req, res) => {
  const c = await db.one('SELECT c.*, g.prompt FROM geo_checks c JOIN geo_prompts g ON g.id=c.prompt_id WHERE c.id=$1 AND c.project_id=$2', [req.params.cid, req.project.id]);
  if (!c) return res.status(404).json({ error: 'not_found' });
  const history = await db.all('SELECT id, checked_at, mentioned, cited, rank FROM geo_checks WHERE prompt_id=$1 AND engine=$2 AND error IS NULL ORDER BY checked_at DESC LIMIT 20', [c.prompt_id, c.engine]);
  res.json({ ...c, history });
}));

module.exports = r;
