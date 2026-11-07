import {expect,test} from '@playwright/test';
import {base,count,disabledAnalysis,tools,settleBoard,settings} from './ui';
test('real engine shows integrated score and Japanese PV and restores explicit OFF',async({page})=>{
 await page.goto(base);const p=page.locator('.unified-panel').first();await expect(p.locator('.evaluation-status')).toHaveText('解析完了',{timeout:45000});await expect(p.locator('.evaluation-number')).not.toHaveText('—');await expect(p.locator('.integrated-pv strong')).toHaveText(/^[▲△]/);await expect(p.locator('.integrated-pv p')).toContainText('→');await p.getByRole('button',{name:'読み筋と他の候補を開く'}).click();await p.getByRole('button',{name:'端末で解析 ON',exact:true}).click();await page.reload();await expect(page.locator('.unified-panel').first().locator('.evaluation-status')).toHaveText('解析OFF');
});
test('desktop defaults to three, count and layout choices persist',async({page})=>{
 await disabledAnalysis(page);await page.goto(base);await expect(page.locator('.unified-panel')).toHaveCount(3);for(const n of [1,2,3,4] as const){await count(page,n);await expect(page.locator('.unified-panel')).toHaveCount(n);}await page.getByLabel('配置',{exact:true}).selectOption('stack');await page.reload();await expect(page.getByLabel('配置',{exact:true})).toHaveValue('stack');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
});

test('phone keeps the selected count and shared counts do not overwrite it',async({page})=>{
 await disabledAnalysis(page);await page.setViewportSize({width:393,height:852});await page.goto(base);await expect(page.locator('.unified-panel')).toHaveCount(1);
 await count(page,2);await page.reload();await expect(page.locator('.unified-panel')).toHaveCount(2);
 await page.goto(base+'?boards=1');await expect(page.locator('.unified-panel')).toHaveCount(1);
 await page.goto(base);await expect(page.locator('.unified-panel')).toHaveCount(2);
});

test('game selection is prominent and duplicate menu buttons stay removed',async({page})=>{
 await disabledAnalysis(page);await page.goto(base);const p=page.locator('.unified-panel').first();await p.getByRole('button',{name:'対局を選ぶ',exact:true}).click();
 const titleButton=p.getByRole('button',{name:'対局を選ぶ',exact:true});expect((await titleButton.boundingBox())!.height).toBeGreaterThanOrEqual(44);expect(await titleButton.evaluate(el=>parseFloat(getComputedStyle(el).borderTopWidth))).toBeGreaterThan(0);
 const menu=p.locator('.board-tools-content');await expect(menu.getByLabel('表示する対局')).toBeVisible();
 expect((await menu.getByLabel('表示する対局').boundingBox())!.height).toBeGreaterThanOrEqual(48);
 await expect(menu.getByRole('button')).toHaveCount(1);
 await expect(menu.getByRole('button',{name:'再生',exact:true})).toBeVisible();await expect(menu.getByRole('button',{name:'ピン留め',exact:true})).not.toBeVisible();
 for(const name of ['反転','共有','最初','最新'])await expect(menu.getByRole('button',{name,exact:true})).toHaveCount(0);
});
test('PC one two four boards stay square and controls align with the board',async({page})=>{
 await disabledAnalysis(page);await page.goto(base);for(const w of [1440,1920]){await page.setViewportSize({width:w,height:1080});for(const n of [1,2,3,4] as const){await count(page,n);await settleBoard(page.locator('.unified-panel').first());const g=await page.locator('.unified-panel').evaluateAll(els=>els.map(el=>{const b=el.querySelector('.shogi-board')!.getBoundingClientRect(),c=el.querySelector('.board-controls')!.getBoundingClientRect();return{square:Math.abs(b.width-b.height),left:Math.abs(b.left-c.left),right:Math.abs(b.right-c.right)};}));for(const a of g){expect(a.square).toBeLessThanOrEqual(1);expect(a.left).toBeLessThanOrEqual(1);expect(a.right).toBeLessThanOrEqual(1);}expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}}
});
test('phone defaults to one and board hands controls and record fit short and tall screens',async({page})=>{
 await disabledAnalysis(page);for(const v of [{width:320,height:568},{width:393,height:852},{width:430,height:740}]){await page.setViewportSize(v);await page.goto(base);await expect(page.locator('.unified-panel')).toHaveCount(1);await settleBoard(page.locator('.unified-panel'));const g=await page.locator('.unified-panel').evaluate(el=>({h:innerHeight,scroll:document.documentElement.scrollHeight,w:document.documentElement.scrollWidth,viewport:innerWidth,parts:[...el.querySelectorAll('.shogi-board,.hand,.board-player,.board-controls,.workspace-record')].map(e=>e.getBoundingClientRect().toJSON())}));expect(g.w).toBeLessThanOrEqual(g.viewport);expect(g.scroll).toBeLessThanOrEqual(g.h+1);for(const r of g.parts){expect(r.top).toBeGreaterThanOrEqual(0);expect(r.bottom).toBeLessThanOrEqual(g.h+1);}}
});
test('menu retains pin flip replay share favorite expand and settings',async({page})=>{
 await disabledAnalysis(page);await page.goto(base);const p=page.locator('.unified-panel').first();await tools(p);await p.getByRole('button',{name:'ピン留め',exact:true}).click();await tools(p);await expect(p.getByRole('button',{name:'ピン解除'})).toHaveAttribute('aria-pressed','true');await p.locator('.integrated-controls').getByRole('button',{name:'盤面を反転',exact:true}).click();await expect(p.locator('.file-labels')).toHaveText('123456789');await p.locator('.star').first().click();await expect(p.locator('.star').first()).toHaveText('★');await tools(p);await p.getByRole('button',{name:'単局拡大'}).click();await expect(page.locator('.unified-panel')).toHaveCount(1);await tools(page.locator('.unified-panel'));await page.getByRole('button',{name:'一覧へ戻る'}).click();await expect(page.locator('.unified-panel')).toHaveCount(3);await settings(p);await expect(p.getByLabel('任意再生速度（秒）')).toBeVisible();
});
test('archive selection, record picking and replay work',async({page})=>{
 await disabledAnalysis(page);await page.goto(base);await page.getByRole('button',{name:'過去対局',exact:true}).click();await expect(page.locator('.archive-search')).toBeVisible();await page.locator('.archive-list button').first().click();const p=page.locator('.unified-panel').first();await p.locator('.move-list button').nth(1).click();await expect(p.locator('.shogi-board')).toHaveAttribute('aria-label','将棋盤 1手目');await tools(p);await p.getByRole('button',{name:'再生',exact:true}).click();await expect(p.locator('.shogi-board')).not.toHaveAttribute('aria-label','将棋盤 1手目');
});

