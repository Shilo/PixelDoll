// Offline R1 probe: which extracted item px cover a visible base-body hand px? Read-only; imports production code and the
// spike harness loaders (never y_env.mts, never a client call). Writes per-item 4x crop sheets and rows.json to ./hand-front/.
// Usage (from spikes/api): node <this file>
import fs from 'node:fs';
import path from 'node:path';
const ROOT = 'C:/Programming_Files/Shilocity/PixelLab/PixelDoll/';
const APP = 'file:///' + ROOT + 'app/';
const SP = 'file:///' + ROOT + 'spikes/api/c25/';
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const OUTDIR = path.join(HERE, 'hand-front');
fs.mkdirSync(OUTDIR, { recursive: true });
const lib = await import(SP + 'lib.mts');
lib.readOnly();
const { items, chroma, load, save } = lib;
const { sheet } = await import(SP + 'evaluate.mts');
const { rigA, restA, baseA, keyframeA, DIRS } = await import(SP + 's4rig.mts');
const { rigB, restB } = await import(SP + 'bodyB.mts');
const { runCase } = await import(APP + 'scripts/bench.ts');
const { isGarment } = await import(APP + 'src/lib/dress/regions.ts');
type Img = { w: number; h: number; data: Uint8ClampedArray };
type KP = Record<string, [number, number]>;
const SPK = ROOT + 'spikes/api/out/';

export interface Cell {
	src: string; item: string; slot: string; dir: string; key: string; posed: boolean;
	N: number; base: Img; layer: Img; kp: KP | null; keyLayer?: Img; co?: any;
}
const kpOf = (k: { label: string; x: number; y: number }[] | undefined, cell: { w: number; h: number }, pad: number): KP | null =>
	k ? Object.fromEntries(k.map((q) => [q.label, [q.x * cell.w + pad, q.y * cell.h + pad] as [number, number]])) : null;

// ---------- hand definition ----------
const lum = (d: Uint8ClampedArray, i: number) => (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
const isSkin = (b: Img, p: number) => {
	const d = b.data, i = p * 4;
	return d[i + 3] > 0 && lum(d, i) >= 0.25 && !isGarment((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
};
const segDist = (px: number, py: number, a: [number, number], b: [number, number]) => {
	const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy;
	const t = L ? Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / L)) : 0;
	return Math.hypot(px - a[0] - t * vx, py - a[1] - t * vy);
};
export const handR = (N: number) => Math.max(3, Math.round((4 * N) / 64));
/** Visible hand px: skin px within R of a wrist, distal of it along elbow->wrist (1 px slack), nearer that hand bone than any
 *  other skin bone (legs, head, the other arm), in a 4-connected piece that reaches within R/2 of the wrist. */
export function handMask(base: Img, kp: KP, N: number): Uint8Array {
	const { w, h } = base, R = handR(N), m = new Uint8Array(w * h);
	const mid = (a: string, b: string): [number, number] => [(kp[a][0] + kp[b][0]) / 2, (kp[a][1] + kp[b][1]) / 2];
	const others = (side: 'LEFT' | 'RIGHT') => {
		const o = side === 'LEFT' ? 'RIGHT' : 'LEFT';
		const s: [[number, number], [number, number]][] = [];
		for (const sd of ['LEFT', 'RIGHT']) s.push([kp[`${sd} HIP`], kp[`${sd} KNEE`]], [kp[`${sd} KNEE`], kp[`${sd} LEG`]]);
		s.push([kp.NECK, kp.NOSE], [kp[`${o} SHOULDER`], kp[`${o} ELBOW`]]);
		return s.filter(([a, b]) => a && b);
	};
	for (const side of ['LEFT', 'RIGHT'] as const) {
		const W = kp[`${side} ARM`], E = kp[`${side} ELBOW`];
		if (!W || !E) continue;
		const L = Math.hypot(W[0] - E[0], W[1] - E[1]) || 1, u = [(W[0] - E[0]) / L, (W[1] - E[1]) / L];
		const tip: [number, number] = [W[0] + u[0] * R, W[1] + u[1] * R], ob = others(side), sel = new Uint8Array(w * h);
		void mid;
		for (let y = Math.max(0, Math.floor(W[1] - R - 1)); y <= Math.min(h - 1, Math.ceil(W[1] + R + 1)); y++)
			for (let x = Math.max(0, Math.floor(W[0] - R - 1)); x <= Math.min(w - 1, Math.ceil(W[0] + R + 1)); x++) {
				const cx = x + 0.5, cy = y + 0.5, p = y * w + x;
				if (Math.hypot(cx - W[0], cy - W[1]) > R) continue;
				if ((cx - W[0]) * u[0] + (cy - W[1]) * u[1] < -1) continue;
				if (!isSkin(base, p)) continue;
				const dh = segDist(cx, cy, W, tip);
				if (ob.some(([a, b]) => segDist(cx, cy, a, b) < dh)) continue;
				sel[p] = 1;
			}
		// 4-connected pieces; keep those reaching within R/2 of the wrist
		const seen = new Uint8Array(w * h);
		for (let p0 = 0; p0 < sel.length; p0++) {
			if (!sel[p0] || seen[p0]) continue;
			const st = [p0], comp: number[] = [];
			seen[p0] = 1;
			while (st.length) {
				const p = st.pop()!;
				comp.push(p);
				const x = p % w, y = (p / w) | 0;
				for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
					const X = x + dx, Y = y + dy, q = Y * w + X;
					if (X < 0 || Y < 0 || X >= w || Y >= h || !sel[q] || seen[q]) continue;
					seen[q] = 1;
					st.push(q);
				}
			}
			if (comp.some((p) => Math.hypot((p % w) + 0.5 - W[0], ((p / w) | 0) + 0.5 - W[1]) <= R / 2 + 0.5)) for (const p of comp) m[p] = 1;
		}
	}
	return m;
}

