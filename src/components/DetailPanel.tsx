import { useEffect, useId, useRef, type ReactNode } from 'react';

export type DetailTab = 'record' | 'analysis' | 'settings';
const TITLES: Record<DetailTab,string> = {record:'棋譜',analysis:'読み筋',settings:'設定'};

export function DetailPanel({ open, onClose, tab, onHeaderTarget, children }: {
  open: boolean; onClose: () => void; tab: DetailTab; onHeaderTarget?: (element:HTMLDivElement|null)=>void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const id = useId();
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) { previousFocus.current=document.activeElement as HTMLElement; el.showModal?.(); }
    else if (!open && el.open) {
      el.close?.();
      const target=previousFocus.current;
      if (target?.isConnected && target !== document.body) target.focus({preventScroll:true});
      else el.parentElement?.querySelector<HTMLButtonElement>('.current-move')?.focus({preventScroll:true});
    }
  }, [open]);
  return <dialog ref={dialog} className={'board-dialog dialog-'+tab} aria-label={TITLES[tab]} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
  }}>
    <header className="board-dialog-header"><strong id={id} className={tab==='record'?'sr-only':undefined}>{TITLES[tab]}</strong>{tab==='record'&&<div className="record-header-actions" ref={onHeaderTarget}/>}<button className="dialog-close" aria-label="閉じる" onClick={onClose}>×</button></header>
    <div className="board-dialog-body" aria-labelledby={id}>{children}</div>
  </dialog>;
}
