// Настройки сервисов, которыми управляет лидер Performance из интерфейса
// (раздел «Сервисы и ключи»): общие ключи Google Ads, Yandex Search API,
// AI-движки для GEO, интервалы обновления. Хранятся в БД (секреты — зашифрованы).
// Порядок поиска значения: БД → переменная окружения с тем же именем → значение по умолчанию.
const db = require('./db');
const secrets = require('./secrets');

const GROUPS = [
  { id: 'seo', label: 'SEO — Yandex Search API', help: 'Съём позиций в Яндексе. Ключ сервисного аккаунта Yandex Cloud с ролью search-api.webSearch.user (можно тот же, что в PR-мониторинге).' },
  { id: 'google', label: 'Google Ads — общие доступы агентства', help: 'Developer token из MCC агентства и OAuth-клиент из Google Cloud Console. Refresh token и Customer ID клиента вводятся в проекте при подключении канала.' },
  { id: 'meta', label: 'Meta / Instagram', help: 'Токены рекламных аккаунтов вводятся в проекте. Здесь — только версия Graph API.' },
  { id: 'ai', label: 'GEO — AI-движки', help: 'Движок участвует в проверках, если задан его ключ. Веб-поиск — ответы ближе к тому, что видит пользователь, но дороже.' },
  { id: 'schedule', label: 'Автообновление', help: 'Как часто портал сам обновляет данные.' },
];

const FIELDS = [
  { key: 'YANDEX_SEARCH_API_KEY', group: 'seo', label: 'API-ключ', secret: true },
  { key: 'YANDEX_SEARCH_FOLDER_ID', group: 'seo', label: 'ID каталога (folder id)' },
  { key: 'SEO_DEPTH', group: 'seo', label: 'Глубина проверки, позиций', type: 'int', def: 50 },

  { key: 'GOOGLE_ADS_DEVELOPER_TOKEN', group: 'google', label: 'Developer token', secret: true },
  { key: 'GOOGLE_ADS_CLIENT_ID', group: 'google', label: 'OAuth Client ID' },
  { key: 'GOOGLE_ADS_CLIENT_SECRET', group: 'google', label: 'OAuth Client secret', secret: true },
  { key: 'GOOGLE_ADS_API_VERSION', group: 'google', label: 'Версия API', def: 'v21' },

  { key: 'META_API_VERSION', group: 'meta', label: 'Версия Graph API', def: 'v21.0' },

  { key: 'OPENAI_API_KEY', group: 'ai', engine: 'openai', label: 'ChatGPT (OpenAI) — ключ', secret: true },
  { key: 'OPENAI_MODEL', group: 'ai', engine: 'openai', label: 'модель', def: 'gpt-4.1-mini' },
  { key: 'OPENAI_WEB_SEARCH', group: 'ai', engine: 'openai', label: 'веб-поиск', type: 'bool', def: true },
  { key: 'PERPLEXITY_API_KEY', group: 'ai', engine: 'perplexity', label: 'Perplexity — ключ', secret: true },
  { key: 'PERPLEXITY_MODEL', group: 'ai', engine: 'perplexity', label: 'модель', def: 'sonar' },
  { key: 'GEMINI_API_KEY', group: 'ai', engine: 'gemini', label: 'Gemini — ключ', secret: true },
  { key: 'GEMINI_MODEL', group: 'ai', engine: 'gemini', label: 'модель', def: 'gemini-2.5-flash' },
  { key: 'GEMINI_WEB_SEARCH', group: 'ai', engine: 'gemini', label: 'веб-поиск', type: 'bool', def: true },
  { key: 'ANTHROPIC_API_KEY', group: 'ai', engine: 'anthropic', label: 'Claude (Anthropic) — ключ', secret: true },
  { key: 'ANTHROPIC_MODEL', group: 'ai', engine: 'anthropic', label: 'модель', def: 'claude-sonnet-4-5' },
  { key: 'ANTHROPIC_WEB_SEARCH', group: 'ai', engine: 'anthropic', label: 'веб-поиск', type: 'bool', def: true },
  { key: 'DEEPSEEK_API_KEY', group: 'ai', engine: 'deepseek', label: 'DeepSeek — ключ', secret: true },
  { key: 'DEEPSEEK_MODEL', group: 'ai', engine: 'deepseek', label: 'модель', def: 'deepseek-chat' },
  { key: 'YANDEXGPT_API_KEY', group: 'ai', engine: 'yandexgpt', label: 'YandexGPT — ключ', secret: true, help: 'пусто — берётся ключ Yandex Search API (нужна роль ai.languageModels.user)' },
  { key: 'YANDEXGPT_FOLDER_ID', group: 'ai', engine: 'yandexgpt', label: 'ID каталога', help: 'пусто — как у Yandex Search API' },
  { key: 'YANDEXGPT_MODEL', group: 'ai', engine: 'yandexgpt', label: 'модель', def: 'yandexgpt/latest' },

  { key: 'SYNC_INTERVAL_HOURS', group: 'schedule', label: 'Реклама и Метрика — раз в, часов', type: 'int', def: 6 },
  { key: 'SYNC_LOOKBACK_DAYS', group: 'schedule', label: 'Перезаписывать последние, дней', type: 'int', def: 7 },
  { key: 'SYNC_INITIAL_DAYS', group: 'schedule', label: 'Первая загрузка канала, дней', type: 'int', def: 90 },
  { key: 'SEO_INTERVAL_HOURS', group: 'schedule', label: 'SEO-позиции — раз в, часов', type: 'int', def: 24 },
  { key: 'GEO_INTERVAL_DAYS', group: 'schedule', label: 'GEO-проверки — раз в, дней', type: 'int', def: 7 },
];
const BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

