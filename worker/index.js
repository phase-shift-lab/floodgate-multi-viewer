/* global AbortController, Headers, Request, Response, URL, caches, clearTimeout, fetch, setTimeout */

const UPSTREAM = 'https://wdoor.c.u-tokyo.ac.jp';
const ALLOWED_ORIGINS = new Set(['https://phase-shift-lab.github.io', 'http://localhost:5173']);
const FETCH_TIMEOUT_MS = 8_000;
const STALE_RETENTION_SECONDS = 86_400;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CSA_PATTERN = /^wdoor\+[^/\\]+\+(\d{14})\.csa$/i;
const STATS_PRESENCE_TTL_MS = 60_000;
const MAX_STATS_GAMES = 8;
const STATS_SESSION_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

export function jstDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function dayPath(date) {
  if (!DAY_PATTERN.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) return null;
  const [year, month, day] = date.split('-');
  return `/shogi/x/${year}/${month}/${day}/`;
}

export function csaPath(file) {
  if (file !== file.split(/[?#]/, 1)[0]) return null;
  const match = file.match(CSA_PATTERN);
  if (!match) return null;
  const stamp = match[1];
  const path = dayPath(`${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`);
  return path ? `${path}${encodeURIComponent(file)}` : null;
}

export function ratingsPath(date) {
  return dayPath(date) ? `/shogi/x/rating/players-floodgate14-${date.replaceAll('-', '')}.html` : null;
}

export function resolvePath(url, now = new Date()) {
  if (url.pathname === '/health') return '/health';
  if (url.pathname === '/api/today') return dayPath(jstDate(now));
  if (url.pathname === '/api/day') return dayPath(url.searchParams.get('date') ?? '');
  if (url.pathname === '/api/ratings') return ratingsPath(url.searchParams.get('date') ?? '');
  if (url.pathname === '/api/csa') return csaPath(url.searchParams.get('file') ?? '');
  return null;
}

function originFor(request) {
  const origin = request.headers.get('Origin');
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function corsHeaders(origin) {
  return origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Accept, Content-Type', Vary: 'Origin' } : {};
}

function text(message, status, origin) {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders(origin) } });
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(origin) } });
}

export function cachePolicy(path) {
  if (path.includes('/rating/')) return { browser: 'public, max-age=3600', edgeSeconds: 21_600 };
  if (path.endsWith('.csa')) return { browser: 'no-store', edgeSeconds: 3 };
  return { browser: 'public, max-age=5', edgeSeconds: 15 };
}

export function cachedResponseIsFresh(response, edgeSeconds, now = Date.now()) {
  const cachedAt = Date.parse(response.headers.get('X-FGMV-Cached-At') ?? '');
  const age = now - cachedAt;
  return Number.isFinite(cachedAt) && age >= 0 && age <= edgeSeconds * 1_000;
}

async function fetchWithTimeout(url) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'text/plain,text/html', 'User-Agent': 'FloodgateMultiViewer/1.0 (+GitHub Pages)' } });
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      lastError = new Error(`upstream ${response.status}`);
    } catch (error) { lastError = error; }
    finally { clearTimeout(timer); }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error('upstream unavailable');
}

function decorate(response, origin, stale, cacheControl) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(origin)).forEach(([key, value]) => headers.set(key, value));
  headers.set('Cache-Control', cacheControl);
  headers.set('X-FGMV-Stale', stale ? '1' : '0');
  return new Response(response.body, { status: response.status, headers });
}

