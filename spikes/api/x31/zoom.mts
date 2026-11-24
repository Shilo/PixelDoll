// 0 gens: recompose chosen cells (real body + saved layer) side by side at 4x for inspection.
import path from 'node:path';
import * as L from './lib.mts';
const picks = process.argv.slice(2); // id:seed:key
const ims: L.Img[] = [];
for (const p of picks) {
	const [id, seed, key] = p.split(':');
	const [anim, d, i] = key.split('/');
	const body = (await L.bodyFrames(anim, d as L.Dir))[+i];
	const layer = key === 'ref' ? null : await L.load(path.join(L.OUT, L.TAG + 'eiv2-all', `${id}.s${seed}.layer.${key.replace(/\//g, '_')}.png`));
	const o = L.blank(body.w, body.h);
	const over = (s: L.Img) => { for (let q = 0; q < o.w * o.h; q++) if (s.data[q * 4 + 3]) o.data.set(s.data.subarray(q * 4, q * 4 + 4), q * 4); };
	over(body); if (layer) over(layer);
	ims.push(L.opaqueBg(o, [205, 210, 220]));
}
const g = L.pack(ims, ims[0].w, ims[0].h, ims.length);
const k = 4, z = L.blank(g.w * k, g.h * k);
for (let y = 0; y < z.h; y++) for (let x = 0; x < z.w; x++) z.data.set(g.data.subarray((((y / k) | 0) * g.w + ((x / k) | 0)) * 4, (((y / k) | 0) * g.w + ((x / k) | 0)) * 4 + 4), (y * z.w + x) * 4);
await L.save(path.join(L.OUT, `${L.TAG}zoom.png`), z);
