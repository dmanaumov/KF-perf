require('dotenv').config();

const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));

module.exports = {
  port: int(process.env.PORT, 3000),
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
  databaseUrl: process.env.DATABASE_URL || '',
  // Ключ шифрования токенов рекламных кабинетов в БД. Обязателен в проде;
  // смена ключа = все сохранённые креды придётся ввести заново.
  appSecret: process.env.APP_SECRET || '',

  // --- Вход команды через Mattermost (как в KF-media-mon / KF Approval) ---
  mattermostUrl: (process.env.MATTERMOST_URL || '').replace(/\/+$/, ''),
  adminEmails: list(process.env.ADMIN_EMAILS).map((s) => s.toLowerCase()),
  adminLogins: list(process.env.ADMIN_LOGINS).map((s) => s.toLowerCase()),
  // Аварийный локальный вход (логин "admin"), если Mattermost недоступен.
  localAdminPassword: process.env.LOCAL_ADMIN_PASSWORD || '',
  sessionTtlHours: int(process.env.SESSION_TTL_HOURS, 24 * 7),
  cookieSecure: bool(process.env.COOKIE_SECURE, false),

  // --- Синхронизация ---
  schedulerEnabled: bool(process.env.SCHEDULER_ENABLED, true),
  syncIntervalHours: int(process.env.SYNC_INTERVAL_HOURS, 6),
  syncLookbackDays: int(process.env.SYNC_LOOKBACK_DAYS, 7),
  syncInitialDays: int(process.env.SYNC_INITIAL_DAYS, 90),
  seoIntervalHours: int(process.env.SEO_INTERVAL_HOURS, 24),
  seoDepth: int(process.env.SEO_DEPTH, 50),
  geoIntervalDays: int(process.env.GEO_INTERVAL_DAYS, 7),
  automationApiKey: process.env.AUTOMATION_API_KEY || '',

  // --- Глобальные ключи сервисов ---
  yandexSearchApiKey: process.env.YANDEX_SEARCH_API_KEY || '',
  yandexSearchFolderId: process.env.YANDEX_SEARCH_FOLDER_ID || '',
  googleAds: {
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    clientId: process.env.GOOGLE_ADS_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
    apiVersion: process.env.GOOGLE_ADS_API_VERSION || 'v21',
  },
  metaApiVersion: process.env.META_API_VERSION || 'v21.0',

  // --- GEO: AI-движки. Движок активен, если задан ключ. ---
  ai: {
    openai: { key: process.env.OPENAI_API_KEY || '', model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', webSearch: bool(process.env.OPENAI_WEB_SEARCH, true) },
    anthropic: { key: process.env.ANTHROPIC_API_KEY || '', model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5', webSearch: bool(process.env.ANTHROPIC_WEB_SEARCH, true) },
    gemini: { key: process.env.GEMINI_API_KEY || '', model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', webSearch: bool(process.env.GEMINI_WEB_SEARCH, true) },
    perplexity: { key: process.env.PERPLEXITY_API_KEY || '', model: process.env.PERPLEXITY_MODEL || 'sonar' },
    deepseek: { key: process.env.DEEPSEEK_API_KEY || '', model: process.env.DEEPSEEK_MODEL || 'deepseek-chat' },
    yandexgpt: {
      key: process.env.YANDEXGPT_API_KEY || process.env.YANDEX_SEARCH_API_KEY || '',
      folderId: process.env.YANDEXGPT_FOLDER_ID || process.env.YANDEX_SEARCH_FOLDER_ID || '',
      model: process.env.YANDEXGPT_MODEL || 'yandexgpt/latest',
    },
  },

  seedDemo: bool(process.env.SEED_DEMO, false),
  requestTimeoutMs: int(process.env.REQUEST_TIMEOUT_MS, 60000),
};
