import { defineConfig, devices } from '@playwright/test';

// Builds the site and runs the server it ships with. ROADMAP_OFFLINE=1 makes the roadmap read
// the committed snapshot instead of GitHub, so the specs can compare the pages against that
// file. The build goes to its own out dir and leaves `dist` alone. PW_PORT picks another port
// when 4321 is taken.
const port = Number(process.env.PW_PORT || 4321);
const env = `MORA_OUT_DIR=dist-e2e ROADMAP_OFFLINE=1 PORT=${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${port}` } }],
  webServer: {
    command: `${env} pnpm build && ${env} node server/main.mjs`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
