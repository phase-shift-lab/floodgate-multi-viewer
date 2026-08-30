import { cachePolicy, cachedResponseIsFresh, csaPath, dayPath, normalizeGameIds, ratingsPath, resolvePath, StatsRoom, validStatsSessionId } from './index.js';

describe('restricted Worker routing', () => {
  it('maps valid dates and fixed rating snapshots only', () => {
    expect(dayPath('2026-07-17')).toBe('/shogi/x/2026/07/17/');
    expect(dayPath('2026-02-30')).toBeNull();
    expect(ratingsPath('2026-07-17')).toBe('/shogi/x/rating/players-floodgate14-20260717.html');
  });

  it('accepts a strict CSA filename and rejects arbitrary paths', () => {
    const valid = 'wdoor+floodgate-300-10F+A+B+20260717123456.csa';
    expect(csaPath(valid)).toContain('/shogi/x/2026/07/17/');
    expect(csaPath('../secret.csa')).toBeNull();
    expect(csaPath('https://example.com/a.csa')).toBeNull();
    expect(csaPath(`${valid}?x=1`)).toBeNull();
  });

  it('does not expose an arbitrary proxy endpoint', () => {
    expect(resolvePath(new URL('https://worker.example/api/today'), new Date('2026-07-16T15:30:00Z'))).toBe('/shogi/x/2026/07/17/');
    expect(resolvePath(new URL('https://worker.example/api/proxy?url=https://example.com'))).toBeNull();
  });

  it('keeps live CSA out of the browser cache', () => {
    expect(cachePolicy('/shogi/x/2026/07/17/game.csa')).toEqual({ browser: 'no-store', edgeSeconds: 3 });
    const cached = new Response('ok', { headers: { 'X-FGMV-Cached-At': '2026-07-17T00:00:00.000Z' } });
    expect(cachedResponseIsFresh(cached, 3, Date.parse('2026-07-17T00:00:03.000Z'))).toBe(true);
  });

  it('uses bounded anonymous session identifiers for statistics', () => {
    expect(validStatsSessionId('session_123456')).toBe(true);
    expect(validStatsSessionId('../session123')).toBe(false);
    expect(normalizeGameIds([' a ', 'a', '', 42, 'x'.repeat(241), 'b'])).toEqual(['a', 'b']);
  });

  it('counts one anonymous visitor per day and tracks active game sessions', async () => {
    const values = new Map<string, unknown>();
    const state = {
      storage: {
        get: async (key: string) => values.get(key),
        put: async (key: string, value: unknown) => { values.set(key, value); },
        delete: async (key: string) => { values.delete(key); },
        list: async ({ prefix }: { prefix: string }) => new Map([...values].filter(([key]) => key.startsWith(prefix))),
      },
    };
    const room = new StatsRoom(state);
    const sessionId = 'session_123456';
    await room.fetch(new Request('https://worker.example/api/stats/page', { method: 'POST', body: JSON.stringify({ sessionId }) }));
    const response = await room.fetch(new Request('https://worker.example/api/stats/heartbeat', { method: 'POST', body: JSON.stringify({ sessionId, gameIds: ['game-a'] }) }));
    const stats = await response.json() as { pageViewsToday: number; games: Record<string, { viewsToday: number; concurrent: number }> };
    expect(stats.pageViewsToday).toBe(1);
    expect(stats.games['game-a']).toEqual({ viewsToday: 1, concurrent: 1 });
  });
});
