import { useEffect, useRef } from 'react';
import { formatFinalReason, formatMoveInGame, formatMoveSource } from '../domain/csa';
import type { ParsedGame } from '../domain/types';

export function MoveList({ game, ply, active, onPick }: { game: ParsedGame; ply: number; active: boolean; onPick: (ply: number) => void }) {
  const list = useRef<HTMLOListElement>(null);
  // Scroll once on opening, never steal the scroll position on live updates.
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[aria-current="step"]')?.scrollIntoView({ block: 'center' }));
    return () => cancelAnimationFrame(frame);
  }, [active]);
  const reason = formatFinalReason(game);
  return <ol ref={list} className="move-list" aria-label="棋譜">
    <li><button aria-current={ply === 0 ? 'step' : undefined} onClick={() => onPick(0)}>0. 開始局面</button></li>
    {game.moveList.map(move => <li key={move.index}><button aria-current={ply === move.index ? 'step' : undefined} onClick={() => onPick(move.index)} title={formatMoveSource(move)}>{move.index}. {formatMoveInGame(game,move.index)}{move.time !== undefined && <small>{move.time}秒</small>}</button></li>)}
    {reason && <li className="move-result">{game.moveList.length+1}. {reason}</li>}
  </ol>;
}
