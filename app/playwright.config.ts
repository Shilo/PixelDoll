import { defineConfig } from '@playwright/test'

const previewPort = Number(process.env.E2E_PREVIEW_PORT ?? 5399)
const devPort = Number(process.env.E2E_DEV_PORT ?? process.env.DEV_PORT ?? 5298)
const baseURL = process.env.BASE ?? `http://127.0.0.1:${previewPort}`
const devURL = `http://127.0.0.1:${devPort}`
const channel = process.env.PLAYWRIGHT_CHANNEL

export default defineConfig({
  testDir: './test/e2e',
  outputDir: process.env.TEST_OUTPUT_DIR ?? 'test-results',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: { trace: 'retain-on-failure', channel },
  webServer: [
    ...(!process.env.BASE ? [{ command: `npm run preview -- --host 127.0.0.1 --port ${previewPort} --strictPort`, url: baseURL, reuseExistingServer: false }] : []),
    { command: `npm run dev -- --host 127.0.0.1 --port ${devPort} --strictPort`, url: devURL, reuseExistingServer: false },
  ],
  projects: [
    { name: 'studio', testMatch: ['studio.spec.ts', 'export-picker.spec.ts', 'characters.spec.ts', 'shared-equipment.spec.ts', 'api-peek.spec.ts', 'character-creator.spec.ts', 'creator-request-matrix.spec.ts'], use: { baseURL, viewport: { width: 1440, height: 900 }, acceptDownloads: true } },
    { name: 'browser-selftests', testMatch: ['selftests.spec.ts', 'concurrency.spec.ts'], use: { baseURL: devURL } },
  ],
})