async function proxy(path, context, origin) {
  const policy = cachePolicy(path);
  const cacheKey = new Request(`${UPSTREAM}${path}`);
  const cached = await caches.default.match(cacheKey);
  if (cached && cachedResponseIsFresh(cached, policy.edgeSeconds)) return decorate(cached, origin, false, policy.browser);
  try {
    const upstream = await fetchWithTimeout(cacheKey.url);
    if (!upstream.ok) return cached ? decorate(cached, origin, true, policy.browser) : text(`Upstream ${upstream.status}`, upstream.status, origin);
    const body = await upstream.arrayBuffer();
    const stored = new Response(body, { headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? (path.endsWith('.csa') ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8'), 'Cache-Control': `public, max-age=${STALE_RETENTION_SECONDS}`, 'X-FGMV-Cached-At': new Date().toISOString() } });
    context.waitUntil(caches.default.put(cacheKey, stored.clone()));
    return decorate(stored, origin, false, policy.browser);
  } catch {
    return cached ? decorate(cached, origin, true, policy.browser) : text('Upstream unavailable', 503, origin);
  }
}

export function validStatsSessionId(value) {
  return typeof value === 'string' && STATS_SESSION_PATTERN.test(value);
}

export function normalizeGameIds(value) {
  const rawValues = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : [];
  const ids = new Set();
  for (const raw of rawValues) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!id || id.length > 240) continue;
    ids.add(id);
    if (ids.size >= MAX_STATS_GAMES) break;
  }
  return [...ids];
}

function unavailableStats() {
  return { available: false, day: jstDate(), pageViewsToday: 0, games: {} };
}

async function handleStats(request, env, origin) {
  const pathname = new URL(request.url).pathname;
  if (pathname !== '/api/stats' && !pathname.startsWith('/api/stats/')) return null;
  if (!env.STATS_ROOM) return json(unavailableStats(), 200, origin);
  const id = env.STATS_ROOM.idFromName('global');
  const response = await env.STATS_ROOM.get(id).fetch(request);
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(origin)).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}

export class StatsRoom {
  constructor(state) { this.state = state; }

  async fetch(request) {
    const url = new URL(request.url);
    const now = Date.now();
    const day = jstDate(new Date(now));
    if (request.method === 'GET' && url.pathname === '/api/stats') return json(await this.stats(normalizeGameIds(url.searchParams.get('games') ?? ''), now, day), 200, null);
    if (request.method !== 'POST') return json({ error: 'not found' }, 404, null);
    let body;
    try { body = await request.json(); } catch { body = undefined; }
    const record = typeof body === 'object' && body !== null ? body : {};
    if (!validStatsSessionId(record.sessionId)) return json({ error: 'invalid session' }, 400, null);

    if (url.pathname === '/api/stats/page') {
      const key = `seen:page:${day}:${record.sessionId}`;
      if (!await this.state.storage.get(key)) {
        await this.increment(`count:page:${day}`);
        await this.state.storage.put(key, true);
      }
      return json(await this.stats([], now, day), 200, null);
    }

    if (url.pathname === '/api/stats/heartbeat') {
      for (const gameId of normalizeGameIds(record.gameIds)) {
        const gameKey = encodeURIComponent(gameId);
        const seenKey = `seen:game:${day}:${gameKey}:${record.sessionId}`;
        if (!await this.state.storage.get(seenKey)) {
          await this.increment(`count:game:${day}:${gameKey}`);
          await this.state.storage.put(seenKey, true);
        }
        await this.state.storage.put(`presence:${gameKey}:${record.sessionId}`, now);
      }
      return json(await this.stats(normalizeGameIds(record.gameIds), now, day), 200, null);
    }
    return json({ error: 'not found' }, 404, null);
  }

  async stats(gameIds, now, day) {
    const games = {};
    for (const gameId of gameIds) {
      const gameKey = encodeURIComponent(gameId);
      games[gameId] = { viewsToday: await this.count(`count:game:${day}:${gameKey}`), concurrent: await this.concurrent(gameKey, now) };
    }
    return { available: true, day, pageViewsToday: await this.count(`count:page:${day}`), games };
  }

  async count(key) { return (await this.state.storage.get(key)) ?? 0; }

  async increment(key) { await this.state.storage.put(key, (await this.count(key)) + 1); }

  async concurrent(gameKey, now) {
    const rows = await this.state.storage.list({ prefix: `presence:${gameKey}:` });
    let count = 0;
    for (const [key, updatedAt] of rows) {
      if (now - updatedAt <= STATS_PRESENCE_TTL_MS) count += 1;
      else await this.state.storage.delete(key);
    }
    return count;
  }
}

export default {
  async fetch(request, _env, context) {
    const originHeader = request.headers.get('Origin');
    const origin = originFor(request);
    if (originHeader && !origin) return text('Origin not allowed', 403, null);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    const stats = await handleStats(request, _env, origin);
    if (stats) return stats;
    if (request.method !== 'GET') return text('Method not allowed', 405, origin);
    const path = resolvePath(new URL(request.url));
    if (!path) return text('Not found or invalid parameter', 404, origin);
    if (path === '/health') return text('ok', 200, origin);
    return proxy(path, context, origin);
  },
};
