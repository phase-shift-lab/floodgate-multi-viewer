import {expect,test} from '@playwright/test';
import {base,count,disabledAnalysis,settleBoard,tools} from './ui';

test('changing board count retains the selected instance and its move orientation and record scroll',async({page})=>{
 await disabledAnalysis(page);await page.setViewportSize({width:1440,height:600});await page.goto(base);await count(page,3);
 let p=page.locator('.unified-panel').nth(2);
 const firstId=await page.locator('.unified-panel').first().getByRole('button',{name:'対局を選ぶ',exact:true}).textContent();
 await tools(p);const selector=p.getByLabel('表示する対局');const sameGame=await selector.locator('option').first().getAttribute('value');
 await selector.selectOption(sameGame!);
 p=page.locator('.unified-panel').nth(2);await expect(p.getByRole('button',{name:'対局を選ぶ',exact:true})).toHaveText(firstId!);
 await p.locator('.move-list button').nth(1).click();await p.getByRole('button',{name:'盤面を反転',exact:true}).click();await settleBoard(p);
 await p.evaluate(el=>el.setAttribute('data-count-marker','selected-instance'));
 const scroll=await p.locator('.inline-record-scroll').evaluate(el=>{el.scrollTop=Math.min(70,el.scrollHeight-el.clientHeight);return el.scrollTop;});
 expect(scroll).toBeGreaterThan(0);
 for(const n of [1,3,2,4] as const) {
  await count(page,n);await expect(page.locator('.unified-panel')).toHaveCount(n);
  p=page.locator('.unified-panel').first();
  await expect(p).toHaveAttribute('data-count-marker','selected-instance');await expect(p).toHaveAttribute('data-selected','true');
  await expect(p.getByRole('button',{name:'対局を選ぶ',exact:true})).toHaveText(firstId!);
  await expect(p.locator('.shogi-board')).toHaveAttribute('aria-label','将棋盤 1手目');await expect(p.locator('.file-labels')).toHaveText('123456789');
  expect(await p.locator('.inline-record-scroll').evaluate(el=>el.scrollTop)).toBe(scroll);
 }
});

test('mate results preserve the manually scrolled record and selected move',async({page})=>{
 await disabledAnalysis(page);await page.setViewportSize({width:1440,height:600});
 // Deterministic USI responses exercise the UI transition independently of engine strength.
 await page.addInitScript(()=>{
  class MateWorker {
   onmessage:((event:{data:unknown})=>void)|null=null;
   timer:ReturnType<typeof setTimeout>|undefined;
   postMessage(message:{type:string;command?:string}) {
    if(message.type==='init')queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));
    if(message.command?.startsWith('go '))this.timer=setTimeout(()=>{
     this.onmessage?.({data:{type:'line',line:'info depth 8 multipv 1 score mate 1 pv 7776FU'}});
     this.onmessage?.({data:{type:'line',line:'bestmove 7776FU'}});
    },150);
    if(message.command==='stop'){clearTimeout(this.timer);queueMicrotask(()=>this.onmessage?.({data:{type:'line',line:'bestmove resign'}}));}
   }
   terminate(){clearTimeout(this.timer);}
  }
  window.Worker=MateWorker as unknown as typeof Worker;
 });
 await page.goto(base);await count(page,1);
 await page.locator('.workspace-analysis-controls').getByRole('button',{name:'解析',exact:true}).click();
 const panel=page.locator('.unified-panel').first();
 await expect(panel.getByRole('status',{name:'全棋譜解析の状態'})).toContainText('解析中',{timeout:45000});
 const selected=await panel.locator('.shogi-board').getAttribute('aria-label');
 const selectedRow=await panel.locator('.move-list [aria-current="step"] span').textContent();
 const scroller=panel.locator('.inline-record-scroll');
 await scroller.evaluate(el=>{el.scrollTop=70;el.dispatchEvent(new Event('scroll'));});
 expect(await scroller.evaluate(el=>el.scrollTop)).toBe(70);
 await expect(panel.getByRole('status',{name:'全棋譜解析の状態'})).toContainText('全棋譜の解析完了');
 await expect(panel.locator('.record-result-list b').first()).toContainText('詰');
 expect(await scroller.evaluate(el=>el.scrollTop)).toBe(70);
 await expect(panel.locator('.shogi-board')).toHaveAttribute('aria-label',selected!);
 await expect(panel.locator('.move-list [aria-current="step"] span')).toHaveText(selectedRow!);
});
