// One-off: freezes the item-pipeline benchmark corpus (app/test/fixtures/bench/) from stored real PixelLab outputs in the
// git-ignored spikes/api/out (v0.1.0 evidence: `git archive 1f95029 spikes/api/out/<dir> | tar -x` restores a missing folder;
// campaign outputs: out/c25). `node scripts/bench-freeze.ts`. Re-run only to add cases; never to change existing labels.
// Layout: one PNG per body (row per drawn direction: rest view, then every clip's frames) and per case (row per clip-direction:
// the dressed keyframe of that direction, then the posed outputs; dress-only cases have one row of keyframes).
// Labels are sparse and rule-based on the RAW outputs, never on a current mask: KEEP = pixels that must ship, DROP = must not.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { decodePngBytes, encodePngBytes } from '../src/lib/image/pngraw.ts';
import { makeImg, type Img } from '../src/lib/image/png.ts';
import { keyScore, KT, components } from '../src/lib/image/chroma.ts';

const SPIKE = new URL('../../spikes/api/out/', import.meta.url), OUT = new URL('../test/fixtures/bench/', import.meta.url);
const has = (p: string) => existsSync(new URL(p, SPIKE));
const load = async (p: string): Promise<Img> => decodePngBytes(new Uint8Array(readFileSync(new URL(p, SPIKE))));
const pad = (im: Img, C: number) => { if (im.w === C) return im; const o = makeImg(C, C), d = (C - im.w) / 2; for (let y = 0; y < im.h; y++) o.data.set(im.data.subarray(y * im.w * 4, (y + 1) * im.w * 4), ((y + d) * C + d) * 4); return o; };
function tile(rows: Img[][], C: number): Img {
  const cols = Math.max(...rows.map((r) => r.length)), o = makeImg(cols * C, rows.length * C);
  rows.forEach((r, ry) => r.forEach((im, cx) => { for (let y = 0; y < C; y++) o.data.set(im.data.subarray(y * C * 4, (y + 1) * C * 4), ((ry * C + y) * o.w + cx * C) * 4); }));
  return o;
}
const runs = (m: Uint8Array) => { const r: number[][] = []; for (let p = 0; p < m.length; p++) if (m[p]) { if (r.length && r.at(-1)![0] + r.at(-1)![1] === p) r.at(-1)![1]++; else r.push([p, 1]); } return r; };
mkdirSync(OUT, { recursive: true });
const save = async (name: string, im: Img) => writeFileSync(new URL(name, OUT), await encodePngBytes(im));
const DIRS_A = ['south', 'east', 'north'];

// ---------- bodies ----------
const req = (clip: string, d: string) => JSON.parse(readFileSync(new URL(`s3_k1/${clip === 'walk' ? `walk_${d}_v3tpl_s7` : `slash_${d}_v3_s7`}.req.json`, SPIKE), 'utf8'));
const toRig = (k: Record<string, { x: number; y: number }>) => Object.entries(k).map(([label, p]) => ({ label, x: +(p.x / 64).toFixed(5), y: +(p.y / 64).toFixed(5) }));
const rigA = { view: 'low top-down', cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, baseItem: 'base', baseHash: 'sha256:bench-a', directions: DIRS_A.map((id) => ({ id })),
  rest: Object.fromEntries(DIRS_A.map((d) => [d, { image: 'sha256:bench', keypoints: toRig(req('walk', d).rest) }])),
  animations: ['walk', 'slash'].map((id) => ({ id, cells: 8, loop: true, frames: Array.from({ length: 8 }, (_, cell) => ({ cell, ms: 100 })), sources: Object.fromEntries(DIRS_A.map((d) => [d, { keypoints: req(id, d).poses.map(toRig) }])) })) };
