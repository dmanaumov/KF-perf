// GEO — видимость бренда в ответах AI-ассистентов.
// Каждый промпт прогоняем через подключённые движки, ищем в ответе бренд,
// конкурентов и домен клиента среди ссылок/источников.
const config = require('./config');
const db = require('./db');
const { json } = require('./http');
const { host } = require('./seo');

const ENGINES = [
  { id: 'openai', label: 'ChatGPT' },
  { id: 'perplexity', label: 'Perplexity' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'anthropic', label: 'Claude' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'yandexgpt', label: 'YandexGPT / Алиса' },
];

const SYSTEM = 'Ты — помощник, который отвечает пользователю из России на русском языке. Если уместно, называй конкретные компании, бренды и сайты.';

function enabledEngines() {
  return ENGINES.filter((e) => {
    const c = config.ai[e.id];
    return c && c.key && (e.id !== 'yandexgpt' || c.folderId);
  });
}

const URL_RE = /https?:\/\/[^\s)\]>"'»]+/g;

async function ask(engine, prompt) {
  const c = config.ai[engine];
  if (engine === 'openai') {
    const body = { model: c.model, instructions: SYSTEM, input: prompt };
    if (c.webSearch) body.tools = [{ type: 'web_search' }];
    const r = await json('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const parts = (r.output || []).filter((o) => o.type === 'message').flatMap((o) => o.content || []);
    const text = parts.map((p) => p.text || '').join('\n');
    const sources = parts.flatMap((p) => (p.annotations || []).map((a) => a.url).filter(Boolean));
    return { text, sources };
  }
  if (engine === 'perplexity' || engine === 'deepseek') {
    const url = engine === 'perplexity' ? 'https://api.perplexity.ai/chat/completions' : 'https://api.deepseek.com/chat/completions';
    const r = await json(url, { method: 'POST', headers: { Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: c.model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] }) });
    const sources = (r.citations || []).concat((r.search_results || []).map((s) => s.url)).filter(Boolean);
    return { text: r.choices[0].message.content || '', sources };
  }
  if (engine === 'anthropic') {
    const body = { model: c.model, max_tokens: 2000, system: SYSTEM, messages: [{ role: 'user', content: prompt }] };
    if (c.webSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }];
    const r = await json('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const blocks = r.content || [];
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const sources = blocks.flatMap((b) => (b.citations || []).map((x) => x.url)).filter(Boolean);
    return { text, sources };
  }
  if (engine === 'gemini') {
    const body = { systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }] };
    if (c.webSearch) body.tools = [{ google_search: {} }];
    const r = await json(`https://generativelanguage.googleapis.com/v1beta/models/${c.model}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': c.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const cand = (r.candidates || [])[0] || {};
    const text = ((cand.content && cand.content.parts) || []).map((p) => p.text || '').join('');
    const chunks = (cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [];
    // Gemini отдаёт редирект-ссылки vertexaisearch; реальный домен лежит в title
    const sources = chunks.map((ch) => ch.web && (ch.web.title && /\./.test(ch.web.title) ? `https://${ch.web.title}` : ch.web.uri)).filter(Boolean);
    return { text, sources };
  }
  if (engine === 'yandexgpt') {
    const r = await json('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {
      method: 'POST',
      headers: { Authorization: `Api-Key ${c.key}`, 'x-folder-id': c.folderId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelUri: `gpt://${c.folderId}/${c.model}`, completionOptions: { temperature: 0.3, maxTokens: 2000 }, messages: [{ role: 'system', text: SYSTEM }, { role: 'user', text: prompt }] }),
    });
    return { text: r.result.alternatives[0].message.text || '', sources: [] };
  }
  throw new Error(`Неизвестный движок ${engine}`);
}

function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }

