import {expect,test} from '@playwright/test';
import {base,count,disabledAnalysis,settleBoard,startStudy} from './ui';

test('compact layout fits phones and PC rows while retaining a readable side record',async({page})=>{
 test.setTimeout(90000);
 await disabledAnalysis(page);
 for(const [width,height] of [[1920,1080],[1800,900],[1799,900],[1440,900],[1280,720],[768,900],[320,568],[393,568],[393,852],[430,740]]){
  await page.setViewportSize({width,height});await page.goto(base);
  for(const n of width>=768?[1,2,3,4] as const:[1] as const){
   await count(page,n);await expect(page.locator('.unified-panel')).toHaveCount(n);await settleBoard(page.locator('.unified-panel').first());
   const measured=await page.locator('.unified-panel').evaluateAll(els=>els.map(el=>{
    const rect=(e:Element)=>e.getBoundingClientRect().toJSON();
    return {panel:rect(el),board:rect(el.querySelector('.shogi-board')!),record:rect(el.querySelector('.workspace-record')!),parts:[...el.querySelectorAll('.board-player,.hand,.board-controls,.workspace-record')].map(rect)};
   }));
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
   const chrome=await page.locator('.site-header').evaluate(el=>({header:el.getBoundingClientRect().toJSON(),toolbar:el.querySelector('.workspace-toolbar')!.getBoundingClientRect().toJSON()}));
   expect(chrome.toolbar.top).toBeGreaterThanOrEqual(chrome.header.top);expect(chrome.toolbar.bottom).toBeLessThanOrEqual(chrome.header.bottom);
   for(const g of measured){
    expect(Math.abs(g.board.width-g.board.height)).toBeLessThanOrEqual(1);
    for(const r of [g.board,...g.parts]){expect(r.left).toBeGreaterThanOrEqual(g.panel.left-1);expect(r.right).toBeLessThanOrEqual(g.panel.right+1);expect(r.top).toBeGreaterThanOrEqual(g.panel.top-1);expect(r.bottom).toBeLessThanOrEqual(g.panel.bottom+1);}
    if(n===1)for(const r of [g.board,...g.parts]){expect(r.top).toBeGreaterThanOrEqual(0);expect(r.bottom).toBeLessThanOrEqual(height+1);}
   }
   if(width>=1800&&n===3){expect(new Set(measured.map(g=>Math.round(g.panel.top))).size).toBe(1);for(const g of measured){expect(g.record.left).toBeGreaterThan(g.board.right);expect(g.record.width).toBeGreaterThanOrEqual(160);expect(g.record.width).toBeLessThanOrEqual(180);expect(g.board.width).toBeGreaterThan(300);}}
   if(width===1799&&n===3)expect(measured[2].panel.top).toBeGreaterThan(measured[0].panel.top);
   if(width<768){expect(measured[0].board.width).toBeGreaterThanOrEqual(190);expect(await page.locator('.inline-record-scroll').evaluate(el=>el.clientHeight)).toBeGreaterThanOrEqual(56);}
   if((width===1920&&n===3)||(width===320&&n===1)||(width===393&&height===852&&n===1))await page.screenshot({path:`output/compact-workspace-implementation/${width}-${height}-${n}.png`});
  }
 }
});

test('three slots survive study return and record branches resume with validation after reload',async({page})=>{
 await disabledAnalysis(page);await page.goto(base);await count(page,3);let p=page.locator('.unified-panel').first();
 await p.locator('.integrated-controls').getByRole('button',{name:'最初',exact:true}).click();
 const study=await startStudy(page,p);await study.getByRole('button',{name:'1手進む',exact:true}).click();
 const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('fgmv:study:v1')!));
 await study.locator('.branch-source').click();await expect(page.locator('.unified-panel')).toHaveCount(3);
 p=page.locator('.unified-panel').first();await p.locator('.record-branch').first().click();
 await expect(page.locator('.is-studying')).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('fgmv:study:v1')!).current)).toBe(saved.current);
 await page.reload();await expect(page.locator('.is-studying')).toHaveCount(0);await expect(page.getByLabel('表示局数')).toHaveValue('3');
 await page.locator('.unified-panel').first().locator('.record-branch').click();await expect(page.locator('.is-studying')).toBeVisible();
 await expect(page.locator('.integrated-controls button')).toHaveText(['⏮','←','→','⏭','反転']);
});
