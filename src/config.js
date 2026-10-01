require('dotenv').config();

// запятые/пробелы/;, кавычки вокруг значения (если в Dokploy вписали "…") игнорируем
const list = (v) => String(v || '').replace(/["']/g, '').split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
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
  // CEO_EMAILS — как в KF Approval: CEO тоже админ портала
  adminEmails: list([process.env.ADMIN_EMAILS, process.env.CEO_EMAILS].filter(Boolean).join(',')).map((s) => s.toLowerCase()),
  adminLogins: list(process.env.ADMIN_LOGINS).map((s) => s.toLowerCase()),
  mmSystemAdminsAreAdmins: bool(process.env.MM_SYSTEM_ADMINS_ARE_ADMINS, true),
  // Аварийный локальный вход (логин "admin"), если Mattermost недоступен.
  localAdminPassword: process.env.LOCAL_ADMIN_PASSWORD || '',
  sessionTtlHours: int(process.env.SESSION_TTL_HOURS, 24 * 7),
  cookieSecure: bool(process.env.COOKIE_SECURE, false),

  // Встроенный планировщик (интервалы и все ключи сервисов — в интерфейсе,
  // раздел «Сервисы и ключи», см. src/settings.js)
  schedulerEnabled: bool(process.env.SCHEDULER_ENABLED, true),
  automationApiKey: process.env.AUTOMATION_API_KEY || '',

  seedDemo: bool(process.env.SEED_DEMO, false),
  requestTimeoutMs: int(process.env.REQUEST_TIMEOUT_MS, 60000),
};
