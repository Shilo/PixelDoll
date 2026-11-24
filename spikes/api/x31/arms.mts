// x31 arms: draw an existing item (its dressed standing keyframe) onto the real frames of existing moves.
// usage (from spikes/api/x31): [X31_SRC=s2] node --experimental-transform-types --no-warnings arms.mts <arm> [items|all] [seed] [dirs]
//   DRY=1 builds and saves the inputs and prints the estimate without sending anything. ARM_CAP limits one arm's spend.
// Arms (backup = owner's 92 px rig, walk 6 frames; s2 = 64 px fixture, walk 8 + cross-punch 6 minus the reference frame):
//   anchored     production baseline: edit-animation-v2 on full frames, per view calls of [standing ref + (cap - 1) frames]
//   pixen-full   edit-image-pixen, per view sheets of 2x2 full cells (ref + 3 frames), long sheet prompt
//   pixen-simple as pixen-full with a short direct instruction
//   pixen-trim   edit-image-pixen, per view 1 sheet 256x252 (4x3 cells of 64x84 crop windows: ref + 6 frames)
//   eiv2-all     edit-images-v2, every target frame of every view plus the 3 refs in one sheet of crop windows
 //   (COLS=n forces n columns on the eiv2 sheets, frames counted instead of one view per row; own folder <arm>-c<n>)
//   eiv2-dense   as eiv2-all with every target frame twice (capacity and same-input consistency)
//   inpaint-all  inpaint-v3 on the eiv2-all sheet; refs protected by the mask
//   ea2-trim     edit-animation-v2 on crop windows, per view one call of [ref + all frames]
//   proflash     edit-image-pro-flash, per view 1 sheet as pixen-trim
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mts';
const { items, b64, save, paid, OUT, dressed, item, slotOf, skel, rig } = L;

const arm = process.argv[2];
const ids = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',') : L.ITEMS;
const seed = +(process.argv[4] ?? 7);
const dirs = (process.argv[5]?.split(',') ?? [...L.DIRS]) as L.Dir[];
const DRY = !!process.env.DRY;
const W = rig.cell.w, H = rig.cell.h, ROUTE = 'green';
const FACING: Record<string, string> = { south: 'facing south (front view)', east: 'facing east (side view)', north: 'facing north (back view)' };
const png = (b: string) => ({ type: 'base64', base64: b, format: 'png' });
const ARM_CAP = +(process.env.ARM_CAP ?? 200);
/** Crop window (cell) per source for the packed sheets: wide enough for the widest content plus a few px of motion. */
const WIN = L.SRC === 's2' ? { w: 44, h: 52 } : { w: 56, h: 84 };
type Img = L.Img;
type Win = { x: number; y: number; w: number; h: number };
type Cell = { key: string; dir: L.Dir; ref?: boolean; x: number; y: number; win: Win };
type Plan = { arm: string; item: string; seed: number; out: 'sheet' | 'frames'; cells: Cell[]; sheet?: { w: number; h: number }; req: { path: string; body: any }; estimate: number };

const full: Win = { x: 0, y: 0, w: W, h: H };
const promptItem = (id: string) => item(id).prompt.replace(/\s+/g, ' ').trim();
// Pixen takes at most 500 characters: its sheet prompts name the item once, cut at a sentence end if it is long.
const shortItem = (id: string) => { const p = promptItem(id); return p.length <= 110 ? p : p.slice(0, p.lastIndexOf('.', 110) + 1 || 110).replace(/\.$/, ''); };

