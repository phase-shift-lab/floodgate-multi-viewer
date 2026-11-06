import {expect,test} from '@playwright/test';
import {base,count,disabledAnalysis,startStudy,settings} from './ui';
test('five navigation controls are common to watching and studying',async({page})=>{
 await disabledAnalysis(page);await page.goto(base);await count(page,1);for(const state of ['watch','study']){if(state==='study')await startStudy(page);const p=page.locator('.unified-panel');await expect(p.locator('.board-controls button')).toHaveText(['⏮','←','→','⏭','反転']);await expect(p.locator('.workspace-record .move-list')).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);}
});
test('settings and analysis target the last touched panel',async({page})=>{
 await disabledAnalysis(page);await page.goto(base);await count(page,2);const ps=page.locator('.unified-panel');await ps.nth(1).locator('.board-player').first().click();await expect(ps.nth(1)).toHaveAttribute('data-selected','true');await expect(ps.nth(0)).toHaveAttribute('data-selected','false');await expect(page.getByLabel('全棋譜の解析時間')).toHaveCount(1);await settings(ps.nth(1));await expect(ps.nth(1).getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
});
