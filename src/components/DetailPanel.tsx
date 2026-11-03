import { useEffect, useId, useRef, type ReactNode } from 'react';

export type DetailTab = 'record' | 'analysis' | 'batch' | 'settings';
const TABS: [DetailTab,string][] = [['record','棋譜'],['analysis','読み筋'],['batch','全棋譜解析'],['settings','設定']];

export function DetailPanel({ open, onClose, title = '局面の詳細', tab, onTabChange, children }: {
  open: boolean; onClose: () => void; title?: string; tab: DetailTab; onTabChange: (tab: DetailTab) => void; children: ReactNode;
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
  return <dialog ref={dialog} className="board-dialog" aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
  }}>
    <header className="board-dialog-header"><strong>{title}</strong><button onClick={onClose}>閉じる</button></header>
    <div className="board-dialog-tabs" role="tablist" aria-label="詳細の表示">{TABS.map(([key,label]) => <button key={key} id={id+'-'+key} role="tab" aria-selected={tab === key} onClick={() => onTabChange(key)}>{label}</button>)}</div>
    <div className="board-dialog-body" role="tabpanel" aria-labelledby={id+'-'+tab}>{children}</div>
  </dialog>;
}
