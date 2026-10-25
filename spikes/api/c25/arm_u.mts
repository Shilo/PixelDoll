// Round 2 arm U: the production blue key outside dress + walk. From the stored blue jester keyframes (round 1): slash E and N on
// body A, idle S and E on body B, and one inpaint-v3 grid repair (production gridReq layout) of body A walk east.
// Usage: C25_RUN=c25b C25_CAP=<cap> node --env-file=../../.env c25/arm_u.mts run|eval
import path from 'node:path';
import { items, chroma, clips, routes, paid, pool, b64, OUT, load, readOnly, type Img } from './lib.mts';
import { rigA, restA, baseA, DIRS } from './s4rig.mts';
import { rigB, baseB, restB, DRAWN } from './bodyB.mts';
const R1 = path.resolve(import.meta.dirname, '../out/c25'), PROMPT = 'a green and pink jester hat with three bells';
const kfA = (d: string) => load(`${R1}/K/jester/blue_s7.${DIRS.indexOf(d as any)}.png`), kfB = (d: string) => load(`${R1}/C/jester/blue_dress.${DRAWN.indexOf(d)}.png`);
async function pose(body: 'A' | 'B', anim: string, dir: string) {
  const rig: any = body === 'A' ? rigA() : rigB(), rest = rig.rest[dir].keypoints, poses = items.clipKeypoints(rig, anim, dir as any)!;
  const req = items.itemRoute.pose({ keyframePngB64: await b64(await (body === 'A' ? kfA : kfB)(dir)), rest, poses, item: PROMPT, slot: 'head', key: 'blue', anim, dir: dir as any, seed: 7, cell: rig.cell, pad: 0, view: rig.view });
  const out = await paid({ arm: 'U', label: `U ${body} ${anim}/${dir}`, file: `${OUT}/U/${body}_${anim}_${dir}`, req: req as any, estimate: 3, armCap: 45 });
  return out && items.unrotate(out, items.f0Last('head', rest, clips.paddedPoses(poses), rig.cell)).slice(0, poses.length);
}
async function grid() { // body A walk east: 8 blue mannequin cells (head-band masks) + the 3 dressed keyframes as kept references
  const rig: any = rigA(), skel = (k: any[]) => Object.fromEntries(k.map((p: any) => [p.label, { x: p.x * 64, y: p.y * 64 }]));
  const kp = items.clipKeypoints(rig, 'walk', 'east')!, cells = await Promise.all(kp.map(async (_, i) => chroma.toChroma(await baseA('east', 'walk', i), 'blue')));
  const masks = kp.map((k) => items.bandMask(items.bandOf('head', skel(k), 64), 64, 64)), refs = await Promise.all(DIRS.map(kfA));
  const g = items.packGrid([...cells, ...refs], [...masks, ...refs.map(() => null)]);
  const req = routes.routes.inpaintV3({ description: items.gridPrompt({ item: PROMPT, slot: 'head', key: 'blue', anim: 'walk', dir: 'east', n: 8, refs: [...DIRS], cell: { w: 64, h: 64 } }), inpainting_image: { image: routes.png(await b64(g.image)), size: { width: g.image.w, height: g.image.h } }, mask_image: { image: routes.png(await b64(g.mask)), size: { width: g.mask.w, height: g.mask.h } }, no_background: true, seed: 7 });
  const out = await paid({ arm: 'U', label: 'U A grid walk/east', file: `${OUT}/U/A_grid_walk_east`, req: req as any, estimate: 10, armCap: 45 });
  return out && items.cutGrid(out[0], 8, 64, 64);
}
const JOBS: ['A' | 'B', string, string][] = [['A', 'slash', 'east'], ['A', 'slash', 'north'], ['B', 'idle', 'south'], ['B', 'idle', 'east']];
if (import.meta.main) {
  if (process.argv[2] === 'run') await pool([...JOBS.map(([b, a, d]) => () => pose(b, a, d)), grid], 5);
  else { // eval: production extraction with key blue, per clip: G2/G3 and pink kept
    readOnly();
    const pink = (L: Img) => { let n = 0; for (let i = 0; i < L.data.length; i += 4) { const [r, g, b, a] = L.data.subarray(i, i + 4); if (a && r > g + 60 && r > b + 30 && b > g + 10) n++; } return n; };
    const report = (name: string, outs: Img[] | null, bases: Img[]) => {
      if (!outs) return console.log(name, 'missing');
      const cs = outs.map((o, i) => items.extractCell({ key: `x/${i}`, call: 0, base: bases[i], out: o, route: 'blue', band: { x: 0, y: 0, w: o.w, h: o.h }, posed: true }));
      console.log(`${name.padEnd(18)} G2 fails ${cs.filter(items.g2Fails).length}/${cs.length}, G3 max ${Math.max(...cs.map((c) => c.keyOutside ?? 0)).toFixed(3)}, pink px per frame ${(cs.reduce((s, c) => s + pink(c.layer), 0) / cs.length).toFixed(0)}, empty ${cs.filter((c) => !c.area).length}`);
    };
    for (const [b, a, d] of JOBS) report(`${b} ${a}/${d}`, await pose(b, a, d), await Promise.all(Array.from({ length: a === 'idle' ? 4 : 8 }, (_, i) => (b === 'A' ? baseA(d, a, i) : baseB(d, a, i)))));
    report('A grid walk/east', await grid(), await Promise.all(Array.from({ length: 8 }, (_, i) => baseA('east', 'walk', i))));
  }
}
