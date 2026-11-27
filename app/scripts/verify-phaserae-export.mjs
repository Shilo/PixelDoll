// Runs Phaser AE exports in the real Phaser AE engine. No PixelLab calls. The engine is not public on npm: make a game
// folder once with `npx -y @phaser-ae/cli blank <name> <folder>` (a free phaser.io account) and pass it here. This script
// owns that folder's game/main.ts, game/harness.*, game/manifest.json and game/pixeldoll/: use a folder kept for it.
// node --experimental-transform-types app/scripts/verify-phaserae-export.mjs --game <folder> [--zip actual-ui-export.zip]
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, dirname, extname, join, normalize, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { unzip } from '../src/lib/store/zip.ts';
import { decodePngBytes, encodePngBytes } from '../src/lib/image/pngraw.ts';
import { bakedSheetPath } from '../src/lib/export/paths.ts';
import { sampleTimeline, timelineDuration } from '../src/lib/runtime/timeline.js';
import { reviewArchives } from './export-review-fixtures.mjs';

const app = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({
	options: {
		only: { type: 'string' },
		game: { type: 'string' },
		output: { type: 'string' },
		zip: { type: 'string', multiple: true }
	}
});
assert(values.game, 'Pass --game <folder made by phaser-ae blank>.');
const folder = resolve(values.game),
	gameDir = join(folder, 'game');
assert(
	existsSync(join(folder, 'phaser', 'bin', 'bake.mjs')),
	`${folder} has no Phaser AE engine (phaser/bin/bake.mjs).`
);
const cache = join(app, 'node_modules/.cache/phaserae-native-verification');
const output = resolve(values.output ?? join(cache, 'results.json'));
mkdirSync(cache, { recursive: true });
const engineRelease = JSON.parse(
	readFileSync(join(folder, 'phaser', '.engine-release.json'), 'utf8')
);
const original = JSON.parse(readFileSync(join(gameDir, 'manifest.json'), 'utf8'));
const SCREEN = 1024,
	BACKGROUND = [255, 0, 255];

const archives = await reviewArchives('phaserae', cache);
for (const file of values.zip ?? [])
	archives.push({ label: basename(file), zip: new Uint8Array(readFileSync(file)) });
for (const archive of archives) {
	archive.files = await unzip(archive.zip);
	archive.manifest = JSON.parse(new TextDecoder().decode(archive.files.get('manifest.json')));
	assert(
		archive.files.has('phaserae/paperdoll.js'),
		`${archive.label} must contain a Phaser AE export.`
	);
	assert(
		archive.manifest.export?.baked?.length,
		`${archive.label} needs dressed character sheets as the pixel oracle.`
	);
}

// Each control mutates the delivered runtime; every check that should notice it must fail, or the check proves nothing.
const CONTROLS = {
	'wrong-pivot': [
		'sprite.x = x + (point.x + f.w / 2 - f.x) * scale;',
		'sprite.x = x + (point.x + f.w / 2 - f.x + 1) * scale;'
	],
	'restart-every-play': [
		'if (restart || anim !== this.anim || dir !== this.dir || this.completed) this.elapsed = 0;',
		'this.elapsed = 0;'
	],
	'uniform-duration': [
		'return move ? sampleTimeline(move.frames, this.elapsed, move.loop) : null;',
		'return move ? sampleTimeline(move.frames.map((f) => ({ ...f, ms: 100 })), this.elapsed, move.loop) : null;'
	],
	'no-palette': ['if (!table.size) return original;', 'return original;'],
	'no-covers': ['for (const item of shownItems(m, on))', 'for (const item of on)'],
	'no-hides': ['if (hidden.has(item.slot)) continue;', ''],
	'wrong-direction': [
		'findIndex((d) => d.id === direction)',
		"findIndex((d) => d.id === (direction === 'west' ? 'east' : direction))"
	],
	'turn-restarts': [
		'    this.dir = dir;\n    this.sync();',
		'    this.dir = dir; this.elapsed = 0;\n    this.sync();'
	],
	'no-feet': ["const feet = this.game.world?.kind === 'topdown';", 'const feet = false;'],
	'reverse-pool': [
		'show(this.pool[order], draw.item, draw.layer, this.anim',
		'show(this.pool[this.pool.length - 1 - order], draw.item, draw.layer, this.anim'
	],
	'state-loop': [
		'return !!move && !move.loop && this.elapsed',
		'return !!move && false && this.elapsed'
	]
};
const controlsFor = (archive, world) => [
	'none',
	...(archive.label === 'global-settings-pipeline'
		? [
				'wrong-pivot',
				'restart-every-play',
				'uniform-duration',
				...(world === 'side' ? ['reverse-pool'] : [])
			]
		: []),
	...(archive.label === 'eight-direction-masks-hands-alpha'
		? [
				'no-palette',
				'no-covers',
				'no-hides',
				'wrong-direction',
				'turn-restarts',
				...(world === 'topdown' ? ['no-feet'] : [])
			]
		: []),
	...(archive.label === 'ready-stance-state' ? ['state-loop'] : [])
];

