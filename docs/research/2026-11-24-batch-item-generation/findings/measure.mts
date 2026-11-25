// Offline measurement for batch item generation (2026-11-24). No paid calls.
// Reads the accepted S2 fixture layers (app/public/fixtures/s2): one PNG sheet per item, 64 px cells,
// 3 generated direction rows (south, east, north) by 8 (walk) or 6 (cross-punch) frame columns.
// Reports, per slot pair: how many item pixels coincide (legit occlusion), whether a union of two items
// could be split back by nearest palette or by connected component, and how many item pixels would be
// lost by each chroma key (the app's own keyScore / keyFor).
//
//   node --experimental-transform-types --no-warnings measure.mts
import { readFileSync } from 'node:fs';
import { decodePngBytes } from '../../../../app/src/lib/image/pngraw.ts';
import { keyScore, KEYS, KT, NEAR_KEY } from '../../../../app/src/lib/image/chroma.ts';
import type { Img } from '../../../../app/src/lib/image/png.ts';

const ROOT = new URL('../../../../app/public/fixtures/s2/', import.meta.url);
const CELL = 64;
const ROWS = ['south', 'east', 'north'] as const;
type Dir = (typeof ROWS)[number];

type ItemRec = { id: string; slot: string; z: number; files: { anim: string; path: string }[] };

const fixture = JSON.parse(readFileSync(new URL('fixture.json', ROOT), 'utf8')) as {
	slots: { id: string; z: number; bgZ?: number; class: string }[];
	items: {
		id: string;
		slot: string;
		layers: { role: string; z: number; sheets?: Record<string, string> }[];
	}[];
};

const slotZ = (id: string) => fixture.slots.find((s) => s.id === id)?.z ?? 0;
const items: ItemRec[] = fixture.items
	.filter((i) => i.slot !== 'body')
	.flatMap((i) => {
		const files = i.layers.flatMap((l) =>
			Object.entries(l.sheets ?? {}).map(([anim, path]) => ({ anim, path }))
		);
		return files.length ? [{ id: i.id, slot: i.slot, z: slotZ(i.slot), files }] : [];
	});
const bodyFiles = fixture.items
	.find((i) => i.slot === 'body')!
	.layers.flatMap((l) => Object.entries(l.sheets ?? {}));

/** One decoded sheet, cut into 64 px cells keyed "<anim>/<dir>/<frame>". */
async function readSheet(path: string) {
	const im: Img = await decodePngBytes(readFileSync(new URL(path, ROOT)));
	const cols = im.w / CELL,
		rows = Math.min(im.h / CELL, ROWS.length),
		out = new Map<string, { mask: Uint8Array; color: Uint32Array }>();
	for (let r = 0; r < rows; r++)
		for (let c = 0; c < cols; c++) {
			const mask = new Uint8Array(CELL * CELL),
				color = new Uint32Array(CELL * CELL);
			for (let y = 0; y < CELL; y++)
				for (let x = 0; x < CELL; x++) {
					const p = ((r * CELL + y) * im.w + c * CELL + x) * 4;
					if (im.data[p + 3] < 128) continue;
					const i = y * CELL + x;
					mask[i] = 1;
					color[i] = (im.data[p] << 16) | (im.data[p + 1] << 8) | im.data[p + 2];
				}
			out.set(`${path.split('/').at(-1)!.replace('.png', '')}/${ROWS[r]}/${c}`, { mask, color });
		}
	return out;
}

type Loaded = ItemRec & {
	cells: Map<string, { mask: Uint8Array; color: Uint32Array }>;
	palettes: Map<string, number[]>;
};
const loaded: Loaded[] = await Promise.all(
	items.map(async (it) => {
		const cells = new Map<string, { mask: Uint8Array; color: Uint32Array }>();
		for (const f of it.files) for (const [k, v] of await readSheet(f.path)) cells.set(k, v);
		const palettes = new Map<string, number[]>();
		for (const [k, v] of cells) {
			const view = k.split('/').slice(0, 2).join('/'),
				set = new Set(palettes.get(view) ?? []);
			for (let p = 0; p < v.mask.length; p++) if (v.mask[p]) set.add(v.color[p]);
			palettes.set(view, [...set]);
		}
		return { ...it, cells, palettes };
	})
);

const bodyCells = new Map<string, Uint8Array>();
for (const [anim, path] of bodyFiles)
	for (const [k, v] of await readSheet(path)) bodyCells.set(`${anim}/${k.split('/')[1]}/${k.split('/')[2]}`, v.mask);

console.log('item, slot, z, frames, paletteColors(walk/south)');
for (const it of loaded)
	console.log(`${it.id}, ${it.slot}, ${it.z}, ${it.cells.size}, ${it.palettes.get('walk/south')?.length ?? 0}`);
