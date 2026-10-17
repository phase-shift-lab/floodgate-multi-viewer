import { expect, test } from '@playwright/test';

test('持駒0・1・2・18枚と通常評価・詰み表示で盤面と操作欄がずれない', async ({ page }) => {
  await page.goto('/floodgate-multi-viewer/');
  await expect(page.locator('.evaluation-status').first()).toHaveText('解析完了', { timeout: 45_000 });
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll((links) =>
    links.map((link) => `<link rel="stylesheet" href="${(link as HTMLLinkElement).href}">`).join(''),
  );
  const commentary = await page.locator('.commentary-row').first().evaluate((element) => element.outerHTML);
  const board = await page.locator('.board-wrap').first().evaluate((element) => element.outerHTML);
  const heldPieces = await page.locator('.hand:has(.hand-piece)').first().innerHTML();

  // Reuse real rendered markup for layout-only fixtures, independently of engine output.
  for (const layout of [
    { width: 1440, height: 900, count: 1, name: 'single' },
    { width: 1440, height: 900, count: 1, name: 'expanded' },
    { width: 1280, height: 720, count: 2, name: 'two' },
    { width: 1920, height: 900, count: 4, name: 'four' },
    { width: 1280, height: 720, count: 4, name: 'four' },
    { width: 1024, height: 768, count: 4, name: 'four' },
    { width: 390, height: 844, count: 1, name: 'single' },
  ]) {
    await page.setViewportSize(layout);
    const viewClass = layout.name === 'expanded' ? 'expanded-view' : `${layout.name}-board-view`;
    const mainClass = layout.name === 'expanded' ? 'expanded-main' : `${layout.name}-board-main`;
    const panelClass = layout.name === 'expanded' ? 'game-panel expanded' : 'game-panel';
    for (const flipped of [false, true]) {
      let baseline: { handHeight: number; boardTop: number; controlsTop: number; evaluationHeight: number } | undefined;
      for (const count of [0, 1, 2, 18]) {
        await page.setContent(`${styles}<div class="app-shell ${viewClass}"><main class="${mainClass}"><div class="boards count-${layout.count}"><article class="${panelClass}">${commentary}${board}<div class="top-control-shelf">操作欄</div></article></div></main></div>`);
        const geometry = await page.locator('.game-panel').evaluate((panel, { count, flipped, heldPieces }) => {
          for (const [index, rack] of [...panel.querySelectorAll('.hand')].entries()) {
            const black = flipped ? index === 0 : index === 1;
            const quantity = black ? count : 1;
            rack.setAttribute('aria-label', black ? '先手の持駒' : '後手の持駒');
            rack.innerHTML = quantity ? heldPieces : '<span class="hand-empty">持駒なし</span>';
            if (!quantity) continue;
            const item = rack.querySelector('.hand-piece-item')!;
            rack.querySelector('.hand-pieces')!.replaceChildren(item);
            const piece = item.querySelector('.hand-piece')!;
            piece.textContent = '歩';
            piece.classList.toggle('upside', index === 0);
            const countRow = item.querySelector('.hand-count-row')!;
            countRow.replaceChildren();
            if (quantity > 1) {
              const badge = document.createElement('span');
              badge.className = 'hand-count';
              badge.textContent = String(quantity);
              countRow.append(badge);
            }
          }
          const output = panel.querySelector<HTMLElement>('.evaluation-number')!;
          output.dataset.kind = count === 2 ? 'mate' : 'cp';
          output.textContent = count === 2 ? '後手の詰み 1手' : '+123';
          panel.querySelector('.evaluation-leader')!.textContent = count === 2 ? '詰み' : '先手リード';
          const hand = panel.querySelector<HTMLElement>('[aria-label="先手の持駒"]')!;
          const handBox = hand.getBoundingClientRect();
          const piece = hand.querySelector('.hand-piece')?.getBoundingClientRect();
          const badge = hand.querySelector('.hand-count')?.getBoundingClientRect();
          return {
            handHeight: handBox.height,
            boardTop: panel.querySelector('.shogi-board')!.getBoundingClientRect().top,
            controlsTop: panel.querySelector('.top-control-shelf')!.getBoundingClientRect().top,
            evaluationHeight: panel.querySelector('.local-evaluation')!.getBoundingClientRect().height,
            pieceBottom: piece?.bottom,
            badgeTop: badge?.top,
            badgeBottom: badge?.bottom,
            handBottom: handBox.bottom,
          };
        }, { count, flipped, heldPieces });
        if (!baseline) baseline = geometry;
        for (const key of ['handHeight', 'boardTop', 'controlsTop', 'evaluationHeight'] as const) {
          expect(Math.abs(geometry[key] - baseline[key]), `${layout.width}px / ${layout.count}局 / 反転${flipped} / ${count}枚 / ${key}`).toBeLessThanOrEqual(1);
        }
        if (count > 1) {
          expect(geometry.badgeTop!).toBeGreaterThanOrEqual(geometry.pieceBottom! - 1);
          expect(geometry.badgeBottom!).toBeLessThanOrEqual(geometry.handBottom + 1);
        }
      }
    }
  }
});
