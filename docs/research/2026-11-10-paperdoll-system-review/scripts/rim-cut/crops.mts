// Zoomed crops (8x, 24x24 px around the cut) of every changed frame: before | after | cut px magenta. 4 frames per row.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { runCase } = await import(APP + 'scripts/bench.ts');
const { recompose } = await import(APP + 'src/lib/items/items.ts');
const { encodePngBytes } = await import(APP + 'src/lib/image/pngraw.ts');
const { makeImg } = await import(APP + 'src/lib/image/png.ts');
const { over } = await import(APP + 'src/lib/compose/compose.ts');
const { rimCut, union } = await import('./rimcut.mts');
const cases = JSON.parse(readFileSync(new URL('test/fixtures/bench/cases.json', APP), 'utf8'));
const S = 8, R = 24, OUT = process.env.OUT ?? 'crops';
const bg = (im: any) => { const o = makeImg(im.w, im.h); for (let p = 0; p < im.w * im.h; p++) o.data.set([150, 170, 140, 255], p * 4); over(o, im); return o; };
const crop = (im: any, x0: number, y0: number) => { const o = makeImg(R * S, R * S); for (let y = 0; y < R * S; y++) for (let x = 0; x < R * S; x++) { const X = x0 + ((x / S) | 0), Y = y0 + ((y / S) | 0); const c = X >= 0 && Y >= 0 && X < im.w && Y < im.h ? im.data.subarray((Y * im.w + X) * 4, (Y * im.w + X) * 4 + 4) : [0, 0, 0, 255]; o.data.set(c, (y * R * S + x) * 4); } return o; };
mkdirSync(OUT, { recursive: true });
for (const c of cases) {
	if (c.role === 'reference' || !['torso_outer', 'feet', 'back'].includes(c.slot)) continue;
	const r = await runCase(c), tiles: any[] = [];
	for (const cell of r.cells) {
		const rc = rimCut(cell, c.slot); if (!rc) continue;
		let sx = 0, sy = 0, n = 0; for (let p = 0; p < rc.length; p++) if (rc[p]) { sx += p % cell.base.w; sy += (p / cell.base.w) | 0; n++; }
		const x0 = Math.round(sx / n - R / 2), y0 = Math.round(sy / n - R / 2);
		const b = bg(recompose(cell)), a = bg(recompose({ ...cell, cut: union(cell.cut, rc) })), mk = bg(recompose(cell));
		for (let p = 0; p < rc.length; p++) if (rc[p]) mk.data.set([255, 0, 255, 255], p * 4);
		tiles.push([crop(b, x0, y0), crop(a, x0, y0), crop(mk, x0, y0)]);
		console.log(c.id, tiles.length - 1, cell.key, n);
	}
	if (!tiles.length) continue;
	const T = R * S, per = 4, gap = 6, W = per * (3 * T + 2 * 2 + gap), rows = Math.ceil(tiles.length / per);
	const o = makeImg(W, rows * (T + gap));
	for (let p = 0; p < o.w * o.h; p++) o.data.set([20, 20, 20, 255], p * 4);
	tiles.forEach((t, i) => t.forEach((im: any, j: number) => over(o, im, (i % per) * (3 * T + 4 + gap) + j * (T + 2), ((i / per) | 0) * (T + gap))));
	writeFileSync(`${OUT}/${c.id}.png`, await encodePngBytes(o));
}
