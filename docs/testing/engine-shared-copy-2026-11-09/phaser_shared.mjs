// Real Phaser releases (Canvas + WebGL) in headless Chromium, requests served from the export ZIP by route interception
// (no server, no listening port). node --experimental-transform-types phaser_shared.mjs <appDir> <outDir> <vendorDir>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [app, out, vendor] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(join(app, 'node_modules/@playwright/test/index.mjs')).href);
const { unzip } = await import(pathToFileURL(join(app, 'src/lib/store/zip.ts')).href);
const { decodePngBytes } = await import(pathToFileURL(join(app, 'src/lib/image/pngraw.ts')).href);
const sha = (b) => createHash('sha256').update(b).digest('hex');
mkdirSync(vendor, { recursive: true });
const bundles = [];
for (const version of ['3.80.1', '3.90.0', '4.1.0']) {
	const file = join(vendor, `phaser-${version}.js`),
		source = `https://raw.githubusercontent.com/phaserjs/phaser/v${version}/dist/phaser.js`;
	if (!existsSync(file)) {
		const r = await fetch(source);
		assert.ok(r.ok, `download ${version}: ${r.status}`);
		writeFileSync(file, new Uint8Array(await r.arrayBuffer()));
	}
	bundles.push({ version, file, source, sha256: sha(readFileSync(file)) });
}
const zipBytes = readFileSync(join(out, 'phaser.pixeldoll.zip')),
	files = await unzip(new Uint8Array(zipBytes)),
	scenario = JSON.parse(readFileSync(join(out, 'scenario.json'), 'utf8')),
	m = JSON.parse(new TextDecoder().decode(files.get('manifest.json')));
// Transparent pixels must show CLEAR (the backgroundColor), a color absent from the oracle, so opaque black and transparent stay distinct.
const CLEAR = [255, 0, 255];
const bw = m.export.bakedCell.w,
	bh = m.export.bakedCell.h;
const expected = new Map();
const want = async (preset, anim, cell) => {
	const k = `${preset}/${anim}_${cell}`;
	if (!expected.has(k)) expected.set(k, await decodePngBytes(readFileSync(join(out, 'expected', `${k}.png`))));
	return expected.get(k);
};
const { copies } = scenario;
// [label, doll 0 preset (+variant overrides), doll 1 ..., oracle presets]
const cases = [
	['copyA-azure|copyB-crimson', [{ preset: 'current' }, { preset: 'copy_b' }], ['current', 'copy_b']],
	['copyB-default|copyA-source', [{ preset: 'copy_b_default' }, { preset: 'copy_a_raw' }], ['copy_b_default', 'copy_a_raw']],
	[
		'cross-copy-recolor',
		[
			{ preset: 'copy_b', extra: { [copies.matA]: 'azure' } },
			{ preset: 'copy_a_raw', extra: { [copies.matB]: 'crimson' } }
		],
		['copy_b', 'copy_a_raw']
	],
	[
		'equip-swap',
		[
			{ preset: 'current', equip: { head: copies.B, off_hand: null } },
			{ preset: 'copy_b_default' }
		],
		['copy_b_default', 'copy_b_default']
	],
	// Negative control: oracle expects crimson where copy B shows its default; must differ.
	['control', [{ preset: 'current' }, { preset: 'copy_b_default', extra: { [copies.matA]: 'azure' } }], ['current', 'copy_b'], true]
];
const browser = await chromium.launch({ headless: true }),
	results = [];
