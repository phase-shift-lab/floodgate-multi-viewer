import sampleCsa from '../fixtures/floodgate-sample.csa?raw';
import ratingsHtml from '../fixtures/ratings-sample.html?raw';
import todayHtml from '../fixtures/today-sample.html?raw';
import { parseCsa } from '../domain/csa';
import { attachRatings, parseGameListHtml, parsePlayerRatingsHtml } from '../domain/html';
import type { GameSummary, ParsedGame } from '../domain/types';

const baseGames = attachRatings(parseGameListHtml(todayHtml), parsePlayerRatingsHtml(ratingsHtml));

export function gameFromSummary(summary: GameSummary): ParsedGame {
  let source = sampleCsa
    .replace(/N\+.*$/m, `N+${summary.black}`)
    .replace(/N-.*$/m, `N-${summary.white}`)
    .replace(/^\$EVENT:.*$/m, `$EVENT:${summary.id}`);
  source = summary.blackRate === undefined
    ? source.replace(/^'black_rate:.*\r?\n?/m, '')
    : source.replace(/^'black_rate:.*$/m, `'black_rate:${summary.blackRate}`);
  source = summary.whiteRate === undefined
    ? source.replace(/^'white_rate:.*\r?\n?/m, '')
    : source.replace(/^'white_rate:.*$/m, `'white_rate:${summary.whiteRate}`);
  const liveSource = summary.live ? source.replace(/\n%TORYO\s*$/, '') : source;
  return { ...parseCsa(liveSource, summary.id), ...summary, sourceText: liveSource };
}

export const fixtureGames = baseGames.map(gameFromSummary);
export const fixtureSummaries: GameSummary[] = fixtureGames.map((game) => ({
  id: game.id,
  group: game.group,
  black: game.black,
  white: game.white,
  blackRate: game.blackRate,
  whiteRate: game.whiteRate,
  startedAt: game.startedAt,
  endedAt: game.endedAt,
  live: game.live,
  result: game.result,
  moves: game.moves,
  csaPath: game.csaPath,
}));

export function fixtureGame(summary: GameSummary): ParsedGame {
  return fixtureGames.find((game) => game.id === summary.id) ?? gameFromSummary(summary);
}

export { ratingsHtml, sampleCsa, todayHtml };
