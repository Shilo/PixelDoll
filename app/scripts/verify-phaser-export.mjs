// Real pinned engines, no PixelLab calls or application dependencies installed.
// node --experimental-transform-types app/scripts/verify-phaser-export.mjs [--zip actual-ui-export.zip]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { unzip } from '../src/lib/store/zip.ts';
import { bakedSheetPath } from '../src/lib/export/paths.ts';
import { reviewArchives } from './export-review-fixtures.mjs';

const app = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({
	options: {
		versions: { type: 'string' },
		'vendor-dir': { type: 'string' },
		output: { type: 'string' },
		zip: { type: 'string', multiple: true }
	}
});
const versions = (values.versions ?? process.env.PHASER_VERSIONS ?? '3.80.1,3.90.0,4.1.0').split(
	','
);
assert(
	versions.every((v) => /^\d+\.\d+\.\d+$/.test(v)),
	'Use explicit release versions.'
);
const vendor = resolve(
	values['vendor-dir'] ??
		process.env.PHASER_VENDOR_DIR ??
		join(app, 'node_modules/.cache/export-review-phaser')
);
const output = resolve(
	values.output ?? process.env.PHASER_REVIEW_OUTPUT ?? join(vendor, 'results.json')
);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
await mkdir(vendor, { recursive: true });
const bundles = [];
for (const version of versions) {
	const file = join(vendor, `phaser-${version}.js`),
		source = `https://raw.githubusercontent.com/phaserjs/phaser/v${version}/dist/phaser.js`;
	let bytes;
	try {
		bytes = await readFile(file);
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
		const response = await fetch(source);
		if (!response.ok) throw new Error(`Downloading Phaser ${version}: HTTP ${response.status}`);
		bytes = new Uint8Array(await response.arrayBuffer());
		await writeFile(file, bytes);
	}
	bundles.push({ version, file, source, sha256: sha(bytes) });
}

const archives = await reviewArchives('phaser', vendor);
for (const file of values.zip ?? [])
	archives.push({
		label: basename(file),
		fixture: false,
		zip: new Uint8Array(await readFile(file))
	});
for (const archive of archives) {
	archive.files = await unzip(archive.zip);
	const manifest = JSON.parse(new TextDecoder().decode(archive.files.get('manifest.json')));
	archive.bakedPaths = Object.fromEntries(
		manifest.presets.map((preset) => [
			preset.id,
			Object.fromEntries(
				manifest.rig.animations.map((move) => [move.id, bakedSheetPath(preset.id, move.id)])
			)
		])
	);
	archive.sha256 = sha(archive.zip);
	assert(
		archive.files.has('phaser/PaperdollContainer.js'),
		`${archive.label} must contain a Phaser export.`
	);
}

const browser = await chromium.launch({ headless: true }),
	results = [];
