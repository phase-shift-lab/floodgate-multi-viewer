import {expect,test,type Locator} from '@playwright/test';
import {base,count,disabledAnalysis,startStudy,tools} from './ui';

const viewports=[[1920,1080],[1440,900],[1280,720],[393,852],[320,568],[852,393]];
async function geometry(dialog:Locator) {
 return dialog.evaluate(el=>{
  const box=el.getBoundingClientRect(),pane=el.querySelector<HTMLElement>('.record-pane')!,p=pane.getBoundingClientRect();
  const scrolls=[...el.querySelectorAll<HTMLElement>('*')].filter(item=>['auto','scroll'].includes(getComputedStyle(item).overflowY)&&item.scrollHeight>item.clientHeight+1);
  const controls=[...el.querySelectorAll<HTMLElement>('.board-dialog-header button,.board-dialog-header select,.record-toolbar button,.record-toolbar select')].filter(item=>item.getBoundingClientRect().width);
  return {width:box.width,height:box.height,paneHeight:p.height,scrolls:scrolls.map(item=>item.className),overflow:el.scrollWidth>el.clientWidth+1||pane.scrollWidth>pane.clientWidth+1,
   controlOverflow:controls.some(item=>{const r=item.getBoundingClientRect();return r.left<box.left||r.right>box.right+1;}),
   widths:[...el.querySelectorAll('.record-kind button')].map(item=>item.getBoundingClientRect().width),
   listWidth:el.querySelector('.record-list')!.getBoundingClientRect().width,
   positionRight:el.querySelector('.record-position')!.getBoundingClientRect().left>=el.querySelector('.record-list')!.getBoundingClientRect().right,
   toolbarCenters:[...el.querySelectorAll('.record-toolbar button,.record-toolbar select')].map(item=>{const r=item.getBoundingClientRect();return r.y+r.height/2;})};
 });
}
async function check(dialog:Locator,width:number,height:number,zoom:boolean) {
 const m=await geometry(dialog);
 expect(m.width).toBeLessThanOrEqual(Math.min(width*.8,1000)+1);expect(m.height).toBeLessThanOrEqual(height*.8+1);
 expect(m.paneHeight).toBeGreaterThan(44);expect(m.overflow).toBe(false);expect(m.controlOverflow).toBe(false);
 expect(m.scrolls.every(name=>name==='record-pane')).toBe(true);expect(m.scrolls.length).toBeLessThanOrEqual(1);
 for(const buttonWidth of m.widths)expect(buttonWidth).toBeLessThanOrEqual(100);
 if(width>=1280){expect(m.width).toBeGreaterThanOrEqual(999);for(const buttonWidth of m.widths)expect(buttonWidth).toBeGreaterThanOrEqual(90);expect(m.listWidth).toBeGreaterThanOrEqual(320);expect(m.listWidth).toBeLessThanOrEqual(360);expect(m.positionRight).toBe(true);}
 if(!zoom)expect(Math.max(...m.toolbarCenters)-Math.min(...m.toolbarCenters)).toBeLessThanOrEqual(1);
}
test('record uses available height with one scroller and compact controls on PC, phones, landscape and text zoom',async({page})=>{
 test.setTimeout(60_000);
 await disabledAnalysis(page);await page.goto(base);await page.locator('.shogi-board').first().waitFor();await count(page,1);
 await page.getByRole('button',{name:'棋譜を開く'}).click();const dialog=page.getByRole('dialog',{name:'棋譜',exact:true});
 for(const zoom of [false,true]) {
  await page.evaluate(value=>document.documentElement.style.fontSize=value?'200%':'',zoom);
  for(const [width,height] of viewports) {
   await page.setViewportSize({width,height});await check(dialog,width,height,zoom);
   await dialog.locator('.record-pane').evaluate(el=>{el.scrollTop=el.scrollHeight;});
   const bottomGap=await dialog.locator('.record-pane').evaluate(el=>el.getBoundingClientRect().bottom-el.querySelector('.record-analysis-note')!.getBoundingClientRect().bottom);
   expect(bottomGap).toBeLessThanOrEqual(24);
   if(!zoom&&(width===1920||width===393))await page.screenshot({path:`output/playwright/record-responsive/record-${width}.png`});
  }
 }
});
test('short variations and analysis results fit the same bounded single-scroll layout',async({page})=>{
 test.setTimeout(60_000);
 await disabledAnalysis(page);await page.goto(base);await page.locator('.shogi-board').first().waitFor();await count(page,1);
 const panel=page.locator('.unified-panel');await tools(panel);await panel.getByRole('button',{name:'最初',exact:true}).click();
 const study=await startStudy(page);await study.getByRole('button',{name:'1手進む',exact:true}).click();await study.getByRole('button',{name:'棋譜を開く'}).click();
 const dialog=page.getByRole('dialog',{name:'棋譜',exact:true});await page.setViewportSize({width:1440,height:900});
 expect((await geometry(dialog)).height).toBeLessThanOrEqual(720);
 await expect(dialog.locator('.move-list button')).toHaveCount(2);
 await expect(dialog.getByRole('grid')).toHaveAttribute('aria-label','将棋盤 1手目');
 await study.getByRole('button',{name:'解析',exact:true}).click();
 await expect(page.getByRole('status',{name:'全棋譜解析の状態'})).toContainText('全棋譜の解析完了',{timeout:45_000});
 for(const zoom of [false,true]) {
  await page.evaluate(value=>document.documentElement.style.fontSize=value?'200%':'',zoom);
  for(const [width,height] of viewports) {
   await page.setViewportSize({width,height});await check(dialog,width,height,zoom);
   const views=dialog.getByRole('group',{name:'解析結果の表示'});
   if(await views.isVisible()) {
    await views.getByRole('button',{name:'選択局面・読み筋',exact:true}).click();await check(dialog,width,height,zoom);
    await views.getByRole('button',{name:'棋譜一覧',exact:true}).click();
   }
   if(!zoom&&width===393)await page.screenshot({path:'output/playwright/record-responsive/analysis-mobile.png'});
  }
 }
});
