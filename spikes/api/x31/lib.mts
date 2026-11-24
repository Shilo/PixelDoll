// Round x31 (2026-11-23): cheaper routes to draw an existing item onto every frame of an existing body move.
// Reuses the c25 harness (server-only key resolution in y_env, paid() ledger with a hard cap and no automatic resend) and the
// app's own chroma input, extraction and QA (app/src/lib/items). Owner approved up to 1,000 generations; this run caps at 950.
// Inputs come from the owner's backup, extracted outside the repo (X31_BACKUP); outputs stay in spikes/api/out/x31 (git-ignored).
process.env.C25_RUN ??= 'x31';
process.env.C25_CAP ??= '950';
const env = await import('../c25/y_env.mts');
export const API_BASE = env.API_BASE;
const c25 = await import('../c25/lib.mts');
export const { api, b64, save, load, items, chroma, routes, clips, OUT, spent, paid, pool, TOTAL_CAP } = c25;
export type Img = { w: number; h: number; data: Uint8ClampedArray };
import fs from 'node:fs';
import path from 'node:path';

export const SRC = process.env.X31_SRC ?? 'backup'; // 'backup' (owner's 92 px rig) | 's2' (64 px demo fixture)
/** Output folder prefix per source, so both sources share arms and the evaluator. */
export const TAG = SRC === 'backup' ? '' : `${SRC}-`;
export const BACKUP =
	process.env.X31_BACKUP ??
	'C:/Users/shilo/AppData/Local/Temp/claude/3e36a31a6db31790/e317b8f2-5ff4-4fb4-b022-207f21dbf24c/scratchpad/backup';
export const RIG_ID = process.env.X31_RIG ?? 'rig-4be2c254-cec9-4b0a-8736-ddcc61de5ec1';
export const DIRS = ['south', 'east', 'north'] as const;
export type Dir = (typeof DIRS)[number] | 'west'; // west: the backup's stored mirrored frames, used only by the 4-view probe
const FIXTURE = path.resolve(import.meta.dirname, '../../../app/public/fixtures/s2');

let rec: any, manifest: any;
if (SRC === 's2') {
	manifest = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'fixture.json'), 'utf8'));
	rec = { manifest, skeletons: undefined }; // the fixture stores no joints: bandOf falls back to the whole cell
} else {
	const backup = JSON.parse(fs.readFileSync(path.join(BACKUP, 'backup.json'), 'utf8'));
	rec = backup.characters.find((c: any) => c[0] === RIG_ID)[1];
	manifest = rec.manifest;
}
export { rec, manifest };
export const rig = manifest.rig;
export const ITEMS = SRC === 's2' ? ['hair_brown', 'vest_leather', 'cape_red', 'helmet_steel'] : ['long_braided_hair', 'cal_a_jeans', 'chapeu_de_palha', 'short_2'];
/** Moves whose frames are drawn; s2's references come from walk frame 0, which is therefore not a target. */
export const MOVES = SRC === 's2' ? ['walk', 'cross-punch'] : ['walk'];
const cache = new Map<string, Img>();
export async function blob(sha: string | null): Promise<Img> {
	if (sha == null) return blank(rig.cell.w, rig.cell.h); // null = an intentionally transparent cell
	const hex = sha.replace(/^sha256:/, '');
	if (!cache.has(hex)) cache.set(hex, await load(path.join(BACKUP, 'blobs', hex)));
	return cache.get(hex)!;
}
export const item = (id: string) => manifest.items.find((i: any) => i.id === id);
export const body = () => manifest.items.find((i: any) => i.slot === 'body');
/** s2: one cell of a layer sheet (columns = frames, rows = generated directions in DIRS order). */
async function sheetCell(rel: string, dir: Dir, i: number) {
	const k = `${rel}#${dir}#${i}`;
	if (!cache.has(k)) {
		const g = await load(path.join(FIXTURE, rel));
		cache.set(k, crop(g, i * rig.cell.w, DIRS.indexOf(dir) * rig.cell.h, rig.cell.w, rig.cell.h));
	}
	return cache.get(k)!;
}
const animCells = (anim: string) => rig.animations.find((a: any) => a.id === anim).cells as number;
/** The real body frames of a move (the base item's layer cells). */
export const bodyFrames = (anim: string, dir: Dir): Promise<Img[]> =>
	SRC === 's2'
		? Promise.all(Array.from({ length: animCells(anim) }, (_, i) => sheetCell(body().layers[0].sheets[anim], dir, i)))
		: Promise.all((body().layers[0].cells[anim][dir] as string[]).map(blob));
/** The key the standing reference stands for. */
export const refKey = (dir: Dir) => (SRC === 's2' ? `walk/${dir}/0` : `default/${dir}/0`);
/** The body under the standing reference. */
export const restBody = async (dir: Dir) => (SRC === 's2' ? (await bodyFrames('walk', dir))[0] : blob(rig.rest[dir].image));
/** The item's own layers on the standing reference cell. */
export const standingLayers = async (id: string, dir: Dir): Promise<Img[]> =>
	SRC === 's2'
		? Promise.all(item(id).layers.map((l: any) => sheetCell(l.sheets.walk, dir, 0)))
		: Promise.all(item(id).layers.map((l: any) => blob(l.cells.default[dir][0])));
/** The item's layers on any cell of the fixture (s2 only: the earlier generation, for comparison). */
export const fixtureLayers = (id: string, key: string) => {
	const [a, d, i] = key.split('/');
	return Promise.all(item(id).layers.filter((l: any) => l.sheets?.[a]).map((l: any) => sheetCell(l.sheets[a], d as Dir, +i)));
};
/** The item's dressed standing keyframe: a chroma mannequin wearing the item (what the anchored route sends as frame 1).
 *  s2 has none, so it is rebuilt the same way: bg layers, then the chroma copy of walk frame 0, then the other layers. */
