import { svelte } from '@sveltejs/vite-plugin-svelte';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, normalizePath, type Plugin } from 'vite';
import { agentApiBase, localSameOrigin, resolveAgentKey } from './agent-key.ts';
import { appVersion } from './version.ts';
import { randomUUID } from 'node:crypto';
import { pwaBuild } from './pwa-build.ts';
import { distDir } from './dist-dir.ts';

// Dev-only fixtures (s1, s4rig, s5): served at /fixtures/<name>/... by the dev server, never copied into dist.
const DEV_FIXTURES = fileURLToPath(new URL('./dev-fixtures', import.meta.url));
const TYPES: Record<string, string> = {
	json: 'application/json',
	png: 'image/png',
	txt: 'text/plain'
};

// Dev server (any mode): /__dev/save (test sheets -> docs/testing/img), dev-fixtures and a CSP that allows Vite's HMR websocket.
// `apply: 'serve'` keeps it out of `vite build`.
function devTools(): Plugin {
	return {
		name: 'pixeldoll-dev-tools',
		apply: 'serve',
		transformIndexHtml: (html) =>
			html.replace("connect-src 'self'", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*"),
		configureServer(server) {
			// POST body = PNG bytes -> docs/testing/img/<name>.png
			server.middlewares.use('/__dev/save', (req, res) => {
				const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? '';
				if (req.method !== 'POST' || !localSameOrigin(req) || !/^[a-z0-9_.-]+\.png$/.test(name)) {
					res.statusCode = 403;
					return res.end();
				}
				const parts: Buffer[] = [];
				req.on('data', (c: Buffer) => parts.push(c));
				req.on('end', () => {
					const dir = new URL('../docs/testing/img/', import.meta.url); // local-only (gitignored), may not exist in a fresh clone
					mkdirSync(dir, { recursive: true });
					writeFileSync(new URL(name, dir), Buffer.concat(parts));
					res.end('ok');
				});
			});
			// /fixtures/<name>/... -> app/dev-fixtures when the file exists there (else falls through to public/)
			server.middlewares.use('/fixtures', (req, res, next) => {
				let file: string;
				try {
					file = resolve(
						DEV_FIXTURES,
						'.' + decodeURIComponent(new URL(req.url ?? '', 'http://x').pathname)
					);
				} catch {
					return next();
				}
				if (!file.startsWith(DEV_FIXTURES + sep) || !existsSync(file) || !statSync(file).isFile())
					return next();
				res.setHeader(
					'content-type',
					TYPES[file.split('.').pop() ?? ''] ?? 'application/octet-stream'
				);
				res.end(readFileSync(file));
			});
		}
	};
}

// AI-agent automation only (`npm run dev:agent` = `vite --mode agent`): serves PIXELLAB_API_KEY_AGENT_DEV from the .env (below) at
// /__dev/pixellab-key. Not registered at all for `npm run dev` (humans paste their key like in production) or any build.
// The key is read server-side per request, never through Vite's env (no VITE_ prefix, nothing inlined). A key referencing
// PIXELLAB_SECRET_DEV (read at startup) switches the app and the CSP to a local API server (agentApiBase).
// The repo-root .env. Git never copies an ignored file into a new worktree, so a worktree without one uses the main
// checkout's (the parent of git's shared directory): one .env serves every worktree.
function agentEnvFile(): string {
	const own = fileURLToPath(new URL('../.env', import.meta.url));
	if (existsSync(own)) return own;
	const shared = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
		cwd: fileURLToPath(new URL('.', import.meta.url)),
		encoding: 'utf8'
	}).trim();
	return resolve(shared, '..', '.env');
}
const localApi = (envFile: string) =>
	existsSync(envFile) ? agentApiBase(readFileSync(envFile, 'utf8')) : undefined;
function agentKey(envFile: string, apiBase: string | undefined): Plugin {
	return {
		name: 'pixeldoll-agent-key',
		transformIndexHtml: (html) =>
			apiBase
				? html.replace("connect-src 'self'", `connect-src 'self' ${new URL(apiBase).origin}`)
				: html,
		configureServer(server) {
			server.middlewares.use('/__dev/pixellab-key', (req, res) => {
				res.setHeader('cache-control', 'no-store');
				if (!localSameOrigin(req)) {
					res.statusCode = 403;
					return res.end();
				}
				try {
					const source = readFileSync(envFile, 'utf8');
					// The API base is fixed at startup: never serve a key edited for the other server until a restart.
					if (agentApiBase(source) !== apiBase) {
						server.config.logger.warn('The agent token changed servers: restart dev:agent.');
						res.statusCode = 503;
						return res.end('The agent token changed servers: restart dev:agent.');
					}
					const key = resolveAgentKey(source, process.env);
					res.statusCode = key ? 200 : 404;
					res.end(key);
				} catch (error) {
					res.statusCode = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 503;
					res.end(
						res.statusCode === 404
							? ''
							: 'Agent token setup error: check the reference syntax and inherited environment variable.'
					);
				}
			});
		}
	};
}

