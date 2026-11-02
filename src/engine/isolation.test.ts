import { beforeEach, describe, expect, it, vi } from 'vitest';

const key = 'fgmv:analysis-reload:v1';
beforeEach(() => { vi.resetModules(); sessionStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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

describe('analysis setup retry and reload loop protection',()=>{
  function environment() {
    const reload=vi.fn(); vi.stubGlobal('location',{origin:'http://localhost',reload}); vi.stubGlobal('isSecureContext',true); vi.stubGlobal('crossOriginIsolated',false);
    const sw=Object.assign(new EventTarget(),{controller:{scriptURL:'http://localhost/analysis-isolation-sw.js'},getRegistrations:vi.fn().mockResolvedValue([]),register:vi.fn().mockResolvedValue({active:true})});
    vi.stubGlobal('navigator',{serviceWorker:sw}); return {sw,reload};
  }
  const recovery={slots:[],view:'live' as const};
  it('failed preparation stays failed until explicit retry, then reloads exactly once',async()=>{
    const {sw,reload}=environment(); sw.register.mockRejectedValueOnce(new Error('registration denied'));
    const {prepareAnalysis,retryAnalysisPreparation}=await import('./isolation');
    await expect(prepareAnalysis(recovery)).rejects.toThrow('denied');
    await expect(prepareAnalysis(recovery)).rejects.toThrow('denied'); expect(sw.register).toHaveBeenCalledTimes(1);
    retryAnalysisPreparation(); await prepareAnalysis(recovery); await prepareAnalysis(recovery);
    expect(sw.register).toHaveBeenCalledTimes(2); expect(reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem('fgmv:analysis-preparation:v2')!)).toMatchObject({schema:2,purpose:'watch',attempt:1});
  });
  it('consumes study marker only on verified reload; non-isolated documents do not reload again',async()=>{
    const {reload}=environment();
    vi.spyOn(performance,'getEntriesByType').mockReturnValue([{type:'reload'} as PerformanceNavigationTiming]);
    sessionStorage.setItem('fgmv:analysis-preparation:v2',JSON.stringify({schema:2,purpose:'study',studySessionId:'id',attempt:1,nonce:'unique',at:Date.now()}));
    const {preparationRecovery,prepareAnalysis}=await import('./isolation');
    expect(preparationRecovery?.studySessionId).toBe('id'); expect(sessionStorage.getItem('fgmv:analysis-preparation:v2')).toBeNull();
    await expect(prepareAnalysis(recovery)).rejects.toThrow('再試行'); expect(reload).not.toHaveBeenCalled();
    vi.resetModules(); const next=await import('./isolation'); await expect(next.prepareAnalysis(recovery)).rejects.toThrow('再試行');
  });
  it('does not restore on new tab navigation or stale marker',async()=>{
    environment(); vi.spyOn(performance,'getEntriesByType').mockReturnValue([{type:'navigate'} as PerformanceNavigationTiming]);
    sessionStorage.setItem('fgmv:analysis-preparation:v2',JSON.stringify({schema:2,purpose:'study',studySessionId:'id',attempt:1,nonce:'x',at:Date.now()}));
    expect((await import('./isolation')).preparationRecovery).toBeUndefined();
  });
  it('cancellation during registration never writes a marker or reloads later',async()=>{
    const {sw,reload}=environment(), controller=new AbortController();
    let finish!: (value:{active:boolean})=>void;
    sw.register.mockImplementationOnce(()=>new Promise((resolve)=>{finish=resolve;}));
    const {prepareAnalysis,retryAnalysisPreparation}=await import('./isolation');
    const pending=prepareAnalysis(recovery,'study-id',controller.signal);
    await Promise.resolve(); controller.abort(); finish({active:true});
    await expect(pending).rejects.toThrow('取り消'); expect(reload).not.toHaveBeenCalled(); expect(sessionStorage.getItem('fgmv:analysis-preparation:v2')).toBeNull();
    retryAnalysisPreparation(); await prepareAnalysis(recovery); expect(reload).toHaveBeenCalledTimes(1);
  });
});
