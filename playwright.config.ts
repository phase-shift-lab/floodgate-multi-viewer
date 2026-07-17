import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/floodgate-multi-viewer/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm exec vite preview -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4173/floodgate-multi-viewer/',
    env: { VITE_API_BASE: 'http://127.0.0.1:4173/floodgate-multi-viewer' },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
