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
    return { top: box.top, bottom: box.bottom };
  }));
  expect(panelBoxes).toHaveLength(4);
  expect(panelBoxes.every(({ top, bottom }) => top >= 0 && bottom <= 900)).toBe(true);
  expect(panelBoxes[2].top).toBeGreaterThan(panelBoxes[0].top);

  await page.getByRole('button', { name: '1局' }).click();
  await expect(page.getByTestId('boards').locator('.game-panel')).toHaveCount(1);
  await page.getByRole('button', { name: '2局' }).click();
  await expect(page.getByTestId('boards').locator('.game-panel')).toHaveCount(2);
  await page.getByRole('button', { name: '4局' }).click();
  await expect(page.getByTestId('boards').locator('.game-panel')).toHaveCount(4);
});

test('390x844では既定1局で横方向にはみ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId('boards').locator('.game-panel')).toHaveCount(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('過去対局を選び、手動移動・再生・棋譜クリックを操作できる', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.getByRole('button', { name: '過去対局' }).click();
  await expect(page.getByRole('heading', { name: '過去対局を探す' })).toBeVisible();
  await page.locator('.archive-list > button').first().click();

  const panel = page.locator('.game-panel').first();
  await expect(panel.getByText(/20手 \/ 20手/)).toBeVisible();
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
  await expect(page.getByRole('link', { name: 'Floodgate 公開情報' })).toHaveAttribute('href', 'https://wdoor.c.u-tokyo.ac.jp/shogi/');
});
