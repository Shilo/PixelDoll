// Offline: how much key-ramp contrast does toChroma give each local luminance edge of the frozen bench bodies,
// against a five-flat-tone quantization of the same ramp (their mannequin)?
import { readFileSync } from 'node:fs';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { decodePngBytes } = await import(APP + 'src/lib/image/pngraw.ts');
const { toChroma } = await import(APP + 'src/lib/image/chroma.ts');
const lum = (d, i) => (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
for (const B of ['A', 'B', 'C', 'N']) {
	const body = JSON.parse(readFileSync(new URL(`test/fixtures/bench/body${B}.json`, APP), 'utf8'));
	const sheet = await decodePngBytes(new Uint8Array(readFileSync(new URL(`test/fixtures/bench/body${B}.png`, APP))));
	const N = body.rig.cell.w;
	const steps = [], five = [];
	let edges = 0, merged5 = 0, under10 = 0;
	for (let r = 0; r < body.rows.length; r++)
		for (let c = 0; c < body.cols.length; c++) {
			const im = { w: N, h: N, data: new Uint8ClampedArray(N * N * 4) };
			for (let y = 0; y < N; y++) im.data.set(sheet.data.subarray(((r * N + y) * sheet.w + c * N) * 4, ((r * N + y) * sheet.w + c * N + N) * 4), y * N * 4);
			let lo = 1, hi = 0;
			for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3]) { const l = lum(im.data, i); lo = Math.min(lo, l); hi = Math.max(hi, l); }
			if (hi <= lo) continue;
			const K = toChroma(im, 'green');
			const q = (i) => Math.round(4 * ((lum(im.data, i) - lo) / (hi - lo))) ;
			for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
				const i = (y * N + x) * 4;
				if (!im.data[i + 3]) continue;
				for (const [dx, dy] of [[1, 0], [0, 1]]) {
					if (x + dx >= N || y + dy >= N) continue;
					const j = ((y + dy) * N + x + dx) * 4;
					if (!im.data[j + 3]) continue;
					if (Math.abs(lum(im.data, i) - lum(im.data, j)) < 3 / 255) continue;
					edges++;
					const s = Math.abs(K.data[i + 1] - K.data[j + 1]);
					steps.push(s);
					if (s < 10) under10++;
					if (q(i) === q(j)) merged5++;
				}
			}
		}
	steps.sort((a, b) => a - b);
	const p = (f) => steps[Math.floor(f * (steps.length - 1))];
	console.log(`body${B} edges ${edges} green step p10 ${p(0.1)} p25 ${p(0.25)} median ${p(0.5)}; steps<10: ${(100*under10/edges).toFixed(1)}%; five flat tones merge ${(100 * merged5 / edges).toFixed(1)}%`);
}