// ---------- corpus ----------
const cells: Cell[] = [];
const kfLayers = new Map<string, Img>();
// 1. bench fixtures (production extraction, cleanup and QA via runCase)
const cases = JSON.parse(fs.readFileSync(ROOT + 'app/test/fixtures/bench/cases.json', 'utf8'));
for (const c of cases) {
	const body = JSON.parse(fs.readFileSync(ROOT + `app/test/fixtures/bench/body${c.body}.json`, 'utf8')), rig = body.rig;
	const res = await runCase(c);
	for (const x of res.cells) {
		const [a, d, i] = x.key.split('/');
		const k = a === 'rest' ? rig.rest?.[d]?.keypoints : items.clipKeypoints(rig, a, d)?.[+i];
		cells.push({ src: 'bench', item: c.id, slot: c.slot, dir: d, key: x.key, posed: a !== 'rest', N: rig.cell.w, base: x.base, layer: x.layer, kp: kpOf(k, rig.cell, c.pad), co: x });
	}
	for (const x of cells.filter((q) => q.src === 'bench' && q.item === c.id && q.key.startsWith('rest/'))) for (const y of cells.filter((q) => q.src === 'bench' && q.item === c.id && q.dir === x.dir)) y.keyLayer = x.layer;
}
// 2. chroma A/B 2026-11-09 dress calls (rest views, bodies A and B, keys green/azure/blue, seeds 7/11)
const Y_SLOT: Record<string, string> = { helm: 'head', boots: 'feet', cloak: 'back', crown: 'head', hair: 'hair', jerkin: 'torso_outer', plate: 'torso_outer', hood: 'head', amulet: 'neck', tunic: 'torso_outer' };
const rA: any = rigA(), rB: any = rigB();
const stored = async (f: string) => (fs.existsSync(`${f}.json`) ? Promise.all(Array.from({ length: JSON.parse(fs.readFileSync(`${f}.json`, 'utf8')).frames }, (_, i) => load(`${f}.${i}.png`))) : null);
for (const [bn, rig, rest, views] of [['A', rA, restA, [...DIRS]], ['B', rB, restB, ['south', 'east', 'north']]] as const)
	for (const [item, slot] of Object.entries(Y_SLOT))
		for (const k of ['green', 'azure', 'blue'])
			for (const seed of [7, 11]) {
				const outs = await stored(`${SPK}chroma-2026-11-09/Y/${bn}/${item}/${k}_dress_s${seed}`);
				if (!outs) continue;
				for (const [i, d] of (views as string[]).entries()) {
					const base = await (rest as any)(d), kp = kpOf(rig.rest[d].keypoints, rig.cell, 0);
					const s = Object.fromEntries(Object.entries(kp!).map(([l, [x, y]]) => [l, { x, y }]));
					const c: any = items.extractCell({ key: `rest/${d}/0`, call: 0, base, out: outs[i], route: k, band: items.bandOf(slot, s, rig.cell.h) });
					cells.push({ src: `Y${bn}`, item: `${item}.${k}.s${seed}`, slot, dir: d, key: `rest/${d}/0`, posed: false, N: rig.cell.w, base, layer: c.layer, kp, keyLayer: c.layer, co: c });
				}
			}
