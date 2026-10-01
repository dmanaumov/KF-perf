// SEO: съём позиций в Яндексе через Yandex Search API (Yandex Cloud).
// Google-позиции — через CSV-импорт (нет официального SERP API).
const settings = require('./settings');
const db = require('./db');
const { json } = require('./http');
const { today } = require('./dates');

const SEARCH_URL = 'https://searchapi.api.cloud.yandex.net/v2/web/search';

function isConfigured() {
  const y = settings.yandexSearch();
  return !!(y.key && y.folderId);
}

function host(u) {
  try { return new URL(/^https?:/.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; }
}

function decode(s) {
  return String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

async function serp(keyword, region, depth) {
  const y = settings.yandexSearch();
  const urls = [];
  const perPage = Math.min(depth, 100);
  for (let page = 0; urls.length < depth && page < Math.ceil(depth / perPage); page++) {
    const body = {
      query: { searchType: 'SEARCH_TYPE_RU', queryText: keyword, page },
      groupSpec: { groupMode: 'GROUP_MODE_FLAT', groupsOnPage: perPage, docsInGroup: 1 },
      region: String(region || 213),
      folderId: y.folderId,
      responseFormat: 'FORMAT_XML',
    };
    const r = await json(SEARCH_URL, {
      method: 'POST',
      headers: { Authorization: `Api-Key ${y.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const xml = Buffer.from(r.rawData || '', 'base64').toString('utf8');
    const found = [...xml.matchAll(/<doc\b[^>]*>[\s\S]*?<url>([\s\S]*?)<\/url>/gi)].map((m) => decode(m[1]).trim());
    if (!found.length) break;
    urls.push(...found);
  }
  return urls.slice(0, depth);
}

async function checkKeyword(kw, siteHost) {
  const urls = await serp(kw.keyword, kw.region, settings.yandexSearch().depth);
  const idx = urls.findIndex((u) => {
    const h = host(u);
    return h === siteHost || h.endsWith('.' + siteHost);
  });
  const position = idx >= 0 ? idx + 1 : null;
  await db.q(
    `INSERT INTO seo_positions (keyword_id, date, position, found_url) VALUES ($1,$2,$3,$4)
     ON CONFLICT (keyword_id, date) DO UPDATE SET position=EXCLUDED.position, found_url=EXCLUDED.found_url`,
    [kw.id, today(), position, idx >= 0 ? urls[idx] : null]
  );
  return position;
}

async function checkProject(projectId) {
  if (!isConfigured()) throw new Error('Yandex Search API не настроен — раздел «Сервисы и ключи»');
  const p = await db.one('SELECT * FROM projects WHERE id=$1', [projectId]);
  const siteHost = host(p.site_url || '');
  if (!siteHost) throw new Error('У проекта не указан сайт');
  const kws = await db.all("SELECT * FROM seo_keywords WHERE project_id=$1 AND active AND engine='yandex' ORDER BY id", [projectId]);
  const run = await db.one("INSERT INTO sync_runs (kind, project_id) VALUES ('seo',$1) RETURNING id", [projectId]);
  let ok = 0;
  const errors = [];
  for (const kw of kws) {
    try { await checkKeyword(kw, siteHost); ok++; } catch (err) { errors.push(`${kw.keyword}: ${err.message}`); }
  }
  await db.q('UPDATE sync_runs SET status=$2, finished_at=now(), rows=$3, error=$4 WHERE id=$1',
    [run.id, errors.length && !ok ? 'error' : 'ok', ok, errors.slice(0, 5).join('\n') || null]);
  return { checked: ok, errors };
}

async function checkDue() {
  if (!isConfigured()) return [];
  const due = await db.all(
    `SELECT p.id FROM projects p WHERE p.status='active' AND 'seo' = ANY(p.services)
       AND EXISTS (SELECT 1 FROM seo_keywords k WHERE k.project_id=p.id AND k.active AND k.engine='yandex')
       AND NOT EXISTS (SELECT 1 FROM sync_runs r WHERE r.project_id=p.id AND r.kind='seo' AND r.started_at > now() - ($1 || ' hours')::interval)`,
    [String(settings.schedule().seoIntervalHours)]
  );
  const out = [];
  for (const { id } of due) {
    try { out.push({ id, ...(await checkProject(id)) }); } catch (err) { out.push({ id, error: err.message }); }
  }
  return out;
}

// CSV позиций: keyword;engine;date;position[;url]
async function importPositions(projectId, rows) {
  let n = 0;
  for (const r of rows) {
    const kw = await db.one(
      `INSERT INTO seo_keywords (project_id, keyword, engine, region) VALUES ($1,$2,$3,$4)
       ON CONFLICT (project_id, keyword, engine, region) DO UPDATE SET keyword=EXCLUDED.keyword RETURNING id`,
      [projectId, r.keyword, r.engine || 'google', r.region || 213]
    );
    await db.q(
      `INSERT INTO seo_positions (keyword_id, date, position, found_url) VALUES ($1,$2,$3,$4)
       ON CONFLICT (keyword_id, date) DO UPDATE SET position=EXCLUDED.position, found_url=EXCLUDED.found_url`,
      [kw.id, r.date, r.position, r.url || null]
    );
    n++;
  }
  return n;
}

module.exports = { isConfigured, checkProject, checkDue, importPositions, host, serp };
