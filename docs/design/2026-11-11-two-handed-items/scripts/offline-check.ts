// Offline evidence for the two-handed and dual-wield design (design.md). No API client: it cannot spend.
// Run from the repo root: node docs/design/2026-11-11-two-handed-items/scripts/offline-check.ts
// 1. Real stored PixelLab frames (app/test/fixtures/bench, body A): where the hands meet in the slash, how close the main-hand
//    sword and axe come to each wrist, and what the production grip check (G8) says about it.
// 2. A dual-wield contact sheet from real frames: the stored sword (main hand) and bow (off hand) over the same walk frames in
//    the production draw order.
// 3. Synthetic shapes on the real keypoints, through production cleanup and QA: twin swords (one item per hand), one "pair" item
//    holding both swords, and a staff gripped by both hands.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runCase } from '../../../../app/scripts/bench.ts';
import { decodePngBytes, encodePngBytes } from '../../../../app/src/lib/image/pngraw.ts';
import { makeImg, type Img } from '../../../../app/src/lib/image/png.ts';
import { over } from '../../../../app/src/lib/compose/compose.ts';
import { splitFgBg } from '../../../../app/src/lib/compose/split.ts';
import {
	clipKeypoints,
	GATES,
	itemQa,
	kpAt,
	padImg,
	postProcess,
	slotLadder,
	slotOf,
	type CellOut
} from '../../../../app/src/lib/items/items.ts';
import type { DirectionName, Rig } from '../../../../app/src/lib/rig/rig.ts';
import type { Slot } from '../../../../app/src/lib/store/manifest.ts';

type Pt = [number, number];
const FIX = new URL('../../../../app/test/fixtures/bench/', import.meta.url);
const OUT = new URL('../out/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const cases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8'));
const body = JSON.parse(readFileSync(new URL('bodyA.json', FIX), 'utf8')) as {
	rig: Rig;
	rows: string[];
	cols: string[];
};
const rig = body.rig,
	N = rig.cell.w,
	PAD = 16,
	C = N + 2 * PAD;
const bodySheet = await decodePngBytes(new Uint8Array(readFileSync(new URL('bodyA.png', FIX))));
const cut = (sheet: Img, size: number, row: number, col: number): Img => {
	const o = makeImg(size, size);
	for (let y = 0; y < size; y++)
		o.data.set(
			sheet.data.subarray(
				((row * size + y) * sheet.w + col * size) * 4,
				((row * size + y) * sheet.w + col * size + size) * 4
			),
			y * size * 4
		);
	return o;
};
const baseOf = (dir: string, col: string) =>
	padImg(cut(bodySheet, N, body.rows.indexOf(dir), body.cols.indexOf(col)), PAD);
const wrists = (anim: string, dir: string, i: number) => {
	const k = clipKeypoints(rig, anim, dir as DirectionName)![i];
	return {
		r: kpAt(k, ['RIGHT ARM'], rig.cell, PAD)!,
		l: kpAt(k, ['LEFT ARM'], rig.cell, PAD)!,
		er: kpAt(k, ['RIGHT ELBOW'], rig.cell, PAD)!,
		el: kpAt(k, ['LEFT ELBOW'], rig.cell, PAD)!
	};
};
const nearest = (m: Uint8Array, w: number, [x, y]: Pt) => {
	let d = 1e9;
	for (let p = 0; p < m.length; p++)
		if (m[p]) d = Math.min(d, Math.hypot((p % w) + 0.5 - x, ((p / w) | 0) + 0.5 - y));
	return d;
};
const messages = (slot: Slot, cells: CellOut[]) => {
	const q = itemQa(rig, slot, 'green', cells, 0, GATES.keyOutsidePosed, PAD);
	return { fails: [...q.failCalls.values()].flat(), warnings: q.warnings };
};
const g8 = (m: { fails: string[]; warnings: string[] }) => ({
	fail: m.fails.filter((x) => x.startsWith('G8')),
	warn: m.warnings.filter((x) => x.startsWith('G8'))
});
const report: Record<string, unknown> = {};

