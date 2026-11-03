import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCsa } from '../domain/csa';
import { localAnalysis, type AnalysisState } from './localAnalysis';
import { RecordAnalysis } from './recordAnalysis';

vi.mock('./localAnalysis',()=>({localAnalysis:{request:vi.fn(),reserve:vi.fn()}}));
const game=()=>parseCsa('V2.2\nN+A\nN-B\nPI\n+\n+7776FU\n-3334FU');
let update:(state:AnalysisState)=>void;
let cancel=vi.fn<()=>void>(),release=vi.fn<()=>void>();
const finish=async(value=20)=>{
  update({phase:'done',score:{kind:'cp',value,depth:10},candidates:[{rank:1,score:{kind:'cp',value,depth:10},pv:['7g7f',...Array(20).fill('3c3d')]}]});
  await Promise.resolve();
};
beforeEach(()=>{
  vi.clearAllMocks();cancel=vi.fn();release=vi.fn();
  Object.defineProperty(document,'hidden',{configurable:true,value:false});
  vi.mocked(localAnalysis.reserve).mockReturnValue(release);
  vi.mocked(localAnalysis.request).mockImplementation((_key,_sfen,_turn,callback)=>{update=callback;return cancel;});
});
describe('full record transactions',()=>{
  it('freezes the record, searches exactly one position at a time and retains each result separately',async()=>{
    const source=game(),runner=new RecordAnalysis();
    await runner.start(source,3,async()=>true);
    expect(localAnalysis.request).toHaveBeenCalledTimes(1);
    expect(vi.mocked(localAnalysis.request).mock.calls[0][4]).toEqual({milliseconds:3000});
    source.moveList.length=0;
    await finish();expect(runner.getState().results).toHaveLength(1);
    expect(runner.getState().results[0].candidates[0].pv).toHaveLength(12);
    expect(vi.mocked(localAnalysis.request).mock.calls[1][1]).toContain('moves 7g7f');
    expect(vi.mocked(localAnalysis.request).mock.calls[1][2]).toBe('-');
    await finish(-40);await finish(15);
    expect(runner.getState().phase).toBe('done');expect(runner.getState().results).toHaveLength(3);
    expect(localAnalysis.request).toHaveBeenCalledTimes(3);expect(release).toHaveBeenCalledOnce();
  });
  it('stops stale callbacks and resumes at the first unfinished position',async()=>{
    const runner=new RecordAnalysis();await runner.start(game(),1,async()=>true);await finish();
    const late=update;runner.stop('paused');late({phase:'done',score:{kind:'cp',value:999,depth:1}});await Promise.resolve();
    expect(runner.getState()).toMatchObject({phase:'paused',results:[expect.anything()]});
    await runner.start(game(),1,async()=>true,true);
    expect(vi.mocked(localAnalysis.request).mock.lastCall?.[1]).toContain('moves 7g7f');
    await finish();await finish();expect(runner.getState().phase).toBe('done');
  });
  it('rejects invalid records before any engine request or preparation',async()=>{
    const source=game();source.moveList[0].raw='+7775FU';
    const runner=new RecordAnalysis(),prepare=vi.fn(async()=>true);
    await runner.start(source,1,prepare);
    expect(runner.getState().phase).toBe('error');expect(prepare).not.toHaveBeenCalled();expect(localAnalysis.request).not.toHaveBeenCalled();
  });
  it('cancels preparation and stops on engine error without automatic retries',async()=>{
    let ready!:(value:boolean)=>void;
    const runner=new RecordAnalysis();const pending=runner.start(game(),1,()=>new Promise(resolve=>{ready=resolve;}));
    await Promise.resolve();runner.stop();ready(true);await pending;
    expect(localAnalysis.request).not.toHaveBeenCalled();
    await runner.start(game(),1,async()=>true);update({phase:'error',message:'worker failed'});
    expect(runner.getState()).toMatchObject({phase:'error',message:'worker failed',results:[]});
    await Promise.resolve();expect(localAnalysis.request).toHaveBeenCalledTimes(1);
  });
});
