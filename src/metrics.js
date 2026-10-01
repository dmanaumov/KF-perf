// Расчёты: сводка проекта за период, план/факт, пейсинг, алерты, SEO/GEO-сводки.
const db = require('./db');
const { AD_PLATFORMS, BY_ID } = require('./platforms');
const { today, addDays, monthStart, monthEnd, daysInMonth, diffDays } = require('./dates');

const div = (a, b) => (b ? a / b : null);

function derive(t) {
  return {
    ...t,
    ctr: div(t.clicks * 100, t.impressions),
    cpc: div(t.spend, t.clicks),
    cpl: div(t.spend, t.leads),
    cr: div(t.leads * 100, t.clicks),
    romi: t.revenue ? div((t.revenue - t.spend) * 100, t.spend) : null,
  };
}

const SUMS = `COALESCE(sum(impressions),0)::float AS impressions, COALESCE(sum(clicks),0)::float AS clicks,
  COALESCE(sum(spend),0)::float AS spend, COALESCE(sum(leads),0)::float AS leads, COALESCE(sum(revenue),0)::float AS revenue`;

async function totals(projectId, from, to) {
  return derive(await db.one(`SELECT ${SUMS} FROM stats_daily WHERE project_id=$1 AND date BETWEEN $2 AND $3 AND platform = ANY($4)`, [projectId, from, to, AD_PLATFORMS]));
}

async function projectSummary(projectId, from, to, { campaigns = true } = {}) {
  const len = diffDays(from, to) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(len - 1));
  const [cur, prev, daily, byPlatform, byCampaign, analytics] = await Promise.all([
    totals(projectId, from, to),
    totals(projectId, prevFrom, prevTo),
    db.all(`SELECT date, ${SUMS} FROM stats_daily WHERE project_id=$1 AND date BETWEEN $2 AND $3 AND platform = ANY($4) GROUP BY date ORDER BY date`, [projectId, from, to, AD_PLATFORMS]),
    db.all(`SELECT platform, ${SUMS} FROM stats_daily WHERE project_id=$1 AND date BETWEEN $2 AND $3 AND platform = ANY($4) GROUP BY platform ORDER BY sum(spend) DESC`, [projectId, from, to, AD_PLATFORMS]),
    campaigns
      ? db.all(`SELECT platform, campaign_id, max(campaign_name) AS campaign_name, ${SUMS} FROM stats_daily WHERE project_id=$1 AND date BETWEEN $2 AND $3 AND platform = ANY($4) GROUP BY platform, campaign_id ORDER BY sum(spend) DESC LIMIT 200`, [projectId, from, to, AD_PLATFORMS])
      : [],
    db.all(`SELECT campaign_id, max(campaign_name) AS name, COALESCE(sum(clicks),0)::float AS visits, COALESCE(sum(leads),0)::float AS leads FROM stats_daily WHERE project_id=$1 AND date BETWEEN $2 AND $3 AND platform='metrika' GROUP BY campaign_id ORDER BY sum(clicks) DESC`, [projectId, from, to]),
  ]);

  // заполняем пропущенные дни нулями, чтобы графики не «склеивали» провалы
  const map = new Map(daily.map((d) => [d.date, d]));
  const series = [];
  for (let d = from; d <= to; d = addDays(d, 1)) series.push(map.get(d) || { date: d, impressions: 0, clicks: 0, spend: 0, leads: 0, revenue: 0 });

  return {
    from, to, prevFrom, prevTo,
    totals: cur,
    prev,
    daily: series,
    byPlatform: byPlatform.map((r) => ({ ...derive(r), label: (BY_ID[r.platform] || {}).label || r.platform })),
    byCampaign: byCampaign.map(derive),
    traffic: analytics.filter((a) => a.campaign_id.startsWith('src:')).map((a) => ({ source: a.campaign_id.slice(4), name: a.name, visits: a.visits, leads: a.leads })),
    aiTraffic: analytics.filter((a) => a.campaign_id.startsWith('ai:')).map((a) => ({ name: a.name, visits: a.visits, leads: a.leads })),
  };
}

