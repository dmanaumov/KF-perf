/* Общие утилиты: форматирование и лёгкие SVG-графики с ховер-подсказками. */
(function () {
  const NB = ' ';
  const F = {
    money(v, cur = '₽') {
      if (v === null || v === undefined || !isFinite(v)) return '—';
      const a = Math.abs(v);
      if (a >= 1e6) return (v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: a >= 1e7 ? 1 : 2 }) + NB + 'млн' + NB + cur;
      return Math.round(v).toLocaleString('ru-RU') + NB + cur;
    },
    moneyShort(v) {
      if (v === null || v === undefined || !isFinite(v)) return '—';
      const a = Math.abs(v);
      if (a >= 1e6) return (v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + 'М';
      if (a >= 1e3) return (v / 1e3).toLocaleString('ru-RU', { maximumFractionDigits: a >= 1e4 ? 0 : 1 }) + 'к';
      return Math.round(v).toLocaleString('ru-RU');
    },
    int(v) { return v === null || v === undefined || !isFinite(v) ? '—' : Math.round(v).toLocaleString('ru-RU'); },
    dec(v, d = 1) { return v === null || v === undefined || !isFinite(v) ? '—' : v.toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: d }); },
    pct(v, d = 0) { return v === null || v === undefined || !isFinite(v) ? '—' : v.toLocaleString('ru-RU', { maximumFractionDigits: d }) + '%'; },
    date(s) { if (!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}.${m}.${y.slice(2)}`; },
    dateShort(s) { if (!s) return ''; const [, m, d] = String(s).slice(0, 10).split('-'); return `${+d}.${m}`; },
    dateTime(s) { if (!s) return '—'; const t = new Date(s); return t.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); },
    month(s) { const t = new Date(String(s).slice(0, 10) + 'T00:00:00'); return t.toLocaleString('ru-RU', { month: 'long', year: 'numeric' }); },
    ago(s) {
      if (!s) return 'никогда';
      const m = Math.round((Date.now() - new Date(s)) / 60000);
      if (m < 2) return 'только что';
      if (m < 60) return `${m} мин назад`;
      const h = Math.round(m / 60);
      if (h < 24) return `${h} ч назад`;
      return `${Math.round(h / 24)} дн назад`;
    },
    // дельта к прошлому периоду; good: 'up' — рост хорошо, 'down' — снижение хорошо
    delta(cur, prev, good = 'up') {
      if (!prev || cur === null || cur === undefined || !isFinite(cur) || !isFinite(prev)) return '';
      const d = (cur / prev - 1) * 100;
      if (Math.abs(d) < 0.5) return `<span class="delta flat">≈ 0%</span>`;
      const better = good === 'up' ? d > 0 : d < 0;
      return `<span class="delta ${good === 'none' ? 'flat' : better ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(0)}%</span>`;
    },
  };
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // максимум оси так, чтобы шаг из 4 делений был «круглым» (1, 2, 2.5, 5 × 10^n)
  function niceMax(v) {
    if (!v || v <= 0) return 1;
    const raw = v / 4;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / p;
    const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
    return step * 4;
  }

  function frame(el, opts) {
    const W = Math.max(260, el.clientWidth || 600);
    const H = opts.height || 200;
    const m = { l: 44, r: 10, t: 12, b: 24 };
    return { W, H, m, iw: W - m.l - m.r, ih: H - m.t - m.b };
  }

  function axisY(f, max, fmt, min = 0, invert = false) {
    let s = '';
    for (let i = 0; i <= 4; i++) {
      const v = min + (max - min) * i / 4;
      const y = invert ? f.m.t + f.ih * i / 4 : f.m.t + f.ih - f.ih * i / 4;
      s += `<line class="${i === 0 && !invert ? 'base-l' : 'grid-l'}" x1="${f.m.l}" x2="${f.W - f.m.r}" y1="${y}" y2="${y}"/>`;
      s += `<text class="ax" x="${f.m.l - 6}" y="${y + 4}" text-anchor="end">${esc(fmt(v))}</text>`;
    }
    return s;
  }

  function axisX(f, data, xOf, label) {
    const n = data.length;
    const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(f.iw / 70))));
    let s = '';
    data.forEach((d, i) => {
      if (i % step !== 0 && i !== n - 1) return;
      if (i === n - 1 && i % step !== 0 && (n - 1) % step < step * 0.6) return;
      s += `<text class="ax" x="${xOf(i)}" y="${f.H - 6}" text-anchor="middle">${esc(label(d))}</text>`;
    });
    return s;
  }

  function attachHover(el, svg, f, data, xOf, render) {
    const tip = document.createElement('div');
    tip.className = 'tip hidden';
    el.appendChild(tip);
    const hl = svg.querySelector('.hl');
    const hit = svg.querySelector('.hit');
    const pick = (evt) => {
      const r = svg.getBoundingClientRect();
      const x = (evt.clientX - r.left) * (f.W / r.width);
      let best = 0;
      let bd = Infinity;
      data.forEach((_, i) => { const d = Math.abs(xOf(i) - x); if (d < bd) { bd = d; best = i; } });
      return best;
    };
    hit.addEventListener('mousemove', (evt) => {
      const i = pick(evt);
      const r = svg.getBoundingClientRect();
      const px = xOf(i) * r.width / f.W;
      if (hl) { hl.setAttribute('x1', xOf(i)); hl.setAttribute('x2', xOf(i)); hl.style.display = ''; }
      tip.innerHTML = render(data[i], i);
      tip.classList.remove('hidden');
      tip.style.left = Math.min(Math.max(px, 70), r.width - 70) + 'px';
      tip.style.top = (f.m.t * r.width / f.W + 4) + 'px';
      svg.querySelectorAll('[data-i]').forEach((b) => { b.style.opacity = +b.dataset.i === i ? 1 : 0.55; });
    });
    hit.addEventListener('mouseleave', () => {
      tip.classList.add('hidden');
      if (hl) hl.style.display = 'none';
      svg.querySelectorAll('[data-i]').forEach((b) => { b.style.opacity = 1; });
    });
  }

  function mount(el, draw) {
    if (!el) return;
    const go = () => { el.innerHTML = ''; draw(); };
    go();
    if (el._ro) el._ro.disconnect();
    let w = el.clientWidth;
    el._ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - w) > 8) { w = el.clientWidth; go(); } });
    el._ro.observe(el);
  }

  // Вертикальные столбики (одна серия) + опциональная линия-ориентир (план/день)
  function bars(el, data, opts = {}) {
    mount(el, () => {
      const f = frame(el, opts);
      const vals = data.map((d) => d.y || 0);
      const max = niceMax(Math.max(...vals, opts.ref || 0) * 1.05);
      const slot = f.iw / Math.max(1, data.length);
      const bw = Math.max(2, Math.min(28, slot - 2));
      const xOf = (i) => f.m.l + slot * i + slot / 2;
      const yOf = (v) => f.m.t + f.ih - (v / max) * f.ih;
      const color = opts.color || 'var(--chart-1)';
      let s = `<svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(opts.label || '')}">`;
      s += axisY(f, max, opts.axisFmt || F.moneyShort);
      data.forEach((d, i) => {
        const h = Math.max(0, f.m.t + f.ih - yOf(d.y || 0));
        if (!h) return;
        const x = xOf(i) - bw / 2;
        const y = yOf(d.y);
        const r = Math.min(4, bw / 2, h);
        // скругление только у «верхнего» конца, основание прямое
        s += `<path data-i="${i}" fill="${d.color || color}" d="M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${y + h} Z"/>`;
      });
      if (opts.ref) {
        const y = yOf(opts.ref);
        s += `<line class="ref" x1="${f.m.l}" x2="${f.W - f.m.r}" y1="${y}" y2="${y}"/><text class="ref-t" x="${f.W - f.m.r}" y="${y - 5}" text-anchor="end">${esc(opts.refLabel || '')}</text>`;
      }
      s += axisX(f, data, xOf, (d) => (opts.xFmt || F.dateShort)(d.x));
      s += `<line class="hl" y1="${f.m.t}" y2="${f.m.t + f.ih}" style="display:none"/>`;
      s += `<rect class="hit" x="${f.m.l}" y="${f.m.t}" width="${f.iw}" height="${f.ih}"/></svg>`;
      el.insertAdjacentHTML('beforeend', s);
      attachHover(el, el.querySelector('svg'), f, data, xOf, opts.tip || ((d) => `${F.date(d.x)}<br><b>${(opts.fmt || F.money)(d.y)}</b>`));
    });
  }

  // Линия (одна серия). invert — для позиций (1 сверху).
  function line(el, data, opts = {}) {
    mount(el, () => {
      const f = frame(el, opts);
      const vals = data.map((d) => d.y).filter((v) => v !== null && v !== undefined && isFinite(v));
      const invert = !!opts.invert;
      const min = opts.yMin !== undefined ? opts.yMin : 0;
      const max = opts.yMax !== undefined ? opts.yMax : niceMax(Math.max(...vals, 0) * 1.1);
      const xOf = (i) => (data.length === 1 ? f.m.l + f.iw / 2 : f.m.l + f.iw * i / (data.length - 1));
      const yOf = (v) => (invert ? f.m.t + ((v - min) / (max - min)) * f.ih : f.m.t + f.ih - ((v - min) / (max - min)) * f.ih);
      const color = opts.color || 'var(--chart-1)';
      let s = `<svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(opts.label || '')}">`;
      s += axisY(f, max, opts.axisFmt || F.int, min, invert);
      let path = '';
      let pen = false;
      data.forEach((d, i) => {
        if (d.y === null || d.y === undefined || !isFinite(d.y)) { pen = false; return; }
        path += `${pen ? 'L' : 'M'}${xOf(i).toFixed(1)},${yOf(Math.min(Math.max(d.y, min), max)).toFixed(1)} `;
        pen = true;
      });
      if (opts.area && !invert) {
        const first = data.findIndex((d) => d.y !== null && d.y !== undefined);
        s += `<path d="${path} L${xOf(data.length - 1)},${f.m.t + f.ih} L${xOf(Math.max(0, first))},${f.m.t + f.ih} Z" fill="${color}" opacity=".10"/>`;
      }
      if (opts.ref) {
        const y = yOf(opts.ref);
        s += `<line class="ref" x1="${f.m.l}" x2="${f.W - f.m.r}" y1="${y}" y2="${y}"/><text class="ref-t" x="${f.W - f.m.r}" y="${y - 5}" text-anchor="end">${esc(opts.refLabel || '')}</text>`;
      }
      s += `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (data.length <= 16) data.forEach((d, i) => { if (d.y !== null && d.y !== undefined) s += `<circle data-i="${i}" cx="${xOf(i)}" cy="${yOf(d.y)}" r="4" fill="${color}" stroke="var(--surface)" stroke-width="2"/>`; });
      s += axisX(f, data, xOf, (d) => (opts.xFmt || F.dateShort)(d.x));
      s += `<line class="hl" y1="${f.m.t}" y2="${f.m.t + f.ih}" style="display:none"/>`;
      s += `<rect class="hit" x="${f.m.l - 6}" y="${f.m.t}" width="${f.iw + 12}" height="${f.ih}"/></svg>`;
      el.insertAdjacentHTML('beforeend', s);
      attachHover(el, el.querySelector('svg'), f, data, xOf, opts.tip || ((d) => `${F.date(d.x)}<br><b>${(opts.fmt || F.int)(d.y)}</b>`));
    });
  }

  // Мини-спарклайн позиций (1 — сверху)
  function spark(points, { invert = true, max = 50 } = {}) {
    const p = (points || []).filter((x) => x);
    if (p.length < 2) return '';
    const W = 90, H = 26;
    const vals = p.map((x) => Math.min(x.p, max));
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 4) { const mid = (hi + lo) / 2; lo = mid - 2; hi = mid + 2; }
    const xs = (i) => 2 + (W - 4) * i / (p.length - 1);
    const ys = (v) => { const k = (Math.min(v, max) - lo) / (hi - lo); return invert ? 2 + k * (H - 4) : H - 2 - k * (H - 4); };
    let d = '';
    p.forEach((pt, i) => { d += `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(pt.p).toFixed(1)} `; });
    const last = p[p.length - 1];
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--chart-1)" stroke-width="1.5" stroke-linejoin="round"/><circle cx="${xs(p.length - 1)}" cy="${ys(last.p)}" r="2.5" fill="var(--chart-1)"/></svg>`;
  }

  // Горизонтальные полосы с подписями (каналы, конкуренты, источники)
  function hbars(el, rows, opts = {}) {
    if (!el) return;
    if (!rows.length) { el.innerHTML = `<div class="empty">${esc(opts.empty || 'Нет данных')}</div>`; return; }
    const max = Math.max(...rows.map((r) => r.value || 0), 1);
    el.innerHTML = `<div class="hbars">${rows.map((r) => `
      <div class="hbar" title="${esc(r.title || '')}">
        <div class="nm">${r.dot ? `<span class="chip" style="padding:0;border:0;background:none"><span class="pdot" style="background:${r.dot}"></span></span>` : ''}${esc(r.label)}</div>
        <div class="tr"><div class="fl" style="width:${Math.max(1, (r.value || 0) / max * 100)}%;${r.color ? `background:${r.color}` : ''}"></div></div>
        <div class="vl">${r.valueText}${r.sub ? `<small>${r.sub}</small>` : ''}</div>
      </div>`).join('')}</div>`;
  }

  window.KF = { F, esc, Charts: { bars, line, spark, hbars } };
})();
