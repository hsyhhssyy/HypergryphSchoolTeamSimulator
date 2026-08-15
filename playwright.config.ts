import { defineConfig } from '@playwright/test';

/**
 * Playwright E2E config — todo 28 (h5-spot-diff-game) + todo 7
 * (home-title-image-responsive desktop/responsive project).
 *
 * TWO device projects share the same local servers:
 *  - chromium-mobile  (375×812, hasTouch, isMobile) — the original 11-scenario
 *    h5-spot-diff-game suite (`e2e/h5-spot-diff-game.spec.ts`). Videos are
 *    recorded for every test and retained in test-results/
 *    (`.omo/evidence/` receives a copy when a test FAILS — see the QA/cleanup
 *    procedure).
 *  - chromium-desktop (1280×800, mouse only) — the responsive/title spec
 *    (`e2e/responsive-layout.spec.ts`, todo 7). `hasTouch:false` +
 *    `isMobile:false` so `page.touchscreen.tap`/`locator.tap()` THROW here —
 *    the spec's device-agnostic helpers dispatch mouse clicks instead.
 *
 * Project scoping is by testMatch/testIgnore: mobile ignores the responsive
 * spec, desktop matches ONLY the responsive spec (desktop intentionally does
 * not re-run the touch suite — the refactored h5 spec is device-agnostic but
 * its scenarios are written for the stacked mobile layout).
 *
 * Runs against TWO local dev servers (webServer array):
 *   - vite dev  (frontend)            → http://localhost:5173
 *   - wrangler dev (Workers API/D1/R2) → http://localhost:8080
 *
 * REQUIRED before `npx playwright test` (todo 28 MUST DO):
 *   1. Seed local D1:
 *        npx wrangler d1 execute DB --local --file=migrations/0001_init.sql
 *        npx wrangler d1 execute DB --local --file=seed/official-questions.sql
 *   2. AUTO_APPROVE_WORKSHOP=true — the `[vars]` default; `.dev.vars` must NOT
 *      override it to "false" (scenario 10 asserts the no-admin auto-approve
 *      loop). wrangler dev reads `.dev.vars` over `[vars]`.
 *   3. Optional determinism reset between suite runs (removes accumulated
 *      workshop submissions + hourly rate-limit counters):
 *        npx wrangler d1 execute DB --local --command="DELETE FROM ratings; DELETE FROM questions WHERE source='workshop'; DELETE FROM rate_limits;"
 */
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // Sequential execution: the workshop loop (scenarios 9+10) mutates shared
  // local D1/R2 state; a single worker keeps runs deterministic and fast.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    video: 'on',
    // Offline banner + autoplay-policy probes need real network semantics;
    // no artificial offline emulation.
  },
  projects: [
    {
      name: 'chromium-mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 375, height: 812 },
        hasTouch: true,
        isMobile: true,
      },
      // The responsive spec covers the desktop layout; the mobile suite keeps
      // the original 11 scenarios (todo 7 scoping).
      testIgnore: /responsive-layout\.spec\.ts/,
    },
    {
      name: 'chromium-desktop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
        hasTouch: false,
        isMobile: false,
      },
      // Mouse-driven responsive/title assertions only (todo 7).
      testMatch: /responsive-layout\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npx wrangler dev --port 8080',
      url: 'http://localhost:8080/api/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
