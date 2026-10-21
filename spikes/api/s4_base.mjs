// S4/Q1: base character — create-character-v3 vs create-character-pro-flash (new models only).
// usage: node --env-file=../../.env s4_base.mjs <tag> <v3|pf> <size> [seed=4321]
// Rotations -> out/s4_base/<tag>_<dir>.png; metrics -> out/s4_base/bases.jsonl. Costs from job usage (balance is shared with S3).
import fs from 'node:fs';
import { experiment, imagesOf } from './lib/run.mjs';
import { sheet } from './lib/sheet.mjs';
import { bbox, opaqueCount, colors } from './lib/img.mjs';
const X = experiment('s4_base');
const [tag, route, size, seed = '4321'] = process.argv.slice(2);
const s = +size;
// same clothed prompt as S2 (policy-safe: t-shirt + shorts)
const DESC = 'plain bald human mannequin for a paperdoll base, light skin tone, wearing a plain grey t-shirt and plain grey shorts, barefoot, no hair, no accessories, neutral standing pose with arms slightly away from the torso' + (process.env.S4_DESC_EXTRA || '');
const body = { description: DESC, image_size: { width: s, height: s }, view: 'low top-down', template_id: 'mannequin', seed: +seed, ...(route === 'pf' ? {} : { no_background: true }) };
const t0 = Date.now();
const r = await X.api.run(route === 'pf' ? '/create-character-pro-flash' : '/create-character-v3', body);
const cid = r.res.character_id || r.jobs[0]?.last_response?.character_id;
X.saveJson(`${tag}_job.json`, { res: r.res, jobs: r.jobs });
const ch = await X.api.get(`/characters/${cid}`);
X.saveJson(`${tag}_character.json`, ch);
const ims = [], dirs = {};
for (const [d, u] of Object.entries(ch.rotation_urls || {}).filter(([, u]) => u)) {
  const [{ im }] = await imagesOf(u); X.save(`${tag}_${d}.png`, im); ims.push(im);
  const b = bbox(im); dirs[d] = { size: `${im.w}x${im.h}`, bbox: b, headroom: b.y, feetY: b.y + b.h - 1, height: b.h, opaque: opaqueCount(im), colors: colors(im).size };
}
X.save(`${tag}_sheet.png`, sheet([ims], { s: 4 }));
const rec = { tag, route, size: s, seed: +seed, cid, ms: Date.now() - t0, usage: r.jobs.map(j => j.usage), billing: r.jobs.map(j => j.last_response?.billing_stages), storedSize: ch.size, dirs };
fs.appendFileSync(`${X.dir}/bases.jsonl`, JSON.stringify(rec) + '\n');
console.log(JSON.stringify(rec, null, 1));