let failed = 0;
try {
	for (const bundle of bundles)
		for (const renderer of ['CANVAS', 'WEBGL']) {
			const page = await browser.newPage(),
				errors = [];
			page.on('pageerror', (e) => errors.push(e.message));
			await page.route('**/*', (route) => {
				const url = new URL(route.request().url());
				if (url.origin !== 'https://game.test') return route.abort();
				if (url.pathname === '/')
					return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0"></body></html>' });
				const bytes = files.get(decodeURIComponent(url.pathname.slice('/hero/'.length)));
				return bytes
					? route.fulfill({
							contentType: url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.png') ? 'image/png' : 'application/json',
							body: Buffer.from(bytes)
						})
					: route.fulfill({ status: 404 });
			});
			await page.goto('https://game.test/');
			await page.addScriptTag({ path: bundle.file });
			await page.evaluate(
				async ({ renderer, bw, bh }) => {
					const api = await import('/hero/phaser/PaperdollContainer.js');
					await new Promise((resolve, reject) => {
						const game = new Phaser.Game({
							type: Phaser[renderer],
							width: bw * 2,
							height: bh,
							backgroundColor: '#ff00ff',
							pixelArt: true,
							roundPixels: true,
							audio: { noAudio: true },
							scene: {
								async create() {
									try {
										const m = await api.loadPaperdoll(this, '/hero');
										const p = m.export.bakedPivot;
										window.pd = { game, api, m, scene: this, dolls: [0, 1].map((i) => new api.Paperdoll(this, i * bw + p.x, p.y, m)) };
										this.sys.pause();
										resolve();
									} catch (e) {
										reject(e);
									}
								}
							}
						});
					});
				},
				{ renderer, bw, bh }
			);
			const version = await page.evaluate(() => [Phaser.VERSION, pd.game.renderer.type]);
			assert.equal(version[0], bundle.version);
			// Runtime facts: Cast plays once, loops elsewhere; copy B is empty (not filled) in Cast.
			const facts = await page.evaluate(({ B }) => {
				const { m, dolls, scene, api } = pd,
					d = dolls[1];
				d.applyPreset(m.presets.find((x) => x.id === 'copy_b'));
				d.play('cast', 'south');
				const head = d.nodes.find((n) => n.slot.id === 'head' && n.role === 'fg');
				const tex = scene.textures.get(head.sprite.texture.key),
					src = tex.getSourceImage(),
					c = document.createElement('canvas');
				c.width = src.width;
				c.height = src.height;
				const ctx = c.getContext('2d');
				ctx.drawImage(src, 0, 0);
				const alpha = ctx.getImageData(0, 0, c.width, c.height).data.filter((_, i) => i % 4 === 3 && _).length;
				return {
					castRepeat: scene.anims.get(api.animKey(m, 'cast', 'south')).repeat,
					idleRepeat: scene.anims.get(api.animKey(m, 'idle', 'south')).repeat,
					headItem: d.layerOf(head).item.id === B,
					copyBCastOpaquePx: alpha
				};
			}, copies);
			for (const [label, dolls, oracle, control] of cases) {
				let diff = 0,
					total = 0;
				for (const anim of m.rig.animations)
					for (let f = 0; f < anim.frames.length; f++) {
						const png = await page.evaluate(
							({ dolls, anim, f }) =>
								new Promise((resolve) => {
									pd.dolls.forEach((d, i) => {
										const c = dolls[i];
										d.applyPreset(pd.m.presets.find((x) => x.id === c.preset));
										for (const [slot, id] of Object.entries(c.equip ?? {})) d.equip(slot, id);
										if (c.extra) d.setVariants({ ...d.variants, ...c.extra });
										d.play(anim, 'south');
										d.body.anims.pause();
										d.body.anims.setCurrentFrame(d.body.anims.currentAnim.frames[f]);
										d.sync();
									});
									pd.game.renderer.snapshot((image) => {
										const c = document.createElement('canvas');
										c.width = image.width;
										c.height = image.height;
										c.getContext('2d').drawImage(image, 0, 0);
										resolve(c.toDataURL('image/png'));
									});
								}),
							{ dolls, anim: anim.id, f }
						);
						const shot = await decodePngBytes(Buffer.from(png.split(',')[1], 'base64'));
						for (let i = 0; i < 2; i++) {
							const e = await want(oracle[i], anim.id, anim.frames[f].cell);
							for (let y = 0; y < bh; y++)
								for (let x = 0; x < bw; x++) {
									const q = (y * bw + x) * 4,
										s = (y * shot.w + i * bw + x) * 4;
									const exp = e.data[q + 3] ? [e.data[q], e.data[q + 1], e.data[q + 2]] : CLEAR;
									total++;
									if (exp.some((v, k) => v !== shot.data[s + k])) diff++;
								}
						}
					}
				const passed = control ? diff > 0 : diff === 0;
				if (!passed) failed++;
				results.push({ version: bundle.version, renderer, label, diff, total, passed });
				console.log(`${passed ? 'PASS' : 'FAIL'} ${bundle.version} ${renderer} ${label}: ${diff}/${total} px differ`);
			}
			const factOk =
				facts.castRepeat === 0 && facts.idleRepeat === -1 && facts.headItem && facts.copyBCastOpaquePx === 0 && !errors.length;
			if (!factOk) failed++;
			results.push({ version: bundle.version, renderer, facts, errors, passed: factOk });
			console.log(`${factOk ? 'PASS' : 'FAIL'} ${bundle.version} ${renderer} runtime facts ${JSON.stringify(facts)} errors=${errors.length}`);
			await page.close();
		}
} finally {
	await browser.close();
}
writeFileSync(join(out, 'phaser-results.json'), JSON.stringify({ zipSha256: sha(zipBytes), bundles, results }, null, 2));
console.log(failed ? `PHASER_SHARED_FAIL ${failed}` : 'PHASER_SHARED_PASS');
process.exitCode = failed ? 1 : 0;
