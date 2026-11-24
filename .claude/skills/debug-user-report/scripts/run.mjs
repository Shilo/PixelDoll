#!/usr/bin/env node
// Offline backup tooling for the debug-user-report skill. Spends nothing, opens nothing in a browser, writes only to --out.
//   node .claude/skills/debug-user-report/scripts/run.mjs audit <backup.zip> [--out <dir>]
//   node .claude/skills/debug-user-report/scripts/run.mjs sample <dir>
// audit: reads the ZIP in memory with the app's own readers (readRestoreSource, readBackupCopy), audits every character,
// summarizes debug/ when present, exports each character to every engine, re-imports the character ZIP and round-trips a
// restore and a new backup. It writes <out>/report.json (holds user data: keep it out of the repository) and prints a summary.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const app = resolve(here, '../../../../app');
const [mode, target, ...rest] = process.argv.slice(2);
const flag = (name) => {
	const at = rest.indexOf(name);
	return at >= 0 ? rest[at + 1] : undefined;
};

if (!['audit', 'sample'].includes(mode) || !target) {
	console.error('Usage: run.mjs audit <backup.zip> [--out <dir>] | run.mjs sample <dir>');
	process.exit(2);
}
const vitest = join(app, 'node_modules/vitest/vitest.mjs');
if (!existsSync(vitest)) {
	console.error('app/node_modules is missing: run npm ci in app/ first.');
	process.exit(2);
}
const zipPath = mode === 'audit' ? resolve(target) : undefined;
if (zipPath && !existsSync(zipPath)) {
	console.error(`No such file: ${zipPath}`);
	process.exit(2);
}
const out = resolve(
	mode === 'sample' ? target : (flag('--out') ?? join(tmpdir(), `pixeldoll-report-${Date.now()}`))
);
mkdirSync(out, { recursive: true });

const run = spawnSync(
	process.execPath,
	[vitest, 'run', '--config', join(here, 'vitest.config.mjs')],
	{
		cwd: app,
		encoding: 'utf8',
		env: {
			...process.env,
			TOOL_MODE: mode,
			TOOL_OUT: out,
			TOOL_ZIP: zipPath ?? '',
			TOOL_ZIP_NAME: zipPath ? basename(zipPath) : ''
		}
	}
);
if (run.status !== 0) {
	console.error((run.stdout + run.stderr).split('\n').slice(-60).join('\n'));
	console.error(
		`The tool itself failed (exit ${run.status}); fix the tool or read the ZIP by hand.`
	);
	process.exit(1);
}

if (mode === 'sample') {
	console.log(`Sample backups in ${out}:`);
	for (const name of JSON.parse(readFileSync(join(out, 'samples.json'), 'utf8')).written)
		console.log(`  ${join(out, name)}`);
	process.exit(0);
}

const r = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
const lines = [`Report: ${join(out, 'report.json')} (user data: never commit or paste publicly)`];
if (r.unzip) lines.push(`UNZIP FAILED: ${r.unzip.message}`);
if (r.layout) {
	const l = r.layout;
	lines.push(
		`Layout: ${l.entries} entries, backup.json ${l.backupJson ? 'yes' : 'NO'}, ${l.blobs} artwork, ${l.archives} kept archives, debug/ ${l.debug ? 'yes' : 'NO'}${l.characterZip ? ', looks like a CHARACTER ZIP' : ''}${l.other.length ? `, other: ${l.other.join(', ')}` : ''}`
	);
}
if (r.index?.unreadable) lines.push(`backup.json unreadable: ${r.index.unreadable.message}`);
else if (r.index)
	lines.push(
		`Index: ${r.index.format}, build ${r.index.build}, ${r.index.characters?.length ?? '?'} characters, ${r.index.listedMissing} listed missing artwork, ${r.index.omittedAtBackup} omitted when backed up`
	);
if (r.indexSecretLeaks?.length)
	lines.push(`SECRET-NAMED FIELDS WITH VALUES in backup.json: ${r.indexSecretLeaks.join(', ')}`);
