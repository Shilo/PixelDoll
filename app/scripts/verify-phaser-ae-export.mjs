// Runs Phaser AE exports in the real Phaser AE engine. No PixelLab calls. The engine is not public on npm: make a game
// folder once with `npx -y @phaser-ae/cli blank <name> <folder>` (a free phaser.io account) and pass it here. This script
// owns that folder's game/main.ts, game/hero.ts, game/harness.*, game/manifest.json and game/pixeldoll/: keep a folder for it.
// node --experimental-transform-types app/scripts/verify-phaser-ae-export.mjs --game <folder> [--zip actual-ui-export.zip]
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
		// webgpu needs a headed browser on this kind of machine: headless Chromium has no WebGPU device
		renderer: { type: 'string' },
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
const cache = join(app, 'node_modules/.cache/phaser-ae-native-verification');
const output = resolve(values.output ?? join(cache, 'results.json'));
mkdirSync(cache, { recursive: true });
const engineRelease = JSON.parse(
	readFileSync(join(folder, 'phaser', '.engine-release.json'), 'utf8')
);
const original = JSON.parse(readFileSync(join(gameDir, 'manifest.json'), 'utf8'));
const SCREEN = 1024,
	BACKGROUND = [255, 0, 255];

const archives = await reviewArchives('phaser-ae', cache);
for (const file of values.zip ?? [])
	archives.push({ label: basename(file), zip: new Uint8Array(readFileSync(file)) });
for (const archive of archives) {
	archive.files = await unzip(archive.zip);
	archive.manifest = JSON.parse(new TextDecoder().decode(archive.files.get('manifest.json')));
	assert(
		archive.files.has('phaser-ae/paperdoll.js'),
		`${archive.label} must contain a Phaser AE export.`
	);
	assert(
		archive.manifest.export?.baked?.length,
		`${archive.label} needs dressed character sheets as the pixel oracle.`
	);
}

