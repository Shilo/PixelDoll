// `npm run e2e`: build, then run Playwright with any extra arguments. A run with its own E2E_PREVIEW_PORT (concurrent
// agents) builds into its own dist-e2e-<port> folder and removes it afterwards (dist-dir.ts); every other run keeps the
// E2E_DIST_DIR it was given, or uses dist/.
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('..', import.meta.url));
const port = process.env.E2E_PREVIEW_PORT;
const own = port ? `dist-e2e-${port}` : '';
const env = own ? { ...process.env, E2E_DIST_DIR: own } : process.env;
const run = (cmd, args) => {
	const r = spawnSync(cmd, args, { cwd: app, env, stdio: 'inherit', shell: cmd === 'npm' });
	if (r.error) throw r.error;
	return r.status ?? 1;
};
let status = run('npm', ['run', 'build']);
if (status === 0) {
	const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
	status = run(process.execPath, [cli, 'test', ...process.argv.slice(2)]);
}
if (own) rmSync(new URL(`../${own}`, import.meta.url), { recursive: true, force: true });
process.exit(status);
