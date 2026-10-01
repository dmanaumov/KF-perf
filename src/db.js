const { Pool, types } = require('pg');
const config = require('./config');

// numeric → JS number, date → 'YYYY-MM-DD' строкой (без сдвигов часового пояса)
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
types.setTypeParser(1082, (v) => v);

const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'specialist',      -- admin | lead | specialist
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  client_name TEXT,
  site_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',        -- active | paused | archived
  kpi_type TEXT NOT NULL DEFAULT 'leads',       -- leads | sales | traffic
  currency TEXT NOT NULL DEFAULT 'RUB',
  manager_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  brand_terms TEXT[] NOT NULL DEFAULT '{}',     -- как бренд может называться в ответах AI / выдаче
  competitors TEXT[] NOT NULL DEFAULT '{}',
  services TEXT[] NOT NULL DEFAULT '{}',        -- ads | seo | geo
  notes TEXT,
  client_token TEXT UNIQUE,
  client_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

-- План на месяц: platform = '' — по проекту в целом
CREATE TABLE IF NOT EXISTS plans (
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  platform TEXT NOT NULL DEFAULT '',
  budget NUMERIC,
  leads NUMERIC,
  cpl_target NUMERIC,
  revenue NUMERIC,
  PRIMARY KEY (project_id, month, platform)
);

CREATE TABLE IF NOT EXISTS integrations (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  title TEXT,
  credentials_enc TEXT,
  settings JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'never',         -- never | ok | error | manual
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stats_daily (
  integration_id INT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  date DATE NOT NULL,
  campaign_id TEXT NOT NULL DEFAULT '',
  campaign_name TEXT,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  spend NUMERIC NOT NULL DEFAULT 0,
  leads NUMERIC NOT NULL DEFAULT 0,
  revenue NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (integration_id, date, campaign_id)
);
CREATE INDEX IF NOT EXISTS stats_daily_project_date ON stats_daily (project_id, date);

CREATE TABLE IF NOT EXISTS sync_runs (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL,                           -- ads | seo | geo
  integration_id INT REFERENCES integrations(id) ON DELETE CASCADE,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  rows INT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  area TEXT NOT NULL DEFAULT 'ads',             -- ads | seo | geo | analytics | creative | other
  platform TEXT,
  type TEXT NOT NULL DEFAULT 'task',            -- task | hypothesis | report
  status TEXT NOT NULL DEFAULT 'todo',          -- backlog | todo | in_progress | review | done
  priority TEXT NOT NULL DEFAULT 'normal',      -- low | normal | high
  assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  due_date DATE,
  client_visible BOOLEAN NOT NULL DEFAULT true,
  result TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tasks_project ON tasks (project_id, status);

-- Журнал изменений: что меняли в кампаниях/на сайте — основа прозрачности для клиента
CREATE TABLE IF NOT EXISTS changelog (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  area TEXT NOT NULL DEFAULT 'ads',
  platform TEXT,
  text TEXT NOT NULL,
  client_visible BOOLEAN NOT NULL DEFAULT true,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS changelog_project ON changelog (project_id, date DESC);

CREATE TABLE IF NOT EXISTS seo_keywords (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  engine TEXT NOT NULL DEFAULT 'yandex',        -- yandex | google
  region INT NOT NULL DEFAULT 213,              -- код региона Яндекса (213 — Москва)
  target_url TEXT,
  group_name TEXT,
  frequency INT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, keyword, engine, region)
);

CREATE TABLE IF NOT EXISTS seo_positions (
  keyword_id INT NOT NULL REFERENCES seo_keywords(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  position INT,                                 -- NULL = нет в пределах глубины проверки
  found_url TEXT,
  PRIMARY KEY (keyword_id, date)
);

CREATE TABLE IF NOT EXISTS geo_prompts (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  topic TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS geo_checks (
  id SERIAL PRIMARY KEY,
  prompt_id INT NOT NULL REFERENCES geo_prompts(id) ON DELETE CASCADE,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  engine TEXT NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  mentioned BOOLEAN NOT NULL DEFAULT false,
  cited BOOLEAN NOT NULL DEFAULT false,         -- сайт клиента в источниках/ссылках
  rank INT,                                     -- место бренда среди упомянутых брендов
  competitors TEXT[] NOT NULL DEFAULT '{}',
  sources TEXT[] NOT NULL DEFAULT '{}',
  answer TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS geo_checks_project ON geo_checks (project_id, checked_at DESC);
`;

async function init() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL не задан');
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (err) {
      if (attempt >= 30) throw err;
      console.log(`[db] жду Postgres (${attempt}): ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await pool.query(SCHEMA);
}

const q = (text, params) => pool.query(text, params);
const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;
const all = async (text, params) => (await pool.query(text, params)).rows;

module.exports = { pool, init, q, one, all };
