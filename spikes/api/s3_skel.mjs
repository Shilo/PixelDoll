// S3/K4: estimate-skeleton on frozen 48->64 padded rig cells (or any cell list). Results merged into out/s3_skel/skel.json.
// usage: node --env-file=../../.env s3_skel.mjs [glob-ish prefix list, comma sep, relative to out/] [repeat=1]
//   default = b48 rotations S/E/N + walk S/E/N + punch S/E from out/s2_base (padded x+8,y+16).
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { toB64, canvasTo } from './lib/img.mjs';
import { b64img } from './lib/api.mjs';
const X = experiment('s3_skel');
const file = `${X.dir}/skel.json`, db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {};
const [spec, rep = '1'] = process.argv.slice(2);
// cell list: id -> image (64x64)
const cells = [];
const pad = B => B.w === 48 ? canvasTo(B, 64, 64, 8, 16) : B;
if (!spec) {
  for (const d of ['south', 'east', 'north']) cells.push({ id: `rot_${d}`, B: pad(X.load(`../s2_base/b48_${d}.png`)) });
  for (const [a, dirs] of [['walk', ['south', 'east', 'north']], ['punch', ['south', 'east']]]) for (const d of dirs)
    for (let i = 0; fs.existsSync(`${X.dir}/../s2_base/b48${a}_${d}_${i}.png`); i++) cells.push({ id: `${a}_${d}_${i}`, B: pad(X.load(`../s2_base/b48${a}_${d}_${i}.png`)) });
} else {
  for (const pre of spec.split(',')) { const [dir, base] = [pre.split('/').slice(0, -1).join('/'), pre.split('/').pop()];
    for (const f of fs.readdirSync(`${X.dir}/../${dir}`).filter(f => f.startsWith(base) && f.endsWith('.png')).sort()) cells.push({ id: `${dir}/${f.replace('.png', '')}`, B: pad(X.load(`../${dir}/${f}`)) }); }
}
const todo = []; for (const c of cells) for (let r = 0; r < +rep; r++) todo.push({ ...c, key: +rep > 1 ? `${c.id}#${r}` : c.id });
const t0 = Date.now(), lat = [];
async function worker() {
  while (todo.length) {
    const c = todo.shift(); if (db[c.key]) continue;
    const s = Date.now();
    const r = await X.api.post('/estimate-skeleton', { image: b64img(toB64(c.B)) });
    lat.push(Date.now() - s);
    db[c.key] = { w: c.B.w, h: c.B.h, kps: r.keypoints, usage: r.usage };
  }
}
await Promise.all([worker(), worker(), worker()]);
fs.writeFileSync(file, JSON.stringify(db, null, 1));
lat.sort((a, b) => a - b);
console.log(JSON.stringify({ calls: lat.length, ms: Date.now() - t0, medianMs: lat[lat.length >> 1], maxMs: lat[lat.length - 1], usage: Object.values(db).slice(-1)[0]?.usage }));
