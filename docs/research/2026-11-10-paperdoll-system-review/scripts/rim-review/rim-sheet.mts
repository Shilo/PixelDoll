// Usage: node rim-sheet.mts out.png <case> <cellKey> [<case> <cellKey> ...]
// Per row: composite 1x | composite 4x | 4x with seam px marked (red = base outline peeking past gear, yellow = base color, cyan = gap)
import { readFileSync, writeFileSync } from 'node:fs';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { runCase } = await import(APP + 'scripts/bench.ts');
const { recompose } = await import(APP + 'src/lib/items/items.ts');
const { encodePngBytes } = await import(APP + 'src/lib/image/pngraw.ts');
const { makeImg } = await import(APP + 'src/lib/image/png.ts');
const { over } = await import(APP + 'src/lib/compose/compose.ts');
const cases = JSON.parse(readFileSync(new URL('test/fixtures/bench/cases.json', APP), 'utf8'));
const [outPath, ...args] = process.argv.slice(2);
const pairs: [string, string][] = [];
for (let i = 0; i < args.length; i += 2) pairs.push([args[i], args[i + 1]]);
const cache: Record<string, any> = {};
const up = (im: any, S: number) => {
	const big = makeImg(im.w * S, im.h * S);
	for (let y = 0; y < im.h * S; y++)
		for (let X = 0; X < im.w * S; X++) {
			const s = (((y / S) | 0) * im.w + ((X / S) | 0)) * 4;
			big.data.set(im.data.subarray(s, s + 4), (y * im.w * S + X) * 4);
		}
	return big;
};
const bg = (im: any) => { const o = makeImg(im.w, im.h); for (let p = 0; p < im.w * im.h; p++) o.data.set([150, 170, 140, 255], p * 4); over(o, im); return o; };
const lum = (d: any, i: number) => (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
const rows: any[] = [];
for (const [id, key] of pairs) {
	cache[id] ??= await runCase(cases.find((c: any) => c.id === id));
	const cell = cache[id].cells.find((c: any) => c.key === key);
	const comp = bg(recompose(cell)), mark = bg(recompose(cell));
	const { w, h } = comp, M = cell.mask, B = recompose(cell).data;
	for (let p = 0; p < w * h; p++) {
		const x = p % w, y = (p / w) | 0;
		const nb = (r: number) => { const o: number[] = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if ((dx || dy) && X >= 0 && Y >= 0 && X < w && Y < h) o.push(Y * w + X); } return o; };
		if (!M[p] && B[p * 4 + 3] && cell.out.data[p * 4 + 3] < 128 && nb(1).some((q) => M[q])) mark.data.set(lum(B, p * 4) < 0.28 ? [255, 0, 0, 255] : [255, 230, 0, 255], p * 4);
		if (!B[p * 4 + 3] && x && y && x < w - 1 && y < h - 1) { const n4 = [p - 1, p + 1, p - w, p + w]; if (n4.some((q) => M[q]) && n4.some((q) => !M[q] && B[q * 4 + 3])) mark.data.set([0, 255, 255, 255], p * 4); }
	}
	rows.push([comp, up(comp, 4), up(mark, 4)]);
}
const C = rows[0][0].w, S = 4, W = C + C * S * 2 + 16, H = C * S;
const sheet = makeImg(W, H * rows.length);
rows.forEach((r, i) => { over(sheet, r[0], 0, i * H); over(sheet, r[1], C + 8, i * H); over(sheet, r[2], C + 16 + C * S, i * H); });
writeFileSync(outPath, await encodePngBytes(sheet));
