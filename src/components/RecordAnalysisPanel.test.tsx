import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {parseCsa} from '../domain/csa';
import {localAnalysis,type AnalysisState} from '../engine/localAnalysis';
import {RecordAnalysisPanel} from './RecordAnalysisPanel';
import {isAnalysisReloadPending} from '../engine/isolation';

vi.mock('../engine/localAnalysis',()=>({localAnalysis:{request:vi.fn(),reserve:vi.fn(()=>vi.fn()),retry:vi.fn()}}));
vi.mock('../engine/isolation',()=>({preparationRecovery:undefined,retryAnalysisPreparation:vi.fn(),isAnalysisReloadPending:vi.fn(()=>false)}));
const game=parseCsa('V2.2\nN+A\nN-B\nPI\n+\n+7776FU\n-3334FU');
let update:(state:AnalysisState)=>void;
beforeEach(()=>{
  vi.mocked(isAnalysisReloadPending).mockReturnValue(false);
  Object.defineProperty(document,'hidden',{configurable:true,value:false});
  vi.stubGlobal('crossOriginIsolated',true);
  vi.mocked(localAnalysis.request).mockImplementation((_key,_position,_turn,callback)=>{update=callback;return vi.fn();});
});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();sessionStorage.clear();});
it('starts explicitly, shows per-ply results on the matching frozen board, and preserves results on closing',async()=>{
  const props={game,owner:'test',active:true,onPrepare:vi.fn(async()=>true)};
  const view=render(<RecordAnalysisPanel {...props}/>);
  expect(localAnalysis.request).not.toHaveBeenCalled();
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'開始'}));});
  await act(async()=>{update({phase:'done',score:{kind:'cp',value:40,depth:8}});});
  expect(screen.getByRole('progressbar',{name:'全棋譜解析の進捗'})).toHaveAttribute('value','1');
  fireEvent.click(screen.getByRole('button',{name:/^1\./}));
  expect(screen.getByRole('grid',{name:'将棋盤 1手目'})).toBeInTheDocument();
  expect(screen.getByLabelText('選択局面の解析評価値')).toHaveTextContent('未解析');
  view.rerender(<RecordAnalysisPanel {...props} active={false}/>);
  view.rerender(<RecordAnalysisPanel {...props}/>);
  expect(screen.getByRole('status',{name:'全棋譜解析の状態'})).toHaveTextContent('停止中');
  expect(screen.getByRole('progressbar',{name:'全棋譜解析の進捗'})).toHaveAttribute('value','1');
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'続きから再開'}));});
  expect(vi.mocked(localAnalysis.request).mock.lastCall?.[1]).toContain('moves 7g7f');
});
it('pauses on visibility loss without restarting when visible again',async()=>{
  render(<RecordAnalysisPanel game={game} owner="visibility" active onPrepare={async()=>true}/>);
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'開始'}));});
  const count=vi.mocked(localAnalysis.request).mock.calls.length;
  Object.defineProperty(document,'hidden',{configurable:true,value:true});
  act(()=>{document.dispatchEvent(new Event('visibilitychange'));});
  Object.defineProperty(document,'hidden',{configurable:true,value:false});
  act(()=>{document.dispatchEvent(new Event('visibilitychange'));});
  expect(screen.getByRole('status',{name:'全棋譜解析の状態'})).toHaveTextContent('一時停止');
  expect(localAnalysis.request).toHaveBeenCalledTimes(count);
});
it('removes its pending reload request when closed during preparation',async()=>{
  vi.stubGlobal('crossOriginIsolated',false);
  const props={game,owner:'preparing',active:true,onPrepare:vi.fn(()=>new Promise<boolean>(()=>{}))};
  const view=render(<RecordAnalysisPanel {...props}/>);
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'開始'}));});
  expect(sessionStorage.getItem('fgmv:record-preparation:v1')).toContain('preparing');
  view.rerender(<RecordAnalysisPanel {...props} active={false}/>);
  expect(sessionStorage.getItem('fgmv:record-preparation:v1')).toBeNull();
  expect(localAnalysis.request).not.toHaveBeenCalled();
});
it('preserves the request on a preparation reload visibility event but still permits explicit cancellation',async()=>{
  vi.stubGlobal('crossOriginIsolated',false);
  const props={game,owner:'reload',active:true,onPrepare:vi.fn(()=>new Promise<boolean>(()=>{}))};
  const view=render(<RecordAnalysisPanel {...props}/>);
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'開始'}));});
  vi.mocked(isAnalysisReloadPending).mockReturnValue(true);
  Object.defineProperty(document,'hidden',{configurable:true,value:true});
  act(()=>{document.dispatchEvent(new Event('visibilitychange'));});
  expect(sessionStorage.getItem('fgmv:record-preparation:v1')).toContain('reload');
  view.rerender(<RecordAnalysisPanel {...props} active={false}/>);
  expect(sessionStorage.getItem('fgmv:record-preparation:v1')).toBeNull();
});
