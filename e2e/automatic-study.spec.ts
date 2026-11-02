import {expect,test} from '@playwright/test';
import {base,count,disabledAnalysis,tools} from './ui';
test.beforeEach(async({page})=>{await disabledAnalysis(page);await page.goto(base);await page.locator('.shogi-board').first().waitFor();await count(page,1);await tools(page.locator('.unified-panel'));await page.getByRole('button',{name:'最初',exact:true}).click();});

test('only a legal confirmed move enters study, saves that first move and restores the original board',async({page})=>{
 const panel=page.locator('.unified-panel');
 await expect(panel.locator('.board-controls button')).toHaveText(['反転','再生','←','→','棋譜']);
 await panel.locator('[data-square="27"]').click();await expect(page.locator('.is-studying')).toHaveCount(0);
 await panel.locator('[data-square="25"]').click();await expect(page.locator('.is-studying')).toHaveCount(0);
 await panel.locator('[data-square="27"]').click();await expect(panel.locator('.legal-target')).toHaveCount(0);
 await panel.locator('[data-square="27"]').click();await panel.locator('[data-square="26"]').click();
 await expect(page.locator('.is-studying')).toHaveCount(1);await expect(panel.getByLabel('現在手数')).toHaveText('1 / 1手');
 const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('fgmv:study:v1')!));
 expect(saved.origin).toBe(0);expect(saved.game.moveList).toHaveLength(0);expect(saved.nodes[saved.current].move).toMatchObject({from:'27',to:'26',piece:'FU'});
 const back=panel.locator('.unified-caption').getByRole('button',{name:'本譜へ戻る'});await expect(back).toHaveText('本譜');
 expect((await back.boundingBox())!.x).toBeGreaterThan((await panel.locator('.study-badge').boundingBox())!.x);
 await back.click();await expect(page.locator('.is-studying')).toHaveCount(0);
 await expect(panel.locator('[data-square="27"]')).toContainText('歩');await expect(panel.locator('[data-square="26"]')).toBeEmpty();
 await expect(panel.getByRole('button',{name:'最新',exact:true})).toBeVisible();
});

test('side names and the turn marker follow the actual board orientation and turn',async({page})=>{
 const panel=page.locator('.unified-panel'),labels=panel.locator('.board-player');
 await expect(labels).toHaveCount(2);await expect(labels.first()).toHaveAttribute('data-side','-');await expect(labels.last()).toHaveAttribute('data-side','+');
 await panel.getByRole('button',{name:'反転',exact:true}).click();
 await expect(labels.first()).toHaveAttribute('data-side','+');await expect(labels.last()).toHaveAttribute('data-side','-');
 await expect(labels.first().locator('.turn-badge')).toHaveText('手番');
 await panel.locator('[data-square="27"]').click();await panel.locator('[data-square="26"]').click();
 await expect(page.locator('.is-studying')).toHaveCount(1);await expect(labels.last().locator('.turn-badge')).toHaveText('手番');
 await expect(panel.locator('.hand.back')).toHaveAttribute('aria-label','先手の持駒');
 await expect(panel.locator('.evaluation-basis')).toHaveText('先手基準');
});

test('reading entry stays in the upper right without overlapping score, candidate or gauge',async({page})=>{
 const panel=page.locator('.unified-panel');
 for(const width of [320,393,1440]){
  await page.setViewportSize({width,height:900});
  const g=await panel.evaluate(el=>{
   const link=el.querySelector('.evaluation-open > span')!.getBoundingClientRect(),box=el.querySelector('.local-evaluation')!.getBoundingClientRect();
   return{top:link.top-box.top,right:box.right-link.right,overlap:['.advantage-meter','.evaluation-number','.first-candidate'].map(s=>{const r=el.querySelector(s)!.getBoundingClientRect();return link.left<r.right&&link.right>r.left&&link.top<r.bottom&&link.bottom>r.top;})};
  });
  expect(g.top).toBeLessThan(12);expect(g.right).toBeLessThan(12);expect(g.overlap).toEqual([false,false,false]);
 }
});
