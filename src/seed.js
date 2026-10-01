// Демо-данные: заполняет пустую БД правдоподобными проектами, чтобы портал
// можно было показать до подключения кабинетов. SEED_DEMO=true или npm run seed:demo.
const db = require('./db');
const { today, addDays, monthStart } = require('./dates');

let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const around = (v, spread = 0.25) => v * (1 - spread + rnd() * spread * 2);

const PROJECTS = [
  {
    name: 'Клиника «Здоровье+»', client_name: 'ООО «Здоровье Плюс»', site_url: 'https://zdorovie-plus.example', services: ['ads', 'seo', 'geo'], kpi_type: 'leads',
    brand_terms: ['Здоровье+', 'Здоровье Плюс', 'zdorovie-plus'], competitors: ['СМ-Клиника|СМ Клиника', 'Медси', 'Семейная|Клиника Семейная', 'Чайка'],
    plan: { budget: 600000, leads: 520, cpl_target: 1150 },
    channels: [
      { platform: 'yandex_direct', title: 'Директ — агентский', daily: 13000, cpl: 1050, ctr: 4.2, cpc: 42, camps: ['Поиск | Терапевт', 'Поиск | Гинеколог', 'РСЯ | Ретаргетинг', 'Мастер кампаний | Чекап'] },
      { platform: 'vk_ads', title: 'VK Реклама', daily: 4200, cpl: 1500, ctr: 0.9, cpc: 28, camps: ['Лид-формы | Чекап 40+', 'Сообщество | Акции'] },
      { platform: 'yandex_maps', title: 'Яндекс Бизнес', daily: 1500, cpl: 900, ctr: 2.4, cpc: 22, camps: ['Приоритетное размещение'] },
      { platform: 'metrika', title: 'Метрика 9123456' },
    ],
    keywords: [['терапевт москва', 'Терапия'], ['записаться к терапевту', 'Терапия'], ['гинеколог платно', 'Гинекология'], ['узи малого таза цена', 'Диагностика'], ['чекап организма', 'Чекап'], ['анализы без очереди', 'Диагностика'], ['клиника рядом с метро', 'Бренд/гео'], ['мрт коленного сустава', 'Диагностика'], ['эндокринолог прием', 'Терапия'], ['справка 086у', 'Справки']],
    prompts: ['Какую частную клинику в Москве выбрать для чекапа?', 'Где сделать УЗИ малого таза недорого в Москве?', 'Посоветуй хорошего гинеколога в частной клинике Москвы', 'Лучшие многопрофильные клиники Москвы — рейтинг'],
  },
  {
    name: 'TeastyWine', client_name: 'TeastyWine', site_url: 'https://teastymenu.ru', services: ['ads', 'geo'], kpi_type: 'sales',
    brand_terms: ['TeastyWine', 'Тейсти Вайн', 'teastymenu'], competitors: ['Фанагория', 'Шато Тамань|Тамань', 'Абрау-Дюрсо|Абрау'],
    plan: { budget: 180000, leads: 160, cpl_target: 1100, revenue: 640000 },
    channels: [
      { platform: 'meta', title: 'Instagram — рекламный аккаунт', daily: 3600, cpl: 980, ctr: 1.3, cpc: 19, camps: ['Reels | Дегустационный сет', 'Сторис | Плодовые вина', 'Ретаргет | Корзина'], aov: 4200 },
      { platform: 'telegram_ads', title: 'Telegram Ads (CSV)', daily: 1600, cpl: 1400, ctr: 0.7, cpc: 35, camps: ['Каналы о вине', 'Гастро-каналы'], aov: 3900 },
      { platform: 'ozon', title: 'Ozon Продвижение', daily: 900, cpl: 600, ctr: 3.1, cpc: 12, camps: ['Трафареты', 'Поиск'], aov: 2800 },
    ],
    prompts: ['Какое российское плодовое вино попробовать?', 'Посоветуй крафтовое вино из ягод в подарок', 'Где купить клубничное вино в Москве?'],
  },
  {
    name: 'СтройДом', client_name: 'ГК «СтройДом»', site_url: 'https://stroydom.example', services: ['ads', 'seo'], kpi_type: 'leads',
    brand_terms: ['СтройДом'], competitors: ['Теремъ', 'Альпиль', 'ДомаПро'],
    plan: { budget: 900000, leads: 210, cpl_target: 4000 },
    channels: [
      { platform: 'yandex_direct', title: 'Директ', daily: 19000, cpl: 3600, ctr: 3.6, cpc: 78, camps: ['Поиск | Дома из бруса', 'Поиск | Каркасные дома', 'РСЯ | Проекты домов', 'Товарная | Каталог'] },
      { platform: 'google_ads', title: 'Google Ads', daily: 3000, cpl: 4800, ctr: 3.0, cpc: 64, camps: ['Search | Дом под ключ'] },
      { platform: 'avito', title: 'Авито', daily: 4500, cpl: 3900, ctr: 1.8, cpc: 31, camps: ['Объявления | Дома', 'Объявления | Бани'] },
      { platform: 'twogis', title: '2ГИС', daily: 1100, cpl: 5200, ctr: 1.2, cpc: 26, camps: ['Реклама в справочнике'] },
      { platform: 'metrika', title: 'Метрика 8877665' },
    ],
    keywords: [['дом из бруса под ключ', 'Брус'], ['каркасный дом цена', 'Каркас'], ['строительство домов московская область', 'Общие'], ['проекты домов', 'Общие'], ['баня под ключ', 'Бани'], ['дом из клееного бруса', 'Брус'], ['каркасный дом в ипотеку', 'Каркас'], ['фундамент на винтовых сваях', 'Фундамент']],
  },
  {
    name: 'Контент Ферма — собственный маркетинг', client_name: 'Контент Ферма', site_url: 'https://kontentferma.com', services: ['ads', 'seo', 'geo'], kpi_type: 'leads',
    brand_terms: ['Контент Ферма', 'КонтентФерма', 'Content Farm', 'kontentferma'], competitors: ['Ingate', 'Риалвеб|Realweb', 'Аспектус|Aspectus', 'SMM.agency'],
    plan: { budget: 120000, leads: 40, cpl_target: 3000 },
    channels: [
      { platform: 'yandex_direct', title: 'Директ', daily: 2800, cpl: 2700, ctr: 2.9, cpc: 95, camps: ['Поиск | SMM-агентство', 'Поиск | PR-агентство', 'РСЯ | Кейсы'] },
      { platform: 'telegram_ads', title: 'Telegram Ads', daily: 1200, cpl: 4100, ctr: 0.6, cpc: 41, camps: ['Каналы о маркетинге'] },
      { platform: 'metrika', title: 'Метрика КФ' },
    ],
    keywords: [['smm агентство москва', 'SMM'], ['продвижение в соцсетях заказать', 'SMM'], ['pr агентство', 'PR'], ['пиар агентство москва', 'PR'], ['видеопродакшн для бизнеса', 'Видео'], ['агентство полного цикла', 'Общие']],
    prompts: ['Какое SMM-агентство полного цикла выбрать в Москве?', 'Посоветуй PR-агентство для B2B-компании', 'Агентства, которые делают SMM, PR и видео под ключ', 'Лучшие маркетинговые агентства в Алматы'],
  },
];

