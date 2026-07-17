import { expect, test } from '@playwright/test';

const basePath = '/floodgate-multi-viewer/';

test.beforeEach(async ({ page }) => {
  await page.goto(basePath);
  await page.evaluate(() => localStorage.clear());
});

test('1440x900で4局を表示し、1/2/4局を切り替える', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  const panels = page.getByTestId('boards').locator('.game-panel');
  await expect(panels).toHaveCount(4);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const panelBoxes = await panels.evaluateAll((items) => items.map((item) => {
    const box = item.getBoundingClientRect();
    return { left: box.left, top: box.top, bottom: box.bottom };
  }));
  expect(panelBoxes).toHaveLength(4);
  expect(panelBoxes.every(({ top, bottom }) => top >= 0 && bottom <= 900)).toBe(true);
  expect(Math.max(...panelBoxes.map(({ top }) => top)) - Math.min(...panelBoxes.map(({ top }) => top))).toBeLessThanOrEqual(2);
  expect(panelBoxes.map(({ left }) => left)).toEqual([...panelBoxes.map(({ left }) => left)].sort((a, b) => a - b));
  const verticalOverflow = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
  expect(verticalOverflow).toBeLessThanOrEqual(1);
  const boardBoxes = await page.locator('.shogi-board').evaluateAll((items) => items.map((item) => {
    const box = item.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  expect(boardBoxes).toHaveLength(4);
  expect(Math.min(...boardBoxes.map(({ width }) => width))).toBeGreaterThanOrEqual(285);
  expect(boardBoxes.every(({ width, height }) => Math.abs(width - height) <= 1)).toBe(true);
  await expect(page.locator('.last-to')).toHaveCount(4);
  await expect(page.locator('.last-move-text').first()).toContainText('直前手');

  await page.getByRole('button', { name: '1局' }).click();
  await expect(page.getByTestId('boards').locator('.game-panel')).toHaveCount(1);
  await page.getByRole('button', { name: '2局' }).click();
  await expect(page.getByTestId('boards').locator('.game-panel')).toHaveCount(2);
  await page.getByRole('button', { name: '4局' }).click();
  await expect(page.getByTestId('boards').locator('.game-panel')).toHaveCount(4);
});

test('PCの横長・低め画面でも4局を一列で画面内に収める', async ({ page }) => {
  for (const viewport of [
    { width: 1920, height: 900, minimumBoard: 360 },
    { width: 1280, height: 720, minimumBoard: 260 },
  ]) {
    await page.setViewportSize(viewport);
    await page.reload();
    const panels = page.getByTestId('boards').locator('.game-panel');
    await expect(panels).toHaveCount(4);
    const panelBoxes = await panels.evaluateAll((items) => items.map((item) => {
      const box = item.getBoundingClientRect();
      return { left: box.left, top: box.top, bottom: box.bottom };
    }));
    expect(Math.max(...panelBoxes.map(({ top }) => top)) - Math.min(...panelBoxes.map(({ top }) => top))).toBeLessThanOrEqual(2);
    expect(panelBoxes.map(({ left }) => left)).toEqual([...panelBoxes.map(({ left }) => left)].sort((a, b) => a - b));
    expect(panelBoxes.every(({ top, bottom }) => top >= 0 && bottom <= viewport.height)).toBe(true);
    const boardWidths = await page.locator('.shogi-board').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().width));
    expect(Math.min(...boardWidths)).toBeGreaterThanOrEqual(viewport.minimumBoard);
    const verticalOverflow = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
    expect(verticalOverflow).toBeLessThanOrEqual(1);
  }
});

test('単局拡大は盤面と主要操作をスクロールなしで表示する', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900, minimumBoard: 480 },
    { width: 1280, height: 720, minimumBoard: 350 },
  ]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await page.getByRole('button', { name: '単局拡大' }).first().click();
    const panel = page.locator('.game-panel.expanded');
    await expect(panel).toHaveCount(1);
    await expect(panel.getByRole('button', { name: '一覧へ戻る' })).toBeVisible();
    await expect(panel.getByText('再生・詳細', { exact: true })).toBeVisible();
    await expect(panel.locator('.connection')).toBeVisible();
    const boardWidth = await panel.locator('.shogi-board').evaluate((item) => item.getBoundingClientRect().width);
    expect(boardWidth).toBeGreaterThanOrEqual(viewport.minimumBoard);
    const panelBottom = await panel.evaluate((item) => item.getBoundingClientRect().bottom);
    expect(panelBottom).toBeLessThanOrEqual(viewport.height);
    const verticalOverflow = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
    expect(verticalOverflow).toBeLessThanOrEqual(1);

    await panel.getByText('再生・詳細', { exact: true }).click();
    const openPanelBottom = await panel.evaluate((item) => item.getBoundingClientRect().bottom);
    expect(openPanelBottom).toBeLessThanOrEqual(viewport.height);
  }
});