writeFileSync(new URL('bodyA.json', OUT), JSON.stringify({ note: 'S2 48 px body padded to 64 (S3/S4 raw skeleton-v3 walk + authored slash); rows south, east, north: rest, walk 0-7, slash 0-7', rig: rigA, rows: DIRS_A, cols: ['rest', ...Array.from({ length: 8 }, (_, i) => `walk/${i}`), ...Array.from({ length: 8 }, (_, i) => `slash/${i}`)] }));
await save('bodyA.png', tile(await Promise.all(DIRS_A.map(async (d) => [await load(`s3_k6/rot_base_${d}.png`), ...(await Promise.all(Array.from({ length: 16 }, (_, i) => load(`s4_items/sk_${d}.base${i}.png`))))])), 64));
const B = JSON.parse(readFileSync(new URL('c25/bodyB.json', SPIKE), 'utf8')), DIRS_B: string[] = B.rig.directions.filter((d: { mirrorOf?: string }) => !d.mirrorOf).map((d: { id: string }) => d.id);
const imgB = (sha: string) => decodePngBytes(new Uint8Array(Buffer.from(B.images[sha], 'base64')));
const rigB = { ...B.rig, animations: B.rig.animations.filter((a: { id: string }) => a.id === 'walk') };
writeFileSync(new URL('bodyB.json', OUT), JSON.stringify({ note: 'Studio-created slender elf: 64 px body in an 80 px frame, Top-down 8 (5 drawn views); rows = drawn views: rest, walk 0-7', rig: rigB, rows: DIRS_B, cols: ['rest', ...Array.from({ length: 8 }, (_, i) => `walk/${i}`)] }));
await save('bodyB.png', tile(await Promise.all(DIRS_B.map(async (d) => [await imgB(B.rig.rest[d].image), ...(await Promise.all(B.body.cells.walk[d].map(imgB)))])), 80));
// body N (round 2): Studio-created 128 px human in a 160 px frame, Top-down 4 (3 drawn views)
const N = JSON.parse(readFileSync(new URL('c25/body128.json', SPIKE), 'utf8')), DIRS_N: string[] = N.rig.directions.filter((d: { mirrorOf?: string }) => !d.mirrorOf).map((d: { id: string }) => d.id);
const imgN = (sha: string) => decodePngBytes(new Uint8Array(Buffer.from(N.images[sha], 'base64')));
writeFileSync(new URL('bodyN.json', OUT), JSON.stringify({ note: 'Studio-created human: 128 px body in a 160 px frame, Top-down 4 (3 drawn views); rows = drawn views: rest, walk 0-7', rig: { ...N.rig, animations: N.rig.animations.filter((a: { id: string }) => a.id === 'walk') }, rows: DIRS_N, cols: ['rest', ...Array.from({ length: 8 }, (_, i) => `walk/${i}`)] }));
await save('bodyN.png', tile(await Promise.all(DIRS_N.map(async (d) => [await imgN(N.rig.rest[d].image), ...(await Promise.all(N.body.cells.walk[d].map(imgN)))])), 160));

// ---------- cases ----------
// role 'reference': documents a superseded choice (the jester on magenta, which pickKey no longer picks); excluded from totals
type Case = { id: string; body: 'A' | 'B' | 'N' | 'C'; slot: string; key: string; pad: number; clips: string[]; expect: Record<string, string>; keep?: Record<string, number[][]>; drop?: Record<string, number[][]>; source: string; note?: string; role?: 'reference' };
const cases: Case[] = [];
async function posedCase(c: Omit<Case, 'clips'>, dress: (d: string) => string, pose: (clip: string, d: string, i: number) => string, clips: [string, string][], C: number) {
  const rows: Img[][] = [];
  for (const [clip, d] of clips) rows.push([pad(await load(dress(d)), C), ...(await Promise.all(Array.from({ length: 8 }, async (_, i) => pad(await load(pose(clip, d, i)), C))))]);
  await save(`${c.id}.png`, tile(rows, C));
  cases.push({ ...c, clips: clips.map(([a, d]) => `${a}/${d}`) });
  return rows;
}
const S4 = (item: string) => ({ dress: (d: string) => `s4_q3e/dress_ea2_${item}_${d}.png`, pose: (clip: string, d: string, i: number) => `s4_q3e/pose_ea2_${item}_${clip}_${d}_${i}.png` });
const ALL_A: [string, string][] = ['walk', 'slash'].flatMap((a) => DIRS_A.map((d) => [a, d] as [string, string]));
const allPass = (extra: Record<string, string> = {}) => ({ ...Object.fromEntries(ALL_A.map(([a, d]) => [`${a}/${d}`, 'pass'])), ...extra });
const q3e = 'docs/spikes/S4_model_routing.md (Q3 skel_ea2) and docs/research/generation-quality-campaign-2026-10-25.md (R0 baseline)';

