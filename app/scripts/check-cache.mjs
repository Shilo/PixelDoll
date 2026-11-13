// `npm run check` reuses svelte-check and Prettier results for unchanged files, but neither cache notices a changed
// dependency, Node version or config (svelte-check keys on file size and time, Prettier ignores plugin versions). Drop
// both caches whenever one of those inputs changes, so a stale cache can never pass what CI, which has none, would fail.
// The installed packages count as well as the lockfile: an install can change them while the lockfile stays the same.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const app = new URL('../', import.meta.url);
const hash = createHash('sha256').update(process.version);
for (const name of [
	'package-lock.json',
	'node_modules/.package-lock.json',
	'svelte.config.js',
	'prettier.config.js',
	'.prettierignore',
	'tsconfig.json',
	'tsconfig.app.json'
])
	hash.update(readFileSync(new URL(name, app)));
const inputs = hash.digest('hex');
const stamp = new URL('node_modules/.cache/check-inputs', app);
let seen = '';
try {
	seen = readFileSync(stamp, 'utf8');
} catch (error) {
	if (error.code !== 'ENOENT') throw error; // first run in this checkout
}
if (seen !== inputs) {
	for (const cache of ['.svelte-check', 'node_modules/.cache/prettier'])
		rmSync(new URL(cache, app), { recursive: true, force: true });
	mkdirSync(new URL('node_modules/.cache/', app), { recursive: true });
	writeFileSync(stamp, inputs);
}