test('archive search conditions persist across reloads on desktop and phone',async({page})=>{
 await disabledAnalysis(page);
 for(const width of [1440,393]) {
  await page.setViewportSize({width,height:852});await page.goto(base+'?view=archive');
  await page.getByLabel('AI名',{exact:true}).fill('Target');await page.getByLabel('日付',{exact:true}).fill('2026-11-06');
  const group=await page.getByRole('combobox',{name:'対局グループ',exact:true}).locator('option').nth(1).getAttribute('value')??await page.getByRole('combobox',{name:'対局グループ',exact:true}).locator('option').nth(1).textContent();
  await page.getByRole('combobox',{name:'対局グループ',exact:true}).selectOption(group!);await page.getByRole('combobox',{name:'結果',exact:true}).selectOption('後手');
  await page.getByLabel('レート下限（両者）').fill('2500');await page.getByLabel('レート上限（両者）').fill('4000');
  await page.getByRole('combobox',{name:'並び順',exact:true}).selectOption('high');await page.getByLabel('お気に入りAIのみ').check();
  await page.reload();
  await expect(page.getByLabel('AI名',{exact:true})).toHaveValue('Target');await expect(page.getByLabel('日付',{exact:true})).toHaveValue('2026-11-06');
  await expect(page.getByRole('combobox',{name:'対局グループ',exact:true})).toHaveValue(group!);await expect(page.getByRole('combobox',{name:'結果',exact:true})).toHaveValue('後手');
  await expect(page.getByLabel('レート下限（両者）')).toHaveValue('2500');await expect(page.getByLabel('レート上限（両者）')).toHaveValue('4000');
  await expect(page.getByRole('combobox',{name:'並び順',exact:true})).toHaveValue('high');await expect(page.getByLabel('お気に入りAIのみ')).toBeChecked();
  await page.getByLabel('レート下限（両者）').fill('');await page.getByLabel('レート上限（両者）').fill('');await page.reload();
  await expect(page.getByLabel('レート下限（両者）')).toHaveValue('');await expect(page.getByLabel('レート上限（両者）')).toHaveValue('');
 }
});
