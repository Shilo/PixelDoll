import base from '../../../app/playwright.config.ts';
import { fileURLToPath } from 'node:url';

// Review configuration only. Existing tests retain their mocks; unmocked external traffic cannot reach its origin.
const localOnly = { proxy: { server: 'http://127.0.0.1:9', bypass: 'localhost,127.0.0.1,[::1]' }, args: ['--host-resolver-rules=MAP *.pixellab.ai ~NOTFOUND'] };
const r4 = process.env.PD_REVIEW_R4 === '1';
export default {
  ...base,
  webServer: base.webServer.map(server => ({ ...server, cwd: fileURLToPath(new URL('../../../app/', import.meta.url)) })),
  testDir: fileURLToPath(new URL(r4 ? './temp.local/' : '../../../app/test/e2e/', import.meta.url)),
  use: { ...base.use, launchOptions: localOnly },
  projects: r4 ? [{ name: 'r4-offline', testMatch: 'r4.browser.spec.ts', use: { baseURL: `http://127.0.0.1:${process.env.E2E_DEV_PORT}`, launchOptions: localOnly } }]
    : base.projects,
};
