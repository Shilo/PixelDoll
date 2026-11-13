import { defineConfig } from '@playwright/test';
import { e2ePorts } from './e2e-ports.ts';
import { offlineLaunch, refuseAgentServer } from './test/no-live-api.ts';

const { preview: previewPort, dev: devPort } = e2ePorts();
const baseURL = process.env.BASE ?? `http://127.0.0.1:${previewPort}`;
const devURL = `http://127.0.0.1:${devPort}`;
process.env.DEV_PORT = String(devPort); // Workers inherit this; creator specs read it for their baseURL.
const channel = process.env.PLAYWRIGHT_CHANNEL;
refuseAgentServer(baseURL, devURL);
// A workstation run comes through `npm run e2e` (scripts/e2e.mjs), which builds first and waits for any other run on the
// machine; a direct `playwright test` would test a stale build beside that run. Listing tests starts nothing.
if (!process.env.GITHUB_ACTIONS && !process.env.E2E_QUEUED && !process.argv.includes('--list'))
	throw new Error(
		'Run end-to-end tests with: npm run e2e -- <spec names> [-g "<title>"]. It builds first and queues behind any other run on this machine.'
	);

export default defineConfig({
	testDir: './test/e2e',
	outputDir: process.env.TEST_OUTPUT_DIR ?? 'test-results',
	timeout: 90_000,
	// Every test owns a fresh browser context (storage, locks, channels), so tests run in parallel and shard per test.
	fullyParallel: true,
	// CI: one worker per runner (Playwright's CI advice); parallelism comes from the shard matrix in pages.yml.
	// Local: each animating Studio page uses about three CPU threads, so 20% of threads (4 on 24) is the measured sweet spot.
	workers: process.env.CI ? 1 : '20%',
	// Unloaded CI keeps the strict default; local parallel CPU load slows IndexedDB and image work, so wait longer there.
	expect: { timeout: process.env.CI ? 5_000 : 15_000 },
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0, // A CI timing flake is retried once and annotated as flaky.
	reporter: process.env.CI ? [['list'], ['github']] : 'list',
	use: { trace: 'retain-on-failure', channel, launchOptions: offlineLaunch },
	webServer: [
		...(!process.env.BASE
			? [
					{
						command: `npm run preview -- --host 127.0.0.1 --port ${previewPort} --strictPort`,
						url: baseURL,
						reuseExistingServer: false
					}
				]
			: []),
		{
			command: `npm run dev -- --host 127.0.0.1 --port ${devPort} --strictPort`,
			url: devURL,
			reuseExistingServer: false
		}
	],
	projects: [
		{
			name: 'studio',
			testMatch: [
				'studio.spec.ts',
				'auth.spec.ts',
				'export-picker.spec.ts',
				'characters.spec.ts',
				'shared-equipment.spec.ts',
				'crash-recovery.spec.ts',
				'renderer-crash.spec.ts',
				'api-peek.spec.ts',
				'character-creator.spec.ts',
				'creator-request-matrix.spec.ts',
				'experience-parity.spec.ts',
				'scene-zoom.spec.ts',
				'pwa.spec.ts',
				'pwa-startup.spec.ts'
			],
			use: { baseURL, viewport: { width: 1440, height: 900 }, acceptDownloads: true }
		},
		{
			name: 'browser-selftests',
			testMatch: ['selftests.spec.ts', 'concurrency.spec.ts'],
			use: { baseURL: devURL }
		}
	]
});
