// Problem reports name a pressed control only by its data-trail attribute, so every name must be fixed app vocabulary
// written in the source: an expression could carry a character name or a prompt into a public report.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const SRC = join(import.meta.dirname, '../../src');
const NAME = /^[a-z][A-Za-z0-9]{0,30}(?:\.[a-z][A-Za-z0-9]{0,30}){0,3}$/;
/** Shared rows that forward a `trail` prop; their callers are checked below. */
const FORWARDERS = new Set(['DeleteRow.svelte', 'RenameRow.svelte', 'ToolRow.svelte']);

const files = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory()
			? files(join(dir, entry.name))
			: /\.(svelte|ts)$/.test(entry.name)
				? [join(dir, entry.name)]
				: []
	);

test('every data-trail name is a static, well-formed literal', () => {
	const problems: string[] = [];
	let named = 0;
	for (const file of files(SRC)) {
		const text = readFileSync(file, 'utf8');
		const base = file.split(/[\\/]/).at(-1)!;
		for (const [, value] of text.matchAll(/data-trail=("[^"]*"|\{[^}]*\}|'[^']*')/g)) {
			if (value === '{trail}' && FORWARDERS.has(base)) continue;
			const literal = /^"(.*)"$/.exec(value)?.[1];
			if (literal !== undefined && NAME.test(literal)) named++;
			else problems.push(`${base}: data-trail=${value}`);
		}
		// Callers of the forwarding rows pass literals too: trail="..." or trail: '...'.
		if (!base.endsWith('.svelte')) continue;
		// ReportButton hands a report its frozen trail entries (Problem.trail), not a control name.
		const PROBLEM_TRAIL = base === 'ReportButton.svelte' ? 'shownTrail' : undefined;
		for (const [, value] of text.matchAll(
			/\btrail(?:=|:\s*)("[^"]*"|'[^']*'|\{[^}]*\}|[A-Za-z_$][\w.$]*)/g
		)) {
			if ((value === '{trail}' && FORWARDERS.has(base)) || value === PROBLEM_TRAIL) continue;
			const literal = /^["'](.*)["']$/.exec(value)?.[1];
			if (literal === undefined || !NAME.test(literal)) problems.push(`${base}: trail ${value}`);
		}
	}
	expect(problems).toEqual([]);
	expect(named).toBeGreaterThan(100);
});