// ---------- 1. real frames: how the stored main-hand sword and axe sit against both wrists ----------
const real: Record<string, CellOut[]> = {};
const realRows: unknown[] = [];
for (const id of ['a-sword96', 'a-axe96', 'a-bow96']) {
	const c = cases.find((x: { id: string }) => x.id === id),
		r = await runCase(c),
		posed = r.cells.filter((x) => x.posed);
	real[id] = posed;
	const m = messages(slotOf(c.slot), posed);
	for (const clip of c.clips as string[]) {
		const [anim, dir] = clip.split('/'),
			cs = posed.filter((x) => x.key.startsWith(`${clip}/`));
		const frames = cs.map((x) => {
			const i = +x.key.split('/')[2],
				w = wrists(anim, dir, i);
			return {
				apart: +Math.hypot(w.r[0] - w.l[0], w.r[1] - w.l[1]).toFixed(0),
				right: +nearest(x.mask, C, w.r).toFixed(1),
				left: +nearest(x.mask, C, w.l).toFixed(1)
			};
		});
		realRows.push({
			item: id,
			slot: c.slot,
			clip,
			wristsApartPx: frames.map((f) => f.apart).join(' '),
			itemToRightWristPx: frames.map((f) => f.right).join(' '),
			itemToLeftWristPx: frames.map((f) => f.left).join(' '),
			framesTouchingBothHands: frames.filter((f) => f.right <= 6 && f.left <= 6).length,
			// the proposed rule for a two-handed item: its own hand stays on it (within the check's 6 px contact limit)
			framesInOwnHand: `${frames.filter((f) => (c.slot === 'off_hand' ? f.left : f.right) <= 6).length} of ${frames.length}`,
			g8Fail: m.fails.filter((x) => x.startsWith(`G8 ${clip}`)),
			g8Warn: m.warnings.filter((x) => x.startsWith(`G8 ${clip}`))
		});
	}
}
report.realFrames = realRows;

// ---------- 2. dual-wield contact sheet from real frames: sword (main hand) + bow (off hand), production draw order ----------
const ladder = slotLadder(rig);
const zOf = (slotId: string, layer: 'fg' | 'bg', dir: string) => {
	const s = ladder.find((x) => x.id === slotId)!,
		o = (s.zOverrides ?? []).filter((x) => x.layer === layer && !x.anim && x.cell == null);
	return (
		(o.findLast((x) => x.dir === dir) ?? o.findLast((x) => !x.dir))?.z ??
		(layer === 'bg' ? (s.bgZ ?? 0) : s.z)
	);
};
function composite(dir: string, base: Img, items: { slot: string; layer: Img }[]): Img {
	const parts = [
		{ z: 10, img: base, tie: 0 },
		...items.flatMap((it, tie) => {
			const { fg, bg } = splitFgBg(it.layer, base);
			return [
				{ z: zOf(it.slot, 'fg', dir), img: fg, tie },
				{ z: zOf(it.slot, 'bg', dir), img: bg, tie }
			];
		})
	].sort((a, b) => a.z - b.z || a.tie - b.tie);
	const o = makeImg(base.w, base.h);
	for (const p of parts) over(o, p.img, 0, 0);
	return o;
}
const scale = (im: Img, k: number): Img => {
	const o = makeImg(im.w * k, im.h * k);
	for (let y = 0; y < o.h; y++)
		for (let x = 0; x < o.w; x++)
			o.data.set(
				im.data.subarray((((y / k) | 0) * im.w + ((x / k) | 0)) * 4, (((y / k) | 0) * im.w + ((x / k) | 0)) * 4 + 4),
				(y * o.w + x) * 4
			);
	return o;
};
async function sheet(name: string, rows: Img[][]) {
	const o = makeImg(Math.max(...rows.map((r) => r.length)) * C, rows.length * C);
	o.data.fill(40);
	for (let p = 3; p < o.data.length; p += 4) o.data[p] = 255;
	rows.forEach((r, y) => r.forEach((im, x) => over(o, im, x * C, y * C)));
	writeFileSync(new URL(name, OUT), await encodePngBytes(scale(o, 3)));
}
const overlap: Record<string, number[]> = {};
await sheet(
	'dual-real-sword-bow-walk.png',
	['south', 'east', 'north'].map((dir) =>
		Array.from({ length: 8 }, (_, i) => {
			const sword = real['a-sword96'].find((x) => x.key === `walk/${dir}/${i}`)!,
				bow = real['a-bow96'].find((x) => x.key === `walk/${dir}/${i}`)!;
			(overlap[dir] ??= []).push(sword.mask.reduce((n, v, p) => n + (v && bow.mask[p] ? 1 : 0), 0));
			return composite(dir, baseOf(dir, `walk/${i}`), [
				{ slot: 'off_hand', layer: bow.layer },
				{ slot: 'main_hand', layer: sword.layer }
			]);
		})
	)
);
report.dualRealSwordBow = {
	sheet: 'out/dual-real-sword-bow-walk.png (rows south, east, north; walk frames 0 to 7)',
	itemsOverlapPxPerFrame: overlap,
	drawOrder: Object.fromEntries(
		['south', 'east', 'north'].map((d) => [
			d,
			`off bg ${zOf('off_hand', 'bg', d)}, main bg ${zOf('main_hand', 'bg', d)}, body 10, off fg ${zOf('off_hand', 'fg', d)}, main fg ${zOf('main_hand', 'fg', d)}`
		])
	)
};

