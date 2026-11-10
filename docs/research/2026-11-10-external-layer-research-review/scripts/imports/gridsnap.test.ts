// Offline audit: synthetic off-grid inputs through the real import helpers + a tiny grid detector prototype.
// Run from app/: npx vitest run --config <scratch>/vitest.scratch.config.mjs
import { test } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
const APP = '<SCRATCH>/imports/app';
const OUT = '<SCRATCH>/imports';
const { makeImg } = await import(`${APP}/src/lib/image/png.ts`);
const { decodePngBytes, encodePngBytes } = await import(`${APP}/src/lib/image/pngraw.ts`);
const { readCharacterZip } = await import(`${APP}/src/lib/store/import.ts`);
const { zip } = await import(`${APP}/src/lib/store/zip.ts`);
const { skeletonInput } = await import(`${APP}/src/lib/rig/estimate.ts`);
type Img = { w: number; h: number; data: Uint8ClampedArray };

// ---------- fixture sprites ----------
const FX = `${APP}/public/fixtures/s2/layers`;
const LAYERS = ['body/base', 'torso_inner/vest_leather', 'hair/hair_brown', 'head/hat_wizard', 'main_hand/sword_steel'];
const cell = (sheet: Img, c: number, r: number) => {
	const o = makeImg(64, 64);
	for (let y = 0; y < 64; y++)
		o.data.set(sheet.data.subarray(((r * 64 + y) * sheet.w + c * 64) * 4, ((r * 64 + y) * sheet.w + c * 64 + 64) * 4), y * 256);
	return o as Img;
};
const over = (dst: Img, src: Img) => {
	for (let i = 0; i < dst.data.length; i += 4) if (src.data[i + 3] >= 128) dst.data.set(src.data.subarray(i, i + 4), i);
};
const opaque = (im: Img) => {
	let n = 0;
	for (let i = 3; i < im.data.length; i += 4) if (im.data[i]) n++;
	return n;
};

