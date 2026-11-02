import { useLayoutEffect, useRef } from 'react';

/** Size every panel from the same board/hand geometry and actual controls. */
export function useBoardFit() {
  const ref = useRef<HTMLElement>(null);
  const fitNow = useRef<(() => void) | undefined>(undefined);
  useLayoutEffect(() => {
    const root=ref.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    let frame=0;
    const fit=() => {
      if (root.querySelector(':scope > dialog[open]')) return;
      const grid=root.parentElement;
      const wrap=root.querySelector<HTMLElement>(':scope > .board-wrap');
      const stack=wrap?.querySelector<HTMLElement>('.board-stack');
      if (!grid || !wrap || !stack || !root.getClientRects().length || !grid.clientWidth) return;
      const gridStyle=getComputedStyle(grid);
      const columns=gridStyle.gridTemplateColumns.split(' ').filter(Boolean);
      const columnWidth=parseFloat(columns[0]) || grid.clientWidth;
      const rows=Math.ceil(grid.children.length/Math.max(1,columns.length));
      const available=(innerHeight-grid.getBoundingClientRect().top-window.scrollY-4)/rows;
      const chrome=[...root.children].filter(el => el !== wrap && el.tagName !== 'DIALOG' && !['fixed','absolute'].includes(getComputedStyle(el).position))
        .reduce((total,el) => total+el.getBoundingClientRect().height,0);
      const stackBox=stack.getBoundingClientRect();
      const ratio=stackBox.height/Math.max(1,stackBox.width);
      const wrapStyle=getComputedStyle(wrap), rootStyle=getComputedStyle(root);
      const spacing=parseFloat(wrapStyle.paddingTop)+parseFloat(wrapStyle.paddingBottom)+parseFloat(rootStyle.borderTopWidth)+parseFloat(rootStyle.borderBottomWidth);
      const min=rows>1 ? 60 : innerHeight<600 ? 240 : 260;
      const width=Math.max(min,Math.min(600,columnWidth-32,(available-chrome-spacing)/Math.max(1.2,ratio)));
      const size=Math.floor(Math.min(width,columnWidth-32))+'px';
      if (root.style.getPropertyValue('--unified-board-size') !== size) root.style.setProperty('--unified-board-size',size);
    };
    const stabilize=() => {
      for (let pass=0; pass<12; pass++) {
        const before=root.style.getPropertyValue('--unified-board-size');
        fit();
        if (root.style.getPropertyValue('--unified-board-size') === before) break;
      }
    };
    fitNow.current=stabilize;
    const schedule=() => { cancelAnimationFrame(frame); frame=requestAnimationFrame(stabilize); };
    const observer=new ResizeObserver(schedule);
    const modalObserver=new MutationObserver(schedule);
    modalObserver.observe(root,{subtree:true,attributes:true,attributeFilter:['open']});
    observer.observe(root); if (root.parentElement) observer.observe(root.parentElement);
    for (const child of root.children) if (child.tagName !== 'DIALOG') observer.observe(child);
    window.addEventListener('resize',schedule);
    return () => { fitNow.current=undefined; observer.disconnect(); modalObserver.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize',schedule); };
  },[]);
  // Count/expanded/controller changes reuse this surface. Fit their new chrome
  // before painting, rather than waiting for ResizeObserver's next animation frame.
  useLayoutEffect(() => { fitNow.current?.(); });
  return ref;
}