let cache = new Map(); // key -> { value, updated_at, updated_by }

async function load() {
  const rows = await db.all('SELECT key, value_enc, updated_at, updated_by FROM app_settings');
  const next = new Map();
  for (const r of rows) {
    try {
      next.set(r.key, { value: secrets.decrypt(r.value_enc).v, updated_at: r.updated_at, updated_by: r.updated_by });
    } catch (err) {
      console.error(`[settings] не удалось расшифровать ${r.key} — APP_SECRET менялся?`);
    }
  }
  cache = next;
}

function cast(f, v) {
  if (f.type === 'int') { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : f.def; }
  if (f.type === 'bool') return typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
  return String(v);
}

function source(key) {
  const c = cache.get(key);
  if (c && c.value !== '' && c.value !== null && c.value !== undefined) return 'db';
  if (process.env[key] !== undefined && process.env[key] !== '') return 'env';
  return 'default';
}

function get(key) {
  const f = BY_KEY[key];
  const src = source(key);
  const raw = src === 'db' ? cache.get(key).value : src === 'env' ? process.env[key] : f ? f.def : undefined;
  if (raw === undefined || raw === null || raw === '') return f && f.def !== undefined ? f.def : '';
  return f ? cast(f, raw) : raw;
}

// values: { KEY: value | null }. null — удалить (вернуться к env/умолчанию);
// пустая строка у секрета — «не менять».
async function save(values, userId) {
  for (const [key, val] of Object.entries(values || {})) {
    const f = BY_KEY[key];
    if (!f) continue;
    if (val === null) {
      await db.q('DELETE FROM app_settings WHERE key=$1', [key]);
      continue;
    }
    const v = typeof val === 'string' ? val.trim() : val;
    if (v === '' && f.secret) continue;
    if (v === '' || v === undefined) {
      await db.q('DELETE FROM app_settings WHERE key=$1', [key]);
      continue;
    }
    await db.q(
      `INSERT INTO app_settings (key, value_enc, updated_by, updated_at) VALUES ($1,$2,$3, now())
       ON CONFLICT (key) DO UPDATE SET value_enc=EXCLUDED.value_enc, updated_by=EXCLUDED.updated_by, updated_at=now()`,
      [key, secrets.encrypt({ v: cast(f, v) }), userId]
    );
  }
  await load();
}

function mask(v) {
  const s = String(v || '');
  return s.length <= 8 ? '••••' : `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

// Для UI: секреты не отдаём, только «задан / откуда / маска».
function describe() {
  return {
    groups: GROUPS,
    fields: FIELDS.map((f) => {
      const src = source(f.key);
      const c = cache.get(f.key);
      return {
        ...f,
        source: src,
        isSet: src !== 'default',
        value: f.secret ? null : get(f.key),
        masked: f.secret && src !== 'default' ? mask(src === 'db' ? c.value : process.env[f.key]) : null,
        updated_at: c ? c.updated_at : null,
      };
    }),
  };
}

// Сводные геттеры для модулей
const S = {
  yandexSearch: () => ({ key: get('YANDEX_SEARCH_API_KEY'), folderId: get('YANDEX_SEARCH_FOLDER_ID'), depth: get('SEO_DEPTH') }),
  googleAds: () => ({ developerToken: get('GOOGLE_ADS_DEVELOPER_TOKEN'), clientId: get('GOOGLE_ADS_CLIENT_ID'), clientSecret: get('GOOGLE_ADS_CLIENT_SECRET'), apiVersion: get('GOOGLE_ADS_API_VERSION') }),
  metaApiVersion: () => get('META_API_VERSION'),
  ai: (engine) => {
    const P = engine.toUpperCase();
    if (engine === 'yandexgpt') {
      return { key: get('YANDEXGPT_API_KEY') || get('YANDEX_SEARCH_API_KEY'), folderId: get('YANDEXGPT_FOLDER_ID') || get('YANDEX_SEARCH_FOLDER_ID'), model: get('YANDEXGPT_MODEL') };
    }
    return { key: get(`${P}_API_KEY`), model: get(`${P}_MODEL`), webSearch: BY_KEY[`${P}_WEB_SEARCH`] ? get(`${P}_WEB_SEARCH`) : false };
  },
  schedule: () => ({
    syncIntervalHours: get('SYNC_INTERVAL_HOURS'), syncLookbackDays: get('SYNC_LOOKBACK_DAYS'), syncInitialDays: get('SYNC_INITIAL_DAYS'),
    seoIntervalHours: get('SEO_INTERVAL_HOURS'), geoIntervalDays: get('GEO_INTERVAL_DAYS'),
  }),
};

module.exports = { load, get, save, describe, ...S };