// Real frames for the mock-up (mockup.html): the stored sword alone while walking and where both hands meet in the slash,
// the sword with the bow, and each item's own layer for a tile.
const save = async (name: string, im: Img, k = 4) =>
	writeFileSync(new URL(name, OUT), await encodePngBytes(scale(im, k)));
const realAt = (id: string, key: string) => real[id].find((x) => x.key === key)!.layer;
for (const [name, dir, col] of [
	['mock-two-handed-walk.png', 'south', 'walk/0'],
	['mock-two-handed-slash-south.png', 'south', 'slash/4'],
	['mock-two-handed-slash-east.png', 'east', 'slash/4'],
	['mock-two-handed-slash-north.png', 'north', 'slash/4']
] as const)
	await save(
		name,
		composite(dir, baseOf(dir, col), [
			{ slot: 'main_hand', layer: realAt('a-sword96', `${col.replace('/', `/${dir}/`)}`) }
		])
	);
await save(
	'mock-dual-walk.png',
	composite('south', baseOf('south', 'walk/0'), [
		{ slot: 'off_hand', layer: realAt('a-bow96', 'walk/south/0') },
		{ slot: 'main_hand', layer: realAt('a-sword96', 'walk/south/0') }
	])
);
await save('mock-body.png', baseOf('south', 'walk/0'));
/** The opaque bounding box of a layer plus a 2 px margin, for a tile thumbnail. */
const tight = (im: Img): Img => {
	let x0 = im.w,
		y0 = im.h,
		x1 = 0,
		y1 = 0;
	for (let p = 0; p < im.w * im.h; p++)
		if (im.data[p * 4 + 3]) {
			x0 = Math.min(x0, p % im.w);
			x1 = Math.max(x1, p % im.w);
			y0 = Math.min(y0, (p / im.w) | 0);
			y1 = Math.max(y1, (p / im.w) | 0);
		}
	const o = makeImg(x1 - x0 + 5, y1 - y0 + 5);
	over(o, im, 2 - x0, 2 - y0);
	return o;
};
await save('thumb-sword.png', tight(realAt('a-sword96', 'walk/south/0')));
await save('thumb-bow.png', tight(realAt('a-bow96', 'walk/south/0')));

// ---------- 3. synthetic shapes on the real keypoints, through production cleanup and QA ----------
const line = (m: Uint8Array, a: Pt, b: Pt, wd: number) => {
	const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 4) || 1,
		l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
	for (let i = 0; i <= n; i++)
		for (let k = -wd / 2; k <= wd / 2; k += 0.25) {
			const t = i / n,
				X = Math.floor(a[0] + t * (b[0] - a[0]) - (k * (b[1] - a[1])) / l),
				Y = Math.floor(a[1] + t * (b[1] - a[1]) + (k * (b[0] - a[0])) / l);
			if (X >= 0 && Y >= 0 && X < C && Y < C) m[Y * C + X] = 1;
		}
};
/** A 22 px blade continuing the forearm from the wrist, with a 3 px pommel behind it. */
const blade = (m: Uint8Array, elbow: Pt, wrist: Pt) => {
	const l = Math.hypot(wrist[0] - elbow[0], wrist[1] - elbow[1]) || 1,
		u: Pt = [(wrist[0] - elbow[0]) / l, (wrist[1] - elbow[1]) / l];
	line(m, [wrist[0] - 3 * u[0], wrist[1] - 3 * u[1]], [wrist[0] + 22 * u[0], wrist[1] + 22 * u[1]], 2);
};
/** A synthetic extracted cell. The shape is drawn whole: unlike real output, the body never hides its far side, so the
 *  side-view rows of the synthetic sheet show the far-hand sword in front of the body. */
