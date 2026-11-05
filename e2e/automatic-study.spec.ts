import {expect,test} from '@playwright/test';
import {base,count,disabledAnalysis,tools} from './ui';
test.beforeEach(async({page})=>{await disabledAnalysis(page);await page.goto(base);await count(page,1);await tools(page.locator('.unified-panel'));await page.locator('.board-tools-content').getByRole('button',{name:'最初',exact:true}).click();});
test('only a legal move starts a saved variation and source return restores the board',async({page})=>{
 const p=page.locator('.unified-panel');await p.locator('[data-square="27"]').click();await expect(page.locator('.is-studying')).toHaveCount(0);await p.locator('[data-square="25"]').click();await expect(page.locator('.is-studying')).toHaveCount(0);await p.locator('[data-square="26"]').click();await expect(page.locator('.is-studying')).toHaveCount(1);const s=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('fgmv:study:v1')!));expect(s.origin).toBe(0);expect(s.nodes[s.current].move).toMatchObject({from:'27',to:'26',piece:'FU'});await p.locator('.return-source').click();await expect(page.locator('.is-studying')).toHaveCount(0);await expect(p.locator('[data-square="27"]')).toContainText('歩');
});
test('side and turn markers track flip and confirmed moves',async({page})=>{
 const p=page.locator('.unified-panel');await tools(p);await p.getByRole('button',{name:'反転',exact:true}).click();await expect(p.locator('.board-player').first()).toHaveAttribute('data-side','+');await p.locator('[data-square="27"]').click();await p.locator('[data-square="26"]').click();await expect(p.locator('.board-player').last().locator('.turn-badge')).toHaveText('手番');await expect(p.locator('.hand.back')).toHaveAttribute('aria-label','先手の持駒');await expect(p.locator('.integrated-pv small')).toContainText('先手基準');
});
test('candidate expansion does not push the board',async({page})=>{
 const p=page.locator('.unified-panel');for(const w of [320,393,1440]){await page.setViewportSize({width:w,height:900});const b=await p.locator('.shogi-board').boundingBox();await p.locator('.integrated-candidates summary').click();await expect(p.getByRole('button',{name:'端末で解析 OFF',exact:true})).toBeVisible();expect(await p.locator('.shogi-board').boundingBox()).toEqual(b);await p.locator('.integrated-candidates summary').click();}
});
