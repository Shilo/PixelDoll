// Offline replay of the production item evaluation (run.ts evaluateItem order) on the frozen bench, with raw-output mutations.
// Every pixel decision and gate is production code; only the orchestration (which evaluateItem does from IndexedDB records) is here.
import { readFileSync } from 'node:fs';
const ROOT = 'file:///<REPO>/app/';
const L = ROOT + 'src/lib/';
const I = await import(L + 'items/items.ts');
const RUN = await import(L + 'items/run.ts');
const CH = await import(L + 'image/chroma.ts');
const GC = await import(L + 'items/garment-coverage.ts');
const DC = await import(L + 'items/design-consistency.ts');
const PO = await import(L + 'rig/poses.ts');
const PNG = await import(L + 'image/pngraw.ts');
const IMG = await import(L + 'image/png.ts');
export const FIX = new URL('test/fixtures/bench/', ROOT);
export { I, RUN, CH, DC, PO, PNG, IMG };

type Img = { w: number; h: number; data: Uint8ClampedArray };
export interface Case { id: string; body: string; slot: string; key: string; pad: number; clips: string[] }
export const cases: Case[] = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8'));
const cache = new Map<string, Img>();
export const load = async (name: string): Promise<Img> => {
	if (!cache.has(name)) cache.set(name, await PNG.decodePngBytes(new Uint8Array(readFileSync(new URL(name, FIX)))));
	return cache.get(name)!;
};
export const cell = (sheet: Img, C: number, row: number, col: number): Img => {
	const o = IMG.makeImg(C, C);
	for (let y = 0; y < C; y++)
		o.data.set(sheet.data.subarray(((row * C + y) * sheet.w + col * C) * 4, ((row * C + y) * sheet.w + col * C + C) * 4), y * C * 4);
	return o;
};
export const PROMPT: Record<string, string> = {
	'a-helmet': 'a knight helmet', 'a-cape': 'a red cape', 'a-chest': 'chest armor', 'a-boots': 'leather boots', 'a-hair': 'long hair',
	'a-sword96': 'a sword', 'a-axe96': 'an axe', 'a-bow96': 'a bow', 'b-tunic': 'a tunic', 'b-cloak': 'a cloak', 'b-greathelm': 'a great helm',
	'b-jester': 'a jester hat', 'b-jester-blue': 'a jester hat', 'n-cloak128': 'a cloak', 'c-greathelm': 'a great helm'
};

