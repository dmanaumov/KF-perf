/* КонтентФерма Performance — кабинет команды (SPA без сборки). */
(function () {
  const { F, esc, Charts } = window.KF;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const S = { me: null, meta: null, projects: [], users: [] };
  const app = $('#app');

  // ---------- infra ----------
  async function api(method, url, body) {
    const res = await fetch('/api' + url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* пусто */ }
    if (res.status === 401 && url !== '/login') { S.me = null; renderLogin(); throw new Error('Сессия истекла'); }
    if (!res.ok) throw new Error((data && data.message) || `Ошибка ${res.status}`);
    return data;
  }
  const get = (u) => api('GET', u);
  const post = (u, b) => api('POST', u, b || {});
  const put = (u, b) => api('PUT', u, b || {});
  const del = (u) => api('DELETE', u);

  function toast(msg, err) {
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), err ? 5000 : 2600);
  }
  const fail = (e) => toast(e.message || String(e), true);

  function modal(title, body, { wide, onMount } = {}) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="modal-head"><h2>${esc(title)}</h2><button class="x" aria-label="Закрыть">×</button></div><div class="modal-body">${body}</div></div>`;
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
    $('.x', bg).onclick = close;
    document.body.appendChild(bg);
    if (onMount) onMount(bg, close);
    const first = $('input,select,textarea', bg);
    if (first) first.focus();
    return { el: bg, close };
  }

  function formData(root) {
    const o = {};
    $$('[name]', root).forEach((el) => {
      if (el.type === 'checkbox') {
        if (el.dataset.multi) { o[el.name] = o[el.name] || []; if (el.checked) o[el.name].push(el.value); } else o[el.name] = el.checked;
      } else o[el.name] = el.value;
    });
    return o;
  }

  const plat = (id) => (S.meta.platforms.find((p) => p.id === id) || { label: id, short: id, color: '#999' });
  const pchip = (id) => { const p = plat(id); return `<span class="chip"><span class="pdot" style="background:${p.color}"></span>${esc(p.short)}</span>`; };
  const areaLabel = (id) => (S.meta.areas.find((a) => a.id === id) || { label: id }).label;
  const statusLabel = (id) => (S.meta.taskStatuses.find((a) => a.id === id) || { label: id }).label;
  const SVC = { ads: 'Реклама', seo: 'SEO', geo: 'GEO' };
  const svcChips = (arr) => (arr || []).map((s) => `<span class="chip accent svc">${SVC[s] || s}</span>`).join(' ');
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
  const userOpts = (cur, empty = '— не назначен —') => opt('', empty, cur) + S.users.map((u) => opt(u.id, u.name || u.username, cur)).join('');
  const canManage = () => S.me && (S.me.role === 'admin' || S.me.role === 'lead');
  const today = () => S.meta.today;
  const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const monthStart = (d) => d.slice(0, 8) + '01';
  const prevMonth = (d) => monthStart(addDays(monthStart(d), -1));
  const monthEnd = (d) => { const [y, m] = d.split('-').map(Number); return `${d.slice(0, 8)}${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };
  const inkOn = (hex) => { const n = parseInt(hex.slice(1), 16); const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > 0.62 ? '#1d1d1d' : '#fff'; };
  const pctClass = (p, lo = 85, hi = 110) => (p === null || p === undefined ? '' : p > hi ? 'bad' : p < lo ? 'warn' : '');

  const ICONS = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    tasks: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    seo: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    geo: '<path d="M12 3l2.2 5.3L20 9l-4.4 3.8L17 19l-5-3-5 3 1.4-6.2L4 9l5.8-.7z"/>',
    team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c1.8.7 3 2.5 3.5 5.4"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>',
  };
  const icon = (n) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;

  // ---------- login ----------
  function renderLogin() {
    app.innerHTML = `
      <div class="login"><div class="login-card">
        <div class="brand" style="padding:0"><div class="brand-mark">КФ</div><div class="brand-name" style="color:#fff">КонтентФерма<small>Performance</small></div></div>
        <h1>Продвижение под контролем</h1>
        <p>Реклама, SEO и GEO всех проектов — бюджеты, результаты и задачи в одном месте.</p>
        <form class="card form" id="lf">
          <label class="f">Логин или email Mattermost<input class="inp" name="login" autocomplete="username" required></label>
          <label class="f">Пароль<input class="inp" name="password" type="password" autocomplete="current-password" required></label>
          <div class="err-line" id="lerr"></div>
          <button class="btn primary" style="justify-content:center">Войти</button>
        </form>
      </div></div>`;
    $('#lf').onsubmit = async (e) => {
      e.preventDefault();
      $('#lerr').textContent = '';
      try {
        const r = await post('/login', formData(e.target));
        S.me = r.user;
        await boot();
      } catch (err) { $('#lerr').textContent = err.message; }
    };
  }

  // ---------- shell ----------
  async function loadProjects() { S.projects = await get('/projects'); }

  function shell() {
    app.innerHTML = `
      <div class="mobile-bar"><button id="mnav">☰</button><b>КФ Performance</b></div>
      <div class="app">
        <aside class="sidebar" id="sb">
          <div class="brand"><div class="brand-mark">КФ</div><div class="brand-name">КонтентФерма<small>Performance</small></div></div>
          <a class="nav-item" href="#/" data-nav="home">${icon('home')}Обзор</a>
          <a class="nav-item" href="#/tasks" data-nav="tasks">${icon('tasks')}Задачи<span class="count hidden" id="mytasks"></span></a>
          <a class="nav-item" href="#/seo" data-nav="seo">${icon('seo')}SEO</a>
          <a class="nav-item" href="#/geo" data-nav="geo">${icon('geo')}GEO / AI</a>
          ${S.me.role === 'admin' ? `<a class="nav-item" href="#/team" data-nav="team">${icon('team')}Команда</a>` : ''}
          ${canManage() ? `<a class="nav-item" href="#/settings" data-nav="settings">${icon('key')}Сервисы и ключи</a>` : ''}
          <a class="nav-item" href="#/help" data-nav="help">${icon('help')}Подключения</a>
          <div class="nav-sep">Проекты</div>
          <div id="navp"></div>
          ${canManage() ? '<button class="nav-item nav-project" id="addp" style="opacity:.75">＋ Новый проект</button>' : ''}
          <div class="sidebar-foot"><div class="who">${esc(S.me.name || S.me.username)}</div><div class="faint" style="color:rgba(255,255,255,.6);font-size:12px;margin-bottom:6px">${{ admin: 'Администратор', lead: 'Руководитель', specialist: 'Специалист' }[S.me.role]}</div><button id="logout">Выйти</button></div>
        </aside>
        <main class="main" id="main"></main>
      </div>`;
    $('#logout').onclick = async () => { await post('/logout'); S.me = null; renderLogin(); };
    $('#mnav').onclick = () => $('#sb').classList.toggle('open');
    if ($('#addp')) $('#addp').onclick = () => projectModal();
    renderNavProjects();
  }

  function renderNavProjects() {
    const el = $('#navp');
    if (!el) return;
    el.innerHTML = S.projects.filter((p) => p.status !== 'archived').map((p) =>
      `<a class="nav-item nav-project" href="#/p/${p.id}" data-nav="p${p.id}"><span class="dot ${p._bad ? 'bad' : ''}"></span>${esc(p.name)}</a>`).join('') || '<div class="faint" style="padding:6px 12px;color:rgba(255,255,255,.5)">Пока нет проектов</div>';
    markNav();
  }

  function markNav() {
    const h = location.hash || '#/';
    const key = h.startsWith('#/p/') ? 'p' + h.split('/')[2] : (h.split('/')[1] || 'home');
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === key));
  }

  async function route() {
    const main = $('#main');
    if (!main) return;
    $('#sb').classList.remove('open');
    markNav();
    const parts = (location.hash || '#/').slice(2).split('/');
    main.innerHTML = '<div class="empty">Загрузка…</div>';
    try {
      if (!parts[0]) await pageOverview(main);
      else if (parts[0] === 'tasks') await pageTasks(main);
      else if (parts[0] === 'seo') await pageSeoAll(main);
      else if (parts[0] === 'geo') await pageGeoAll(main);
      else if (parts[0] === 'team') await pageTeam(main);
      else if (parts[0] === 'help') await pageHelp(main);
      else if (parts[0] === 'settings') await pageSettings(main);
      else if (parts[0] === 'p') await pageProject(main, +parts[1], parts[2] || 'summary');
      else main.innerHTML = '<div class="empty">Страница не найдена</div>';
    } catch (e) {
      main.innerHTML = `<div class="empty"><span class="em">⚠️</span>${esc(e.message)}</div>`;
    }
    window.scrollTo(0, 0);
  }

  // ---------- overview ----------
  let overviewMonth = null;
  async function pageOverview(main) {
    overviewMonth = overviewMonth || monthStart(today());
    const d = await get(`/overview?month=${overviewMonth}`);
    const isCur = overviewMonth === monthStart(today());
    const t = d.totals;
    const spendPct = t.budget ? t.spend / t.budget * 100 : null;
    const elapsed = isCur ? +today().slice(8) : +monthEnd(overviewMonth).slice(8);
    const expected = t.budget ? t.budget * elapsed / +monthEnd(overviewMonth).slice(8) : null;
    const badIds = new Set(d.projects.filter((p) => p.alertsHigh).map((p) => p.id));
    S.projects.forEach((p) => { p._bad = badIds.has(p.id); });
    renderNavProjects();

    main.innerHTML = `
      <div class="page-head">
        <div><h1>Обзор</h1><div class="sub">${esc(F.month(overviewMonth))}${isCur ? ` · ${elapsed}-й день месяца` : ' · итог месяца'}</div></div>
        <div class="row">
          <div class="seg" id="mseg">
            <button data-m="${monthStart(today())}" class="${isCur ? 'active' : ''}">Этот месяц</button>
            <button data-m="${prevMonth(today())}" class="${overviewMonth === prevMonth(today()) ? 'active' : ''}">Прошлый</button>
            <button data-m="${prevMonth(prevMonth(today()))}" class="${overviewMonth === prevMonth(prevMonth(today())) ? 'active' : ''}">${esc(F.month(prevMonth(prevMonth(today()))).split(' ')[0])}</button>
          </div>
          ${canManage() ? '<button class="btn primary" id="np">＋ Проект</button>' : ''}
        </div>
      </div>
      <div class="grid g-4">
        <div class="card kpi"><div class="label">Расход</div><div class="value">${F.money(t.spend)}</div>
          <div class="foot">${t.budget ? `из ${F.money(t.budget)} · ${F.pct(spendPct)}` : 'план не задан'}</div>
          ${t.budget ? `<div class="bar-track"><div class="bar-fill ${pctClass(spendPct / (expected / t.budget), 85, 112)}" style="width:${Math.min(100, spendPct)}%"></div>${expected ? `<div class="bar-mark" style="left:${Math.min(100, expected / t.budget * 100)}%" title="Ожидаемый расход на сегодня"></div>` : ''}</div>` : ''}
        </div>
        <div class="card kpi"><div class="label">Лиды</div><div class="value">${F.int(t.leads)}</div><div class="foot">по всем рекламным каналам</div></div>
        <div class="card kpi"><div class="label">Средний CPL</div><div class="value">${F.money(t.cpl)}</div><div class="foot">${t.revenue ? `выручка ${F.money(t.revenue)}` : 'стоимость лида'}</div></div>
        <div class="card kpi"><div class="label">Проекты</div><div class="value">${t.projects}</div><div class="foot">${d.alerts.length ? `<span class="chip ${d.alerts.some((a) => a.level === 'high') ? 'bad' : 'warn'}">${d.alerts.length} сигнал(ов)</span>` : '<span class="chip good">всё спокойно</span>'}</div></div>
      </div>
      <div class="grid g-21 mt">
        <div class="card"><div class="card-head"><h3>Расход по дням · 30 дней</h3><span class="hint">все проекты</span></div><div class="chart" id="ch-spend"></div></div>
        <div class="card"><div class="card-head"><h3>Требует внимания</h3><span class="hint">${d.alerts.length}</span></div>
          <div class="alerts" style="max-height:236px;overflow:auto">${d.alerts.length ? d.alerts.map(alertHtml).join('') : '<div class="empty"><span class="em">🌱</span>Сигналов нет</div>'}</div></div>
      </div>
      <div class="card mt">
        <div class="card-head"><h3>Проекты</h3><span class="hint">пейсинг = прогноз расхода к концу месяца относительно плана</span></div>
        <div class="table-wrap"><table class="t"><thead><tr>
          <th>Проект</th><th>Каналы</th><th>Расход / план</th><th class="r">Прогноз</th><th class="r">Лиды</th><th class="r">CPL / цель</th><th class="r">SEO ТОП-10</th><th class="r">GEO</th><th class="r">Задачи</th><th></th>
        </tr></thead><tbody>
        ${d.projects.map((p) => {
          const pc = p.pacing;
          return `<tr class="click" data-href="#/p/${p.id}">
            <td><div class="pname">${esc(p.name)}<small>${esc(p.client_name || '')}${p.status === 'paused' ? ' · на паузе' : ''}</small></div><div class="row" style="gap:4px;margin-top:4px">${svcChips(p.services)}</div></td>
            <td><div class="row" style="gap:4px">${p.platforms.filter((x) => x !== 'metrika').map(pchip).join('') || '<span class="faint">—</span>'}</div></td>
            <td class="nowrap"><div class="num" style="font-weight:700">${F.moneyShort(pc.spend)} <span class="faint">/ ${pc.budget ? F.moneyShort(pc.budget) : '—'}</span></div>
              ${pc.budget ? `<span class="mini-bar"><span class="${pctClass(pc.pacePct, 85, 112)}" style="width:${Math.min(100, pc.spendPct)}%"></span></span>` : ''}</td>
            <td class="r">${pc.pacePct ? `<span class="chip ${pctClass(pc.pacePct, 85, 112) || 'good'}">${F.pct(pc.pacePct)}</span>` : '—'}</td>
            <td class="r num"><b>${F.int(pc.leads)}</b>${pc.leadsPlan ? `<span class="faint"> / ${F.int(pc.leadsPlan)}</span>` : ''}</td>
            <td class="r num nowrap"><b class="${pc.cplTarget && pc.cpl > pc.cplTarget * 1.1 ? 'overdue' : ''}">${F.money(pc.cpl)}</b>${pc.cplTarget ? `<div class="faint" style="font-size:12px">цель ${F.money(pc.cplTarget)}</div>` : ''}</td>
            <td class="r num">${p.seo ? `${p.seo.top10}<span class="faint"> / ${p.seo.total}</span>` : '<span class="faint">—</span>'}</td>
            <td class="r num">${p.geo && p.geo.checks ? F.pct(p.geo.visibility) : '<span class="faint">—</span>'}</td>
            <td class="r num">${p.tasks.open}${p.tasks.overdue ? ` <span class="overdue" title="просрочено">· ⚠${p.tasks.overdue}</span>` : ''}</td>
            <td class="r">${p.alerts ? `<span class="chip ${p.alertsHigh ? 'bad' : 'warn'}">${p.alerts}</span>` : ''}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="10"><div class="empty"><span class="em">🌱</span>Проектов пока нет</div></td></tr>'}
        </tbody></table></div>
      </div>`;
    $$('#mseg button', main).forEach((b) => { b.onclick = () => { overviewMonth = b.dataset.m; route(); }; });
    if ($('#np')) $('#np').onclick = () => projectModal();
    $$('tr[data-href]', main).forEach((tr) => { tr.onclick = () => { location.hash = tr.dataset.href; }; });
    Charts.bars($('#ch-spend'), d.daily.map((x) => ({ x: x.date, y: x.spend, leads: x.leads })), {
      height: 220,
      tip: (x) => `${F.date(x.x)}<br>Расход <b>${F.money(x.y)}</b><br>Лиды <b>${F.int(x.leads)}</b>`,
    });
  }

  function alertHtml(a) {
    const lv = { high: 'важно', mid: 'внимание', low: 'инфо' }[a.level];
    return `<div class="alert ${a.level}"><span class="lvl">${lv}</span><div>${a.project ? `<a href="#/p/${a.project_id}">${esc(a.project)}</a> · ` : ''}${esc(a.text)}</div></div>`;
  }

  // ---------- project modal ----------
  function projectForm(p = {}) {
    const svcs = p.services || ['ads'];
    return `<form class="form" id="pf">
      <div class="two"><label class="f">Название проекта<input class="inp" name="name" value="${esc(p.name)}" required></label>
      <label class="f">Клиент (юрлицо / бренд)<input class="inp" name="client_name" value="${esc(p.client_name)}"></label></div>
      <div class="two"><label class="f">Сайт<input class="inp" name="site_url" value="${esc(p.site_url)}" placeholder="https://"></label>
      <label class="f">Менеджер проекта<select class="inp" name="manager_id">${userOpts(p.manager_id || (p.id ? '' : S.me.id), '— нет —')}</select></label></div>
      <div class="three">
        <label class="f">Главный KPI<select class="inp" name="kpi_type">${opt('leads', 'Лиды / заявки', p.kpi_type)}${opt('sales', 'Продажи / выручка', p.kpi_type)}${opt('traffic', 'Трафик / охват', p.kpi_type)}</select></label>
        <label class="f">Статус<select class="inp" name="status">${opt('active', 'Активен', p.status)}${opt('paused', 'На паузе', p.status)}${opt('archived', 'Архив', p.status)}</select></label>
        <label class="f">Валюта<select class="inp" name="currency">${opt('RUB', '₽ RUB', p.currency)}${opt('KZT', '₸ KZT', p.currency)}${opt('EUR', '€ EUR', p.currency)}${opt('USD', '$ USD', p.currency)}</select></label>
      </div>
      <div class="f" style="font-size:12.5px;font-weight:700;color:var(--ink-2)">Услуги<div class="row" style="margin-top:6px;gap:16px">
        ${['ads', 'seo', 'geo'].map((s) => `<label class="checkline"><input type="checkbox" name="services" data-multi="1" value="${s}" ${svcs.includes(s) ? 'checked' : ''}>${SVC[s]}</label>`).join('')}</div></div>
      <label class="f">Как называют бренд <span class="help">через запятую — для GEO и поиска упоминаний</span><input class="inp" name="brand_terms" value="${esc((p.brand_terms || []).join(', '))}"></label>
      <label class="f">Конкуренты <span class="help">через запятую; синонимы через «|», напр. «Риалвеб|Realweb»</span><input class="inp" name="competitors" value="${esc((p.competitors || []).join(', '))}"></label>
      ${p.id ? `<div class="f" style="font-size:12.5px;font-weight:700;color:var(--ink-2)">Команда проекта <span class="help" style="font-weight:500;color:var(--ink-3)">специалисты видят только свои проекты</span><div class="row" style="margin-top:6px;gap:14px">
        ${S.users.map((u) => `<label class="checkline"><input type="checkbox" name="member_ids" data-multi="1" value="${esc(u.id)}" ${(p.members || []).some((m) => m.id === u.id) ? 'checked' : ''}>${esc(u.name || u.username)}</label>`).join('')}</div></div>` : ''}
      <label class="f">Заметки<textarea class="inp" name="notes" style="min-height:60px">${esc(p.notes)}</textarea></label>
      <div class="modal-foot">${p.id && S.me.role === 'admin' ? '<button type="button" class="btn danger ghost" id="pdel" style="margin-right:auto">Удалить проект</button>' : ''}<button class="btn primary">${p.id ? 'Сохранить' : 'Создать проект'}</button></div>
    </form>`;
  }

  function projectModal(p) {
    modal(p ? 'Настройки проекта' : 'Новый проект', projectForm(p), {
      wide: true,
      onMount: (el, close) => {
        $('#pf', el).onsubmit = async (e) => {
          e.preventDefault();
          try {
            const body = formData(e.target);
            const r = p ? await put(`/projects/${p.id}`, body) : await post('/projects', body);
            close();
            await loadProjects();
            renderNavProjects();
            toast(p ? 'Сохранено' : 'Проект создан');
            if (p) route(); else location.hash = `#/p/${r.id}/channels`;
          } catch (err) { fail(err); }
        };
        if ($('#pdel', el)) $('#pdel', el).onclick = async () => {
          if (!confirm(`Удалить проект «${p.name}» со всей статистикой, задачами и историей? Это необратимо.`)) return;
          try { await del(`/projects/${p.id}`); close(); await loadProjects(); renderNavProjects(); location.hash = '#/'; } catch (err) { fail(err); }
        };
      },
    });
  }

  // ---------- project page ----------
  const PERIODS = [
    ['month', 'Этот месяц'], ['prev', 'Прошлый месяц'], ['7', '7 дней'], ['30', '30 дней'], ['90', '90 дней'],
  ];
  let period = 'month';
  function periodRange() {
    const t = today();
    if (period === 'month') return [monthStart(t), t];
    if (period === 'prev') return [prevMonth(t), monthEnd(prevMonth(t))];
    return [addDays(t, -(+period - 1)), t];
  }

  async function pageProject(main, id, tab) {
    const p = await get(`/projects/${id}`);
    const tabs = [['summary', 'Сводка'], ['campaigns', 'Кампании'], ['tasks', 'Задачи']];
    if (p.services.includes('seo')) tabs.push(['seo', 'SEO']);
    if (p.services.includes('geo')) tabs.push(['geo', 'GEO / AI']);
    tabs.push(['log', 'Журнал'], ['channels', 'Каналы и данные'], ['plan', 'План'], ['secrets', '🔒 Секретики']);
    main.innerHTML = `
      <div class="crumbs"><a href="#/">Обзор</a> / ${esc(p.client_name || 'Проект')}</div>
      <div class="page-head">
        <div><h1>${esc(p.name)}</h1><div class="sub row" style="gap:6px">${svcChips(p.services)}${p.site_url ? `<a class="faint" href="${esc(p.site_url)}" target="_blank" rel="noopener">${esc(p.site_url.replace(/^https?:\/\//, ''))}</a>` : ''}${p.manager ? `<span class="faint">· ${esc(p.manager.name)}</span>` : ''}</div></div>
        <div class="row"><button class="btn" id="clink">Кабинет клиента</button><button class="btn" id="pset">Настройки</button></div>
      </div>
      <div class="tabs" id="ptabs">${tabs.map(([k, l]) => `<button data-t="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div id="pbody"><div class="empty">Загрузка…</div></div>`;
    $$('#ptabs button').forEach((b) => { b.onclick = () => { location.hash = `#/p/${id}/${b.dataset.t}`; }; });
    if (p.has_secrets) $('#ptabs [data-t="secrets"]').classList.add('filled');
    $('#pset').onclick = () => projectModal(p);
    $('#clink').onclick = () => clientLinkModal(p);
    const body = $('#pbody');
    const T = { summary: tabSummary, campaigns: tabCampaigns, tasks: tabTasks, seo: tabSeo, geo: tabGeo, log: tabLog, channels: tabChannels, plan: tabPlan, secrets: tabSecrets };
    await (T[tab] || tabSummary)(body, p);
  }

  function clientLinkModal(p) {
    const render = (el, token, enabled) => {
      const url = `${location.origin}/c/${token}`;
      $('.modal-body', el).innerHTML = `
        <p class="muted" style="margin-top:0">Клиент видит сводку, план/факт, задачи и журнал, отмеченные «видно клиенту», а также SEO и GEO. Без доступов и внутренних заметок.</p>
        ${token && enabled ? `<label class="f">Ссылка<input class="inp" readonly value="${esc(url)}" onclick="this.select()"></label>
          <div class="modal-foot"><button class="btn danger ghost" data-a="disable">Отключить</button><button class="btn" data-a="regenerate">Перевыпустить</button><a class="btn" href="${esc(url)}" target="_blank">Открыть</a><button class="btn primary" data-a="copy">Скопировать</button></div>`
        : `<div class="modal-foot"><button class="btn primary" data-a="enable">Включить ссылку</button></div>`}`;
      $$('[data-a]', el).forEach((b) => {
        b.onclick = async () => {
          if (b.dataset.a === 'copy') { await navigator.clipboard.writeText(url).catch(() => {}); toast('Ссылка скопирована'); return; }
          if (b.dataset.a === 'regenerate' && !confirm('Старая ссылка перестанет работать. Продолжить?')) return;
          try { const r = await post(`/projects/${p.id}/client-link`, { action: b.dataset.a }); p.client_token = r.token; p.client_enabled = r.enabled; render(el, r.token, r.enabled); } catch (e) { fail(e); }
        };
      });
    };
    modal('Кабинет клиента', '', { onMount: (el) => render(el, p.client_token, p.client_enabled) });
  }

  function periodSeg(cb) {
    return `<div class="seg" id="perseg">${PERIODS.map(([k, l]) => `<button data-p="${k}" class="${k === period ? 'active' : ''}">${l}</button>`).join('')}</div>`;
  }
  function bindPeriod(root, cb) { $$('#perseg button', root).forEach((b) => { b.onclick = () => { period = b.dataset.p; cb(); }; }); }

  // KPI-плитки + график — используются и в клиентском кабинете (см. client.js)
  async function tabSummary(body, p) {
    const [from, to] = periodRange();
    const s = await get(`/projects/${p.id}/summary?from=${from}&to=${to}`);
    const t = s.totals;
    const pv = s.prev;
    const pc = s.pacing;
    const plan = pc.plan || {};
    const sales = p.kpi_type === 'sales';
    body.innerHTML = `
      <div class="row between" style="margin-bottom:16px">${periodSeg()}<span class="faint">${F.date(s.from)} — ${F.date(s.to)} · сравнение с ${F.date(s.prevFrom)} — ${F.date(s.prevTo)}</span></div>
      <div class="grid g-4">
        <div class="card kpi"><div class="label">Расход</div><div class="value">${F.money(t.spend)}</div><div class="foot">${F.delta(t.spend, pv.spend, 'none')} <span>было ${F.money(pv.spend)}</span></div></div>
        <div class="card kpi"><div class="label">${sales ? 'Конверсии' : 'Лиды'}</div><div class="value">${F.int(t.leads)}</div><div class="foot">${F.delta(t.leads, pv.leads)} <span>CR ${F.pct(t.cr, 1)}</span></div></div>
        <div class="card kpi"><div class="label">CPL</div><div class="value">${F.money(t.cpl)}</div><div class="foot">${F.delta(t.cpl, pv.cpl, 'down')} ${plan.cpl_target ? `<span>цель ${F.money(plan.cpl_target)}</span>` : ''}</div></div>
        ${sales ? `<div class="card kpi"><div class="label">Выручка · ROMI</div><div class="value">${F.moneyShort(t.revenue)} <small>${F.pct(t.romi)}</small></div><div class="foot">${F.delta(t.revenue, pv.revenue)} <span>ROMI было ${F.pct(pv.romi)}</span></div></div>`
          : `<div class="card kpi"><div class="label">Клики · CTR</div><div class="value">${F.int(t.clicks)} <small>${F.pct(t.ctr, 2)}</small></div><div class="foot">${F.delta(t.clicks, pv.clicks)} <span>CPC ${F.money(t.cpc)}</span></div></div>`}
      </div>
      <div class="grid g-21 mt">
        <div class="card">
          <div class="card-head"><h3>Динамика</h3><span class="hint">наведите на график для значений по дням</span></div>
          <div class="grid g-3">
            <div><div class="chart-title">Расход</div><div class="chart" id="c1"></div></div>
            <div><div class="chart-title">${sales ? 'Конверсии' : 'Лиды'}</div><div class="chart" id="c2"></div></div>
            <div><div class="chart-title">CPL</div><div class="chart" id="c3"></div></div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>План на ${esc(F.month(pc.month).split(' ')[0])}</h3><a class="hint" href="#/p/${p.id}/plan">изменить</a></div>
          ${pc.plan ? pacingHtml(pc) : `<div class="empty">План на месяц не задан.<br><a class="btn sm mt" href="#/p/${p.id}/plan">Задать план</a></div>`}
        </div>
      </div>
      <div class="grid g-2 mt">
        <div class="card"><div class="card-head"><h3>Каналы</h3><span class="hint">расход и ${sales ? 'конверсии' : 'лиды'} за период</span></div><div id="hb"></div>
          ${s.byPlatform.length ? `<div class="table-wrap mt"><table class="t"><thead><tr><th>Канал</th><th class="r">Клики</th><th class="r">CTR</th><th class="r">CPC</th><th class="r">${sales ? 'Конв.' : 'Лиды'}</th><th class="r">CPL</th>${sales ? '<th class="r">ROMI</th>' : ''}</tr></thead><tbody>
          ${s.byPlatform.map((r) => `<tr><td>${pchip(r.platform)}</td><td class="r">${F.int(r.clicks)}</td><td class="r">${F.pct(r.ctr, 2)}</td><td class="r">${F.money(r.cpc)}</td><td class="r strong">${F.int(r.leads)}</td><td class="r strong">${F.money(r.cpl)}</td>${sales ? `<td class="r">${F.pct(r.romi)}</td>` : ''}</tr>`).join('')}
          </tbody></table></div>` : ''}
        </div>
        <div class="stack">
          <div class="card"><div class="card-head"><h3>Сигналы</h3></div><div class="alerts">${s.alerts.length ? s.alerts.map((a) => alertHtml({ ...a, project: null })).join('') : '<div class="empty"><span class="em">🌱</span>Всё в норме</div>'}</div></div>
          ${s.traffic.length ? `<div class="card"><div class="card-head"><h3>Трафик сайта по источникам</h3><span class="hint">Яндекс Метрика</span></div><div id="tr"></div></div>` : ''}
        </div>
      </div>`;
    bindPeriod(body, () => tabSummary(body, p));
    const daysInMonth = +monthEnd(pc.month).slice(8);
    Charts.bars($('#c1'), s.daily.map((d) => ({ x: d.date, y: d.spend })), { height: 170, ref: plan.budget ? plan.budget / daysInMonth : null, refLabel: plan.budget ? 'план/день' : '' });
    Charts.bars($('#c2'), s.daily.map((d) => ({ x: d.date, y: d.leads })), { height: 170, color: 'var(--chart-2)', axisFmt: F.int, fmt: F.int });
    Charts.line($('#c3'), s.daily.map((d) => ({ x: d.date, y: d.leads ? d.spend / d.leads : null })), { height: 170, axisFmt: F.moneyShort, fmt: F.money, ref: plan.cpl_target, refLabel: plan.cpl_target ? 'цель' : '', color: 'var(--chart-3)' });
    Charts.hbars($('#hb'), s.byPlatform.map((r) => ({ label: plat(r.platform).short, dot: plat(r.platform).color, value: r.spend, valueText: F.money(r.spend), sub: `${F.int(r.leads)} ${sales ? 'конв.' : 'лид.'} · ${F.money(r.cpl)}` })), { empty: 'Нет данных за период — подключите каналы на вкладке «Каналы и данные»' });
    if (s.traffic.length) Charts.hbars($('#tr'), s.traffic.map((r) => ({ label: r.name, value: r.visits, valueText: F.int(r.visits), sub: r.leads ? `${F.int(r.leads)} целей` : '' })));
  }

  function pacingHtml(pc) {
    const plan = pc.plan;
    const line = (label, fact, target, fmt, forecast) => {
      const pct = target ? fact / target * 100 : null;
      const exp = pc.elapsed / pc.total * 100;
      return `<div style="margin-bottom:16px"><div class="row between"><b>${label}</b><span class="num">${fmt(fact)} <span class="faint">/ ${fmt(target)}</span></span></div>
        <div class="bar-track"><div class="bar-fill ${pct !== null && forecast / target * 100 > 112 ? 'bad' : pct !== null && forecast / target * 100 < 85 ? 'warn' : ''}" style="width:${Math.min(100, pct || 0)}%"></div><div class="bar-mark" style="left:${exp}%"></div></div>
        <div class="faint" style="font-size:12px;margin-top:5px">${F.pct(pct)} выполнено · прогноз ${fmt(forecast)} (${F.pct(forecast / target * 100)})</div></div>`;
    };
    return `<div class="faint" style="font-size:12px;margin-bottom:14px">День ${pc.elapsed} из ${pc.total} · черта — где должны быть по плану</div>
      ${plan.budget ? line('Бюджет', pc.fact.spend, plan.budget, F.money, pc.forecastSpend) : ''}
      ${plan.leads ? line('Лиды', pc.fact.leads, plan.leads, F.int, pc.forecastLeads) : ''}
      ${plan.cpl_target ? `<div class="row between"><b>CPL</b><span class="num"><b class="${pc.fact.cpl > plan.cpl_target * 1.1 ? 'overdue' : ''}">${F.money(pc.fact.cpl)}</b> <span class="faint">/ цель ${F.money(plan.cpl_target)}</span></span></div>` : ''}
      ${pc.platforms.length ? `<div class="mt" style="border-top:1px solid var(--line);padding-top:12px">${pc.platforms.map((x) => `<div class="row between" style="font-size:13px;margin-bottom:6px">${pchip(x.platform)}<span class="num">${F.moneyShort(x.spend)} / ${F.moneyShort(x.budget)} · <b>${F.pct(x.spendPct)}</b></span></div>`).join('')}</div>` : ''}`;
  }

  // ---------- campaigns ----------
  async function tabCampaigns(body, p) {
    const [from, to] = periodRange();
    const s = await get(`/projects/${p.id}/summary?from=${from}&to=${to}`);
    let filter = '';
    let sort = 'spend';
    const draw = () => {
      const rows = s.byCampaign.filter((c) => !filter || c.platform === filter).sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1));
      const tot = rows.reduce((o, r) => { ['impressions', 'clicks', 'spend', 'leads', 'revenue'].forEach((k) => { o[k] += r[k]; }); return o; }, { impressions: 0, clicks: 0, spend: 0, leads: 0, revenue: 0 });
      $('#ctab').innerHTML = `<table class="t"><thead><tr><th>Канал</th><th>Кампания</th>
        ${[['impressions', 'Показы'], ['clicks', 'Клики'], ['ctr', 'CTR'], ['spend', 'Расход'], ['leads', 'Лиды'], ['cpl', 'CPL'], ['cr', 'CR']].map(([k, l]) => `<th class="r" style="cursor:pointer" data-s="${k}">${l}${sort === k ? ' ↓' : ''}</th>`).join('')}</tr></thead><tbody>
        ${rows.map((c) => `<tr><td>${pchip(c.platform)}</td><td class="strong">${esc(c.campaign_name || c.campaign_id || '—')}</td><td class="r">${F.int(c.impressions)}</td><td class="r">${F.int(c.clicks)}</td><td class="r">${F.pct(c.ctr, 2)}</td><td class="r strong">${F.money(c.spend)}</td><td class="r strong">${F.int(c.leads)}</td><td class="r">${F.money(c.cpl)}</td><td class="r">${F.pct(c.cr, 1)}</td></tr>`).join('') || '<tr><td colspan="9"><div class="empty">Нет данных за период</div></td></tr>'}
        </tbody>${rows.length ? `<tfoot><tr><td colspan="2">Итого</td><td class="r">${F.int(tot.impressions)}</td><td class="r">${F.int(tot.clicks)}</td><td class="r">${F.pct(tot.clicks / tot.impressions * 100, 2)}</td><td class="r">${F.money(tot.spend)}</td><td class="r">${F.int(tot.leads)}</td><td class="r">${F.money(tot.leads ? tot.spend / tot.leads : null)}</td><td class="r">${F.pct(tot.leads / tot.clicks * 100, 1)}</td></tr></tfoot>` : ''}</table>`;
      $$('#ctab th[data-s]').forEach((th) => { th.onclick = () => { sort = th.dataset.s; draw(); }; });
    };
    const pls = [...new Set(s.byCampaign.map((c) => c.platform))];
    body.innerHTML = `<div class="row between" style="margin-bottom:16px">${periodSeg()}
        <select class="inp" id="cpf" style="width:auto">${opt('', 'Все каналы', '')}${pls.map((x) => opt(x, plat(x).label, '')).join('')}</select></div>
      <div class="card"><div class="table-wrap" id="ctab"></div></div>`;
    bindPeriod(body, () => tabCampaigns(body, p));
    $('#cpf').onchange = (e) => { filter = e.target.value; draw(); };
    draw();
  }

  // ---------- tasks ----------
  function taskForm(t = {}, { projectSelect } = {}) {
    const platforms = S.meta.platforms;
    return `<form class="form" id="tf">
      ${projectSelect ? `<label class="f">Проект<select class="inp" name="project_id" required>${opt('', '— выберите —', t.project_id)}${S.projects.filter((p) => p.status !== 'archived').map((p) => opt(p.id, p.name, t.project_id)).join('')}</select></label>` : ''}
      <label class="f">Задача<input class="inp" name="title" value="${esc(t.title)}" required></label>
      <label class="f">Описание<textarea class="inp" name="description">${esc(t.description)}</textarea></label>
      <div class="three">
        <label class="f">Направление<select class="inp" name="area">${S.meta.areas.map((a) => opt(a.id, a.label, t.area || 'ads')).join('')}</select></label>
        <label class="f">Канал<select class="inp" name="platform">${opt('', '—', t.platform)}${platforms.map((x) => opt(x.id, x.label, t.platform)).join('')}</select></label>
        <label class="f">Тип<select class="inp" name="type">${opt('task', 'Задача', t.type)}${opt('hypothesis', 'Гипотеза / тест', t.type)}${opt('report', 'Отчёт', t.type)}</select></label>
      </div>
      <div class="three">
        <label class="f">Исполнитель<select class="inp" name="assignee_id">${userOpts(t.id ? t.assignee_id : (t.assignee_id || S.me.id))}</select></label>
        <label class="f">Срок<input class="inp" type="date" name="due_date" value="${esc(t.due_date || '')}"></label>
        <label class="f">Приоритет<select class="inp" name="priority">${opt('normal', 'Обычный', t.priority)}${opt('high', 'Высокий', t.priority)}${opt('low', 'Низкий', t.priority)}</select></label>
      </div>
      <div class="two">
        <label class="f">Статус<select class="inp" name="status">${S.meta.taskStatuses.map((s) => opt(s.id, s.label, t.status || 'todo')).join('')}</select></label>
        <label class="checkline" style="align-self:end;padding-bottom:10px"><input type="checkbox" name="client_visible" ${t.client_visible === false ? '' : 'checked'}>Видно клиенту</label>
      </div>
      <label class="f">Результат <span class="help">для гипотез — что показал тест</span><textarea class="inp" name="result" style="min-height:60px">${esc(t.result)}</textarea></label>
      <div class="modal-foot">${t.id ? '<button type="button" class="btn danger ghost" id="tdel" style="margin-right:auto">Удалить</button>' : ''}<button class="btn primary">${t.id ? 'Сохранить' : 'Создать'}</button></div>
    </form>`;
  }

  function taskModal(t, after, opts = {}) {
    modal(t.id ? 'Задача' : 'Новая задача', taskForm(t, opts), {
      wide: true,
      onMount: (el, close) => {
        $('#tf', el).onsubmit = async (e) => {
          e.preventDefault();
          const b = formData(e.target);
          if (!opts.projectSelect) b.project_id = t.project_id;
          try { if (t.id) await put(`/tasks/${t.id}`, b); else await post('/tasks', b); close(); toast('Сохранено'); after(); } catch (err) { fail(err); }
        };
        if ($('#tdel', el)) $('#tdel', el).onclick = async () => { if (!confirm('Удалить задачу?')) return; try { await del(`/tasks/${t.id}`); close(); after(); } catch (err) { fail(err); } };
      },
    });
  }

  const userName = (id) => { const u = S.users.find((x) => x.id === id); return u ? (u.name || u.username) : ''; };
  const TYPE_ICON = { hypothesis: '🧪', report: '📄', task: '' };

  async function tabTasks(body, p) {
    const tasks = await get(`/tasks?project_id=${p.id}`);
    let area = '';
    const draw = () => {
      const list = tasks.filter((t) => !area || t.area === area);
      $('#kb').innerHTML = S.meta.taskStatuses.map((s) => {
        const items = list.filter((t) => t.status === s.id);
        return `<div class="kcol" data-s="${s.id}"><div class="kcol-head">${s.label}<span>${items.length}</span></div>
          ${items.map((t) => `<div class="tcard ${t.priority === 'high' ? 'high' : ''}" draggable="true" data-id="${t.id}">
            <div class="tt">${TYPE_ICON[t.type]} ${esc(t.title)}</div>
            <div class="meta"><span class="chip svc">${areaLabel(t.area)}</span>${t.platform ? pchip(t.platform) : ''}
            ${t.due_date ? `<span class="${t.status !== 'done' && t.due_date < today() ? 'overdue' : ''}">до ${F.dateShort(t.due_date)}</span>` : ''}
            ${t.assignee_name ? `<span>· ${esc(t.assignee_name)}</span>` : ''}${t.client_visible ? '' : '<span title="Не видно клиенту">🔒</span>'}</div>
          </div>`).join('')}</div>`;
      }).join('');
      $$('.tcard', body).forEach((c) => {
        c.onclick = () => taskModal(tasks.find((t) => t.id === +c.dataset.id), () => tabTasks(body, p));
        c.ondragstart = (e) => { e.dataTransfer.setData('text/plain', c.dataset.id); };
      });
      $$('.kcol', body).forEach((col) => {
        col.ondragover = (e) => { e.preventDefault(); col.classList.add('drop'); };
        col.ondragleave = () => col.classList.remove('drop');
        col.ondrop = async (e) => {
          e.preventDefault();
          col.classList.remove('drop');
          const t = tasks.find((x) => x.id === +e.dataTransfer.getData('text/plain'));
          if (!t || t.status === col.dataset.s) return;
          t.status = col.dataset.s;
          draw();
          try { await put(`/tasks/${t.id}`, { status: t.status }); } catch (err) { fail(err); tabTasks(body, p); }
        };
      });
    };
    body.innerHTML = `<div class="row between" style="margin-bottom:16px">
        <div class="seg" id="aseg"><button data-a="" class="active">Все</button>${S.meta.areas.map((a) => `<button data-a="${a.id}">${a.label}</button>`).join('')}</div>
        <button class="btn primary" id="nt">＋ Задача</button></div>
      <div class="kanban" id="kb"></div>
      <p class="faint" style="font-size:12px">Перетаскивайте карточки между колонками. 🧪 — гипотеза, 📄 — отчёт, 🔒 — не видно клиенту.</p>`;
    $$('#aseg button', body).forEach((b) => { b.onclick = () => { area = b.dataset.a; $$('#aseg button', body).forEach((x) => x.classList.toggle('active', x === b)); draw(); }; });
    $('#nt').onclick = () => taskModal({ project_id: p.id }, () => tabTasks(body, p));
    draw();
  }

  let taskScope = 'me';
  async function pageTasks(main) {
    const tasks = await get(`/tasks?open=1${taskScope === 'me' ? '&assignee=me' : ''}`);
    const t0 = today();
    const groups = [
      ['Просрочено', (t) => t.due_date && t.due_date < t0],
      ['Сегодня', (t) => t.due_date === t0],
      ['На этой неделе', (t) => t.due_date && t.due_date > t0 && t.due_date <= addDays(t0, 7)],
      ['Позже', (t) => t.due_date && t.due_date > addDays(t0, 7)],
      ['Без срока', (t) => !t.due_date],
    ];
    main.innerHTML = `<div class="page-head"><div><h1>Задачи</h1><div class="sub">Открытые задачи по всем проектам</div></div>
      <div class="row"><div class="seg" id="tsc"><button data-s="me" class="${taskScope === 'me' ? 'active' : ''}">Мои</button><button data-s="all" class="${taskScope === 'all' ? 'active' : ''}">Все</button></div><button class="btn primary" id="nt">＋ Задача</button></div></div>
      ${tasks.length ? groups.map(([label, fn]) => {
        const list = tasks.filter(fn);
        if (!list.length) return '';
        return `<div class="card tlist mt"><div class="card-head"><h3 class="${label === 'Просрочено' ? 'overdue' : ''}">${label}</h3><span class="hint">${list.length}</span></div><div class="table-wrap"><table class="t"><tbody>
          ${list.map((t) => `<tr class="click" data-id="${t.id}"><td style="width:28px"><span class="check" data-done="${t.id}" title="Отметить выполненной"></span></td>
            <td><b>${TYPE_ICON[t.type]} ${esc(t.title)}</b><div class="faint" style="font-size:12px">${esc(t.project_name)} · ${areaLabel(t.area)} · ${statusLabel(t.status)}</div></td>
            <td>${t.platform ? pchip(t.platform) : ''}</td><td class="muted">${esc(t.assignee_name || '')}</td>
            <td class="r nowrap ${t.due_date && t.due_date < t0 ? 'overdue' : ''}">${t.due_date ? F.date(t.due_date) : ''}</td></tr>`).join('')}
          </tbody></table></div></div>`;
      }).join('') : '<div class="card"><div class="empty"><span class="em">🌱</span>Открытых задач нет</div></div>'}`;
    $$('#tsc button', main).forEach((b) => { b.onclick = () => { taskScope = b.dataset.s; route(); }; });
    $('#nt').onclick = () => taskModal({}, route, { projectSelect: true });
    $$('tr[data-id]', main).forEach((tr) => {
      tr.onclick = (e) => {
        const t = tasks.find((x) => x.id === +tr.dataset.id);
        if (e.target.dataset.done) {
          e.stopPropagation();
          e.target.classList.add('on');
          e.target.textContent = '✓';
          put(`/tasks/${t.id}`, { status: 'done' }).then(() => { toast('Готово'); setTimeout(route, 400); }).catch(fail);
          return;
        }
        taskModal(t, route);
      };
    });
  }

  // ---------- SEO ----------
  const posCls = (p) => (!p ? 'pn' : p <= 3 ? 'p3' : p <= 10 ? 'p10' : p <= 30 ? 'p30' : 'pn');
  const posHtml = (p) => `<span class="pos ${posCls(p)}">${p || '—'}</span>`;
  const posDelta = (cur, prev) => {
    if (!prev) return '<span class="faint">—</span>';
    if (!cur) return '<span class="delta down">выпал</span>';
    const d = prev - cur;
    return d === 0 ? '<span class="delta flat">0</span>' : `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}</span>`;
  };

  async function tabSeo(body, p) {
    const s = await get(`/projects/${p.id}/seo`);
    let engine = 'all';
    const draw = () => {
      const kws = s.keywords.filter((k) => engine === 'all' || k.engine === engine);
      $('#kwt').innerHTML = `<table class="t"><thead><tr><th>Запрос</th><th>Группа</th><th class="r">Частота</th><th class="r">Позиция</th><th class="r">За 7 дней</th><th>Динамика</th><th>Страница</th><th></th></tr></thead><tbody>
        ${kws.map((k) => `<tr><td class="strong">${esc(k.keyword)} <span class="faint" style="font-weight:500;font-size:12px">${k.engine === 'google' ? 'Google' : 'Яндекс'}${k.region && k.region !== 213 ? ' · ' + k.region : ''}</span></td>
          <td class="muted">${esc(k.group_name || '')}</td><td class="r muted">${F.int(k.frequency)}</td>
          <td class="r">${k.date ? posHtml(k.position) : '<span class="faint">не проверен</span>'}</td><td class="r">${posDelta(k.position, k.prev_position)}</td>
          <td>${Charts.spark((k.history || []).map((h) => ({ p: h.p || 60 })), { max: 60 })}</td>
          <td class="faint" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">${esc((k.found_url || '').replace(/^https?:\/\/[^/]+/, '') || '')}</td>
          <td class="r"><button class="btn ghost sm" data-kdel="${k.id}" title="Удалить">×</button></td></tr>`).join('') || '<tr><td colspan="8"><div class="empty">Добавьте запросы для отслеживания</div></td></tr>'}
        </tbody></table>`;
      $$('[data-kdel]', body).forEach((b) => { b.onclick = async () => { if (!confirm('Удалить запрос и его историю?')) return; await del(`/projects/${p.id}/seo/keywords/${b.dataset.kdel}`).catch(fail); tabSeo(body, p); }; });
    };
    const dist = [['ТОП-3', s.top3, 'var(--chart-1)'], ['4–10', s.top10 - s.top3, '#6fb7ae'], ['11–30', s.top30 - s.top10, 'var(--warn)'], ['>30 / нет', s.total - s.top30, 'var(--line-strong)']];
    body.innerHTML = `
      <div class="row between" style="margin-bottom:16px">
        <div class="faint">${s.lastCheck ? `Последний съём: ${F.date(s.lastCheck)}` : 'Позиции ещё не снимались'}${s.lastRun && s.lastRun.status === 'running' ? ' · идёт проверка…' : ''}${s.configured ? '' : ' · <span class="overdue">Yandex Search API не настроен — доступен только CSV-импорт</span>'}</div>
        <div class="row"><button class="btn" id="simp">Импорт CSV</button><button class="btn" id="schk" ${s.configured ? '' : 'disabled'}>Снять позиции</button><button class="btn primary" id="skw">＋ Запросы</button></div>
      </div>
      <div class="grid g-4">
        <div class="card kpi"><div class="label">В ТОП-10</div><div class="value">${s.top10} <small>из ${s.total}</small></div><div class="foot">${F.pct(s.total ? s.top10 / s.total * 100 : null)} запросов</div></div>
        <div class="card kpi"><div class="label">В ТОП-3</div><div class="value">${s.top3}</div><div class="foot">${F.pct(s.total ? s.top3 / s.total * 100 : null)} запросов</div></div>
        <div class="card kpi"><div class="label">Средняя позиция</div><div class="value">${F.dec(s.avgPosition)}</div><div class="foot">среди найденных</div></div>
        <div class="card kpi"><div class="label">За неделю</div><div class="value"><span class="delta up" style="font-size:24px">▲${s.improved}</span> <span class="delta down" style="font-size:24px">▼${s.dropped}</span></div><div class="foot">выросли / упали</div></div>
      </div>
      <div class="grid g-2 mt">
        <div class="card"><div class="card-head"><h3>Органический трафик</h3><span class="hint">визиты из поиска по неделям · Метрика</span></div><div class="chart" id="org"></div></div>
        <div class="card"><div class="card-head"><h3>Распределение позиций</h3></div>
          <div style="display:flex;height:22px;border-radius:999px;overflow:hidden;gap:2px;margin:18px 0 6px">${dist.map(([l, v, c]) => (v ? `<div title="${l}: ${v}" style="flex:${v};background:${c}"></div>` : '')).join('')}</div>
          <div class="legend">${dist.map(([l, v, c]) => `<span><i style="background:${c}"></i>${l}: <b>${v}</b></span>`).join('')}</div>
        </div>
      </div>
      <div class="card mt"><div class="card-head"><h3>Запросы</h3><div class="seg" id="eseg"><button data-e="all" class="active">Все</button><button data-e="yandex">Яндекс</button><button data-e="google">Google</button></div></div><div class="table-wrap" id="kwt"></div></div>`;
    if (s.organic.length) Charts.bars($('#org'), s.organic.map((w) => ({ x: w.week, y: w.visits, leads: w.leads })), { height: 190, axisFmt: F.moneyShort, tip: (x) => `Неделя с ${F.date(x.x)}<br>Визиты <b>${F.int(x.y)}</b><br>Цели <b>${F.int(x.leads)}</b>` });
    else $('#org').innerHTML = '<div class="empty">Подключите Яндекс Метрику на вкладке «Каналы и данные»</div>';
    $$('#eseg button', body).forEach((b) => { b.onclick = () => { engine = b.dataset.e; $$('#eseg button', body).forEach((x) => x.classList.toggle('active', x === b)); draw(); }; });
    $('#skw').onclick = () => modal('Добавить запросы', `<form class="form" id="kf">
        <label class="f">Запросы <span class="help">по одному в строке</span><textarea class="inp" name="keywords" style="min-height:160px" required></textarea></label>
        <div class="three"><label class="f">Поисковик<select class="inp" name="engine">${opt('yandex', 'Яндекс')}${opt('google', 'Google (CSV)')}</select></label>
        <label class="f">Регион Яндекса<input class="inp" name="region" value="213"><span class="help">213 — Москва, 2 — СПб, 162 — Алматы</span></label>
        <label class="f">Группа<input class="inp" name="group_name"></label></div>
        <div class="modal-foot"><button class="btn primary">Добавить</button></div></form>`, {
      onMount: (el, close) => { $('#kf', el).onsubmit = async (e) => { e.preventDefault(); try { const r = await post(`/projects/${p.id}/seo/keywords`, formData(e.target)); close(); toast(`Добавлено: ${r.added}`); tabSeo(body, p); } catch (err) { fail(err); } }; },
    });
    $('#schk').onclick = async () => { try { await post(`/projects/${p.id}/seo/check`); toast('Проверка запущена — обновите вкладку через пару минут'); } catch (e) { fail(e); } };
    $('#simp').onclick = () => modal('Импорт позиций', `<form class="form" id="if">
        <p class="muted" style="margin:0">Для Google или выгрузок из Topvisor / SE Ranking. Формат строки: <span class="code">запрос;google;2026-09-30;7;https://site/page</span> (позиция пустая — не найден).</p>
        <textarea class="inp" name="csv" style="min-height:200px" required></textarea>
        <div class="modal-foot"><button class="btn primary">Импортировать</button></div></form>`, {
      onMount: (el, close) => { $('#if', el).onsubmit = async (e) => { e.preventDefault(); try { const r = await post(`/projects/${p.id}/seo/import`, formData(e.target)); close(); toast(`Импортировано строк: ${r.rows}`); tabSeo(body, p); } catch (err) { fail(err); } }; },
    });
    draw();
  }

  // ---------- GEO ----------
  const engLabel = (id) => ({ openai: 'ChatGPT', perplexity: 'Perplexity', gemini: 'Gemini', anthropic: 'Claude', deepseek: 'DeepSeek', yandexgpt: 'YandexGPT' }[id] || id);

  async function tabGeo(body, p) {
    const g = await get(`/projects/${p.id}/geo`);
    const enabled = g.enginesAvailable.filter((e) => e.enabled);
    const ORDER = g.enginesAvailable.map((e) => e.id);
    const engines = [...new Set([...g.engines, ...enabled.map((e) => e.id)])].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    body.innerHTML = `
      <div class="row between" style="margin-bottom:16px">
        <div class="faint">${g.lastCheck ? `Последняя проверка: ${F.dateTime(g.lastCheck)}` : 'Проверок ещё не было'}${g.lastRun && g.lastRun.status === 'running' ? ' · идёт проверка…' : ''}
          · движки: ${g.enginesAvailable.map((e) => `<span class="chip ${e.enabled ? 'good' : ''}" style="padding:1px 8px">${e.label}</span>`).join(' ')}</div>
        <div class="row"><button class="btn" id="gchk" ${enabled.length ? '' : 'disabled title="Лидер Performance подключает AI-движки в разделе «Сервисы и ключи»"'}>Проверить сейчас</button><button class="btn primary" id="gadd">＋ Промпты</button></div>
      </div>
      <div class="grid g-4">
        <div class="card kpi"><div class="label">Видимость в AI</div><div class="value">${F.pct(g.visibility)}</div><div class="foot">ответов упоминают бренд</div></div>
        <div class="card kpi"><div class="label">Доля голоса</div><div class="value">${F.pct(g.shareOfVoice)}</div><div class="foot">среди упоминаний бренда и конкурентов</div></div>
        <div class="card kpi"><div class="label">Цитирование сайта</div><div class="value">${F.pct(g.citedRate)}</div><div class="foot">сайт в источниках ответа</div></div>
        <div class="card kpi"><div class="label">Среднее место</div><div class="value">${F.dec(g.avgRank)}</div><div class="foot">порядок упоминания среди брендов</div></div>
      </div>
      <div class="grid g-2 mt">
        <div class="card"><div class="card-head"><h3>Видимость по неделям</h3></div><div class="chart" id="gtr"></div></div>
        <div class="card"><div class="card-head"><h3>Бренд vs конкуренты</h3><span class="hint">сколько ответов упоминают</span></div><div id="gcomp"></div></div>
      </div>
      <div class="card mt"><div class="card-head"><h3>Промпты × AI-движки</h3><span class="hint">✓ упомянут · ★ упомянут и сайт в источниках · цифра — место среди брендов · клик — ответ целиком</span></div>
        <div class="table-wrap"><table class="t matrix"><thead><tr><th>Промпт</th>${engines.map((e) => `<th class="r" style="text-align:center">${engLabel(e)}</th>`).join('')}<th></th></tr></thead><tbody>
        ${g.prompts.map((pr) => `<tr style="${pr.active ? '' : 'opacity:.5'}"><td style="min-width:260px"><b>${esc(pr.prompt)}</b>${pr.topic ? `<div class="faint" style="font-size:12px">${esc(pr.topic)}</div>` : ''}</td>
          ${engines.map((e) => {
            const c = g.matrix.find((m) => m.prompt_id === pr.id && m.engine === e);
            if (!c) return '<td class="cell"><span class="mcell none">·</span></td>';
            return `<td class="cell"><span class="mcell ${c.cited ? 'cited' : c.mentioned ? 'yes' : 'no'}" data-c="${c.id}" title="${c.competitors.length ? 'Конкуренты: ' + esc(c.competitors.join(', ')) : ''}">${c.cited ? '★' : c.mentioned ? '✓' : '—'}${c.rank ? ' ' + c.rank : ''}</span></td>`;
          }).join('')}
          <td class="r nowrap"><button class="btn ghost sm" data-gt="${pr.id}" data-on="${pr.active ? 0 : 1}">${pr.active ? 'Пауза' : 'Вкл'}</button><button class="btn ghost sm" data-gd="${pr.id}">×</button></td></tr>`).join('') || `<tr><td colspan="${engines.length + 2}"><div class="empty">Добавьте промпты — вопросы, которые клиенты задают AI-ассистентам</div></td></tr>`}
        </tbody></table></div></div>
      <div class="grid g-2 mt">
        <div class="card"><div class="card-head"><h3>Что цитируют AI</h3><span class="hint">домены-источники в ответах — площадки для публикаций</span></div><div id="gsrc"></div></div>
        <div class="card"><div class="card-head"><h3>Трафик из AI на сайт</h3><span class="hint">30 дней · Метрика</span></div><div id="gai"></div></div>
      </div>`;
    if (g.trend.length) Charts.line($('#gtr'), g.trend.map((t) => ({ x: t.week, y: t.visibility, n: t.checks })), { height: 190, yMax: 100, axisFmt: (v) => v + '%', area: true, tip: (x) => `Неделя с ${F.date(x.x)}<br>Видимость <b>${F.pct(x.y)}</b><br>${x.n} проверок` });
    else $('#gtr').innerHTML = '<div class="empty">Нет данных</div>';
    const brandRow = { label: p.brand_terms[0] || p.name, value: g.matrix.filter((m) => m.mentioned).length, color: 'var(--kf-coral)' };
    Charts.hbars($('#gcomp'), [brandRow, ...g.competitors.slice(0, 7).map((c) => ({ label: c.name, value: c.count }))].sort((a, b) => b.value - a.value).map((r) => ({ ...r, valueText: `${r.value}`, sub: g.checks ? F.pct(r.value / g.checks * 100) : '' })), { empty: 'Нет проверок' });
    Charts.hbars($('#gsrc'), g.topSources.map((s) => ({ label: s.host, value: s.count, valueText: s.count, color: s.host === (p.site_url || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*/, '') ? 'var(--kf-coral)' : null })), { empty: 'Движки не вернули источников' });
    Charts.hbars($('#gai'), g.aiTraffic.map((s) => ({ label: s.name, value: s.visits, valueText: F.int(s.visits), sub: s.leads ? `${F.int(s.leads)} целей` : '' })), { empty: 'Нет переходов из AI-сервисов (или Метрика не подключена)' });
    $$('[data-c]', body).forEach((c) => { c.onclick = () => geoAnswer(p, +c.dataset.c); });
    $$('[data-gt]', body).forEach((b) => { b.onclick = async () => { await put(`/projects/${p.id}/geo/prompts/${b.dataset.gt}`, { active: b.dataset.on === '1' }).catch(fail); tabGeo(body, p); }; });
    $$('[data-gd]', body).forEach((b) => { b.onclick = async () => { if (!confirm('Удалить промпт и историю проверок?')) return; await del(`/projects/${p.id}/geo/prompts/${b.dataset.gd}`).catch(fail); tabGeo(body, p); }; });
    $('#gchk').onclick = async () => { try { await post(`/projects/${p.id}/geo/check`); toast('Проверка запущена — результаты появятся через несколько минут'); } catch (e) { fail(e); } };
    $('#gadd').onclick = () => modal('Добавить промпты', `<form class="form" id="gf">
        <p class="muted" style="margin:0">Формулируйте как реальный клиент: «Какую клинику выбрать для чекапа в Москве?». Бренд в промпт не включайте.</p>
        <label class="f">Промпты <span class="help">по одному в строке</span><textarea class="inp" name="prompts" style="min-height:160px" required></textarea></label>
        <label class="f">Тема<input class="inp" name="topic" placeholder="напр. «Выбор клиники»"></label>
        <div class="modal-foot"><button class="btn primary">Добавить</button></div></form>`, {
      onMount: (el, close) => { $('#gf', el).onsubmit = async (e) => { e.preventDefault(); try { await post(`/projects/${p.id}/geo/prompts`, formData(e.target)); close(); tabGeo(body, p); } catch (err) { fail(err); } }; },
    });
  }

  async function geoAnswer(p, id) {
    const c = await get(`/projects/${p.id}/geo/checks/${id}`).catch(fail);
    if (!c) return;
    const terms = [...(p.brand_terms || []), p.name].filter(Boolean);
    let html = esc(c.answer || '');
    terms.forEach((t) => { html = html.replace(new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark>${m}</mark>`); });
    modal(`${engLabel(c.engine)}: ответ`, `
      <p style="margin-top:0"><b>${esc(c.prompt)}</b></p>
      <div class="row" style="margin-bottom:12px">${c.mentioned ? '<span class="chip good">бренд упомянут</span>' : '<span class="chip bad">бренда нет</span>'}${c.cited ? '<span class="chip good">сайт в источниках</span>' : ''}${c.rank ? `<span class="chip">место ${c.rank}</span>` : ''}<span class="faint">${F.dateTime(c.checked_at)}</span></div>
      <div class="answer">${html || '<span class="faint">Пустой ответ</span>'}</div>
      ${c.sources.length ? `<p class="muted" style="font-size:12.5px"><b>Источники:</b> ${c.sources.map(esc).join(', ')}</p>` : ''}
      ${c.competitors.length ? `<p class="muted" style="font-size:12.5px"><b>Конкуренты в ответе:</b> ${c.competitors.map(esc).join(', ')}</p>` : ''}
      ${c.history.length > 1 ? `<p class="faint" style="font-size:12px">История: ${c.history.map((h) => `${F.dateShort(h.checked_at.slice(0, 10))} ${h.cited ? '★' : h.mentioned ? '✓' : '—'}`).join(' · ')}</p>` : ''}`, { wide: true });
  }

  // ---------- changelog ----------
  async function tabLog(body, p) {
    const list = await get(`/projects/${p.id}/changelog`);
    body.innerHTML = `<div class="grid g-21">
      <div class="card"><div class="card-head"><h3>Журнал изменений</h3><span class="hint">что и когда меняли — чтобы связывать изменения с результатом</span></div>
        ${list.length ? `<div class="table-wrap"><table class="t"><tbody>${list.map((c) => `<tr><td class="nowrap faint" style="width:80px">${F.date(c.date)}</td>
          <td><div>${esc(c.text)}</div><div class="faint" style="font-size:12px">${areaLabel(c.area)}${c.author_name ? ' · ' + esc(c.author_name) : ''}${c.client_visible ? '' : ' · 🔒 только команда'}</div></td>
          <td>${c.platform ? pchip(c.platform) : ''}</td><td class="r"><button class="btn ghost sm" data-d="${c.id}">×</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><span class="em">📝</span>Записей пока нет</div>'}
      </div>
      <div class="card"><h3 style="margin-bottom:14px">Новая запись</h3><form class="form" id="lf">
        <label class="f">Что сделали<textarea class="inp" name="text" required placeholder="Подняли ставки в поиске на 15%…"></textarea></label>
        <div class="two"><label class="f">Дата<input class="inp" type="date" name="date" value="${today()}"></label>
        <label class="f">Направление<select class="inp" name="area">${S.meta.areas.map((a) => opt(a.id, a.label, 'ads')).join('')}</select></label></div>
        <label class="f">Канал<select class="inp" name="platform">${opt('', '—', '')}${S.meta.platforms.map((x) => opt(x.id, x.label, '')).join('')}</select></label>
        <label class="checkline"><input type="checkbox" name="client_visible" checked>Видно клиенту</label>
        <button class="btn primary">Добавить</button></form></div></div>`;
    $('#lf').onsubmit = async (e) => { e.preventDefault(); try { await post(`/projects/${p.id}/changelog`, formData(e.target)); tabLog(body, p); } catch (err) { fail(err); } };
    $$('[data-d]', body).forEach((b) => { b.onclick = async () => { if (!confirm('Удалить запись?')) return; await del(`/projects/${p.id}/changelog/${b.dataset.d}`).catch(fail); tabLog(body, p); }; });
  }

  // ---------- «Секретики» ----------
  async function tabSecrets(body, p) {
    const d = await get(`/projects/${p.id}/secrets`);
    body.innerHTML = `<div class="card secrets-card">
      <div class="card-head"><h3>🔒 Секретики — критичная информация проекта</h3>
        <span class="hint">${d.updated_at ? `изменено ${F.dateTime(d.updated_at)}${d.updated_by ? ' · ' + esc(d.updated_by) : ''}` : 'пока пусто'}</span></div>
      <p class="muted" style="margin:0 0 12px;font-size:13px">Логины, почты, пароли, доступы к кабинетам и сайту — всё, что раньше пересылали в чатах. Видит и правит команда проекта. Хранится зашифрованным отдельно от остальных данных, клиенту не показывается; каждая правка попадает в историю (её видят админ, лидер Performance и менеджер проекта).</p>
      <textarea class="inp secrets-text" id="sec-text" spellcheck="false" autocomplete="off" placeholder="Например:&#10;&#10;Хостинг — login@example.com / пароль&#10;Регистратор домена — …&#10;Яндекс Директ (логин клиента) — …&#10;Instagram Business — …">${esc(d.secrets)}</textarea>
      <div class="row between mt">
        <div class="row">${d.canSeeLog ? '<button class="btn ghost sm" id="sec-log-btn">🕓 История правок</button>' : ''}<span class="faint" id="sec-state" style="font-size:12px"></span></div>
        <button class="btn primary" id="sec-save">Сохранить</button>
      </div>
      <div id="sec-log" class="hidden mt"></div>
    </div>`;
    const ta = $('#sec-text');
    let saved = d.secrets;
    const state = () => { $('#sec-state').textContent = ta.value !== saved ? 'есть несохранённые изменения' : ''; };
    ta.addEventListener('input', state);
    const save = async () => {
      try { await put(`/projects/${p.id}/secrets`, { secrets: ta.value }); saved = ta.value; state(); toast('Секретики сохранены'); if (!$('#sec-log').classList.contains('hidden')) loadLog(); } catch (e) { fail(e); }
    };
    $('#sec-save').onclick = save;
    ta.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } });
    const loadLog = async () => {
      const box = $('#sec-log');
      box.innerHTML = '<div class="faint">Загружаем…</div>';
      try {
        const log = await get(`/projects/${p.id}/secrets/log`);
        box.innerHTML = log.length ? log.map((e) => `<div class="sec-log-entry">
            <div class="row between" style="font-size:12px;margin-bottom:6px"><b>${esc(e.actor || '—')}</b><span class="faint">${F.dateTime(e.changed_at)}</span></div>
            <div class="sec-diff"><div><div class="sec-lbl">Было</div><pre class="old">${e.old ? esc(e.old) : '(пусто)'}</pre></div><div><div class="sec-lbl">Стало</div><pre class="new">${e.new ? esc(e.new) : '(пусто)'}</pre></div></div>
          </div>`).join('') : '<div class="faint">Правок пока не было.</div>';
      } catch (e) { box.innerHTML = ''; fail(e); }
    };
    if ($('#sec-log-btn')) $('#sec-log-btn').onclick = () => {
      const box = $('#sec-log');
      const open = box.classList.toggle('hidden') === false;
      $('#sec-log-btn').textContent = open ? '🕓 Скрыть историю' : '🕓 История правок';
      if (open) loadLog();
    };
    window.onbeforeunload = () => (ta.isConnected && ta.value !== saved ? true : undefined);
  }

  // ---------- channels / integrations ----------
  async function tabChannels(body, p) {
    const [list, runs] = await Promise.all([get(`/projects/${p.id}/integrations`), get(`/projects/${p.id}/syncs`)]);
    const stCh = (i) => ({
      ok: '<span class="chip good">синхронизировано</span>', error: '<span class="chip bad">ошибка</span>', never: '<span class="chip warn">ещё не синхронизировано</span>',
      manual: '<span class="chip">ручной ввод / CSV</span>',
    }[i.status] || '');
    body.innerHTML = `<div class="grid g-21">
      <div class="card"><div class="card-head"><h3>Подключённые каналы</h3><button class="btn primary sm" id="ai">＋ Подключить канал</button></div>
        ${list.length ? list.map((i) => {
          const pl = plat(i.platform);
          return `<div class="integ"><div class="logo" style="background:${pl.color};color:${inkOn(pl.color)}">${esc(pl.short.slice(0, 2))}</div>
            <div><div class="row" style="gap:8px"><b>${esc(i.title || pl.label)}</b>${stCh(i)}${i.enabled ? '' : '<span class="chip">выключен</span>'}${i.settings && i.settings.demo ? '<span class="chip warn">демо-данные</span>' : ''}</div>
              <div class="meta">${esc(pl.label)} · обновлено ${F.ago(i.last_sync_at)}${i.first_date ? ` · данные ${F.date(i.first_date)} — ${F.date(i.last_date)}` : ' · данных нет'}</div>
              ${i.status === 'error' && i.last_error ? `<div class="err">${esc(i.last_error)}</div>` : ''}</div>
            <div class="row" style="gap:4px;justify-content:flex-end">
              ${i.hasApi && i.credKeys.length ? `<button class="btn sm" data-sync="${i.id}">Обновить</button><button class="btn ghost sm" data-test="${i.id}">Проверить</button>` : ''}
              ${i.platform !== 'metrika' ? `<button class="btn ghost sm" data-csv="${i.id}">CSV</button><button class="btn ghost sm" data-man="${i.id}">＋ день</button>` : ''}
              <button class="btn ghost sm" data-edit="${i.id}">⚙</button></div></div>`;
        }).join('') : '<div class="empty"><span class="em">🔌</span>Подключите рекламные кабинеты и Метрику</div>'}
      </div>
      <div class="card"><div class="card-head"><h3>История обновлений</h3></div>
        ${runs.length ? `<div class="table-wrap"><table class="t"><tbody>${runs.map((r) => `<tr><td class="faint nowrap" style="font-size:12px">${F.dateTime(r.started_at)}</td>
          <td style="font-size:12.5px"><b>${r.kind === 'ads' ? esc(r.title || plat(r.platform).label) : r.kind.toUpperCase()}</b>${r.error && r.status !== 'error' ? ` <span class="faint">${esc(r.error)}</span>` : ''}${r.status === 'error' ? `<div class="err" style="color:var(--bad);font-size:12px">${esc((r.error || '').slice(0, 140))}</div>` : ''}</td>
          <td class="r">${r.status === 'ok' ? `<span class="chip good">${r.rows ?? ''}</span>` : r.status === 'running' ? '<span class="chip warn">идёт</span>' : '<span class="chip bad">ошибка</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Пока пусто</div>'}
      </div></div>`;
    const reload = () => tabChannels(body, p);
    $('#ai').onclick = () => integrationModal(p, null, reload);
    $$('[data-edit]', body).forEach((b) => { b.onclick = () => integrationModal(p, list.find((i) => i.id === +b.dataset.edit), reload); });
    $$('[data-sync]', body).forEach((b) => {
      b.onclick = async () => {
        b.disabled = true; b.textContent = 'Обновляю…';
        try { const r = await post(`/projects/${p.id}/integrations/${b.dataset.sync}/sync`); toast(`Загружено строк: ${r.rows} (${F.date(r.from)} — ${F.date(r.to)})`); } catch (e) { fail(e); }
        reload();
      };
    });
    $$('[data-test]', body).forEach((b) => { b.onclick = async () => { b.disabled = true; try { const r = await post(`/projects/${p.id}/integrations/${b.dataset.test}/test`); toast(r.message, !r.ok); } catch (e) { fail(e); } b.disabled = false; }; });
    $$('[data-csv]', body).forEach((b) => {
      b.onclick = () => modal('Импорт статистики из CSV', `<form class="form" id="cf">
        <p class="muted" style="margin:0">Первая строка — заголовки. Понимаем: <span class="code">дата; кампания; показы; клики; расход; лиды; выручка</span> (или date, campaign, impressions, clicks, spend, leads, revenue). Разделитель ; , или таб. Повторная загрузка тех же дней перезаписывает их.</p>
        <label class="f">Файл<input class="inp" type="file" accept=".csv,.tsv,.txt" id="cfile"></label>
        <label class="f">…или вставьте текст<textarea class="inp" name="csv" style="min-height:180px" placeholder="дата;кампания;показы;клики;расход;лиды&#10;01.09.2026;Посевы в каналах;120000;950;48000;31"></textarea></label>
        <div class="modal-foot"><button class="btn primary">Загрузить</button></div></form>`, {
        onMount: (el, close) => {
          $('#cfile', el).onchange = async (e) => { const f = e.target.files[0]; if (f) $('[name=csv]', el).value = await f.text(); };
          $('#cf', el).onsubmit = async (e) => {
            e.preventDefault();
            try { const r = await post(`/projects/${p.id}/integrations/${b.dataset.csv}/import`, formData(e.target)); close(); toast(`Загружено строк: ${r.rows}${r.errors.length ? `, пропущено: ${r.errors.length}` : ''}`); reload(); } catch (err) { fail(err); }
          };
        },
      });
    });
    $$('[data-man]', body).forEach((b) => {
      b.onclick = () => modal('Данные за день', `<form class="form" id="mf">
        <div class="two"><label class="f">Дата<input class="inp" type="date" name="date" value="${addDays(today(), -1)}" required></label><label class="f">Кампания<input class="inp" name="campaign" placeholder="необязательно"></label></div>
        <div class="three"><label class="f">Показы<input class="inp" name="impressions" inputmode="numeric"></label><label class="f">Клики<input class="inp" name="clicks" inputmode="numeric"></label><label class="f">Расход, ₽<input class="inp" name="spend" inputmode="decimal"></label></div>
        <div class="two"><label class="f">Лиды<input class="inp" name="leads" inputmode="numeric"></label><label class="f">Выручка, ₽<input class="inp" name="revenue" inputmode="decimal"></label></div>
        <div class="modal-foot"><button class="btn primary">Сохранить</button></div></form>`, {
        onMount: (el, close) => { $('#mf', el).onsubmit = async (e) => { e.preventDefault(); const v = formData(e.target); ['impressions', 'clicks', 'spend', 'leads', 'revenue'].forEach((k) => { v[k] = String(v[k]).replace(/\s/g, '').replace(',', '.'); }); try { await post(`/projects/${p.id}/integrations/${b.dataset.man}/manual`, v); close(); toast('Сохранено'); reload(); } catch (err) { fail(err); } }; },
      });
    });
  }

  function integrationModal(p, i, after) {
    const isNew = !i;
    let platform = i ? i.platform : 'yandex_direct';
    const fieldsHtml = () => {
      const c = S.meta.connectors[platform];
      const pl = plat(platform);
      if (!c) return `<div class="alert low"><span class="lvl">CSV</span><div>У «${esc(pl.label)}» нет открытого API статистики. Данные загружаются выгрузкой CSV из кабинета или вводом по дням — кнопки «CSV» и «＋ день» в списке каналов.</div></div>${KF_GUIDES.html(platform, { open: true })}`;
      return `<div class="alert low"><span class="lvl">API</span><div>Данные будут подтягиваться автоматически.</div></div>${KF_GUIDES.html(platform, { open: isNew })}
        ${c.fields.map((f) => `<label class="f">${esc(f.label)}${f.secret && i && i.credKeys.includes(f.key) ? ' <span class="help">сохранено — оставьте пустым, чтобы не менять</span>' : ''}
          <input class="inp" name="cred_${f.key}" ${f.secret ? 'type="password" autocomplete="new-password"' : ''} value="${f.secret ? '' : ''}" ${f.required && isNew ? 'required' : ''}></label>`).join('')}
        ${c.settingsFields.map((f) => `<label class="f">${esc(f.label)}<input class="inp" name="set_${f.key}" value="${esc((i && i.settings && i.settings[f.key]) || '')}" placeholder="${esc(f.placeholder || '')}"></label>`).join('')}`;
    };
    modal(isNew ? 'Подключить канал' : `Канал: ${plat(platform).label}`, `<form class="form" id="inf">
      ${isNew ? `<label class="f">Площадка<select class="inp" name="platform" id="ipl">${S.meta.platforms.map((x) => opt(x.id, `${x.label}${x.sync === 'api' ? '' : ' — CSV / вручную'}`, platform)).join('')}</select></label>` : ''}
      <label class="f">Название <span class="help">напр. «Директ — агентский кабинет»</span><input class="inp" name="title" value="${esc(i ? i.title : '')}"></label>
      <div id="ifields" class="form">${fieldsHtml()}</div>
      ${!isNew ? `<label class="checkline"><input type="checkbox" name="enabled" ${i.enabled ? 'checked' : ''}>Включён (участвует в автообновлении)</label>` : ''}
      <div class="modal-foot">${!isNew ? '<button type="button" class="btn danger ghost" id="idel" style="margin-right:auto">Удалить с данными</button>' : ''}<button class="btn primary">${isNew ? 'Подключить' : 'Сохранить'}</button></div></form>`, {
      onMount: (el, close) => {
        if ($('#ipl', el)) $('#ipl', el).onchange = (e) => { platform = e.target.value; $('#ifields', el).innerHTML = fieldsHtml(); };
        $('#inf', el).onsubmit = async (e) => {
          e.preventDefault();
          const v = formData(e.target);
          const credentials = {};
          const settings = { ...(i ? i.settings : {}) };
          Object.entries(v).forEach(([k, val]) => {
            if (k.startsWith('cred_')) credentials[k.slice(5)] = val.trim();
            if (k.startsWith('set_')) settings[k.slice(4)] = val.trim();
          });
          try {
            if (isNew) {
              const r = await post(`/projects/${p.id}/integrations`, { platform, title: v.title, credentials, settings });
              close();
              if (r.hasApi && r.credKeys.length) {
                toast('Подключено, загружаю статистику…');
                await post(`/projects/${p.id}/integrations/${r.id}/sync`).then((x) => toast(`Загружено строк: ${x.rows}`)).catch(fail);
              } else toast('Канал добавлен');
            } else {
              await put(`/projects/${p.id}/integrations/${i.id}`, { title: v.title, credentials, settings, enabled: v.enabled });
              close();
              toast('Сохранено');
            }
            after();
          } catch (err) { fail(err); }
        };
        if ($('#idel', el)) $('#idel', el).onclick = async () => {
          if (!confirm('Удалить канал вместе со всей загруженной статистикой?')) return;
          try { await del(`/projects/${p.id}/integrations/${i.id}`); close(); after(); } catch (err) { fail(err); }
        };
      },
    });
  }

  // ---------- plan ----------
  async function tabPlan(body, p, month) {
    month = month || monthStart(today());
    const [plans, integ] = await Promise.all([get(`/projects/${p.id}/plans?month=${month}`), get(`/projects/${p.id}/integrations`)]);
    const platforms = [...new Set(integ.map((i) => i.platform).filter((x) => x !== 'metrika'))];
    const rowFor = (pl) => plans.rows.find((r) => r.platform === pl) || {};
    const months = [addDays(monthStart(today()), 40), monthStart(today()), prevMonth(today()), prevMonth(prevMonth(today()))].map(monthStart);
    const line = (pl, label) => { const r = rowFor(pl); return `<tr data-pl="${pl}"><td class="strong">${label}</td>
      <td><input class="inp num" name="budget" value="${r.budget ?? ''}" inputmode="decimal"></td><td><input class="inp num" name="leads" value="${r.leads ?? ''}" inputmode="numeric"></td>
      <td><input class="inp num" name="cpl_target" value="${r.cpl_target ?? ''}" inputmode="decimal"></td><td><input class="inp num" name="revenue" value="${r.revenue ?? ''}" inputmode="decimal"></td></tr>`; };
    body.innerHTML = `<div class="card">
      <div class="card-head"><h3>План / KPI на месяц</h3><select class="inp" id="pm" style="width:auto">${months.map((m) => opt(m, F.month(m), month)).join('')}</select></div>
      <div class="table-wrap"><table class="t" id="pt"><thead><tr><th>Уровень</th><th>Бюджет, ₽</th><th>Лиды</th><th>Целевой CPL, ₽</th><th>Выручка, ₽</th></tr></thead><tbody>
        ${line('', 'Проект целиком')}${platforms.map((x) => line(x, plat(x).label)).join('')}
      </tbody></table></div>
      <p class="faint" style="font-size:12px">План по проекту — основа пейсинга и сигналов. Разбивка по каналам — по желанию. Пустые строки не сохраняются.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn primary" id="psave">Сохранить план</button></div></div>`;
    $('#pm').onchange = (e) => tabPlan(body, p, e.target.value);
    $('#psave').onclick = async () => {
      const rows = $$('#pt tr[data-pl]').map((tr) => ({ platform: tr.dataset.pl, ...Object.fromEntries($$('input', tr).map((x) => [x.name, x.value.replace(/\s/g, '').replace(',', '.')])) }));
      try { await put(`/projects/${p.id}/plans`, { month, rows }); toast('План сохранён'); } catch (e) { fail(e); }
    };
  }

  // ---------- cross-project SEO / GEO ----------
  async function pageSeoAll(main) {
    const d = await get(`/overview`);
    const list = d.projects.filter((p) => p.services.includes('seo'));
    main.innerHTML = `<div class="page-head"><div><h1>SEO</h1><div class="sub">Позиции и органика по проектам</div></div></div>
      <div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Проект</th><th class="r">Запросов</th><th class="r">В ТОП-10</th><th class="r">Доля ТОП-10</th><th class="r">Средняя позиция</th><th class="r">Задачи SEO</th></tr></thead><tbody>
      ${list.map((p) => `<tr class="click" data-href="#/p/${p.id}/seo"><td class="pname">${esc(p.name)}<small>${esc(p.client_name || '')}</small></td><td class="r">${p.seo.total}</td><td class="r strong">${p.seo.top10}</td>
        <td class="r"><span class="mini-bar"><span style="width:${p.seo.total ? p.seo.top10 / p.seo.total * 100 : 0}%"></span></span> ${F.pct(p.seo.total ? p.seo.top10 / p.seo.total * 100 : null)}</td><td class="r">${F.dec(p.seo.avgPosition)}</td><td class="r">${p.tasks.open}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">Нет проектов с услугой SEO — включите её в настройках проекта</div></td></tr>'}
      </tbody></table></div></div>`;
    $$('tr[data-href]', main).forEach((tr) => { tr.onclick = () => { location.hash = tr.dataset.href; }; });
  }

  async function pageGeoAll(main) {
    const d = await get(`/overview`);
    const list = d.projects.filter((p) => p.services.includes('geo'));
    main.innerHTML = `<div class="page-head"><div><h1>GEO / AI</h1><div class="sub">Видимость брендов в ответах ChatGPT, Perplexity, Gemini, Алисы и других</div></div></div>
      <div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Проект</th><th class="r">Проверок</th><th class="r">Видимость</th><th class="r">Доля голоса</th></tr></thead><tbody>
      ${list.map((p) => `<tr class="click" data-href="#/p/${p.id}/geo"><td class="pname">${esc(p.name)}<small>${esc(p.client_name || '')}</small></td><td class="r">${p.geo.checks}</td>
        <td class="r strong"><span class="mini-bar"><span style="width:${p.geo.visibility || 0}%"></span></span> ${F.pct(p.geo.visibility)}</td><td class="r">${F.pct(p.geo.shareOfVoice)}</td></tr>`).join('') || '<tr><td colspan="4"><div class="empty">Нет проектов с услугой GEO</div></td></tr>'}
      </tbody></table></div></div>
      <div class="card mt"><h3>Как читать</h3><p class="muted" style="margin-bottom:0"><b>Видимость</b> — доля ответов AI на промпты проекта, где упомянут бренд. <b>Доля голоса</b> — бренд среди всех упоминаний (бренд + конкуренты). <b>Цитирование</b> — сайт клиента в источниках ответа: именно оно приводит трафик. Промпты прогоняются автоматически раз в ${'неделю'}.</p></div>`;
    $$('tr[data-href]', main).forEach((tr) => { tr.onclick = () => { location.hash = tr.dataset.href; }; });
  }

  // ---------- team ----------
  async function pageTeam(main) {
    S.users = await get('/users');
    main.innerHTML = `<div class="page-head"><div><h1>Команда</h1><div class="sub">Пользователи появляются после первого входа через Mattermost</div></div></div>
      <div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Сотрудник</th><th>Логин</th><th>Последний вход</th><th>Роль</th></tr></thead><tbody>
      ${S.users.map((u) => `<tr><td class="strong">${esc(u.name)}</td><td class="muted">${esc(u.username)}${u.email ? ' · ' + esc(u.email) : ''}</td><td class="faint">${F.ago(u.last_login_at)}</td>
        <td>${u.role_source ? `<span class="chip accent" title="Роль приходит из «Настроек» my.kontentferma (CEO / лидер направления Performance). Поменять — там.">${{ admin: 'Администратор', lead: 'Руководитель' }[u.role]} · из my.kontentferma</span>`
          : `<select class="inp" data-u="${esc(u.id)}" style="width:auto">${opt('specialist', 'Специалист — свои проекты', u.role)}${opt('lead', 'Руководитель — все проекты', u.role)}${opt('admin', 'Администратор', u.role)}</select>`}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    $$('[data-u]', main).forEach((s) => { s.onchange = async () => { try { await put(`/users/${encodeURIComponent(s.dataset.u)}`, { role: s.value }); toast('Роль обновлена'); } catch (e) { fail(e); route(); } }; });
  }

  // ---------- help ----------
  async function pageHelp(main) {
    const section = (title, sub, keys) => `<div class="card mt"><h2>${title}</h2><p class="muted" style="margin:4px 0 14px">${sub}</p><div class="stack" style="gap:10px">${keys.map((k) => KF_GUIDES.html(k)).join('')}</div></div>`;
    main.innerHTML = `<div class="page-head"><div><h1>Подключения</h1><div class="sub">Где и как получить каждый ключ. Те же инструкции открываются прямо в формах ввода.</div></div></div>
      ${section('1. Каналы клиента', 'Вводятся в проекте → «Каналы и данные» → «Подключить канал». Делает специалист проекта.', ['yandex_direct', 'metrika', 'google_ads', 'vk_ads', 'meta', 'telegram_ads', 'avito', 'twogis', 'yandex_maps', 'ozon', 'wb', 'other'])}
      ${section('2. Общие ключи агентства', 'Вводятся один раз в разделе «Сервисы и ключи». Делает лидер Performance.', ['seo', 'google', 'meta_settings'])}
      ${section('3. AI-движки для GEO', 'Тоже «Сервисы и ключи». Достаточно 2–3 движков; Perplexity и ChatGPT — самые показательные.', ['ai_perplexity', 'ai_openai', 'ai_gemini', 'ai_yandexgpt', 'ai_anthropic', 'ai_deepseek'])}
      <div class="card mt"><h3>Автообновление</h3><p class="muted" style="margin-bottom:0">Реклама и Метрика — каждые несколько часов (последние дни перезаписываются, т.к. конверсии «доезжают»), SEO — раз в сутки, GEO — раз в неделю. Интервалы — в «Сервисы и ключи». Для n8n: <span class="code">POST /api/cron/sync | seo | geo</span> с заголовком <span class="code">X-Api-Key</span>.</p></div>`;
  }

  // ---------- settings (лидер Performance) ----------
  async function pageSettings(main) {
    const d = await get('/settings');
    const SRC = { db: '<span class="chip good svc">задано</span>', env: '<span class="chip svc" title="Значение из переменных окружения сервера — можно переопределить здесь">из env</span>', default: '' };
    const input = (f) => {
      if (f.type === 'bool') return `<label class="checkline" style="margin-top:8px"><input type="checkbox" name="${f.key}" ${f.value ? 'checked' : ''}>${esc(f.label)}</label>`;
      if (f.secret) return `<label class="f"><span class="row" style="gap:6px">${esc(f.label)} ${SRC[f.source]}</span>
          <input class="inp" name="${f.key}" type="password" autocomplete="new-password" placeholder="${f.masked ? esc(f.masked) : 'не задан'}" title="Пустое поле при сохранении — ключ не меняется">
          ${f.help ? `<span class="help">${esc(f.help)}</span>` : ''}
          ${f.source === 'db' ? `<a href="#" class="help" style="align-self:flex-start;color:var(--bad)" data-clear="${f.key}">удалить ключ</a>` : ''}</label>`;
      return `<label class="f"><span class="row" style="gap:6px">${esc(f.label)} ${SRC[f.source]}</span><input class="inp" name="${f.key}" value="${esc(f.value ?? '')}" ${f.type === 'int' ? 'inputmode="numeric"' : ''}>${f.help ? `<span class="help">${esc(f.help)}</span>` : ''}</label>`;
    };
    const testBtn = (svc) => `<button type="button" class="btn sm" data-test="${svc}">Проверить</button>`;
    const groupHtml = (g) => {
      const fs = d.fields.filter((f) => f.group === g.id);
      let inner;
      if (g.id === 'ai') {
        const engines = [...new Set(fs.map((f) => f.engine))];
        inner = engines.map((e) => {
          const ef = fs.filter((f) => f.engine === e);
          const key = ef.find((f) => f.secret);
          return `<div style="border-top:1px solid var(--line);padding:14px 0">
            <div class="row between" style="margin-bottom:8px"><b>${esc(key.label.split(' — ')[0])}</b><div class="row">${key.isSet ? '<span class="chip good">подключён</span>' : e === 'yandexgpt' && d.fields.find((f) => f.key === 'YANDEX_SEARCH_API_KEY').isSet ? '<span class="chip accent">ключ Search API</span>' : '<span class="chip">выключен</span>'}${testBtn(e)}</div></div>
            ${KF_GUIDES.html(KF_GUIDES.AI_GUIDE[e], { compact: true })}
            <div class="three" style="margin-top:10px">${ef.map((f) => input({ ...f, label: f.secret ? 'API-ключ' : f.label })).join('')}</div></div>`;
        }).join('');
      } else {
        inner = `<div class="${fs.length > 2 ? 'three' : 'two'}">${fs.map(input).join('')}</div>`;
      }
      return `<form class="card form" data-g="${g.id}">
        <div class="card-head" style="margin-bottom:0"><h3>${esc(g.label)}</h3><div class="row">${g.id === 'seo' ? testBtn('seo') : g.id === 'google' ? testBtn('google') : ''}<button class="btn primary sm">Сохранить</button></div></div>
        <p class="muted" style="margin:0;font-size:13px">${esc(g.help)}</p>${KF_GUIDES.GROUP_GUIDE[g.id] ? KF_GUIDES.html(KF_GUIDES.GROUP_GUIDE[g.id], { compact: true }) : ''}${inner}</form>`;
    };
    main.innerHTML = `<div class="page-head"><div><h1>Сервисы и ключи</h1><div class="sub">Общие доступы агентства — настраивает лидер Performance. Ключи хранятся зашифрованными и после сохранения не показываются.</div></div></div>
      <div class="stack">${d.groups.map(groupHtml).join('')}</div>
      <p class="faint" style="font-size:12px">Доступы конкретных клиентов (токены Директа, VK, Meta, refresh token Google, счётчики Метрики) вводятся в проекте → «Каналы и данные».</p>`;
    $$('form[data-g]', main).forEach((form) => {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const values = {};
        $$('[name]', form).forEach((el) => { values[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
        try { await put('/settings', { values }); toast('Сохранено'); S.meta = await get('/meta'); pageSettings(main); } catch (err) { fail(err); }
      };
    });
    $$('[data-clear]', main).forEach((a) => {
      a.onclick = async (e) => {
        e.preventDefault();
        if (!confirm('Удалить сохранённый ключ?')) return;
        try { await put('/settings', { values: { [a.dataset.clear]: null } }); S.meta = await get('/meta'); pageSettings(main); } catch (err) { fail(err); }
      };
    });
    $$('[data-test]', main).forEach((b) => {
      b.onclick = async () => {
        b.disabled = true; const t = b.textContent; b.textContent = 'Проверяю…';
        try { const r = await post(`/settings/test/${b.dataset.test}`); toast(r.message, !r.ok); } catch (err) { fail(err); }
        b.disabled = false; b.textContent = t;
      };
    });
  }

  // ---------- boot ----------
  async function boot() {
    [S.meta, S.users] = await Promise.all([get('/meta'), get('/users')]);
    await loadProjects();
    shell();
    get('/tasks?open=1&assignee=me').then((t) => { const el = $('#mytasks'); if (el && t.length) { el.textContent = t.length; el.classList.remove('hidden'); } }).catch(() => {});
    route();
  }

  window.addEventListener('hashchange', () => { if (S.me) route(); });
  get('/me').then((r) => { S.me = r.user; return boot(); }).catch(() => renderLogin());
})();
