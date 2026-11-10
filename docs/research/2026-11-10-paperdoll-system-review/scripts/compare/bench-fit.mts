// Idea 1 on the frozen benchmark (real PixelLab outputs; offline): fit of re-posed item layers (animate-with-skeleton-v3
// from the dressed standing view) against the frozen base frames, by slot and move; the dressed standing keyframes
// (edit-animation-v2 on the real rest frame, i.e. "painted on the real frame") are the control.
import { readFileSync, writeFileSync } from 'node:fs';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { runCase } = await import(APP + 'scripts/bench.ts');
const { recompose } = await import(APP + 'src/lib/items/items.ts');
const { encodePngBytes } = await import(APP + 'src/lib/image/pngraw.ts');
const { makeImg } = await import(APP + 'src/lib/image/png.ts');
const { over } = await import(APP + 'src/lib/compose/compose.ts');
const { fit, summarize } = await import('./fitlib.mts');
const cases = JSON.parse(readFileSync(new URL('test/fixtures/bench/cases.json', APP), 'utf8'));
const table: any[] = [],
	all: any[] = [];
for (const c of cases) {
	if (c.role === 'reference') continue;
	const r = await runCase(c);
	const groups: Record<string, any[]> = {};
	for (const cell of r.cells) {
		const [anim, dir] = cell.key.split('/');
		const f = fit(cell, c.key);
		all.push({ id: c.id, slot: c.slot, key: cell.key, ...f, cell });
		(groups[anim === 'rest' ? 'rest(painted on real)' : anim] ??= []).push(f);
	}
	for (const [g, rows] of Object.entries(groups)) table.push({ case: c.id, slot: c.slot, move: g, ...summarize(rows) });
}
console.table(table);
// pooled
const pool = (f: (x: any) => boolean) => summarize(all.filter(f));
console.log('POSED all', pool((x) => !x.key.startsWith('rest')));
console.log('REST all', pool((x) => x.key.startsWith('rest')));
console.log('POSED walk', pool((x) => x.key.startsWith('walk')));
console.log('POSED slash', pool((x) => x.key.startsWith('slash')));
// contact sheet of the worst posed frames by beyond1, jut and holeBare: raw out | base | layer over base, 4x
for (const metric of ['beyond1', 'jut', 'holeBare', 'friend']) {
	const worst = all
		.filter((x) => !x.key.startsWith('rest'))
		.sort((a, b) => b[metric] - a[metric])
		.slice(0, 8);
	const C = Math.max(...worst.map((x) => x.cell.base.w)),
		S = 4;
	const sheet = makeImg(C * 3 * S, C * worst.length * S);
	worst.forEach((x, row) => {
		[x.cell.out, x.cell.base, recompose(x.cell)].forEach((im: any, col: number) => {
			const big = makeImg(im.w * S, im.h * S);
			for (let y = 0; y < im.h * S; y++)
				for (let X = 0; X < im.w * S; X++) {
					const s = (((y / S) | 0) * im.w + ((X / S) | 0)) * 4;
					big.data.set(im.data.subarray(s, s + 4), (y * im.w * S + X) * 4);
				}
			over(sheet, big, col * C * S, row * C * S);
		});
	});
	writeFileSync(new URL(`./sheets/bench-worst-${metric}.png`, import.meta.url), await encodePngBytes(sheet));
	console.log(metric, worst.map((x) => `${x.id} ${x.key} ${x[metric]}`).join(' | '));
}
writeFileSync(
	new URL('./bench-fit.json', import.meta.url),
	JSON.stringify({ table, rows: all.map(({ cell, ...x }) => x) }, null, 1)
);