/** mutate(raw, base, key, dir) may return a replacement raw output for that cell. */
export type Mutate = (raw: Img, base: Img, key: string, dir: string) => Img | undefined;
export interface Eval {
	g1: string[]; fails: string[]; warnings: string[]; status: string; clean: boolean;
	keys: Record<string, Img>; bodies: Record<string, Img>; rest: Record<string, any>; kf: any[]; cells: any[];
}
export async function evaluate(c: Case, mutate?: Mutate, prompt = PROMPT[c.id] ?? c.id): Promise<Eval> {
	const b = JSON.parse(readFileSync(new URL(`body${c.body}.json`, FIX), 'utf8'));
	const rig = structuredClone(b.rig), N = rig.cell.w, C = N + 2 * c.pad, slot = I.slotOf(c.slot), held = slot.class === 'held';
	const bodySheet = await load(`body${c.body}.png`), sheet = await load(`${c.id}.png`), route = c.key;
	const baseRaw = (dir: string, col: string) => cell(bodySheet, N, b.rows.indexOf(dir), b.cols.indexOf(col));
	const base = (dir: string, col: string) => I.padImg(baseRaw(dir, col), c.pad);
	const dirs: string[] = [...new Set(c.clips.map((k) => k.split('/')[1]))];
	const kfRow = (d: string) => c.clips.findIndex((k) => k.endsWith(`/${d}`));
	const skel = (k: any) => k && PO.fromApi(k, rig.cell);
	// the Default move every created character has: one imported-rest cell per direction, posed by the rest keypoints
	rig.animations.push({ id: 'default', cells: 1, loop: false, frames: [{ cell: 0, ms: 100 }],
		sources: Object.fromEntries(dirs.map((d) => [d, { route: 'v3', keypoints: [rig.rest[d].keypoints], measured: [rig.rest[d].keypoints], motion: 'imported-rest' }])) });
	const raw = (row: number, col: number, bse: Img, key: string, d: string) => { const o = cell(sheet, C, row, col); return mutate?.(o, bse, key, d) ?? o; };
	// 1. dress outputs -> keyframe cells (restView extraction, own cut)
	const keys: Record<string, Img> = {}, keyCut: Record<string, Uint8Array | undefined> = {}, kf: any[] = [], dressOuts: any[] = [], bodies: Record<string, Img> = {};
	for (const d of dirs) {
		const s0 = skel(rig.rest[d].keypoints), maxY = I.cutRows(c.slot, s0, N), bse = base(d, 'rest'), out = raw(kfRow(d), 0, bse, `rest/${d}/0`, d);
		const k = I.extractCell({ key: `rest/${d}/0`, call: 0, base: bse, out, route, band: I.bandOf(c.slot, c.pad ? undefined : s0, C), ...(maxY != null ? { cut: { maxY } } : {}) });
		keys[d] = k.layer; keyCut[d] = k.cut; kf.push(k); dressOuts.push({ k: 0, key: `rest/${d}/0`, out }); bodies[d] = baseRaw(d, 'rest');
	}
	const g1 = new Map<number, string>();
	const hidden = I.hiddenViews(kf, keys, c.slot), hiddenWarnings: string[] = [];
	const smudged = I.smudgedViews(c.slot, prompt, kf.map((x: any) => x.layer));
	for (const [i, x] of kf.entries()) {
		const o = dressOuts[i], d = o.key.split('/')[1];
		if (!x.area && hidden.has(d)) hiddenWarnings.push(`G4 keyframe ${o.key}: no item in this view; check that the view hides it`);
		const bad = [
			I.g2Fails(x) && `G2 keyframe ${o.key} key kept ${x.keyKept.toFixed(3)} (${x.keyLost} px)`,
			x.keyOutside != null && x.keyOutside > I.GATES.keyOutside && `G3 keyframe ${o.key} key outside ${x.keyOutside.toFixed(3)}`,
			!x.area && !hidden.has(d) && `G4 keyframe ${o.key}: item missing`,
			smudged[i] === 'smudge' && `D1 keyframe ${o.key}: ${(I.grayShare(x.layer) * 100).toFixed(0)} % gray smudges in a colorful design`
		].filter(Boolean);
		if (smudged[i] === 'dark') hiddenWarnings.push(`D1 keyframe ${o.key}: a dark patch not seen in the other views, possibly not part of the design`);
		if (bad.length) g1.set(o.k, [g1.get(o.k), ...bad].filter(Boolean).join('; '));
	}
	RUN.measuredKeyCollision(prompt, route, kf, dressOuts, g1);
	// D2: standingViews only for worn, no bgZ, unpadded slots
	if (slot.class === 'worn' && slot.bgZ == null && !c.pad) {
		const views: any = {};
		for (const [i, d] of dirs.entries()) {
			const pose = skel(rig.rest[d].keypoints), body = base(d, 'rest');
			views[d] = { body, pose, layer: CH.chromaLayer(dressOuts[i].out, route, body).layer };
		}
		const issue = DC.designConsistency(prompt, views);
		if (issue) for (const d of issue.missingDirections) g1.set(0, [g1.get(0), `D2 keyframe ${d}: waist band missing`].filter(Boolean).join('; '));
	}
	// 2. item cells: Default cells from the dress call (call 0), then one pose call per clip row
	const cells: any[] = [];
	const posedCell = (key: string, call: number, out: Img, bse: Img, s1: any) => {
		const d = key.split('/')[1], maxY = I.cutRows(c.slot, s1, N), allow = maxY != null ? I.cutAllow(rig, key, keyCut[d], N, I.posedTol(N, N)) : undefined;
		return I.extractCell({ key, call, base: bse, out, route, band: I.bandOf(c.slot, c.pad ? undefined : s1, C), posed: true, clip: slot.band, held, pad: c.pad, ...(allow ? { cut: { maxY: maxY!, allow } } : {}) });
	};
	for (const [i, d] of dirs.entries()) cells.push(posedCell(`default/${d}/0`, 0, dressOuts[i].out, base(d, 'rest'), skel(rig.rest[d].keypoints)));
	c.clips.forEach((clip, r) => {
		const [anim, dir] = clip.split('/'), a = rig.animations.find((x: any) => x.id === anim);
		for (let i = 0; i < a.cells; i++) {
			const bse = base(dir, `${anim}/${i}`);
			cells.push(posedCell(`${clip}/${i}`, 1 + r, raw(r, 1 + i, bse, `${clip}/${i}`, dir), bse, skel(a.sources?.[dir]?.keypoints?.[i])));
		}
	});
	I.postProcess(rig, slot, cells, keys, c.pad);
	const images = new Map<string, Img>();
	for (const d of dirs) { rig.rest[d].image = `sha256:${d}`; images.set(`sha256:${d}`, baseRaw(d, 'rest')); }
	for (const d of Object.keys(rig.rest)) if (!dirs.includes(d)) delete rig.rest[d];
	const q = RUN.withH4(I.itemQa(rig, slot, route, cells, 0, I.GATES.keyOutsidePosed, c.pad, hidden), slot, cells, keys, rig, GC.referenceBodies(rig, images), prompt);
	if (hiddenWarnings.length) { q.warnings.push(...hiddenWarnings); if (q.qa.status === 'pass') q.qa.status = 'warn'; }
	const fails = [...q.failCalls.values()].flat();
	const g1s = [...g1.values()].flatMap((s) => s.split('; '));
	return { g1: g1s, fails, warnings: q.warnings, status: q.qa.status, clean: q.qa.status === 'pass' && !g1s.length && !fails.length && !q.warnings.length,
		keys, bodies, rest: Object.fromEntries(dirs.map((d) => [d, skel(rig.rest[d].keypoints)])), kf, cells };
}