if (r.restore?.refused)
	lines.push(`RESTORE REFUSED: ${r.restore.refused.key ?? ''} ${r.restore.refused.message}`);
else if (r.restore)
	lines.push(
		`Restore reads: ${r.restore.characters.length} characters, ${r.restore.artwork} artwork, ${r.restore.missingArtwork} missing artwork, ${r.restore.unreadable} unreadable, ${r.restore.trimmedHistory} trimmed history`
	);
if (r.openAsCopy?.refused) lines.push(`OPEN AS COPY REFUSED: ${r.openAsCopy.refused.message}`);
for (const o of r.omitted ?? []) lines.push(`Left out ${o.key}: ${o.why}`);
for (const c of r.characters ?? []) {
	lines.push(
		`Character ${c.id} "${c.name}": ${c.items.length} items, moves ${c.moves.join(' ')}, dirs ${c.directions.join(' ')}, ${c.problems.length} problems, ${c.notes.length} notes`
	);
	for (const p of c.problems.slice(0, 8)) lines.push(`  ! ${p}`);
	if (c.problems.length > 8) lines.push(`  ! … ${c.problems.length - 8} more in report.json`);
}
if (r.roundTrip?.threw) lines.push(`ROUND TRIP THREW: ${r.roundTrip.threw.message}`);
else if (r.roundTrip)
	lines.push(
		`Round trip: plan ${r.roundTrip.plan.map((e) => `${e.id}=${e.action}`).join(' ')}; ${r.roundTrip.restored} restored; changed after re-backup: ${r.roundTrip.changed.length ? r.roundTrip.changed.join(', ') : 'none'}${r.roundTrip.blockers.length ? `; blockers ${JSON.stringify(r.roundTrip.blockers)}` : ''}`
	);
const d = r.debug;
if (!d) lines.push('Debug details: NONE (no debug/ folder)');
else {
	lines.push(
		`Debug: ${d.files.length} files, ${d.images} images${d.failed ? `, COLLECTION FAILED: ${d.failed.trim()}` : ''}${d.unreadable.length ? `, unreadable: ${d.unreadable.join('; ')}` : ''}`
	);
	if (d.secretLeaks.length)
		lines.push(
			`  SECRET-NAMED FIELDS WITH VALUES: ${d.secretLeaks.join(', ')} (do not print them)`
		);
	if (d.log) {
		lines.push(
			`  Log: ${d.log.count} entries ${JSON.stringify(d.log.levels)} from ${d.log.first} to ${d.log.last}`
		);
		for (const e of d.log.problems.slice(-10))
			lines.push(`    ${e.at} ${e.level} [${e.source}] ${e.message}`);
	}
	if (d.jobs) {
		lines.push(`  Jobs: ${d.jobs.count} ${JSON.stringify(d.jobs.states)}`);
		for (const j of d.jobs.notDone.slice(0, 10))
			lines.push(
				`    ${j.id} ${j.state} ${j.endpoint} "${j.label}" created ${j.createdAt}${j.errorKind ? ` ${j.errorKind}` : ''}${j.error ? `: ${j.error}` : ''}`
			);
	}
	if (d.activity) {
		lines.push(`  Activity: ${d.activity.count} calls, ${d.activity.failed.length} failed`);
		for (const a of d.activity.failed.slice(0, 10))
			lines.push(`    ${a.at} ${a.method} ${a.endpoint} ${a.status ?? a.state}`);
	}
	if (d.environment) {
		const s = d.environment.storage?.estimate;
		lines.push(
			`  Environment: ${JSON.stringify(d.environment.report)}${s?.quota ? `, storage ${Math.round((100 * s.usage) / s.quota)}% of ${Math.round(s.quota / 1e6)} MB` : ''}, persisted ${JSON.stringify(d.environment.storage?.persisted)}`
		);
	}
	if (d.records) lines.push(`  Records: ${Object.keys(d.records).join(', ') || 'none'}`);
}
console.log(lines.join('\n'));