// head: slash poses invent a sword and streaks; the detached pieces below the head band must never ship (DROP)
const helmRows = await posedCase({ id: 'a-helmet', body: 'A', slot: 'head', key: 'green', pad: 0, expect: allPass({ 'slash/east': 'fail:H4' }), source: `${q3e}; visual: streaks across the face in slash E 2-3` }, S4('helmet').dress, S4('helmet').pose, ALL_A, 64);
{ // DROP: raw non-key px of slash frames below the neck band that are not connected to the item above it (invented props)
  const drop: Record<string, number[][]> = {};
  ALL_A.forEach(([a, d], r) => { if (a !== 'slash') return; const neck = rigA.animations[1].sources[d].keypoints;
    helmRows[r].slice(1).forEach((im, i) => {
      const ny = neck[i].find((k) => k.label === 'NECK')!.y * 64 + 3, m = new Uint8Array(64 * 64);
      for (let p = 0; p < m.length; p++) { const q = p * 4; if (im.data[q + 3] >= 128 && keyScore('green', im.data[q], im.data[q + 1], im.data[q + 2]) < KT) m[p] = 1; }
      const out = new Uint8Array(m.length);
      for (const comp of components(m, 64, 64)) if (comp.every((p) => ((p / 64) | 0) >= ny) && comp.length >= 3) for (const p of comp) out[p] = 1;
      const rr = runs(out); if (rr.length) drop[`${a}/${d}/${i}`] = rr;
    });
  });
  cases.at(-1)!.drop = drop;
}
await posedCase({ id: 'a-cape', body: 'A', slot: 'back', key: 'green', pad: 0, expect: allPass({ 'slash/north': 'fail' }), source: `${q3e}; visual: cape becomes a thin ring in slash N 4-5` }, S4('cape').dress, S4('cape').pose, ALL_A, 64);
await posedCase({ id: 'a-chest', body: 'A', slot: 'torso_outer', key: 'green', pad: 0, expect: allPass(), source: q3e }, S4('chest').dress, S4('chest').pose, ALL_A, 64);
await posedCase({ id: 'a-boots', body: 'A', slot: 'feet', key: 'green', pad: 0, expect: Object.fromEntries(ALL_A.map(([a, d]) => [`${a}/${d}`, 'nofail'])), source: q3e, note: 'border warnings are artifacts of the old rig (feet on the last row)' }, S4('boots').dress, S4('boots').pose, ALL_A, 64);
await posedCase({ id: 'a-hair', body: 'A', slot: 'hair', key: 'green', pad: 0, expect: allPass(), source: q3e }, S4('hair').dress, S4('hair').pose, ALL_A, 64);

// held, 96 px: the pommel or haft end the fist splits off must ship (KEEP = small non-key pieces beside the weapon and within
// 6 px of the wrist, the geometry visually verified as pommels and haft ends in the 2026-10-25 R0 check; guards that regression)
for (const [tag, what] of [['d96', 'sword'], ['a96', 'axe']] as const) {
  const clips = ALL_A.filter(([a, d]) => has(`s5_held/pose_${tag}_${a}_${d}_s7_0.png`));
  const rows = await posedCase({ id: `a-${what}96`, body: 'A', slot: 'main_hand', key: 'green', pad: 16, expect: Object.fromEntries(clips.map(([a, d]) => [`${a}/${d}`, 'any'])), source: 'docs/spikes/S5_held_items.md; campaign R0 P2 (spikes/api/c25/r0/p2_pommel.mts)' }, (d) => `s5_held/dress_${tag}_${d}.png`, (a, d, i) => `s5_held/pose_${tag}_${a}_${d}_s7_${i}.png`, clips, 96);
  const keep: Record<string, number[][]> = {};
  clips.forEach(([a, d], r) => rows[r].slice(1).forEach((im, i) => {
    const w = rigA.animations.find((x) => x.id === a)!.sources[d].keypoints[i].find((k) => k.label === 'RIGHT ARM')!, wx = w.x * 64 + 16, wy = w.y * 64 + 16, m = new Uint8Array(96 * 96);
    for (let p = 0; p < m.length; p++) { const q = p * 4; if (im.data[q + 3] >= 128 && keyScore('green', im.data[q], im.data[q + 1], im.data[q + 2]) < KT) m[p] = 1; }
    const comps = components(m, 96, 96).sort((x, y) => y.length - x.length), big = comps[0]?.length ?? 0, out = new Uint8Array(m.length);
    // only the verified geometry: beside the weapon (within 3 px of its largest piece) and within 6 px of the wrist; small pieces
    // over the body near the fist were not confirmed as weapon parts on the 5x review and stay unlabeled
    const near = new Uint8Array(m.length); for (const p of comps[0] ?? []) { const x = p % 96, y = (p / 96) | 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < 96 && Y < 96) near[Y * 96 + X] = 1; } }
    for (const comp of comps.slice(1)) if (comp.length >= 4 && comp.length < 0.15 * big && comp.some((p) => near[p]) && comp.some((p) => Math.hypot((p % 96) + 0.5 - wx, ((p / 96) | 0) + 0.5 - wy) <= 6)) for (const p of comp) out[p] = 1;
    const rr = runs(out); if (rr.length) keep[`${a}/${d}/${i}`] = rr;
  }));
  cases.at(-1)!.keep = keep;
}