async function view(id: string, dir: L.Dir) {
	const tg = await L.targets(dir);
	return { tg, chroma: tg.map((t) => items.inputCell(t.im, ROUTE)), ref: await dressed(id, dir) };
}
/** One fixed crop window per direction, shared by the reference and every target, centred on their joint content. */
async function winOf(id: string, dir: L.Dir, cw: number, ch: number) {
	const v = await view(id, dir);
	const b = [...v.tg.map((t) => t.im), v.ref].map(L.bbox);
	const x0 = Math.min(...b.map((r) => r.x0)), x1 = Math.max(...b.map((r) => r.x1)), y0 = Math.min(...b.map((r) => r.y0)), y1 = Math.max(...b.map((r) => r.y1));
	if (x1 - x0 + 3 > cw || y1 - y0 + 1 > ch) throw new Error(`${id} ${dir}: content ${x1 - x0 + 1}x${y1 - y0 + 1} does not fit a ${cw}x${ch} window`);
	const cx = Math.round((x0 + x1 + 1) / 2 - cw / 2), cy = Math.round((y0 + y1 + 1) / 2 - ch / 2);
	return { v, win: { x: Math.max(0, Math.min(W - cw, cx)), y: Math.max(0, Math.min(H - ch, cy)), w: cw, h: ch } };
}
/** Sheet: entries placed row-major at (col*cw, row*ch), each first cut to its window; undefined entries stay empty. */
function sheetOf(entries: ({ im: Img; cell: Omit<Cell, 'x' | 'y'> } | undefined)[], cw: number, ch: number, cols: number, SW: number, SH: number) {
	const g = L.blank(SW, SH), cells: Cell[] = [];
	entries.forEach((e, i) => {
		if (!e) return;
		const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
		L.blit(g, L.crop(e.im, e.cell.win.x, e.cell.win.y, e.cell.win.w, e.cell.win.h), x, y);
		cells.push({ ...e.cell, x, y });
	});
	return { g, cells };
}
const moveWords = (tg: { anim: string }[]) => {
	const parts: [string, number][] = [];
	for (const t of tg) parts.at(-1)?.[0] === t.anim ? parts.at(-1)![1]++ : parts.push([t.anim, 1]);
	return parts.map(([a, n]) => `${n} frames of ${a.replace(/-/g, ' ')}`).join(', then ');
};
function sheetPrompt(id: string, cols: number, rows: number, cw: number, ch: number, dir: L.Dir) {
	return `Sprite sheet, ${cols}x${rows} cells of ${cw}x${ch} px: one bright green mannequin per cell, ${FACING[dir]}. Green is a chroma key; keep it exactly. Cell 1 wears ${shortItem(id)}. Draw that same item (identical design, colors, size) on every other mannequin, fitted to its walking pose. Change nothing else.`;
}
/** Multi-view sheet prompt; `rowsPerView` is the original one-view-per-row wording (backup), otherwise frames are counted. */
function multiPrompt(id: string, cols: number, rows: number, cw: number, ch: number, vs: { dir: L.Dir; tg: { anim: string }[] }[], rowsPerView: boolean, refStart: number) {
	const it = promptItem(id);
	const layout = rowsPerView
		? vs.map((v, r) => `Row ${r + 1} is a ${v.tg.length}-frame walk animation ${FACING[v.dir]}.`).join(' ') +
			` Row ${vs.length + 1} starts with the reference design in the same ${vs.length} views, in the same order: ${it}. `
		: `Frames are counted left to right, top to bottom. ` +
			(() => { let k = 1; return vs.map((v) => { const s = `Frames ${k}-${k + v.tg.length - 1} are ${FACING[v.dir]}: ${moveWords(v.tg)}.`; k += v.tg.length; return s; }).join(' '); })() +
			` Frames ${refStart + 1}-${refStart + vs.length} show the reference design in the same ${vs.length} views, in the same order: ${it}. `;
	return (
		`This image is a sprite sheet: a ${cols}x${rows} grid of ${cw}x${ch} px frames of the same pixel art character, a solid bright green mannequin. ` +
		layout +
		`The bright green color is intentional (a chroma key) and must stay exactly the same bright green. ` +
		`Draw the identical ${it} on every animation frame, copying the reference of the same view and following each frame's pose; never turn around or swap front and back details; empty hands, no weapon, no effects. ` +
		`Keep every other pixel, the poses, the outlines, the grid layout and the transparent background unchanged.`
	);
}
const editImagesGens = (side: number) => (side <= 256 ? 10 : side <= 341 ? 15 : 25);

