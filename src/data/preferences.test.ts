import { beforeEach, describe, expect, it } from 'vitest';
import { addRecent, loadFavorites, loadRecent, readShareState, saveFavorites, shareUrl } from './preferences';

describe('preferences', () => {
  beforeEach(() => localStorage.clear());

  it('配列設定を配列のまま復元する', () => {
    saveFavorites(['Alpha', 'Beta']);
    addRecent('game-1');
    addRecent('game-2');

    expect(loadFavorites()).toEqual(['Alpha', 'Beta']);
    expect(loadRecent()).toEqual(['game-2', 'game-1']);
  });

  it('壊れた保存値では安全な既定値へ戻る', () => {
    localStorage.setItem('fgmv:favorites:v1', '{invalid');
    localStorage.setItem('fgmv:recent:v1', JSON.stringify({ unexpected: true }));

    expect(loadFavorites()).toEqual([]);
    expect(loadRecent()).toEqual([]);
  });

  it('共有URLで対局・手数・表示局数・盤面方向を復元できる', () => {
    const url = new URL(shareUrl({ game: 'game-1', ply: 12, view: 'archive', boards: 2, orientation: 'white' }));
    expect(readShareState(url.search)).toEqual({ game: 'game-1', ply: 12, view: 'archive', boards: 2, orientation: 'white' });
  });
});
