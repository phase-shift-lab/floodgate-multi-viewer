import { describe, expect, it } from 'vitest';
import { updateLivePosition } from './liveFollow';

describe('updateLivePosition', () => {
  it('最新局面を追従中なら新着手へ即時移動する', () => {
    expect(updateLivePosition(20, 20, 22, true)).toEqual({ ply: 22, hasNewMoves: false });
  });

  it('過去局面の閲覧中は手数を保ち、新着を通知する', () => {
    expect(updateLivePosition(12, 20, 22, false)).toEqual({ ply: 12, hasNewMoves: true });
  });

  it('初回取得では最新局面を表示する', () => {
    expect(updateLivePosition(Number.MAX_SAFE_INTEGER, 0, 30, false)).toEqual({ ply: 30, hasNewMoves: false });
  });

  it('棋譜が短くなった場合は範囲内へ収める', () => {
    expect(updateLivePosition(20, 20, 15, false)).toEqual({ ply: 15, hasNewMoves: false });
  });
});
