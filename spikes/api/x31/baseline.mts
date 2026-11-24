// 0 gens: the skeleton route's stored walk layers from the backup, re-scored with eval.mts. Each "output" is the chroma body
// frame with the stored layers composited (bg under, fg over), as if a model had returned it, so the same extraction applies.
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mts';
const { items, OUT, item, blob, save, rig } = L;
const arm = 'skeleton-stored', dir = path.join(OUT, arm);
fs.mkdirSync(dir, { recursive: true });
const over = (dst: L.Img, src: L.Img) => { for (let p = 0; p < dst.w * dst.h; p++) if (src.data[p * 4 + 3]) dst.data.set(src.data.subarray(p * 4, p * 4 + 4), p * 4); return dst; };
for (const id of L.ITEMS) {
	const it = item(id);
	for (const d of L.DIRS) {
		const shas = it.layers.map((l: any) => l.cells.walk?.[d]);
		if (shas.some((s: any) => !s)) continue;
		const frames = await L.bodyFrames('walk', d);
		const file = path.join(dir, `${id}.s7.${d}`);
		const cells: any[] = [{ key: `default/${d}/0`, dir: d, ref: true, x: 0, y: 0, win: { x: 0, y: 0, w: rig.cell.w, h: rig.cell.h } }];
		for (const [i, f] of frames.entries()) {
			const o = L.blank(f.w, f.h);
			for (const [j, l] of it.layers.entries()) if (l.role === 'bg') over(o, await blob(shas[j][i]));
			over(o, items.inputCell(f, 'green'));
			for (const [j, l] of it.layers.entries()) if (l.role !== 'bg') over(o, await blob(shas[j][i]));
			await save(`${file}.${i + 1}.png`, o);
			cells.push({ key: `walk/${d}/${i}`, dir: d, x: 0, y: 0, win: cells[0].win });
		}
		fs.writeFileSync(`${file}.plan.json`, JSON.stringify({ arm, item: id, seed: 7, out: 'frames', cells }));
		fs.writeFileSync(`${file}.json`, JSON.stringify({ usage: [], stored: true }));
		console.log(id, d, 'stored walk layers', frames.length);
	}
}
