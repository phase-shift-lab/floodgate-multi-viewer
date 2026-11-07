import {expect,test} from '@playwright/test';
import {base,count,disabledAnalysis,settleBoard} from './ui';

test('empty hands captures and flipping keep the board size and position stable',async({page})=>{
 test.setTimeout(90000);
 await disabledAnalysis(page);
 for(const [width,height] of [[1920,1080],[1440,900],[320,568],[393,852]]) {
  await page.setViewportSize({width,height});await page.goto(base);
  for(const n of width>=768?[1,3] as const:[1] as const) {
   await count(page,n);
   const p=page.locator('.unified-panel').first();
   await expect(p.locator('.shogi-board')).toBeVisible();
   const first=p.getByRole('button',{name:'最初',exact:true});if(await first.isEnabled())await first.click();await settleBoard(p);
   await expect(p.locator('.hand-empty')).toHaveCount(2);
   const initial=(await p.locator('.shogi-board').boundingBox())!;
   const hands=await p.locator('.hand').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));
   expect(hands[0]).toBeGreaterThan(0);expect(Math.abs(hands[0]-hands[1])).toBeLessThanOrEqual(1);
   if(n===3) {
    const widths=await page.locator('.shogi-board').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().width));
    expect(Math.max(...widths)-Math.min(...widths)).toBeLessThanOrEqual(1);
   }
   for(const action of ['最後','盤面を反転','最初']) {
    await p.getByRole('button',{name:action,exact:true}).click();await settleBoard(p);
    if(action==='最後')expect(await p.locator('.hand-piece-item').count()).toBeGreaterThan(0);
    const current=(await p.locator('.shogi-board').boundingBox())!;
    for(const key of ['x','y','width','height'] as const)expect(Math.abs(current[key]-initial[key])).toBeLessThanOrEqual(1);
    const currentHands=await p.locator('.hand').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));
    currentHands.forEach((height,index)=>expect(Math.abs(height-hands[index])).toBeLessThanOrEqual(1));
   }
  }
 }
});
