import { applyMove, boardAt, createInitialBoard, parseCsa } from './csa';
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
    const trusted = parseCsa(`PI\n+\n+7776FU\n'** 10\n-3334FU\n'** -5`);
    const sparse = parseCsa(`PI\n+\n+7776FU\n'** 10\n-3334FU\n+2726FU\n-8384FU`);
    expect(trusted.evaluationsTrusted).toBe(true);
    expect(sparse.evaluationsTrusted).toBe(false);
  });
});