function firstIndex(text, terms) {
  let best = -1;
  for (const t of terms) {
    const i = text.indexOf(norm(t));
    if (t && i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

// Разбор ответа: упоминание бренда, ссылка на сайт, место среди брендов, конкуренты.
function analyze(project, { text, sources }) {
  const t = norm(text);
  const siteHost = host(project.site_url || '');
  const allSources = [...new Set([...(sources || []), ...(text.match(URL_RE) || [])].map((u) => host(u)).filter(Boolean))];
  const brandTerms = [...(project.brand_terms || []), project.name].filter(Boolean);
  const brandAt = firstIndex(t, brandTerms.concat(siteHost ? [siteHost] : []));
  const comp = (project.competitors || []).map((c) => ({ name: c, at: firstIndex(t, c.split('|')) })).filter((c) => c.at >= 0);
  const mentioned = brandAt >= 0;
  const order = comp.map((c) => c.at).concat(mentioned ? [brandAt] : []).sort((a, b) => a - b);
  return {
    mentioned,
    cited: !!siteHost && allSources.some((h) => h === siteHost || h.endsWith('.' + siteHost)),
    rank: mentioned ? order.indexOf(brandAt) + 1 : null,
    competitors: comp.map((c) => c.name.split('|')[0]),
    sources: allSources.slice(0, 30),
  };
}

async function runPrompt(project, prompt, engine) {
  try {
    const res = await ask(engine, prompt.prompt);
    const a = analyze(project, res);
    await db.q(
      `INSERT INTO geo_checks (prompt_id, project_id, engine, mentioned, cited, rank, competitors, sources, answer) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [prompt.id, project.id, engine, a.mentioned, a.cited, a.rank, a.competitors, a.sources, res.text.slice(0, 20000)]
    );
    return { ok: true };
  } catch (err) {
    await db.q('INSERT INTO geo_checks (prompt_id, project_id, engine, error) VALUES ($1,$2,$3,$4)', [prompt.id, project.id, engine, err.message.slice(0, 1000)]);
    return { ok: false, error: err.message };
  }
}

async function checkProject(projectId, { promptId } = {}) {
  const engines = enabledEngines();
  if (!engines.length) throw new Error('Не подключён ни один AI-движок: задайте ключи OPENAI_API_KEY / PERPLEXITY_API_KEY / GEMINI_API_KEY / ANTHROPIC_API_KEY / DEEPSEEK_API_KEY / YANDEXGPT_API_KEY');
  const project = await db.one('SELECT * FROM projects WHERE id=$1', [projectId]);
  const prompts = await db.all(`SELECT * FROM geo_prompts WHERE project_id=$1 AND active ${promptId ? 'AND id=$2' : ''} ORDER BY id`, promptId ? [projectId, promptId] : [projectId]);
  const run = await db.one("INSERT INTO sync_runs (kind, project_id) VALUES ('geo',$1) RETURNING id", [projectId]);
  let ok = 0;
  const errors = [];
  // движки параллельно, промпты последовательно — бережём лимиты
  for (const p of prompts) {
    const res = await Promise.all(engines.map((e) => runPrompt(project, p, e.id)));
    res.forEach((r, i) => (r.ok ? ok++ : errors.push(`${engines[i].label}: ${r.error}`)));
  }
  await db.q('UPDATE sync_runs SET status=$2, finished_at=now(), rows=$3, error=$4 WHERE id=$1', [run.id, errors.length && !ok ? 'error' : 'ok', ok, [...new Set(errors)].slice(0, 5).join('\n') || null]);
  return { checked: ok, errors: [...new Set(errors)] };
}

async function checkDue() {
  if (!enabledEngines().length) return [];
  const due = await db.all(
    `SELECT p.id FROM projects p WHERE p.status='active' AND 'geo' = ANY(p.services)
       AND EXISTS (SELECT 1 FROM geo_prompts g WHERE g.project_id=p.id AND g.active)
       AND NOT EXISTS (SELECT 1 FROM sync_runs r WHERE r.project_id=p.id AND r.kind='geo' AND r.started_at > now() - ($1 || ' days')::interval)`,
    [String(config.geoIntervalDays)]
  );
  const out = [];
  for (const { id } of due) {
    try { out.push({ id, ...(await checkProject(id)) }); } catch (err) { out.push({ id, error: err.message }); }
  }
  return out;
}

module.exports = { ENGINES, enabledEngines, checkProject, checkDue, analyze };
