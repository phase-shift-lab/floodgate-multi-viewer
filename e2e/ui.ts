import { expect, type Locator, type Page } from '@playwright/test';

export const base='/floodgate-multi-viewer/';
export async function tools(panel: Locator) {
  const button=panel.getByRole('button',{name:'対局を選ぶ',exact:true});
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
}
export async function count(page: Page, number: 1|2|4) {
  const menu=page.getByRole('button',{name:'メニュー',exact:true});
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button',{name:number+'局',exact:true}).click();
}
export async function disabledAnalysis(page: Page) {
  await page.addInitScript(() => { if (!localStorage.getItem('unified-test-init')) { localStorage.setItem('fgmv:analysis:v1',JSON.stringify({disabled:true})); localStorage.setItem('unified-test-init','1'); } });
}
/** Wait for a painted layout after viewport/count changes, keeping exact comparisons. */
export async function settleBoard(panel: Locator) {
  await panel.evaluate(async el => {
    await document.fonts.ready;
    let previous='', stable=0;
    for(let frame=0;frame<30;frame++) {
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      const rect=el.querySelector('.shogi-board')!.getBoundingClientRect();
      const current=[rect.x,rect.y,rect.width,rect.height].join(',');
      stable=current===previous ? stable+1 : 0;
      if(stable>=2)return;
      previous=current;
    }
    throw new Error('Board layout did not settle');
  });
}
export async function startStudy(page: Page, panel=page.locator('.unified-panel').first()) {
  await panel.getByRole('button',{name:'検討',exact:true}).click();
  const study=page.locator('.unified-panel.is-studying'); await expect(study).toBeVisible(); return study;
}
export async function settings(panel: Locator) {
  await panel.getByRole('button',{name:'棋譜を開く'}).click();
  await panel.getByRole('tab',{name:'設定',exact:true}).click();
}
