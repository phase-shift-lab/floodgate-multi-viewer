import { expect, test } from '@playwright/test';
import { base, count, disabledAnalysis, startStudy } from './ui';

test('one board surface in both states: square cells, stable controls, popup without page reflow',async({page}) => {
  await disabledAnalysis(page);await page.goto(base);await page.locator('.shogi-board').first().waitFor();await count(page,1);
  for(const state of ['watch','study']) {
    if(state==='study')await startStudy(page);
    const panel=page.locator('.unified-panel');
    for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:393,height:852},{width:320,height:660},{width:852,height:393}]){
      await page.setViewportSize(viewport);
      await expect.poll(()=>panel.locator('.shogi-board').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(230);
      const geometry=await panel.evaluate(el=>{const b=el.querySelector('.shogi-board')!.getBoundingClientRect(),cells=[...el.querySelectorAll('.square')].map(s=>s.getBoundingClientRect());return {square:Math.abs(b.width-b.height),equal:cells.every(c=>Math.abs(c.width-c.height)<1),overflow:document.documentElement.scrollWidth>innerWidth+1,right:el.querySelector('.rank-labels')!.getBoundingClientRect().right,panelRight:el.getBoundingClientRect().right}});
      expect(geometry.square).toBeLessThan(1);expect(geometry.equal).toBe(true);expect(geometry.overflow).toBe(false);expect(geometry.right).toBeLessThanOrEqual(geometry.panelRight);
      await expect(panel.locator('.local-evaluation')).toHaveCount(1);
      const before=await panel.locator('.shogi-board').evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,x:r.x+scrollX,y:r.y+scrollY}});await panel.getByRole('button',{name:'棋譜を開く'}).click();await expect(page.getByRole('dialog')).toBeVisible();
      expect(await panel.locator('.shogi-board').evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,x:r.x+scrollX,y:r.y+scrollY}})).toEqual(before);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await page.setViewportSize({width:1440,height:900});
  }
});

test('side markers lead names and favorites stay at the right edge',async({page}) => {
  await disabledAnalysis(page);await page.goto(base);await page.locator('.shogi-board').first().waitFor();
  for(const width of [1440,393]){
    await page.setViewportSize({width,height:900});const players=page.locator('.unified-panel').first().locator('.players > div');await expect(players.locator('.player-side')).toHaveText(['▲','△']);
    for(const g of await players.evaluateAll(els=>els.map(el=>({side:el.querySelector('.player-side')!.getBoundingClientRect().right,name:el.querySelector('strong')!.getBoundingClientRect(),star:el.querySelector('.star')!.getBoundingClientRect().left})))){expect(g.side).toBeLessThanOrEqual(g.name.left);expect(g.star).toBeGreaterThanOrEqual(g.name.right);}
  }
});

test('entering and leaving study from a single panel keeps the board in place',async({page})=>{
  await disabledAnalysis(page);await page.goto(base);await page.locator('.shogi-board').first().waitFor();await count(page,1);
  const panel=page.locator('.unified-panel');
  const before=await panel.locator('.shogi-board').boundingBox();
  await startStudy(page);expect(await panel.locator('.shogi-board').boundingBox()).toEqual(before);
  await panel.getByRole('button',{name:'本譜へ戻る'}).click();
  expect(await panel.locator('.shogi-board').boundingBox()).toEqual(before);
});
