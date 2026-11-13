// `npm run e2e`: build, then run Playwright with any extra arguments.
// On a workstation (anywhere but GitHub Actions, so a local CI=1 run too) a run also:
// - needs a scope: spec names, or --all for the full suite, which CI already runs on every push;
// - waits its turn: one run at a time on this machine, across every checkout and agent session, because overlapping runs
//   saturate the CPU and fail each other's tests on timeouts (docs/testing/test-performance.md);
// - runs below normal priority, so the desktop stays responsive (the build, servers and browsers inherit it).
// A run with its own E2E_PREVIEW_PORT builds into its own dist-e2e-<port> folder and removes it afterwards (dist-dir.ts);
// every other run keeps the E2E_DIST_DIR it was given, or uses dist/.
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { e2ePorts } from '../e2e-ports.ts';

const app = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const workstation = !process.env.GITHUB_ACTIONS;

// A scope is a spec name, a test list, another config, or --all. Flags alone, such as --workers 2 or --last-failed,
// would still run or search the whole suite, so the value that follows a flag is not taken for a spec name.
const VALUE_FLAGS = [
	'-g',
	'--grep',
	'--grep-invert',
	'-j',
	'--workers',
	'--project',
	'--repeat-each',
	'--retries',
	'--reporter',
	'--timeout',
	'--trace',
	'--max-failures',
	'--output',
	'--shard'
];
const scoped = args.some(
	(arg, i) =>
		/^(--all|--test-list|--config|-c)\b/.test(arg) ||
		(!arg.startsWith('-') && !VALUE_FLAGS.includes(args[i - 1]))
);
if (workstation && !scoped) {
	console.error(
		[
			'npm run e2e needs spec names here: the full suite takes minutes of heavy CPU, and CI runs it on every push.',
			'  npm run e2e -- <spec names> [-g "<title>"]   the specs that cover your change (AGENTS.md "Testing")',
			'  npm run e2e -- <spec names> --last-failed    of those specs, only what failed in the last run',
			'  npm run e2e -- --all                         the full suite: only when asked (npm run land runs it in CI)'
		].join('\n')
	);
	process.exit(2);
}
// An install behind the lockfile fails tests that no code change explains: a theme one patch behind failed five of them.
const packages = (path) =>
	JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')).packages;
const locked = packages('../package-lock.json'),
	installed = packages('../node_modules/.package-lock.json');
const { dependencies, devDependencies } = JSON.parse(
	readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);
const behind = [
	...Object.keys(installed).filter((name) => locked[name]?.version !== installed[name].version),
	...Object.keys({ ...dependencies, ...devDependencies })
		.map((name) => `node_modules/${name}`)
		.filter((name) => !installed[name]) // a dependency this checkout added since the last install
];
if (behind.length) {
	console.error(
		`node_modules does not match package-lock.json (${behind.slice(0, 3).join(', ')}): run npm ci in app/ first.`
	);
	process.exit(2);
}
const all = args.indexOf('--all');
if (all >= 0) args.splice(all, 1);

// The queue is a loopback TCP port: the system frees it the moment its holder exits, however that happens, so a killed
// run never leaves a stale lock behind. The holder answers a connection with what it is running.
const QUEUE_PORT = 5397;
const running = JSON.stringify({ pixeldollE2e: { checkout: app, args, since: Date.now() } });
const claim = () =>
	new Promise((resolve, reject) => {
		const server = net.createServer((socket) => socket.on('error', () => {}).end(running)); // a waiter may vanish
		server.once('error', (error) => (error.code === 'EADDRINUSE' ? resolve(null) : reject(error)));
		server.listen(QUEUE_PORT, '127.0.0.1', () => resolve(server));
	});
/** What the current holder runs. Undefined when nothing valid answered: the holder is leaving, or it is another program. */
const holder = () =>
	new Promise((resolve) => {
		let text = '';
		const socket = net.connect(QUEUE_PORT, '127.0.0.1');
		socket.setTimeout(5000, () => socket.destroy());
		socket.on('data', (chunk) => (text += chunk));
		socket.once('close', () => {
			try {
				const run = JSON.parse(text).pixeldollE2e;
				resolve(
					typeof run.checkout === 'string' && typeof run.since === 'number' ? run : undefined
				);
			} catch {
				resolve(undefined); // a connection the leaving holder dropped, or a stranger's reply
			}
		});
		socket.once('error', () => {}); // 'close' follows and settles
	});
