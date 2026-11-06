import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialBoard } from '../domain/csa';
import { localAnalysis } from '../engine/localAnalysis';
import { LocalEvaluation } from './LocalEvaluation';
import { WorkspaceContext } from './WorkspaceContext';

vi.mock('../engine/localAnalysis',()=>({localAnalysis:{request:vi.fn(()=>vi.fn()),retry:vi.fn()}}));
vi.mock('../engine/isolation',()=>({hasAnalysisSetup:()=>false,removeAnalysisSetup:vi.fn(),retryAnalysisPreparation:vi.fn()}));
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('crossOriginIsolated',false);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const flush=async()=>{await act(async()=>{await Promise.resolve();});};
function props(){return{board:createInitialBoard(),position:'position-a',enabled:true,onEnabledChange:vi.fn(),onPrepare:vi.fn<((signal?:AbortSignal)=>Promise<boolean>)>()};}

describe('analysis preparation lifetime',()=>{
 it('opens the owning panel detail flow so watching can hold its live position',()=>{
  const p=props(),onDetails=vi.fn();
  render(<WorkspaceContext.Provider value={{layout:'auto',selected:true,controlsTarget:null}}><LocalEvaluation {...p} enabled={false} onDetails={onDetails}/></WorkspaceContext.Provider>);
  fireEvent.click(screen.getByRole('button',{name:'読み筋と他の候補を開く'}));expect(onDetails).toHaveBeenCalledOnce();
 });
 it('integrates the first PV once and keeps the score bound separate from the number',()=>{
  vi.stubGlobal('crossOriginIsolated',true);const p=props();
  const view=render(<WorkspaceContext.Provider value={{layout:'auto',selected:true,controlsTarget:null}}><LocalEvaluation {...p}/></WorkspaceContext.Provider>);
  const score={kind:'cp' as const,value:140,depth:12,bound:'lowerbound' as const};
  act(()=>{vi.mocked(localAnalysis.request).mock.calls[0][3]({phase:'done',score,candidates:[{rank:1,score,pv:['7g7f','3c3d']}]});});
  expect(screen.getByLabelText('先手基準の評価値')).toHaveTextContent('+140以上');expect(screen.getByLabelText('先手基準の評価値').querySelector('small')).toHaveTextContent('以上');
  expect(view.container.querySelector('.integrated-pv strong')).toHaveTextContent('▲７六歩');expect(view.container.querySelector('.integrated-pv p')).toHaveTextContent('△３四歩');
  expect(view.container.querySelectorAll('.first-candidate')).toHaveLength(0);
 });
 it('does not cancel or restart preparation when the displayed position changes',async()=>{
  const p=props();let signal:AbortSignal|undefined;
  p.onPrepare.mockImplementation(s=>{signal=s;return new Promise(()=>{});});
  const view=render(<LocalEvaluation {...p}/>);await flush();
  view.rerender(<LocalEvaluation {...p} position="position-b"/>);await flush();
  expect(signal?.aborted).toBe(false);expect(p.onPrepare).toHaveBeenCalledTimes(1);
  expect(screen.getByText('準備中')).toBeInTheDocument();
 });
 it('explicit OFF and unmount still cancel preparation',async()=>{
  const p=props();const signals:AbortSignal[]=[];
  p.onPrepare.mockImplementation(s=>{signals.push(s!);return new Promise(()=>{});});
  const view=render(<LocalEvaluation {...p}/>);await flush();
  view.rerender(<LocalEvaluation {...p} enabled={false}/>);expect(signals[0].aborted).toBe(true);
  view.rerender(<LocalEvaluation {...p}/>);await flush();view.unmount();expect(signals[1].aborted).toBe(true);
 });
 it('shows a preparation failure as stopped, retains it across moves and retries only on request',async()=>{
  const p=props();p.onPrepare.mockRejectedValue(new Error('registration denied'));
  const view=render(<LocalEvaluation {...p}/>);await flush();
  expect(screen.getByText('解析停止',{selector:'.evaluation-status'})).toBeInTheDocument();
  view.rerender(<LocalEvaluation {...p} position="position-b"/>);await flush();
  expect(p.onPrepare).toHaveBeenCalledTimes(1);expect(screen.getAllByText(/registration denied/).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button',{name:'解析を再試行'}));await flush();
  expect(p.onPrepare).toHaveBeenCalledTimes(2);expect(localAnalysis.retry).toHaveBeenCalledTimes(1);
 });
});
