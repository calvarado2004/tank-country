import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/infantry.js', 'src/battery.js'],
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage/integration',
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
