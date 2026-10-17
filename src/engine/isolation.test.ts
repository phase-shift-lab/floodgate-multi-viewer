import { beforeEach, describe, expect, it, vi } from 'vitest';

const key = 'fgmv:analysis-reload:v1';
beforeEach(() => { vi.resetModules(); sessionStorage.clear(); });

function saveRecovery(followingLatest?: unknown) {
  sessionStorage.setItem(key, JSON.stringify({
    slots: [{ summary: { id: 'test-game' }, pinned: false, ply: 20, flipped: false, enabled: true, followingLatest }],
    view: 'live', at: Date.now(),
  }));
}

describe('analysis recovery following state', () => {
  it.each([true, false])('追従状態%sを手数と一緒に復元する', async (followingLatest) => {
    saveRecovery(followingLatest);
    const { analysisRecovery } = await import('./isolation');
    expect(analysisRecovery?.slots[0]).toMatchObject({ ply: 20, followingLatest });
    expect(sessionStorage.getItem(key)).toBeNull();
  });
  it('追従状態のない従来データも受け入れる', async () => {
    saveRecovery();
    const { analysisRecovery } = await import('./isolation');
    expect(analysisRecovery?.slots[0].ply).toBe(20);
    expect(analysisRecovery?.slots[0].followingLatest).toBeUndefined();
  });
  it('不正な追従状態の復元データを破棄する', async () => {
    saveRecovery('true');
    const { analysisRecovery } = await import('./isolation');
    expect(analysisRecovery).toBeUndefined();
  });
});
