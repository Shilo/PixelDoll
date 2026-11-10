// Replays a frozen-bench case through the REAL evaluateItem (run.ts) with stubbed queue/db, then isClean.
import { readFileSync } from 'node:fs';
import { cases, evaluate, load, cell, I, RUN, CH, PNG, PO } from '../gates/pipe.ts';
const L = 'file:///<REPO>/app/src/lib/';
const RIG = await import(L + 'rig/rig.ts');
const RT = await import(L + 'pixellab/routes.ts');
const FIX = new URL('file:///<REPO>/app/test/fixtures/bench/');
type Img = { w: number; h: number; data: Uint8ClampedArray };
const G = globalThis as any;
let seq = 0;
const PROMPT: Record<string, string> = { 'b-tunic': 'a tunic', 'a-chest': 'chest armor', 'b-cloak': 'a cloak', 'a-cape': 'a red cape', 'a-hair': 'long hair', 'a-helmet': 'a knight helmet' };
export async function realEval(id: string, mutate?: (raw: Img, base: Img, key: string, dir: string) => Img | undefined, log = false) {
	const c = cases.find((x) => x.id === id)!, b = JSON.parse(readFileSync(new URL(`body${c.body}.json`, FIX), 'utf8'));
	const rig = structuredClone(b.rig), N = rig.cell.w, C = N + 2 * c.pad;
	const bodySheet = await load(`body${c.body}.png`), sheet = await load(`${c.id}.png`);
	const dirs: string[] = [...new Set(c.clips.map((k: string) => k.split('/')[1]))];
	const images = new Map<string, Img>(), cellsMap: any = {}, skeletons: any = {};
	const baseRaw = (dir: string, col: string) => cell(bodySheet, N, b.rows.indexOf(dir), b.cols.indexOf(col));
	for (const d of Object.keys(rig.rest)) { if (!b.rows.includes(d)) { delete rig.rest[d]; continue; } const im = baseRaw(d, 'rest'), h = await RIG.cellHash(im); images.set(h, im); rig.rest[d].image = h; }
	rig.animations.unshift({ id: 'default', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }],
		sources: Object.fromEntries(dirs.map((d) => [d, { route: 'v3', reference: rig.rest[d].image, keypoints: [rig.rest[d].keypoints], measured: [rig.rest[d].keypoints], motion: 'imported-rest', provenance: [] }])) });
	for (const a of rig.animations) {
		cellsMap[a.id] = {};
		for (const d of dirs) { cellsMap[a.id][d] = []; for (let i = 0; i < a.cells; i++) {
			const im = a.id === 'default' ? baseRaw(d, 'rest') : baseRaw(d, `${a.id}/${i}`), h = await RIG.cellHash(im);
			images.set(h, im); cellsMap[a.id][d][i] = h;
			const kp = a.id === 'default' ? rig.rest[d].keypoints : a.sources?.[d]?.keypoints?.[i];
			if (kp) skeletons[`${a.id}/${d}/${i}`] = PO.fromApi(kp, rig.cell);
		} }
	}
	const manifest: any = { format: 'pixeldoll/1', app: 'test', name: 'bench', rig, materials: [], slots: [I.slotOf('body')], presets: [],
		items: [{ id: rig.baseItem ?? 'base', name: 'Body', slot: 'body', status: 'accepted', mirror: 'generate', materials: [], prompt: '', baseHash: rig.baseHash, provenance: [], layers: [{ id: 'main', role: 'fg', z: 10, cells: cellsMap }] }] };
	rig.baseItem = manifest.items[0].id;
	const ctx: any = { rec: { id: 'rig', savedAt: '', manifest, skeletons }, project: { manifest, images } };
	const clipDirs = Object.fromEntries(rig.animations.map((a: any) => [a.id, a.id === 'default' ? dirs : c.clips.filter((k: string) => k.startsWith(a.id + '/')).map((k: string) => k.split('/')[1])]));
	const spec: any = { name: id, prompt: PROMPT[id] ?? id, slot: c.slot, key: c.key, anims: rig.animations.filter((a: any) => clipDirs[a.id].length).map((a: any) => a.id), dirs, clipDirs, method: 'skel' };
	const draft = RUN.newDraft(ctx, spec);
	if (log) console.log('method', draft.spec.method, 'calls', draft.calls.map((x: any) => `${x.kind}:${x.cells.length}:${x.cells[0]}`).join(' '));
	const kfRow = (d: string) => c.clips.findIndex((k: string) => k.endsWith(`/${d}`));
	const put = async (im: Img) => { const sha = `s${++seq}`; G.__blobs.set(sha, await PNG.encodePngBytes(im)); return sha; };
	for (const [k, call] of draft.calls.entries()) {
		const outs: Img[] = [];
		for (const key of call.cells) {
			const [anim, d, i] = key.split('/');
			let raw: Img, bse: Img;
			if (anim === 'rest') { raw = cell(sheet, C, kfRow(d), 0); bse = I.padImg(baseRaw(d, 'rest'), c.pad); }
			else { const r = c.clips.indexOf(`${anim}/${d}`); raw = cell(sheet, C, r, 1 + +i); bse = I.padImg(baseRaw(d, `${anim}/${i}`), c.pad); }
			outs.push(mutate?.(raw, bse, key, d) ?? raw);
		}
		const expected = call.kind === 'pose' ? Math.max(3, call.cells.length) : Math.max(RT.EDIT_MIN_FRAMES - Number(!!call.reference || I.anchored(k, call.kind)), call.cells.length);
		while (outs.length < expected) outs.push(outs[0]);
		if (call.reference || I.anchored(k, call.kind)) outs.unshift(outs[0]);
		const results = await Promise.all(outs.map(async (im, i) => ({ label: String(i), sha: await put(im) })));
		const recId = `rec${++seq}`;
		G.__jobs.push({ id: recId, label: recId, method: 'POST', endpoint: '/x', params: {}, inputs: [], requestHash: recId, state: 'done', attempts: 1, nextAt: 0, createdAt: 1, jobs: [{ id: 'j', status: 'completed', done: true, results }], gens: 0, usd: 0 });
		call.recId = recId;
	}
	const res = await RUN.evaluateItem(draft, ctx);
	return { res, clean: RUN.isClean(res), draft, ctx };
}
