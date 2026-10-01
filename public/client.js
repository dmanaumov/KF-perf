/* Кабинет клиента: /c/:token — только чтение. */
(function () {
  const { F, esc, Charts } = window.KF;
  const $ = (s) => document.querySelector(s);
  const token = location.pathname.split('/')[2];
  const app = $('#app');
  const STATUS = { backlog: 'В планах', todo: 'В планах', in_progress: 'В работе', review: 'На проверке', done: 'Сделано' };
  const AREA = { ads: 'Реклама', seo: 'SEO', geo: 'GEO / AI', analytics: 'Аналитика', creative: 'Креативы', other: 'Прочее' };
  const ENG = { openai: 'ChatGPT', perplexity: 'Perplexity', gemini: 'Gemini', anthropic: 'Claude', deepseek: 'DeepSeek', yandexgpt: 'YandexGPT' };
  let period = 'month';
  let today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
  const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const ms = (d) => d.slice(0, 8) + '01';
  const me = (d) => { const [y, m] = d.split('-').map(Number); return d.slice(0, 8) + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0'); };
  const range = () => {
    if (period === 'month') return [ms(today), today];
    if (period === 'prev') { const p = ms(addDays(ms(today), -1)); return [p, me(p)]; }
    return [addDays(today, -(+period - 1)), today];
  };

  async function load() {
    const [from, to] = range();
    const res = await fetch(`/api/client/${encodeURIComponent(token)}?from=${from}&to=${to}`);
    const d = await res.json().catch(() => null);
    if (!res.ok) {
      app.innerHTML = `<div class="login"><div class="login-card"><div class="brand-mark">КФ</div><h1>Ссылка недействительна</h1><p>Попросите менеджера прислать актуальную ссылку на отчёт.</p></div></div>`;
      return;
    }
    render(d);
  }

  function render(d) {
    const s = d.summary;
    const t = s.totals;
    const pv = s.prev;
    const pc = d.pacing;
    const plan = pc.plan || {};
    const sales = d.project.kpi_type === 'sales';
    const hasAds = d.project.services.includes('ads');
    const tasksOpen = d.tasks.filter((x) => x.status !== 'done');
    const tasksDone = d.tasks.filter((x) => x.status === 'done');
    document.title = `${d.project.name} — отчёт по продвижению`;
    app.innerHTML = `
      <div class="client-top"><div class="in">
        <div class="row between"><div class="brand" style="padding:0"><div class="brand-mark">КФ</div><div class="brand-name">КонтентФерма<small>отчёт по продвижению</small></div></div>
        <div class="seg" id="per">${[['month', 'Этот месяц'], ['prev', 'Прошлый месяц'], ['30', '30 дней'], ['90', '90 дней']].map(([k, l]) => `<button data-p="${k}" class="${k === period ? 'active' : ''}">${l}</button>`).join('')}</div></div>
        <h1>${esc(d.project.name)}</h1>
        <div class="sub">${F.date(s.from)} — ${F.date(s.to)}${d.project.manager ? ` · ваш менеджер: ${esc(d.project.manager)}` : ''}</div>
      </div></div>
      <div class="client-body">
        ${hasAds ? `
        <div class="grid g-4">
          <div class="card kpi"><div class="label">Вложено в рекламу</div><div class="value">${F.money(t.spend)}</div><div class="foot">${F.delta(t.spend, pv.spend, 'none')} к прошлому периоду</div></div>
          <div class="card kpi"><div class="label">${sales ? 'Продажи' : 'Заявки'}</div><div class="value">${F.int(t.leads)}</div><div class="foot">${F.delta(t.leads, pv.leads)} к прошлому периоду</div></div>
          <div class="card kpi"><div class="label">Стоимость ${sales ? 'продажи' : 'заявки'}</div><div class="value">${F.money(t.cpl)}</div><div class="foot">${F.delta(t.cpl, pv.cpl, 'down')}${plan.cpl_target ? ` · цель ${F.money(plan.cpl_target)}` : ''}</div></div>
          ${sales ? `<div class="card kpi"><div class="label">Выручка · ROMI</div><div class="value">${F.moneyShort(t.revenue)} <small>${F.pct(t.romi)}</small></div><div class="foot">${F.delta(t.revenue, pv.revenue)}</div></div>`
            : `<div class="card kpi"><div class="label">Переходы на сайт</div><div class="value">${F.int(t.clicks)}</div><div class="foot">${F.delta(t.clicks, pv.clicks)} · конверсия ${F.pct(t.cr, 1)}</div></div>`}
        </div>
        <div class="grid g-21 mt">
          <div class="card"><div class="card-head"><h3>По дням</h3></div><div class="grid g-2"><div><div class="chart-title">Бюджет</div><div class="chart" id="c1"></div></div><div><div class="chart-title">${sales ? 'Продажи' : 'Заявки'}</div><div class="chart" id="c2"></div></div></div></div>
          <div class="card"><div class="card-head"><h3>План на ${esc(F.month(pc.month).split(' ')[0])}</h3><span class="hint">день ${pc.elapsed} из ${pc.total}</span></div>
            ${pc.plan ? `${plan.budget ? bar('Бюджет', pc.fact.spend, plan.budget, F.money, pc.elapsed / pc.total * 100) : ''}${plan.leads ? bar(sales ? 'Продажи' : 'Заявки', pc.fact.leads, plan.leads, F.int, pc.elapsed / pc.total * 100) : ''}
              <div class="faint" style="font-size:12px">Черта — где мы должны быть сегодня по плану. Прогноз на месяц: ${F.int(pc.forecastLeads)} ${sales ? 'продаж' : 'заявок'}.</div>` : '<div class="empty">План согласовывается</div>'}
          </div>
        </div>
        <div class="card mt"><div class="card-head"><h3>Каналы</h3></div><div id="hb"></div></div>` : ''}

        ${d.seo ? `<div class="card mt"><div class="card-head"><h3>SEO — позиции сайта</h3><span class="hint">${d.seo.lastCheck ? 'проверено ' + F.date(d.seo.lastCheck) : ''}</span></div>
          <div class="grid g-4" style="margin-bottom:16px">
            <div><div class="chart-title">В ТОП-10</div><div class="chart-big">${d.seo.top10} из ${d.seo.total}</div></div>
            <div><div class="chart-title">В ТОП-3</div><div class="chart-big">${d.seo.top3}</div></div>
            <div><div class="chart-title">Средняя позиция</div><div class="chart-big">${F.dec(d.seo.avgPosition)}</div></div>
            <div><div class="chart-title">За неделю</div><div class="chart-big"><span class="delta up" style="font-size:20px">▲${d.seo.improved}</span> <span class="delta down" style="font-size:20px">▼${d.seo.dropped}</span></div></div>
          </div>
          <div class="table-wrap"><table class="t"><thead><tr><th>Запрос</th><th class="r">Позиция</th><th class="r">За неделю</th><th>Динамика</th></tr></thead><tbody>
          ${d.seo.keywords.map((k) => `<tr><td>${esc(k.keyword)} <span class="faint" style="font-size:12px">${k.engine === 'google' ? 'Google' : 'Яндекс'}</span></td><td class="r"><span class="pos ${!k.position ? 'pn' : k.position <= 3 ? 'p3' : k.position <= 10 ? 'p10' : k.position <= 30 ? 'p30' : 'pn'}">${k.position || '—'}</span></td>
            <td class="r">${k.prev_position ? (k.position ? (k.prev_position - k.position === 0 ? '<span class="delta flat">0</span>' : `<span class="delta ${k.prev_position > k.position ? 'up' : 'down'}">${k.prev_position > k.position ? '▲' : '▼'} ${Math.abs(k.prev_position - k.position)}</span>`) : '<span class="delta down">выпал</span>') : '<span class="faint">—</span>'}</td>
            <td>${Charts.spark((k.history || []).map((h) => ({ p: h.p || 60 })), { max: 60 })}</td></tr>`).join('')}
          </tbody></table></div></div>` : ''}

        ${d.geo ? `<div class="card mt"><div class="card-head"><h3>GEO — видимость в AI-ассистентах</h3><span class="hint">ChatGPT, Perplexity, Gemini, Алиса и др.</span></div>
          <div class="grid g-4" style="margin-bottom:16px">
            <div><div class="chart-title">Упоминают бренд</div><div class="chart-big">${F.pct(d.geo.visibility)}</div><div class="faint" style="font-size:12px">ответов</div></div>
            <div><div class="chart-title">Доля голоса</div><div class="chart-big">${F.pct(d.geo.shareOfVoice)}</div><div class="faint" style="font-size:12px">среди конкурентов</div></div>
            <div><div class="chart-title">Сайт в источниках</div><div class="chart-big">${F.pct(d.geo.citedRate)}</div></div>
            <div><div class="chart-title">Проверено вопросов</div><div class="chart-big">${d.geo.prompts.length}</div></div>
          </div>
          <div class="grid g-2"><div><div class="chart-title">Видимость по неделям</div><div class="chart" id="gtr"></div></div>
          <div><div class="chart-title">По ассистентам</div><div id="geng"></div></div></div></div>` : ''}

        <div class="grid g-2 mt">
          <div class="card"><div class="card-head"><h3>Что делаем сейчас</h3><span class="hint">${tasksOpen.length}</span></div>
            ${tasksOpen.length ? `<div class="table-wrap"><table class="t"><tbody>${tasksOpen.map((x) => `<tr><td><b>${esc(x.title)}</b><div class="faint" style="font-size:12px">${AREA[x.area] || ''}</div></td><td><span class="chip ${x.status === 'in_progress' ? 'accent' : ''}">${STATUS[x.status]}</span></td><td class="r faint nowrap">${x.due_date ? 'до ' + F.dateShort(x.due_date) : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">—</div>'}
          </div>
          <div class="card"><div class="card-head"><h3>Сделано</h3><span class="hint">последние 45 дней</span></div>
            ${tasksDone.length ? `<div class="table-wrap"><table class="t"><tbody>${tasksDone.map((x) => `<tr><td><b>✓ ${esc(x.title)}</b>${x.result ? `<div class="muted" style="font-size:12.5px">${esc(x.result)}</div>` : ''}</td><td class="r faint nowrap">${x.done_at ? F.date(x.done_at.slice(0, 10)) : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">—</div>'}
          </div>
        </div>
        ${d.changelog.length ? `<div class="card mt"><div class="card-head"><h3>Журнал изменений</h3></div><div class="table-wrap"><table class="t"><tbody>
          ${d.changelog.map((c) => `<tr><td class="faint nowrap" style="width:80px">${F.date(c.date)}</td><td>${esc(c.text)}</td><td class="faint">${AREA[c.area] || ''}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
        <p class="faint" style="text-align:center;font-size:12px;margin-top:28px">Данные обновляются автоматически из рекламных кабинетов и Яндекс Метрики · КонтентФерма</p>
      </div>`;
    document.querySelectorAll('#per button').forEach((b) => { b.onclick = () => { period = b.dataset.p; load(); }; });
    if (hasAds) {
      Charts.bars($('#c1'), s.daily.map((x) => ({ x: x.date, y: x.spend })), { height: 180 });
      Charts.bars($('#c2'), s.daily.map((x) => ({ x: x.date, y: x.leads })), { height: 180, color: 'var(--chart-2)', axisFmt: F.int, fmt: F.int });
      const pl = Object.fromEntries(d.platforms.map((p) => [p.id, p.label]));
      Charts.hbars($('#hb'), s.byPlatform.map((r) => ({ label: pl[r.platform] || r.label, value: r.spend, valueText: F.money(r.spend), sub: `${F.int(r.leads)} ${sales ? 'продаж' : 'заявок'} · ${F.money(r.cpl)}` })));
    }
    if (d.geo) {
      if (d.geo.trend.length) Charts.line($('#gtr'), d.geo.trend.map((x) => ({ x: x.week, y: x.visibility })), { height: 170, yMax: 100, axisFmt: (v) => v + '%', area: true, fmt: (v) => F.pct(v) });
      Charts.hbars($('#geng'), d.geo.byEngine.map((e) => ({ label: ENG[e.engine] || e.engine, value: e.visibility || 0, valueText: F.pct(e.visibility) })));
    }
  }

  function bar(label, fact, target, fmt, expPct) {
    const pct = fact / target * 100;
    return `<div style="margin-bottom:16px"><div class="row between"><b>${label}</b><span class="num">${fmt(fact)} <span class="faint">/ ${fmt(target)}</span></span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, pct)}%"></div><div class="bar-mark" style="left:${expPct}%"></div></div></div>`;
  }

  load();
})();