// 3. body A posed slash/walk from round 1 arm P (c25/P) and round 2 arm A (c25b/A): S4 keyframes posed by skeleton-v3
const S4: Record<string, string> = { boots: 'feet', cape: 'back', chest: 'torso_outer', helmet: 'head', hair: 'hair' };
const skelA = (k: any) => Object.fromEntries(Object.entries(kpOf(k, rA.cell, 0)!).map(([l, [x, y]]) => [l, { x, y }]));
for (const [run, dirp] of [['c25', 'c25/P'], ['c25b', 'c25b/A']])
	for (const [item, slot] of Object.entries(S4)) {
		const dirPath = `${SPK}${dirp}/${item}`;
		if (!fs.existsSync(dirPath)) continue;
		for (const f of fs.readdirSync(dirPath).filter((f) => /^[a-z]+_s\d+_(slash|walk)_(south|east|north)\.json$/.test(f))) {
			const stem = f.slice(0, -5), [, , anim, d] = stem.split('_'), outs = await stored(`${dirPath}/${stem}`);
			if (!outs) continue;
			const kfKey = `${item}/${d}`;
			if (!kfLayers.has(kfKey)) {
				const s0 = skelA(rA.rest[d].keypoints);
				kfLayers.set(kfKey, items.extractCell({ key: `rest/${d}/0`, call: 0, base: await restA(d), out: await keyframeA(item, d), route: 'green', band: items.bandOf(slot, s0, 64) }).layer);
			}
			const kps = items.clipKeypoints(rA, anim, d)!, group: any[] = [];
			for (let i = 0; i < outs.length && i < 8; i++)
				group.push(items.extractCell({ key: `${anim}/${d}/${i}`, call: 1, base: await baseA(d, anim, i), out: outs[i], route: 'green', band: items.bandOf(slot, skelA(kps[i]), 64), posed: true, clip: items.slotOf(slot).band }));
			items.postProcess(rA, items.slotOf(slot), group, { [d]: kfLayers.get(kfKey)! }, 0);
			for (const [i, g] of group.entries())
				cells.push({ src: run, item: `${item}.${stem.split('_').slice(0, 2).join('_')}`, slot, dir: d, key: g.key, posed: true, N: 64, base: g.base, layer: g.layer, kp: kpOf(kps[i], rA.cell, 0), keyLayer: kfLayers.get(kfKey), co: g });
		}
	}
