// ---------- grid detector prototype ----------
// 1. Edge votes per axis: a step >= 32 (max RGBA channel difference) that is a local maximum along the scan line
//    (non-max suppression keeps a blurred step on one position). votes[x] counts rows with an edge between x-1 and x.
// 2. For each scale s (integer 2..16, fractional 1.5..12 step 0.05) and phase p, f = share of votes within the lattice
//    tolerance (0 px integer, 0.5 px fractional). A native sprite scores about 1/s; an s-upscale scores ~1 at s and
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
			if (Math.min(m, s - m) <= (int ? 0 : 0.5)) { on += v[x]; lines++; }
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
	for (let s = 1.5; s <= Math.min(12, im.w / 8); s += 0.05) if (Math.abs(s - Math.round(s)) > 0.02) fracs.push(fit(+s.toFixed(2)));
	const fr = fracs.filter((r) => r.ok).sort((a, b) => b.f - a.f || a.s - b.s)[0];
	if (fr) return { ...fr, c: fr.f };
	const best = [...ints, ...fracs].sort((a, b) => b.f - a.f)[0];
	return { s: 1, px: 0, py: 0, c: best?.f ?? 0 };
}
