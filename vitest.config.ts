import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/**
 * Vitest config — unit tests live in src/**; the Playwright E2E suite
 * (e2e/**, runner: `npx playwright test`) must NEVER be collected by vitest.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    },
  }),
);
