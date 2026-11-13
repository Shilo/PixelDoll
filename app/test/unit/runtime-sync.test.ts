import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// The temp copy lives under app/ so bare imports and the Prettier config resolve through
// app/node_modules without symlinking it. Cleanup removes only the temp directory.
const app = fileURLToPath(new URL('../../', import.meta.url));

/** @param {string} directory @param {...string} args */
const sync = (directory: string, ...args: string[]) =>
	spawnSync(
		process.execPath,
		['--experimental-transform-types', join(directory, 'scripts/sync-runtime.mjs'), ...args],
		{ cwd: directory, encoding: 'utf8' }
	);

test('runtime synchronization rejects cross-module module-scope name collisions before writing', async () => {
	const directory = await mkdtemp(join(app, '.runtime-sync-'));
	try {
		await mkdir(join(directory, 'scripts'));
		await cp(join(app, 'src/lib'), join(directory, 'src/lib'), { recursive: true });
		for (const name of ['scripts/sync-runtime.mjs', 'scripts/runtime-modules.mjs'])
			await cp(join(app, name), join(directory, name));
		expect(sync(directory).status).toBe(0);
		expect(sync(directory, '--check').status).toBe(0);

		const canonical = join(directory, 'src/lib/runtime/timeline.js');
		const generated = join(directory, 'src/lib/runtime/sources.ts');
		const generatedTypes = join(directory, 'src/lib/runtime/types.d.ts');
		const source = await readFile(canonical, 'utf8');
		const transported = await readFile(generated, 'utf8');
		const transportedTypes = await readFile(generatedTypes, 'utf8');

		await writeFile(canonical, source + '\nconst makeImg = 0;\n');
		for (const [args, mode] of [
			[[] as string[], 'generation'],
			[['--check'], 'check']
		] as const) {
			const rejected = sync(directory, ...args);
			expect(rejected.status, mode).not.toBe(0);
			expect(rejected.stderr).toContain('timeline.js');
			expect(rejected.stderr).toContain('makeImg');
			expect(rejected.stderr).toContain('paperdoll.js');
		}
		expect(await readFile(generated, 'utf8')).toBe(transported);
		expect(await readFile(generatedTypes, 'utf8')).toBe(transportedTypes);

		await writeFile(canonical, source + '\nconst { flipH = () => {} } = {};\n');
		const rejected = sync(directory, '--check');
		expect(rejected.status).not.toBe(0);
		expect(rejected.stderr).toContain('timeline.js');
		expect(rejected.stderr).toContain('flipH');
		expect(rejected.stderr).toContain('paperdoll.js');

		await writeFile(canonical, source);
		expect(sync(directory).status).toBe(0);
		expect(sync(directory, '--check').status).toBe(0);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
