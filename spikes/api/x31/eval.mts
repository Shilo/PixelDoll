// x31 evaluator (0 gens): cut each returned cell back into its rig-cell window, extract the item exactly as the app does for an
// edit cell (extractCell on the real body frame, postProcess against the dressed standing layers, itemQa with the standing
// palettes), and add fit metrics of our own. usage: node --experimental-transform-types --no-warnings eval.mts <arm> [seed]
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mts';
const { items, OUT, rig, item, slotOf, skel, blob, save } = L;
const palette = await import(new URL('../../../app/src/lib/dress/palette.ts', import.meta.url).href);
const itemPalette = await import(new URL('../../../app/src/lib/dress/item-palette.ts', import.meta.url).href);
const countOpaque = (im: L.Img) => { let n = 0; for (let p = 0; p < im.w * im.h; p++) if (im.data[p * 4 + 3]) n++; return n; };
const variant = `${process.env.REG ? (process.env.REG === 'cut' ? '.cut' : '.reg') : ''}${process.env.SNAP ? '.snap' : ''}${process.env.SWAP ? '.swap-' + process.env.SWAP.replace(':', '-') : ''}`;

const arm = process.argv[2], seed = process.argv[3] ?? '7';
const dir = path.join(OUT, L.TAG + arm), W = rig.cell.w, H = rig.cell.h, ROUTE = 'green';
const plans = fs.readdirSync(dir).filter((f) => f.endsWith('.plan.json') && f.includes(`.s${seed}.`)).sort();
const byItem = new Map<string, { plan: any; file: string }[]>();
for (const f of plans) {
	const plan = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
	const file = path.join(dir, f.replace('.plan.json', ''));
	if (!byItem.has(plan.item)) byItem.set(plan.item, []);
	byItem.get(plan.item)!.push({ plan, file });
}
const exists = (f: string) => fs.existsSync(f);
const scaleUp = (im: L.Img, k: number) => {
	const o = L.blank(im.w * k, im.h * k);
	for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.data.set(im.data.subarray((((y / k) | 0) * im.w + ((x / k) | 0)) * 4, (((y / k) | 0) * im.w + ((x / k) | 0)) * 4 + 4), (y * o.w + x) * 4);
	return o;
};
const results: any = { arm, seed, items: {} };
for (const [id, calls] of byItem) {
	const slot = slotOf(id), it = item(id);
	const meta = JSON.parse(fs.existsSync(`${calls[0].file}.json`) ? fs.readFileSync(`${calls[0].file}.json`, 'utf8') : '{}');
	void meta;
	// returned cells, in rig coordinates
	const outs: { key: string; dir: L.Dir; out: L.Img; win: any; call: number; sheetEdge: number }[] = [];
	let missing = 0, gens = 0;
	const sheetShifts: number[][] = [], wideShifts: number[][] = [], refChanged: any[] = [];
	const usage: any[] = [];
	for (const [k, { plan, file }] of calls.entries()) {
		if (!exists(`${file}.json`)) { missing++; continue; }
		const done = JSON.parse(fs.readFileSync(`${file}.json`, 'utf8'));
		usage.push(...done.usage);
		gens += done.usage.reduce((s: number, u: any) => s + (u.generations ?? 0), 0);
		if (plan.out === 'sheet') {
			let g = await L.load(`${file}.0.png`);
			// sheet registration (REG=1): one translation for the whole returned sheet, the one that best re-aligns its opaque
			// mask with the submitted sheet over -3..3 px (all cells move together: see sheetshift.mts)
			// REG=cut: the same estimate over +-5 px, applied by moving each cell's cut origin (no translate, no px dropped at the
			// sheet border); reference cells are compared with what was sent
			let cut = [0, 0];
			if (process.env.REG) {
				const sent = await L.load(`${file}.sheet.png`), sh = sheetShift(sent, g, process.env.REG === 'cut' ? 5 : 3);
				if (process.env.REG === 'cut') cut = sh;
				else if (sh[0] || sh[1]) g = items.translate(g, -sh[0], -sh[1]);
				if (sh[0] || sh[1]) console.log(`${id} call ${k}: sheet registered by ${-sh[0]},${-sh[1]}`);
				sheetShifts.push(sh);
				for (const c of plan.cells.filter((c: any) => c.ref)) {
					const a = L.crop(sent, c.x, c.y, c.win.w, c.win.h), b = L.crop(g, c.x + cut[0], c.y + cut[1], c.win.w, c.win.h);
					refChanged.push({ dir: c.dir, shape: layerDiff(a, b, true), color: layerDiff(a, b), area: countOpaque(a) });
				}
			}
			if (g.w !== plan.sheet.w || g.h !== plan.sheet.h) console.log(`${id} ${k}: returned sheet ${g.w}x${g.h} != sent ${plan.sheet.w}x${plan.sheet.h}`);
			for (const c of plan.cells) {
				if (c.ref) continue;
				const cell = L.crop(g, c.x + cut[0], c.y + cut[1], c.win.w, c.win.h);
				outs.push({ key: c.key, dir: c.dir, out: L.uncrop(cell, c.win, W, H), win: c.win, call: k, sheetEdge: 0 });
			}
		} else {
			for (const [i, c] of plan.cells.entries()) {
				if (c.ref) continue;
				let f = await L.load(`${file}.${i}.png`);
				// WIDE=n: register the whole returned frame (posed body + item) on the real body over +-n px first
				if (process.env.WIDE) {
					const [anim, , fi] = c.key.split('/');
					const base = (await L.bodyFrames(anim, c.dir))[+fi], sh = frameShift(base, f, +process.env.WIDE);
					if (sh[0] || sh[1]) f = items.translate(f, -sh[0], -sh[1]);
					wideShifts.push(sh);
				}
				outs.push({ key: c.key, dir: c.dir, out: c.win.w === W && c.win.h === H ? f : L.uncrop(f, c.win, W, H), win: c.win, call: k, sheetEdge: 0 });
			}
		}
	}
	// targets without a body (the fixture's cross-punch exists only facing south) are not frames: drop them
	for (let i = outs.length - 1; i >= 0; i--) {
		const [anim, , fi] = outs[i].key.replace('#2', '').split('/');
		const base = (await L.bodyFrames(anim, outs[i].dir))[+fi];
		if (L.bbox(base).x1 < 0) outs.splice(i, 1);
	}
	if (!outs.length) { console.log(`${id}: no outputs (${missing} calls missing)`); continue; }
	const dirs = [...new Set(outs.map((o) => o.dir))];
	// dressed standing layers per direction (keys) and their palettes
	const keys: Record<string, L.Img> = {}, standingPalettes = new Map<string, number[]>(), standOff: Record<string, number> = {}, standCov: Record<string, number> = {};
	for (const d of dirs) {
		const rest = await L.restBody(d);
		const kc = items.extractCell({ key: L.refKey(d), call: 0, base: rest, out: await L.dressed(id, d), route: ROUTE, band: items.bandOf(slot, skel(L.refKey(d)), H), posed: false, clip: slot.band, held: false, pad: 0 });
		keys[d] = kc.layer;
		const standing = await L.standingLayers(id, d);
		const counts = palette.colorCounts(standing);
		standingPalettes.set(d, counts.size <= 256 ? [...counts.keys()] : []);
		standOff[d] = offBody(kc.layer, rest);
		standCov[d] = coverage(kc.layer, rest, items.bandOf(slot, skel(L.refKey(d)), H));
	}
	const cells = [];
	for (const o of outs) {
		const [anim, , fi] = o.key.replace('#2', '').split('/');
		const base = await L.bodyFrames(anim, o.dir).then((f) => f[+fi]);
		cells.push(items.extractCell({ key: o.key.replace('#2', ''), call: o.call, base, out: o.out, route: ROUTE, band: items.bandOf(slot, skel(o.key), H), posed: !!process.env.POSED, clip: slot.band, held: false, pad: 0 }));
	}
	const pre = cells.map((c) => ({ area: c.area, keyLost: c.keyLost ?? 0, keyKept: c.keyKept, keyOutside: c.keyOutside, shifted: c.shifted }));
	// SWAP=a:b (synthetic, 0 gens): every frame of view a gets view b's extracted layer of the same frame, as if the model had
	// drawn the whole view with the other view's design
	if (process.env.SWAP) {
		const [a, b] = process.env.SWAP.split(':');
		cells.forEach((c: any, i: number) => {
			if (outs[i].dir !== a) return;
			const [an, , fr] = outs[i].key.split('/');
			const j = outs.findIndex((o) => o.dir === b && o.key === `${an}/${b}/${fr}`);
			if (j < 0) return;
			c.layer = { ...cells[j].layer, data: new Uint8ClampedArray(cells[j].layer.data) };
			c.mask = new Uint8Array(cells[j].mask);
			c.area = cells[j].area;
		});
		console.log(`${id}: SWAP ${a} frames now carry the ${b} design`);
	}
	const pp = items.postProcess(rig, slot, cells, keys, 0);
	// SNAP=1: the app's standing palette snap (standingDyeMatcher) per view over all its frames, before QA. Owned colors are the
	// item's material ramps; the fixture has no materials, so its standing palette stands in for them (approximation).
	if (process.env.SNAP) {
		const mats = L.manifest.materials.filter((m: any) => m.owner === id);
		for (const d of dirs) {
			const std = new Set<number>(standingPalettes.get(d) ?? []);
			const owned = mats.length ? new Set<number>(mats.flatMap((m: any) => m.ramp.map(palette.fromHex))) : std;
			const idx = cells.map((_c: any, i: number) => (outs[i].dir === d ? i : -1)).filter((i: number) => i >= 0);
			const match = itemPalette.standingDyeMatcher(std, owned, idx.map((i: number) => cells[i].layer));
			for (const i of idx) cells[i].layer = match(cells[i].layer);
		}
	}
	// GATE=1: the app's view checks (dirGate: G11-G15 and the H4 keyframe and opposite-view check) on these edit cells as if
	// they were posed; production skips edit cells (dirGate tests c.posed)
	let gate: any;
	if (process.env.GATE) {
		const bodies: Record<string, L.Img> = {};
		for (const d of dirs) bodies[d] = await L.restBody(d);
		gate = items.dirGate(slot, cells.map((c: any) => ({ ...c, posed: true })), keys, rig, bodies, it.prompt);
		const fl = [...gate.fails.values()].flat();
		console.log(`   GATE (view checks on edit cells): ${fl.length} fails, ${gate.warnings.length} warnings`);
		for (const m of [...fl, ...gate.warnings].slice(0, 8)) console.log('     ', String(m).slice(0, 200));
	}
	// TRUTH=1 (s2): opaque-mask IoU with the fixture's own accepted item layers of the same cell
	const truth: number[] = [];
	if (process.env.TRUTH && L.SRC === 's2')
		for (const [i, c] of (cells as any[]).entries()) {
			const t = await L.fixtureLayers(id, outs[i].key);
			if (!t.length) continue;
			let a = 0, u = 0;
			for (let p = 0; p < W * H; p++) {
				const A = c.layer.data[p * 4 + 3] > 0, B = t.some((im: L.Img) => im.data[p * 4 + 3] > 0);
				if (A && B) a++;
				if (A || B) u++;
			}
			truth.push(u ? a / u : 1);
		}
	const q = items.itemQa(rig, slot, ROUTE, cells, 0, items.GATES.keyOutside, 0, new Set(), standingPalettes);
	const per = cells.map((c: any, i: number) => {
		const o = outs[i];
		return {
			key: outs[i].key,
			area: c.area,
			keyKept: pre[i].keyKept && +pre[i].keyKept.toFixed(3),
			keyLost: pre[i].keyLost,
			keyOutside: pre[i].keyOutside && +pre[i].keyOutside.toFixed(3),
			shifted: pre[i].shifted,
			offBody: offBody(c.layer, c.base),
			standingOffBody: standOff[o.dir],
			cover: coverage(c.layer, c.base, items.bandOf(slot, skel(c.key), H)),
			standingCover: standCov[o.dir],
			windowEdge: o.win.w === W ? 0 : edgePx(c.layer, o.win),
			...paletteShare(c.layer, standingPalettes.get(o.dir) ?? [])
		};
	});
	// eiv2-dense: the same input frame drawn twice in one sheet; px that differ between the two extracted layers
	const dup: number[] = [], dupShape: number[] = [], dupArea: number[] = [];
	outs.forEach((o, i) => { if (!o.key.endsWith('#2')) return; const j = outs.findIndex((x) => x.key === o.key.replace('#2', '')); if (j >= 0) { dup.push(layerDiff(cells[i].layer, cells[j].layer)); dupShape.push(layerDiff(cells[i].layer, cells[j].layer, true)); dupArea.push(cells[j].area); } });
	if (process.env.SAVE_LAYERS) for (const [i, c] of cells.entries()) await save(path.join(dir, `${id}.s${seed}.layer.${outs[i].key.replace(/\//g, '_')}.png`), c.layer);
	const clips = Object.fromEntries(Object.entries(q.qa.clips).map(([k, v]: any) => [k, pick(v)]));
	const ps = per.filter((p: any) => p.exact != null);
	const palShare = { exact: +(ps.reduce((a: number, p: any) => a + p.exact, 0) / ps.length).toFixed(3), near12: +(ps.reduce((a: number, p: any) => a + p.near, 0) / ps.length).toFixed(3) };
	console.log("   palette share (mean over frames): exact", palShare.exact, "within 12/channel", palShare.near12);
	if (truth.length) console.log(`   TRUTH IoU with fixture layers over ${truth.length} cells: mean ${(truth.reduce((s, x) => s + x, 0) / truth.length).toFixed(3)} min ${Math.min(...truth).toFixed(3)}`);
	if (refChanged.length) console.log('   reference cells changed by the model (shape px / color px / opaque px):', refChanged.map((r) => `${r.dir} ${r.shape}/${r.color}/${r.area}`).join(', '));
	const edgeFrames = per.filter((p: any) => p.windowEdge).map((p: any) => `${p.key}:${p.windowEdge}`);
	if (edgeFrames.length) console.log('   crop-edge contact (item px on a window edge that is not the rig border):', edgeFrames.join(' '));
	results.items[id] = { truth, refChanged, gate: gate && { fails: [...gate.fails.values()].flat(), warnings: gate.warnings }, wideShifts, palette: palShare, sheetShifts, dupDiff: dup, dupShape, dupArea, gens, usage, missing, summary: pick(q.qa), clips, fails: [...q.failCalls.values()].flat(), soft: [...q.softCalls.values()].flat(), warnings: q.warnings, removed: pp.removed, cells: per };
	console.log(`\n== ${arm} ${id}: ${gens} gens, QA ${q.qa.status}; ${JSON.stringify(pick(q.qa))}`);
	for (const [k, v] of Object.entries(clips)) console.log(`   ${k}: ${JSON.stringify(v)}`);
	if (dup.length) console.log('   duplicate frames: px differing (color or shape)', dup.join(','), '| shape only', dupShape.join(','), '| item area', dupArea.join(','));
	if (q.failCalls.size) console.log('   FAIL', [...q.failCalls.values()].flat().join(' | ').slice(0, 600));
	if (q.warnings.length) console.log('   WARN', q.warnings.join(' | ').slice(0, 600));
	console.log('   cells', per.map((p) => `${p.key.split('/').slice(1).join('')}:a${p.area} lost${p.keyLost} off${p.offBody}/${p.standingOffBody} cov${p.cover}/${p.standingCover}${p.windowEdge ? ' edge' + p.windowEdge : ''}${p.shifted ? ' SHIFT' : ''}`).join('  '));
	// evidence: rows = views; columns = standing (body + extracted key layer), then each frame recomposed; 3x nearest for viewing
	const cols = 1 + Math.max(...dirs.map((d) => outs.filter((o) => o.dir === d).length));
	const strip = L.blank(cols * W, dirs.length * H);
	for (const [r, d] of dirs.entries()) {
		const rest = await L.restBody(d);
		L.blit(strip, items.recompose({ base: rest, layer: keys[d] }), 0, r * H);
		cells.filter((c: any, i: number) => c.key.split('/')[1] === d && !outs[i].key.endsWith('#2')).sort((a: any, b: any) => +a.key.split('/')[2] - +b.key.split('/')[2]).forEach((c: any, i: number) => L.blit(strip, items.recompose(c), (i + 1) * W, r * H));
	}
	await save(path.join(dir, `${id}.s${seed}${variant}${process.env.POSED ? '.posed' : ''}${process.env.WIDE ? '.wide' + process.env.WIDE : ''}.eval.png`), scaleUp(L.opaqueBg(strip, [205, 210, 220]), 3));
}
fs.writeFileSync(path.join(dir, `eval.s${seed}${variant}${process.env.POSED ? '.posed' : ''}${process.env.WIDE ? '.wide' + process.env.WIDE : ''}.json`), JSON.stringify(results, null, 1));