try {
	for (const bundle of bundles)
		for (const renderer of ['CANVAS', 'WEBGL'])
			for (const archive of archives) {
				for (const control of archive.fixture
					? [
							'none',
							'old-duration',
							'no-repeat',
							'no-layer-update',
							'wrong-pivot',
							'restart-every-play'
						]
					: archive.adversarial
						? ['none', 'no-covers', 'no-hides', 'no-palette', 'wrong-direction', 'turn-restarts']
						: archive.state
							? ['none', 'restart-every-play', 'state-loop']
							: archive.translucent
								? ['none', 'canvas-lookup']
								: ['none']) {
					const page = await browser.newPage(),
						errors = [],
						label = `${bundle.version} ${renderer} ${archive.label} ${control}`;
					page.on('pageerror', (error) => errors.push(error.message));
					try {
						let runtime = new TextDecoder().decode(
							archive.files.get('phaser/PaperdollContainer.js')
						);
						if (control === 'old-duration') {
							assert(
								runtime.includes('duration: f.ms }'),
								'Old-duration control must mutate the current frame mapping.'
							);
							assert(runtime.includes('duration: timelineDuration(a.frames)'));
							runtime = runtime.replace(
								'duration: timelineDuration(a.frames)',
								'frameRate: 1000 / Math.min(...a.frames.map(frame => frame.ms))'
							);
							runtime = runtime.replace(
								'duration: f.ms }',
								'duration: f.ms - Math.min(...a.frames.map(frame => frame.ms)) }'
							);
						} else if (control === 'restart-every-play') {
							assert(runtime.includes('this.body.play(animKey(this.m, anim, dir), !restart)'));
							runtime = runtime.replace(
								'this.body.play(animKey(this.m, anim, dir), !restart)',
								'this.body.play(animKey(this.m, anim, dir))'
							);
						} else if (control === 'turn-restarts') {
							const turn =
								'anims.currentAnim = next;\n    anims.setCurrentFrame(next.frames[anims.currentFrame.index - 1]);';
							assert(runtime.includes(turn), 'Turn control must mutate the current setDirection.');
							runtime = runtime.replace(turn, 'this.body.play(animKey(this.m, this.anim, dir));');
						} else if (control === 'no-repeat') {
							assert(runtime.includes('repeat: a.loop ? -1 : 0'));
							runtime = runtime.replace('repeat: a.loop ? -1 : 0', 'repeat: 0');
						} else if (control === 'state-loop') {
							assert(runtime.includes('repeat: a.loop ? -1 : 0'));
							runtime = runtime.replace('repeat: a.loop ? -1 : 0', 'repeat: -1');
						} else if (control === 'no-layer-update') {
							assert(runtime.includes("'animationupdate', "));
							runtime = runtime.replace("'animationupdate', ", '');
						} else if (control === 'no-covers') {
							assert(runtime.includes('for (const item of shownItems(m, on))'));
							runtime = runtime.replace(
								'for (const item of shownItems(m, on))',
								'for (const item of on)'
							);
						} else if (control === 'no-hides') {
							assert(runtime.includes('if (hidden.has(item.slot)) continue;'));
							runtime = runtime.replace('if (hidden.has(item.slot)) continue;', '');
						} else if (control === 'no-palette') {
							assert(runtime.includes('if (!table.size) return original;'));
							runtime = runtime.replace('if (!table.size) return original;', 'return original;');
						} else if (control === 'canvas-lookup') {
							const exact = 'image.data.set(applyPalette(source, table).data);';
							assert(
								runtime.includes(exact),
								'Canvas control must replace the exact palette input.'
							);
							runtime = runtime.replace(
								exact,
								`ctx.drawImage(this.scene.textures.get(original).getSourceImage(), 0, 0);
								const rounded = ctx.getImageData(0, 0, source.w, source.h);
								image.data.set(applyPalette({ ...source, data: rounded.data }, table).data);`
							);
						}
						await page.route('**/*', (route) => {
							const url = new URL(route.request().url());
							if (url.origin !== 'https://game.test') return route.abort();
							if (url.pathname === '/')
								return route.fulfill({
									contentType: 'text/html',
									body: '<!doctype html><html><body style="margin:0"></body></html>'
								});
							const name = decodeURIComponent(url.pathname.slice('/hero/'.length));
							const bytes =
								name === 'phaser/PaperdollContainer.js'
									? new TextEncoder().encode(runtime)
									: archive.files.get(name);
							return bytes
								? route.fulfill({
										contentType: name.endsWith('.js')
											? 'text/javascript'
											: name.endsWith('.png')
												? 'image/png'
												: 'application/json',
										body: Buffer.from(bytes)
									})
								: route.fulfill({ status: 404 });
						});
						await page.goto('https://game.test/');
						await page.addScriptTag({ path: bundle.file });
						let data, failure;
						try {
							data = await page.evaluate(
								async ({ renderer, fixture, control, bakedPaths, stateMove, turns }) => {
									const api = await import('/hero/phaser/PaperdollContainer.js');
									return new Promise((resolve, reject) => {
										const timeout = setTimeout(
											() => reject(new Error('Engine initialization timeout')),
											60000
										);
										const game = new Phaser.Game({
											type: Phaser[renderer],
											width: 256,
											height: 256,
											pixelArt: true,
											backgroundColor: '#ff00ff',
											roundPixels: true,
											audio: { noAudio: true },
											scene: {
												async create() {
													try {
														const m = await api.loadPaperdoll(this, '/hero'),
															doll = new api.Paperdoll(this, 128, 128, m);
														this.sys.pause();
														const check = (ok, message) => {
															if (!ok) throw new Error(message);
														};
														const samples = [],
															renders = [];
														// The 3.x WebGL single-pixel helper reads y one row off; rectangular snapshots use the correct origin.
														const pixel = (x, y) =>
															new Promise((resolve) =>
																game.renderer.snapshotArea(x, y, 1, 1, (image) => {
																	const canvas = document.createElement('canvas');
																	canvas.width = canvas.height = 1;
																	const context = canvas.getContext('2d');
																	context.drawImage(image, 0, 0);
																	resolve([...context.getImageData(0, 0, 1, 1).data]);
																})
															);
														const paletteColor = () => [
															...doll.body.texture
																.getSourceImage()
																.getContext('2d')
																.getImageData(0, 0, 1, 1).data
														];
														// Runs before the generic clip loop so its negative controls reach these State checks.
														if (stateMove) {
															const dir = 'south',
																state = m.rig.animations.find((move) => move.id === stateMove),
																cell = stateMove + '_' + dir + '_0';
															check(
																api
																	.playbackClips(m.rig.animations)
																	.find((clip) => clip.id === stateMove)?.kind === 'state' &&
																	state.frames.length === 1 &&
																	!state.loop &&
																	m.rig.animations.find((move) => move.id === 'walk').loop,
																'state: export must keep a non-default one-cell non-looping State beside a looping Move'
															);
															let completes = 0;
															const completed = () => completes++,
																advance = (ms) => {
																	for (let t = 0; t < ms; t++) doll.body.anims.update(t, 1);
																},
																shows = (frame, index) =>
																	doll.body.anims.currentFrame.index === index &&
																	doll.body.anims.currentFrame.textureFrame === frame &&
																	doll.nodes
																		.filter((n) => n.sprite.visible)
																		.every((n) => n.sprite.frame.name === frame),
																// Body center and hat marker; magenta exists only in the State cells.
																marked = async () =>
																	[await pixel(128, 100), await pixel(128, 56)].map(
																		(color) => color.slice(0, 3).join() === '255,0,255'
																	);
															doll.body.on('animationcomplete', completed);
															doll.play('walk', dir, true);
															advance(100);
															check(
																shows('walk_south_1', 2) && (await marked()).every((on) => !on),
																'state: Move must advance without State artwork'
															);
															doll.play(stateMove, dir);
															check(
																shows(cell, 1) &&
																	doll.body.anims.isPlaying &&
																	doll.body.anims.currentAnim.key ===
																		api.animKey(m, stateMove, dir),
																'state: explicit selection during a Move must start the State'
															);
															check(
																(await marked()).every(Boolean),
																'state: State must render its distinct body and hat artwork'
															);
															advance(state.frames[0].ms - 1);
															check(
																completes === 0 && doll.body.anims.isPlaying && shows(cell, 1),
																'state: State completed before its authored duration'
															);
															advance(51);
															check(
																completes === 1 &&
																	!doll.body.anims.isPlaying &&
																	shows(cell, 1) &&
																	(await marked()).every(Boolean),
																'state: completed State must hold its one cell and artwork'
															);
															doll.play(stateMove, dir);
															check(
																doll.body.anims.isPlaying && shows(cell, 1),
																'state: selecting a completed State must replay it'
															);
															doll.play('walk', dir);
															check(
																shows('walk_south_0', 1) && doll.body.anims.isPlaying,
																'state: selecting a Move after a State must start the Move'
															);
															check(
																(await marked()).every((on) => !on),
																'state: Move after a State must drop State artwork'
															);
															advance(100);
															doll.play('walk', dir);
															check(
																shows('walk_south_1', 2),
																'state: repeated Move selection after a State must resume its progress'
															);
															doll.play('walk', dir, true);
															check(
																shows('walk_south_0', 1) && doll.body.anims.isPlaying,
																'state: explicit Move restart after a State must start over'
															);
															doll.body.off('animationcomplete', completed);
															// Leave a different clip active so the generic loop starts each clip fresh.
															doll.play(stateMove, dir, true);
														}
														// Turns on the final playlist entry, which repeats the previous cell with its own duration.
														if (turns) {
															const advance = (ms) => {
																	for (let t = 0; t < ms; t++) doll.body.anims.update(t, 1);
																},
																events = { start: 0, repeat: 0, complete: 0 },
																listeners = Object.keys(events).map((name) => [
																	'animation' + name,
																	() => events[name]++
																]);
															for (const move of m.rig.animations) {
																const views = move.directions ?? m.rig.directions.map((d) => d.id);
																if (views.length < 2) continue;
																const from = views[0],
																	to = views.at(-2),
																	entry = move.frames.length - 1,
																	length = move.frames[entry].ms,
																	total = move.frames.reduce((n, frame) => n + frame.ms, 0),
																	anims = doll.body.anims,
																	shows = (dir, index) =>
																		anims.currentAnim.key === api.animKey(m, move.id, dir) &&
																		anims.currentFrame.index === index + 1 &&
																		anims.currentFrame.textureFrame ===
																			`${move.id}_${dir}_${move.frames[index].cell}` &&
																		doll.nodes
																			.filter((n) => n.sprite.visible)
																			.every(
																				(n) =>
																					n.sprite.frame.name === anims.currentFrame.textureFrame
																			);
																doll.play(move.id, from, true);
																if (move.loop) advance(total);
																advance(total - length + Math.floor(length / 3));
																const before = [
																	anims.accumulator,
																	anims.nextTick,
																	anims.repeatCounter
																];
																for (const [name, listener] of listeners)
																	doll.body.on(name, listener);
																for (const name in events) events[name] = 0;
																doll.setDirection(to);
																check(
																	shows(to, entry) &&
																		anims.isPlaying &&
																		JSON.stringify([
																			anims.accumulator,
																			anims.nextTick,
																			anims.repeatCounter
																		]) === JSON.stringify(before),
																	`direction: ${move.id} turn must keep its playlist entry, clock and every layer`
																);
																doll.setDirection(to);
																check(
																	shows(to, entry) && anims.accumulator === before[0],
																	`direction: ${move.id} turning to the current view must be a no-op`
																);
																advance(length - Math.floor(length / 3) - 1);
																check(
																	shows(to, entry),
																	`direction: ${move.id} turned entry must keep its remaining duration`
																);
																advance(2);
																check(
																	move.loop
																		? shows(to, 0) && events.repeat === 1 && events.complete === 0
																		: shows(to, entry) && !anims.isPlaying && events.complete === 1,
																	`direction: ${move.id} turned clip must continue its timeline`
																);
																if (!move.loop) {
																	doll.setDirection(from);
																	check(
																		shows(from, entry) && !anims.isPlaying && events.complete === 1,
																		`direction: ${move.id} turning a completed once-only clip must hold it`
																	);
																	doll.play(move.id, from);
																	check(
																		shows(from, 0) && anims.isPlaying,
																		`direction: ${move.id} turned completed clip must still replay`
																	);
																}
																check(
																	events.start === (move.loop ? 0 : 1),
																	`direction: ${move.id} turning must not restart the clip`
																);
																for (const [name, listener] of listeners)
																	doll.body.off(name, listener);
															}
															// The generic loop must start each clip fresh: leave a clip other than the first active.
															check(
																doll.anim !== m.rig.animations[0].id,
																'direction: fixture must end on a different clip'
															);
														}
														for (const move of m.rig.animations) {
															const dir = (move.directions ?? m.rig.directions.map((d) => d.id))[0];
															if (!dir) continue;
															if (fixture) doll.applyPreset(m.presets[0]);
															doll.play(move.id, dir);
															if (fixture) {
																check(
																	paletteColor().join() === '0,0,255,255',
																	'palette: exported default must use original source ramp'
																);
																check(
																	JSON.stringify(
																		doll.nodes.map((n) => [n.sprite.originX, n.sprite.originY])
																	) ===
																		JSON.stringify([
																			[0.5, 60 / 64],
																			[0.5, 76 / 96]
																		]),
																	'geometry: exported layer pivots'
																);
																const body = doll.body.getBounds(),
																	hat = doll.nodes
																		.find((n) => n.slot.id === 'head')
																		.sprite.getBounds();
																check(
																	JSON.stringify([
																		body.x,
																		body.y,
																		body.width,
																		body.height,
																		hat.x,
																		hat.y,
																		hat.width,
																		hat.height
																	]) === JSON.stringify([96, 68, 64, 64, 80, 52, 96, 96]),
																	'geometry: native oversized layer bounds'
																);
															}
															let elapsed = 0,
																repeats = 0,
																completes = 0;
															const repeated = () => repeats++,
																completed = () => completes++;
															doll.body.on('animationrepeat', repeated);
															doll.body.on('animationcomplete', completed);
															const total = move.frames.reduce((n, frame) => n + frame.ms, 0),
																animation = this.anims.get(api.animKey(m, move.id, dir));
															// The old-code control must reach the real clock oracle, rather than fail on its known metadata error.
															if (control !== 'old-duration')
																check(
																	Math.abs(animation.duration - total) < 0.000001,
																	'duration: native animation total differs'
																);
															const boundaries = new Set([0, total * 3 + 1]);
															for (let cycle = 0; cycle < 3; cycle++) {
																let t = cycle * total;
																for (const frame of move.frames) {
																	t += frame.ms;
																	for (const shift of [-1, 0, 1])
																		if (t + shift >= 0) boundaries.add(t + shift);
																}
															}
															for (const time of [...boundaries].sort((a, b) => a - b)) {
																while (elapsed < time) {
																	if (elapsed < total) doll.play(move.id, dir);
																	const delta = Math.min(1, time - elapsed);
																	elapsed += delta;
																	doll.body.anims.update(elapsed, delta);
																}
																let local = move.loop
																		? time % total
																		: Math.min(time, total - 0.000001),
																	index = 0;
																while (
																	index < move.frames.length - 1 &&
																	local >= move.frames[index].ms
																)
																	local -= move.frames[index++].ms;
																const expected = `${move.id}_${dir}_${move.frames[index].cell}`,
																	actual = doll.body.anims.currentFrame;
																check(
																	actual.index === index + 1 && actual.textureFrame === expected,
																	`clock: ${move.id} at ${time}ms expected index ${index + 1}, got ${actual.index}`
																);
																check(
																	doll.nodes
																		.filter((n) => n.sprite.visible)
																		.every((n) => n.sprite.frame.name === expected),
																	`synchronization: ${move.id} at ${time}ms`
																);
															}
															check(
																move.loop
																	? repeats >= 3 && completes === 0 && doll.body.anims.isPlaying
																	: repeats === 0 && completes === 1 && !doll.body.anims.isPlaying,
																'loop: completion/repeat behavior differs'
															);
															if (fixture) {
																check(
																	paletteColor().join() === '0,0,255,255',
																	'palette: animation advancement must retain source recolor'
																);
																const finalCell = move.loop
																	? move.frames[0].cell
																	: move.frames.at(-1).cell;
																const color = await pixel(128, 100);
																check(
																	color.slice(0, 3).join() === (finalCell ? '0,255,0' : '255,0,0'),
																	`render: ${renderer} marker differs (${color})`
																);
																const hatColor = await pixel(128, 56);
																check(
																	hatColor.slice(0, 3).join() ===
																		(finalCell ? '0,255,0' : '255,0,0'),
																	`render: ${renderer} oversized layer marker differs (${hatColor})`
																);
																renders.push({ move: move.id, color, hatColor });
																const before = {
																	index: doll.body.anims.currentFrame.index,
																	playing: doll.body.anims.isPlaying
																};
																doll.equip('head', null);
																check(
																	!doll.nodes.find((n) => n.slot.id === 'head').sprite.visible,
																	'equipment: unequip'
																);
																doll.equip('head', 'hat');
																doll.applyPreset(m.presets[1]);
																check(
																	doll.body.anims.currentFrame.index === before.index &&
																		doll.body.anims.isPlaying === before.playing,
																	'equipment: changing outfits alters clock'
																);
																check(
																	doll.nodes.every(
																		(n) =>
																			n.sprite.frame.name ===
																			doll.body.anims.currentFrame.textureFrame
																	),
																	'synchronization: re-equipped layers'
																);
																check(
																	paletteColor().join() === '255,0,0,255',
																	'palette: selected outfit recolor'
																);
															}
															const finalIndex = doll.body.anims.currentFrame.index;
															doll.play(move.id, dir);
															check(
																doll.body.anims.currentFrame.index === (move.loop ? finalIndex : 1),
																'play: repeated selection changes active progress or does not replay a completed clip'
															);
															doll.play(move.id, dir, true);
															check(
																doll.body.anims.currentFrame.index === 1 &&
																	doll.body.anims.isPlaying,
																'restart: same clip does not restart'
															);
															check(
																doll.nodes
																	.filter((n) => n.sprite.visible)
																	.every(
																		(n) =>
																			n.sprite.frame.name ===
																			doll.body.anims.currentFrame.textureFrame
																	),
																'synchronization: restart'
															);
															samples.push({
																move: move.id,
																loop: move.loop,
																total,
																repeats,
																completes,
																samples: boundaries.size
															});
															doll.body.off('animationrepeat', repeated);
															doll.body.off('animationcomplete', completed);
														}
														if (
															!['old-duration', 'no-repeat', 'no-layer-update'].includes(control) &&
															m.export?.baked?.length
														) {
															const size = m.export?.bakedCell,
																pivot = m.export?.bakedPivot;
															if (renderer === 'CANVAS') this.cameras.main.setRoundPixels(false);
															check(
																size && pivot && m.export.baked?.length,
																'pixels: export must contain combined outfit sheets'
															);
															doll.container.setPosition(
																pivot.x + (control === 'wrong-pivot' ? 1 : 0),
																pivot.y
															);
															let comparedPixels = 0,
																comparedFrames = 0;
															for (const preset of m.presets) {
																if (!m.export.baked.includes(preset.id)) continue;
																doll.applyPreset(preset);
																for (const move of m.rig.animations) {
																	const response = await fetch(
																		'/hero/' + bakedPaths[preset.id][move.id]
																	);
																	check(response.ok, 'pixels: missing combined outfit sheet');
																	const bitmap = await createImageBitmap(await response.blob());
																	const canvas = document.createElement('canvas');
																	canvas.width = bitmap.width;
																	canvas.height = bitmap.height;
																	const context = canvas.getContext('2d', {
																		willReadFrequently: true
																	});
																	context.drawImage(bitmap, 0, 0);
																	bitmap.close();
																	const expected = context.getImageData(
																		0,
																		0,
																		canvas.width,
																		canvas.height
																	).data;
																	for (const [row, direction] of m.rig.directions.entries()) {
																		if (move.directions && !move.directions.includes(direction.id))
																			continue;
																		doll.play(
																			move.id,
																			control === 'wrong-direction' && direction.id === 'west'
																				? 'east'
																				: direction.id
																		);
																		doll.body.anims.pause();
																		for (const [index, frame] of move.frames.entries()) {
																			doll.body.anims.setCurrentFrame(
																				doll.body.anims.currentAnim.frames[index]
																			);
																			doll.sync();
																			await new Promise((resolve) =>
																				game.events.once('postrender', resolve)
																			);
																			const actual = await new Promise((resolve) =>
																				game.renderer.snapshotArea(
																					0,
																					0,
																					size.w,
																					size.h,
																					(image) => {
																						const target = document.createElement('canvas');
																						target.width = size.w;
																						target.height = size.h;
																						const targetContext = target.getContext('2d');
																						targetContext.drawImage(image, 0, 0);
																						resolve(
																							targetContext.getImageData(0, 0, size.w, size.h).data
																						);
																					}
																				)
																			);
																			for (let y = 0; y < size.h; y++)
																				for (let x = 0; x < size.w; x++) {
																					const source =
																						((row * size.h + y) * canvas.width +
																							frame.cell * size.w +
																							x) *
																						4;
																					const target = (y * size.w + x) * 4,
																						alpha = expected[source + 3] / 255;
																					for (let channel = 0; channel < 3; channel++) {
																						const wanted = Math.round(
																							expected[source + channel] * alpha +
																								(channel === 1 ? 0 : 255) * (1 - alpha)
																						);
																						check(
																							Math.abs(actual[target + channel] - wanted) <=
																								(alpha > 0 && alpha < 1 ? 1 : 0),
																							'pixels: ' +
																								preset.id +
																								'/' +
																								move.id +
																								'/' +
																								direction.id +
																								'/' +
																								frame.cell +
																								' at ' +
																								x +
																								',' +
																								y +
																								': actual ' +
																								Array.from(actual.slice(target, target + 4)) +
																								' expected ' +
																								Array.from(expected.slice(source, source + 4)) +
																								' channel ' +
																								channel +
																								' wanted ' +
																								wanted
																						);
																					}
																					comparedPixels++;
																				}
																			comparedFrames++;
																		}
																	}
																}
															}
															renders.push({
																comparedPixels,
																comparedFrames,
																canvasIntegerPositioning: renderer === 'CANVAS'
															});
														} else if (control === 'none') {
															renders.push({
																pixelOracle: 'not-run',
																reason: 'No combined outfit sheets in this export'
															});
														}
														doll.destroy();
														clearTimeout(timeout);
														resolve({
															version: Phaser.VERSION,
															renderer: game.renderer.type,
															samples,
															renders
														});
														game.destroy(true);
													} catch (error) {
														clearTimeout(timeout);
														reject(error);
														game.destroy(true);
													}
												}
											}
										});
									});
								},
								{
									renderer,
									fixture: archive.fixture,
									control,
									bakedPaths: archive.bakedPaths,
									stateMove: archive.state ? 'ready-stance' : null,
									turns: !!archive.adversarial
								}
							);
						} catch (error) {
							failure = error;
						}
						if (control !== 'none') {
							const expectedFailure = archive.state
								? 'state:'
								: control === 'turn-restarts'
									? 'direction:'
									: [
												'wrong-pivot',
												'no-covers',
												'no-hides',
												'no-palette',
												'canvas-lookup',
												'wrong-direction'
										  ].includes(control)
										? 'pixels:'
										: control === 'no-layer-update'
											? 'synchronization:'
											: 'clock:';
							assert(
								failure && failure.message.includes(expectedFailure),
								`Negative control was not caught by ${expectedFailure}: ${failure?.message ?? 'passed'}`
							);
							results.push({
								label,
								passed: true,
								negativeControl: true,
								detected: failure.message,
								errors
							});
						} else {
							if (failure) throw failure;
							assert.equal(data.version, bundle.version);
							assert.equal(data.renderer, renderer === 'CANVAS' ? 1 : 2);
							assert.deepEqual(errors, []);
							results.push({ label, passed: true, ...data, errors });
						}
						console.log('PASS ' + label);
					} catch (error) {
						results.push({ label, passed: false, error: error.message, errors });
						console.error('FAIL ' + label + ': ' + error.message);
					} finally {
						await page.close();
					}
				}
			}
} finally {
	await browser.close();
}
await mkdir(dirname(output), { recursive: true });
await writeFile(
	output,
	JSON.stringify(
		{
			bundles,
			archives: archives.map(({ label, fixture, sha256 }) => ({ label, fixture, sha256 })),
			results
		},
		null,
		2
	) + '\n'
);
console.log('Results: ' + output);
if (results.some((result) => !result.passed)) process.exitCode = 1;