async function plans(id: string): Promise<{ plan: Plan; inputs: Record<string, Img> }[]> {
	const out: { plan: Plan; inputs: Record<string, Img> }[] = [];
	if (arm === 'anchored' || arm === 'pixen-full' || arm === 'pixen-simple') {
		const per = arm === 'anchored' ? L.routes.editFrameCap(Math.max(W, H)) - 1 : 3;
		for (const dir of dirs) {
			const v = await view(id, dir);
			for (let part = 0; part * per < v.tg.length; part++) {
				const idx = v.tg.map((_, i) => i).slice(part * per, part * per + per);
				const keys = idx.map((i) => v.tg[i].key);
				if (arm === 'anchored') {
					const frames = [v.ref, ...idx.map((i) => v.chroma[i])];
					const body = {
						description: items.itemPrompt(promptItem(id), ROUTE, keys, L.refKey(dir)),
						frames: await Promise.all(frames.map(async (f) => ({ image: png(await b64(f)), size: { width: W, height: H } }))),
						image_size: { width: W, height: H },
						no_background: true,
						seed
					};
					out.push({
						plan: { arm, item: id, seed, out: 'frames', estimate: 10, req: { path: '/edit-animation-v2', body },
							cells: [{ key: L.refKey(dir), dir, ref: true, x: 0, y: 0, win: full }, ...keys.map((key) => ({ key, dir, x: 0, y: 0, win: full }))] },
						inputs: Object.fromEntries(frames.map((f, i) => [`in${i}`, f]))
					});
				} else {
					const { g, cells } = sheetOf(
						[{ im: v.ref, cell: { key: L.refKey(dir), dir, ref: true, win: full } }, ...idx.map((i, j) => ({ im: v.chroma[i], cell: { key: keys[j], dir, win: full } }))],
						W, H, 2, 2 * W, 2 * H
					);
					const description = arm === 'pixen-simple'
						? `Dress the other three green figures in exactly the same ${shortItem(id)} that the top-left figure wears (same shape, colors and size), fitted to each figure's pose. Keep the green bodies, their poses and positions unchanged.`
						: sheetPrompt(id, 2, 2, W, H, dir);
					if (description.length > 500) throw new Error(`pixen prompt ${description.length} > 500`);
					out.push({ plan: { arm, item: id, seed, out: 'sheet', sheet: { w: g.w, h: g.h }, estimate: 1, cells,
						req: { path: '/edit-image-pixen', body: { image: png(await b64(g)), description, width: g.w, height: g.h, no_background: true, seed } } }, inputs: { sheet: g } });
				}
			}
		}
	} else if (arm === 'pixen-trim' || arm === 'proflash') {
		const cw = 64, ch = 84, cols = 4, rows = 3;
		for (const dir of dirs) {
			const { v, win } = await winOf(id, dir, cw, ch);
			const { g, cells } = sheetOf(
				[{ im: v.ref, cell: { key: L.refKey(dir), dir, ref: true, win } }, ...v.chroma.map((c, i) => ({ im: c, cell: { key: v.tg[i].key, dir, win } }))],
				cw, ch, cols, cols * cw, rows * ch
			);
			const description = sheetPrompt(id, cols, rows, cw, ch, dir);
			const req = arm === 'proflash'
				? { path: '/edit-image-pro-flash', body: { image: png(await b64(g)), method: 'text', description, no_background: true, seed } }
				: { path: '/edit-image-pixen', body: { image: png(await b64(g)), description, width: g.w, height: g.h, no_background: true, seed } };
			if (arm !== 'proflash' && description.length > 500) throw new Error(`pixen prompt ${description.length} > 500`);
			out.push({ plan: { arm, item: id, seed, out: 'sheet', sheet: { w: g.w, h: g.h }, estimate: arm === 'proflash' ? 9 : 1, cells, req }, inputs: { sheet: g } });
		}
	} else if (arm === 'eiv2-all' || arm === 'eiv2-dense' || arm === 'inpaint-all') {
		const { w: cw, h: ch } = WIN, slot = slotOf(id);
		const vs: { dir: L.Dir; v: Awaited<ReturnType<typeof view>>; win: Win; order: number[] }[] = [];
		for (const dir of dirs) {
			const { v, win } = await winOf(id, dir, cw, ch);
			const order = v.tg.map((_, i) => i);
			vs.push({ dir, v, win, order: arm === 'eiv2-dense' ? [...order, ...order] : order });
		}
		const T = vs.reduce((s, x) => s + x.order.length, 0), N = T + vs.length;
		const perView = vs[0].order.length;
		// the original backup layout: one view per row, refs in the last row
		const rowsPerView = !process.env.COLS && arm !== 'eiv2-dense' && L.SRC === 'backup' && vs.every((x) => x.order.length === perView) && perView >= vs.length;
		let cols = rowsPerView ? perView : +(process.env.COLS ?? 0);
		if (!cols) {
			let best = Infinity;
			for (let c = 1; c * cw <= 512; c++) { const r = Math.ceil(N / c), side = Math.max(c * cw, r * ch); if (r * ch <= 512 && side < best) { best = side; cols = c; } }
		}
		if (!cols) throw new Error(`${N} cells of ${cw}x${ch} do not fit 512 px`);
		const rows = rowsPerView ? vs.length + 1 : Math.ceil(N / cols);
		const entries: ({ im: Img; cell: Omit<Cell, 'x' | 'y'> } | undefined)[] = new Array(cols * rows).fill(undefined);
		const masks: (Uint8Array | null)[] = new Array(cols * rows).fill(null);
		let k = 0;
		for (const [r, x] of vs.entries()) {
			x.order.forEach((i, j) => {
				const at = rowsPerView ? r * cols + j : k++;
				entries[at] = { im: x.v.chroma[i], cell: { key: x.v.tg[i].key + (j >= x.v.tg.length ? '#2' : ''), dir: x.dir, win: x.win } };
				// inpaint mask: the slot's repair band in rig coordinates, widened to the standing design's rows (long hair)
				const band = items.bandOf(slot, skel(x.v.tg[i].key), H, 'repair'), design = L.bbox(x.v.ref);
				const y0 = Math.max(0, Math.min(band.y, design.y0 - 4)), y1 = Math.min(H, Math.max(band.y + band.h, design.y1 + 4));
				const m = new Uint8Array(cw * ch);
				for (let y = 0; y < ch; y++) for (let xx = 0; xx < cw; xx++) if (y + x.win.y >= y0 && y + x.win.y < y1) m[y * cw + xx] = 1;
				masks[at] = m;
			});
		}
		const refStart = rowsPerView ? vs.length * cols : k;
		vs.forEach((x, r) => (entries[refStart + r] = { im: x.v.ref, cell: { key: L.refKey(x.dir), dir: x.dir, ref: true, win: x.win } }));
		const { g, cells } = sheetOf(entries, cw, ch, cols, cols * cw, rows * ch);
		const description = multiPrompt(id, cols, rows, cw, ch, vs.map((x) => ({ dir: x.dir, tg: x.order.map((i) => x.v.tg[i]) })), rowsPerView, refStart);
		const side = Math.max(g.w, g.h);
		if (arm !== 'inpaint-all') {
			const req = { path: '/edit-images-v2', body: { method: 'edit_with_text', edit_images: [{ image: png(await b64(g)), width: g.w, height: g.h }], image_size: { width: g.w, height: g.h }, description, no_background: true, seed } };
			out.push({ plan: { arm, item: id, seed, out: 'sheet', sheet: { w: g.w, h: g.h }, estimate: editImagesGens(side), cells, req }, inputs: { sheet: g } });
		} else {
			const M = L.blank(g.w, g.h);
			for (let p = 0; p < M.w * M.h; p++) M.data[p * 4 + 3] = 255;
			masks.forEach((m, i) => {
				if (!m) return;
				const X = (i % cols) * cw, Y = Math.floor(i / cols) * ch;
				for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (m[y * cw + x]) M.data.fill(255, ((Y + y) * M.w + X + x) * 4, ((Y + y) * M.w + X + x) * 4 + 3);
			});
			const req = { path: '/inpaint-v3', body: { description, inpainting_image: { image: png(await b64(g)), size: { width: g.w, height: g.h } }, mask_image: { image: png(await b64(M)), size: { width: M.w, height: M.h } }, no_background: true, seed } };
			out.push({ plan: { arm, item: id, seed, out: 'sheet', sheet: { w: g.w, h: g.h }, estimate: items.gridEstimate({ w: cw, h: ch }, cols * rows - 1, 1, cols).gens, cells, req }, inputs: { sheet: g, mask: M } });
		}
	} else if (arm === 'eiv2-prod' || arm === 'eiv2-view') {
		// production-style layout (review round): crop windows with a 4 px margin on every side, one view per row with its
		// reference first. eiv2-prod: every view in one sheet (PAD_H pads the sheet height for the billing probe);
		// eiv2-view: one 4x2 sheet per view.
		const M = 4, cw = 56, ch = 90;
		const rowsOf: { dir: L.Dir; v: Awaited<ReturnType<typeof view>>; win: Win }[] = [];
		for (const dir of dirs) {
			const v = await view(id, dir);
			const b = [...v.tg.map((t) => t.im), v.ref].map(L.bbox);
			const x0 = Math.min(...b.map((r) => r.x0)), x1 = Math.max(...b.map((r) => r.x1)), y0 = Math.min(...b.map((r) => r.y0)), y1 = Math.max(...b.map((r) => r.y1));
			if (x1 - x0 + 1 + 2 * M > cw || y1 - y0 + 1 + 2 * M > ch) throw new Error(`${id} ${dir}: content ${x1 - x0 + 1}x${y1 - y0 + 1} + ${M} px margins does not fit ${cw}x${ch}`);
			const cx = Math.round((x0 + x1 + 1) / 2 - cw / 2), cy = Math.round((y0 + y1 + 1) / 2 - ch / 2);
			rowsOf.push({ dir, v, win: { x: Math.max(0, Math.min(W - cw, cx)), y: Math.max(0, Math.min(H - ch, cy)), w: cw, h: ch } });
		}
		const groups = arm === 'eiv2-view' ? rowsOf.map((r) => [r]) : [rowsOf];
		for (const g of groups) {
			const perView = 1 + g[0].v.tg.length, cols = arm === 'eiv2-view' ? 4 : perView, rows = arm === 'eiv2-view' ? Math.ceil(perView / cols) : g.length;
			const entries: ({ im: Img; cell: Omit<Cell, 'x' | 'y'> } | undefined)[] = [];
			for (const r of g) {
				entries.push({ im: r.v.ref, cell: { key: L.refKey(r.dir as any), dir: r.dir, ref: true, win: r.win } });
				r.v.chroma.forEach((c, i) => entries.push({ im: c, cell: { key: r.v.tg[i].key, dir: r.dir, win: r.win } }));
			}
			const SH = rows * ch + +(process.env.PAD_H ?? 0);
			const { g: sheet, cells } = sheetOf(entries, cw, ch, cols, cols * cw, SH);
			const it = promptItem(id);
			const facing = (d: string) => FACING[d] ?? 'facing west (side view)';
			const layout = arm === 'eiv2-view'
				? `Frame 1 (top left) is the reference design ${facing(g[0].dir)}: the mannequin wearing ${it}. The next ${perView - 1} frames, left to right and top to bottom, are a ${perView - 1}-frame walk animation ${facing(g[0].dir)}. `
				: g.map((r, k) => `Row ${k + 1}: frame 1 is the reference design ${facing(r.dir)}, then a ${perView - 1}-frame walk animation ${facing(r.dir)}.`).join(' ') + ` The reference shows the mannequin wearing ${it}. `;
			const description =
				`This image is a sprite sheet: a ${cols}x${rows} grid of ${cw}x${ch} px frames of the same pixel art character, a solid bright green mannequin. ` +
				layout +
				`The bright green color is intentional (a chroma key) and must stay exactly the same bright green. ` +
				`Draw the identical ${it} on every walk frame, copying the reference ${arm === 'eiv2-view' ? '' : 'in the same row '}and following each frame's pose; keep each frame's facing, never turn around or swap front and back details; empty hands, no weapon, no effects. ` +
				`Keep every other pixel, the poses, the outlines, the grid layout and the transparent background unchanged.`;
			const req = { path: '/edit-images-v2', body: { method: 'edit_with_text', edit_images: [{ image: png(await b64(sheet)), width: sheet.w, height: sheet.h }], image_size: { width: sheet.w, height: sheet.h }, description, no_background: true, seed } };
			const mean = (sheet.w + sheet.h) / 2;
			out.push({ plan: { arm, item: id, seed, out: 'sheet', sheet: { w: sheet.w, h: sheet.h }, estimate: mean <= 256 ? 10 : mean <= 336 ? 15 : 25, cells, req }, inputs: { sheet } });
		}
	} else if (arm === 'ea2-trim') {
		const { w: cw, h: ch } = WIN;
		for (const dir of dirs) {
			const { v, win } = await winOf(id, dir, cw, ch);
			const frames = [v.ref, ...v.chroma].map((f) => L.crop(f, win.x, win.y, cw, ch));
			const keys = v.tg.map((t) => t.key);
			const body = {
				description: items.itemPrompt(promptItem(id), ROUTE, keys, L.refKey(dir)),
				frames: await Promise.all(frames.map(async (f) => ({ image: png(await b64(f)), size: { width: cw, height: ch } }))),
				image_size: { width: cw, height: ch },
				no_background: true,
				seed
			};
			out.push({ plan: { arm, item: id, seed, out: 'frames', estimate: 10, req: { path: '/edit-animation-v2', body },
				cells: [{ key: L.refKey(dir), dir, ref: true, x: 0, y: 0, win }, ...keys.map((key) => ({ key, dir, x: 0, y: 0, win }))] },
				inputs: Object.fromEntries(frames.map((f, i) => [`in${i}`, f])) });
		}
	} else throw new Error(`unknown arm ${arm}`);
	return out;
}

