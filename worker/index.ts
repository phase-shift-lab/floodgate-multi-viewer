export interface Env {
  ALLOWED_ORIGINS: string;
  STATS_ROOM?: DurableObjectNamespace;
}

const UPSTREAM = 'https://wdoor.c.u-tokyo.ac.jp';
const FETCH_TIMEOUT_MS = 8_000;
const STALE_RETENTION_SECONDS = 86_400;
const STATS_PRESENCE_TTL_MS = 60_000;
const MAX_STATS_GAMES = 8;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CSA_PATTERN = /^wdoor\+[^/\\]+\+(\d{14})\.csa$/i;
const STATS_SESSION_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

export function jstDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function dayPath(date: string): string | null {
  if (!DAY_PATTERN.test(date)) return null;
  const [year, month, day] = date.split('-');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return `/shogi/x/${year}/${month}/${day}/`;
}

export function csaPath(file: string): string | null {
  if (file !== file.split(/[?#]/, 1)[0]) return null;
  const match = file.match(CSA_PATTERN);
  if (!match) return null;
  const stamp = match[1];
  const path = dayPath(`${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`);
  return path ? `${path}${encodeURIComponent(file)}` : null;
}

export function ratingsPath(date: string): string | null {
  if (!dayPath(date)) return null;
  return `/shogi/x/rating/players-floodgate14-${date.replaceAll('-', '')}.html`;
}

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : '';
}

function corsHeaders(origin: string | null): HeadersInit {
  return origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  } : {};
}

function response(message: string, status: number, origin: string | null): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders(origin) },
  });
}

function jsonResponse(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(origin) },
  });
}

