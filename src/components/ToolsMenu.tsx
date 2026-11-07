import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export function ToolsMenu({ children, label, disabled = false }: { children: ReactNode; label: ReactNode; disabled?: boolean }) {
  const [open,setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown',outside); document.addEventListener('keydown',escape);
    return () => { document.removeEventListener('pointerdown',outside); document.removeEventListener('keydown',escape); };
  }, [open]);
  return <div ref={root} className="board-tools game-selector"><button aria-label="対局を選ぶ" disabled={disabled} aria-expanded={open} aria-controls={id} onClick={event => { event.currentTarget.focus({preventScroll:true}); setOpen(!open); }}>{label} <span className="game-choice-hint" aria-hidden="true">対局選択 ▾</span></button>
    {open && <div id={id} className="board-tools-content" onClick={event => { if ((event.target as HTMLElement).closest('button')) setOpen(false); }}>{children}</div>}
  </div>;
}
