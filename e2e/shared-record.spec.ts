import {expect,test} from '@playwright/test';
import {base,count,disabledAnalysis} from './ui';

test('a copied archive URL opens the same record and position in a fresh browser context',async({page,context,browser})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 await disabledAnalysis(page);await page.goto(base);await count(page,1);
 await page.getByRole('button',{name:'過去対局',exact:true}).click();
 await page.locator('.archive-list button').filter({hasText:'nshogi-dev-5070'}).click();
 const panel=page.locator('.unified-panel').first();
 await panel.locator('.move-list button').nth(2).click();
 await panel.getByRole('button',{name:'盤面を反転',exact:true}).click();
 const name=await panel.getByRole('button',{name:'対局を選ぶ',exact:true}).textContent();
 await panel.getByRole('button',{name:'共有',exact:true}).click();
 await expect(panel.locator('.record-export output')).toHaveText('URLをコピーしました');
 const url=await page.evaluate(()=>navigator.clipboard.readText());
 expect(new URL(url).searchParams.get('view')).toBe('archive');
 expect(new URL(url).searchParams.get('ply')).toBe('2');
 const recipientContext=await browser.newContext();
 try {
  const recipient=await recipientContext.newPage();await disabledAnalysis(recipient);await recipient.goto(url);
  await expect(recipient.locator('.archive-search')).toHaveCount(0);
  await expect(recipient.locator('.unified-panel')).toHaveCount(1);
  await expect(recipient.getByRole('button',{name:'対局を選ぶ',exact:true})).toHaveText(name!);
  await expect(recipient.locator('.shogi-board')).toHaveAttribute('aria-label','将棋盤 2手目');
  await expect(recipient.locator('.file-labels')).toHaveText('123456789');
  await recipient.reload();
  await expect(recipient.locator('.shogi-board')).toHaveAttribute('aria-label','将棋盤 2手目');
 }finally{await recipientContext.close();}
});

test('an unavailable shared record shows an error instead of a featured or synthetic game',async({page})=>{
 await disabledAnalysis(page);
 await page.goto(base+'?view=archive&boards=1&game='+encodeURIComponent('wdoor+floodgate-900-0+MissingA+MissingB+20261101000000'));
 await expect(page.getByRole('alert')).toContainText('共有された棋譜を開けませんでした');
 await expect(page.locator('.unified-panel')).toHaveCount(0);
 await expect(page.locator('.archive-search')).toHaveCount(0);
 await page.getByLabel('表示局数',{exact:true}).selectOption('3');
 await expect(page.locator('.unified-panel')).toHaveCount(0);
});
