import type { Move } from '../domain/types';
export function PromotionChoice({moves,original,onPick,onCancel}:{moves:Move[];original?:string;onPick:(move:Move)=>void;onCancel:()=>void}) {
  return <><div className="promotion-choice" role="dialog" aria-modal="true" aria-label="成りの選択" onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();onCancel();return;}
    if(event.key!=='Tab')return;
    const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
    event.preventDefault();buttons[(index+(event.shiftKey?buttons.length-1:1))%buttons.length]?.focus();
  }}><strong>成りますか？</strong>{moves.map((move,i)=><button key={move.piece} autoFocus={i===0} onClick={()=>onPick(move)}>{move.piece===original?'成らない':'成る'}</button>)}<button onClick={onCancel}>取消</button></div><div className="promotion-backdrop" aria-hidden="true"/></>;
}