// Each control mutates the delivered runtime; every check that should notice it must fail, or the check proves nothing.
const CONTROLS = {
	'wrong-pivot': ['ox: point.x + f.w / 2 - f.x,', 'ox: point.x + f.w / 2 - f.x + 1,'],
	'restart-every-play': [
		'if (restart || anim !== this.anim || dir !== this.dir || this.completed) {',
		'if (true) {'
	],
	'uniform-duration': [
		'return move ? sampleTimeline(move.frames, this.elapsed + BOUNDARY_MS, move.loop) : null;',
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
	'no-feet': [
		"a.z = this.nudge - (this.game.world?.kind === 'topdown' ? this.offset().y + (this.box.h * Math.abs(a.sy)) / 2 : 0);",
		'a.z = this.nudge;'
	],
	'reverse-order': ['this.placed = placed;', 'this.placed = placed.reverse();'],
	'canvas-lookup': [
		'const pixels = exact.has(s) ? await decodePngBytes(new Uint8Array(bytes), MAX_SIDE) : null;',
		"const pixels = exact.has(s) ? await createImageBitmap(new Blob([bytes])).then((b) => { const c = new OffscreenCanvas(b.width, b.height), x = c.getContext('2d'); x.drawImage(b, 0, 0); return { w: b.width, h: b.height, data: x.getImageData(0, 0, b.width, b.height).data }; }) : null;"
	],
	'no-dead-check': ['if (!this.actor.alive) { this.dispose(); return; }', ''],
	'no-stamp': ['if (move && this.stamp !== now) {', 'if (move) {'],
	'unturned-pivot': [
		'const cos = Math.cos(a.rot), sin = Math.sin(a.rot);',
		'const cos = 1, sin = 0;'
	],
	'state-loop': [
		'return !!move && !move.loop && this.elapsed',
		'return !!move && false && this.elapsed'
	]
};
const controlsFor = (archive, world) =>
	world === 'wrap'
		? archive.label === 'global-settings-pipeline'
			? ['none']
			: []
		: [
				'none',
				...(archive.label === 'global-settings-pipeline'
					? ['wrong-pivot', 'restart-every-play', 'uniform-duration', 'no-stamp', 'unturned-pivot']
					: []),
				...(archive.label === 'eight-direction-masks-hands-alpha'
					? [
							'no-palette',
							'no-covers',
							'no-hides',
							'wrong-direction',
							'turn-restarts',
							'reverse-order',
							...(world === 'topdown' ? ['no-feet'] : [])
						]
					: []),
				...(archive.label === 'ready-stance-state' ? ['state-loop', 'no-dead-check'] : []),
				...(archive.label === 'translucent-palette' ? ['canvas-lookup'] : [])
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
const withWorld = (world, extra = {}) =>
	world === 'wrap'
		? {
				...original,
				assets: [],
				screen,
				packs: [
					...original.packs.filter((p) => p.id !== 'world-topdown' && p.id !== 'world-side'),
					{ id: 'world-side', options: { wrap: { w: SCREEN, h: SCREEN } } }
				],
				...extra
			}
		: {
				...original,
				assets: [],
				screen,
				packs: [
					...original.packs.filter((p) => p.id !== 'world-topdown'),
					...(world === 'topdown' ? [{ id: 'world-topdown' }] : [])
				],
				...extra
			};
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
assert(
	[undefined, 'webgl2', 'webgpu'].includes(values.renderer),
	'--renderer is webgl2 (headless, the default) or webgpu (headed)'
);
const browser = await chromium.launch({ headless: values.renderer !== 'webgpu' });
const renderers = new Set();
async function open(url) {
	const page = await browser.newPage({
		viewport: { width: SCREEN, height: SCREEN },
		deviceScaleFactor: 1
	});
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	// failed requests are reported by URL (a headed browser also asks for /favicon.ico, which no game serves)
	page.on(
		'console',
		(m) =>
			m.type() === 'error' &&
			!m.text().startsWith('Failed to load resource') &&
			errors.push(m.text())
	);
	page.on('response', (r) => {
		if (r.status() >= 400 && !r.url().endsWith('/favicon.ico'))
			errors.push(`${r.status()} loading ${r.url()}`);
	});
	await page.goto(url);
	await page.waitForFunction(() => globalThis.game?.isReady === true, null, { timeout: 60000 });
	await page.evaluate(() => globalThis.game.clock.hold());
	// the backend render-auto chose: WebGPU first, WebGL2 when the browser has no WebGPU device
	const backend = await page.evaluate(() => {
		const r = globalThis.game.renderer;
		return String(r?.backend ?? r?.status ?? 'unknown');
	});
	renderers.add(backend);
	if (values.renderer)
		assert(
			backend.includes(values.renderer),
			`expected the ${values.renderer} renderer, the game chose ${backend}`
		);
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
					return t.dolls.map((d) => ({ cell: d.cell() }));
				},
				{ preset: preset.id, clip: move.id, specs, pivot }
			);
			const image = await shot(page);
			for (const [i, s] of specs.entries()) {
				const where = `${preset.id}/${move.id}/${s.dir}/${s.cell}`;
				check(shown[i].cell === s.cell, `clock: ${where} showed cell ${shown[i].cell}`);
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
		// A 12-unit green prop whose bottom edge is 2 units below the front doll's feet must draw over it: in a top-down
		// world that holds only when the doll sorts at its feet, not at its cell's bottom edge.
		prop = { x: front.x, y: front.y - 4, size: 12 },
		// six units higher, and level with the front doll's feet (spawn order decides): both must stay whole
		pairs = [
			[{ x: front.x + 20, y: front.y - 6 }, front],
			[
				{ x: front.x + 20 + 400, y: front.y },
				{ x: front.x + 400, y: front.y }
			]
		];
	await page.evaluate(
		async ({ preset, clip, dir, pairs, prop }) => {
			const t = globalThis.pdTest;
			for (const d of t.dolls ?? []) d.destroy();
			t.prop?.destroy();
			t.dolls = pairs.flat().map((at) => {
				const d = new t.api.Paperdoll(t.game, at.x, at.y, t.m, preset);
				d.play(clip, dir, true);
				return d;
			});
			t.prop = t.game.spawn({
				id: 'pdprop',
				layer: 'world',
				x: prop.x,
				y: prop.y,
				width: prop.size,
				height: prop.size,
				tint: '#00ff00'
			});
			await t.game.advance(1 / 60);
		},
		{ preset: preset.id, clip: move.id, dir: m.rig.directions[row].id, pairs, prop }
	);
	const image = await shot(page),
		sheet = await decodePngBytes(archive.files.get(bakedSheetPath(preset.id, move.id)));
	const wanted = new Float64Array(image.w * image.h * 3);
	for (let i = 0; i < image.w * image.h; i++) wanted.set(BACKGROUND, i * 3);
	const touched = new Set();
	for (const at of pairs.flat())
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
	for (let y = prop.y - prop.size / 2; y < prop.y + prop.size / 2; y++)
		for (let x = prop.x - prop.size / 2; x < prop.x + prop.size / 2; x++) {
			const dst = y * image.w + x;
			touched.add(dst);
			wanted.set([0, 255, 0], dst * 3);
		}
	let bad = null;
	for (const dst of touched)
		for (let c = 0; c < 3 && !bad; c++)
			if (Math.abs(image.data[dst * 4 + c] - wanted[dst * 3 + c]) > 2)
				bad = `${dst % image.w},${Math.floor(dst / image.w)} channel ${c}: actual ${image.data[dst * 4 + c]}, wanted ${wanted[dst * 3 + c]}`;
	check(!bad, `overlap: ${preset.id}/${move.id} dolls and the prop draw out of order at ${bad}`);
}

/** Playlist timing, layer synchronization, repeat/restart/replay, turning and rejection atomicity, through the API. */
async function behavior(page, archive, check) {
	const m = archive.manifest;
	const log = await page.evaluate(async (label) => {
		const { game, api, m } = globalThis.pdTest,
			out = { notes: [] };
		const note = (ok, text) => ok || out.notes.push(text);
		const step = (n) => game.advance(n / 60);
		// The cell every emitted layer shows, as the aggregate hands it to the renderer.
		const showing = (d) => {
			const cells = m.rig.animations.find((a) => a.id === d.anim).cells,
				out = [];
			d.emit({ add: (x, y, w, h, frame) => out.push(frame) }, 1);
			return out.map((frame, i) => {
				const local = frame - game.assets.frames(d.placed[i].key);
				return `${m.rig.directions[Math.floor(local / cells)].id}/${local % cells}`;
			});
		};
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
		const count = (tag) => [...game.roster.tagged(tag)].length;
		const before = count('pdtest');
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
		const spots = () => [[d.actor.x, d.actor.y, d.actor.scale, d.actor.visible]];
		const at = spots();
		d.x += 5;
		d.y -= 3;
		note(
			spots().every((s, i) => s[0] === at[i][0] + 5 && s[1] === at[i][1] - 3),
			'move: the actor must follow x and y'
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
			'visible: hiding the doll must hide its actor'
		);
		d.visible = true;
		d.teleport(100, 120);
		note(
			d.x === 100 && d.y === 120 && spots().every((s) => s[3]),
			'teleport: the doll must move and show again'
		);
		// the engine pushes the actor out of a solid wall, and moving the doll keeps that push
		const wall = game.spawn({
			id: 'pdwall',
			layer: 'world',
			tags: ['pdwall'],
			x: 700,
			y: 300,
			width: 16,
			height: 400
		});
		game.collide.solid('pdtest', 'pdwall');
		d.teleport(560, 300);
		for (let i = 0; i < 40; i++) {
			d.x += 4;
			d.y += 0.25;
			await step(1);
		}
		note(
			d.actor.x + (d.actor.width * Math.abs(d.actor.sx)) / 2 <= 692 + 1,
			'collision: a solid wall must stop the doll, at x ' + d.actor.x
		);
		wall.destroy();
		// tint and alpha set on the actor reach every layer, in the kernel's own read-back form
		d.actor.tint = '#ff000080';
		d.actor.alpha = 0.5;
		const emitted = [];
		d.emit({ add: (...args) => emitted.push(args) }, 1, game.world.view);
		note(
			emitted.length > 0 && emitted.every((a) => a[5] === 0xff000080 && a[9] === 0.5),
			'actor: tint and alpha set on the actor must reach the layers, got ' +
				JSON.stringify(emitted[0]?.slice(5))
		);
		d.actor.tint = '#ffffff';
		d.actor.alpha = 1;
		// a turned, stretched actor: the pivot stays where the accessors say, and teleport lands on it
		d.actor.rot = Math.PI / 2;
		d.actor.sx = 2;
		d.actor.sy = 3;
		d.teleport(500, 450);
		const turned = [];
		d.emit({ add: (x, y) => turned.push([x, y]) }, 1, game.world.view);
		// a quarter turn maps the layer's scaled offset (x, y) from the pivot to (-y, x)
		const part = d.placed[0],
			pivotX = turned[0][0] + part.oy * 3,
			pivotY = turned[0][1] - part.ox * 2;
		note(
			Math.abs(d.x - 500) < 1e-3 &&
				Math.abs(d.y - 450) < 1e-3 &&
				Math.abs(pivotX - 500) < 1e-3 &&
				Math.abs(pivotY - 450) < 1e-3,
			// the engine stores positions as 32-bit floats
			'rotation: the turned doll must draw and read its pivot at 500,450, got ' +
				[d.x, d.y, pivotX, pivotY]
		);
		d.actor.rot = 0;
		d.actor.sx = 1;
		d.actor.sy = 1;
		// a wrapping world: the doll crosses the seam, reads the wrapped pivot and still interpolates
		if (game.roster.wrap) {
			const size = game.roster.wrap.w;
			d.teleport(size - 4, 300);
			// moved inside a step, as a game moves it, so the step's start is the interpolation's origin
			const walker = game.step('pdwalk', () => (d.x += 8));
			await step(3);
			walker.cancel();
			const at = (alpha) => {
				const xs = [];
				d.emit({ add: (x) => xs.push(x) }, alpha, game.world.view);
				return xs[0];
			};
			const across = d.x;
			note(
				across >= 0 && across < size,
				'wrap: the doll must read the wrapped pivot, got ' + across
			);
			note(
				Math.abs(at(1) - at(0.5) - 4) < 1e-6,
				'wrap: crossing the seam must interpolate, got ' + [at(0.5), at(1)]
			);
			d.y += 1;
			note(d.x === across, 'wrap: moving on the other axis must keep the wrapped x');
		}
		d.teleport(300, 300);
		rejects(d, () => d.play('missing-move', dir0), 'unknown move');
		rejects(d, () => d.play(first.id, 'nowhere'), 'unknown direction');
		rejects(d, () => d.setDirection('nowhere'), 'unknown turn');
		rejects(d, () => d.equip('body', m.rig.baseItem), 'body slot');
		rejects(d, () => d.equip(m.slots.at(-1).id, 'missing-item'), 'unknown item');
		rejects(d, () => d.applyPreset('missing-outfit'), 'unknown outfit');
		rejects(d, () => d.playAction('missing-move', dir0), 'unknown action');
		d.destroy();
		await step(2);
		note(count('pdtest') === before, 'destroy: the actor must be removed');
		// a clip started by a game step registered before the doll's renders from zero
		let early = null,
			started = false;
		const order = game.step('pdorder', () => {
			if (early && !started) {
				started = true;
				early.play(first.id, dir0, true);
			}
		});
		early = new api.Paperdoll(game, 60, 60, m);
		await step(1);
		note(early.elapsed === 0, 'order: a clip started in an earlier step must render from zero');
		order.cancel();
		early.destroy();
		// a doll whose actor the game kills stops
		const killed = new api.Paperdoll(game, 60, 60, m);
		killed.play(first.id, dir0);
		killed.actor.destroy();
		await step(1);
		const frozen = killed.elapsed;
		await step(3);
		note(
			!killed.alive && killed.elapsed === frozen,
			'lifecycle: a killed actor must stop its doll'
		);
		killed.destroy();
		out.moves = moves;
		return out;
	}, archive.label);
	for (const text of log.notes) check(false, text);
	for (const move of m.rig.animations) {
		const { dir, seen } = log.timeline[move.id];
		const wanted = seen.map(
			// play() ran between steps, so the step that followed it does not count
			(_, i) => `${dir}/${sampleTimeline(move.frames, (Math.max(0, i - 1) * 1000) / 60, move.loop)}`
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
		const listed = JSON.parse(readFileSync(join(hero, 'phaser-ae', 'assets.json'), 'utf8'));
		const folderName = listed[0].slice(0, listed[0].indexOf('manifest.json'));
		const assets = listed.map((path) => 'pixeldoll/hero/' + path.slice(folderName.length));
		writeFileSync(
			join(gameDir, 'harness.js'),
			'export function expose(values) { globalThis.pdTest = values; }\n'
		);
		writeFileSync(join(gameDir, 'harness.d.ts'), 'export function expose(values: object): void;\n');
		writeFileSync(
			join(gameDir, 'hero.ts'),
			`import { game } from './engine.js';
import { loadPaperdoll } from './pixeldoll/hero/phaser-ae/paperdoll.js';
import heroData from './pixeldoll/hero/manifest.json';
export const hero = await loadPaperdoll(game, 'pixeldoll/hero/', { manifest: heroData });
`
		);
		const dist = bake(
			withWorld('side', { assets }),
			`import { game } from './engine.js';
import { Paperdoll } from './pixeldoll/hero/phaser-ae/paperdoll.js';
import { hero } from './hero.js';
import { expose } from './harness.js';
// Compiled, never called: the actor is the game's own Sprite type, with the composed packs' fields.
export function typed(): void {
	const doll = new Paperdoll(game, 0, 0, hero);
	game.rig.follow(doll.actor);
	const held: Paperdoll<typeof game> = doll;
	game.rig.follow(held.actor);
	doll.actor.collide.radius = 4;
	doll.actor.pointer.enabled = true;
}
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
	for (const world of ['side', 'topdown', 'wrap']) {
		const dist = bake(withWorld(world), STAGE);
		for (const archive of archives.filter((a) => !values.only || a.label.includes(values.only)))
			for (const control of controlsFor(archive, world)) {
				let runtime = new TextDecoder().decode(archive.files.get('phaser-ae/paperdoll.js'));
				if (control !== 'none') {
					const [from, to] = CONTROLS[control];
					assert(runtime.includes(from), `Control ${control} no longer matches the runtime.`);
					runtime = runtime.replace(from, to);
				}
				const files = new Map([...archive.files].map(([name, bytes]) => ['/hero/' + name, bytes]));
				files.set('/hero/phaser-ae/paperdoll.js', new TextEncoder().encode(runtime));
				const server = await serve(dist, files),
					{ page, errors } = await open(`http://127.0.0.1:${server.address().port}/`),
					failures = [];
				const check = (ok, text) => ok || failures.push(text);
				let compared = 0;
				try {
					if (archive === archives[0] && control === 'none') {
						const layer = archive.manifest.items[0].layers[0],
							clip = archive.manifest.rig.animations[0].id,
							sheet = layer.sourceSheets?.[clip] ?? layer.sheets[clip];
						files.set('/hero/' + sheet, new TextEncoder().encode('not a png'));
						const message = await page.evaluate(async () => {
							const api = await import('/hero/phaser-ae/paperdoll.js');
							try {
								await api.loadPaperdoll(globalThis.game, 'hero/');
								return 'loaded';
							} catch (error) {
								return error.message;
							}
						});
						check(message.includes(sheet), `retry: a corrupt sheet must be named, got ${message}`);
						files.set('/hero/' + sheet, archive.files.get(sheet));
					}
					await page.evaluate(async () => {
						const api = await import('/hero/phaser-ae/paperdoll.js');
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
					`${passed ? 'PASS' : 'FAIL'} ${label}${control === 'none' ? (failures.length ? ` (${failures[0]})` : '') : ` (control caught: ${failures[0] ?? 'nothing'})`}`
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
writeFileSync(
	output,
	JSON.stringify({ engine: engineRelease, renderers: [...renderers], results }, null, 2) + '\n'
);
for (const r of results.filter((r) => !r.passed))
	console.log(`FAILED ${r.label}:\n  ${r.failures.join('\n  ') || 'control was not detected'}`);
console.log(
	`${results.filter((r) => r.passed).length}/${results.length} passed, engine ${engineRelease.id} (kernel ${engineRelease.kernel ?? '?'}), renderer ${[...renderers].join(', ')} -> ${output}`
);
if (results.some((r) => !r.passed)) process.exitCode = 1;