const TASKS = [
  ['Запустить A/B креативов в РСЯ', 'ads', 'yandex_direct', 'hypothesis', 'in_progress', 'high', 3],
  ['Перераспределить бюджет с VK на Поиск', 'ads', null, 'task', 'todo', 'normal', 5],
  ['Подключить офлайн-конверсии из CRM', 'analytics', null, 'task', 'backlog', 'normal', 20],
  ['Еженедельный отчёт клиенту', 'ads', null, 'report', 'todo', 'normal', 2],
  ['Новые лид-формы с квизом', 'creative', 'vk_ads', 'hypothesis', 'review', 'normal', -1],
  ['Минус-слова по поисковым запросам', 'ads', 'yandex_direct', 'task', 'done', 'low', -6],
  ['Оптимизировать title/description категорий', 'seo', null, 'task', 'in_progress', 'normal', 7],
  ['Собрать семантику под новый раздел', 'seo', null, 'task', 'todo', 'normal', 12],
  ['Разметка Schema.org Organization + FAQ', 'geo', null, 'task', 'todo', 'high', 6],
  ['Статья-сравнение для цитирования AI', 'geo', null, 'hypothesis', 'backlog', 'normal', 25],
  ['Карточка в Яндекс Бизнесе: отзывы и фото', 'geo', 'yandex_maps', 'task', 'done', 'normal', -10],
];
const LOG = [
  [-2, 'ads', 'yandex_direct', 'Подняли ставки на «Поиск | Терапевт» на 15% — кампания упиралась в бюджет'],
  [-5, 'ads', 'vk_ads', 'Отключили 3 креатива с CTR < 0,4%'],
  [-9, 'seo', null, 'Обновили мета-теги 24 страниц каталога'],
  [-12, 'ads', null, 'Сменили стратегию на «Оплата за конверсии» в РСЯ'],
  [-16, 'geo', null, 'Опубликовали FAQ-блоки и llms.txt на сайте'],
];