export async function dressed(id: string, dir: Dir): Promise<Img> {
	if (SRC !== 's2') return item(id).dressed[dir] ? blob(item(id).dressed[dir]) : flipH(await blob(item(id).dressed.east)); // west: the east design mirrored, as the app mirrors west
	const b = (await bodyFrames('walk', dir))[0], it = item(id), o = blank(b.w, b.h);
	const ls = await standingLayers(id, dir);
	const over = (src: Img) => { for (let p = 0; p < o.w * o.h; p++) if (src.data[p * 4 + 3]) o.data.set(src.data.subarray(p * 4, p * 4 + 4), p * 4); };
	it.layers.forEach((l: any, j: number) => l.role === 'bg' && over(ls[j]));
	over(items.inputCell(b, 'green'));
	it.layers.forEach((l: any, j: number) => l.role !== 'bg' && over(ls[j]));
	return o;
}
/** Every target frame of a direction: all frames of MOVES, minus the cell the reference was made from. */
export async function targets(dir: Dir) {
	const out: { key: string; anim: string; im: Img }[] = [];
	for (const anim of MOVES) (await bodyFrames(anim, dir)).forEach((im, i) => { const key = `${anim}/${dir}/${i}`; if (key !== refKey(dir)) out.push({ key, anim, im }); });
	return out;
}
const slots = await import(new URL('../../../app/src/lib/items/slots.ts', import.meta.url).href);
export const slotOf = (id: string) => slots.requireSlot(manifest, item(id).slot);
export const skel = (key: string) => rec.skeletons?.[key];

// ---------- image helpers (never resample) ----------
export const blank = (w: number, h: number): Img => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
export function blit(dst: Img, src: Img, x0: number, y0: number, sx = 0, sy = 0, w = src.w, h = src.h) {
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const X = x0 + x,
				Y = y0 + y,
				SX = sx + x,
				SY = sy + y;
			if (X < 0 || Y < 0 || X >= dst.w || Y >= dst.h || SX < 0 || SY < 0 || SX >= src.w || SY >= src.h) continue;
			const s = (SY * src.w + SX) * 4;
			dst.data.set(src.data.subarray(s, s + 4), (Y * dst.w + X) * 4);
		}
	return dst;
}
export const crop = (im: Img, x: number, y: number, w: number, h: number) => blit(blank(w, h), im, 0, 0, x, y, w, h);
/** Opaque bounding box. */
export function bbox(im: Img) {
	let x0 = im.w, y0 = im.h, x1 = -1, y1 = -1;
	for (let y = 0; y < im.h; y++)
		for (let x = 0; x < im.w; x++)
			if (im.data[(y * im.w + x) * 4 + 3]) {
				x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
			}
	return { x0, y0, x1, y1 };
}
export const opaqueBg = (im: Img, rgb = [255, 255, 255]) => {
	const o = blank(im.w, im.h);
	for (let p = 0; p < im.w * im.h; p++) {
		const a = im.data[p * 4 + 3] / 255;
		for (let c = 0; c < 3; c++) o.data[p * 4 + c] = Math.round(im.data[p * 4 + c] * a + rgb[c] * (1 - a));
		o.data[p * 4 + 3] = 255;
	}
	return o;
};

/** A sheet of equal cells, row-major. */
export function pack(cells: Img[], cw: number, ch: number, cols: number, W?: number, H?: number) {
	const rows = Math.ceil(cells.length / cols);
	const g = blank(W ?? cols * cw, H ?? rows * ch);
	cells.forEach((c, i) => blit(g, c, (i % cols) * cw, Math.floor(i / cols) * ch));
	return g;
}
export const unpack = (g: Img, n: number, cw: number, ch: number, cols: number) =>
	Array.from({ length: n }, (_, i) => crop(g, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch));

/** One fixed crop window per direction, shared by the standing reference and every move frame, so cells stay aligned to the
 *  rig cell (crop, never rescale). Union of opaque boxes of the body frames and the dressed keyframes, plus a margin. */
export function window(ims: Img[], margin: number, cw: number, ch: number, W: number, H: number) {
	const b = ims.map(bbox);
	const x0 = Math.min(...b.map((r) => r.x0)) - margin,
		x1 = Math.max(...b.map((r) => r.x1)) + margin,
		y0 = Math.min(...b.map((r) => r.y0)) - margin,
		y1 = Math.max(...b.map((r) => r.y1)) + margin;
	if (x1 - x0 + 1 > cw || y1 - y0 + 1 > ch) return null;
	// centre the content in the window, clamped to the frame
	const cx = Math.round((x0 + x1 + 1) / 2 - cw / 2), cy = Math.round((y0 + y1 + 1) / 2 - ch / 2);
	return { x: Math.max(0, Math.min(W - cw, cx)), y: Math.max(0, Math.min(H - ch, cy)), w: cw, h: ch };
}
export const uncrop = (cell: Img, win: { x: number; y: number }, W: number, H: number) => blit(blank(W, H), cell, win.x, win.y);

export const ledger = () =>
	!fs.existsSync(path.join(OUT, 'ledger.jsonl'))
		? []
		: fs.readFileSync(path.join(OUT, 'ledger.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
/** Mirror an image horizontally (exact pixel copy, no resampling). */
export function flipH(im: Img): Img {
	const o = blank(im.w, im.h);
	for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) o.data.set(im.data.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4), (y * im.w + (im.w - 1 - x)) * 4);
	return o;
}
