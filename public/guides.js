/* Инструкции: где и как получить каждый ключ / доступ. Используются в
   «Сервисы и ключи», в окне подключения канала и на странице «Подключения». */
(function () {
  const G = {
    // ===================== Общие ключи агентства (раздел «Сервисы и ключи») =====================
    seo: {
      title: 'Yandex Search API — ключ и ID каталога',
      who: 'Лидер Performance, один раз на агентство',
      time: '10 минут',
      steps: [
        'Откройте <a href="https://console.yandex.cloud" target="_blank" rel="noopener">console.yandex.cloud</a> под аккаунтом агентства. Нет облака — создайте и привяжите платёжный аккаунт (Search API платный, оплата по запросам).',
        'Выберите каталог (например, <b>default</b>). Его <b>ID каталога</b> виден на главной странице каталога (строка вида <span class="code">b1g…</span>) — это поле «ID каталога».',
        'Слева «Сервисные аккаунты» (или «Identity and Access Management → Сервисные аккаунты») → <b>Создать</b>, имя например <span class="code">kf-perf</span>.',
        'Назначьте аккаунту роль <span class="code">search-api.webSearch.user</span>. Если тот же ключ будет работать и для YandexGPT (GEO) — добавьте роль <span class="code">ai.languageModels.user</span>.',
        'Откройте аккаунт → «Создать новый ключ» → <b>API-ключ</b>. Область действия: <span class="code">yc.search-api.execute</span> (и <span class="code">yc.ai.languageModels.execute</span>, если нужен YandexGPT).',
        'Скопируйте секрет ключа (показывается один раз) в поле «API-ключ», ID каталога — в «ID каталога». Сохранить → «Проверить».',
      ],
      notes: ['Если ключ уже есть в PR-мониторинге (KF-media-mon) — можно использовать его же.'],
      links: [['Документация Search API', 'https://yandex.cloud/ru/docs/search-api/quickstart/']],
    },
    google: {
      title: 'Google Ads — Developer token и OAuth-клиент агентства',
      who: 'Лидер Performance, один раз на агентство',
      time: '15 минут + одобрение developer token (1–3 дня)',
      steps: [
        '<b>Developer token.</b> Войдите в <b>управляющий аккаунт (MCC)</b> агентства в <a href="https://ads.google.com" target="_blank" rel="noopener">ads.google.com</a>. Нет MCC — создайте (бесплатно) и привяжите к нему клиентов.',
        'В MCC: «Инструменты и настройки» → «Настройка» → <b>Центр API</b>. Заполните форму и получите developer token. Для чтения статистики подайте заявку на <b>Basic access</b> (тестовый токен работает только с тестовыми аккаунтами).',
        '<b>OAuth-клиент.</b> Откройте <a href="https://console.cloud.google.com" target="_blank" rel="noopener">console.cloud.google.com</a>, создайте проект (например <span class="code">kf-perf</span>).',
        '«APIs & Services» → «Library» → найдите <b>Google Ads API</b> → Enable.',
        '«OAuth consent screen»: тип External, заполните название и email, добавьте scope <span class="code">https://www.googleapis.com/auth/adwords</span>. Затем нажмите <b>Publish app</b> (статус «In production») — в режиме Testing refresh token умирает через 7 дней.',
        '«Credentials» → «Create credentials» → <b>OAuth client ID</b> → тип <b>Web application</b>. В «Authorized redirect URIs» добавьте <span class="code">https://developers.google.com/oauthplayground</span>.',
        'Скопируйте <b>Client ID</b> и <b>Client secret</b> в поля раздела, developer token — в «Developer token». Сохранить.',
      ],
      notes: ['Refresh token конкретного клиента получают при подключении канала Google Ads в проекте — инструкция там.'],
      links: [['Developer token', 'https://developers.google.com/google-ads/api/docs/api-policy/developer-token'], ['OAuth для Google Ads API', 'https://developers.google.com/google-ads/api/docs/oauth/overview']],
    },
    meta_settings: {
      title: 'Meta — версия Graph API',
      who: 'Обычно менять не нужно',
      steps: ['Оставьте значение по умолчанию. Меняйте, только если Meta объявит отключение текущей версии (дата отключения есть на <a href="https://developers.facebook.com/docs/graph-api/changelog" target="_blank" rel="noopener">странице changelog</a>).'],
    },

    // ===================== AI-движки (GEO) =====================
    ai_openai: {
      title: 'ChatGPT (OpenAI) — API-ключ',
      time: '5 минут',
      steps: [
        'Зайдите на <a href="https://platform.openai.com" target="_blank" rel="noopener">platform.openai.com</a> (аккаунт агентства, не личный).',
        '«Settings» → «Billing» → пополните баланс ($10–20 хватит на месяцы проверок). Нужна зарубежная карта.',
        '«API keys» → <b>Create new secret key</b>, проект Default, права All. Скопируйте ключ <span class="code">sk-…</span> (показывается один раз).',
        'Вставьте в поле «API-ключ» ChatGPT → Сохранить → «Проверить».',
      ],
      notes: ['Модель по умолчанию gpt-4.1-mini — дешёвая. С веб-поиском ответы ближе к тому, что видит пользователь ChatGPT, но каждая проверка дороже.'],
      links: [['API keys', 'https://platform.openai.com/api-keys']],
    },
    ai_perplexity: {
      title: 'Perplexity — API-ключ',
      time: '5 минут',
      steps: [
        'Откройте <a href="https://www.perplexity.ai/settings/api" target="_blank" rel="noopener">perplexity.ai/settings/api</a> под аккаунтом агентства.',
        'Добавьте способ оплаты и купите кредиты (от $5).',
        '<b>Generate API Key</b> → скопируйте <span class="code">pplx-…</span> в поле «API-ключ» Perplexity.',
      ],
      notes: ['Perplexity всегда ищет в интернете и возвращает источники — самый показательный движок для цитирования сайта.'],
    },
    ai_gemini: {
      title: 'Gemini — API-ключ',
      time: '3 минуты',
      steps: [
        'Откройте <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> (Google-аккаунт агентства).',
        '<b>Create API key</b> → выберите проект Google Cloud (можно тот же, что для Google Ads) → скопируйте ключ <span class="code">AIza…</span>.',
        'Для стабильной работы с веб-поиском привяжите к проекту биллинг (иначе действуют лимиты бесплатного тарифа).',
      ],
      notes: ['Из РФ Google AI Studio недоступен — открывайте через VPN; сам портал работает с сервера в Германии.'],
    },
    ai_anthropic: {
      title: 'Claude (Anthropic) — API-ключ',
      time: '5 минут',
      steps: [
        'Откройте <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a>, создайте организацию агентства.',
        '«Billing» → пополните баланс (от $5).',
        '«API Keys» → <b>Create Key</b> → скопируйте <span class="code">sk-ant-…</span> в поле «API-ключ» Claude.',
        'Веб-поиск в API может требовать включения администратором организации в настройках консоли.',
      ],
    },
    ai_deepseek: {
      title: 'DeepSeek — API-ключ',
      time: '3 минуты',
      steps: [
        'Откройте <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener">platform.deepseek.com/api_keys</a>, зарегистрируйтесь по email.',
        '«Top up» — пополните баланс (от $2).',
        '<b>Create new API key</b> → скопируйте <span class="code">sk-…</span> в поле «API-ключ» DeepSeek.',
      ],
      notes: ['DeepSeek отвечает без поиска в интернете — показывает, что модель «знает» о бренде из обучения.'],
    },
    ai_yandexgpt: {
      title: 'YandexGPT — ключ Yandex Cloud',
      time: '5 минут',
      steps: [
        'Проще всего — использовать сервисный аккаунт Search API: добавьте ему роль <span class="code">ai.languageModels.user</span> и создайте API-ключ с областями <span class="code">yc.search-api.execute</span> и <span class="code">yc.ai.languageModels.execute</span>. Тогда поля YandexGPT можно оставить пустыми — возьмутся ключ и каталог Search API.',
        'Отдельный ключ: <a href="https://console.yandex.cloud" target="_blank" rel="noopener">console.yandex.cloud</a> → «Сервисные аккаунты» → создать → роль <span class="code">ai.languageModels.user</span> → «Создать новый ключ» → API-ключ с областью <span class="code">yc.ai.languageModels.execute</span>.',
        'Вставьте ключ и ID каталога в поля YandexGPT.',
      ],
      notes: ['Алиса и Нейро публичного API не имеют — YandexGPT ближайшая замена для оценки «знаний» Яндекса о бренде.'],
    },

    // ===================== Каналы клиента (проект → «Каналы и данные») =====================
    yandex_direct: {
      title: 'Яндекс Директ — OAuth-токен',
      who: 'Специалист проекта; приложение агентства создаётся один раз',
      time: '15 минут + одобрение заявки (обычно в тот же день, до 7 дней)',
      steps: [
        '<b>Один раз на агентство — приложение.</b> <a href="https://oauth.yandex.ru/client/new" target="_blank" rel="noopener">oauth.yandex.ru/client/new</a> под техническим логином агентства. Платформа: «Веб-сервисы», Redirect URI: <span class="code">https://oauth.yandex.ru/verification_code</span>.',
        'В доступах отметьте <b>«Использование API Яндекс Директа» (direct:api)</b> и <b>«Получение статистики» Метрики (metrika:read)</b> — один токен подойдёт и для Директа, и для Метрики. Сохраните <b>ClientID</b> приложения.',
        '<b>Один раз — заявка на API.</b> В Директе агентского (или клиентского) аккаунта: «Инструменты» → <b>API</b> → «Мои заявки» → «Новая заявка». Выберите приложение, укажите компанию и тип пользователя (агентство / рекламодатель), назначение — получение статистики и отчётов. Дождитесь статуса «одобрена»: до одобрения работает только песочница.',
        '<b>Токен.</b> Под логином, у которого есть доступ к кабинету клиента (агентский логин или логин клиента), откройте:<br><span class="code">https://oauth.yandex.ru/authorize?response_type=token&client_id=&lt;ClientID&gt;</span><br>Разрешите доступ — скопируйте токен (строка <span class="code">y0_…</span>).',
        'В проекте: «Каналы и данные» → «Подключить канал» → Яндекс Директ. Вставьте токен. <b>Client-Login</b> — логин клиента, если токен агентский (виден в списке клиентов агентского кабинета); если токен самого клиента — оставьте пустым.',
        '<b>ID целей</b> (необязательно): Метрика → счётчик → «Настройки» → «Цели» — номер у каждой цели. Укажите цели-лиды через запятую, иначе считаются приоритетные цели кампаний.',
        'Нажмите «Проверить», затем «Обновить» — загрузится статистика за 90 дней.',
      ],
      notes: ['Токен живёт около года; при смене пароля логина его нужно выпустить заново.'],
      links: [['Справка: API Директа', 'https://yandex.ru/support/direct/ru/alternative-interfaces/api'], ['Получение токена вручную', 'https://yandex.ru/dev/id/doc/ru/tokens/debug-token']],
    },
    metrika: {
      title: 'Яндекс Метрика — токен и номер счётчика',
      who: 'Специалист проекта',
      time: '3 минуты',
      steps: [
        'Нужен логин, у которого есть доступ к счётчику клиента (хотя бы «просмотр»). Если доступа нет — клиент выдаёт его в Метрике: «Настройки» → «Доступ» → добавить логин агентства.',
        'Токен: тот же способ, что для Директа — <span class="code">https://oauth.yandex.ru/authorize?response_type=token&client_id=&lt;ClientID приложения агентства&gt;</span> (у приложения должен быть доступ metrika:read). Можно использовать тот же токен, что и в Директе.',
        '<b>Номер счётчика</b> — в списке счётчиков <a href="https://metrika.yandex.ru/list" target="_blank" rel="noopener">metrika.yandex.ru</a> (число рядом с названием).',
        '<b>ID целей</b>: счётчик → «Настройки» → «Цели» → номер цели. Укажите цели-лиды через запятую — по ним считаются конверсии органики и AI-трафика.',
        'В проекте: «Подключить канал» → Яндекс Метрика → токен + номер счётчика → «Проверить».',
      ],
    },
    google_ads: {
      title: 'Google Ads — refresh token и Customer ID клиента',
      who: 'Специалист проекта (developer token и OAuth-клиент должны быть уже заданы лидером в «Сервисы и ключи»)',
      time: '5 минут',
      steps: [
        'Откройте <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener">OAuth Playground</a>. Справа шестерёнка → отметьте <b>Use your own OAuth credentials</b> → вставьте Client ID и Client secret агентства (их даст лидер Performance).',
        'Слева в поле «Input your own scopes» введите <span class="code">https://www.googleapis.com/auth/adwords</span> → <b>Authorize APIs</b>.',
        'Войдите Google-аккаунтом, у которого есть доступ к рекламному аккаунту клиента (лучше — аккаунт MCC агентства) и разрешите доступ.',
        '<b>Exchange authorization code for tokens</b> → скопируйте <b>Refresh token</b> (<span class="code">1//…</span>).',
        '<b>Customer ID</b> — номер аккаунта клиента вверху интерфейса Google Ads (<span class="code">123-456-7890</span>).',
        '<b>Login customer ID</b> — номер MCC агентства, если доступ к клиенту идёт через управляющий аккаунт. Если вошли напрямую в аккаунт клиента — оставьте пустым.',
        'В проекте: «Подключить канал» → Google Ads → вставьте значения → «Проверить».',
      ],
      notes: ['Если через 7 дней перестало работать — OAuth consent screen остался в режиме Testing; лидеру нужно опубликовать его (Publish app) и выпустить refresh token заново.'],
    },
    vk_ads: {
      title: 'VK Реклама — доступ к API',
      who: 'Владелец/администратор кабинета (агентского или клиентского)',
      time: '10 минут + рассмотрение заявки VK',
      steps: [
        'Войдите в <a href="https://ads.vk.com" target="_blank" rel="noopener">ads.vk.com</a> под аккаунтом, которому принадлежит кабинет (для агентства — агентский кабинет).',
        '«Настройки» → <b>«Доступ к API»</b> → заполните заявку (цель — выгрузка статистики для отчётности). После одобрения на той же странице появятся <b>Client ID</b> и <b>Client secret</b>.',
        '<b>Агентский кабинет:</b> в проекте укажите Client ID, Client secret и <b>логин клиента</b> (его username в списке клиентов агентства). Портал сам получит бессрочный токен именно для этого клиента.',
        '<b>Кабинет клиента напрямую:</b> укажите Client ID и Client secret, логин клиента оставьте пустым.',
        'Если у вас уже есть готовый access token (например, из Click.ru / eLama) — вставьте его в поле «…или готовый access token», остальные поля можно не заполнять.',
        '«Проверить» → «Обновить».',
      ],
      notes: ['Client secret даёт доступ ко всем клиентам агентства — вводите его только в портале, не пересылайте в чатах.', 'VK разрешает не больше 5 токенов на пару «приложение — пользователь»; портал при упоре в лимит сам удаляет старые и выпускает новый.'],
      links: [['Справка VK: API', 'https://ads.vk.com/help/articles/help_api']],
    },
    meta: {
      title: 'Instagram / Meta Ads — токен системного пользователя',
      who: 'Администратор Business Manager агентства или клиента',
      time: '15 минут',
      steps: [
        '<b>Один раз — приложение.</b> <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com/apps</a> → Create app → тип <b>Business</b> → привяжите к Business Manager агентства. Добавьте продукт <b>Marketing API</b>.',
        '<b>Системный пользователь.</b> <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener">business.facebook.com → Настройки компании → Пользователи → Системные пользователи</a> → «Добавить», роль <b>Сотрудник</b> (или Администратор).',
        '«Назначить активы» → Рекламные аккаунты → выберите аккаунт клиента → право <b>«Просмотр эффективности»</b> (достаточно для отчётов).',
        '<b>Создать новый маркер</b> → выберите приложение → срок действия <b>«Никогда»</b> → разрешения <span class="code">ads_read</span> (и <span class="code">read_insights</span>) → скопируйте токен.',
        '<b>ID рекламного аккаунта</b> — в Ads Manager в выпадающем списке аккаунтов или в адресе <span class="code">act=123456789</span>.',
        'В проекте: «Подключить канал» → Instagram / Meta → токен + ID аккаунта → «Проверить».',
      ],
      notes: ['Если клиент ведёт рекламу в своём Business Manager — он даёт агентству доступ партнёра к рекламному аккаунту, и дальше по шагам выше из BM агентства.', 'Лиды: по умолчанию считаются лид-формы, лиды пикселя и начатые переписки. Другие действия можно указать в поле «Типы действий».'],
    },
    telegram_ads: {
      title: 'Telegram Ads — выгрузка CSV',
      steps: [
        'Открытого API статистики у Telegram Ads нет.',
        'В <a href="https://ads.telegram.org" target="_blank" rel="noopener">ads.telegram.org</a> (или в кабинете посредника — eLama, Click.ru, VK Ads для Telegram) выгрузите статистику по дням: дата, объявление/кампания, показы, клики, расход.',
        'Лиды берите из CRM/Метрики (UTM кампании) и добавьте колонкой «лиды».',
        'В проекте: канал Telegram Ads → «CSV» → загрузите файл. Раз в неделю — новая выгрузка за последние 7–14 дней (повторные дни перезаписываются).',
      ],
    },
    avito: {
      title: 'Авито — выгрузка CSV',
      steps: [
        'Авито Pro → «Статистика» → период → выгрузка в Excel/CSV (просмотры, контакты, расходы на продвижение).',
        'Колонки: дата; объявление (как «кампания»); просмотры (= показы); контакты (= лиды); расход.',
        'В проекте: канал Авито → «CSV». Подключение Авито API — в планах (нужны client_id/secret из Авито Pro для бизнеса).',
      ],
    },
    twogis: {
      title: '2ГИС — выгрузка CSV',
      steps: [
        'Личный кабинет рекламодателя 2ГИС → «Статистика» → выгрузите показы, переходы в карточку, звонки/маршруты (= лиды) и расход по дням.',
        'В проекте: канал 2ГИС → «CSV» или «＋ день» для разового ввода.',
      ],
    },
    yandex_maps: {
      title: 'Яндекс Бизнес / Карты — выгрузка CSV',
      steps: [
        'Кабинет Яндекс Бизнеса → «Статистика» (или «Продвижение» → отчёт) → период → скачать.',
        'Показы, клики/переходы, звонки и построения маршрута (= лиды), расход — по дням.',
        'В проекте: канал Яндекс Бизнес → «CSV».',
      ],
    },
    ozon: {
      title: 'Ozon Продвижение — выгрузка CSV',
      steps: [
        'Кабинет продавца Ozon → «Продвижение» → «Статистика» → выгрузка по дням (показы, клики, расход, заказы, выручка).',
        'Заказы = «лиды», сумма заказов = «выручка» — тогда портал посчитает ROMI.',
        'В проекте: канал Ozon → «CSV». API Ozon Performance — в планах.',
      ],
    },
    wb: {
      title: 'Wildberries Продвижение — выгрузка CSV',
      steps: [
        'Кабинет WB → «Продвижение» → «Статистика кампаний» → выгрузка (показы, клики, затраты, заказы, сумма заказов).',
        'В проекте: канал Wildberries → «CSV». API WB Продвижения — в планах.',
      ],
    },
    other: {
      title: 'Любая другая площадка — CSV',
      steps: ['Выгрузите статистику по дням в CSV с колонками: дата, кампания, показы, клики, расход, лиды, выручка (лишние колонки игнорируются) и загрузите через «CSV».'],
    },
  };

  const AI_GUIDE = { openai: 'ai_openai', perplexity: 'ai_perplexity', gemini: 'ai_gemini', anthropic: 'ai_anthropic', deepseek: 'ai_deepseek', yandexgpt: 'ai_yandexgpt' };
  const GROUP_GUIDE = { seo: 'seo', google: 'google', meta: 'meta_settings' };

  function html(key, { open = false, compact = false } = {}) {
    const g = G[key];
    if (!g) return '';
    return `<details class="guide" ${open ? 'open' : ''}>
      <summary>📘 ${compact ? 'Как получить' : esc(g.title)}${g.time ? ` <span class="faint">· ${g.time}</span>` : ''}</summary>
      <div class="guide-body">
        ${g.who ? `<div class="faint" style="font-size:12px;margin-bottom:6px">Кто делает: ${g.who}</div>` : ''}
        <ol>${g.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
        ${(g.notes || []).map((n) => `<div class="guide-note">💡 ${n}</div>`).join('')}
        ${g.links ? `<div class="guide-links">${g.links.map(([l, u]) => `<a href="${u}" target="_blank" rel="noopener">${l} ↗</a>`).join('')}</div>` : ''}
      </div></details>`;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  window.KF_GUIDES = { G, html, AI_GUIDE, GROUP_GUIDE };
})();