// key collision, body A, dress only: the jester's pink parts must ship (KEEP = saturated pink px of the raw output)
const pinkKeep = (im: Img, C: number) => { const m = new Uint8Array(C * C); for (let p = 0; p < m.length; p++) { const [r, g, b, a] = im.data.subarray(p * 4, p * 4 + 4); if (a >= 128 && r > g + 60 && r > b + 30 && b > g + 10) m[p] = 1; /* the magenta key ramp has R ≈ B; pink has R well above B */ } return runs(m); };
for (const v of ['magenta', 'blue']) {
  const views = await Promise.all(DIRS_A.map((_, i) => load(`c25/K/jester/${v}_s7.${i}.png`)));
  await save(`a-jester-${v}.png`, tile([views], 64));
  cases.push({ id: `a-jester-${v}`, body: 'A', slot: 'head', key: v, pad: 0, clips: [], ...(v === 'magenta' ? { role: 'reference' as const } : {}), expect: { rest: v === 'magenta' ? 'fail:G3' : 'pass' }, keep: Object.fromEntries(DIRS_A.map((d, i) => [`rest/${d}/0`, pinkKeep(views[i], 64)])), source: 'campaign 2026-10-25 arm K' });
}

// body B (Studio default), dress + walk in every drawn view
const C25 = (item: string, v: string) => ({ dress: (d: string) => `c25/C/${item}/${v}_dress.${DIRS_B.indexOf(d)}.png`, pose: (_a: string, d: string, i: number) => `c25/C/${item}/${v}_walk_${d}.${i}.png` });
const walksB: [string, string][] = DIRS_B.map((d) => ['walk', d]);
const exB = (e: Record<string, string>) => ({ ...Object.fromEntries(DIRS_B.map((d) => [`walk/${d}`, 'pass'])), ...e });
for (const [item, slot, v, expect, note] of [
  ['tunic', 'torso_outer', 'ctrl', exB({}), ''],
  ['cloak', 'back', 'ctrl', exB({}), 'back view: PixelLab erased the ear tips under the hood; round 3 baseCut hides them (G2 failed on them before); the fabric stays mottled'],
  ['greathelm', 'head', 'ctrl', exB({ 'walk/north': 'any' }), 'back view key kept 0.967, borderline'],
  ['jester', 'head', 'ctrl', Object.fromEntries(DIRS_B.map((d) => [`walk/${d}`, 'fail:G3'])), 'magenta keys out the pink'],
  ['jester', 'head', 'blue', exB({}), 'blue keeps the pink'],
] as const) {
  const f = C25(item, v), id = `b-${item}${v === 'blue' ? '-blue' : ''}`;
  const rows = await posedCase({ id, body: 'B', slot, ...(item === 'jester' && v === 'ctrl' ? { role: 'reference' as const } : {}), key: v === 'blue' ? 'blue' : item === 'tunic' || item === 'jester' ? 'magenta' : 'green', pad: 0, expect, source: 'campaign 2026-10-25 arm C', ...(note ? { note } : {}) }, f.dress, f.pose, walksB, 80);
  if (item === 'jester') cases.at(-1)!.keep = Object.fromEntries(walksB.flatMap(([a, d], r) => rows[r].map((im, i) => [i ? `${a}/${d}/${i - 1}` : `rest/${d}/0`, pinkKeep(im, 80)])));
}
// round 2 arm N: the posed key tolerance at 160 px (a 1 px tolerance failed 5 north frames on 2 px foot drift; one real stays)
const N25 = (item: string) => ({ dress: (d: string) => `c25b/N/${item}/dress.${DIRS_N.indexOf(d)}.png`, pose: (_a: string, d: string, i: number) => `c25b/N/${item}/walk_${d}.${i}.png` });
await posedCase({ id: 'n-cloak128', body: 'N', slot: 'back', key: 'green', pad: 0, expect: { 'walk/south': 'pass', 'walk/east': 'pass', 'walk/north': 'fail:G3' }, source: 'docs/research/generation-quality-round2-2026-10-25.md arm N', note: 'north 4: a real 0.053 foot mismatch; the other frames pass at the scaled tolerance' }, N25('cloak128').dress, N25('cloak128').pose, DIRS_N.map((d) => ['walk', d]), 160);