function pick(v: any) {
	const o: any = {};
	for (const k of ['status', 'minKeyKept', 'maxKeyOutside', 'minAreaRatio', 'maxAreaCV', 'maxPaletteDist', 'clipPx', 'shiftedFrames', 'strayPx', 'missingLowerFrames', 'detailReviewFrames', 'facingReviewFrames'])
		if (v[k] != null) o[k] = typeof v[k] === 'number' ? +v[k].toFixed(3) : v[k];
	return o;
}
/** Item px drawn where the real body frame is transparent (hair and hat brims legitimately do some of this). */
function offBody(layer: L.Img, base: L.Img) {
	let n = 0;
	for (let p = 0; p < layer.w * layer.h; p++) if (layer.data[p * 4 + 3] && !base.data[p * 4 + 3]) n++;
	return n;
}
/** Share of the body's opaque px inside the slot band that the item covers (exposed skin under a garment lowers it). */
function coverage(layer: L.Img, base: L.Img, band: { y: number; h: number }) {
	let b = 0, c = 0;
	for (let y = Math.max(0, band.y); y < Math.min(base.h, band.y + band.h); y++)
		for (let x = 0; x < base.w; x++) {
			const p = y * base.w + x;
			if (!base.data[p * 4 + 3]) continue;
			b++;
			if (layer.data[p * 4 + 3]) c++;
		}
	return b ? +(c / b).toFixed(2) : 0;
}
/** Translation of a returned frame's opaque mask (posed green body + item) against the real body's, best IoU over +-n px. */
function frameShift(base: L.Img, out: L.Img, n: number): number[] {
	let best = [0, 0], bv = -1;
	for (let dy = -n; dy <= n; dy++)
		for (let dx = -n; dx <= n; dx++) {
			let i = 0, u = 0;
			for (let y = 0; y < base.h; y++)
				for (let x = 0; x < base.w; x++) {
					const A = base.data[(y * base.w + x) * 4 + 3] > 0, X = x + dx, Y = y + dy;
					const B = X >= 0 && Y >= 0 && X < out.w && Y < out.h && out.data[(Y * out.w + X) * 4 + 3] > 0;
					if (A && B) i++;
					if (A || B) u++;
				}
			const v = u ? i / u : 0;
			if (v > bv + 1e-9) { bv = v; best = [dx, dy]; }
		}
	return best;
}
/** Whole-sheet translation (dx, dy) of `out` against `sent` with the best opaque-mask IoU over -3..3 px. */
function sheetShift(sent: L.Img, out: L.Img, n = 3): number[] {
	let best = [0, 0], bv = -1;
	for (let dy = -n; dy <= n; dy++)
		for (let dx = -n; dx <= n; dx++) {
			let i = 0, u = 0;
			for (let y = 0; y < sent.h; y++)
				for (let x = 0; x < sent.w; x++) {
					const A = sent.data[(y * sent.w + x) * 4 + 3] > 0, X = x + dx, Y = y + dy;
					const B = X >= 0 && Y >= 0 && X < out.w && Y < out.h && out.data[(Y * out.w + X) * 4 + 3] > 0;
					if (A && B) i++;
					if (A || B) u++;
				}
			const v = u ? i / u : 0;
			if (v > bv + 1e-9) { bv = v; best = [dx, dy]; }
		}
	return best;
}
/** Share of item px whose color is exactly in the standing palette, and within 12 per channel of one (the snap tolerance). */
function paletteShare(layer: L.Img, pal: number[]) {
	if (!pal.length) return {};
	const set = new Set(pal), rgb = pal.map((c) => [c >> 16, (c >> 8) & 255, c & 255]);
	let n = 0, e = 0, near = 0;
	for (let p = 0; p < layer.w * layer.h; p++) {
		if (!layer.data[p * 4 + 3]) continue;
		n++;
		const r = layer.data[p * 4], g = layer.data[p * 4 + 1], b = layer.data[p * 4 + 2];
		if (set.has((r << 16) | (g << 8) | b)) e++;
		if (rgb.some((c) => Math.max(Math.abs(c[0] - r), Math.abs(c[1] - g), Math.abs(c[2] - b)) <= 12)) near++;
	}
	return n ? { exact: +(e / n).toFixed(3), near: +(near / n).toFixed(3) } : {};
}
/** px whose item presence or color differs between two layers. */
function layerDiff(a: L.Img, b: L.Img, shapeOnly = false) {
	let n = 0;
	for (let p = 0; p < a.w * a.h; p++) {
		const A = a.data[p * 4 + 3] > 0, B = b.data[p * 4 + 3] > 0;
		if (A !== B || (!shapeOnly && A && (a.data[p * 4] !== b.data[p * 4] || a.data[p * 4 + 1] !== b.data[p * 4 + 1] || a.data[p * 4 + 2] !== b.data[p * 4 + 2]))) n++;
	}
	return n;
}
/** Item px on the first/last row or column of a crop window: the item may continue outside what the model saw. */
function edgePx(layer: L.Img, win: { x: number; y: number; w: number; h: number }) {
	let n = 0;
	for (let y = win.y; y < win.y + win.h; y++)
		for (let x = win.x; x < win.x + win.w; x++)
			if (((x === win.x && x > 0) || (y === win.y && y > 0) || (x === win.x + win.w - 1 && x < layer.w - 1) || (y === win.y + win.h - 1 && y < layer.h - 1)) && layer.data[(y * layer.w + x) * 4 + 3]) n++;
	return n;
}
