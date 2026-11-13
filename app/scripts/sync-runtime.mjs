import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import ts from 'typescript';
import { CURRENT_FORMAT, EXPORT_ENGINES } from '../src/lib/store/manifest.ts';
import { assertEmbeddable } from './runtime-modules.mjs';

const directory = new URL('../src/lib/runtime/', import.meta.url);
const options = { ...(await resolveConfig(fileURLToPath(new URL('sources.ts', directory)))) };
const declarations = [];
for (const path of ['../store/manifest.ts', '../rig/rig.ts', '../image/png.ts']) {
	const text = await readFile(new URL(path, directory), 'utf8');
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
	for (const statement of source.statements)
		if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement))
			declarations.push(statement.getText(source));
}
const runtimeTypes = await format(
	declarations
		.join('\n\n')
		.replaceAll('typeof CURRENT_FORMAT', JSON.stringify(CURRENT_FORMAT))
		.replaceAll('typeof EXPORT_ENGINES', `readonly ${JSON.stringify(EXPORT_ENGINES)}`),
	{ ...options, parser: 'typescript' }
);
const sources = {};
for (const name of (await readdir(directory)).filter((name) => name.endsWith('.js')).sort())
	sources[name] = await readFile(new URL(name, directory), 'utf8');
assertEmbeddable(sources);
const target = new URL('sources.ts', directory);
const content = await format(
	`export const runtimeSources: Readonly<Record<string, string>> = ${JSON.stringify(sources)};\nexport const runtimeTypes = ${JSON.stringify(runtimeTypes)};\n`,
	{ ...options, parser: 'typescript' }
);
if (process.argv.includes('--check')) {
	for (const [name, expected] of [
		['sources.ts', content],
		['types.d.ts', runtimeTypes]
	])
		if (
			(await readFile(new URL(name, directory), 'utf8')).replaceAll('\r\n', '\n') !==
			expected.replaceAll('\r\n', '\n')
		)
			throw new Error('Runtime export sources are stale. Run npm run runtime:sync.');
} else {
	await writeFile(target, content);
	await writeFile(new URL('types.d.ts', directory), runtimeTypes);
}
