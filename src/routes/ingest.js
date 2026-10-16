// Задачи Performance для my.kontentferma (KF-my): портал забирает их в общий список задач команды
// и умеет менять статус (галочка «выполнено» в my). Ключ — X-Api-Key: KF_MY_API_KEY
// (тот же общий ключ, с которым мы ходим в KF-my за ролями) или AUTOMATION_API_KEY.
const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const { TASK_STATUSES } = require('../platforms');

const r = express.Router();
const same = (a, b) => !!a && !!b && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
r.use((req, res, next) => {
  const key = String(req.headers['x-api-key'] || '');
  return same(key, config.kfMyApiKey) || same(key, config.automationApiKey) ? next() : res.status(401).json({ error: 'unauthorized' });
});
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const dateStr = (d) => (d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : d || null);
const pub = (t) => ({ ...t, due_date: dateStr(t.due_date) });

// GET /api/ingest/tasks — все задачи (кроме проектов в архиве) с названием проекта.
r.get('/tasks', wrap(async (req, res) => {
  const rows = await db.all(
    `SELECT t.id, t.project_id, p.name AS project_name, t.title, t.description, t.area, t.platform, t.type, t.status, t.priority,
            t.assignee_id, t.due_date, t.client_visible, t.result, t.created_by, t.created_at, t.updated_at, t.done_at
       FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE p.status <> 'archived'
      ORDER BY t.id`);
  res.json({ tasks: rows.map(pub), statuses: TASK_STATUSES, publicUrl: config.publicUrl });
}));

// POST /api/ingest/tasks/:id/status { status, actor? } — смена статуса из my.kontentferma.
r.post('/tasks/:id/status', wrap(async (req, res) => {
  const status = String((req.body || {}).status || '');
  if (!TASK_STATUSES.some((s) => s.id === status)) return res.status(400).json({ error: 'bad_status', message: 'Неизвестный статус' });
  const row = await db.one(
    `UPDATE tasks SET status = $2, updated_at = now(),
            done_at = CASE WHEN $2 = 'done' AND status <> 'done' THEN now() WHEN $2 <> 'done' THEN NULL ELSE done_at END
      WHERE id = $1 RETURNING *`,
    [+req.params.id || 0, status]);
  if (!row) return res.status(404).json({ error: 'not_found', message: 'Задача не найдена в perf.kontentferma' });
  res.json(pub(row));
}));

module.exports = r;
