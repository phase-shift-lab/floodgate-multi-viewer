import {readFile} from 'node:fs/promises';
import {expect,test} from '@playwright/test';
import {base,count,disabledAnalysis,startStudy} from './ui';
test('inline record menu copies and downloads full KIF and CSA',async({page})=>{
 await disabledAnalysis(page);await page.goto(base);await count(page,1);const p=page.locator('.unified-panel');await p.locator('.record-actions > summary').click();for(const f of ['kif','csa']){await p.getByLabel('棋譜の出力形式').selectOption(f);const event=page.waitForEvent('download');await p.getByRole('button',{name:'棋譜DL',exact:true}).click();const d=await event,t=await readFile((await d.path())!,'utf8');expect(d.suggestedFilename()).toMatch(f==='kif'?/\.kifu$/:/\.csa$/);expect(t).toContain(f==='kif'?'12 ':'-8173KE');}await p.getByRole('button',{name:'棋譜コピー',exact:true}).click();await expect(p.locator('.record-export output')).toHaveText(/棋譜をコピーしました|コピーできませんでした/);
});
test('variation download contains only its current path without source result',async({page})=>{
 await disabledAnalysis(page);await page.goto(base);await count(page,1);const p=await startStudy(page);await p.getByRole('button',{name:'1手進む',exact:true}).click();await p.locator('.record-actions > summary').click();await p.getByLabel('棋譜の出力形式').selectOption('csa');const event=page.waitForEvent('download');await p.getByRole('button',{name:'棋譜DL',exact:true}).click();const d=await event,t=await readFile((await d.path())!,'utf8');expect(d.suggestedFilename()).toContain('_変化.csa');expect(t).not.toMatch(/^%/m);const s=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('fgmv:study:v1')!));expect(t.split(/\r?\n/).filter(l=>/^[+-]\d{4}[A-Z]{2}$/.test(l))).toHaveLength(s.origin+1);
});
