const crypto = require('crypto');
const config = require('./config');
const db = require('./db');
const { json } = require('./http');

const COOKIE = 'perf_session';

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isAdminIdentity(u) {
  const email = String(u.email || '').toLowerCase();
  const login = String(u.username || '').toLowerCase();
  return (email && config.adminEmails.includes(email)) || (login && config.adminLogins.includes(login));
}

async function mattermostLogin(loginId, password) {
  if (!config.mattermostUrl) throw new Error('MATTERMOST_URL не задан');
  const user = await json(`${config.mattermostUrl}/api/v4/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login_id: loginId, password }),
    timeoutMs: 15000,
  }).catch((err) => {
    throw new Error(err.status === 401 ? 'Неверный логин или пароль Mattermost' : err.message);
  });
  if (!user || !user.id) throw new Error('Mattermost вернул неожиданный ответ');
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.nickname || user.username,
  };
}

async function upsertUser(u) {
  const count = (await db.one('SELECT count(*)::int AS n FROM users')).n;
  // Первый вошедший пользователь становится админом, если список админов пуст.
  const bootstrapAdmin = count === 0 && !config.adminEmails.length && !config.adminLogins.length;
  const row = await db.one(
    `INSERT INTO users (id, username, email, name, role, last_login_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username, email=EXCLUDED.email, name=EXCLUDED.name, last_login_at=now()
     RETURNING *`,
    [u.id, u.username, u.email || null, u.name || u.username, isAdminIdentity(u) || bootstrapAdmin || u.forceAdmin ? 'admin' : 'specialist']
  );
  if ((isAdminIdentity(u) || u.forceAdmin) && row.role !== 'admin') {
    await db.q("UPDATE users SET role='admin' WHERE id=$1", [row.id]);
    row.role = 'admin';
  }
  return row;
}

async function login(loginId, password) {
  if (config.localAdminPassword && loginId === 'admin') {
    const a = Buffer.from(String(password));
    const b = Buffer.from(config.localAdminPassword);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return upsertUser({ id: 'local:admin', username: 'admin', name: 'Администратор', forceAdmin: true });
    }
    if (!config.mattermostUrl) throw new Error('Неверный пароль');
  }
  return upsertUser(await mattermostLogin(loginId, password));
}

async function createSession(res, user) {
  const id = crypto.randomBytes(24).toString('base64url');
  const ttl = config.sessionTtlHours * 3600;
  await db.q("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1,$2, now() + ($3 || ' seconds')::interval)", [id, user.id, String(ttl)]);
  res.setHeader('Set-Cookie', `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}${config.cookieSecure ? '; Secure' : ''}`);
}

async function destroySession(req, res) {
  const id = parseCookies(req)[COOKIE];
  if (id) await db.q('DELETE FROM sessions WHERE id=$1', [id]);
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

async function currentUser(req) {
  const id = parseCookies(req)[COOKIE];
  if (!id) return null;
  return db.one(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id=$1 AND s.expires_at > now()`,
    [id]
  );
}

function requireUser(req, res, next) {
  currentUser(req)
    .then((u) => {
      if (!u) return res.status(401).json({ error: 'not_logged_in' });
      req.user = u;
      next();
    })
    .catch(next);
}

function requireRole(...roles) {
  return (req, res, next) => (roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'forbidden', message: 'Недостаточно прав' }));
}

// Доступ к проекту: admin/lead — ко всем; specialist — если менеджер или участник.
async function canAccessProject(user, projectId) {
  if (user.role === 'admin' || user.role === 'lead') return true;
  const r = await db.one(
    `SELECT 1 FROM projects p WHERE p.id=$1 AND (p.manager_id=$2 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$2))`,
    [projectId, user.id]
  );
  return !!r;
}

function projectFilterSql(user, alias = 'p', paramIndex = 1) {
  if (user.role === 'admin' || user.role === 'lead') return { sql: 'TRUE', params: [] };
  return {
    sql: `(${alias}.manager_id = $${paramIndex} OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=${alias}.id AND m.user_id=$${paramIndex}))`,
    params: [user.id],
  };
}

async function cleanup() {
  await db.q('DELETE FROM sessions WHERE expires_at < now()');
}

module.exports = { login, createSession, destroySession, currentUser, requireUser, requireRole, canAccessProject, projectFilterSql, cleanup };
