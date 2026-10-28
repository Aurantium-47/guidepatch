import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 45000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4318', channel: 'msedge', headless: true, viewport: { width: 1440, height: 1000 } },
  webServer: { command: 'node ../server/src/server.mjs', url: 'http://127.0.0.1:4318/api/status', reuseExistingServer: true, timeout: 20000 },
  outputDir: `../../artifacts/browser/${new Date().toISOString().replace(/[:.]/g, '-')}`,
  reporter: [['list']],
});
