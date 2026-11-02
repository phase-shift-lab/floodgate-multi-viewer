import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BoardState, Move } from '../domain/types';
import { legalMoves } from '../domain/studyRules';
import { ShogiBoard } from './ShogiBoard';
import { PromotionChoice } from './PromotionChoice';
import type { BoardPlayers } from './PlayerLabel';

/** Selecting stays in watch; only a validated move starts a saved variation. */
export function WatchBoard({board,revision,flipped,lastMove,players,disabled,onMove,onNotice}:{board:BoardState;revision:string;flipped:boolean;lastMove?:Move;players:BoardPlayers;disabled:boolean;onMove:(move:Move,isCurrent:()=>boolean)=>Promise<boolean>;onNotice:(message:string)=>void}) {
 const [selection,setSelection]=useState<{revision:string;from:string}>();
 const [promotion,setPromotion]=useState<{revision:string;moves:Move[]}>();
 const [busy,setBusy]=useState(false);
 const lock=useRef(false),current=useRef({revision,active:true});
 useLayoutEffect(()=>{current.current={revision,active:true};return()=>{current.current.active=false;};},[revision]);
 const clear=()=>{setSelection(undefined);setPromotion(undefined);onNotice('');};
 const invalidate=useEffectEvent(()=>{if(selection && selection.revision!==revision){clear();onNotice('局面が更新されたため、駒の選択を解除しました。');}});
 useEffect(()=>{let active=true;queueMicrotask(()=>{if(active)invalidate();});return()=>{active=false;};},[revision]);
 const cancel=useEffectEvent(clear);
 useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')cancel();};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
 const from=selection?.revision===revision?selection.from:undefined;
 const choices=promotion?.revision===revision?promotion.moves:undefined;
 const moves=useMemo(()=>disabled?[]:legalMoves(board),[board,disabled]);
 const options=moves.filter(m=>from?.startsWith('hand:')?m.from==='00'&&m.piece===from.slice(5):m.from===from);
 const submit=async(move:Move)=>{
  if(lock.current||disabled)return;
  const origin=revision;const isCurrent=()=>current.current.active&&current.current.revision===origin;
  lock.current=true;setBusy(true);
  try{await onMove(move,isCurrent);}
  catch(error){if(isCurrent())onNotice((error as Error).message);}
  finally{lock.current=false;if(current.current.active){setBusy(false);clear();}}
 };
 const square=(to:string)=>{
  if(disabled||busy||choices)return;
  if(to===from){clear();return;}
  if(board.squares[to]?.side===board.turn){setSelection({revision,from:to});onNotice('移動先を選ぶと検討を開始');return;}
  const found=options.filter(m=>m.to===to);
  if(!found.length){onNotice(from?'そこには指せません。強調された升を選んでください。':'手番側の駒・持駒を選んでください。');return;}
  if(found.length>1)setPromotion({revision,moves:found});else void submit(found[0]);
 };
 return <><ShogiBoard state={board} flipped={flipped} lastMove={lastMove} players={players} selected={from} legalTargets={options.map(m=>m.to)} locked={disabled||busy||Boolean(choices)} onSquare={square} onHand={(side,code)=>{if(side===board.turn&&!disabled&&!busy&&!choices){const hand='hand:'+code;if(from===hand)clear();else{setSelection({revision,from:hand});onNotice('移動先を選ぶと検討を開始');}}}}/>
 {choices&&<PromotionChoice moves={choices} original={board.squares[choices[0].from]?.code} onPick={move=>void submit(move)} onCancel={clear}/>}</>;
}
