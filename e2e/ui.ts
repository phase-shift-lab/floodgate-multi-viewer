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
export async function startStudy(page: Page, panel=page.locator('.unified-panel').first()) {
  await panel.getByRole('button',{name:'検討',exact:true}).click();
  const study=page.locator('.unified-panel.is-studying'); await expect(study).toBeVisible(); return study;
}
export async function settings(panel: Locator) {
  await panel.getByRole('button',{name:'棋譜を開く'}).click();
  await panel.getByRole('tab',{name:'設定',exact:true}).click();
}
