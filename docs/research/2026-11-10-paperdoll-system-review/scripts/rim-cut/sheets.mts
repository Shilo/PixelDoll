// 6x sheets of every changed frame (before | after | before with cut px in magenta, remaining rim red) and 4x GIF frames.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { runCase } = await import(APP + 'scripts/bench.ts');
const { recompose } = await import(APP + 'src/lib/items/items.ts');
const { encodePngBytes } = await import(APP + 'src/lib/image/pngraw.ts');
const { makeImg } = await import(APP + 'src/lib/image/png.ts');
const { over } = await import(APP + 'src/lib/compose/compose.ts');
const { rimCut, union } = await import('./rimcut.mts');
const cases = JSON.parse(readFileSync(new URL('test/fixtures/bench/cases.json', APP), 'utf8'));
const GIFS = ['b-tunic walk/south-east', 'b-cloak walk/north', 'a-boots slash/east', 'a-boots walk/east', 'a-boots walk/north', 'b-cloak walk/south'];
const up = (im: any, S: number) => { const b = makeImg(im.w * S, im.h * S); for (let y = 0; y < im.h * S; y++) for (let X = 0; X < im.w * S; X++) { const s = (((y / S) | 0) * im.w + ((X / S) | 0)) * 4; b.data.set(im.data.subarray(s, s + 4), (y * im.w * S + X) * 4); } return b; };
const bg = (im: any) => { const o = makeImg(im.w, im.h); for (let p = 0; p < im.w * im.h; p++) o.data.set([150, 170, 140, 255], p * 4); over(o, im); return o; };
mkdirSync('sheets', { recursive: true }); mkdirSync('gif', { recursive: true });
const sheet = async (path: string, rows: any[][], S: number, gap = 4) => {
	const C = rows[0][0].w, W = rows[0].length * (C * S + gap), H = C * S + gap;
	const o = makeImg(W, H * rows.length);
	for (let p = 0; p < o.w * o.h; p++) o.data.set([40, 40, 40, 255], p * 4);
	rows.forEach((r, i) => r.forEach((im: any, j: number) => over(o, up(im, S), j * (C * S + gap), i * H)));
	writeFileSync(path, await encodePngBytes(o));
};
let changed = 0;
for (const c of cases) {
	if (c.role === 'reference' || !['torso_outer', 'feet', 'back'].includes(c.slot)) continue;
	const r = await runCase(c);
	const rows: any[][] = [], clipFrames: Record<string, any[]> = {};
	for (const cell of r.cells) {
		const rc = rimCut(cell, c.slot), after = { ...cell, cut: union(cell.cut, rc) };
		const b = bg(recompose(cell)), a = bg(recompose(after));
		const [anim, dir] = cell.key.split('/');
		(clipFrames[`${anim}/${dir}`] ??= []).push([b, a]);
		if (!rc) continue;
		changed++;
		const mk = bg(recompose(cell));
		for (let p = 0; p < rc.length; p++) if (rc[p]) mk.data.set([255, 0, 255, 255], p * 4);
		rows.push([b, a, mk]);
	}
	if (rows.length) await sheet(`sheets/${c.id}.png`, rows, 6);
	for (const [clip, fr] of Object.entries(clipFrames)) {
		const k = `${c.id} ${clip}`;
		if (!GIFS.includes(k)) continue;
		const dir = `gif/${k.replace(/[ /]/g, '_')}`; mkdirSync(dir, { recursive: true });
		for (const [i, [b, a]] of fr.entries()) {
			const C = b.w, o = makeImg(C * 2 + 2, C);
			for (let p = 0; p < o.w * o.h; p++) o.data.set([40, 40, 40, 255], p * 4);
			over(o, b, 0, 0); over(o, a, C + 2, 0);
			writeFileSync(`${dir}/f${String(i).padStart(2, '0')}.png`, await encodePngBytes(up(o, 4)));
		}
		execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '8', '-i', `${dir}/f%02d.png`, '-vf', 'split[s0][s1];[s0]palettegen=reserve_transparent=0[p];[s1][p]paletteuse=dither=none', '-loop', '0', `gif/${k.replace(/[ /]/g, '_')}.gif`]);
	}
}
console.log('changed frames on sheets', changed);