async function seedAll() {
  const d = today();
  const admin = await db.one("SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1");
  for (const pd of PROJECTS) {
    const p = await db.one(
      `INSERT INTO projects (name, client_name, site_url, services, kpi_type, brand_terms, competitors, manager_id, client_token, client_enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, md5(random()::text), true) RETURNING id`,
      [pd.name, pd.client_name, pd.site_url, pd.services, pd.kpi_type, pd.brand_terms, pd.competitors, admin && admin.id]
    );
    let month = monthStart(d);
    for (let m = 0; m < 4; m++, month = monthStart(addDays(month, -1))) {
      await db.q('INSERT INTO plans (project_id, month, platform, budget, leads, cpl_target, revenue) VALUES ($1,$2,\'\',$3,$4,$5,$6) ON CONFLICT DO NOTHING',
        [p.id, month, pd.plan.budget, pd.plan.leads, pd.plan.cpl_target, pd.plan.revenue || null]);
    }
    for (const ch of pd.channels) {
      const api = ['yandex_direct', 'google_ads', 'vk_ads', 'meta', 'metrika'].includes(ch.platform);
      const i = await db.one(`INSERT INTO integrations (project_id, platform, title, status, last_sync_at, settings) VALUES ($1,$2,$3,$4, now() - interval '2 hours', '{"demo":true}') RETURNING id`,
        [p.id, ch.platform, ch.title + ' (демо)', api ? 'ok' : 'manual']);
      if (ch.platform === 'metrika') {
        const srcs = [['organic', 'Поисковые системы', 420], ['ad', 'Реклама', 610], ['direct', 'Прямые заходы', 160], ['referral', 'Ссылки на сайтах', 40], ['social', 'Соцсети', 70]];
        for (let k = 0; k < 90; k++) {
          const date = addDays(d, -89 + k);
          const growth = 1 + k / 300;
          for (const [id, name, base] of srcs) {
            const v = Math.round(around(base * (id === 'organic' ? growth : 1)));
            await db.q(`INSERT INTO stats_daily (integration_id, project_id, platform, date, campaign_id, campaign_name, clicks, leads) VALUES ($1,$2,'metrika',$3,$4,$5,$6,$7)`,
              [i.id, p.id, date, 'src:' + id, name, v, Math.round(v * 0.02)]);
          }
          for (const [name, base] of [['ChatGPT', 6], ['Perplexity', 2], ['Алиса', 3]]) {
            const v = Math.round(around(base * (1 + k / 60), 0.6));
            if (v) await db.q(`INSERT INTO stats_daily (integration_id, project_id, platform, date, campaign_id, campaign_name, clicks, leads) VALUES ($1,$2,'metrika',$3,$4,$5,$6,$7)`,
              [i.id, p.id, date, 'ai:' + name, name, v, rnd() < 0.15 ? 1 : 0]);
          }
        }
        continue;
      }
      const share = ch.camps.map(() => 0.5 + rnd());
      const sum = share.reduce((a, b) => a + b, 0);
      for (let k = 0; k < 90; k++) {
        const date = addDays(d, -89 + k);
        const dow = new Date(date + 'T00:00:00Z').getUTCDay();
        const weekend = dow === 0 || dow === 6 ? 0.8 : 1;
        // в последние 3 недели у одного канала растёт CPL — чтобы алерты было видно
        const drift = k > 70 && ch.platform === 'vk_ads' ? 1.35 : 1;
        for (let c = 0; c < ch.camps.length; c++) {
          const spend = around(ch.daily * weekend * share[c] / sum);
          const clicks = Math.round(spend / around(ch.cpc, 0.15));
          const impressions = Math.round(clicks / (around(ch.ctr, 0.2) / 100));
          const leads = Math.max(0, Math.round(spend / around(ch.cpl * drift, 0.35)));
          const revenue = ch.aov ? leads * around(ch.aov, 0.3) : 0;
          await db.q(`INSERT INTO stats_daily (integration_id, project_id, platform, date, campaign_id, campaign_name, impressions, clicks, spend, leads, revenue)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [i.id, p.id, ch.platform, date, 'c' + (c + 1), ch.camps[c], impressions, clicks, Math.round(spend), leads, Math.round(revenue)]);
        }
      }
    }
    for (const [title, area, platform, type, status, priority, due] of TASKS) {
      if (area === 'seo' && !pd.services.includes('seo')) continue;
      if (area === 'geo' && !pd.services.includes('geo')) continue;
      if (platform && !pd.channels.some((c) => c.platform === platform)) continue;
      await db.q(`INSERT INTO tasks (project_id, title, area, platform, type, status, priority, due_date, assignee_id, created_by, done_at, result)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9, CASE WHEN $6='done' THEN now() - interval '3 days' END, $10)`,
        [p.id, title, area, platform, type, status, priority, addDays(d, due), admin && admin.id, status === 'done' ? 'Сделано, эффект оцениваем через 2 недели' : null]);
    }
    for (const [off, area, platform, text] of LOG) {
      if ((area === 'seo' || area === 'geo') && !pd.services.includes(area)) continue;
      if (platform && !pd.channels.some((c) => c.platform === platform)) continue;
      await db.q('INSERT INTO changelog (project_id, date, area, platform, text, author_id) VALUES ($1,$2,$3,$4,$5,$6)', [p.id, addDays(d, off), area, platform, text, admin && admin.id]);
    }
    for (const [kw, group] of pd.keywords || []) {
      const k = await db.one('INSERT INTO seo_keywords (project_id, keyword, group_name, frequency) VALUES ($1,$2,$3,$4) RETURNING id', [p.id, kw, group, Math.round(around(2400, 0.8))]);
      let pos = Math.round(3 + rnd() * 40);
      for (let w = 0; w < 60; w += 3) {
        pos = Math.max(1, Math.round(pos + (rnd() - 0.62) * 5));
        const position = pos > 50 ? null : pos;
        await db.q('INSERT INTO seo_positions (keyword_id, date, position, found_url) VALUES ($1,$2,$3,$4)', [k.id, addDays(d, -59 + w), position, position ? pd.site_url + '/' : null]);
      }
    }
    const engines = ['openai', 'perplexity', 'gemini', 'yandexgpt', 'deepseek'];
    for (const prompt of pd.prompts || []) {
      const g = await db.one('INSERT INTO geo_prompts (project_id, prompt) VALUES ($1,$2) RETURNING id', [p.id, prompt]);
      for (let w = 6; w >= 0; w--) {
        for (const e of engines) {
          const chance = 0.25 + (6 - w) * 0.06 + (e === 'perplexity' ? 0.15 : 0);
          const mentioned = rnd() < chance;
          const comps = pd.competitors.filter(() => rnd() < 0.55).map((c) => c.split('|')[0]);
          const rank = mentioned ? 1 + Math.floor(rnd() * (comps.length + 1)) : null;
          const sources = ['vc.ru', 'yandex.ru/maps', 'prodoctorov.ru', 'otzovik.com', 'habr.com', 'tenchat.ru'].filter(() => rnd() < 0.4);
          if (mentioned && rnd() < 0.5) sources.push(new URL(pd.site_url).hostname);
          await db.q(`INSERT INTO geo_checks (prompt_id, project_id, engine, checked_at, mentioned, cited, rank, competitors, sources, answer)
            VALUES ($1,$2,$3, now() - ($4 || ' days')::interval, $5,$6,$7,$8,$9,$10)`,
            [g.id, p.id, e, String(w * 7 + 1), mentioned, sources.includes(new URL(pd.site_url).hostname), rank, comps, sources,
              `Демо-ответ. ${mentioned ? `Среди вариантов стоит рассмотреть ${pd.brand_terms[0]}` : 'Бренд в ответе не упомянут'}. ${comps.length ? 'Также упоминаются: ' + comps.join(', ') + '.' : ''}`]);
        }
      }
    }
    await db.q("INSERT INTO sync_runs (kind, project_id, status, finished_at, rows) VALUES ('seo',$1,'ok',now(),0), ('geo',$1,'ok',now(),0)", [p.id]);
  }
}

async function seedIfEmpty() {
  const n = (await db.one('SELECT count(*)::int AS n FROM projects')).n;
  if (n > 0) return false;
  console.log('[seed] пустая БД — заливаю демо-данные');
  await seedAll();
  return true;
}

module.exports = { seedIfEmpty };

if (require.main === module) {
  db.init().then(seedIfEmpty).then((done) => {
    console.log(done ? '[seed] готово' : '[seed] в БД уже есть проекты — пропускаю');
    process.exit(0);
  }).catch((err) => { console.error(err); process.exit(1); });
}
