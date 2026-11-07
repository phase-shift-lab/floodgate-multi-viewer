import type { KeyboardEvent, ReactNode } from 'react';
import { useBoardFit } from './useBoardFit';
import { useWorkspace } from './WorkspaceContext';

/** One layout for watching, reading the score sheet and moving pieces. */
export function BoardSurface({ context, caption, captionActions, evaluation, board, controls, record, status, footer, modal, studying = false, onKeyDown, label }: {
  context?: ReactNode; caption: ReactNode; captionActions?:ReactNode; evaluation: ReactNode; board: ReactNode;
  controls: ReactNode; record?:ReactNode; status?: ReactNode; footer?: ReactNode; modal: ReactNode;
  studying?: boolean; onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void; label: string;
}) {
  const ref = useBoardFit();
  const workspace=useWorkspace();
  return <article ref={ref} data-selected={workspace?.selected} className={`game-panel unified-panel${workspace?' integrated-panel':''}${studying ? ' is-studying' : ''}`} aria-label={label} tabIndex={0} onKeyDown={onKeyDown}>
    {context}
    <div className="unified-caption"><div className="unified-caption-text">{caption}{status&&<div className="unified-status" role="status">{status}</div>}</div>{captionActions}</div>
    <div className="commentary-row">{evaluation}</div>
    {workspace ? <div className="workspace-body"><div className="workspace-board">{board}{controls}</div><aside className="workspace-record" aria-label="棋譜と全棋譜解析">{record}</aside></div> : <>{board}{controls}</>}
    {footer}
    {modal}
  </article>;
}

export function BoardControls({ current, ply, max, onPrevious, onNext, onCurrent, onSeek, action, onAction, onFlip, previousDisabled, nextDisabled, disabled = false }: {
  current: string; ply: number; max: number; onPrevious: () => void; onNext: () => void; onCurrent: () => void;
  onSeek: (ply: number) => void; action: string; onAction: () => void; previousDisabled?: boolean; nextDisabled?: boolean; disabled?: boolean;
  onFlip: () => void;
}) {
  const workspace=useWorkspace();
  if(workspace)return <div className="board-controls integrated-controls" aria-label="棋譜再生操作">
    <button aria-label="最初" disabled={disabled||previousDisabled} onClick={()=>onSeek(0)}>⏮</button>
    <button aria-label="1手戻る" disabled={disabled||previousDisabled} onClick={onPrevious}>←</button>
    <button aria-label="1手進む" disabled={disabled||nextDisabled} onClick={onNext}>→</button>
    <button aria-label="最後" disabled={disabled||nextDisabled} onClick={()=>onSeek(max)}>⏭</button>
    <button aria-label="盤面を反転" disabled={disabled} onClick={onFlip}>反転</button>
    <small className="replay-status" title={current} aria-label="現在手数">{ply} / {max}手</small>
  </div>;
  return <div className="board-controls" aria-label="棋譜再生操作">
    <button className="board-flip" disabled={disabled} onClick={onFlip}>反転</button>
    <button disabled={disabled} onClick={onAction}>{action}</button>
    <button aria-label="1手戻る" disabled={disabled || previousDisabled} onClick={onPrevious}>←</button>
    <button aria-label="1手進む" disabled={disabled || nextDisabled} onClick={onNext}>→</button>
    <button className="current-move" aria-label="棋譜を開く" disabled={disabled} onClick={event => { event.currentTarget.focus({preventScroll:true}); onCurrent(); }}>棋譜</button>
    <input aria-label="手数" type="range" min="0" max={max} value={ply} disabled={disabled} onChange={event => onSeek(Number(event.target.value))} />
    <small className="replay-status" aria-label="現在手数" title={current}>{ply} / {max}手</small>
  </div>;
}
