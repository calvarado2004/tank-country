import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const localChromium = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH
  || (existsSync(localChromium) ? localChromium : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'coverage/e2e-html' }],
  ],
  globalSetup: './tests/e2e/global-setup.js',
  use: {
    baseURL: 'http://localhost:5174',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: 'PATH=/opt/homebrew/bin:$PATH VITE_COVERAGE=1 ./node_modules/.bin/vite --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