// План/факт текущего месяца + пейсинг (прогноз расхода на конец месяца по темпу)
async function pacing(projectId, day = today()) {
  const ms = monthStart(day);
  const me = monthEnd(day);
  const plan = await db.one("SELECT * FROM plans WHERE project_id=$1 AND month=$2 AND platform=''", [projectId, ms]);
  const platformPlans = await db.all("SELECT * FROM plans WHERE project_id=$1 AND month=$2 AND platform<>''", [projectId, ms]);
  const fact = await totals(projectId, ms, day);
  const byPlatform = await db.all(`SELECT platform, ${SUMS} FROM stats_daily WHERE project_id=$1 AND date BETWEEN $2 AND $3 GROUP BY platform`, [projectId, ms, day]);
  const elapsed = diffDays(ms, day) + 1;
  const total = daysInMonth(day);
  const forecastSpend = fact.spend / elapsed * total;
  const forecastLeads = fact.leads / elapsed * total;
  const budget = plan && plan.budget;
  return {
    month: ms, monthEnd: me, elapsed, total,
    plan: plan || null,
    fact,
    forecastSpend, forecastLeads,
    expectedSpend: budget ? budget * elapsed / total : null,
    spendPct: budget ? fact.spend / budget * 100 : null,
    pacePct: budget ? forecastSpend / budget * 100 : null,
    leadsPct: plan && plan.leads ? fact.leads / plan.leads * 100 : null,
    platforms: platformPlans.map((pp) => {
      const f = byPlatform.find((b) => b.platform === pp.platform) || { spend: 0, leads: 0 };
      return { ...pp, label: (BY_ID[pp.platform] || {}).label || pp.platform, spend: f.spend, leads: f.leads, spendPct: pp.budget ? f.spend / pp.budget * 100 : null };
    }),
  };
}

async function seoSummary(projectId) {
  const rows = await db.all(
    `WITH last AS (
       SELECT DISTINCT ON (k.id) k.id, k.keyword, k.engine, k.region, k.group_name, k.target_url, k.frequency, p.date, p.position, p.found_url
       FROM seo_keywords k LEFT JOIN seo_positions p ON p.keyword_id=k.id
       WHERE k.project_id=$1 AND k.active ORDER BY k.id, p.date DESC NULLS LAST
     )
     SELECT l.*, (SELECT position FROM seo_positions pp WHERE pp.keyword_id=l.id AND pp.date <= l.date - 7 ORDER BY pp.date DESC LIMIT 1) AS prev_position,
            (SELECT json_agg(json_build_object('d', date, 'p', position) ORDER BY date) FROM (SELECT date, position FROM seo_positions s WHERE s.keyword_id=l.id ORDER BY date DESC LIMIT 30) h) AS history
     FROM last l ORDER BY l.engine, l.group_name NULLS LAST, l.keyword`,
    [projectId]
  );
  const checked = rows.filter((r) => r.date);
  const pos = checked.map((r) => r.position).filter((p) => p != null);
  const stat = (arr) => ({
    total: arr.length,
    top3: arr.filter((r) => r.position && r.position <= 3).length,
    top10: arr.filter((r) => r.position && r.position <= 10).length,
    top30: arr.filter((r) => r.position && r.position <= 30).length,
  });
  return {
    keywords: rows,
    ...stat(checked),
    keywordsTotal: rows.length,
    avgPosition: pos.length ? pos.reduce((a, b) => a + b, 0) / pos.length : null,
    lastCheck: checked.reduce((m, r) => (r.date > m ? r.date : m), ''),
    improved: checked.filter((r) => r.prev_position && r.position && r.position < r.prev_position).length,
    dropped: checked.filter((r) => r.prev_position && (!r.position || r.position > r.prev_position)).length,
  };
}

