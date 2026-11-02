import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureSummaries } from '../data/fixtures';

const key = 'fgmv:analysis-reload:v1';
beforeEach(() => { vi.resetModules(); sessionStorage.clear(); history.replaceState(null,''); });
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
  it('reads the current recovery only immediately before the verified reload',async()=>{
    const {sw,reload}=environment();let finish!:(value:{active:boolean})=>void;
    sw.register.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const {prepareAnalysis}=await import('./isolation');
    let ply=3;
    const getRecovery=()=>({...recovery,slots:[{summary:fixtureSummaries[0],pinned:false,ply,flipped:false,enabled:true}]});
    const pending=prepareAnalysis(getRecovery);
    await Promise.resolve();ply=7;finish({active:true});await pending;
    expect(reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem(key)!).slots[0].ply).toBe(7);
  });
  it('failed preparation stays failed until explicit retry, then reloads exactly once',async()=>{
    const {sw,reload}=environment(); sw.register.mockRejectedValueOnce(new Error('registration denied'));
    const controller=new AbortController();
    const {prepareAnalysis,retryAnalysisPreparation}=await import('./isolation');
    await expect(prepareAnalysis(recovery,undefined,controller.signal)).rejects.toThrow('denied');
    controller.abort(); // Leaving after an actual failure must not turn it into an automatic retry.
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
  it('restores a WebKit COOP reload using the matching history nonce exactly once',async()=>{
    environment();vi.stubGlobal('crossOriginIsolated',true);
    vi.spyOn(performance,'getEntriesByType').mockReturnValue([{type:'navigate'} as PerformanceNavigationTiming]);
    history.replaceState({unrelated:'keep',fgmvAnalysisReloadNonce:'same-entry'},'');
    sessionStorage.setItem('fgmv:analysis-preparation:v2',JSON.stringify({schema:2,purpose:'study',studySessionId:'id',attempt:1,nonce:'same-entry',at:Date.now()}));
    expect((await import('./isolation')).preparationRecovery?.studySessionId).toBe('id');
    expect(history.state).toEqual({unrelated:'keep'});
    vi.resetModules();expect((await import('./isolation')).preparationRecovery).toBeUndefined();
  });
  it('does not auto-resume a new isolated tab with a copied session marker but no matching history',async()=>{
    environment();vi.stubGlobal('crossOriginIsolated',true);
    vi.spyOn(performance,'getEntriesByType').mockReturnValue([{type:'navigate'} as PerformanceNavigationTiming]);
    sessionStorage.setItem('fgmv:analysis-preparation:v2',JSON.stringify({schema:2,purpose:'study',studySessionId:'id',attempt:1,nonce:'other-tab',at:Date.now()}));
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
  it('a new requested setup can follow an in-flight cancellation without latching it as failure',async()=>{
    const {sw,reload}=environment(),controller=new AbortController();
    let finish!:(value:{active:boolean})=>void;
    sw.register.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const {prepareAnalysis}=await import('./isolation');
    const first=prepareAnalysis(recovery,'old-study',controller.signal);
    const cancelled=expect(first).rejects.toMatchObject({name:'AbortError'});
    await Promise.resolve();controller.abort();
    const next=prepareAnalysis(recovery,'new-study',new AbortController().signal);
    finish({active:true});await cancelled;await next;
    expect(sw.register).toHaveBeenCalledTimes(2);expect(reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem('fgmv:analysis-preparation:v2')!)).toMatchObject({studySessionId:'new-study'});
  });
});
