// Каталог площадок. kind: ads — рекламный расход (идёт в бюджет/CPL),
// analytics — аналитика (визиты, цели; в бюджет не суммируется).
// sync: api — есть коннектор; manual — ручной ввод / CSV-импорт.
const PLATFORMS = [
  { id: 'yandex_direct', label: 'Яндекс Директ', short: 'Директ', kind: 'ads', sync: 'api', color: '#ffcc00' },
  { id: 'google_ads', label: 'Google Ads', short: 'Google', kind: 'ads', sync: 'api', color: '#4285f4' },
  { id: 'vk_ads', label: 'VK Реклама', short: 'VK', kind: 'ads', sync: 'api', color: '#0077ff' },
  { id: 'meta', label: 'Instagram / Meta', short: 'Instagram', kind: 'ads', sync: 'api', color: '#e1306c' },
  { id: 'telegram_ads', label: 'Telegram Ads', short: 'Telegram', kind: 'ads', sync: 'manual', color: '#27a7e7' },
  { id: 'avito', label: 'Авито', short: 'Авито', kind: 'ads', sync: 'manual', color: '#00aaff' },
  { id: 'twogis', label: '2ГИС', short: '2ГИС', kind: 'ads', sync: 'manual', color: '#19aa1e' },
  { id: 'yandex_maps', label: 'Яндекс Бизнес / Карты', short: 'Я.Бизнес', kind: 'ads', sync: 'manual', color: '#fc3f1d' },
  { id: 'ozon', label: 'Ozon', short: 'Ozon', kind: 'ads', sync: 'manual', color: '#005bff' },
  { id: 'wb', label: 'Wildberries', short: 'WB', kind: 'ads', sync: 'manual', color: '#cb11ab' },
  { id: 'other', label: 'Другое', short: 'Другое', kind: 'ads', sync: 'manual', color: '#8a9a99' },
  { id: 'metrika', label: 'Яндекс Метрика', short: 'Метрика', kind: 'analytics', sync: 'api', color: '#ff3333' },
];

const BY_ID = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));
const AD_PLATFORMS = PLATFORMS.filter((p) => p.kind === 'ads').map((p) => p.id);

// Домены AI-сервисов — для подсчёта AI-трафика из Метрики (GEO).
const AI_REFERRERS = {
  'chatgpt.com': 'ChatGPT', 'chat.openai.com': 'ChatGPT',
  'perplexity.ai': 'Perplexity', 'www.perplexity.ai': 'Perplexity',
  'gemini.google.com': 'Gemini', 'claude.ai': 'Claude',
  'copilot.microsoft.com': 'Copilot', 'chat.deepseek.com': 'DeepSeek',
  'alice.yandex.ru': 'Алиса', 'giga.chat': 'GigaChat', 'grok.com': 'Grok',
};

const AREAS = [
  { id: 'ads', label: 'Реклама' },
  { id: 'seo', label: 'SEO' },
  { id: 'geo', label: 'GEO / AI' },
  { id: 'analytics', label: 'Аналитика' },
  { id: 'creative', label: 'Креативы' },
  { id: 'other', label: 'Прочее' },
];

const TASK_STATUSES = [
  { id: 'backlog', label: 'Бэклог' },
  { id: 'todo', label: 'К работе' },
  { id: 'in_progress', label: 'В работе' },
  { id: 'review', label: 'На проверке' },
  { id: 'done', label: 'Готово' },
];

module.exports = { PLATFORMS, BY_ID, AD_PLATFORMS, AI_REFERRERS, AREAS, TASK_STATUSES };