// ---------- degradations ----------
const px = (im: Img, x: number, y: number) => im.data.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4);
function nn(src: Img, s: number, off = 0): Img {
	const W = Math.round(src.w * s) + off, H = Math.round(src.h * s) + off, o = makeImg(W, H) as Img;
	for (let y = off; y < H; y++)
		for (let x = off; x < W; x++) {
			const sx = Math.floor((x - off) / s), sy = Math.floor((y - off) / s);
			if (sx < src.w && sy < src.h) o.data.set(px(src, sx, sy), (y * W + x) * 4);
		}
	return o;
}
function gauss(src: Img, sigma: number, channels = [0, 1, 2, 3]): Img {
	const r = Math.ceil(sigma * 3), k: number[] = [];
	for (let i = -r; i <= r; i++) k.push(Math.exp((-i * i) / (2 * sigma * sigma)));
	const sum = k.reduce((a, b) => a + b);
	const pass = (im: Img, dx: number, dy: number) => {
		const o = { w: im.w, h: im.h, data: new Uint8ClampedArray(im.data) } as Img;
		for (let y = 0; y < im.h; y++)
			for (let x = 0; x < im.w; x++) {
				// premultiplied for RGB so transparent black does not bleed in
				let a = 0, c = [0, 0, 0];
				for (let i = -r; i <= r; i++) {
					const xx = Math.min(im.w - 1, Math.max(0, x + i * dx)), yy = Math.min(im.h - 1, Math.max(0, y + i * dy));
					const p = px(im, xx, yy), wgt = k[i + r] / sum;
					a += p[3] * wgt;
					for (let ch = 0; ch < 3; ch++) c[ch] += p[ch] * p[3] * wgt;
				}
				const j = (y * im.w + x) * 4;
				for (let ch = 0; ch < 3; ch++) if (channels.includes(ch) && a > 0) o.data[j + ch] = c[ch] / a;
				if (channels.includes(3)) o.data[j + 3] = a;
			}
		return o;
	};
	return pass(pass(src, 1, 0), 0, 1);
}
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const gaussRnd = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
function noise(src: Img, sigma: number): Img {
	const o = { w: src.w, h: src.h, data: new Uint8ClampedArray(src.data) } as Img;
	for (let i = 0; i < o.data.length; i += 4) if (o.data[i + 3]) for (let c = 0; c < 3; c++) o.data[i + c] += gaussRnd() * sigma;
	return o;
}
function flatten(src: Img, bg = [255, 255, 255]): Img {
	const o = makeImg(src.w, src.h) as Img;
	for (let i = 0; i < o.data.length; i += 4) {
		const a = src.data[i + 3] / 255;
		for (let c = 0; c < 3; c++) o.data[i + c] = src.data[i + c] * a + bg[c] * (1 - a);
		o.data[i + 3] = 255;
	}
	return o;
}
// JPEG-like: per-channel 8x8 DCT with the standard luminance table at ~q75 (no chroma subsampling, no alpha change).
const Q = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99].map((q) => Math.max(1, Math.round(q * 0.5)));
function jpegish(src: Img): Img {
	const o = { w: src.w, h: src.h, data: new Uint8ClampedArray(src.data) } as Img;
	const C = (u: number) => (u ? 1 : Math.SQRT1_2);
	for (let by = 0; by < src.h; by += 8)
		for (let bx = 0; bx < src.w; bx += 8)
			for (let ch = 0; ch < 3; ch++) {
				const b = (x: number, y: number) => px(src, Math.min(src.w - 1, bx + x), Math.min(src.h - 1, by + y))[ch] - 128;
				const F = new Float64Array(64);
				for (let v = 0; v < 8; v++)
					for (let u = 0; u < 8; u++) {
						let s = 0;
						for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) s += b(x, y) * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
						const q = Q[v * 8 + u];
						F[v * 8 + u] = Math.round((0.25 * C(u) * C(v) * s) / q) * q;
					}
				for (let y = 0; y < 8 && by + y < src.h; y++)
					for (let x = 0; x < 8 && bx + x < src.w; x++) {
						let s = 0;
						for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) s += C(u) * C(v) * F[v * 8 + u] * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
						o.data[((by + y) * src.w + bx + x) * 4 + ch] = 0.25 * s + 128;
					}
			}
	return o;
}