function bake(manifest, main) {
	writeFileSync(join(gameDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
	writeFileSync(join(gameDir, 'main.ts'), main);
	const r = spawnSync(
		process.execPath,
		[join(folder, 'phaser', 'bin', 'bake.mjs'), 'build', 'game', 'dist'],
		{ cwd: folder, encoding: 'utf8' }
	);
	assert.equal(r.status, 0, `Phaser AE build failed:\n${r.stdout}${r.stderr}`);
	return join(folder, 'dist');
}
const screen = {
	width: SCREEN,
	height: SCREEN,
	fit: 'fixed',
	background: '#ff00ff',
	pixelArt: true
};
const withWorld = (world, extra = {}) => ({
	...original,
	assets: [],
	screen,
	packs: [
		...original.packs.filter((p) => p.id !== 'world-topdown'),
		...(world === 'topdown' ? [{ id: 'world-topdown' }] : [])
	],
	...extra
});
const STAGE = `import { game } from './engine.js';
export const Stage = { name: 'stage', enter(): void { } };
game.scenes.register(Stage);
await game.start();
game.scenes.go('stage');
`;

function serve(dist, files = new Map()) {
	const server = createServer((req, res) => {
		const name = decodeURIComponent(new URL(req.url, 'http://x').pathname);
		const body =
			files.get(name) ??
			(() => {
				try {
					return readFileSync(
						normalize(join(dist, name.endsWith('/') ? name + 'index.html' : name))
					);
				} catch {
					return null;
				}
			})();
		if (!body) return res.writeHead(404).end();
		const type = {
			'.html': 'text/html',
			'.js': 'text/javascript',
			'.json': 'application/json',
			'.png': 'image/png',
			'.wasm': 'application/wasm'
		}[extname(name.endsWith('/') ? 'index.html' : name)];
		res.writeHead(200, { 'content-type': type ?? 'application/octet-stream' }).end(body);
	});
	return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const results = [];
const browser = await chromium.launch({ headless: true });
async function open(url) {
	const page = await browser.newPage({
		viewport: { width: SCREEN, height: SCREEN },
		deviceScaleFactor: 1
	});
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	await page.goto(url);
	await page.waitForFunction(() => globalThis.game?.isReady === true, null, { timeout: 60000 });
	await page.evaluate(() => globalThis.game.clock.hold());
	return { page, errors };
}
async function shot(page) {
	const box = await page.evaluate(() => {
		const r = document.querySelector('canvas').getBoundingClientRect();
		return { x: r.left, y: r.top, width: r.width, height: r.height };
	});
	assert.deepEqual(
		[box.width, box.height],
		[SCREEN, SCREEN],
		'canvas must be one CSS pixel per logical pixel'
	);
	return decodePngBytes(await page.screenshot({ clip: box }));
}

/** Every outfit, move, direction and playlist entry against the dressed character sheets, plus engine draw order. */
async function pixels(page, archive, check) {
	const m = archive.manifest,
		size = m.export.bakedCell,
		pivot = m.export.bakedPivot,
		pitch = { w: size.w + 4, h: size.h + 4 },
		cols = Math.floor(SCREEN / pitch.w);
	let compared = 0,
		dumped = false;
	for (const preset of m.presets.filter((p) => m.export.baked.includes(p.id)))
		for (const move of m.rig.animations) {
			const sheet = await decodePngBytes(archive.files.get(bakedSheetPath(preset.id, move.id)));
			const specs = [];
			for (const [row, direction] of m.rig.directions.entries()) {
				if (move.directions && !move.directions.includes(direction.id)) continue;
				let at = 0;
				for (const frame of move.frames) {
					const i = specs.length;
					specs.push({
						row,
						dir: direction.id,
						cell: frame.cell,
						at: at + 1,
						gx: (i % cols) * pitch.w,
						gy: Math.floor(i / cols) * pitch.h
					});
					at += frame.ms;
				}
			}
			assert(specs.length <= cols * cols, 'the grid must fit on one screen');
			const shown = await page.evaluate(
				async ({ preset, clip, specs, pivot }) => {
					const t = globalThis.pdTest;
					for (const d of t.dolls ?? []) d.destroy();
					t.dolls = specs.map((s) => {
						const d = new t.api.Paperdoll(t.game, s.gx + pivot.x, s.gy + pivot.y, t.m);
						d.applyPreset(preset);
						d.play(clip, s.dir, true);
						d.elapsed = s.at; // the playlist entry under test; the clock checks drive time through the public API
						d.sync();
						return d;
					});
					await t.game.advance(1 / 60);
					return t.dolls.map((d) => ({
						cell: d.cell(),
						depths: d.placed.map((p) => p.sprite.depth)
					}));
				},
				{ preset: preset.id, clip: move.id, specs, pivot }
			);
			const image = await shot(page);
			for (const [i, s] of specs.entries()) {
				const where = `${preset.id}/${move.id}/${s.dir}/${s.cell}`;
				check(shown[i].cell === s.cell, `clock: ${where} showed cell ${shown[i].cell}`);
				const depths = shown[i].depths;
				check(
					depths.every((d, k) => k === 0 || d >= depths[k - 1]),
					`order: ${where} engine depths ${depths.join(',')} run against drawList`
				);
				let bad = null;
				for (let y = 0; y < size.h && !bad; y++)
					for (let x = 0; x < size.w && !bad; x++) {
						const src = ((s.row * size.h + y) * sheet.w + s.cell * size.w + x) * 4,
							dst = ((s.gy + y) * image.w + s.gx + x) * 4,
							alpha = sheet.data[src + 3] / 255;
						for (let c = 0; c < 3; c++) {
							const wanted = Math.round(sheet.data[src + c] * alpha + BACKGROUND[c] * (1 - alpha));
							if (Math.abs(image.data[dst + c] - wanted) > (alpha > 0 && alpha < 1 ? 1 : 0))
								bad = `${x},${y} channel ${c}: actual ${image.data[dst + c]}, wanted ${wanted}`;
						}
					}
				if (bad && process.env.PHASERAE_DUMP && !dumped) {
					dumped = true;
					writeFileSync(join(cache, 'failed-frame.png'), await encodePngBytes(image));
				}
				check(!bad, `pixels: ${where} at ${bad}`);
				compared++;
			}
		}
	return compared;
}

/**
 * Two dressed dolls overlapping, the back one 6 px higher and 20 px right: the front doll must cover it completely. In
 * a top-down world that holds only when every layer sorts at its doll's feet; in a side world it is spawn order.
 */
async function overlap(page, archive, check) {
	const m = archive.manifest,
		size = m.export.bakedCell,
		pivot = m.export.bakedPivot,
		preset = m.presets.filter((p) => m.export.baked.includes(p.id)).at(-1),
		move = m.rig.animations[0],
		row = m.rig.directions.findIndex((d) => !move.directions || move.directions.includes(d.id)),
		cell = move.frames[0].cell,
		front = { x: 200 + pivot.x, y: 200 + pivot.y },
		back = { x: front.x + 20, y: front.y - 6 };
	await page.evaluate(
		async ({ preset, clip, dir, front, back }) => {
			const t = globalThis.pdTest;
			for (const d of t.dolls ?? []) d.destroy();
			t.dolls = [back, front].map((at) => {
				const d = new t.api.Paperdoll(t.game, at.x, at.y, t.m, preset);
				d.play(clip, dir, true);
				return d;
			});
			await t.game.advance(1 / 60);
		},
		{ preset: preset.id, clip: move.id, dir: m.rig.directions[row].id, front, back }
	);
	const image = await shot(page),
		sheet = await decodePngBytes(archive.files.get(bakedSheetPath(preset.id, move.id)));
	const wanted = new Float64Array(image.w * image.h * 3);
	for (let i = 0; i < image.w * image.h; i++) wanted.set(BACKGROUND, i * 3);
	const touched = new Set();
	for (const at of [back, front])
		for (let y = 0; y < size.h; y++)
			for (let x = 0; x < size.w; x++) {
				const src = ((row * size.h + y) * sheet.w + cell * size.w + x) * 4,
					alpha = sheet.data[src + 3] / 255,
					dst = (at.y - pivot.y + y) * image.w + at.x - pivot.x + x;
				if (!alpha) continue;
				touched.add(dst);
				for (let c = 0; c < 3; c++)
					wanted[dst * 3 + c] = Math.round(
						sheet.data[src + c] * alpha + wanted[dst * 3 + c] * (1 - alpha)
					);
			}
	let bad = null;
	for (const dst of touched)
		for (let c = 0; c < 3 && !bad; c++)
			if (Math.abs(image.data[dst * 4 + c] - wanted[dst * 3 + c]) > 2)
				bad = `${dst % image.w},${Math.floor(dst / image.w)} channel ${c}: actual ${image.data[dst * 4 + c]}, wanted ${wanted[dst * 3 + c]}`;
	check(!bad, `overlap: ${preset.id}/${move.id} front doll does not cover the back one at ${bad}`);
}

/** Playlist timing, layer synchronization, repeat/restart/replay, turning and rejection atomicity, through the API. */
async function behavior(page, archive, check) {
	const m = archive.manifest;
	const log = await page.evaluate(async (label) => {
		const { game, api, m } = globalThis.pdTest,
			out = { notes: [] };
		const note = (ok, text) => ok || out.notes.push(text);
		const step = (n) => game.advance(n / 60);
		// The cell every visible layer sprite shows, read from the engine's frames, not from the doll.
		const showing = (d) =>
			d.placed
				.filter((p) => p.sprite.visible)
				.map((p) => {
					const key = p.sprite.texture,
						local = p.sprite.frame - game.assets.frames(key),
						cells = m.rig.animations.find((a) => a.id === d.anim).cells;
					return `${m.rig.directions[Math.floor(local / cells)].id}/${local % cells}`;
				});
		const state = (d) =>
			JSON.stringify([d.anim, d.dir, d.elapsed, d.equipped, d.variants, d.actionPlaying]);
		const rejects = (d, call, text) => {
			const before = state(d);
			let threw = false;
			try {
				call();
			} catch {
				threw = true;
			}
			note(threw && state(d) === before, 'reject: ' + text);
		};
		const before = game.roster.tagged('pdtest').length;
		const d = new api.Paperdoll(game, 300, 300, m, undefined, { tags: ['pdtest'] });
		rejects(d, () => d.setDirection(m.rig.directions[0].id), 'turn before any move');
		const moves = m.rig.animations.map((a) => a.id),
			first = m.rig.animations[0],
			dir0 = (first.directions ?? m.rig.directions.map((x) => x.id))[0];
		out.timeline = {};
		for (const move of m.rig.animations) {
			const dir = (move.directions ?? m.rig.directions.map((x) => x.id))[0];
			d.play(move.id, dir, true);
			const seen = [];
			for (let i = 0; i < 48; i++) {
				const cells = [...new Set(showing(d))];
				note(cells.length === 1, `sync: ${move.id} layers disagree at step ${i}: ${cells}`);
				seen.push(cells[0]);
				await step(1);
			}
			out.timeline[move.id] = { dir, seen };
		}
		d.play(first.id, dir0, true);
		await step(3);
		const progress = d.elapsed;
		d.play(first.id, dir0);
		note(d.elapsed === progress, 'repeat: selecting the active clip must keep its progress');
		d.play(first.id, dir0, true);
		note(d.elapsed === 0, 'restart: an explicit restart must start over');
		const once = m.rig.animations.find((a) => !a.loop);
		if (once) {
			const dir = (once.directions ?? m.rig.directions.map((x) => x.id))[0];
			d.play(once.id, dir, true);
			await step(Math.ceil(once.frames.reduce((n, f) => n + f.ms, 0) / (1000 / 60)) + 2);
			note(d.completed, `once: ${once.id} must complete`);
			note(
				showing(d)[0] === `${dir}/${once.frames.at(-1).cell}`,
				`once: ${once.id} must hold its last cell`
			);
			d.play(once.id, dir);
			note(d.elapsed === 0 && !d.completed, `once: selecting completed ${once.id} must replay it`);
		}
		const turnable = m.rig.animations.find(
			(a) => (a.directions ?? m.rig.directions).length > 1 && a.loop
		);
		if (turnable) {
			const dirs = turnable.directions ?? m.rig.directions.map((x) => x.id);
			d.play(turnable.id, dirs[0], true);
			await step(7);
			const time = d.elapsed,
				cell = showing(d)[0].split('/')[1];
			d.setDirection(dirs[1]);
			note(
				d.elapsed === time && showing(d)[0] === `${dirs[1]}/${cell}`,
				'turn: setDirection must keep time and cell'
			);
			d.setDirection(dirs[1]);
			note(d.elapsed === time, 'turn: the current direction is a no-op');
		}
		const spots = () =>
			d.placed.map((p) => [p.sprite.x, p.sprite.y, p.sprite.scale, p.sprite.visible]);
		const at = spots();
		d.x += 5;
		d.y -= 3;
		note(
			spots().every((s, i) => s[0] === at[i][0] + 5 && s[1] === at[i][1] - 3),
			'move: every layer must follow x and y'
		);
		d.scale = 2;
		note(
			spots().every((s, i) => s[2] === 2 && s[0] - d.x === 2 * (at[i][0] - (d.x - 5))),
			'scale: layer offsets from the pivot must scale with the doll'
		);
		d.scale = 1;
		d.visible = false;
		note(
			spots().every((s) => !s[3]),
			'visible: hiding the doll must hide every layer'
		);
		d.visible = true;
		d.teleport(100, 120);
		note(
			d.x === 100 && d.y === 120 && spots().every((s) => s[3]),
			'teleport: the doll must move and show again'
		);
		rejects(d, () => d.play('missing-move', dir0), 'unknown move');
		rejects(d, () => d.play(first.id, 'nowhere'), 'unknown direction');
		rejects(d, () => d.setDirection('nowhere'), 'unknown turn');
		rejects(d, () => d.equip('body', m.rig.baseItem), 'body slot');
		rejects(d, () => d.equip(m.slots.at(-1).id, 'missing-item'), 'unknown item');
		rejects(d, () => d.applyPreset('missing-outfit'), 'unknown outfit');
		rejects(d, () => d.playAction('missing-move', dir0), 'unknown action');
		d.destroy();
		await step(2);
		note(game.roster.tagged('pdtest').length === before, 'destroy: every sprite must be removed');
		out.moves = moves;
		return out;
	}, archive.label);
	for (const text of log.notes) check(false, text);
	for (const move of m.rig.animations) {
		const { dir, seen } = log.timeline[move.id];
		const wanted = seen.map(
			(_, i) => `${dir}/${sampleTimeline(move.frames, (i * 1000) / 60, move.loop)}`
		);
		const first = seen.findIndex((cell, i) => cell !== wanted[i]);
		check(
			first < 0,
			`timeline: ${move.id} step ${first}: showed ${seen[first]}, wanted ${wanted[first]} (${timelineDuration(move.frames)} ms)`
		);
	}
}

try {
	// 1. The README path: a static import, the sheets copied through manifest "assets", the strict build gate.
	{
		const archive = archives[0],
			hero = join(gameDir, 'pixeldoll', 'hero');
		rmSync(join(gameDir, 'pixeldoll'), { recursive: true, force: true });
		for (const [name, bytes] of archive.files) {
			mkdirSync(dirname(join(hero, name)), { recursive: true });
			writeFileSync(join(hero, name), bytes);
		}
		const listed = JSON.parse(readFileSync(join(hero, 'phaserae', 'assets.json'), 'utf8'));
		const folderName = listed[0].slice(0, listed[0].indexOf('manifest.json'));
		const assets = listed.map((path) => 'pixeldoll/hero/' + path.slice(folderName.length));
		writeFileSync(
			join(gameDir, 'harness.js'),
			'export function expose(values) { globalThis.pdTest = values; }\n'
		);
		writeFileSync(join(gameDir, 'harness.d.ts'), 'export function expose(values: object): void;\n');
		const dist = bake(
			withWorld('side', { assets }),
			`import { game } from './engine.js';
import { loadPaperdoll, Paperdoll } from './pixeldoll/hero/phaserae/paperdoll.js';
import { expose } from './harness.js';
const hero = await loadPaperdoll(game, 'pixeldoll/hero/');
export const Stage = { name: 'stage', enter(): void { expose({ game, api: { Paperdoll }, m: hero }); } };
game.scenes.register(Stage);
await game.start();
game.scenes.go('stage');
`
		);
		const missing = assets.filter((path) => !existsSync(join(dist, path)));
		const server = await serve(dist),
			{ page, errors } = await open(`http://127.0.0.1:${server.address().port}/`),
			failures = [];
		const check = (ok, text) => ok || failures.push(text);
		check(!missing.length, `assets: the build did not copy ${missing.join(', ')}`);
		const compared = await pixels(page, archive, check);
		check(!errors.length, `errors: ${errors.join(' | ')}`);
		results.push({
			label: 'readme-static-import side',
			compared,
			passed: !failures.length,
			failures: failures.slice(0, 20)
		});
		await page.close();
		server.close();
	}
	// 2. Every archive, world and control, with the runtime served next to each archive.
	for (const world of ['side', 'topdown']) {
		const dist = bake(withWorld(world), STAGE);
		for (const archive of archives.filter((a) => !values.only || a.label.includes(values.only)))
			for (const control of controlsFor(archive, world)) {
				let runtime = new TextDecoder().decode(archive.files.get('phaserae/paperdoll.js'));
				if (control !== 'none') {
					const [from, to] = CONTROLS[control];
					assert(runtime.includes(from), `Control ${control} no longer matches the runtime.`);
					runtime = runtime.replace(from, to);
				}
				const files = new Map([...archive.files].map(([name, bytes]) => ['/hero/' + name, bytes]));
				files.set('/hero/phaserae/paperdoll.js', new TextEncoder().encode(runtime));
				const server = await serve(dist, files),
					{ page, errors } = await open(`http://127.0.0.1:${server.address().port}/`),
					failures = [];
				const check = (ok, text) => ok || failures.push(text);
				let compared = 0;
				try {
					await page.evaluate(async () => {
						const api = await import('/hero/phaserae/paperdoll.js');
						globalThis.pdTest = {
							game: globalThis.game,
							api,
							m: await api.loadPaperdoll(globalThis.game, 'hero/')
						};
					});
					compared = await pixels(page, archive, check);
					await overlap(page, archive, check);
					await behavior(page, archive, check);
				} catch (error) {
					failures.push(`run: ${error.message.split('\n')[0]}`);
				}
				check(!errors.length, `errors: ${errors.join(' | ')}`);
				const label = `${world} ${archive.label} ${control}`;
				const passed = control === 'none' ? !failures.length : failures.length > 0;
				results.push({
					label,
					compared,
					passed,
					failures: failures.slice(0, control === 'none' ? 20 : 3)
				});
				console.log(
					`${passed ? 'PASS' : 'FAIL'} ${label}${control === 'none' ? '' : ` (control caught: ${failures[0] ?? 'nothing'})`}`
				);
				await page.close();
				server.close();
			}
	}
} finally {
	await browser.close();
	writeFileSync(join(gameDir, 'manifest.json'), JSON.stringify(original, null, 2) + '\n');
}
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ engine: engineRelease, results }, null, 2) + '\n');
for (const r of results.filter((r) => !r.passed))
	console.log(`FAILED ${r.label}:\n  ${r.failures.join('\n  ') || 'control was not detected'}`);
console.log(
	`${results.filter((r) => r.passed).length}/${results.length} passed, engine ${engineRelease.id} (kernel ${engineRelease.kernel ?? '?'}) -> ${output}`
);
if (results.some((r) => !r.passed)) process.exitCode = 1;
