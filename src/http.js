const config = require('./config');

// fetch с таймаутом и понятной ошибкой (текст ответа API в сообщении)
async function request(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || config.requestTimeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Таймаут запроса: ${new URL(url).host}`);
    throw new Error(`Сеть: ${new URL(url).host} — ${err.cause ? err.cause.message || err.cause.code : err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function json(url, opts = {}) {
  const res = await request(url, opts);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { /* не JSON */ }
  if (!res.ok) {
    const msg = (body && (body.error_description || (body.error && (body.error.message || body.error.error_string || body.error)) || body.message)) || text.slice(0, 300);
    const err = new Error(`${new URL(url).host} HTTP ${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 300)}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { request, json, sleep };