// ---------- grid detector prototype ----------
// 1. Edge votes per axis: a step >= 32 (max RGBA channel difference) that is a local maximum along the scan line
//    (non-max suppression keeps a blurred step on one position). votes[x] counts rows with an edge between x-1 and x.
// 2. For each scale s (integer 2..16, fractional 1.5..12 step 0.05) and phase p, f = share of votes within the lattice
//    tolerance (edge at ceil(p + k*s), a 1 px window per period for any s). A native sprite scores about 1/s; an s-upscale scores ~1 at s and
//    at its divisors, ~0.5 at 2s. Pick the LARGEST integer s with f >= 0.8 on both axes (fractional only if no integer),
//    supported by >= 6 distinct lattice lines per axis (a plain rectangle is ambiguous, so it stays native).
function votes(im: Img, thr = 32) {
	const vx = new Float64Array(im.w + 1), vy = new Float64Array(im.h + 1);
	const d = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
		const both = a[3] >= 128 && b[3] >= 128 ? 1 : 0;
		return Math.max(Math.abs(a[0] - b[0]) * both, Math.abs(a[1] - b[1]) * both, Math.abs(a[2] - b[2]) * both, Math.abs(a[3] - b[3]));
	};
	const scan = (n: number, len: number, get: (i: number, k: number) => Uint8ClampedArray, out: Float64Array) => {
		for (let i = 0; i < n; i++) {
			const diff = new Float64Array(len + 1);
			for (let k = 1; k < len; k++) diff[k] = d(get(i, k - 1), get(i, k));
			for (let k = 1; k < len; k++) if (diff[k] >= thr && diff[k] >= diff[k - 1] && diff[k] > diff[k + 1]) out[k]++;
		}
	};
	scan(im.h, im.w, (y, x) => px(im, x, y), vx);
	scan(im.w, im.h, (x, y) => px(im, x, y), vy);
	return { vx, vy };
}
function axisFit(v: Float64Array, s: number) {
	const total = v.reduce((a, b) => a + b, 0) || 1, int = Number.isInteger(s);
	let best = { f: 0, p: 0, lines: 0 };
	for (let p = 0; p < s; p += int ? 1 : 0.25) {
		let on = 0, lines = 0;
		for (let x = 0; x < v.length; x++) {
			if (!v[x]) continue;
			const m = (((x - p) % s) + s) % s;
			if (m < 1 - 1e-9) { on += v[x]; lines++; } // NN rounding puts a fractional edge at ceil(p + k*s)
		}
		if (on / total > best.f) best = { f: on / total, p, lines };
	}
	return best;
}
export function detect(im: Img) {
	const { vx, vy } = votes(im);
	const fit = (s: number) => {
		const ax = axisFit(vx, s), ay = axisFit(vy, s);
		return { s, f: Math.min(ax.f, ay.f), px: ax.p, py: ay.p, ok: ax.f >= 0.8 && ay.f >= 0.8 && ax.lines >= 6 && ay.lines >= 6 };
	};
	const ints: ReturnType<typeof fit>[] = [], fracs: ReturnType<typeof fit>[] = [];
	for (let s = 2; s <= Math.min(16, im.w / 8); s++) ints.push(fit(s));
	const intHit = ints.filter((r) => r.ok).pop();
	if (intHit) return { ...intHit, c: intHit.f };
	for (let s = 2; s <= Math.min(12, im.w / 8); s += 0.05) if (Math.abs(s - Math.round(s)) > 0.02) fracs.push(fit(+s.toFixed(2)));
	const fr = fracs.filter((r) => r.ok).sort((a, b) => b.f - a.f || a.s - b.s)[0];
	if (fr) return { ...fr, c: fr.f };
	const best = [...ints, ...fracs].sort((a, b) => b.f - a.f)[0];
	return { s: 1, px: 0, py: 0, c: best?.f ?? 0 };
}

// Majority alpha + per-channel median RGB of each cell's interior (1 px inset when s >= 3, against blur).
export function snap(im: Img, g: { s: number; px: number; py: number }): Img {
	const nw = Math.floor((im.w - g.px) / g.s), nh = Math.floor((im.h - g.py) / g.s), o = makeImg(nw, nh) as Img;
	const inset = g.s >= 3 ? 1 : 0;
	for (let j = 0; j < nh; j++)
		for (let i = 0; i < nw; i++) {
			const x0 = Math.round(g.px + i * g.s) + inset, x1 = Math.round(g.px + (i + 1) * g.s) - inset;
			const y0 = Math.round(g.py + j * g.s) + inset, y1 = Math.round(g.py + (j + 1) * g.s) - inset;
			const ch: number[][] = [[], [], []];
			let on = 0, all = 0;
			for (let y = y0; y < y1; y++)
				for (let x = x0; x < x1; x++) {
					const p = px(im, x, y);
					all++;
					if (p[3] >= 128) { on++; for (let c = 0; c < 3; c++) ch[c].push(p[c]); }
				}
			if (on * 2 <= all) continue;
			const med = (a: number[]) => a.sort((m, n) => m - n)[a.length >> 1];
			o.data.set([med(ch[0]), med(ch[1]), med(ch[2]), 255], (j * nw + i) * 4);
		}
	return o;
}
const colors = (im: Img) => {
	const s = new Set<number>();
	for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3] >= 128) s.add((im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2]);
	return s.size;
};
const semi = (im: Img) => {
	let n = 0;
	for (let i = 3; i < im.data.length; i += 4) if (im.data[i] > 0 && im.data[i] < 255) n++;
	return n;
};
// Exact (alpha agree + RGB within tol) over the union of opaque pixels in either image.
function accuracy(gt: Img, got: Img, tol: number) {
	let n = 0, ok = 0;
	for (let y = 0; y < gt.h; y++)
		for (let x = 0; x < gt.w; x++) {
			const a = px(gt, x, y), b = x < got.w && y < got.h ? px(got, x, y) : new Uint8ClampedArray(4);
			const ao = a[3] >= 128, bo = b[3] >= 128;
			if (!ao && !bo) continue;
			n++;
			if (ao === bo && (!ao || Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) <= tol)) ok++;
		}
	return n ? ok / n : 1;
}

