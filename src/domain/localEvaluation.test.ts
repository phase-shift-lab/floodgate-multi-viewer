import { boardAt, createInitialBoard, parseCsa } from './csa';
import { advantageScale, formatPrincipalVariation, parseCandidate, parseLocalScore, scoreLabel, toEnginePosition, toSfen } from './localEvaluation';

describe('local engine position and scores', () => {
  it('serializes a starting position and the side to move', () => {
    expect(toSfen(createInitialBoard())).toBe('lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1');
    const game = parseCsa('PI\n+\n+7776FU\n-3334FU\n+8822UM');
    expect(toSfen(boardAt(game, 3))).toBe('lnsgkgsnl/1r5+B1/pppppp1pp/6p2/9/2P6/PP1PPPPPP/7R1/LNSGKGSNL w B 4');
  });
  it('serializes hands with counts, including a drop', () => {
    const board = createInitialBoard();
    board.hands['+'] = { FU: 2, HI: 1 };
    board.hands['-'] = { KA: 1, GI: 3 };
    expect(toSfen(board)).toContain(' b R2Pb3s 1');
  });
  it('preserves move history, promotion, already promoted pieces and drops', () => {
    const game = parseCsa('PI\n+\n+7776FU\n-3334FU\n+8822UM\n-3142GI\n+0025KA\n-4233GI\n+2233UM');
    expect(toEnginePosition(game, 5)).toContain(' moves 7g7f 3c3d 8h2b+ 3a4b B*2e');
    expect(toEnginePosition(game, 7)).toContain(' moves 7g7f 3c3d 8h2b+ 3a4b B*2e 4b3c 2b3c');
    expect(toEnginePosition(game, 0)).not.toContain(' moves ');
  });
  it('normalizes scores and bounds to black regardless of turn', () => {
    expect(parseLocalScore('info depth 12 score cp 240 pv 7g7f', '-')).toEqual({kind: 'cp', value: -240, depth: 12, bound: undefined});
    expect(parseLocalScore('info depth 9 score cp -20 lowerbound', '-')?.bound).toBe('upperbound');
    expect(scoreLabel(parseLocalScore('info depth 10 score mate -5', '-')!)).toBe('先手の詰み 5手');
    expect(parseLocalScore('info depth 10 multipv 2 score cp 30', '+')).toBeUndefined();
    expect(parseLocalScore('info string loading progress file', '+')).toBeUndefined();
  });
  it('parses multiple candidates and preserves their USI variations', () => {
    const candidate = parseCandidate('info depth 12 multipv 2 score cp 240 lowerbound pv 7g7f 3c3d', '-')!;
    expect(candidate.rank).toBe(2);
    expect(candidate.score).toEqual({kind: 'cp', value: -240, depth: 12, bound: 'upperbound'});
    expect(candidate.pv).toEqual(['7g7f', '3c3d']);
    expect(parseCandidate('info depth 12 multipv 4 score cp 240', '+')).toBeUndefined();
  });
  it('formats promotion, same-square capture and drops in a six-ply PV', () => {
    expect(formatPrincipalVariation(createInitialBoard(), ['7g7f','3c3d','8h2b+','3a2b','B*4e','B*5d','2g2f'])).toEqual(['▲７六歩','△３四歩','▲２二角成','△同銀','▲４五角打','△５四角打']);
    expect(formatPrincipalVariation(createInitialBoard(), ['B*4e'])).toEqual([]);
    expect(formatPrincipalVariation(createInitialBoard(), ['7g7f','not-a-move'])).toEqual(['▲７六歩']);
  });
  it('uses a neutral bounded score scale without manufacturing a win rate', () => {
    expect(advantageScale()).toBe(50);
    expect(advantageScale({kind:'cp', value:0, depth:1})).toBe(50);
    expect(advantageScale({kind:'cp', value:800, depth:1})).toBeGreaterThan(50);
    expect(advantageScale({kind:'mate', value:-3, depth:1})).toBe(0);
  });
});