async function turn() {
	for (let seconds = 0, strangers = 0; ; seconds++) {
		const server = await claim();
		if (server) return server;
		if (seconds % 30 === 0) {
			const other = await holder();
			// One silent check can be a holder that was just leaving; a second, 30 s later, is not a PixelDoll run.
			if (!other && ++strangers > 1)
				throw new Error(`Port ${QUEUE_PORT} (the e2e queue) is held by another program.`);
			if (other)
				console.log(
					`Waiting for the e2e run in ${other.checkout} (started ${Math.round((Date.now() - other.since) / 60000)} min ago): ` +
						'one runs at a time on this machine. Keep waiting; do not start another run.'
				);
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
}

// A wrapper killed without its children leaves the two Vite servers listening for good (measured: still up four minutes
// later), and the next run would fail on a port error that invites the wrong fix. Holding the queue proves no queued run
// owns them, so stop them; anything else on those ports is reported, never stopped.
const fail = (message) => {
	console.error(message);
	process.exit(2);
};
const listening = (port) =>
	new Promise((resolve) => {
		const socket = net.connect(port, '127.0.0.1');
		socket.once('connect', () => {
			socket.destroy();
			resolve(true);
		});
		socket.once('error', () => resolve(false));
	});
async function stopLeftServers() {
	const { preview, dev } = e2ePorts();
	const held = [];
	for (const port of process.env.BASE ? [dev] : [preview, dev])
		if (await listening(port)) held.push(port);
	if (!held.length) return;
	if (process.platform !== 'win32')
		fail(
			`Port ${held.join(' and ')} is still held, probably by the servers of a run that was killed. Stop them first: ` +
				held.map((port) => `lsof -ti tcp:${port} | xargs kill`).join('; ')
		);
	for (const line of execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' }).split(
		'\n'
	)) {
		const [, port, pid] =
			line.match(/^\s*TCP\s+127\.0\.0\.1:(\d+)\s+\S+\s+LISTENING\s+(\d+)/) ?? [];
		if (!held.includes(Number(port))) continue;
		const command = execFileSync(
			'powershell',
			[
				'-NoProfile',
				'-Command',
				`(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`
			],
			{ encoding: 'utf8' }
		).trim();
		if (!/[\\/]vite[\\/]/.test(command))
			fail(`Port ${port} is held by another program (process ${pid}): ${command}`);
		console.log(`Stopping the server a killed run left on port ${port}.`);
		execFileSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' });
	}
}

let child;
// Ctrl+C while waiting leaves the queue. Once the children run it reaches them as well: outlive them, so the queue is
// released and the build folder removed only after they stop. A run killed outright frees the queue at once even if its
// browsers take a moment to die; nothing short of a process supervisor closes that gap.
process.on('SIGINT', () => child || process.exit(130));
process.on('SIGTERM', () => (child ? child.kill() : process.exit(143)));
const port = process.env.E2E_PREVIEW_PORT;
const own = port ? `dist-e2e-${port}` : '';
const env = { ...process.env, E2E_QUEUED: '1', ...(own && { E2E_DIST_DIR: own }) }; // playwright.config.ts requires E2E_QUEUED
const run = (cmd, cmdArgs) =>
	new Promise((resolve, reject) => {
		child = spawn(cmd, cmdArgs, { cwd: app, env, stdio: 'inherit', shell: cmd === 'npm' });
		child.once('error', reject);
		child.once('exit', (code) => resolve(code ?? 1));
	});

if (workstation) {
	const below = os.constants.priority.PRIORITY_BELOW_NORMAL;
	if (os.getPriority() < below) os.setPriority(below); // never raise a run that was started lower
	await turn();
	await stopLeftServers();
}
let status = await run('npm', ['run', 'build']);
if (status === 0) {
	const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
	status = await run(process.execPath, [cli, 'test', ...args]);
}
if (own) rmSync(new URL(`../${own}`, import.meta.url), { recursive: true, force: true });
process.exit(status);
