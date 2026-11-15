import { test as base, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Every spec runs against the coverage-instrumented Vite server. The fixture
// persists window.__coverage__ per test; scripts/e2e-coverage.mjs merges the
// files and enforces the gameplay-core thresholds.
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));
    page.__consoleErrors = errors;

    try {
      await use(page);
    } finally {
      const coverage = await page.evaluate(() => window.__coverage__ ?? null).catch(() => null);
      if (coverage) {
        mkdirSync('coverage/e2e', { recursive: true });
        const safe = `${testInfo.testId}-${testInfo.retry}`.replace(/[^a-zA-Z0-9_-]/g, '-');
        writeFileSync(join('coverage/e2e', `${safe}.json`), JSON.stringify(coverage));
      }
      if (errors.length && !testInfo.error) {
        // Surfacing console errors here keeps smoke failures readable.
        expect(errors, errors.join('\n')).toEqual([]);
      }
    }
  },
});

export { expect };