let total = 0;
const tasks: (() => Promise<unknown>)[] = [];
const armDir = path.join(OUT, L.TAG + arm + (process.env.COLS ? `-c${process.env.COLS}` : '') + (process.env.PAD_H ? `-pad${process.env.PAD_H}` : '') + (process.env.ARM_TAG ?? ''));
for (const id of ids) {
	for (const [n, { plan, inputs }] of (await plans(id)).entries()) {
		const file = path.join(armDir, `${id}.s${seed}.${n}`);
		fs.mkdirSync(armDir, { recursive: true });
		for (const [k, im] of Object.entries(inputs)) await save(`${file}.${k}.png`, im);
		const strip = JSON.parse(JSON.stringify(plan.req.body, (k, v) => (typeof v === 'string' && v.length > 300 && k !== 'description' ? `<${v.length} chars>` : v)));
		if (!fs.existsSync(`${file}.json`)) fs.writeFileSync(`${file}.plan.json`, JSON.stringify({ ...plan, src: L.SRC, req: { path: plan.req.path, body: strip } }, null, 1));
		total += plan.estimate;
		if (!DRY) tasks.push(() => paid({ arm: L.TAG + arm, label: `${path.basename(armDir)} ${id} ${n} s${seed}`, file, req: plan.req, estimate: plan.estimate, armCap: ARM_CAP }));
	}
}
console.log(`${L.TAG}${arm}: ${tasks.length || 'dry'} calls, estimate ${total} gens; ledger so far ${L.spent()} / ${L.TOTAL_CAP}`);
if (!DRY) await L.pool(tasks, 6);
console.log(`ledger now ${L.spent()}`);