test('1024x768では4局を2x2でスクロールせず表示する', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.reload();
  const panels = page.getByTestId('boards').locator('.game-panel');
  await expect(panels).toHaveCount(4);
  const panelBoxes = await panels.evaluateAll((items) => items.map((item) => {
    const box = item.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom };
  }));
  expect(Math.abs(panelBoxes[0].top - panelBoxes[1].top)).toBeLessThanOrEqual(2);
  expect(Math.abs(panelBoxes[2].top - panelBoxes[3].top)).toBeLessThanOrEqual(2);
  expect(panelBoxes[2].top).toBeGreaterThan(panelBoxes[0].top);
  expect(panelBoxes.every(({ bottom }) => bottom <= 768)).toBe(true);
  const verticalOverflow = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
  expect(verticalOverflow).toBeLessThanOrEqual(1);
});

test('390x844では既定1局、2・4局選択時も縦一列で横にはみ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const panels = page.getByTestId('boards').locator('.game-panel');
  await expect(panels).toHaveCount(1);

  await page.getByRole('button', { name: '2局' }).click();
  await expect(panels).toHaveCount(2);
  const twoPanelTops = await panels.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
  expect(twoPanelTops[1]).toBeGreaterThan(twoPanelTops[0]);

  await page.getByRole('button', { name: '4局' }).click();
  await expect(panels).toHaveCount(4);
  const fourPanelTops = await panels.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
  expect(fourPanelTops.every((top, index) => index === 0 || top > fourPanelTops[index - 1])).toBe(true);

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});

test('過去対局を選び、手動移動・再生・棋譜クリックを操作できる', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.getByRole('button', { name: '過去対局' }).click();
  await expect(page.getByRole('heading', { name: '過去対局を探す' })).toBeVisible();
  await page.locator('.archive-list > button').first().click();

  const panel = page.locator('.game-panel').first();
  await expect(panel.getByText(/20手 \/ 20手/)).toBeVisible();
  await panel.getByText('再生・詳細', { exact: true }).click();
  await panel.getByRole('button', { name: '1手戻る' }).click();
  await expect(panel.getByText(/19手 \/ 20手/)).toBeVisible();
  await panel.getByRole('button', { name: '最初' }).click();
  await panel.getByLabel('任意再生速度（秒）').fill('0.1');
  await panel.getByRole('button', { name: '再生' }).click();
  await expect(panel.getByText(/1手 \/ 20手/)).toBeVisible({ timeout: 2_000 });
  await panel.getByRole('button', { name: /棋譜を表示/ }).click();
  await panel.getByRole('button', { name: /^5\./ }).click();
  await expect(panel.getByText(/5手 \/ 20手/)).toBeVisible();
});

test('盤面反転と設定をlocalStorageから復元する', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  const firstCell = page.locator('.game-panel').first().getByRole('gridcell').first();
  await expect(firstCell).toHaveAttribute('aria-label', /^91/);
  await page.locator('.game-panel').first().getByRole('button', { name: '盤面反転' }).click();
  await expect(firstCell).toHaveAttribute('aria-label', /^19/);
  await page.getByRole('button', { name: '2局' }).click();
  await page.getByLabel('配色').selectOption('dark');
  await page.reload();
  await expect(page.getByRole('button', { name: '2局' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.game-panel').first().getByRole('gridcell').first()).toHaveAttribute('aria-label', /^19/);
});

test('API障害時はfixtureへフォールバックし、Pagesサブパスで動作する', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`${basePath.replaceAll('/', '\\/')}$`));
  await expect(page.getByText('オフラインデータで表示中')).toBeVisible();
  await expect(page.locator('.game-panel').first().getByText('接続: fixture')).toBeVisible();
  await page.getByRole('button', { name: '1局' }).click();
  await expect(page.getByRole('link', { name: 'Floodgate 公開情報' })).toHaveAttribute('href', 'https://wdoor.c.u-tokyo.ac.jp/shogi/');
});