function cellOf(key: string, mask: Uint8Array, base: Img, color: number[]): CellOut {
	const layer = makeImg(C, C);
	for (let p = 0; p < mask.length; p++) if (mask[p]) layer.data.set(color, p * 4);
	return {
		key,
		call: 0,
		base,
		input: base,
		out: layer,
		layer,
		mask,
		area: mask.reduce((s, v) => s + v, 0),
		outBand: 0,
		baseBand: 0,
		specks: 0,
		pinholes: 0,
		shifted: false,
		offset: [0, 0],
		stray: 0,
		posed: true
	} as CellOut;
}
const CLIPS = ['walk/south', 'walk/east', 'walk/north', 'slash/south', 'slash/east', 'slash/north'];
const synth: Record<string, unknown>[] = [];
const twinRows: Img[][] = [];
for (const clip of CLIPS) {
	const [anim, dir] = clip.split('/'),
		n = rig.animations.find((a) => a.id === anim)!.cells;
	const main: CellOut[] = [],
		off: CellOut[] = [],
		pair: CellOut[] = [],
		staff: CellOut[] = [];
	let both = 0;
	for (let i = 0; i < n; i++) {
		const w = wrists(anim, dir, i),
			base = baseOf(dir, `${anim}/${i}`),
			key = `${clip}/${i}`;
		const mr = new Uint8Array(C * C),
			ml = new Uint8Array(C * C),
			ms = new Uint8Array(C * C);
		blade(mr, w.er, w.r);
		blade(ml, w.el, w.l);
		// staff: follows the right forearm; where the left wrist is within 12 px it lies through both fists instead
		const apart = Math.hypot(w.r[0] - w.l[0], w.r[1] - w.l[1]);
		if (apart <= 12 && apart > 1) {
			both++;
			const u: Pt = [(w.r[0] - w.l[0]) / apart, (w.r[1] - w.l[1]) / apart];
			line(ms, [w.l[0] - 10 * u[0], w.l[1] - 10 * u[1]], [w.r[0] + 22 * u[0], w.r[1] + 22 * u[1]], 2);
		} else {
			const l = Math.hypot(w.r[0] - w.er[0], w.r[1] - w.er[1]) || 1,
				u: Pt = [(w.r[0] - w.er[0]) / l, (w.r[1] - w.er[1]) / l];
			line(ms, [w.r[0] - 12 * u[0], w.r[1] - 12 * u[1]], [w.r[0] + 22 * u[0], w.r[1] + 22 * u[1]], 2);
		}
		main.push(cellOf(key, mr, base, [200, 200, 215, 255]));
		off.push(cellOf(key, ml, base, [215, 170, 90, 255]));
		pair.push(cellOf(key, mr.map((v, p) => v | ml[p]) as Uint8Array, base, [200, 200, 215, 255]));
		staff.push(cellOf(key, ms, base, [150, 100, 50, 255]));
	}
	const area = (cs: CellOut[]) => cs.reduce((s, c) => s + c.area, 0);
	const run = (slot: string, cs: CellOut[]) => {
		const before = area(cs);
		const removed = postProcess(rig, slotOf(slot), cs, {}, PAD).removed;
		const m = messages(slotOf(slot), cs);
		return {
			cleanupRemovedPx: removed,
			ofPx: before,
			fails: m.fails.map((x) => x.split(':')[0].split(' ')[0]).sort().join(' ') || 'none',
			g8: g8(m)
		};
	};
	const twinMain = run('main_hand', main),
		twinOff = run('off_hand', off);
	twinRows.push(
		main.map((c, i) =>
			composite(dir, c.base, [
				{ slot: 'off_hand', layer: off[i].layer },
				{ slot: 'main_hand', layer: c.layer }
			])
		)
	);
	synth.push({
		clip,
		twinSwords_mainHandItem: twinMain,
		twinSwords_offHandItem: twinOff,
		pairAsOneMainHandItem: run('main_hand', pair),
		staffBothHands_asMainHandItem: { framesThroughBothFists: both, ...run('main_hand', staff) }
	});
}
await sheet('dual-synthetic-twin-swords.png', twinRows);
report.synthetic = synth;

writeFileSync(new URL('offline-check.json', OUT), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
