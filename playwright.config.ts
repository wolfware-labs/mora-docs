import { defineConfig, devices } from '@playwright/test';

// Builds the site it tests. ROADMAP_OFFLINE=1 makes the roadmap read the committed snapshot
// instead of GitHub, so the specs can compare the pages against that file. The build goes to
// its own out dir and leaves `dist` alone.
const env = 'MORA_OUT_DIR=dist-e2e ROADMAP_OFFLINE=1';

export default defineConfig({
  testDir: './tests/e2e',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4321' } }],
  webServer: {
    command: `${env} pnpm build && ${env} pnpm exec astro preview --ignore-lock --port 4321`,
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
