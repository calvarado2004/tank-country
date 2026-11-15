import { defineConfig } from 'vite';
import istanbul from 'vite-plugin-istanbul';

export default defineConfig(() => {
  const coverage = process.env.VITE_COVERAGE === '1';
  return {
    plugins: coverage
      ? [istanbul({
        include: ['src/**/*.js'],
        exclude: ['node_modules', 'tests/**'],
        extension: ['.js'],
        requireEnv: false,
      })]
      : [],
    server: coverage
      ? { port: 5174, strictPort: true }
      : {},
  };
});
