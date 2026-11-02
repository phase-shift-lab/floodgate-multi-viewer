import { expect, test } from '@playwright/test';
import { base, count, disabledAnalysis, startStudy, tools } from './ui';

test.beforeEach(async({page})=>{await disabledAnalysis(page);await page.goto(base);await page.locator('.shogi-board').first().waitFor();});

test('six controls keep their order and touch targets on mobile and desktop, including study',async({page})=>{
 for(const width of [320,393,430,1440]) {
  await page.setViewportSize({width,height:900});await count(page,1);
  const panel=page.locator('.unified-panel');
  await expect(panel.locator('.board-controls button')).toHaveText(['反転','再生','←','→','検討','棋譜']);
  await expect(panel.getByRole('button',{name:'操作 ▾',exact:true})).toHaveCount(0);
  const boxes=await panel.locator('.board-controls button').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}}));
  expect(new Set(boxes.map(b=>b.y)).size).toBe(1);
  for(const box of boxes){expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const files=await panel.locator('.file-labels').textContent();
  await panel.getByRole('button',{name:'反転',exact:true}).click();
  await expect(panel.locator('.file-labels')).toHaveText(files === '987654321' ? '123456789' : '987654321');
  await panel.getByRole('button',{name:'棋譜を開く'}).click();
  await panel.getByRole('button',{name:/^3\./}).click();await expect(panel.locator('.replay-status')).toHaveText(/^3 \//);
  await page.getByRole('button',{name:'設定を開く',exact:true}).click();await expect(panel.getByRole('tab',{name:'設定',exact:true})).toHaveAttribute('aria-selected','true');
  await panel.getByRole('button',{name:'閉じる',exact:true}).click();
  await expect(page.getByRole('button',{name:'設定を開く',exact:true})).toBeFocused();
  const study=await startStudy(page,panel);
  await expect(study.locator('.board-controls button')).toHaveText(['反転','起点へ','←','→','本譜へ','棋譜']);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'設定を開く',exact:true}).click();await expect(study.getByLabel('解析時間')).toBeVisible();
  await study.getByRole('button',{name:'閉じる',exact:true}).click();await study.getByRole('button',{name:'本譜へ戻る'}).click();
  page.once('dialog',d=>d.accept());
 }
});

test('settings gear targets the last touched panel, game name retains pin and selection, evaluation opens analysis',async({page})=>{
 await count(page,4);const panels=page.locator('.unified-panel'),target=panels.nth(2);
 await target.locator('.player-side').first().click();await page.getByRole('button',{name:'設定を開く',exact:true}).click();
 await expect(target.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(1);
 await target.getByRole('button',{name:'閉じる',exact:true}).click();
 await tools(target);await target.getByRole('button',{name:'ピン留め',exact:true}).click();
 await tools(target);await expect(target.getByRole('button',{name:'ピン解除',exact:true})).toHaveAttribute('aria-pressed','true');
 await target.getByRole('button',{name:'対局を選ぶ',exact:true}).click();
 await target.getByRole('button',{name:'候補手・読み筋を開く'}).click();
 await expect(target.getByRole('tab',{name:'読み筋',exact:true})).toHaveAttribute('aria-selected','true');
});
