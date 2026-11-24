// Offline: how standing-like is each frame of the stored described (P) loop motions? Silhouette IoU against the standing
// reference on the same canvas. No network.
import fs from 'node:fs';
import path from 'node:path';
import './env.mts';
import { load } from '../c25/lib.mts';
import { fixture } from './arms.mts';
import { decodePngBytes } from '../../../app/src/lib/image/pngraw.ts';
const OUT = path.resolve(import.meta.dirname, '../out/mocap-salvage-2026-11-23');
const bench = JSON.parse(fs.readFileSync(path.join(OUT, 'benchmark84.json'), 'utf8'));
const iou = (a: any, b: any) => { let i = 0, u = 0; for (let p = 0; p < a.w * a.h; p++) { const x = a.data[p * 4 + 3] > 127, y = b.data[p * 4 + 3] > 127; i += +(x && y); u += +(x || y); } return i / u; };
for (const [set, fx] of [['run', bench], ['run-follow', bench], ['bench-walk', bench], ['chibi-run', fixture('chibi')]] as const) {
  for (const f of fs.readdirSync(path.join(OUT, set)).filter((f) => /^Pmotion_.*\.norm\.0\.png$/.test(f))) {
    const stem = f.replace('.norm.0.png', ''), dir = stem.split('_')[1];
    const ref = await decodePngBytes(new Uint8Array(Buffer.from(fx.references[dir].png, 'base64')));
    const vals = [];
    for (let i = 0; fs.existsSync(path.join(OUT, set, `${stem}.norm.${i}.png`)); i++) vals.push(iou(await load(path.join(OUT, set, `${stem}.norm.${i}.png`)), ref).toFixed(2));
    console.log(set.padEnd(11), stem.padEnd(24), vals.join(' '));
  }
}
