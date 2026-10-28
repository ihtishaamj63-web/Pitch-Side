import { defineConfig, devices } from '@playwright/test';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const apiUrl = 'http://127.0.0.1:4001';
const frontendUrl = 'http://127.0.0.1:4173';
const apiEnv = {
  ...process.env,
  DB_USER: process.env.DB_USER ?? 'pitch_admin',
  DB_PASSWORD: process.env.DB_PASSWORD ?? 'pitch_password',
  DB_HOST: process.env.DB_HOST ?? '127.0.0.1',
  DB_PORT: process.env.DB_PORT ?? '5433',
  DB_NAME: process.env.E2E_DB_NAME ?? 'pitch_test',
  PORT: '4001',
  SEED_DEMO: 'false',
  LIVE_SPEED_QUICK_SECONDS: '40',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL: frontendUrl },
  webServer: [
    {
      command: `${npm} --prefix ../backend run dev`,
      url: `${apiUrl}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: apiEnv,
    },
    {
      command: `${npm} run dev -- --host 127.0.0.1 --port 4173 --strictPort`,
      url: frontendUrl,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { ...process.env, VITE_API_URL: apiUrl },
    },
  ],
});