// 4. round 3 tabard (c25c/S): dress s7/s11 and walk S/E/N s7, body A, production key for the prompt
{
	const prompt = 'a green and purple tabard over steel plate armor', key = chroma.pickKey(prompt), slot = 'torso_outer', dp = `${SPK}c25c/S/tabard`;
	for (const seed of [7, 11]) {
		const outs = await stored(`${dp}/dress_s${seed}`);
		if (!outs) continue;
		for (const [i, d] of DIRS.entries()) {
			const base = await restA(d), c: any = items.extractCell({ key: `rest/${d}/0`, call: 0, base, out: outs[i], route: key, band: items.bandOf(slot, skelA(rA.rest[d].keypoints), 64) });
			cells.push({ src: 'c25c', item: `tabard.s${seed}`, slot, dir: d, key: `rest/${d}/0`, posed: false, N: 64, base, layer: c.layer, kp: kpOf(rA.rest[d].keypoints, rA.cell, 0), keyLayer: c.layer });
			if (seed !== 7) continue;
			const w = await stored(`${dp}/walk_${d}`);
			if (!w) continue;
			const kps = items.clipKeypoints(rA, 'walk', d)!, group: any[] = [];
			for (let fi = 0; fi < 8; fi++) group.push(items.extractCell({ key: `walk/${d}/${fi}`, call: 1, base: await baseA(d, 'walk', fi), out: w[fi], route: key, band: items.bandOf(slot, skelA(kps[fi]), 64), posed: true, clip: false }));
			items.postProcess(rA, items.slotOf(slot), group, { [d]: c.layer }, 0);
			for (const [fi, g] of group.entries()) cells.push({ src: 'c25c', item: 'tabard.s7', slot, dir: d, key: g.key, posed: true, N: 64, base: g.base, layer: g.layer, kp: kpOf(kps[fi], rA.cell, 0), keyLayer: c.layer, co: g });
		}
	}
}
// 5. round 2 robe (c25b/E): concept-anchored edit (ea, frame 0 is the concept) and transfer-outfit (traw), rest S/E/N, body A
for (const v of ['ea', 'traw'])
	for (const seed of [7, 11]) {
		const outs = await stored(`${SPK}c25b/E/robe_${v}_s${seed}`);
		if (!outs) continue;
		const views = v === 'ea' ? outs.slice(1) : outs;
		for (const [i, d] of DIRS.entries()) {
			const base = await restA(d), c: any = items.extractCell({ key: `rest/${d}/0`, call: 0, base, out: views[i], route: 'green', band: items.bandOf('torso_outer', skelA(rA.rest[d].keypoints), 64) });
			cells.push({ src: 'c25b', item: `robe.${v}.s${seed}`, slot: 'torso_outer', dir: d, key: `rest/${d}/0`, posed: false, N: 64, base, layer: c.layer, kp: kpOf(rA.rest[d].keypoints, rA.cell, 0), keyLayer: c.layer });
		}
	}
// 6. test fixture helmet-occlusion (saved b14 Ranger helmet, slash frames)
{
	const J = JSON.parse(fs.readFileSync(ROOT + 'app/test/fixtures/helmet-occlusion.json', 'utf8'));
	const dec = (r: any): Img => {
		const im = { w: r.w, h: r.h, data: new Uint8ClampedArray(r.w * r.h * 4) };
		for (const [s, n, R, G, B, A] of r.runs) for (let p = s; p < s + n; p++) im.data.set([R, G, B, A], p * 4);
		return im;
	};
	for (const c of Object.values<any>(J.cells)) {
		const [a, d, i] = c.key.split('/');
		cells.push({ src: 'fixture', item: 'b14-helmet', slot: 'head', dir: d, key: c.key, posed: true, N: J.rig.cell.w, base: dec(c.base), layer: dec(c.layer), kp: kpOf(items.clipKeypoints(J.rig, a, d)?.[+i], J.rig.cell, 0) });
	}
}

