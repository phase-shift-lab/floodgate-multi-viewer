import { expect, test } from '@playwright/test';
import { base, startStudy, tools } from './ui';

test.use({viewport:{width:393,height:852}});

test('slow preparation survives a move and restores the latest displayed ply after one reload',async({page})=>{
 let navigations=0;page.on('request',request=>{if(request.isNavigationRequest() && request.resourceType()==='document')navigations++;});
 await page.addInitScript(()=>{
  if(sessionStorage.getItem('delayed-start-once'))return;
  sessionStorage.setItem('delayed-start-once','1');
  const original=navigator.serviceWorker.register.bind(navigator.serviceWorker);
  navigator.serviceWorker.register=async(...args)=>{
   document.documentElement.dataset.preparationStarted='true';
   await new Promise(resolve=>setTimeout(resolve,2000));
   return original(...args);
  };
 });
 await page.goto(base);const panel=page.locator('.unified-panel');
 await page.waitForFunction(()=>document.documentElement.dataset.preparationStarted==='true');
 await panel.getByRole('button',{name:'1手戻る'}).click();
 const expected=await panel.getByLabel('現在手数').textContent();
 await expect(panel.locator('.evaluation-status')).toHaveText('準備中');
 await expect(panel.locator('.evaluation-status')).toHaveText('解析完了',{timeout:45000});
 await expect(panel.getByLabel('現在手数')).toHaveText(expected!);
 await expect(panel.locator('.evaluation-number')).not.toHaveText('—');
 await expect(panel.locator('.analysis-error')).toHaveCount(0);
 expect(navigations).toBe(2);
});

test('startup error is visible and one explicit retry starts real analysis',async({page})=>{
 await page.addInitScript(()=>{
  const original=navigator.serviceWorker.register.bind(navigator.serviceWorker);
  navigator.serviceWorker.register=(...args)=>{
   if(!sessionStorage.getItem('reject-setup-once')){
    sessionStorage.setItem('reject-setup-once','1');
    return Promise.reject(new Error('test: registration denied'));
   }
   return original(...args);
  };
 });
 await page.goto(base);const panel=page.locator('.unified-panel');
 await expect(panel.locator('.evaluation-status')).toHaveText('解析停止');
 await panel.getByRole('button',{name:'1手戻る'}).click();
 await expect(panel.locator('.evaluation-status')).toHaveText('解析停止');
 await panel.getByRole('button',{name:'解析を再試行'}).click();
 await expect(panel.locator('.evaluation-status')).toHaveText('解析完了',{timeout:45000});
 await expect(panel.locator('.evaluation-number')).not.toHaveText('—');
});

test('study moves made during preparation survive reload and resume analysis',async({page})=>{
 await page.addInitScript(()=>{
  if(sessionStorage.getItem('study-setup-gate'))return;
  localStorage.setItem('fgmv:analysis:v1',JSON.stringify({disabled:true}));
  const original=navigator.serviceWorker.register.bind(navigator.serviceWorker);
  navigator.serviceWorker.register=async(...args)=>{
   sessionStorage.setItem('study-setup-gate','1');
   document.documentElement.dataset.preparationStarted='true';
   await new Promise<void>(resolve=>{
    const check=()=>{if(document.documentElement.dataset.releasePreparation==='true')resolve();else requestAnimationFrame(check);};check();
   });
   return original(...args);
  };
 });
 await page.goto(base);const panel=page.locator('.unified-panel');
 await tools(panel);await panel.locator('.board-tools-content').getByRole('button',{name:'最初',exact:true}).click();
 const study=await startStudy(page,panel);
 await study.locator('.integrated-candidates summary').click();
 await study.getByRole('button',{name:'端末で解析 OFF',exact:true}).click();
 await page.waitForFunction(()=>document.documentElement.dataset.preparationStarted==='true');
 await study.locator('.integrated-candidates summary').click();
 await study.locator('[data-square="77"]').click();await study.locator('[data-square="76"]').click();
 await expect(study.locator('.study-badge')).toHaveText('検討中');
 await expect(study.getByLabel('現在手数')).toHaveText('1 / 1手');
 await page.evaluate(()=>{document.documentElement.dataset.releasePreparation='true';});
 await expect(page.locator('.is-studying .evaluation-status')).toHaveText('解析完了',{timeout:45000});
 await expect(page.locator('.is-studying [data-square="76"]')).toContainText('歩');
 await expect(page.locator('.is-studying [data-square="77"]')).toBeEmpty();
 await expect(page.locator('.is-studying').getByLabel('現在手数')).toHaveText('1 / 1手');
});
