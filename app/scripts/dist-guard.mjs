// Part of `npm run build` (and so CI): fails if the build folder (dist/, or an e2e run's own, dist-dir.ts) carries dev
// or agent-key code, an .env file or a source map (file or inline). Prints file names only, never the matched content.
// Same check as PixelLab Backpack's scripts/dist-guard.mjs.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { distDir } from '../dist-dir.ts';
import { studioMusicAsset } from '../pwa-build.ts';

// Historical names are leak indicators, not a list of permitted environment references. resolveAgentKey covers any name.

const MARKERS = [
	'resolveAgentKey',
	'PIXELLAB_SECRET',
	'__dev',
	'pixellab-key',
	'PIXELLAB_API_KEY_AGENT_DEV',
	'__AGENT_API_BASE__',
	'localhost:8000',
	'PIXELLAB_TOKEN_AGENT_DEV',
	'PIXELLAB_API_KEY',
	'API_KEY_OVERRIDE',
	'DEV_API_KEY',
	'devkey',
	'pixeldoll.agentKey',
	'agent-badge',
	'sourceMappingURL',
	'#/selftest',
	'#/dev',
	'Verifying the PixelDoll update'
];
const DEV_UI = ['data-local-developer-rigs', '8-dir held dress: every direction dressed once'];
const bad = [];
let startupPolicies = 0;
const dist = distDir();
for (const rel of readdirSync(dist, { recursive: true })) {
	const file = join(dist, rel);
	if (!statSync(file).isFile()) continue;
	const name = basename(file);
	if (name.startsWith('.env')) bad.push(`${file}: .env file`);
	else if (name.endsWith('.map')) bad.push(`${file}: source map`);
	else if (name === 'update.html') bad.push(`${file}: retired update page`);
	else {
		const text = readFileSync(file, 'latin1');
		if (MARKERS.some((m) => text.includes(m))) bad.push(`${file}: dev or agent-key marker`);
		if (DEV_UI.some((m) => text.includes(m))) bad.push(`${file}: developer UI or self-test`);
		if (name.startsWith('startup-update-') && name.endsWith('.js')) {
			if (text.includes('pixeldoll.startupUpdate:')) startupPolicies++;
			const imports = [...text.matchAll(/\b(?:from|import)\s*["'`]([^"'`]+)["'`]/g)].map(
				(match) => match[1]
			);
			// This code must run before bootstrap, never pull in credentials, storage, or the mounted app.
			if (
				imports.some((path) => !path.startsWith('./startup-update-')) ||
				/\bimport\s*\(/.test(text) ||
				text.includes('pixellabApiKey') ||
				text.includes('indexedDB')
			)
				bad.push(`${file}: startup observation is not isolated`);
		}
	}
}
if (startupPolicies !== 1)
	bad.push(`${join(dist, 'assets')}: missing or duplicated isolated startup policy`);
try {
	const worker = join(dist, 'sw.js');
	const inventory = JSON.parse(/^const FILES = (.*);$/m.exec(readFileSync(worker, 'utf8'))?.[1]);
	const expected = readdirSync(new URL('../src/locales/', import.meta.url))
		.filter((name) => name.endsWith('.json') && name !== 'en.json')
		.map((name) => name.slice(0, -5))
		.sort();
	const locales = inventory.filter((file) => Object.hasOwn(file, 'locale'));
	const validHash = (file) => /^[a-f0-9]{64}$/.test(file.hash);
	if (
		JSON.stringify(locales.map((file) => file.locale).sort()) !== JSON.stringify(expected) ||
		locales.some(
			(file) => file.optional !== true || !/^assets\/[^/]+\.js$/.test(file.path) || !validHash(file)
		) ||
		new Set(locales.map((file) => file.path)).size !== locales.length
	)
		bad.push(`${worker}: expected exactly one verified optional chunk per non-English locale`);
	const audio = inventory.filter(
		(file) => file.optional === true && !Object.hasOwn(file, 'locale')
	);
	const music = audio.find((file) => studioMusicAsset.test(file.path));
	const playback = audio.find((file) => /^assets\/[^/]+\.js$/.test(file.path));
	if (audio.length !== 2 || !playback || !music || !audio.every(validHash))
		bad.push(`${worker}: expected verified optional playback JavaScript and content-hashed music`);
	const html = join(dist, 'index.html');
	const resources = [
		...readFileSync(html, 'utf8').matchAll(/\b(?:src|href)=["']([^"']+)["']/g)
	].map(([, path]) => path.replace(/^\.?\//, '').split('?')[0]);
	if ((music && resources.includes(music.path)) || (playback && resources.includes(playback.path)))
		bad.push(`${html}: optional audio is referenced by the app shell`);
} catch {
	bad.push(`${join(dist, 'sw.js')}: missing or malformed offline inventory`);
}
if (bad.length) {
	console.error(`dist guard: ${bad.length} problem(s) in ${dist}/\n${bad.join('\n')}`);
	process.exit(1);
}
console.log(`dist guard: ${dist}/ clean`);
