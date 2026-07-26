import {
  applyMove,
  boardAt,
  createInitialBoard,
  formatFinalReason,
  formatMove,
  formatMoveInGame,
  formatMoveSource,
  parseCsa,
} from './csa';
import type { Move } from './types';

describe('CSA parser', () => {
  it('parses promotion, non-promotion and resignation', () => {
    const game = parseCsa(`V2.2\nN+Alpha\nN-Beta\nPI\n+\n+7776FU\n-3334FU\n+8822UM\n%TORYO`);
    expect(game.moveList.map((move) => move.piece)).toEqual(['FU', 'FU', 'UM']);
    expect(boardAt(game, 3).squares['22']).toEqual({ side: '+', code: 'UM' });
    expect(game.result).toBe('先手勝ち');
  });

  it('handles capture, demotion into hand, and a drop', () => {
    let board = createInitialBoard();
    const capture: Move = { index: 1, side: '+', from: '88', to: '22', piece: 'UM', raw: '+8822UM' };
    board = applyMove(board, capture);
    expect(board.hands['+'].KA).toBe(1);
    const drop: Move = { index: 2, side: '+', from: '00', to: '55', piece: 'KA', raw: '+0055KA' };
    board = applyMove(board, drop);
    expect(board.hands['+'].KA).toBe(0);
    expect(board.squares['55']).toEqual({ side: '+', code: 'KA' });
  });

  it('parses initial pieces in hand and side to move', () => {
    const game = parseCsa(`V2.2\nPI\nP+00FU00FU\nP-00KA\n-`);
    expect(game.initial.hands['+'].FU).toBe(2);
    expect(game.initial.hands['-'].KA).toBe(1);
    expect(game.initial.turn).toBe('-');
  });

  it('accepts incomplete CSA without inventing a result', () => {
    const game = parseCsa(`V2.2\nN+Alpha\nN-Beta\nPI\n+\n+7776FU\nT2`);
    expect(game.live).toBe(true);
    expect(game.result).toBeUndefined();
    expect(game.moveList).toHaveLength(1);
    expect(game.moveList[0].time).toBe(2);
  });

  it('only trusts dense evaluation sequences', () => {
    const trusted = parseCsa(`PI\n+\n+7776FU\n'** 10 -3334FU\n-3334FU\n'** -5 +2726FU`);
    const sparse = parseCsa(`PI\n+\n+7776FU\n'** 10\n-3334FU\n+2726FU\n-8384FU`);
    expect(trusted.evaluationsTrusted).toBe(true);
    expect(sparse.evaluationsTrusted).toBe(false);
  });

  it('parses ratings in current Floodgate CSA metadata', () => {
    const game = parseCsa(`N+AobaZero\nN-nshogi-dev\n'black_rate:AobaZero:3393\n'white_rate:nshogi-dev:3776\nPI\n+`);
    expect(game).toMatchObject({ blackRate: 3393, whiteRate: 3776 });
  });

  it('formats CSA moves as Japanese kifu notation', () => {
    const game = parseCsa(`V2.2\nN+Alpha\nN-Beta\nPI\n+\n+7776FU\n-3334FU\n+8822UM\n-3122GI\n+0055KA\n%TORYO`);

    expect(game.moveList.map((move) => formatMoveInGame(game, move.index))).toEqual([
      '▲７六歩',
      '△３四歩',
      '▲２二角成',
      '△同銀',
      '▲５五角打',
    ]);
    expect(formatMoveSource(game.moveList[0])).toBe('(77)');
    expect(formatMoveSource(game.moveList[4])).toBeUndefined();
    expect(formatFinalReason(game)).toBe('△投了');
  });

  it('marks non-promotion when a promotable piece stays unpromoted in the zone', () => {
    const board = createInitialBoard();
    board.squares['77'] = { side: '-', code: 'FU' };
    const move: Move = { index: 1, side: '-', from: '77', to: '78', piece: 'FU', raw: '-7778FU' };
    expect(formatMove(move, board)).toBe('△７八歩不成');
  });

  it('formats incomplete move records from available information only', () => {
    const move: Move = { index: 2, side: '-', from: '31', to: '22', piece: 'GI', raw: '-3122GI' };
    const previousMove: Move = { index: 1, side: '+', from: '88', to: '22', piece: 'UM', raw: '+8822UM' };
    expect(formatMove(move, undefined, previousMove)).toBe('△同銀');
  });
});
