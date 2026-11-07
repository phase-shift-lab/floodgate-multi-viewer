import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { formatFinalReason, formatMoveInGame, formatMoveSource } from '../domain/csa';
import type { ParsedGame } from '../domain/types';
import { scoreLabel, type LocalScore } from '../domain/localEvaluation';

export function MoveList({ game, ply, active, onPick, scores, moveExtras, scrollPositionRef }: { game: ParsedGame; ply: number; active: boolean; onPick: (ply: number) => void; scores?:Array<LocalScore|undefined>; moveExtras?:(ply:number)=>ReactNode;scrollPositionRef?:RefObject<number|undefined> }) {
  const list = useRef<HTMLOListElement>(null);
  const container=()=>list.current?.closest<HTMLElement>('.inline-record-scroll')??list.current;
  useLayoutEffect(()=>{
    if(!active||!scrollPositionRef)return;
    const element=container();if(!element)return;
    const remember=()=>{scrollPositionRef.current=element.scrollTop;};
    element.addEventListener('scroll',remember,{passive:true});
    return()=>{remember();element.removeEventListener('scroll',remember);};
  },[active,scrollPositionRef]);
  // Results and temporary suspension must not recenter a user-scrolled record.
  useLayoutEffect(()=>{
    const element=container();
    if(active&&element&&scrollPositionRef?.current!==undefined)element.scrollTop=scrollPositionRef.current;
  });
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      const row=list.current?.querySelector<HTMLElement>('[aria-current="step"]');
      const element=container();
      if(!element)return;
      if(scrollPositionRef?.current!==undefined)element.scrollTop=scrollPositionRef.current;
      else if(row)element.scrollTop+=row.getBoundingClientRect().top-element.getBoundingClientRect().top-(element.clientHeight-row.getBoundingClientRect().height)/2;
      if(scrollPositionRef)scrollPositionRef.current=element.scrollTop;
    });
    return () => cancelAnimationFrame(frame);
  }, [active,scrollPositionRef]);
  const pick=(next:number)=>{const element=container();if(element&&scrollPositionRef)scrollPositionRef.current=element.scrollTop;onPick(next);};
  const reason = formatFinalReason(game);
  return <ol ref={list} className={'move-list'+(scores?' record-result-list':'')} aria-label="棋譜">
    <li><button aria-current={ply === 0 ? 'step' : undefined} onClick={() => pick(0)}>0. 開始局面{scores&&<b>{scores[0]?scoreLabel(scores[0]):'—'}</b>}</button>{moveExtras?.(0)}</li>
    {game.moveList.map(move => <li key={move.index}><button aria-current={ply === move.index ? 'step' : undefined} onClick={() => pick(move.index)} title={formatMoveSource(move)}><span>{move.index}. {formatMoveInGame(game,move.index)}{move.time !== undefined && <small> · {move.time}秒</small>}</span>{scores&&<b>{scores[move.index]?scoreLabel(scores[move.index]!):'—'}</b>}</button>{moveExtras?.(move.index)}</li>)}
    {reason && <li className="move-result">{game.moveList.length+1}. {reason}</li>}
  </ol>;
}
