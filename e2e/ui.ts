import { expect, type Locator, type Page } from '@playwright/test';

export const base='/floodgate-multi-viewer/';
export async function tools(panel: Locator) {
  const button=panel.getByRole('button',{name:'対局を選ぶ',exact:true});
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
  const extra=panel.locator('.menu-secondary');
  if(await extra.count()&&!await extra.evaluate(el=>(el as HTMLDetailsElement).open))await extra.locator('summary').click();
}
export async function count(page: Page, number: 1|2|3|4) {
  await page.getByLabel('表示局数',{exact:true}).selectOption(String(number));
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
  const side=await panel.locator('.board-player.has-turn').getAttribute('data-side');
  const pieces=panel.locator(`.square[aria-label*="${side==='+'?'先手':'後手'}"]:has(.piece)`);
  const preferred=panel.locator('[data-square="77"]');
  let selected=false;
  if(side==='+'&&await preferred.locator('.piece').count()){
    await preferred.click();selected=await panel.locator('.legal-target').count()>0;
    if(!selected)await preferred.click();
  }
  for(let i=0;!selected&&i<await pieces.count();i++){
    await pieces.nth(i).click();selected=await panel.locator('.legal-target').count()>0;
    if(!selected)await pieces.nth(i).click();
  }
  if(!selected)throw new Error('No legal board move available');
  const pawn=panel.locator('[data-square="76"].legal-target');
  await (await pawn.count()?pawn:panel.locator('.legal-target').first()).click();
  const promotion=page.getByRole('dialog',{name:'成りの選択'});
  if(await promotion.isVisible())await promotion.getByRole('button',{name:'成らない',exact:true}).click();
  const study=page.locator('.unified-panel.is-studying');await expect(study).toBeVisible();
  const first=study.locator('.integrated-controls').getByRole('button',{name:'最初',exact:true});if(await first.isEnabled())await first.click();return study;
}
export async function settings(panel: Locator) {
  const page=panel.page();
  await panel.locator('.player-side').first().click();
  await page.getByRole('button',{name:'表示と設定',exact:true}).click();
  await page.getByRole('button',{name:'設定を開く',exact:true}).click();
}
