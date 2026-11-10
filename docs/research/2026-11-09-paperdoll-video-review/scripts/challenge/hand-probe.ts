// Offline probe: how many extracted item px of worn items land on the frozen body's hand (skin px near the wrist keypoint)?
// Read-only on the bench corpus; imports production helpers.
import { readFileSync } from 'node:fs';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { runCase } = await import(APP + 'scripts/bench.ts');
const { isGarment } = await import(APP + 'src/lib/dress/regions.ts');
const cases = JSON.parse(readFileSync(new URL('test/fixtures/bench/cases.json', APP), 'utf8'));
const want = new Set(['torso_outer', 'back', 'feet']);
for (const c of cases) {
	if (!want.has(c.slot) || c.role === 'reference') continue;
	const body = JSON.parse(readFileSync(new URL(`test/fixtures/bench/body${c.body}.json`, APP), 'utf8'));
	const rig = body.rig,
		N = rig.cell.w,
		r = Math.max(2, Math.round((3 * N) / 64));
	const res = await runCase(c);
	let hand = 0,
		covered = 0,
		frames = 0,
		worst = 0;
	for (const cell of res.cells) {
		const [anim, dir, i] = cell.key.split('/');
		if (anim === 'rest') continue;
		const a = rig.animations.find((x: { id: string }) => x.id === anim);
		const kps = a?.sources?.[dir]?.keypoints?.[+i];
		if (!kps) continue;
		const C = cell.layer.w,
			pad = c.pad;
		let here = 0;
		for (const lab of ['RIGHT ARM', 'LEFT ARM']) {
			const k = kps.find((q: { label: string }) => q.label === lab);
			if (!k) continue;
			const kx = k.x * N + pad,
				ky = k.y * N + pad;
			for (let y = Math.floor(ky - r); y <= Math.ceil(ky + r); y++)
				for (let x = Math.floor(kx - r); x <= Math.ceil(kx + r); x++) {
					if (x < 0 || y < 0 || x >= C || y >= C) continue;
					if ((x + 0.5 - kx) ** 2 + (y + 0.5 - ky) ** 2 > r * r) continue;
					const p = (y * C + x) * 4,
						b = cell.base.data;
					if (!b[p + 3]) continue;
					const col = (b[p] << 16) | (b[p + 1] << 8) | b[p + 2];
					const L = (0.299 * b[p] + 0.587 * b[p + 1] + 0.114 * b[p + 2]) / 255;
					if (isGarment(col) || L < 0.25) continue; // skin only, not shorts/shirt or the outline
					hand++;
					if (cell.layer.data[p + 3]) {
						covered++;
						here++;
					}
				}
		}
		frames++; (globalThis.D ??= {})[c.id + " " + dir] = ((globalThis.D[c.id + " " + dir]) ?? 0) + here;
		worst = Math.max(worst, here);
	}
	console.log(
		`${c.id.padEnd(18)} ${c.slot.padEnd(12)} frames ${frames} hand-skin px ${hand} covered ${covered} (${((100 * covered) / (hand || 1)).toFixed(1)}%) worst/frame ${worst}`
	);
}
console.log(globalThis.D);
