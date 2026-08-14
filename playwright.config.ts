import { defineConfig } from '@playwright/test';

/**
 * Playwright E2E config — todo 28 (h5-spot-diff-game).
 *
 * Mobile-H5 profile: Chromium, 375×812 viewport, touch emulation
 * (`hasTouch` + `isMobile` — required for `page.tap()`). Videos are recorded
 * for every test and retained in test-results/ (`.omo/evidence/` receives a
 * copy when a test FAILS — see the QA/cleanup procedure).
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
