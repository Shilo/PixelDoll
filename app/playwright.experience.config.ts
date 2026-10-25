import { defineConfig } from '@playwright/test'

// Run against an already built/served production app without owning other suites' servers.
export default defineConfig({
  testDir: './test/e2e',
  testMatch: ['experience.spec.ts', 'experience-parity.spec.ts'],
  outputDir: `${process.env.TEST_OUTPUT_DIR ?? 'test-results'}/experience-run`, // concurrent agents each set their own
  timeout: 45_000,
  expect: { timeout: 8_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: `${process.env.TEST_OUTPUT_DIR ?? 'test-results'}/experience-results.json` }]],
  use: {
    baseURL: process.env.BASE ?? 'http://127.0.0.1:5207',
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    launchOptions: { downloadsPath: `${process.env.TEST_OUTPUT_DIR ?? 'test-results'}/experience-downloads` },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
})
