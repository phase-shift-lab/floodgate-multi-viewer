import {expect,test} from '@playwright/test';
import {base,count,disabledAnalysis} from './ui';
test('four embedded records change only the selected board without a modal',async({page})=>{
 await disabledAnalysis(page);await page.goto(base);await count(page,4);const ps=page.locator('.unified-panel');await expect(ps.locator('.workspace-record .move-list')).toHaveCount(4);const other=await ps.nth(1).locator('.shogi-board').getAttribute('aria-label');await ps.first().locator('.move-list button').nth(1).click();await expect(ps.first().locator('.shogi-board')).toHaveAttribute('aria-label','将棋盤 1手目');await expect(ps.nth(1).locator('.shogi-board')).toHaveAttribute('aria-label',other!);await expect(page.locator('.is-studying')).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('layout switches the record below or beside the board and persists',async({page})=>{
 await disabledAnalysis(page);await page.setViewportSize({width:1440,height:900});await page.goto(base);await count(page,1);for(const mode of ['stack','side']){await page.getByLabel('配置',{exact:true}).selectOption(mode);const r=await page.locator('.unified-panel').evaluate(el=>({record:el.querySelector('.workspace-record')!.getBoundingClientRect().toJSON(),board:el.querySelector('.workspace-board')!.getBoundingClientRect().toJSON()}));if(mode==='side')expect(r.record.left).toBeGreaterThanOrEqual(r.board.right-1);else expect(r.record.top).toBeGreaterThanOrEqual(r.board.bottom-1);}await page.reload();await expect(page.getByLabel('配置',{exact:true})).toHaveValue('side');
});