console.log(`body cells: ${bodyCells.size}`);

const cheb = (a: number, b: number) =>
	Math.max(
		Math.abs((a >> 16) - (b >> 16)),
		Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)),
		Math.abs((a & 255) - (b & 255))
	);
const sharedKeys = (a: Loaded, b: Loaded) => [...a.cells.keys()].filter((k) => b.cells.has(k)).sort();

console.log('\n=== A. item/item coincidence on accepted layers (legit occlusion of the lower-z item) ===');
console.log('pair, lower, frames, overlapPxMean, overlapPxMax, shareOfLowerMean, shareOfLowerMax');
type PairRow = {
	a: Loaded;
	b: Loaded;
	lower: string;
	n: number;
	overlap: number;
	mean: number;
	max: number;
	shareMean: number;
	shareMax: number;
};
const pairRows: PairRow[] = [];
for (let i = 0; i < loaded.length; i++)
	for (let j = i + 1; j < loaded.length; j++) {
		const a = loaded[i],
			b = loaded[j],
			keys = sharedKeys(a, b);
		if (!keys.length) continue;
		const lower = a.z <= b.z ? a : b;
		let n = 0,
			overlap = 0,
			sum = 0,
			max = 0,
			shareSum = 0,
			shareMax = 0;
		for (const k of keys) {
			const ma = a.cells.get(k)!.mask,
				mb = b.cells.get(k)!.mask;
			let o = 0,
				la = 0,
				lb = 0;
			for (let p = 0; p < ma.length; p++) {
				la += ma[p];
				lb += mb[p];
				if (ma[p] && mb[p]) o++;
			}
			const low = lower === a ? la : lb;
			if (!low) continue;
			n++;
			overlap += o;
			sum += o;
			max = Math.max(max, o);
			shareSum += o / low;
			shareMax = Math.max(shareMax, o / low);
		}
		if (!n) continue;
		pairRows.push({
			a,
			b,
			lower: lower.id,
			n,
			overlap,
			mean: +(sum / n).toFixed(1),
			max,
			shareMean: +(shareSum / n).toFixed(3),
			shareMax: +shareMax.toFixed(3)
		});
	}
for (const r of pairRows)
	console.log(
		`${r.a.id}+${r.b.id}, ${r.lower}, ${r.n}, ${r.mean}, ${r.max}, ${r.shareMean}, ${r.shareMax}`
	);

console.log('\n=== B. body pixels hidden by each item (legit body occlusion) ===');
console.log('item, frames, itemPxMean, itemPxOnBodyMean, shareOfItemOnBody, bodyPxMean, shareOfBodyCovered');
for (const it of loaded) {
	let n = 0,
		area = 0,
		onBody = 0,
		bodyPx = 0;
	for (const [k, v] of it.cells) {
		const b = bodyCells.get(k);
		if (!b) continue;
		n++;
		for (let p = 0; p < v.mask.length; p++) {
			area += v.mask[p];
			if (v.mask[p] && b[p]) onBody++;
			if (b[p]) bodyPx++;
		}
	}
	console.log(
		`${it.id}, ${n}, ${(area / n).toFixed(1)}, ${(onBody / n).toFixed(1)}, ${(onBody / area).toFixed(3)}, ${(bodyPx / n).toFixed(1)}, ${(onBody / bodyPx).toFixed(4)}`
	);
}

console.log('\n=== C. could a union of the two items be split by nearest item palette? ===');
console.log(
	'pair, exclusivePx, exclusiveRight, exclusiveAcc, overlapPx, overlapToUpper, tieShare, sharedColorsSouth, palA, palB'
);
for (const r of pairRows) {
	let ex = 0,
		right = 0,
		ov = 0,
		ovUpper = 0,
		ties = 0,
		shared = 0;
	for (const k of sharedKeys(r.a, r.b)) {
		const A = r.a.cells.get(k)!,
			B = r.b.cells.get(k)!;
		let any = 0;
		for (let p = 0; p < A.mask.length; p++) any |= A.mask[p] | B.mask[p];
		if (!any) continue;
		const view = k.split('/').slice(0, 2).join('/'),
			pa = r.a.palettes.get(view) ?? [],
			pb = r.b.palettes.get(view) ?? [],
			sb = new Set(pb);
		for (const c of pa) if (sb.has(c)) shared++;
		for (let p = 0; p < A.mask.length; p++) {
			if (!A.mask[p] && !B.mask[p]) continue;
			const upperA = r.a.z >= r.b.z,
				c =
					A.mask[p] && B.mask[p]
						? upperA
							? A.color[p]
							: B.color[p]
						: A.mask[p]
							? A.color[p]
							: B.color[p],
				da = Math.min(...pa.map((x) => cheb(c, x))),
				db = Math.min(...pb.map((x) => cheb(c, x)));
			if (da === db) ties++;
			const pickA = da <= db;
			if (A.mask[p] !== B.mask[p]) {
				ex++;
				if (!!A.mask[p] === pickA) right++;
			} else {
				ov++;
				// The accepted composite shows the higher-z item's pixel; its color should match that item.
				if (pickA === upperA && da !== db) ovUpper++;
			}
		}
	}
	console.log(
		`${r.a.id}+${r.b.id}, ${ex}, ${right}, ${(right / ex).toFixed(3)}, ${ov}, ${ov ? (ovUpper / ov).toFixed(3) : 'n/a'}, ${(ties / (ex + ov)).toFixed(3)}, ${shared}, ${r.a.palettes.get('walk/south')?.length ?? 0}, ${r.b.palettes.get('walk/south')?.length ?? 0}`
	);
}