test('grid audit', { timeout: 600_000 }, async () => {
	const sheets = new Map<string, Img>();
	for (const l of LAYERS) for (const mv of ['walk', 'cross-punch']) {
		try { sheets.set(`${l}/${mv}`, await decodePngBytes(await readFile(`${FX}/${l}/main/${mv}.png`))); } catch { /* hat has no cross-punch sheet */ }
	}
	sheets.set('back/cape_red/walk', await decodePngBytes(await readFile(`${FX}/back/cape_red/main/walk.png`)));
	// Dressed composites: body + vest + hair + hat + sword, walk frame 0, rows south/east/north (+ west = east flipped).
	const dressed = (c: number, r: number) => {
		const o = makeImg(64, 64) as Img;
		for (const l of LAYERS) over(o, cell(sheets.get(`${l}/walk`)!, c, r));
		return o;
	};
	const flip = (im: Img) => {
		const o = makeImg(im.w, im.h) as Img;
		for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) o.data.set(px(im, x, y), (y * im.w + im.w - 1 - x) * 4);
		return o;
	};
	const views = { south: dressed(0, 0), east: dressed(0, 1), north: dressed(0, 2), west: flip(dressed(0, 1)) };
	await writeFile(`${OUT}/native-south.png`, await encodePngBytes(views.south));

	const variants: [string, (im: Img) => Img, { s: number; px: number; py: number } | null, number][] = [
		['native 1x', (im) => im, { s: 1, px: 0, py: 0 }, 0],
		['native 1x + AA alpha', (im) => gauss(im, 0.6, [3]), { s: 1, px: 0, py: 0 }, 0],
		['NN x2', (im) => nn(im, 2), { s: 2, px: 0, py: 0 }, 0],
		['NN x3', (im) => nn(im, 3), { s: 3, px: 0, py: 0 }, 0],
		['NN x4', (im) => nn(im, 4), { s: 4, px: 0, py: 0 }, 0],
		['NN x4 +1px offset', (im) => nn(im, 4, 1), { s: 4, px: 1, py: 1 }, 0],
		['NN x3.5', (im) => nn(im, 3.5), { s: 3.5, px: 0, py: 0 }, 0],
		['x4 + blur s0.7', (im) => gauss(nn(im, 4), 0.7), { s: 4, px: 0, py: 0 }, 12],
		['x4 + noise s8', (im) => noise(nn(im, 4), 8), { s: 4, px: 0, py: 0 }, 12],
		['x4 + AA alpha edges', (im) => gauss(nn(im, 4), 1.0, [3]), { s: 4, px: 0, py: 0 }, 0],
		['x4 + JPEG-like (alpha kept)', (im) => jpegish(nn(im, 4)), { s: 4, px: 0, py: 0 }, 24],
		['x4 JPEG-like on white (opaque)', (im) => jpegish(flatten(nn(im, 4))), null, 24]
	];
	const lines: string[] = [];
	const log = (s: string) => { lines.push(s); console.log(s); };
	log('| input | canvas | app import result | cell | colors in | semi px | skeleton bucket | detected s/phase | snap acc (S) |');
	for (const [name, f, truth, tol] of variants) {
		seed = 7;
		const imgs = Object.fromEntries(Object.entries(views).map(([d, im]) => [d, f(im)])) as Record<string, Img>;
		if (name === 'NN x4') await writeFile(`${OUT}/x4-south.png`, await encodePngBytes(imgs.south));
		const files = [
			{ name: 'metadata.json', data: new TextEncoder().encode(JSON.stringify({ character: { id: 'synthetic', name: name, size: { width: imgs.south.w, height: imgs.south.h } }, frames: { rotations: Object.fromEntries(Object.keys(imgs).map((d) => [d, `rotations/${d}.png`])), animations: {} } })) },
			...(await Promise.all(Object.entries(imgs).map(async ([d, im]) => ({ name: `rotations/${d}.png`, data: await encodePngBytes(im) }))))
		];
		let result: string, cellSize = '-', bucket = '-';
		try {
			const r = await readCharacterZip(await zip(files));
			const c = r.project.manifest.rig.cell;
			cellSize = `${c.w}`;
			const rest = r.project.images.get(r.project.manifest.items[0].layers[0].cells!.default!.south![0]!)!;
			result = `accepted (${r.warnings.length - 1} extra warning${r.warnings.length === 2 ? '' : 's'}${r.warnings.length > 1 ? ': ' + r.warnings.slice(1).join(' / ') : ''}); stored colors ${colors(rest)}`;
			try { bucket = `${skeletonInput(rest).image.w}`; } catch (e) { bucket = (e as Error).message; }
		} catch (e) {
			result = `rejected: ${(e as Error).message}`;
		}
		const g = detect(imgs.south);
		let acc = '-';
		if (truth && truth.s > 1 && g.s > 1) {
			const ref = truth.s === 3.5 ? views.south : views.south;
			acc = `${(100 * accuracy(ref, snap(imgs.south, g), tol)).toFixed(1)}%`;
		} else if (truth && truth.s === 1) acc = g.s === 1 ? 'n/a (correctly 1)' : 'FALSE POSITIVE';
		else if (!truth && g.s > 1) acc = `${(100 * accuracy(views.south, snap(imgs.south, g), tol)).toFixed(1)}% (bg kept)`;
		log(`| ${name} | ${imgs.south.w} | ${result} | ${cellSize} | ${colors(imgs.south)} | ${semi(imgs.south)} | ${bucket} | ${g.s}/${g.px},${g.py} (f=${g.c.toFixed(2)}) | ${acc} |`);
	}
	// False positives on genuine native cells: every non-trivial cell of every fixture sheet + dressed composites.
	let total = 0, fp = 0;
	const fps: string[] = [];
	for (const [key, sh] of sheets)
		for (let r = 0; r < sh.h / 64; r++)
			for (let c = 0; c < sh.w / 64; c++) {
				const im = cell(sh, c, r);
				if (opaque(im) < 20) continue;
				total++;
				const g = detect(im);
				if (g.s !== 1) { fp++; fps.push(`${key}[${c},${r}] s=${g.s} f=${g.c.toFixed(2)}`); }
			}
	for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) { total++; const g = detect(dressed(c, r)); if (g.s !== 1) { fp++; fps.push(`dressed[${c},${r}] s=${g.s}`); } }
	log(`\nNative false positives: ${fp}/${total}`);
	for (const s of fps.slice(0, 20)) log('  ' + s);
	// Robustness sweep: detector over all 24 dressed frames at each degradation.
	log('\n| degradation (24 dressed walk frames) | scale+phase correct | mean snap acc |');
	for (const [name, f, truth, tol] of variants.slice(2)) {
		let ok = 0, accSum = 0;
		for (let r = 0; r < 3; r++)
			for (let c = 0; c < 8; c++) {
				seed = 7 + r * 8 + c;
				const src = dressed(c, r), im = f(src), g = detect(im);
				const t = truth ?? { s: 4, px: 0, py: 0 };
				if (Math.abs(g.s - t.s) < 0.06 && Math.abs(g.px - t.px) < 0.6 && Math.abs(g.py - t.py) < 0.6) ok++;
				accSum += g.s > 1 ? accuracy(src, snap(im, g), tol) : 0;
			}
		log(`| ${name} | ${ok}/24 | ${(100 * accSum / 24).toFixed(1)}% |`);
	}
	await writeFile(`${OUT}/results.md`, lines.join('\n'));
});
