import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

export interface PwaRelease {
	build: string;
	version: string;
	commit: string;
}
export interface PwaFile {
	path: string;
	hash: string;
	optional?: true;
	locale?: string;
}
export const studioMusicAsset = /^assets\/studio-ambient-[^/]+\.flac$/;
const AUDIO_PLAYBACK_MODULE = /[\\/]src[\\/]studio[\\/]audioPlayback\.ts$/;

export function pwaCategory(path: string) {
	if (path === 'releases' || path.startsWith('releases/')) return 'releases';
	if (path.startsWith('assets/')) return 'asset';
	if (path === 'sw.js' || path === 'release.json') return 'metadata';
	return 'public';
}

export function copyReleaseFiles(source: string, outDir: string) {
	if (!existsSync(source)) return;
	cpSync(source, join(outDir, 'releases'), {
		recursive: true,
		filter: (path) => !['schedule.json', 'source.json'].includes(basename(path))
	});
}

/** Public URLs need a release identity too: unlike Vite chunks their names do not contain a content hash. */
export function revisionPath(path: string, build: string) {
	return pwaCategory(path) === 'public' ? `${path}?pd-build=${encodeURIComponent(build)}` : path;
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

/** Keep lazy locales and audio in the verified inventory so they can be cached on demand. */
export function emitPwa(
	outDir: string,
	release: PwaRelease,
	locales = new Map<string, string>(),
	audioChunk?: string
) {
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
			const category = pwaCategory(path);
			if (category === 'releases' || category === 'metadata') continue;
			if (statSync(absolute).isDirectory()) walk(absolute, path + '/');
			else {
				const locale = locales.get(path);
				files.push({
					path: revisionPath(path, release.build),
					hash: createHash('sha256').update(readFileSync(absolute)).digest('hex'),
					...(locale || studioMusicAsset.test(path) || path === audioChunk
						? { optional: true }
						: {}),
					...(locale ? { locale } : {})
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
		writeBundle: (_, bundle) => {
			const chunks = Object.values(bundle).filter((entry) => entry.type === 'chunk');
			const imported = new Set(chunks.flatMap((chunk) => chunk.imports));
			const locales = new Map<string, string>();
			for (const chunk of chunks) {
				if (
					!chunk.isDynamicEntry ||
					chunk.isEntry ||
					imported.has(chunk.fileName) ||
					chunk.imports.length ||
					chunk.dynamicImports.length ||
					chunk.moduleIds.length !== 1
				)
					continue;
				const locale = /[\\/]src[\\/]locales[\\/]([\w-]+)\.json$/.exec(chunk.moduleIds[0]!)?.[1];
				if (locale && locale !== 'en') locales.set(chunk.fileName, locale);
			}
			const audioChunks = chunks.filter((chunk) =>
				chunk.moduleIds.some((id) => AUDIO_PLAYBACK_MODULE.test(id))
			);
			const audio = audioChunks[0];
			const music = Object.values(bundle).filter(
				(entry) => entry.type === 'asset' && studioMusicAsset.test(entry.fileName)
			);
			if (music.length !== 1) throw new Error('PWA: expected one content-hashed Studio soundtrack');
			if (
				audioChunks.length !== 1 ||
				!audio?.isDynamicEntry ||
				audio.isEntry ||
				!AUDIO_PLAYBACK_MODULE.test(audio.facadeModuleId ?? '') ||
				imported.has(audio.fileName) ||
				audio.imports.some((path) => locales.has(path))
			)
				throw new Error('PWA: expected one lazy audio playback chunk with only required imports');
			// Browser tests build without the real release notes, so a published release never opens What's new in an
			// unrelated test; release tests serve their own fixtures (scripts/e2e.mjs sets E2E_QUEUED).
			if (process.env.E2E_QUEUED !== '1')
				copyReleaseFiles(fileURLToPath(new URL('../releases/', import.meta.url)), outDir);
			emitPwa(outDir, release, locales, audio.fileName);
		}
	};
}
