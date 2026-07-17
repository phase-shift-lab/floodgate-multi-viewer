import { fixtureGame } from './fixtures';
import type { GameSummary } from '../domain/types';

describe('real-data fixture fallback', () => {
  it('adapts the fixture to the requested game without inventing unknown ratings', () => {
    const summary: GameSummary = {
      id: 'wdoor+floodgate-300-10F+unknown-black+unknown-white+20260717180000.csa',
      group: 'floodgate-300-10F',
      black: 'unknown-black',
      white: 'unknown-white',
      startedAt: '2026-07-17T18:00:00+09:00',
      live: true,
      csaPath: 'wdoor+floodgate-300-10F+unknown-black+unknown-white+20260717180000.csa',
    };

    const game = fixtureGame(summary);

    expect(game.id).toBe(summary.id);
    expect(game.black).toBe(summary.black);
    expect(game.white).toBe(summary.white);
    expect(game.blackRate).toBeUndefined();
    expect(game.whiteRate).toBeUndefined();
    expect(game.sourceText).not.toContain("'black_rate:");
    expect(game.sourceText).not.toContain("'white_rate:");
  });
});
