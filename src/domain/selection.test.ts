import { compareGames, rateLabel, selectFeaturedGames } from './selection';
import type { GameSummary } from './types';

function game(id: string, black: string, white: string, blackRate: number | undefined, whiteRate: number | undefined, live = true, group = 'g', startedAt = id): GameSummary {
  return { id, black, white, blackRate, whiteRate, live, group, startedAt, csaPath: `${id}.csa` };
}

describe('featured game selection', () => {
  it('orders by lower rating, average, then newest start', () => {
    const values = [
      game('old', 'A', 'B', 3000, 3200, true, 'g', '2026-01-01'),
      game('new', 'C', 'D', 3000, 3200, true, 'g', '2026-01-02'),
      game('higher-floor', 'E', 'F', 3050, 3060, true, 'g', '2025-01-01'),
    ];
    expect(values.sort(compareGames).map((value) => value.id)).toEqual(['higher-floor', 'new', 'old']);
  });

  it('applies a light duplicate-player penalty and fills with recent finished games', () => {
    const values = [
      game('best', 'A', 'B', 3500, 3500),
      game('duplicate', 'A', 'C', 3490, 3490),
      game('diverse', 'D', 'E', 3300, 3300),
      game('finished', 'F', 'G', 3400, 3400, false, 'g', '2026-02-01'),
    ];
    expect(selectFeaturedGames(values, 4).map((value) => value.id)).toEqual(['best', 'diverse', 'duplicate', 'finished']);
  });

  it('labels unavailable ratings explicitly', () => {
    expect(rateLabel(undefined)).toBe('レート不明');
  });
});
