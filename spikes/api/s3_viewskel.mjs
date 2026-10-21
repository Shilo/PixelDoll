// S3: draw estimated skeletons over their cells. usage: node s3_viewskel.mjs <out-name> <idPrefix,...>
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { canvasTo, scale } from './lib/img.mjs';
import { fromApi, drawPose } from './lib/skel.mjs';
import { sheet } from './lib/sheet.mjs';
const X = experiment('s3_skel');
const db = JSON.parse(fs.readFileSync(`${X.dir}/skel.json`));
const [name, prefixes] = process.argv.slice(2);
const S = 6, rows = [];
const load = id => { const m = id.match(/^(rot|walk|punch)_(\w+?)(?:_(\d+))?$/); const f = m ? (m[1] === 'rot' ? `../s2_base/b48_${m[2]}.png` : `../s2_base/b48${m[1]}_${m[2]}_${m[3]}.png`) : `../${id}.png`; const B = X.load(f); return B.w === 48 ? canvasTo(B, 64, 64, 8, 16) : B; };
for (const pre of prefixes.split(',')) {
  const ids = Object.keys(db).filter(k => k.startsWith(pre) && !k.includes('#'));
  rows.push(ids.map(id => { const B = load(id), im = scale(B, S); return drawPose(im, fromApi(db[id].kps, B.w, B.h), S); }));
}
X.save(`${name}.png`, sheet(rows, { s: 1, checker: 24 }));
