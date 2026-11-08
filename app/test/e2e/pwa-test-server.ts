import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { revisionPath, type PwaRelease } from '../../pwa-build.ts';

const DIST = new URL('../../dist/', import.meta.url);
const TEXT = /\.(?:html|js|css|json|webmanifest|svg|txt)$/;
const TYPES: Record<string, string> = {
	html: 'text/html',
	js: 'application/javascript',
	css: 'text/css',
	json: 'application/json',
	webmanifest: 'application/manifest+json',
	svg: 'image/svg+xml',
	png: 'image/png',
	ico: 'image/x-icon',
	txt: 'text/plain'
};

export interface TestRelease {
	release: PwaRelease;
	files: Map<string, Buffer>;
	inventory: { path: string; hash: string }[];
}

/** Real production bytes with independent chunk URLs and release identities, without rebuilding the app per test. */
export async function testRelease(
	label: string,
	version: string,
	transform?: (files: Map<string, Buffer>) => void
): Promise<TestRelease> {
	const original = JSON.parse(await readFile(new URL('release.json', DIST), 'utf8')) as PwaRelease;
	const release = { ...original, build: `pwa-test-${label}-${randomUUID()}`, version };
	const source = new Map<string, Buffer>();
	async function walk(directory: URL, prefix = ''): Promise<void> {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = prefix + entry.name;
			if (entry.isDirectory()) await walk(new URL(entry.name + '/', directory), path + '/');
			else if (path !== 'sw.js' && path !== 'release.json')
				source.set(path, await readFile(new URL(entry.name, directory)));
		}
	}
	await walk(DIST);
	const renamed = new Map(
		[...source.keys()]
			.filter((path) => path.startsWith('assets/'))
			.map((path) => {
				const file = path.slice('assets/'.length);
				return [file, `${release.build}-${file}`];
			})
	);
	const files = new Map<string, Buffer>();
	for (const [path, bytes] of source) {
		let content = bytes;
		if (TEXT.test(path)) {
			let text = bytes
				.toString()
				.replaceAll(original.build, release.build)
				.replaceAll(original.version, version);
			for (const [before, after] of renamed) text = text.replaceAll(before, after);
			content = Buffer.from(text);
		}
		const target = path.startsWith('assets/')
			? 'assets/' + renamed.get(path.slice('assets/'.length))!
			: path;
		files.set(target, content);
	}
	transform?.(files);
	const inventory = [...files].map(([path, bytes]) => ({
		path: revisionPath(path, release.build),
		hash: createHash('sha256').update(bytes).digest('hex')
	}));
	const worker = await readFile(new URL('../../pwa-worker.js', import.meta.url), 'utf8');
	files.set(
		'sw.js',
		Buffer.from(
			`const RELEASE = ${JSON.stringify(release)};\nconst FILES = ${JSON.stringify(inventory)};\n${worker}`
		)
	);
	files.set('release.json', Buffer.from(JSON.stringify(release)));
	return { release, files, inventory };
}

/** A service worker's requests do not pass through page.route; serve deployments over actual loopback HTTP. */
export async function pwaServer(initial: TestRelease) {
	let current = initial;
	const scope = `/pwa-test-${randomUUID()}/`;
	const requests: string[] = [];
	const failures = new Set<string>();
	const holds = new Map<string, { noteRequest(): void; wait: Promise<void>; release(): void }>();
	let dynamic = 0;
	const server = createServer((request, response: ServerResponse) => {
		const url = new URL(request.url ?? '/', 'http://localhost');
		requests.push(url.pathname + url.search);
		response.setHeader('cache-control', 'no-store');
		if (!url.pathname.startsWith(scope)) {
			response.writeHead(404).end();
			return;
		}
		const path = decodeURIComponent(url.pathname.slice(scope.length)) || 'index.html';
		const bytes = current.files.get(path);
		const send = () => {
			if (response.destroyed) return;
			if (path === 'dynamic.json') {
				response.setHeader('content-type', 'application/json');
				response.end(JSON.stringify({ value: ++dynamic }));
				return;
			}
			if (failures.has(path)) {
				response.writeHead(503).end('Deployment is incomplete');
				return;
			}
			if (!bytes) {
				response.writeHead(404).end('Missing release file');
				return;
			}
			response.setHeader(
				'content-type',
				TYPES[path.split('.').at(-1)!] ?? 'application/octet-stream'
			);
			response.end(bytes);
		};
		const held = holds.get(path);
		if (held) {
			held.noteRequest();
			void held.wait.then(send);
		} else send();
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	return {
		url: origin + scope,
		scope,
		requests,
		failures,
		deploy(release: TestRelease) {
			current = release;
		},
		hold(path: string) {
			if (holds.has(path)) throw new Error(`PWA fixture already holds ${path}`);
			let noteRequest!: () => void, resume!: () => void;
			const requested = new Promise<void>((resolve) => {
				noteRequest = resolve;
			});
			const wait = new Promise<void>((resolve) => {
				resume = resolve;
			});
			const release = () => {
				holds.delete(path);
				resume();
			};
			holds.set(path, { noteRequest, wait, release });
			return { requested, release };
		},
		close: () =>
			new Promise<void>((resolve, reject) => {
				for (const held of holds.values()) held.release();
				const timer = setTimeout(() => reject(new Error('PWA test server did not close')), 5_000);
				server.close((error) => {
					clearTimeout(timer);
					if (error) reject(error);
					else resolve();
				});
				server.closeAllConnections();
			})
	};
}
