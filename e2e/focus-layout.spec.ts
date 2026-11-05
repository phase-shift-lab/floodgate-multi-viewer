import {expect,test} from '@playwright/test';
import {base,count,disabledAnalysis,settleBoard,settings,startStudy} from './ui';
test('settings overlay does not reflow watch or study board',async({page})=>{
 await disabledAnalysis(page);await page.goto(base);await count(page,1);for(const state of ['watch','study']){if(state==='study')await startStudy(page);const p=page.locator('.unified-panel');await settleBoard(p);const b=await p.locator('.shogi-board').boundingBox();await settings(p);await expect(p.getByRole('dialog')).toBeVisible();expect(await p.locator('.shogi-board').boundingBox()).toEqual(b);await page.keyboard.press('Escape');await expect(p.getByRole('dialog')).toHaveCount(0);}
});
test('side markers precede names and favorites remain at their right edge',async({page})=>{
 await disabledAnalysis(page);await page.goto(base);for(const w of [1440,393]){await page.setViewportSize({width:w,height:900});const ps=page.locator('.unified-panel').first().locator('.board-player');for(const g of await ps.evaluateAll(els=>els.map(el=>({side:el.querySelector('.player-side')!.getBoundingClientRect().right,name:el.querySelector('strong')!.getBoundingClientRect().toJSON(),star:el.querySelector('.star')!.getBoundingClientRect().left})))){expect(g.side).toBeLessThanOrEqual(g.name.left);expect(g.star).toBeGreaterThanOrEqual(g.name.right);}}
});
