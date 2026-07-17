import type { GameSummary } from './types';

function rateFloor(game: GameSummary): number {
  return Math.min(game.blackRate ?? -Infinity, game.whiteRate ?? -Infinity);
}

function rateAverage(game: GameSummary): number {
  if (game.blackRate === undefined || game.whiteRate === undefined) return -Infinity;
  return (game.blackRate + game.whiteRate) / 2;
}

export function compareGames(a: GameSummary, b: GameSummary): number {
  return rateFloor(b) - rateFloor(a)
    || rateAverage(b) - rateAverage(a)
    || b.startedAt.localeCompare(a.startedAt);
}

export function selectFeaturedGames(games: GameSummary[], count: number): GameSummary[] {
  const selected: GameSummary[] = [];
  const used = new Map<string, number>();
  const groups = [...new Set(games.filter((game) => game.live).map((game) => game.group))];
  const primaryGroup = groups
    .map((group) => ({ group, games: games.filter((game) => game.live && game.group === group) }))
    .sort((a, b) => b.games.length - a.games.length || compareGames(a.games.sort(compareGames)[0], b.games.sort(compareGames)[0]))[0]?.group;
  const live = games.filter((game) => game.live && (!primaryGroup || game.group === primaryGroup));
  const finished = games.filter((game) => !game.live).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const pool = [...live, ...finished];

  while (selected.length < count && pool.length) {
    pool.sort((a, b) => {
      const duplicateA = (used.get(a.black) ?? 0) + (used.get(a.white) ?? 0);
      const duplicateB = (used.get(b.black) ?? 0) + (used.get(b.white) ?? 0);
      const liveDelta = Number(b.live) - Number(a.live);
      const adjustedFloorA = rateFloor(a) - duplicateA * 25;
      const adjustedFloorB = rateFloor(b) - duplicateB * 25;
      const adjustedAverageA = rateAverage(a) - duplicateA * 25;
      const adjustedAverageB = rateAverage(b) - duplicateB * 25;
      return liveDelta
        || adjustedFloorB - adjustedFloorA
        || adjustedAverageB - adjustedAverageA
        || b.startedAt.localeCompare(a.startedAt);
    });
    const next = pool.shift();
    if (!next) break;
    selected.push(next);
    used.set(next.black, (used.get(next.black) ?? 0) + 1);
    used.set(next.white, (used.get(next.white) ?? 0) + 1);
  }
  return selected;
}

export function rateLabel(rate?: number): string {
  return rate === undefined || !Number.isFinite(rate) ? 'レート不明' : Math.round(rate).toLocaleString('ja-JP');
}