// Startup code (what bootstrap.ts imports statically) stays in one chunk. Top-level await in main.ts and bootstrap.ts turns
// off Rolldown's chunk merging, so modules the startup shares with lazy sheets would otherwise become extra startup requests.
// The preload helper keeps its own chunk: main.ts imports it, and importing the startup chunk would run it inside frames.
const BOOTSTRAP = normalizePath(fileURLToPath(new URL('./src/bootstrap.ts', import.meta.url)));
const STARTUP_UPDATE = normalizePath(
	fileURLToPath(new URL('./src/lib/startup-update.ts', import.meta.url))
);
function startupChunk() {
	let startup: Set<string> | undefined;
	return (
		id: string,
		ctx: { getModuleInfo(id: string): { importedIds: readonly string[] } | null }
	) => {
		if (!startup) {
			startup = new Set([BOOTSTRAP]);
			for (const m of startup)
				for (const n of ctx.getModuleInfo(m)?.importedIds ?? []) startup.add(n);
		}
		return startup.has(id) ? 'bootstrap' : null;
	};
}

// main.ts reaches the startup code through awaited dynamic imports, so without hints the browser finds each chunk one round
// trip after the last. modulepreload only fetches and compiles: nothing runs until main.ts imports it, so the frame guard and
// the startup-update order hold. The hints go in the body so they do not compete with the parser-blocking head scripts, which
// on slow networks delayed the static startup message's first paint.
function startupPreload(): Plugin {
	return {
		name: 'pixeldoll-startup-preload',
		apply: 'build',
		transformIndexHtml: {
			order: 'post',
			handler(_html, { chunk, bundle }) {
				if (!chunk || !bundle) throw new Error('startup preload: no entry chunk');
				const files = new Set<string>();
				const add = (file: string) => {
					const next = bundle[file];
					if (files.has(file) || next?.type !== 'chunk') return;
					files.add(file);
					next.imports.forEach(add);
				};
				chunk.dynamicImports.forEach(add);
				chunk.imports.forEach((file) => files.delete(file)); // Vite already preloads the entry's static imports
				return [...files].map((file) => ({
					tag: 'link',
					attrs: { rel: 'modulepreload', crossorigin: true, href: `./${file}` },
					injectTo: 'body' as const
				}));
			}
		}
	};
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
	if (command === 'build' && mode === 'agent')
		throw new Error('mode "agent" is dev-server only; never build with it');
	const { version, commit } = appVersion(fileURLToPath(new URL('.', import.meta.url)));
	const build = randomUUID();
	const agent = command === 'serve' && mode === 'agent',
		envFile = agent ? agentEnvFile() : '',
		apiBase = agent ? localApi(envFile) : undefined;
	return {
		// The dev server may run uncommitted changes, so it never claims a released version.
		define: {
			__APP_VERSION__: JSON.stringify(command === 'serve' ? `${version}-dev` : version),
			__APP_COMMIT__: JSON.stringify(commit),
			__APP_BUILD__: JSON.stringify(build),
			__AGENT_API_BASE__: JSON.stringify(apiBase ?? null)
		},
		base: './', // ponytail: relative base so GitHub Pages subpath just works
		envDir: false, // never load .env files: nothing reaches import.meta.env, in any mode
		plugins: [
			svelte(),
			devTools(),
			startupPreload(),
			agent && agentKey(envFile, apiBase),
			command === 'build' && pwaBuild({ build, version, commit })
		],
		// Vite ignores only test-results/. A run with its own TEST_OUTPUT_DIR (test-results-*, as in .gitignore) streams trace
		// files all run long; watched, they saturate the dev server's CPU and later dev-server specs time out.
		// npm run check rewrites its svelte-check cache while another session's dev-server specs may be running.
		server: { watch: { ignored: ['**/test-results*/**', '**/.svelte-check/**'] } },
		// Early observation must not import the chunk that mounts Studio or connects its generation queue.
		build: {
			outDir: distDir(),
			rolldownOptions: {
				output: {
					codeSplitting: {
						groups: [
							{ name: 'startup-update', test: (id) => id === STARTUP_UPDATE, priority: 2 },
							{ name: 'preload-helper', test: /vite\/preload-helper/, priority: 1 },
							{ name: startupChunk(), debugName: 'startup' }
						]
					}
				}
			}
		}
	};
});
