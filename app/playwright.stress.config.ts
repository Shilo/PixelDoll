import { defineConfig } from '@playwright/test';
import base from './playwright.config.ts';

// Run separately from other test/check workloads. Eight simultaneous cold starts
// deliberately exceed ordinary local concurrency without changing the browser or deadlines.
export default defineConfig({
	...base,
	workers: 8,
	repeatEach: 10,
	retries: 0,
	grep: /Share uses the worn review draft through|radio groups and tabs use one Tab stop/,
	outputDir: process.env.TEST_OUTPUT_DIR ?? 'test-results-windows-stress'
});
