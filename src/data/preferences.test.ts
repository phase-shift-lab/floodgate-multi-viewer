import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addRecent, DEFAULT_ARCHIVE_FILTERS, loadArchiveFilters, loadFavorites, loadRecent, loadSettings, readShareState, saveArchiveFilters, saveFavorites, saveSettings, shareUrl } from './preferences';

describe('preferences', () => {
  it('3局を保存・共有し、非対応の局数は既定値へ戻す',()=>{
    saveSettings({...loadSettings(),boardCount:3});expect(loadSettings().boardCount).toBe(3);
    expect(readShareState(new URL(shareUrl({boards:3})).search).boards).toBe(3);
    expect(readShareState('?boards=5').boards).toBeUndefined();
    localStorage.setItem('fgmv:settings:v1',JSON.stringify({boardCount:5}));expect(loadSettings().boardCount).toBe(3);
  });
  it('PCの未保存時は3局、既存の有効な2局設定は維持する',()=>{
    expect(loadSettings().boardCount).toBe(3);
    saveSettings({...loadSettings(),boardCount:2});expect(loadSettings().boardCount).toBe(2);
  });
  beforeEach(() => localStorage.clear());

  it('過去対局の検索条件をまとめて保存・復元し、解除したレート条件も保存する',()=>{
    const filters={...DEFAULT_ARCHIVE_FILTERS,query:'Target',group:'floodgate',historyDate:'2026-11-07',minRate:'2500',maxRate:'4000',resultFilter:'後手' as const,sort:'high' as const,favoriteOnly:true};
    expect(saveArchiveFilters(filters)).toBe(true);
    expect(loadArchiveFilters()).toEqual(filters);
    saveArchiveFilters({...filters,minRate:'',maxRate:''});
    expect(loadArchiveFilters()).toEqual({...filters,minRate:'',maxRate:''});
  });
  it('検索条件の壊れたJSONや不正な型・値では既定値へ戻す',()=>{
    for(const value of ['{invalid','null','[]',JSON.stringify({query:42,group:false,historyDate:'2026-02-30',minRate:'Infinity',maxRate:'invalid',resultFilter:'unknown',sort:'unknown',favoriteOnly:'true'})]) {
      localStorage.setItem('fgmv:archive-filters:v1',value);
      expect(loadArchiveFilters()).toEqual(DEFAULT_ARCHIVE_FILTERS);
    }
  });
  it('検索条件の保存拒否を呼び出し元へ返す',()=>{
    const denied=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('denied');});
    try {expect(saveArchiveFilters(DEFAULT_ARCHIVE_FILTERS)).toBe(false);}
    finally {denied.mockRestore();}
  });

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

  it('テーマはダークを既定とし、保存済みの選択を優先する', () => {
    expect(loadSettings().theme).toBe('dark');

    saveSettings({ ...loadSettings(), theme: 'light' });
    expect(loadSettings().theme).toBe('light');
  });

  it('終局後の注目局切替は既定で有効、旧保存値は一度だけ有効へ移行する', () => {
    expect(loadSettings().autoSwitchFinished).toBe(true);

    saveSettings({ ...loadSettings(), autoSwitchFinished: false });
    expect(loadSettings().autoSwitchFinished).toBe(false);

    localStorage.clear();
    localStorage.setItem('fgmv:settings:v1', JSON.stringify({ autoSwitchFinished: false }));
    expect(loadSettings().autoSwitchFinished).toBe(true);
    saveSettings({ ...loadSettings(), autoSwitchFinished: false });
    expect(loadSettings().autoSwitchFinished).toBe(false);
  });

  it('共有URLで対局・手数・表示局数・盤面方向を復元できる', () => {
    const url = new URL(shareUrl({ game: 'game-1', ply: 12, view: 'archive', boards: 2, orientation: 'white' }));
    expect(readShareState(url.search)).toEqual({ game: 'game-1', ply: 12, view: 'archive', boards: 2, orientation: 'white' });
  });
});
