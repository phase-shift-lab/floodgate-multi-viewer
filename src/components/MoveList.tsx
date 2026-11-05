import { useEffect, useRef } from 'react';
import { formatFinalReason, formatMoveInGame, formatMoveSource } from '../domain/csa';
import type { ParsedGame } from '../domain/types';
import { scoreLabel, type LocalScore } from '../domain/localEvaluation';

export function MoveList({ game, ply, active, onPick, scores }: { game: ParsedGame; ply: number; active: boolean; onPick: (ply: number) => void; scores?:Array<LocalScore|undefined> }) {
  const list = useRef<HTMLOListElement>(null);
  // Scroll once on opening, never steal the scroll position on live updates.
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      const row=list.current?.querySelector<HTMLElement>('[aria-current="step"]');
      const container=list.current?.closest<HTMLElement>('.inline-record-scroll')??list.current;
      if(row&&container)container.scrollTop+=row.getBoundingClientRect().top-container.getBoundingClientRect().top-(container.clientHeight-row.getBoundingClientRect().height)/2;
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);
  const reason = formatFinalReason(game);
  return <ol ref={list} className={'move-list'+(scores?' record-result-list':'')} aria-label="棋譜">
    <li><button aria-current={ply === 0 ? 'step' : undefined} onClick={() => onPick(0)}>0. 開始局面{scores&&<b>{scores[0]?scoreLabel(scores[0]):'—'}</b>}</button></li>
    {game.moveList.map(move => <li key={move.index}><button aria-current={ply === move.index ? 'step' : undefined} onClick={() => onPick(move.index)} title={formatMoveSource(move)}><span>{move.index}. {formatMoveInGame(game,move.index)}{move.time !== undefined && <small> · {move.time}秒</small>}</span>{scores&&<b>{scores[move.index]?scoreLabel(scores[move.index]!):'—'}</b>}</button></li>)}
    {reason && <li className="move-result">{game.moveList.length+1}. {reason}</li>}
  </ol>;
}
