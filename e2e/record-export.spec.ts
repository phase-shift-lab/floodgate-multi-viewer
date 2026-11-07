import {readFile} from 'node:fs/promises';
import {expect,test} from '@playwright/test';
import {base,count,disabledAnalysis,startStudy} from './ui';
test('record toolbar copies and downloads full KIF and CSA',async({page})=>{
 await disabledAnalysis(page);await page.goto(base);await count(page,1);const p=page.locator('.unified-panel');for(const f of ['kif','csa']){await p.getByLabel('棋譜の出力形式').selectOption(f);const event=page.waitForEvent('download');await p.getByRole('button',{name:'DL',exact:true}).click();const d=await event,t=await readFile((await d.path())!,'utf8');expect(d.suggestedFilename()).toMatch(f==='kif'?/\.kifu$/:/\.csa$/);expect(t).toContain(f==='kif'?'12 ':'-8173KE');}await p.getByRole('button',{name:'コピー',exact:true}).click();await expect(p.locator('.record-export output')).toHaveText(/棋譜をコピーしました|コピーできませんでした/);
});

test('format copy download share stay in one row above the record on PC and phone',async({page})=>{
 await disabledAnalysis(page);
 for(const [width,height] of [[1920,1080],[1440,900],[320,568],[393,852]]){
  await page.setViewportSize({width,height});await page.goto(base);await count(page,width>=768?3:1);
  const p=page.locator('.unified-panel').first(),bar=p.locator('.embedded-record > .record-export');
  await expect(bar.getByRole('button')).toHaveText(['コピー','DL','共有']);
  const g=await bar.evaluate(el=>({bar:el.getBoundingClientRect().toJSON(),controls:[...el.querySelectorAll('select,button')].map(e=>({...e.getBoundingClientRect().toJSON(),scroll:e.scrollWidth,client:e.clientWidth})),record:el.parentElement!.querySelector('.inline-record-scroll')!.getBoundingClientRect().toJSON()}));
  expect(new Set(g.controls.map(r=>Math.round(r.top))).size).toBe(1);
  for(const r of g.controls){expect(r.left).toBeGreaterThanOrEqual(g.bar.left);expect(r.right).toBeLessThanOrEqual(g.bar.right);expect(r.scroll).toBeLessThanOrEqual(r.client);if(width<768)expect(r.height).toBeGreaterThanOrEqual(44);}
  expect(g.record.top).toBeGreaterThanOrEqual(g.bar.bottom);expect(g.record.height).toBeGreaterThanOrEqual(56);
  await expect(p.locator('.unified-caption').getByRole('button',{name:'共有',exact:true})).toHaveCount(0);
  await bar.getByRole('button',{name:'共有',exact:true}).click();await expect(bar.locator('output')).toHaveText(/URLをコピーしました|https?:/);
  await page.screenshot({path:`output/menu-search-20261107/export-${width}-${height}.png`});
 }
});
test('variation download contains only its current path without source result',async({page})=>{
 await disabledAnalysis(page);await page.goto(base);await count(page,1);const p=await startStudy(page);await p.getByRole('button',{name:'1手進む',exact:true}).click();await p.getByLabel('棋譜の出力形式').selectOption('csa');const event=page.waitForEvent('download');await p.getByRole('button',{name:'DL',exact:true}).click();const d=await event,t=await readFile((await d.path())!,'utf8');expect(d.suggestedFilename()).toContain('_変化.csa');expect(t).not.toMatch(/^%/m);const s=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('fgmv:study:v1')!));expect(t.split(/\r?\n/).filter(l=>/^[+-]\d{4}[A-Z]{2}$/.test(l))).toHaveLength(s.origin+1);
});
