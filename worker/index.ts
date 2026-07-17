export interface Env {
  ALLOWED_ORIGINS: string;
}

const UPSTREAM = 'https://wdoor.c.u-tokyo.ac.jp';
const FETCH_TIMEOUT_MS = 8_000;
const STALE_RETENTION_SECONDS = 86_400;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CSA_PATTERN = /^wdoor\+[^/\\]+\+(\d{14})\.csa$/i;

function jstDate(date = new Date()): string {
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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept',
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

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const origin = allowedOrigin(request, env);
    if (origin === '') return response('Origin not allowed', 403, null);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== 'GET') return response('Method not allowed', 405, origin);
    const path = resolvePath(new URL(request.url));
    if (!path) return response('Not found or invalid parameter', 404, origin);
    return proxy(request, env, path, context);
  },
} satisfies ExportedHandler<Env>;
