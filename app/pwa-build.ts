import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

export interface PwaRelease {
	build: string;
	version: string;
	commit: string;
}
export interface PwaFile {
	path: string;
	hash: string;
}

/** Public URLs need a release identity too: unlike Vite chunks their names do not contain a content hash. */
export function revisionPath(path: string, build: string) {
	return path.startsWith('assets/') ? path : `${path}?pd-build=${encodeURIComponent(build)}`;
}

export function revisionHtml(html: string, build: string) {
	return html
		.replace(
			/\b(src|href)=(['"])((?:\.\/)?(?:appearance\.js|favicon\.(?:svg|ico)|manifest\.webmanifest|icons\/pwa\/[^'"?#]+))\2/g,
			(_, attribute: string, quote: string, path: string) =>
				`${attribute}=${quote}${revisionPath(path, build)}${quote}`
		)
		.replace('</head>', `<script src="./${revisionPath('install.js', build)}"></script>\n</head>`);
}

/** Runs after public files and every lazy chunk have been written, so the offline release is a complete closure. */
export function emitPwa(outDir: string, release: PwaRelease) {
	const manifestPath = join(outDir, 'manifest.webmanifest');
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { icons: { src: string }[] };
	for (const icon of manifest.icons)
		icon.src = revisionPath(icon.src.split('?')[0]!, release.build);
	writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

	const files: PwaFile[] = [];
	function walk(directory: string, prefix = '') {
		for (const name of readdirSync(directory).sort()) {
			const path = prefix + name,
				absolute = join(directory, name);
			if (statSync(absolute).isDirectory()) walk(absolute, path + '/');
			else if (path !== 'sw.js' && path !== 'release.json') {
				files.push({
					path: revisionPath(path, release.build),
					hash: createHash('sha256').update(readFileSync(absolute)).digest('hex')
				});
			}
		}
	}
	walk(outDir);
	if (!files.some((file) => file.path === revisionPath('index.html', release.build)))
		throw new Error('PWA: index.html is missing');
	const source = readFileSync(new URL('./pwa-worker.js', import.meta.url), 'utf8');
	writeFileSync(
		join(outDir, 'sw.js'),
		`const RELEASE = ${JSON.stringify(release)};\nconst FILES = ${JSON.stringify(files)};\n${source}`
	);
	writeFileSync(join(outDir, 'release.json'), JSON.stringify(release) + '\n');
	return files;
}

export function pwaBuild(release: PwaRelease): Plugin {
	let outDir: string;
	return {
		name: 'pixeldoll-pwa',
		apply: 'build',
		enforce: 'post',
		configResolved: (config) => {
			outDir = resolve(config.root, config.build.outDir);
		},
		transformIndexHtml: { order: 'post', handler: (html) => revisionHtml(html, release.build) },
		writeBundle: () => {
			emitPwa(outDir, release);
		}
	};
}
