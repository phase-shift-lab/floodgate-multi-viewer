import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('共有メモリ用ヘッダーで解析でき、CORS通信と再読み込み回数を維持する', async ({ page }) => {
  let navigations = 0;
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations++; });
  await page.goto('/floodgate-multi-viewer/');
  await expect(page.locator('.evaluation-status').first()).toHaveText('解析完了', { timeout: 45_000 });
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  expect(navigations).toBe(2);
  const headers = await page.evaluate(async () => {
    const response = await fetch(location.href);
    return { coop: response.headers.get('Cross-Origin-Opener-Policy'), coep: response.headers.get('Cross-Origin-Embedder-Policy') };
  });
  expect(headers).toEqual({ coop: 'same-origin', coep: 'require-corp' });

  // Separate origin, with the same CORS opt-in used by the LIVE relay.
  const relay = createServer((_request, response) => {
    response.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' });
    response.end('V2.2\nN+test\nN-test');
  });
  await new Promise<void>((resolve) => relay.listen(0, '127.0.0.1', resolve));
  try {
    const address = relay.address();
    if (!address || typeof address === 'string') throw new Error('No relay address');
    const result = await page.evaluate(async (url) => {
      const response = await fetch(url);
      return { text: await response.text(), coep: response.headers.get('Cross-Origin-Embedder-Policy') };
    }, `http://127.0.0.1:${address.port}/api/csa`);
    expect(result).toEqual({ text: 'V2.2\nN+test\nN-test', coep: null });
    await page.reload();
    await expect(page.locator('.evaluation-status').first()).toHaveText('解析完了', { timeout: 45_000 });
    expect(navigations).toBe(3);
  } finally { await new Promise<void>((resolve, reject) => relay.close((error) => error ? reject(error) : resolve())); }
});

test('既存credentiallessのService Workerを新しい設定へ更新できる', async ({ page }) => {
  const current = await readFile('public/analysis-isolation-sw.js', 'utf8');
  const previous = current.replace("headers.set('Cross-Origin-Embedder-Policy', 'require-corp')", "headers.set('Cross-Origin-Embedder-Policy', 'credentialless')");
  let upgraded = false;
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === '/app/analysis-isolation-sw.js') {
      response.setHeader('Content-Type', 'application/javascript');
      response.end(upgraded ? current : previous);
    } else {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>Service Worker update test</title>');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No server address');
    await page.goto(`http://127.0.0.1:${address.port}/app/`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('./analysis-isolation-sw.js');
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    });
    await page.reload();
    expect(await page.evaluate(async () => (await fetch(location.href)).headers.get('Cross-Origin-Embedder-Policy'))).toBe('credentialless');
    upgraded = true;
    await page.evaluate(async () => {
      const changed = new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
      await (await navigator.serviceWorker.getRegistration())!.update();
      await changed;
    });
    const response = await page.reload();
    expect(response?.headers()['cross-origin-embedder-policy']).toBe('require-corp');
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  } finally {
    await page.goto('about:blank');
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
