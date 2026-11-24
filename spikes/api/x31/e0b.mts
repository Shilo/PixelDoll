// E0b (0 gens): can the skeleton layer's shift be found without a truth layer? Candidate rule: the +-4 px integer shift that
// maximizes (item px on the real body) - (item px off the body). Compared with the truth-derived shift from e0.json.
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mts';
const e0 = JSON.parse(fs.readFileSync(path.join(L.OUT, 'e0.json'), 'utf8')).rows;
const W = L.rig.cell.w, H = L.rig.cell.h;
let agree = 0, n = 0;
for (const r of e0) {
	const [d, i] = r.key.split('/'), it = L.item(r.id);
	const ls = await Promise.all(it.layers.map((l: any) => L.blob(l.cells.walk[d][+i])));
	const body = (await L.bodyFrames('walk', d))[+i];
	let best = { dx: 0, dy: 0, v: -1e9 };
	for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
		let v = 0;
		for (const l of ls) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
			if (!l.data[(y * W + x) * 4 + 3]) continue;
			const X = x + dx, Y = y + dy, on = X >= 0 && Y >= 0 && X < W && Y < H && body.data[(Y * W + X) * 4 + 3] > 0;
			v += on ? 1 : -1;
		}
		if (v > best.v) best = { dx, dy, v };
	}
	const ok = best.dx === r.shift[0] && best.dy === r.shift[1];
	agree += +ok; n++;
	console.log(r.id.padEnd(18), r.key.padEnd(8), 'truth', JSON.stringify(r.shift), 'silhouette rule', JSON.stringify([best.dx, best.dy]), ok ? 'same' : '');
}
console.log(`silhouette rule matches the truth shift on ${agree}/${n} frames`);
