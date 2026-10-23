import { defineConfig } from '@playwright/test'

const baseURL = process.env.BASE ?? 'http://127.0.0.1:5399'
const devURL = 'http://127.0.0.1:5298'
const channel = process.env.PLAYWRIGHT_CHANNEL

export default defineConfig({
  testDir: './test/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: { trace: 'retain-on-failure', channel },
  webServer: [
    ...(!process.env.BASE ? [{ command: 'npm run preview -- --host 127.0.0.1 --port 5399 --strictPort', url: baseURL, reuseExistingServer: false }] : []),
    { command: 'npm run dev -- --host 127.0.0.1 --port 5298 --strictPort', url: devURL, reuseExistingServer: false },
  ],
  projects: [
    { name: 'studio', testMatch: ['studio.spec.ts', 'characters.spec.ts', 'shared-equipment.spec.ts', 'api-peek.spec.ts'], use: { baseURL, viewport: { width: 1440, height: 900 }, acceptDownloads: true } },
    { name: 'browser-selftests', testMatch: 'selftests.spec.ts', use: { baseURL: devURL } },
  ],
})
