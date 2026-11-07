// Free: export the frozen bench dressed keyframes (raw chroma composites the pose call sends as first_frame) and the
// stored rest keypoints, for the E1 estimate-skeleton check. Run from the repo root: node <this file> <out.json>
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { runPipe } from './extraction/bench-replay.ts';
import { FIX } from './extraction/lib.ts';
import { encodePngBytes } from '../../../../app/src/lib/image/pngraw.ts';
import { bytesToBase64 } from '../../../../app/src/lib/image/png.ts';
import { createHash } from 'node:crypto';
const ids = ['a-cape', 'a-chest', 'b-cloak', 'b-tunic', 'a-helmet'];
const cases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8'));
const bodies: Record<string, any> = {};
const out: unknown[] = [];
for (const id of ids) {
  const c = cases.find((x: any) => x.id === id), run = await runPipe(c);
  const b = bodies[c.body] ??= JSON.parse(readFileSync(new URL(`body${c.body}.json`, FIX), 'utf8'));
  for (const k of run.kf) {
    const dir = k.key.split('/')[1];
    if (dir !== 'south' && dir !== 'east') continue;
    const bytes = await encodePngBytes(k.out), sha = createHash('sha256').update(bytes).digest('hex');
    out.push({ id, dir, w: k.out.w, h: k.out.h, sha, png: bytesToBase64(bytes), rest: b.rig.rest[dir].keypoints });
  }
}
for (const body of ['A', 'B']) for (const dir of ['south', 'east']) {
  const r = await runPipe({ ...cases.find((x: any) => x.body === body && !x.pad), clips: [] });
  const k = r.kf.find((x) => x.key === `rest/${dir}/0`)!;
  const bytes = await encodePngBytes(k.base), sha = createHash('sha256').update(bytes).digest('hex');
  out.push({ id: `body${body}-bare`, dir, w: k.base.w, h: k.base.h, sha, png: bytesToBase64(bytes), rest: (bodies[body] ??= JSON.parse(readFileSync(new URL(`body${body}.json`, FIX), 'utf8'))).rig.rest[dir].keypoints });
}
writeFileSync(process.argv[2], JSON.stringify(out));
console.log(out.map((o: any) => `${o.id} ${o.dir} ${o.w}x${o.h} ${o.sha.slice(0, 12)}`).join('\n'));
