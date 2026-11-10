// Duration-balanced e2e shards for CI (docs/testing/test-performance.md, "How sharding actually splits the work").
// Playwright's --shard cuts the ordered test list into slices of equal test count, so adjacent heavy tests share a shard.
// This assigns each test to the currently lightest shard, heaviest first, using durations recorded from CI, and writes a
// --test-list file. Every job computes the same plan, checks that the shards cover every test exactly once, and checks
// that Playwright selects exactly the planned tests before anything runs.
//
//   node scripts/e2e-shard.mjs <current>/<total> <list-file>   write one shard's test list (CI)
//   node scripts/e2e-shard.mjs update <ci-log>...              rewrite test/e2e/durations.json from `gh run view <id> --log`
//                                                              files, averaging each test over the logs that passed it
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DURATIONS = fileURLToPath(new URL('../test/e2e/durations.json', import.meta.url));
const SEP = ' › ';

/** One key per test: project, file the test is written in, and its title path, as Playwright prints them. */
const key = (project, file, titles) => [`[${project}]`, file, ...titles].join(SEP);

function listTests(extra = []) {
	const json = execFileSync(
		process.execPath,
		[
			fileURLToPath(new URL('../node_modules/playwright/cli.js', import.meta.url)),
			'test',
			'--list',
			'--reporter=json',
			...extra
		],
		{ cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', maxBuffer: 1 << 28 }
	);
	const tests = [];
	const walk = (suite, specFile, titles) => {
		for (const spec of suite.specs ?? [])
			for (const t of spec.tests)
				tests.push({
					project: t.projectName,
					specFile,
					titles: [...titles, spec.title],
					key: key(t.projectName, spec.file, [...titles, spec.title])
				});
		for (const child of suite.suites ?? []) walk(child, specFile, [...titles, child.title]);
	};
	for (const file of JSON.parse(json).suites) walk(file, file.file, []);
	return tests;
}

function plan(total) {
	const tests = listTests();
	const keys = tests.map((t) => t.key);
	if (new Set(keys).size !== keys.length)
		throw Error('Two tests share a project, file and title path.');
	// Playwright trims each test-list token and splits lines on "›", so such titles cannot be named exactly.
	for (const t of tests)
		if (t.titles.some((title) => !title || title !== title.trim() || /[›\n]/.test(title)))
			throw Error(
				`A title is empty, padded or contains "›" or a newline, so a test list cannot name it: ${t.key}`
			);
	const known = JSON.parse(readFileSync(DURATIONS, 'utf8'));
	for (const [k, v] of Object.entries(known))
		if (typeof v !== 'number' || !(v >= 0))
			throw Error(`durations.json: ${k} is not a duration in seconds`);
	const recorded = keys
		.filter((k) => k in known)
		.map((k) => known[k])
		.sort((a, b) => a - b);
	const fallback = recorded.length ? recorded[Math.floor(recorded.length / 2)] : 1; // a new or renamed test weighs a median test
	const weight = (k) => known[k] ?? fallback;
	const shards = Array.from({ length: total }, () => ({ seconds: 0, keys: [] }));
	for (const k of [...keys].sort((a, b) => weight(b) - weight(a) || (a < b ? -1 : a > b ? 1 : 0))) {
		const lightest = shards.reduce((best, s) => (s.seconds < best.seconds ? s : best));
		lightest.seconds += weight(k);
		lightest.keys.push(k);
	}
	const assigned = shards.flatMap((s) => s.keys);
	if (assigned.length !== keys.length || new Set(assigned).size !== keys.length)
		throw Error('The shard plan does not cover every test exactly once.');
	// A test list loads only the files it names, and some tests are written in helpers that a spec imports, so name every spec.
	const specs = [...new Set(tests.map((t) => key(t.project, t.specFile, ['(load file)'])))];
	return { shards, specs, fallback };
}

function writeShard(arg, out) {
	const [current, total] = arg.split('/').map(Number);
	if (!Number.isInteger(current) || !Number.isInteger(total) || current < 1 || current > total)
		throw Error(`Expected <current>/<total>, got ${arg}`);
	const { shards, specs } = plan(total);
	const mine = shards[current - 1];
	if (!mine.keys.length) throw Error(`Shard ${current}/${total} has no tests; use fewer shards.`);
	writeFileSync(out, [...specs, ...mine.keys].join('\n') + '\n');
	const selected = listTests(['--test-list', out]).map((t) => t.key);
	const expected = [...mine.keys].sort();
	if (JSON.stringify([...selected].sort()) !== JSON.stringify(expected))
		throw Error(
			`Playwright selects ${selected.length} tests, the plan has ${expected.length}:\n` +
				[
					...selected.filter((k) => !mine.keys.includes(k)).map((k) => `+ ${k}`),
					...expected.filter((k) => !selected.includes(k)).map((k) => `- ${k}`)
				].join('\n')
		);
	console.log(
		`Shard ${current}/${total}: ${mine.keys.length} tests, about ${Math.round(mine.seconds)} s ` +
			`(all shards: ${shards.map((s) => Math.round(s.seconds)).join(' ')})`
	);
}

function update(logs) {
	const tests = new Set(listTests().map((t) => t.key));
	const runs = {};
	for (const log of logs)
		// `gh run view --log` keeps color codes, either raw or printed as "^[".
		for (const line of readFileSync(log, 'utf8')
			.replace(/(?:\x1b|\^\[)\[[0-9;]*m/g, '')
			.split('\n')) {
			// list reporter: "✓  12 [studio] › test/e2e/file.ts:35:3 › describe › title (13.7s)"; a passing retry ends "(retry #1)".
			const m = line.match(
				/✓\s+\d+ \[([^\]]+)\] › (?:test\/e2e\/)?(\S+?):\d+:\d+ › (.*?)(?: \(retry #\d+\))? \(([\d.]+)(ms|s|m)\)\s*$/
			);
			if (!m) continue;
			const k = key(m[1], m[2], m[3].split(SEP));
			if (tests.has(k)) (runs[k] ??= []).push(m[4] * { ms: 0.001, s: 1, m: 60 }[m[5]]); // 60 s and longer print as "1.5m"
		}
	const seconds = Object.fromEntries(
		Object.entries(runs).map(([k, s]) => [
			k,
			Math.round((s.reduce((a, b) => a + b) / s.length) * 10) / 10
		])
	);
	const missing = [...tests].filter((k) => !(k in seconds));
	if (missing.length > tests.size / 2)
		throw Error(
			`Only ${tests.size - missing.length} of ${tests.size} tests have durations in these logs; durations.json is unchanged.`
		);
	writeFileSync(
		DURATIONS,
		JSON.stringify(
			Object.fromEntries(Object.entries(seconds).sort(([a], [b]) => (a < b ? -1 : 1))),
			null,
			'\t'
		) + '\n'
	);
	console.log(
		`Recorded ${Object.keys(seconds).length} of ${tests.size} tests.${missing.length ? ` No duration: ${missing.join('; ')}` : ''}`
	);
}

const [command, arg, ...rest] = process.argv.slice(2);
if (command === 'update' && arg) update([arg, ...rest]);
else if (command && arg) writeShard(command, arg);
else
	throw Error('Usage: node scripts/e2e-shard.mjs <current>/<total> <list-file> | update <ci-log>');