async function fetchWithTimeout(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('upstream timeout'), FETCH_TIMEOUT_MS);
    try {
      const upstream = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'text/plain,text/html', 'User-Agent': 'FloodgateMultiViewer/1.0 (+GitHub Pages)' },
      });
      if (upstream.ok || (upstream.status < 500 && upstream.status !== 429)) return upstream;
      lastError = new Error(`upstream ${upstream.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError instanceof Error ? lastError : new Error('upstream unavailable');
}

export function cachePolicy(path: string): { browser: string; edgeSeconds: number } {
  if (path.includes('/rating/')) return { browser: 'public, max-age=3600', edgeSeconds: 21_600 };
  if (path.endsWith('.csa')) return { browser: 'no-store', edgeSeconds: 3 };
  return { browser: 'public, max-age=5', edgeSeconds: 15 };
}

export function cachedResponseIsFresh(response: Response, edgeSeconds: number, now = Date.now()): boolean {
  const cachedAt = Date.parse(response.headers.get('X-FGMV-Cached-At') ?? '');
  const age = now - cachedAt;
  return Number.isFinite(cachedAt) && age >= 0 && age <= edgeSeconds * 1_000;
}

async function proxy(request: Request, env: Env, path: string, context: ExecutionContext): Promise<Response> {
  const origin = allowedOrigin(request, env);
  if (origin === '') return response('Origin not allowed', 403, null);
  const cache = caches.default;
  const cacheKey = new Request(`${UPSTREAM}${path}`, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  const policy = cachePolicy(path);
  if (cached && cachedResponseIsFresh(cached, policy.edgeSeconds)) return decorate(cached, origin, false, policy.browser);
  try {
    const upstream = await fetchWithTimeout(cacheKey.url);
    if (!upstream.ok) {
      if (cached) return decorate(cached, origin, true, policy.browser);
      return response(`Upstream ${upstream.status}`, upstream.status, origin);
    }
    const body = await upstream.arrayBuffer();
    const stored = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? (path.endsWith('.csa') ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8'),
        // Keep an expired copy at the edge so it can be served as stale during
        // an upstream outage. The browser policy is applied only on egress.
        'Cache-Control': `public, max-age=${STALE_RETENTION_SECONDS}`,
        'X-FGMV-Cached-At': new Date().toISOString(),
      },
    });
    context.waitUntil(cache.put(cacheKey, stored.clone()));
    return decorate(stored, origin, false, policy.browser);
  } catch {
    if (cached) return decorate(cached, origin, true, policy.browser);
    return response('Upstream unavailable', 503, origin);
  }
}

function decorate(source: Response, origin: string | null, stale: boolean, browserCache: string): Response {
  const headers = new Headers(source.headers);
  Object.entries(corsHeaders(origin)).forEach(([key, value]) => headers.set(key, value));
  headers.set('Cache-Control', browserCache);
  headers.set('X-FGMV-Stale', stale ? '1' : '0');
  return new Response(source.body, { status: source.status, headers });
}

export function resolvePath(url: URL, now = new Date()): string | null {
  if (url.pathname === '/api/today') return dayPath(jstDate(now));
  if (url.pathname === '/api/day') return dayPath(url.searchParams.get('date') ?? '');
  if (url.pathname === '/api/ratings') return ratingsPath(url.searchParams.get('date') ?? '');
  if (url.pathname === '/api/csa') return csaPath(url.searchParams.get('file') ?? '');
  return null;
}

export function validStatsSessionId(value: unknown): value is string {
  return typeof value === 'string' && STATS_SESSION_PATTERN.test(value);
}

export function normalizeGameIds(value: unknown): string[] {
  const rawValues = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : [];
  const ids = new Set<string>();
  for (const raw of rawValues) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (id.length === 0 || id.length > 240) continue;
    ids.add(id);
    if (ids.size >= MAX_STATS_GAMES) break;
  }
  return [...ids];
}

function statKeyPart(value: string): string {
  return encodeURIComponent(value);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function unavailableStats(): Record<string, unknown> {
  return { available: false, day: jstDate(), pageViewsToday: 0, games: {} };
}

async function handleStats(request: Request, env: Env, origin: string | null): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (pathname !== '/api/stats' && !pathname.startsWith('/api/stats/')) return null;
  if (!env.STATS_ROOM) return jsonResponse(unavailableStats(), 200, origin);

  const id = env.STATS_ROOM.idFromName('global');
  const upstream = await env.STATS_ROOM.get(id).fetch(request);
  const headers = new Headers(upstream.headers);
  Object.entries(corsHeaders(origin)).forEach(([key, value]) => headers.set(key, value));
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

export class StatsRoom {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = Date.now();
    const day = jstDate(new Date(now));

    if (request.method === 'GET' && url.pathname === '/api/stats') {
      return jsonResponse(await this.stats(normalizeGameIds(url.searchParams.get('games') ?? ''), now, day), 200, null);
    }

    if (request.method === 'POST' && url.pathname === '/api/stats/page') {
      const body = await readJson(request);
      const sessionId = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).sessionId : undefined;
      if (!validStatsSessionId(sessionId)) return jsonResponse({ error: 'invalid session' }, 400, null);

      const seenKey = `seen:page:${day}:${sessionId}`;
      if (!(await this.state.storage.get<boolean>(seenKey))) {
        await this.increment(`count:page:${day}`);
        await this.state.storage.put(seenKey, true);
      }
      return jsonResponse(await this.stats([], now, day), 200, null);
    }

    if (request.method === 'POST' && url.pathname === '/api/stats/heartbeat') {
      const body = await readJson(request);
      const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
      const sessionId = record.sessionId;
      if (!validStatsSessionId(sessionId)) return jsonResponse({ error: 'invalid session' }, 400, null);

      const gameIds = normalizeGameIds(record.gameIds);
      for (const gameId of gameIds) {
        const gameKey = statKeyPart(gameId);
        const seenKey = `seen:game:${day}:${gameKey}:${sessionId}`;
        if (!(await this.state.storage.get<boolean>(seenKey))) {
          await this.increment(`count:game:${day}:${gameKey}`);
          await this.state.storage.put(seenKey, true);
        }
        await this.state.storage.put(`presence:${gameKey}:${sessionId}`, now);
      }
      return jsonResponse(await this.stats(gameIds, now, day), 200, null);
    }

    return jsonResponse({ error: 'not found' }, 404, null);
  }

  private async stats(gameIds: string[], now: number, day: string): Promise<Record<string, unknown>> {
    const games: Record<string, { viewsToday: number; concurrent: number }> = {};
    for (const gameId of gameIds) {
      const gameKey = statKeyPart(gameId);
      games[gameId] = {
        viewsToday: await this.count(`count:game:${day}:${gameKey}`),
        concurrent: await this.concurrent(gameKey, now),
      };
    }
    return { available: true, day, pageViewsToday: await this.count(`count:page:${day}`), games };
  }

  private async count(key: string): Promise<number> {
    return (await this.state.storage.get<number>(key)) ?? 0;
  }

  private async increment(key: string): Promise<void> {
    await this.state.storage.put(key, (await this.count(key)) + 1);
  }

  private async concurrent(gameKey: string, now: number): Promise<number> {
    const rows = await this.state.storage.list<number>({ prefix: `presence:${gameKey}:` });
    let count = 0;
    for (const [key, updatedAt] of rows) {
      if (now - updatedAt <= STATS_PRESENCE_TTL_MS) {
        count += 1;
      } else {
        await this.state.storage.delete(key);
      }
    }
    return count;
  }
}

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const origin = allowedOrigin(request, env);
    if (origin === '') return response('Origin not allowed', 403, null);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    const stats = await handleStats(request, env, origin);
    if (stats) return stats;
    if (request.method !== 'GET') return response('Method not allowed', 405, origin);
    const path = resolvePath(new URL(request.url));
    if (!path) return response('Not found or invalid parameter', 404, origin);
    return proxy(request, env, path, context);
  },
} satisfies ExportedHandler<Env>;
