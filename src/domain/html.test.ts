import { attachRatings, parseGameListHtml, parsePlayerRatingsHtml, summaryFromCsaName } from './html';

describe('Floodgate HTML parsers', () => {
  it('parses a CSA filename without depending on page styling', () => {
    const game = summaryFromCsaName('wdoor+floodgate-300-10F+Long_AI_Name+Opponent+20260717123456.csa', '手数: 42 LIVE');
    expect(game).toMatchObject({ black: 'Long_AI_Name', white: 'Opponent', moves: 42, live: true });
  });

  it('parses and attaches player ratings', () => {
    const ratings = parsePlayerRatingsHtml('<table><tr><th>Player</th><th>Rate</th></tr><tr><td>Alpha</td><td>3123.5</td></tr><tr><td>Beta</td><td>2990</td></tr></table>');
    const games = parseGameListHtml('<a href="wdoor+floodgate-300-10F+Alpha+Beta+20260717123456.csa">game</a>');
    expect(attachRatings(games, ratings)[0]).toMatchObject({ blackRate: 3123.5, whiteRate: 2990 });
  });

  it('ignores unrelated and duplicate links', () => {
    const html = '<a href="readme.txt">x</a><a href="wdoor+g+A+B+20260717123456.csa">1</a><a href="wdoor+g+A+B+20260717123456.csa">2</a>';
    expect(parseGameListHtml(html)).toHaveLength(1);
  });
});
