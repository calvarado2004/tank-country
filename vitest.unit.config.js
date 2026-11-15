import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: [
        'src/combat.js',
        'src/capture.js',
        'src/territory-core.js',
        'src/artillery.js',
      ],
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage/unit',
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
