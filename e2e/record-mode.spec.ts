import { expect, test } from '@playwright/test';
import { base, count, disabledAnalysis } from './ui';

test.beforeEach(async({page}) => { await disabledAnalysis(page); await page.goto(base); await page.locator('.shogi-board').first().waitFor(); });

test('score sheet opens without changing the four panels, selected moves stay outside study',async({page}) => {
  await count(page,4); const panels=page.locator('.unified-panel'); await expect(panels).toHaveCount(4);
  const before=await panels.locator('.replay-status').allTextContents();
  const target=panels.nth(2), box=await target.locator('.shogi-board').boundingBox();
  await target.getByRole('button',{name:'棋譜を開く'}).click();
  await expect(panels).toHaveCount(4); await expect(page.getByRole('dialog')).toBeVisible();
  expect(await target.locator('.shogi-board').boundingBox()).toEqual(box);
  await target.getByRole('button',{name:/^3\./}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(target.locator('.replay-status')).toHaveText(/^3 \//);
  expect(await page.evaluate(()=>sessionStorage.getItem('fgmv:study:v1'))).toBeNull();
  for(const i of [0,1,3]) await expect(panels.nth(i).locator('.replay-status')).toHaveText(before[i]);
  await expect(page.locator('.panel-modes')).toHaveCount(0);
});

test('centered 80 percent modal keeps the board still, scrolls only its body and closes with selection, Escape and backdrop',async({page}) => {
  await page.setViewportSize({width:393,height:852}); await page.reload();
  const panel=page.locator('.unified-panel'); await expect(panel).toHaveCount(1);
  const before=await panel.locator('.shogi-board').boundingBox();
  await panel.getByRole('button',{name:'棋譜を開く'}).click();const dialog=page.getByRole('dialog');
  const rect=await dialog.boundingBox();expect(rect!.width).toBeCloseTo(393*.8,0);expect(rect!.height).toBeCloseTo(852*.8,0);
  expect(rect!.x).toBeCloseTo((393-rect!.width)/2,0);expect(rect!.y).toBeCloseTo((852-rect!.height)/2,0);
  expect(await panel.locator('.shogi-board').boundingBox()).toEqual(before);
  await panel.getByRole('button',{name:/^5\./}).click();await expect(dialog).not.toBeVisible();
  await expect(panel.locator('.replay-status')).toHaveText(/^5 \//);
  await panel.getByRole('button',{name:'棋譜を開く'}).click();await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();await expect(panel.getByRole('button',{name:'棋譜を開く'})).toBeFocused();
  await panel.getByRole('button',{name:'棋譜を開く'}).click();await page.mouse.click(5,5);await expect(dialog).not.toBeVisible();
  await page.getByRole('button',{name:'設定を開く',exact:true}).click();
  await panel.getByRole('button',{name:'閉じる',exact:true}).click();
  await expect(page.getByRole('button',{name:'設定を開く',exact:true})).toBeFocused();
  for(const h of await panel.locator('.board-controls button').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height)))expect(h).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