// ---------- measure ----------
const rows: any[] = [];
const bySheet = new Map<string, Img[][]>();
const crop = (im: Img, cx: number, cy: number, r: number): Img => {
	const S = 2 * r + 1, o = { w: S, h: S, data: new Uint8ClampedArray(S * S * 4) };
	for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
		const X = cx - r + x, Y = cy - r + y;
		if (X < 0 || Y < 0 || X >= im.w || Y >= im.h) continue;
		o.data.set(im.data.subarray((Y * im.w + X) * 4, (Y * im.w + X) * 4 + 4), (y * S + x) * 4);
	}
	return o;
};
let noKp = 0;
const front: Img[][] = [], frontIx: string[] = [];
for (const c of cells) {
	if (!c.kp) { noKp++; continue; }
	const hand = handMask(c.base, c.kp, c.N), w = c.base.w;
	const cand: number[] = [];
	let handN = 0;
	for (let p = 0; p < hand.length; p++) if (hand[p]) { handN++; if (c.layer.data[p * 4 + 3]) cand.push(p); }
	const outsideKf = c.posed && c.keyLayer ? cand.filter((p) => !c.keyLayer!.data[p * 4 + 3]).length : 0;
	rows.push({ src: c.src, item: c.item, slot: c.slot, dir: c.dir, key: c.key, posed: c.posed, hand: handN, cand: cand.length, candOutsideKf: outsideKf });
	if (!cand.length) continue;
	const cx = Math.round(cand.reduce((s, p) => s + (p % w), 0) / cand.length), cy = Math.round(cand.reduce((s, p) => s + ((p / w) | 0), 0) / cand.length);
	const r = Math.max(8, Math.round(c.N / 6)), comp = items.recompose({ base: c.base, layer: c.layer });
	const hl = { w: comp.w, h: comp.h, data: comp.data.slice() }, hm = { w: comp.w, h: comp.h, data: c.base.data.slice() };
	for (let p = 0; p < hand.length; p++) if (hand[p]) hm.data.set([0, 200, 255, 255], p * 4);
	for (const p of cand) hl.data.set([255, 0, 255, 255], p * 4);
	const sk = `${c.src}__${c.item.replace(/[^a-z0-9_.-]/gi, '_')}`;
	if (!bySheet.has(sk)) bySheet.set(sk, []);
	const rowImgs = [crop(c.base, cx, cy, r), crop(hm, cx, cy, r), crop(c.layer, cx, cy, r), crop(comp, cx, cy, r), crop(hl, cx, cy, r)];
	bySheet.get(sk)!.push(rowImgs);
	if (!/north/.test(c.dir) && items.slotOf(c.slot).class !== 'held') { front.push(rowImgs); frontIx.push(`${front.length - 1} ${c.src} ${c.item} ${c.key} cand ${cand.length}`); }
	rows[rows.length - 1].sheet = `${sk}.png`;
	rows[rows.length - 1].row = bySheet.get(sk)!.length - 1;
}
for (const [k, rs] of bySheet) await save(path.join(OUTDIR, `${k}.png`), sheet(rs, 4));
for (let i = 0; i < front.length; i += 12) await save(path.join(OUTDIR, `front_${i / 12}.png`), sheet(front.slice(i, i + 12), 6));
fs.writeFileSync(path.join(OUTDIR, 'front-index.txt'), frontIx.join(String.fromCharCode(10)));
fs.writeFileSync(path.join(OUTDIR, 'rows.json'), JSON.stringify(rows, null, 0));
console.log(`cells ${cells.length}, no keypoints ${noKp}, measured ${rows.length}, with candidates ${rows.filter((r) => r.cand).length}, sheets ${bySheet.size}`);
const agg = new Map<string, any>();
for (const r of rows) {
	const k = `${r.src} ${r.item}`;
	const a = agg.get(k) ?? { slot: r.slot, cells: 0, hand: 0, cand: 0, candCells: 0, ok: 0, dirs: {} as Record<string, number> };
	a.cells++; a.hand += r.hand; a.cand += r.cand; if (r.cand) a.candCells++; if (r.hand) a.ok++;
	if (r.cand) a.dirs[r.dir + (r.posed ? '' : '*')] = (a.dirs[r.dir + (r.posed ? '' : '*')] ?? 0) + r.cand;
	agg.set(k, a);
}
for (const [k, a] of agg) console.log(`${k.padEnd(36)} ${a.slot.padEnd(12)} cells ${a.cells} withHand ${a.ok} handPx ${a.hand} cand ${a.cand} in ${a.candCells} ${JSON.stringify(a.dirs)}`);

