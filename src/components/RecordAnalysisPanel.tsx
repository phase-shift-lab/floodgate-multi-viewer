import { useEffect, useEffectEvent, useMemo, useState, useSyncExternalStore } from 'react';
import { boardAt, formatMoveInGame } from '../domain/csa';
import { scoreLabel } from '../domain/localEvaluation';
import { validatedPv } from '../domain/studyRules';
import type { ParsedGame } from '../domain/types';
import { RecordAnalysis, RECORD_TIMES, type RecordSeconds } from '../engine/recordAnalysis';
import { clearRecordRecovery, peekRecordRecovery, saveRecordRecovery, takeRecordRecovery } from '../engine/recordRecovery';
import { isAnalysisReloadPending, retryAnalysisPreparation } from '../engine/isolation';
import { localAnalysis } from '../engine/localAnalysis';
import { ShogiBoard } from './ShogiBoard';

export function RecordAnalysisPanel({game,owner,active,onPrepare}:{game:ParsedGame;owner:string;active:boolean;onPrepare:(signal?:AbortSignal)=>Promise<boolean>}) {
  const [controller]=useState(()=>new RecordAnalysis());
  const state=useSyncExternalStore(controller.subscribe,controller.getState);
  const [seconds,setSeconds]=useState<RecordSeconds>(()=>peekRecordRecovery(owner)?.seconds??1);
  const [selected,setSelected]=useState(0);
  const [resultView,setResultView]=useState<'list'|'position'>('list');
  const [recovered]=useState(()=>peekRecordRecovery(owner));
  const snapshot=state.game??game;
  const board=useMemo(()=>boardAt(snapshot,selected),[snapshot,selected]);
  const result=state.results[selected];
  const busy=state.phase==='preparing'||state.phase==='running';
  const start=async(resume=false,restored?:typeof recovered)=>{
    const target=resume&&state.game?state.game:restored?.game??game;
    const duration=resume?state.seconds:restored?.seconds??seconds;
    if(!resume)setSelected(0);
    // An explicit start/retry can clear a previous failure; never retry errors automatically.
    retryAnalysisPreparation();localAnalysis.retry();
    await controller.start(target,duration,async signal=>{
      if(globalThis.crossOriginIsolated)return true;
      try {
        saveRecordRecovery(owner,target,duration);
        const ready=await onPrepare(signal);
        if(ready)clearRecordRecovery(owner);
        return ready;
      }catch(error){clearRecordRecovery(owner);throw error;}
    },resume);
  };
  const recover=useEffectEvent(()=>{takeRecordRecovery(owner);void start(false,recovered);});
  useEffect(()=>{
    const hidden=()=>{if(document.hidden&&!isAnalysisReloadPending()){controller.stop('paused');clearRecordRecovery(owner);}};
    document.addEventListener('visibilitychange',hidden);
    return()=>{document.removeEventListener('visibilitychange',hidden);controller.stop();if(!isAnalysisReloadPending())clearRecordRecovery(owner);};
  },[controller,owner]);
  useEffect(()=>{if(!active){controller.stop();clearRecordRecovery(owner);}},[active,controller,owner]);
  // Only a verified shared-memory preparation reload may restart the explicitly requested run.
  useEffect(()=>{
    if(!recovered)return;
    let cancelled=false;
    queueMicrotask(()=>{if(!cancelled)recover();});
    return()=>{cancelled=true;};
  },[recovered]);
  const total=snapshot.moveList.length+1;
  const phases={idle:'開始前',preparing:'棋譜の検証・解析準備中',running:'解析中',stopped:'停止中',paused:'非表示のため一時停止',done:'全棋譜の解析完了',error:'解析停止'};
  const remaining=Math.ceil((total-state.results.length)*(busy?state.seconds:seconds)/60);
  const pick=(ply:number)=>{setSelected(ply);setResultView('position');};
  if(!active)return null;
  return <section className="record-analysis" aria-label="全棋譜解析">
    <div className="record-analysis-settings"><label>1局面の解析時間<select aria-label="全棋譜の解析時間" value={seconds} disabled={busy} onChange={event=>setSeconds(Number(event.target.value) as RecordSeconds)}>{RECORD_TIMES.map(time=><option key={time} value={time}>{time}秒</option>)}</select></label>
      <button disabled={busy} onClick={()=>void start(false,undefined)}>{state.game?'最初から解析':'開始'}</button>
      {state.game&&state.phase!=='done'&&<button disabled={busy||seconds!==state.seconds} onClick={()=>void start(true,undefined)}>続きから再開</button>}
      <button disabled={!busy} onClick={()=>{controller.stop();clearRecordRecovery(owner);}}>停止</button>
    </div>
    <p className="record-analysis-note">つようら王11micro · 先手基準 · 1局面ずつ端末で解析。探索時間の目安は残り約{remaining}分＋準備時間です。CPU・電池を使用します。</p>
    <p role="status" aria-label="全棋譜解析の状態">{phases[state.phase]} · {state.results.length} / {total}局面{state.game&&` · 開始時点の${snapshot.moveList.length}手まで`}</p>
    <progress aria-label="全棋譜解析の進捗" value={state.results.length} max={total}/>
    {state.message&&<p role="alert">{state.message}</p>}
    <svg className="record-score-chart" viewBox="0 0 600 130" role="img" aria-label="先手基準の評価値推移。上下3000で表示を制限し、詰みは端に表示。勝率ではありません。">
      <line x1="10" y1="65" x2="590" y2="65" stroke="currentColor" opacity=".3"/>
      <text x="12" y="15">先手優勢</text><text x="12" y="122">後手優勢</text>
      <polyline fill="none" stroke="var(--accent)" strokeWidth="2" points={state.results.map((entry,ply)=>entry.score?`${10+580*ply/Math.max(1,total-1)},${65-Math.max(-3000,Math.min(3000,entry.score.kind==='mate'?Math.sign(entry.score.value)*3000:entry.score.value))/3000*50}`:'').join(' ')}/>
      {state.results.map((entry,ply)=>entry.score&&<circle key={ply} cx={10+580*ply/Math.max(1,total-1)} cy={65-Math.max(-3000,Math.min(3000,entry.score.kind==='mate'?Math.sign(entry.score.value)*3000:entry.score.value))/3000*50} r={selected===ply?5:2} fill="currentColor"/>)}
    </svg>
    <div className="record-analysis-view" role="group" aria-label="解析結果の表示"><button aria-pressed={resultView==='list'} onClick={()=>setResultView('list')}>棋譜一覧</button><button aria-pressed={resultView==='position'} onClick={()=>setResultView('position')}>選択局面・読み筋</button></div>
    <div className={'record-analysis-results is-'+resultView}>
      <div className="record-position"><strong>{selected}手目 {selected?formatMoveInGame(snapshot,selected):'開始局面'} · {board.turn==='+'?'▲先手番':'△後手番'}</strong>
        <output aria-label="選択局面の解析評価値">{result?.score?scoreLabel(result.score):state.results[selected]?'評価なし':'未解析'}</output>
        <ShogiBoard state={board} flipped={false} lastMove={snapshot.moveList[selected-1]} locked/>
        <ol className="record-pv">{result?.candidates.map(candidate=><li key={candidate.rank}><strong>第{candidate.rank}候補 {scoreLabel(candidate.score)}</strong><p>{validatedPv(board,candidate.pv,12).labels.join(' → ')||'読み筋なし'}</p></li>)}</ol>
      </div>
      <ol className="record-result-list" aria-label="解析した棋譜"><li><button aria-current={selected===0?'step':undefined} onClick={()=>pick(0)}>0. 開始局面 <b>{state.results[0]?.score?scoreLabel(state.results[0].score):'—'}</b></button></li>{snapshot.moveList.map((move,index)=><li key={index}><button aria-current={selected===index+1?'step':undefined} onClick={()=>pick(index+1)}>{index+1}. {formatMoveInGame(snapshot,index+1)} <b>{state.results[index+1]?.score?scoreLabel(state.results[index+1].score!):'—'}</b></button></li>)}</ol>
    </div>
    <p className="record-analysis-note">対象は開始時点で固定します。閉じると停止し、結果はこのタブ内だけに保持します。再読み込みで結果は消えます。時間の変更、新しい棋譜・変化は「最初から解析」で取り込みます。</p>
  </section>;
}
