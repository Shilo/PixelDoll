// Visual check for arm-shaped notches: per clip, row 1 = layer over the frozen base (what ships), row 2 = the model's own
// posed output (key body + item), row 3 = frozen base with the model's key body outline: red = model body where the base is
// empty (>1 px), blue = base body the model did not draw (>1 px). 4x. Usage: node bench-sheet.mts <case> <clip> [<clip>...]
import { writeFileSync } from 'node:fs';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { runCase } = await import(APP + 'scripts/bench.ts');
const { recompose } = await import(APP + 'src/lib/items/items.ts');
const { encodePngBytes } = await import(APP + 'src/lib/image/pngraw.ts');
const { makeImg } = await import(APP + 'src/lib/image/png.ts');
const { over } = await import(APP + 'src/lib/compose/compose.ts');
const { keyScore, KT } = await import(APP + 'src/lib/image/chroma.ts');
const { dilate } = await import('./fitlib.mts');
import { readFileSync } from 'node:fs';
const [id, ...clips] = process.argv.slice(2);
const c = JSON.parse(readFileSync(new URL('test/fixtures/bench/cases.json', APP), 'utf8')).find((x: any) => x.id === id);
const r = await runCase(c);
const S = 4;
const up = (im: any) => {
	const big = makeImg(im.w * S, im.h * S);
	for (let y = 0; y < im.h * S; y++)
		for (let X = 0; X < im.w * S; X++) {
			const s = (((y / S) | 0) * im.w + ((X / S) | 0)) * 4;
			big.data.set(im.data.subarray(s, s + 4), (y * im.w * S + X) * 4);
		}
	return big;
};
const bg = (im: any) => {
	const o = makeImg(im.w, im.h);
	for (let p = 0; p < im.w * im.h; p++) o.data.set([60, 60, 70, 255], p * 4);
	over(o, im);
	return o;
};
for (const clip of clips) {
	const cells = r.cells.filter((x: any) => x.key.startsWith(clip + '/'));
	const rest = r.cells.find((x: any) => x.key === `rest/${clip.split('/')[1]}/0`);
	const list = [rest, ...cells];
	const C = list[0].base.w;
	const sheet = makeImg(C * S * list.length, C * S * 3);
	list.forEach((cell: any, i: number) => {
		const n = C * C,
			keyM = new Uint8Array(n),
			bare = new Uint8Array(n);
		for (let p = 0; p < n; p++) {
			bare[p] = cell.base.data[p * 4 + 3] ? 1 : 0;
			const d = cell.out.data;
			keyM[p] = d[p * 4 + 3] >= 128 && !cell.mask[p] && keyScore(c.key, d[p * 4], d[p * 4 + 1], d[p * 4 + 2]) >= KT ? 1 : 0;
		}
		const b1 = dilate(bare, C, C, 1),
			k1 = dilate(keyM, C, C, 1),
			m1 = dilate(cell.mask, C, C, 1);
		const ov = bg(cell.base);
		for (let p = 0; p < n; p++) {
			if (keyM[p] && !b1[p]) ov.data.set([255, 0, 0, 255], p * 4);
			if (bare[p] && !k1[p] && !m1[p]) ov.data.set([0, 120, 255, 255], p * 4);
		}
		over(sheet, up(bg(recompose(cell))), i * C * S, 0);
		over(sheet, up(bg(cell.out)), i * C * S, C * S);
		over(sheet, up(ov), i * C * S, 2 * C * S);
	});
	const name = `${id}-${clip.replace('/', '-')}`;
	writeFileSync(new URL(`./sheets/${name}.png`, import.meta.url), await encodePngBytes(sheet));
	console.log('wrote', name);
}
