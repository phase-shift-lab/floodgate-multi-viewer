import type { KeyboardEvent, ReactNode } from 'react';
import { useBoardFit } from './useBoardFit';

/** One layout for watching, reading the score sheet and moving pieces. */
export function BoardSurface({ context, caption, evaluation, board, controls, status, footer, modal, studying = false, onKeyDown, label }: {
  context: ReactNode; caption: ReactNode; evaluation: ReactNode; board: ReactNode;
  controls: ReactNode; status?: ReactNode; footer?: ReactNode; modal: ReactNode;
  studying?: boolean; onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void; label: string;
}) {
  const ref = useBoardFit();
  return <article ref={ref} className={`game-panel unified-panel${studying ? ' is-studying' : ''}`} aria-label={label} tabIndex={0} onKeyDown={onKeyDown}>
    {context}
    <div className="unified-caption"><div className="unified-caption-text">{caption}<div className="unified-status" role="status">{status}</div></div></div>
    <div className="commentary-row">{evaluation}</div>
    {board}
    {controls}
    {footer}
    {modal}
  </article>;
}

export function BoardControls({ current, ply, max, onPrevious, onNext, onCurrent, onSeek, action, onAction, onFlip, onStudy, studyLabel = '検討', studyDisabled = false, studyTitle, previousDisabled, nextDisabled, disabled = false }: {
  current: string; ply: number; max: number; onPrevious: () => void; onNext: () => void; onCurrent: () => void;
  onSeek: (ply: number) => void; action: string; onAction: () => void; previousDisabled?: boolean; nextDisabled?: boolean; disabled?: boolean;
  onFlip: () => void; onStudy: () => void; studyLabel?: string; studyDisabled?: boolean; studyTitle?: string;
}) {
  return <div className="board-controls" aria-label="棋譜再生操作">
    <button className="board-flip" disabled={disabled} onClick={onFlip}>反転</button>
    <button disabled={disabled} onClick={onAction}>{action}</button>
    <button aria-label="1手戻る" disabled={disabled || previousDisabled} onClick={onPrevious}>←</button>
    <button aria-label="1手進む" disabled={disabled || nextDisabled} onClick={onNext}>→</button>
    <button className="study-toggle" aria-label={studyLabel === '本譜へ' ? '本譜へ戻る' : '検討'} disabled={disabled || studyDisabled} title={studyTitle} onClick={onStudy}>{studyLabel}</button>
    <button className="current-move" aria-label="棋譜を開く" disabled={disabled} onClick={event => { event.currentTarget.focus({preventScroll:true}); onCurrent(); }}>棋譜</button>
    <input aria-label="手数" type="range" min="0" max={max} value={ply} disabled={disabled} onChange={event => onSeek(Number(event.target.value))} />
    <small className="replay-status" aria-label="現在手数" title={current}>{ply} / {max}手</small>
  </div>;
}
