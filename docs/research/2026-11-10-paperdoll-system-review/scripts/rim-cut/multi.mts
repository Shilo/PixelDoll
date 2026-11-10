// P5: several worn items cutting at once, through production composeCell and the export bake (withTuckVariants).
import { readFileSync } from 'node:fs';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { runCase } = await import(APP + 'scripts/bench.ts');
const { SLOTS } = await import(APP + 'src/lib/items/items.ts');
const { composeCell, withTuckVariants, bodyCutVariantCount, MAX_BODY_CUT_VARIANTS } = await import(APP + 'src/lib/compose/compose.ts');
const { rimCut, union } = await import('./rimcut.mts');
const FIX = new URL('test/fixtures/bench/', APP);
const cases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8'));
const body = JSON.parse(readFileSync(new URL('bodyA.json', FIX), 'utf8'));
const rig = body.rig, ids = ['a-chest', 'a-boots', 'a-cape'];
const images = new Map<string, any>(), items: any[] = [], cuts: Record<string, Record<string, number[]>> = {};
const baseCells: any = {};
for (const id of ids) {
	const c = cases.find((x: any) => x.id === id), r = await runCase(c);
	const cells: any = {}, baseCut: any = {};
	cuts[id] = {};
	for (const cell of r.cells) {
		const [a, d, i] = cell.key.split('/');
		if (a === 'rest') continue;
		const n = rig.animations.find((x: any) => x.id === a).cells;
		const h = `sha256:${id}/${cell.key}`, bh = `sha256:base/${a}/${d}/${i}`;
		images.set(h, cell.layer); images.set(bh, cell.base);
		((cells[a] ??= {})[d] ??= Array(n).fill(null))[+i] = h;
		((baseCells[a] ??= {})[d] ??= Array(n).fill(null))[+i] = bh;
		const u = union(cell.cut, rimCut(cell, c.slot));
		const idx = u ? [...u.keys()].filter((p) => u[p]) : [];
		if (idx.length) ((baseCut[a] ??= {})[d] ??= Array(n).fill(null))[+i] = idx;
		cuts[id][cell.key] = idx;
	}
	items.push({ id, name: id, slot: c.slot, baseHash: rig.baseHash, layers: [{ id: 'main', role: 'fg', z: SLOTS.find((s: any) => s.id === c.slot).z, cells }], ...(Object.keys(baseCut).length ? { baseCut } : {}) });
}
items.unshift({ id: rig.baseItem, name: 'base', slot: 'body', baseHash: rig.baseHash, layers: [{ id: 'main', role: 'fg', z: 10, cells: baseCells }] });
const p: any = { manifest: { rig, slots: SLOTS, items }, images };
const all = { torso_outer: 'a-chest', feet: 'a-boots', back: 'a-cape' };
const keys = Object.keys(cuts['a-chest']);
const eq = (a: any, b: any) => a.data.every((v: number, i: number) => v === b.data[i]);
const alpha = (im: any, q: number) => im.data[q * 4 + 3];
let overlap = 0, unionPx = 0, restoreFail = 0, hiddenFail = 0, bakeFail = 0, interior = 0, frames = 0;
const ex = await withTuckVariants(p);
for (const k of keys) {
	const [a, d, i] = k.split('/');
	frames++;
	const full = composeCell(p, all, a, d, +i);
	const sets = ids.map((id) => new Set(cuts[id][k]));
	for (const s of sets) for (const q of s) if (sets.filter((t) => t.has(q)).length > 1) overlap++;
	const U = new Set(ids.flatMap((id) => cuts[id][k])); unionPx += U.size;
	// every cut px is hidden unless some worn item draws there
	const base = images.get(`sha256:base/${k}`);
	for (const q of U) { const drawn = ids.some((id) => alpha(images.get(`sha256:${id}/${k}`), q)); if (!drawn && alpha(full, q)) hiddenFail++; }
	// removing each item restores exactly its px: compare with the same preset where that item has no cut at all
	for (const [slot, id] of Object.entries(all)) {
		const rest: any = { ...all }; delete rest[slot];
		const off = composeCell(p, rest, a, d, +i);
		const others = new Set(ids.filter((x) => x !== id).flatMap((x) => cuts[x][k]));
		for (const q of cuts[id][k]) if (!others.has(q) && alpha(base, q) && !ids.filter((x) => x !== id).some((x) => alpha(images.get(`sha256:${x}/${k}`), q)) && alpha(off, q) !== alpha(base, q)) restoreFail++;
	}
	if (!eq(composeCell(ex, all, a, d, +i), full)) bakeFail++;
	// union never exposes body interior: no cut px (still transparent) 4-borders a visible light base px that is not on the silhouette
	const w = full.w, V = (q: number) => alpha(full, q) > 0;
	for (const q of U) {
		if (V(q)) continue;
		for (const n of [q - 1, q + 1, q - w, q + w]) if (V(n) && alpha(base, n) && !ids.some((x) => alpha(images.get(`sha256:${x}/${k}`), n))) {
			const nb = [n - 1, n + 1, n - w, n + w].filter((m) => m !== q);
			if (nb.every((m) => V(m))) interior++;
		}
	}
}
const variants = ex.manifest.items.filter((it: any) => it.variantOf === rig.baseItem).map((it: any) => it.id);
console.log({ frames, unionPx, overlapPx: overlap, hiddenFail, restoreFail, bakeFail, interiorExposed: interior, bodyVariants: variants });
// export growth if every worn item cuts: (n+1) per slot, minus 1
const grow = (per: number[]) => per.reduce((a, n) => a * (n + 1), 1) - 1;
console.log('variant count today vs with rim cut, examples (limit', MAX_BODY_CUT_VARIANTS, '):', { '3 tops, 3 boots, 3 capes, 0 cutting today': [0, grow([3, 3, 3])], '5 tops, 5 boots, 4 capes, 2 legs': [0, grow([5, 5, 4, 2])], '6/6/5': [0, grow([6, 6, 5])] }, 'this manifest:', bodyCutVariantCount(p.manifest));