console.log('\n=== D. chroma key loss on each accepted item layer (px scoring as key would be removed) ===');
console.log('item, key, lostPx, lostShare, nearKeyShare, itemPx');
for (const it of loaded) {
	for (const key of KEYS) {
		let item = 0,
			lost = 0,
			near = 0;
		for (const v of it.cells.values())
			for (let p = 0; p < v.mask.length; p++) {
				if (!v.mask[p]) continue;
				item++;
				const rgb = v.color[p],
					r = rgb >> 16,
					g = (rgb >> 8) & 255,
					b = rgb & 255,
					s = keyScore(key, r, g, b);
				if (s >= KT) lost++;
				else if (s >= NEAR_KEY && Math.max(r, g, b) >= 64) near++;
			}
		console.log(
			`${it.id}, ${key}, ${lost}, ${(lost / item).toFixed(4)}, ${(near / item).toFixed(4)}, ${item}`
		);
	}
}

console.log('\n=== E. single-key feasibility for a pair on one mannequin ===');
console.log('pair, key, lostA, lostB, ok');
function lostByKey(it: Loaded, key: (typeof KEYS)[number]) {
	let lost = 0;
	for (const v of it.cells.values())
		for (let p = 0; p < v.mask.length; p++) {
			if (!v.mask[p]) continue;
			const rgb = v.color[p];
			if (keyScore(key, rgb >> 16, (rgb >> 8) & 255, rgb & 255) >= KT) lost++;
		}
	return lost;
}
for (const r of pairRows) {
	for (const key of KEYS) {
		const la = lostByKey(r.a, key),
			lb = lostByKey(r.b, key);
		console.log(`${r.a.id}+${r.b.id}, ${key}, ${la}, ${lb}, ${la + lb === 0}`);
	}
}

console.log('\n=== F. union connectivity (would a component rule merge the two items?) ===');
console.log('pair, frames, unionComponentsMean, framesWithOneComponent, maxComponents');
for (const r of pairRows) {
	let n = 0,
		sum = 0,
		one = 0,
		max = 0;
	for (const k of sharedKeys(r.a, r.b)) {
		const A = r.a.cells.get(k)!.mask,
			B = r.b.cells.get(k)!.mask,
			u = new Uint8Array(A.length);
		let any = 0;
		for (let p = 0; p < u.length; p++) {
			u[p] = A[p] | B[p];
			any |= u[p];
		}
		if (!any) continue;
		const count = components(u, CELL, CELL);
		n++;
		sum += count;
		if (count === 1) one++;
		max = Math.max(max, count);
	}
	console.log(`${r.a.id}+${r.b.id}, ${n}, ${(sum / n).toFixed(2)}, ${one}, ${max}`);
}
function components(m: Uint8Array, w: number, h: number) {
	const seen = new Uint8Array(m.length);
	let count = 0;
	for (let s = 0; s < m.length; s++) {
		if (!m[s] || seen[s]) continue;
		count++;
		const st = [s];
		seen[s] = 1;
		while (st.length) {
			const p = st.pop()!,
				x = p % w,
				y = (p / w) | 0;
			for (let dy = -1; dy <= 1; dy++)
				for (let dx = -1; dx <= 1; dx++) {
					const X = x + dx,
						Y = y + dy;
					if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
					const q = Y * w + X;
					if (m[q] && !seen[q]) {
						seen[q] = 1;
						st.push(q);
					}
				}
		}
	}
	return count;
}
console.log('\n=== G. how far apart are the two palettes? (misassignment margin on exclusive pixels) ===');
console.log('pair, minPaletteDist, exclusivePx, margin<=8, margin<=16, margin<=24');
for (const r of pairRows) {
	let minD = Infinity,
		ex = 0,
		m8 = 0,
		m16 = 0,
		m24 = 0;
	const checkPal = (pa: number[], pb: number[]) => {
		for (const a of pa) for (const b of pb) minD = Math.min(minD, cheb(a, b));
	};
	for (const k of sharedKeys(r.a, r.b)) {
		const A = r.a.cells.get(k)!,
			B = r.b.cells.get(k)!;
		let any = 0;
		for (let p = 0; p < A.mask.length; p++) any |= A.mask[p] | B.mask[p];
		if (!any) continue;
		const view = k.split('/').slice(0, 2).join('/'),
			pa = r.a.palettes.get(view) ?? [],
			pb = r.b.palettes.get(view) ?? [];
		checkPal(pa, pb);
		for (let p = 0; p < A.mask.length; p++) {
			if (A.mask[p] === B.mask[p]) continue;
			ex++;
			const c = A.mask[p] ? A.color[p] : B.color[p],
				own = A.mask[p] ? pa : pb,
				other = A.mask[p] ? pb : pa,
				do_ = Math.min(...own.map((x) => cheb(c, x))),
				dt = Math.min(...other.map((x) => cheb(c, x))),
				margin = dt - do_;
			if (margin <= 8) m8++;
			if (margin <= 16) m16++;
			if (margin <= 24) m24++;
		}
	}
	console.log(
		`${r.a.id}+${r.b.id}, ${minD}, ${ex}, ${(m8 / ex).toFixed(3)}, ${(m16 / ex).toFixed(3)}, ${(m24 / ex).toFixed(3)}`
	);
}

