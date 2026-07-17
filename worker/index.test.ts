import { cachePolicy, cachedResponseIsFresh, csaPath, dayPath, ratingsPath, resolvePath } from './index';

describe('restricted Worker routing', () => {
  it('maps only valid calendar dates and fixed rating snapshots', () => {
    expect(dayPath('2026-07-17')).toBe('/shogi/x/2026/07/17/');
    expect(dayPath('2026-02-30')).toBeNull();
    expect(ratingsPath('2026-07-17')).toBe('/shogi/x/rating/players-floodgate14-20260717.html');
  });

  it('accepts a strict CSA filename and rejects traversal or arbitrary URLs', () => {
    const valid = 'wdoor+floodgate-300-10F+A+B+20260717123456.csa';
    expect(csaPath(valid)).toContain('/shogi/x/2026/07/17/');
    expect(csaPath('../secret.csa')).toBeNull();
    expect(csaPath('https://example.com/a.csa')).toBeNull();
    expect(csaPath(`${valid}?x=1`)).toBeNull();
  });

  it('has no arbitrary proxy endpoint', () => {
    expect(resolvePath(new URL('https://worker.example/api/today'), new Date('2026-07-16T15:30:00Z'))).toBe('/shogi/x/2026/07/17/');
    expect(resolvePath(new URL('https://worker.example/api/proxy?url=https://example.com'))).toBeNull();
    expect(resolvePath(new URL('https://worker.example/api/day?date=../../etc'))).toBeNull();
  });

  it('keeps live CSA out of the browser cache and limits the edge cache to three seconds', () => {
    expect(cachePolicy('/shogi/x/2026/07/17/game.csa')).toEqual({ browser: 'no-store', edgeSeconds: 3 });
    expect(cachePolicy('/shogi/x/2026/07/17/').edgeSeconds).toBe(15);
    expect(cachePolicy('/shogi/x/rating/players.html').edgeSeconds).toBe(21_600);
  });

  it('uses the cached timestamp only inside the route freshness window', () => {
    const cached = new Response('ok', { headers: { 'X-FGMV-Cached-At': '2026-07-17T00:00:00.000Z' } });
    const now = Date.parse('2026-07-17T00:00:03.000Z');
    expect(cachedResponseIsFresh(cached, 3, now)).toBe(true);
    expect(cachedResponseIsFresh(cached, 3, now + 1)).toBe(false);
  });
});
