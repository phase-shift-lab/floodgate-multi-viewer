import { expect, test, type Page } from '@playwright/test';
import { base, count, disabledAnalysis, settings, startStudy, tools } from './ui';
async function openStudy(page:Page){await disabledAnalysis(page);await page.goto(base);await page.locator('.shogi-board').first().waitFor();await count(page,1);const panel=page.locator('.unified-panel');await tools(panel);await panel.getByRole('button',{name:'最初',exact:true}).click();return startStudy(page,panel);}

test('moves, branches, flip, default sound, source return and saved resume in the same panel',async({page})=>{
  const study=await openStudy(page);await settings(study);
  await expect(study.getByRole('button',{name:'駒音 OFF',exact:true})).toBeVisible();await expect(study.getByLabel('解析時間')).toHaveValue('1');await expect(study.getByLabel('解析時間').locator('option')).toHaveText(['1秒','3秒','5秒','10秒']);await study.getByRole('button',{name:'閉じる',exact:true}).click();
  await expect(study.locator('.file-labels')).toHaveText('987654321');await expect(study.locator('.hand')).toHaveText(['','']);
  await study.locator('[data-square="77"]').click();await expect(study.locator('[data-square="76"]')).toHaveClass(/legal-target/);await study.locator('[data-square="75"]').click();await expect(study.getByRole('alert')).toContainText('指せません');await study.locator('[data-square="76"]').click();
  await study.locator('[data-square="33"]').click();await study.locator('[data-square="34"]').click();await study.getByRole('button',{name:'1手戻る',exact:true}).click();await study.locator('[data-square="83"]').click();await study.locator('[data-square="84"]').click();await expect(study.locator('.study-history li')).toHaveCount(3);
  await study.getByRole('button',{name:'反転',exact:true}).click();await expect(study.locator('.file-labels')).toHaveText('123456789');await settings(study);await study.getByRole('button',{name:'駒音 OFF',exact:true}).click();await expect(study.getByRole('button',{name:'駒音 ON',exact:true})).toHaveAttribute('aria-pressed','true');await study.getByRole('button',{name:'閉じる',exact:true}).click();
  await study.getByRole('button',{name:'本譜へ戻る'}).click();const panel=page.locator('.unified-panel');await expect(panel.locator('.replay-status')).toHaveText(/^0 \//);await tools(panel);await panel.getByRole('button',{name:'前の検討を再開'}).click();await expect(page.locator('.is-studying .study-history li')).toHaveCount(3);
  await page.reload();await expect(page.locator('.is-studying')).toHaveCount(0);await tools(panel);await panel.getByRole('button',{name:'前の検討を再開'}).click();await expect(page.locator('.is-studying .study-history li')).toHaveCount(3);
});

test('real engine: setup restores the branch, 10 seconds, stop, source return and removal',async({page})=>{
  test.setTimeout(120_000);const study=await openStudy(page);await study.locator('[data-square="77"]').click();await study.locator('[data-square="76"]').click();await settings(study);await study.getByRole('button',{name:'解析 OFF',exact:true}).click();
  const active=page.locator('.is-studying');await expect(active.locator('.evaluation-status')).toHaveText('解析完了',{timeout:45000});await expect(active.locator('.evaluation-number')).not.toHaveText('—');await expect(active.locator('.study-history li')).toHaveCount(1);
  await active.getByRole('button',{name:'候補手・読み筋を開く'}).click();await expect(active.locator('.analysis-popover li').first()).toContainText('第1候補');await active.getByRole('tab',{name:'設定',exact:true}).click();await active.getByLabel('解析時間').selectOption('10');await expect(active.locator('.evaluation-status')).toHaveText('解析完了',{timeout:20000});await active.getByRole('button',{name:'再解析',exact:true}).click();await active.getByRole('button',{name:'停止',exact:true}).click();await expect(active.locator('.evaluation-status')).toHaveText('停止中');await active.getByRole('button',{name:'閉じる',exact:true}).click();await active.getByRole('button',{name:'本譜へ戻る'}).click();
  const panel=page.locator('.unified-panel');await panel.getByRole('button',{name:'候補手・読み筋を開く'}).click();await panel.getByRole('button',{name:'端末で解析 OFF',exact:true}).click();await expect(panel.locator('.evaluation-status')).toHaveText('解析完了',{timeout:45000});
  await Promise.all([page.waitForEvent('load'),panel.getByRole('button',{name:'解析用設定を解除して再読み込み',exact:true}).click()]);await expect(page.locator('.evaluation-status').first()).toHaveText('解析OFF');
});

test('source record selection preserves variation and four-panel return restores order, flip and pin',async({page})=>{
  await disabledAnalysis(page);await page.goto(base);await page.locator('.shogi-board').first().waitFor();await count(page,4);const panels=page.locator('.unified-panel');await expect(panels).toHaveCount(4);await panels.first().getByRole('button',{name:'1手戻る'}).click();await panels.nth(1).getByRole('button',{name:'反転',exact:true}).click();await tools(panels.nth(1));await panels.nth(1).getByRole('button',{name:'ピン留め',exact:true}).click();const before=await panels.locator('.replay-status').allTextContents();const names=await panels.evaluateAll(els=>els.map(el=>el.getAttribute('aria-label')));
  const study=await startStudy(page,panels.nth(1));await expect(panels).toHaveCount(1);await study.getByRole('button',{name:'本譜へ戻る'}).click();await expect(panels).toHaveCount(4);expect(await panels.evaluateAll(els=>els.map(el=>el.getAttribute('aria-label')))).toEqual(names);await expect(panels.locator('.replay-status')).toHaveText(before);await expect(panels.nth(1).locator('.file-labels')).toHaveText('123456789');await tools(panels.nth(1));await expect(panels.nth(1).getByRole('button',{name:'ピン解除'})).toHaveAttribute('aria-pressed','true');
});

test('picking a mainline move saves the variation and resume restores it',async({page})=>{
  const study=await openStudy(page);
  await study.locator('[data-square="77"]').click();await study.locator('[data-square="76"]').click();
  await study.getByRole('button',{name:'棋譜を開く'}).click();
  await study.getByRole('button',{name:'本譜',exact:true}).click();
  await study.getByRole('button',{name:/^3\./}).click();
  await expect(page.locator('.is-studying')).toHaveCount(0);
  const panel=page.locator('.unified-panel');await expect(panel.locator('.replay-status')).toHaveText(/^3 \//);
  await expect(panel.getByRole('button',{name:'棋譜を開く'})).toBeFocused();
  await tools(panel);await panel.getByRole('button',{name:'前の検討を再開'}).click();
  await expect(page.locator('.is-studying [data-square="76"] .piece')).toHaveText('歩');
});

for(const width of [320,393,430])test('mobile '+width+': shared panel, text zoom and rotation',async({page})=>{
  await page.setViewportSize({width,height:852});const study=await openStudy(page);await expect(study.getByRole('button',{name:'本譜へ戻る'})).toBeVisible();await expect(study.locator('.square')).toHaveCount(81);
  const sizes=await study.locator('.square').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return [r.width,r.height]}));for(const [w,h]of sizes)expect(Math.abs(w-h)).toBeLessThan(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const pieces=await study.locator('.square:has(.piece)').evaluateAll(els=>els.map(el=>{const cell=el.getBoundingClientRect(),piece=el.querySelector('.piece')!.getBoundingClientRect();return {cellWidth:cell.width,cellHeight:cell.height,pieceWidth:piece.width,pieceHeight:piece.height};}));
  for(const piece of pieces){expect(piece.pieceWidth).toBeLessThanOrEqual(piece.cellWidth+1);expect(piece.pieceHeight).toBeLessThanOrEqual(piece.cellHeight+1);}
  await page.setViewportSize({width:852,height:393});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
