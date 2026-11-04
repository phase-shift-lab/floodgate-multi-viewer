import {readFile} from 'node:fs/promises';
import {expect,test} from '@playwright/test';
import {base,count,disabledAnalysis,startStudy} from './ui';

test('record actions fit desktop and mobile and download full KIF and CSA',async({page})=>{
 await disabledAnalysis(page);await page.goto(base);await page.locator('.shogi-board').first().waitFor();await count(page,1);
 const panel=page.locator('.unified-panel').first();
 await panel.getByRole('button',{name:'棋譜を開く'}).click();
 for(const width of [320,393,1440]) {
  await page.setViewportSize({width,height:900});
  const actions=panel.locator('.record-export');
  const bounds=await actions.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,scroll:el.scrollWidth,width:el.clientWidth};});
  expect(bounds.left).toBeGreaterThanOrEqual(0);expect(bounds.right).toBeLessThanOrEqual(width);expect(bounds.scroll).toBeLessThanOrEqual(bounds.width+1);
  const position=await actions.evaluate(el=>{const top=el.getBoundingClientRect().top;const header=el.closest('.board-dialog-header')!.getBoundingClientRect();return top>=header.top-1&&top<header.bottom;});expect(position).toBe(true);
  const headerFits=await panel.locator('.board-dialog-header').evaluate(el=>{const r=el.getBoundingClientRect();return [...el.querySelectorAll('button,select')].every(button=>{const b=button.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right+1;});});expect(headerFits).toBe(true);
  const buttons=await actions.locator('button').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().height));
  expect(buttons.every(h=>h>=44)).toBe(true);
  if(width===393)await page.screenshot({path:'output/playwright/record-export/mobile.png'});
 }
 for(const format of ['kif','csa']) {
  await panel.getByLabel('棋譜の出力形式').selectOption(format);
  const event=page.waitForEvent('download');await panel.getByRole('button',{name:'棋譜DL',exact:true}).click();const download=await event;
  const text=await readFile((await download.path())!,'utf8');
  expect(download.suggestedFilename()).toMatch(format==='kif'?/\.kifu$/:/\.csa$/);
  expect(text).toContain(format==='kif'?'12 ':'-8173KE');
 }
 await panel.getByRole('button',{name:'閉じる',exact:true}).click();
 await panel.getByRole('button',{name:'1手戻る',exact:true}).click();
 await panel.getByRole('button',{name:'棋譜を開く'}).click();
 await panel.getByLabel('棋譜の出力形式').selectOption('kif');
 await panel.getByRole('button',{name:'棋譜コピー',exact:true}).click();
 await expect(panel.locator('.record-export output')).toHaveText(/棋譜をコピーしました|コピーできませんでした/);
});

test('study exports current path separately from the full source record',async({page})=>{
 await disabledAnalysis(page);await page.goto(base);await page.locator('.shogi-board').first().waitFor();await count(page,1);
 const study=await startStudy(page);
 const origin=Number((await study.locator('.connection').innerText()).match(/本譜(\d+)手目/)![1]);
 await study.getByRole('button',{name:'1手進む',exact:true}).click();
 await study.getByRole('button',{name:'棋譜を開く'}).click();
 await page.setViewportSize({width:320,height:900});
 await expect(study.getByRole('group',{name:'棋譜の種類'}).getByRole('button',{name:'変化'})).toHaveAttribute('aria-pressed','true');
 await study.getByLabel('棋譜の出力形式').selectOption('csa');
 const event=page.waitForEvent('download');await study.getByRole('button',{name:'棋譜DL',exact:true}).click();const download=await event;
 const text=await readFile((await download.path())!,'utf8');
 expect(download.suggestedFilename()).toContain('_変化.csa');
 expect(text.split(/\r?\n/).filter(l=>/^[+-]\d{4}[A-Z]{2}$/.test(l))).toHaveLength(origin+1);
 expect(text).not.toMatch(/^%/m);
 expect(await study.locator('.record-export').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 const row=await study.locator('.record-toolbar').evaluate(el=>[...el.querySelectorAll('button,select')].map(item=>{const r=item.getBoundingClientRect();return r.y+r.height/2;}));expect(Math.max(...row)-Math.min(...row)).toBeLessThanOrEqual(1);
 await study.getByRole('group',{name:'棋譜の種類'}).getByRole('button',{name:'本譜',exact:true}).click();
 await study.getByLabel('棋譜の出力形式').selectOption('csa');
 const sourceEvent=page.waitForEvent('download');await study.getByRole('button',{name:'棋譜DL',exact:true}).click();const sourceDownload=await sourceEvent;
 const sourceText=await readFile((await sourceDownload.path())!,'utf8');
 expect(sourceDownload.suggestedFilename()).not.toContain('_変化');
 expect(sourceText.split(/\r?\n/).filter(l=>/^[+-]\d{4}[A-Z]{2}$/.test(l))).toHaveLength(origin);
 await study.getByRole('group',{name:'棋譜の種類'}).getByRole('button',{name:'変化'}).click();
 await expect.poll(()=>study.locator('.move-list').evaluate(list=>{
  const box=list.getBoundingClientRect(),body=list.closest('.board-dialog-body')!.getBoundingClientRect(),toolbar=list.parentElement!.querySelector('.record-toolbar')!.getBoundingClientRect();
  const top=Math.max(box.top,body.top,toolbar.bottom),bottom=Math.min(box.bottom,body.bottom);
  return [...list.querySelectorAll('button')].filter(button=>{const r=button.getBoundingClientRect();return r.bottom>top&&r.top<bottom;}).length;
 })).toBeGreaterThanOrEqual(3);
 await page.screenshot({path:'output/playwright/record-export/study-mobile.png'});
});