async function geoSummary(projectId) {
  // последний результат по каждой паре (промпт, движок)
  const latest = await db.all(
    `SELECT DISTINCT ON (c.prompt_id, c.engine) c.*, g.prompt, g.topic
     FROM geo_checks c JOIN geo_prompts g ON g.id=c.prompt_id
     WHERE c.project_id=$1 AND g.active AND c.error IS NULL
     ORDER BY c.prompt_id, c.engine, c.checked_at DESC`,
    [projectId]
  );
  const prompts = await db.all('SELECT * FROM geo_prompts WHERE project_id=$1 ORDER BY active DESC, id', [projectId]);
  const engines = [...new Set(latest.map((l) => l.engine))];
  const n = latest.length;
  const mentioned = latest.filter((l) => l.mentioned).length;
  const compCount = {};
  latest.forEach((l) => l.competitors.forEach((c) => { compCount[c] = (compCount[c] || 0) + 1; }));
  const totalBrandMentions = mentioned + Object.values(compCount).reduce((a, b) => a + b, 0);
  const sourceCount = {};
  latest.forEach((l) => l.sources.forEach((s) => { sourceCount[s] = (sourceCount[s] || 0) + 1; }));
  const byEngine = engines.map((e) => {
    const l = latest.filter((x) => x.engine === e);
    return { engine: e, checks: l.length, visibility: div(l.filter((x) => x.mentioned).length * 100, l.length), cited: l.filter((x) => x.cited).length };
  });
  // тренд видимости по неделям
  const trend = await db.all(
    `SELECT to_char(date_trunc('week', checked_at), 'YYYY-MM-DD') AS week, count(*)::int AS checks,
            (sum(CASE WHEN mentioned THEN 1 ELSE 0 END) * 100.0 / count(*))::float AS visibility
     FROM geo_checks WHERE project_id=$1 AND error IS NULL GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
    [projectId]
  );
  return {
    prompts,
    matrix: latest.map((l) => ({ prompt_id: l.prompt_id, engine: l.engine, mentioned: l.mentioned, cited: l.cited, rank: l.rank, competitors: l.competitors, checked_at: l.checked_at, id: l.id })),
    engines,
    checks: n,
    visibility: div(mentioned * 100, n),
    citedRate: div(latest.filter((l) => l.cited).length * 100, n),
    avgRank: div(latest.filter((l) => l.rank).reduce((s, l) => s + l.rank, 0), latest.filter((l) => l.rank).length),
    shareOfVoice: div(mentioned * 100, totalBrandMentions),
    competitors: Object.entries(compCount).map(([name, count]) => ({ name, count, share: div(count * 100, totalBrandMentions) })).sort((a, b) => b.count - a.count),
    topSources: Object.entries(sourceCount).map(([host, count]) => ({ host, count })).sort((a, b) => b.count - a.count).slice(0, 15),
    byEngine,
    trend: trend.reverse(),
    lastCheck: latest.reduce((m, l) => (!m || l.checked_at > m ? l.checked_at : m), null),
  };
}

// Алерты — вычисляются на лету, без хранения
async function alerts(project, pace) {
  const out = [];
  const add = (level, area, text) => out.push({ level, area, text, project_id: project.id, project: project.name });
  const p = pace || (await pacing(project.id));
  if (p.plan && p.plan.budget && p.elapsed >= 3) {
    if (p.pacePct > 115) add('high', 'ads', `Перерасход: прогноз ${Math.round(p.pacePct)}% месячного бюджета`);
    else if (p.pacePct < 80 && p.elapsed >= 5) add('mid', 'ads', `Недорасход: прогноз ${Math.round(p.pacePct)}% бюджета — кампании открутят меньше плана`);
  }
  if (p.plan && p.plan.cpl_target && p.fact.cpl && p.fact.leads >= 3 && p.fact.cpl > p.plan.cpl_target * 1.2) {
    add('high', 'ads', `CPL ${Math.round(p.fact.cpl).toLocaleString('ru')} ₽ выше цели на ${Math.round((p.fact.cpl / p.plan.cpl_target - 1) * 100)}%`);
  }
  const d = today();
  const last3 = await totals(project.id, addDays(d, -3), addDays(d, -1));
  if (last3.spend > 0 && last3.leads === 0 && project.kpi_type !== 'traffic') add('high', 'ads', `3 дня без лидов при расходе ${Math.round(last3.spend).toLocaleString('ru')} ₽`);
  const integ = await db.all("SELECT platform, status, last_error, last_sync_at FROM integrations WHERE project_id=$1 AND enabled", [project.id]);
  integ.filter((i) => i.status === 'error').forEach((i) => add('mid', 'sync', `${(BY_ID[i.platform] || {}).label || i.platform}: ошибка синхронизации — ${String(i.last_error || '').slice(0, 120)}`));
  integ.filter((i) => i.status === 'manual' && i.last_sync_at && Date.now() - new Date(i.last_sync_at) > 8 * 86400000)
    .forEach((i) => add('low', 'sync', `${(BY_ID[i.platform] || {}).label}: данные не обновлялись больше недели`));
  const overdue = await db.one("SELECT count(*)::int AS n FROM tasks WHERE project_id=$1 AND status<>'done' AND due_date < $2", [project.id, d]);
  if (overdue.n) add('mid', 'tasks', `Просроченных задач: ${overdue.n}`);
  const drops = await db.one(
    `SELECT count(*)::int AS n FROM seo_keywords k
     JOIN LATERAL (SELECT position FROM seo_positions WHERE keyword_id=k.id ORDER BY date DESC LIMIT 1) a ON true
     JOIN LATERAL (SELECT position FROM seo_positions WHERE keyword_id=k.id ORDER BY date DESC OFFSET 1 LIMIT 1) b ON true
     WHERE k.project_id=$1 AND k.active AND b.position <= 10 AND (a.position IS NULL OR a.position > 10)`,
    [project.id]
  );
  if (drops.n) add('mid', 'seo', `SEO: ${drops.n} запрос(ов) выпали из ТОП-10`);
  return out;
}

module.exports = { projectSummary, pacing, seoSummary, geoSummary, alerts, totals, derive };