console.log('\n=== H. item/item boundary length (pixels where a wrong overlap order is visible) ===');
console.log('pair, frames, boundaryPxMean, boundaryPxMax, overlapPxMean');
for (const r of pairRows) {
	let n = 0,
		sum = 0,
		max = 0,
		ov = 0;
	for (const k of sharedKeys(r.a, r.b)) {
		const A = r.a.cells.get(k)!.mask,
			B = r.b.cells.get(k)!.mask;
		let any = 0;
		for (let p = 0; p < A.length; p++) any |= A[p] | B[p];
		if (!any) continue;
		n++;
		let boundary = 0,
			o = 0;
		for (let p = 0; p < A.length; p++) {
			if (A[p] && B[p]) o++;
			if (!A[p] && !B[p]) continue;
			const x = p % CELL,
				y = (p / CELL) | 0;
			let touches = false;
			for (let dy = -1; dy <= 1 && !touches; dy++)
				for (let dx = -1; dx <= 1; dx++) {
					const X = x + dx,
						Y = y + dy;
					if (X < 0 || Y < 0 || X >= CELL || Y >= CELL) continue;
					const q = Y * CELL + X;
					if (A[q] !== B[q]) {
						touches = true;
						break;
					}
				}
			if (touches) boundary++;
		}
		sum += boundary;
		max = Math.max(max, boundary);
		ov += o;
	}
	console.log(
		`${r.a.id}+${r.b.id}, ${n}, ${(sum / n).toFixed(1)}, ${max}, ${(ov / n).toFixed(1)}`
	);
}

console.log('\n=== I. body pixels claimed by 0, 1 or 2+ items in a frame (legit stacking depth) ===');
console.log('set, frames, bodyPx, bare, one, twoPlus, twoPlusShare');
const sets: string[][] = [
	['hair_brown', 'helmet_steel'],
	['vest_leather', 'cape_red'],
	['vest_leather', 'hair_brown', 'cape_red'],
	['helmet_steel', 'vest_leather', 'cape_red'],
	['vest_leather', 'cape_red', 'hair_brown', 'helmet_steel', 'sword_steel']
];
for (const ids of sets) {
	const chosen = loaded.filter((i) => ids.includes(i.id));
	let n = 0,
		body = 0,
		bare = 0,
		one = 0,
		multi = 0;
	for (const [k, b] of bodyCells) {
		if (!chosen.every((i) => i.cells.has(k))) continue;
		n++;
		for (let p = 0; p < b.length; p++) {
			if (!b[p]) continue;
			body++;
			const cover = chosen.reduce((c, i) => c + (i.cells.get(k)!.mask[p] ? 1 : 0), 0);
			if (!cover) bare++;
			else if (cover === 1) one++;
			else multi++;
		}
	}
	console.log(
		`${ids.join('+')}, ${n}, ${body}, ${(bare / n).toFixed(1)}, ${(one / n).toFixed(1)}, ${(multi / n).toFixed(1)}, ${(multi / body).toFixed(3)}`
	);
}

