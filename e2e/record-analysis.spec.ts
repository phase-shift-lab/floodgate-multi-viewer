import {expect,test} from '@playwright/test';
import {base,count,disabledAnalysis,startStudy,tools} from './ui';

test.beforeEach(async({page})=>{
  await disabledAnalysis(page);await page.goto(base);await page.locator('.shogi-board').first().waitFor();await count(page,1);
});

test('full-record analysis prepares once, completes all frozen positions and shows readable results on mobile and PC',async({page})=>{
  test.setTimeout(90_000);
  const panel=page.locator('.unified-panel');
  await panel.getByRole('button',{name:'棋譜を開く'}).click();
  let analysis=page.getByRole('region',{name:'全棋譜解析'});
  await expect(analysis.getByRole('progressbar')).toHaveCount(0);
  await expect(panel.getByRole('tablist')).toHaveCount(0);
  await expect(panel.getByRole('dialog',{name:'棋譜',exact:true})).toBeVisible();
  await expect(panel.locator('.board-controls button')).toHaveText(['反転','再生','←','→','棋譜']);
  await expect(analysis.getByLabel('全棋譜の解析時間')).toHaveValue('1');
  const rows=await analysis.locator('.move-list button').count();
  await analysis.getByRole('button',{name:'解析',exact:true}).click();
  // A first-time Service Worker/COOP reload must restore the explicitly requested run.
  analysis=page.getByRole('region',{name:'全棋譜解析'});
  await expect(analysis.getByRole('status',{name:'全棋譜解析の状態'})).toContainText('全棋譜の解析完了',{timeout:65_000});
  await expect(analysis.getByRole('progressbar')).toHaveAttribute('value',String(rows));
  await analysis.locator('.record-result-list button').nth(1).click();
  await expect(analysis.getByRole('grid')).toHaveAttribute('aria-label','将棋盤 1手目');
  await expect(analysis.getByLabel('選択局面の解析評価値')).not.toHaveText('未解析');
  await expect(analysis.locator('.record-pv li').first()).toContainText('第1候補');
  for(const width of [320,393,1440]) {
    await page.setViewportSize({width,height:900});
    const geometry=await page.getByRole('dialog').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth+1,bodyOverflow:el.querySelector('.board-dialog-body')!.scrollWidth>el.querySelector('.board-dialog-body')!.clientWidth+1}));
    expect(geometry.width).toBeLessThanOrEqual(width*.81);expect(geometry.height).toBeLessThanOrEqual(900*.81);
    expect(geometry.overflow).toBe(false);expect(geometry.bodyOverflow).toBe(false);
    if(width!==320)await page.screenshot({path:`output/playwright/record-analysis/results-${width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:393,height:900});
  await analysis.getByRole('button',{name:'棋譜一覧',exact:true}).click();
  await expect(analysis.locator('.record-result-list')).toBeVisible();
  await expect(analysis.locator('.record-position')).toBeHidden();
  await page.screenshot({path:'output/playwright/record-analysis/list-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'閉じる',exact:true}).click();
  await panel.locator('.board-controls').screenshot({path:'output/playwright/record-analysis/controls-mobile.png'});
  await panel.getByRole('button',{name:'棋譜を開く'}).click();
  await expect(analysis.getByRole('progressbar')).toHaveAttribute('value',String(rows));
});

test('closing stops a run, reopening keeps completed results and resume finishes it',async({page})=>{
  test.setTimeout(90_000);
  await page.locator('.unified-panel').getByRole('button',{name:'棋譜を開く'}).click();
  const analysis=page.getByRole('region',{name:'全棋譜解析'});
  await analysis.getByRole('button',{name:'解析',exact:true}).click();
  await expect(analysis.getByRole('progressbar')).not.toHaveAttribute('value','0',{timeout:45_000});
  await page.getByRole('button',{name:'閉じる',exact:true}).click();
  await page.locator('.unified-panel').getByRole('button',{name:'棋譜を開く'}).click();
  await expect(analysis.getByRole('status',{name:'全棋譜解析の状態'})).toContainText('停止中');
  const saved=Number(await analysis.getByRole('progressbar').getAttribute('value'));expect(saved).toBeGreaterThan(0);
  await analysis.getByRole('button',{name:'再開'}).click();
  await expect(analysis.getByRole('status',{name:'全棋譜解析の状態'})).toContainText('全棋譜の解析完了',{timeout:40_000});
});

test('study analysis uses the selected variation path including its first move',async({page})=>{
  test.setTimeout(60_000);
  const panel=page.locator('.unified-panel');await tools(panel);await page.getByRole('button',{name:'最初',exact:true}).click();
  const study=await startStudy(page);
  await study.getByRole('button',{name:'1手進む',exact:true}).click();
  await study.getByRole('button',{name:'棋譜を開く'}).click();
  const analysis=page.getByRole('region',{name:'全棋譜解析'});
  await expect(analysis.locator('.move-list button')).toHaveCount(2);
  await analysis.getByRole('button',{name:'解析',exact:true}).click();
  await expect(analysis.getByRole('status',{name:'全棋譜解析の状態'})).toContainText('全棋譜の解析完了',{timeout:45_000});
  await analysis.locator('.record-result-list button').nth(1).click();
  await expect(analysis.getByRole('grid')).toHaveAttribute('aria-label','将棋盤 1手目');
});

test('preparation reload restores source analysis in study without switching to the variation',async({page})=>{
  test.setTimeout(60_000);
  const panel=page.locator('.unified-panel');await tools(panel);await page.getByRole('button',{name:'最初',exact:true}).click();
  const study=await startStudy(page);await study.getByRole('button',{name:'棋譜を開く'}).click();
  await study.getByRole('group',{name:'棋譜の種類'}).getByRole('button',{name:'本譜',exact:true}).click();
  const rows=await study.locator('.move-list button').count();expect(rows).toBeGreaterThan(2);
  await study.getByRole('button',{name:'解析',exact:true}).click();
  const analysis=page.getByRole('region',{name:'全棋譜解析'});
  await expect(analysis.getByRole('progressbar')).not.toHaveAttribute('value','0',{timeout:45_000});
  await expect(analysis.getByRole('progressbar')).toHaveAttribute('max',String(rows));
  await expect(analysis.getByRole('group',{name:'棋譜の種類'}).getByRole('button',{name:'本譜',exact:true})).toHaveAttribute('aria-pressed','true');
  await analysis.getByRole('button',{name:'停止',exact:true}).click();
  await expect(analysis.getByRole('status',{name:'全棋譜解析の状態'})).toContainText('停止中');
});