// round 3 arm O: the chibi dwarf's great helm erases the ear tips (28 front, 32 back px); baseCut hides them in every frame
const Cb = JSON.parse(readFileSync(new URL('c25/chibi.json', SPIKE), 'utf8')), DIRS_C: string[] = Cb.rig.directions.filter((d: { mirrorOf?: string }) => !d.mirrorOf).map((d: { id: string }) => d.id);
const imgC = (sha: string) => decodePngBytes(new Uint8Array(Buffer.from(Cb.images[sha], 'base64')));
writeFileSync(new URL('bodyC.json', OUT), JSON.stringify({ note: 'Studio-created chibi dwarf: 64 px body in an 80 px frame, Top-down 4 (3 drawn views); rows = drawn views: rest, walk 0-7', rig: { ...Cb.rig, animations: Cb.rig.animations.filter((a: { id: string }) => a.id === 'walk') }, rows: DIRS_C, cols: ['rest', ...Array.from({ length: 8 }, (_, i) => `walk/${i}`)] }));
await save('bodyC.png', tile(await Promise.all(DIRS_C.map(async (d) => [await imgC(Cb.rig.rest[d].image), ...(await Promise.all(Cb.body.cells.walk[d].map(imgC)))])), 80));
const C25N = (item: string) => ({ dress: (d: string) => `c25b/N/${item}/dress.${DIRS_C.indexOf(d)}.png`, pose: (_a: string, d: string, i: number) => `c25b/N/${item}/walk_${d}.${i}.png` });
await posedCase({ id: 'c-greathelm', body: 'C', slot: 'head', key: 'green', pad: 0, expect: Object.fromEntries(DIRS_C.map((d) => [`walk/${d}`, 'pass'])), source: 'docs/research/generation-quality-round3-2026-10-25.md arm O', note: 'ear tips erased under the helm; G2 failed on them before baseCut' }, C25N('helmChibi').dress, C25N('helmChibi').pose, DIRS_C.map((d) => ['walk', d]), 80);

// round 2 arm Z, body A, dress only: green + purple stripes; the purple must ship (KEEP = px of the raw azure output with hue
// 250-320°, saturation >= 0.3, value >= 51; the azure ramp sits at 210°). On magenta the purple and the key ramp share those hues
// (the collision itself), so raw labels cannot separate them: the magenta reference has none and documents that every gate passes
const purpleKeep = (im: Img, C: number) => { const m = new Uint8Array(C * C); for (let p = 0; p < m.length; p++) { const [r, g, b, a] = im.data.subarray(p * 4, p * 4 + 4), mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); if (a < 128 || mx < 51 || d / mx < 0.3) continue; const h = (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60; if (h >= 250 && h <= 320) m[p] = 1; } return runs(m); };
for (const v of ['azure', 'magenta']) {
  const views = await Promise.all(DIRS_A.map((_, i) => load(`c25b/Z/stripes/${v}_dress_s7.${i}.png`)));
  await save(`a-stripes-${v}.png`, tile([views], 64));
  cases.push({ id: `a-stripes-${v}`, body: 'A', slot: 'torso_outer', key: v, pad: 0, clips: [], expect: { rest: 'pass' }, source: 'docs/research/generation-quality-round2-2026-10-25.md arm Z',
    ...(v === 'magenta' ? { role: 'reference' as const, note: 'every gate passes while the purple stripes are keyed out (1.3 % kept)' } : { keep: Object.fromEntries(DIRS_A.map((d, i) => [`rest/${d}/0`, purpleKeep(views[i], 64)])) }) });
}
writeFileSync(new URL('cases.json', OUT), JSON.stringify(cases, null, 1));
console.log(`froze ${cases.length} cases`);