// ---------- R2: arm-over-torso contrast in the keyed input, posed side and diagonal frames ----------
const r2: any[] = [];
let r2dbg = 0;
for (const c of cells) {
	if (!c.posed || !c.kp || !/east|west/.test(c.dir) || !c.co) continue;
	const kp = c.kp, b = c.base, w = b.w, h = b.h, N = c.N;
	if (!kp.NECK || !kp['LEFT HIP'] || !kp['RIGHT HIP']) continue;
	const hip: [number, number] = [(kp['LEFT HIP'][0] + kp['RIGHT HIP'][0]) / 2, (kp['LEFT HIP'][1] + kp['RIGHT HIP'][1]) / 2];
	const armW = Math.max(1.5, (1.6 * N) / 64), torsoW = (0.14 * N), arms: [[number, number], [number, number]][] = [];
	for (const sd of ['LEFT', 'RIGHT']) {
		if (kp[`${sd} SHOULDER`] && kp[`${sd} ELBOW`]) arms.push([kp[`${sd} SHOULDER`], kp[`${sd} ELBOW`]]);
		if (kp[`${sd} ELBOW`] && kp[`${sd} ARM`]) arms.push([kp[`${sd} ELBOW`], kp[`${sd} ARM`]]);
	}
	const role = new Uint8Array(w * h); // 1 arm (over the torso), 2 torso
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		const p = y * w + x;
		if (!b.data[p * 4 + 3]) continue;
		const cx = x + 0.5, cy = y + 0.5, dA = Math.min(...arms.map(([a, q]) => segDist(cx, cy, a, q))), dT = segDist(cx, cy, kp.NECK, hip);
		if (dT > torsoW) continue;
		role[p] = dA <= armW && dA < dT ? 1 : dA > armW ? 2 : 0;
	}
	let lo = 1, hi = 0;
	for (let i = 0; i < b.data.length; i += 4) if (b.data[i + 3]) { const l = lum(b.data, i); lo = Math.min(lo, l); hi = Math.max(hi, l); }
	const K = chroma.toChroma(b, 'green'), q5 = (i: number) => Math.round(4 * ((lum(b.data, i) - lo) / (hi - lo || 1)));
	const steps: number[] = [], fsteps: number[] = [];
	let merged = 0, fmerged = 0;
	for (let p = 0; p < role.length; p++) {
		if (role[p] !== 1) continue;
		const x = p % w, y = (p / w) | 0;
		for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const X = x + dx, Y = y + dy;
			if (X < 0 || Y < 0 || X >= w || Y >= h || role[Y * w + X] !== 2) continue;
			const j = (Y * w + X) * 4;
			const st = Math.abs(K.data[p * 4 + 1] - K.data[j + 1]);
			steps.push(st);
			if (q5(p * 4) === q5(j)) merged++;
			if (isSkin(b, p) && !isSkin(b, Y * w + X)) { fsteps.push(st); if (q5(p * 4) === q5(j)) fmerged++; }
		}
	}
	if (steps.length < 4) continue;
	steps.sort((a, z) => a - z);
	const co = c.co, g2 = items.g2Fails(co), g3 = (co.keyOutside ?? 0) > items.GATES.keyOutsidePosed;
	r2.push({ src: c.src, item: c.item, slot: c.slot, key: c.key, body: c.src === 'bench' ? c.item[0] : 'A', fn: fsteps.length, flow10: fsteps.filter((s) => s < 10).length, fmerged, n: steps.length, med: steps[steps.length >> 1], low10: steps.filter((s) => s < 10).length / steps.length, merged5: merged / steps.length, g2, g3, keyKept: co.keyKept, keyLost: co.keyLost });
}
fs.writeFileSync(path.join(OUTDIR, 'r2.json'), JSON.stringify(r2));
console.log('R2 frames', r2.length);
