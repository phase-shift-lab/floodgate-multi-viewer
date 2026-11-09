import {expect,test} from '@playwright/test';
import {base,count,disabledAnalysis,startStudy,settings} from './ui';
test('five navigation controls are common to watching and studying',async({page})=>{
 await disabledAnalysis(page);await page.goto(base);await count(page,1);for(const state of ['watch','study']){if(state==='study')await startStudy(page);const p=page.locator('.unified-panel');await expect(p.locator('.board-controls button')).toHaveText(['⏮','←','→','⏭','反転']);await expect(p.locator('.workspace-record .move-list')).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);}
});
test('settings and analysis target the last touched panel',async({page})=>{
 await disabledAnalysis(page);await page.goto(base);await count(page,2);const ps=page.locator('.unified-panel');await ps.nth(1).locator('.board-player').first().click();await expect(ps.nth(1)).toHaveAttribute('data-selected','true');await expect(ps.nth(0)).toHaveAttribute('data-selected','false');await expect(page.getByLabel('全棋譜の解析時間')).toHaveCount(1);await settings(ps.nth(1));await expect(page.locator('#header-menu .board-settings')).toBeVisible();await expect(page.getByRole('button',{name:'設定を開く',exact:true})).toHaveCount(0);await page.getByLabel('任意再生速度（秒）').fill('2.5');await page.keyboard.press('Escape');await expect(page.locator('#header-menu')).toBeHidden();await settings(ps.nth(0));await expect(page.getByLabel('任意再生速度（秒）')).not.toHaveValue('2.5');await page.keyboard.press('Escape');await settings(ps.nth(1));await expect(page.getByLabel('任意再生速度（秒）')).toHaveValue('2.5');await page.keyboard.press('Escape');await page.reload();await settings(page.locator('.unified-panel').first());await expect(page.getByLabel('任意再生速度（秒）')).toHaveValue('2.5');
});

test('phone settings directly contain watch and study options without a second screen',async({page})=>{
 await disabledAnalysis(page);await page.setViewportSize({width:393,height:600});await page.goto(base);await count(page,1);
 for(const mode of ['watch','study']){
  if(mode==='study')await startStudy(page);
  await settings(page.locator('.unified-panel'));
  const menu=page.locator('#header-menu');
  await expect(menu.locator('.board-settings')).toBeVisible();await expect(menu.getByRole('button',{name:'駒音 OFF',exact:true})).toHaveCount(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  if(mode==='watch')await expect(menu.getByLabel('任意再生速度（秒）')).toBeVisible();
  else {await expect(menu.getByLabel('解析時間',{exact:true})).toBeVisible();await expect(menu.getByRole('button',{name:'変化を全消去'})).toBeVisible();}
  const box=await menu.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(393);expect(box!.y+box!.height).toBeLessThanOrEqual(600);
  await page.keyboard.press('Escape');await expect(menu).toBeHidden();
 }
});
