// Review of the uncommitted held-item QA change (G9 hang note, G5 steady grip, G4 occlusion excuse): review-held-hang.md.
// Offline, production itemQa only. Compares the committed baseline (edc604be), the working tree, and three candidate fixes
// applied as text patches to a temporary copy. Temporary copies live in app/test-results-review/ (gitignored) and are deleted.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/review/held-hang.ts
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { makeImg } from '../../../../../app/src/lib/image/png.ts';
import { LABELS } from '../../../../../app/src/lib/rig/poses.ts';
import type { Keypoint, Rig } from '../../../../../app/src/lib/rig/rig.ts';
import type { CellOut } from '../../../../../app/src/lib/items/items.ts';

type Pt = [number, number];
type Qa = typeof import('../../../../../app/src/lib/items/items.ts');
const ROOT = new URL('../../../../../', import.meta.url), TMP = new URL('app/test-results-review/', ROOT);
const rel = (src: string) => src.replace(/from '\.\.\//g, "from '../src/lib/").replace(/from '\.\//g, "from '../src/lib/items/");
const patch = (src: string, from: string, to: string) => { if (!src.includes(from)) throw new Error(`patch target missing: ${from.slice(0, 60)}`); return src.replace(from, to); };

// ---------- variants ----------
const cur = readFileSync(new URL('app/src/lib/items/items.ts', ROOT), 'utf8');
const old = execSync('git show edc604be:app/src/lib/items/items.ts', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
// F1: the hang excuse also requires the item to turn at most half as much as the forearm in the world (a hanging item lags).
const f1 = (s: string) => patch(s, 'if (world <= GATES.heldTurn && hangsDown(c, j, x!)',
  'const foreTurn = Math.abs((((fore[j] - fore[k]) * deg % 360) + 540) % 360 - 180); if (world <= Math.min(GATES.heldTurn, foreTurn / 2) && hangsDown(c, j, x!)');
// F2: steady grip also requires every frame to keep a share `k` of the largest reach (a lost tip shortens the item).
const f2 = (s: string, k = 0.75) => patch(s, 'return top >= 6 && core.every((n) => n >= 0.75 * top);',
  `const ext = cs.map((c) => { let r = 0; for (let p = 0; p < c.mask.length; p++) if (c.mask[p]) r = Math.max(r, dist(c, p)); return r; });\n      return top >= 6 && core.every((n) => n >= 0.75 * top) && ext.every((r) => r >= ${k} * reach);`);
// F3: the G4 excuse uses the same clip-wide predicate as the G5 occlusion excuse (every frame compatible with the largest,
// hidden px restore a steady area), plus every frame under the floor reaches it with its own hidden px; no empty frame.
const f3 = (s: string) => patch(s, `      const ref = cs.reduce((big, c) => c.area > big.area ? c : big), small = cs.reduce((s, c) => c.area < s.area ? c : s);
      if (!small.area) return false;
      const v = heldVisibility(ref, small, wrist[+ref.key.split('/')[2]], wrist[+small.key.split('/')[2]]);
      return v.compatible && v.hiddenB > 0 && small.area + v.hiddenB >= GATES.areaRatio * med;`,
  `      const ref = cs.reduce((big, c) => c.area > big.area ? c : big), ri = +ref.key.split('/')[2];
      if (cs.some((c) => !c.area)) return false;
      const vis = cs.map((c) => heldVisibility(ref, c, wrist[ri], wrist[+c.key.split('/')[2]])), fixed = cs.map((c, i) => c.area + vis[i].hiddenB);
      return vis.every((v) => v.compatible) && vis.some((v) => v.hiddenB) && cvOf(fixed) <= cvMax && fixed.every((a) => a >= GATES.areaRatio * med);`);
const exp = (s: string) => patch(s, 'function heldVisibility(', 'export function heldVisibility(');
mkdirSync(TMP, { recursive: true });
const SRC: Record<string, string> = { old: exp(old), new: exp(cur), fix: exp(f3(f2(f1(cur), 0.7))), f2at75: exp(f2(cur, 0.75)), f2at60: exp(f2(cur, 0.6)) };
const V: Record<string, Qa> = {};
try {
  for (const [k, s] of Object.entries(SRC)) { writeFileSync(new URL(`items-${k}.ts`, TMP), rel(s)); V[k] = await import(new URL(`items-${k}.ts`, TMP).href); }
} finally { rmSync(TMP, { recursive: true, force: true }); }

// ---------- harness: explicit wrist and forearm per frame ----------
type Frame = { wrist: Pt; fore: number; item: (x: number, y: number) => boolean; body?: (x: number, y: number) => boolean; front?: boolean };
type Opt = { w?: number; pad?: number; clip?: string; slot?: 'off_hand' | 'main_hand' };
function build(frames: Frame[], o: Opt = {}) {
  const w = o.w ?? 64, pad = o.pad ?? 0, W = w + 2 * pad, clip = o.clip ?? 'walk', side = o.slot === 'main_hand' ? 'RIGHT' : 'LEFT', other = side === 'LEFT' ? 'RIGHT' : 'LEFT';
  const pose = (f: Frame): Keypoint[] => LABELS.map((label) => {
    const a = f.fore * Math.PI / 180, L = 10 * w / 64;
    const [x, y] = label === `${side} ARM` ? f.wrist : label === `${side} ELBOW` ? [f.wrist[0] - L * Math.cos(a), f.wrist[1] - L * Math.sin(a)] : label === `${other} ARM` ? [w * 0.69, w * 0.53] : label === `${other} ELBOW` ? [w * 0.69, w * 0.38] : [w / 2, w * 0.31];
    return { label, x: x / w, y: y / w } as Keypoint;
  });
  const rig = { cell: { w, h: w }, pivot: { x: w / 2, y: w - 4 }, baseItem: 'base', baseHash: 'sha256:test', directions: [{ id: 'east' }],
    animations: [{ id: clip, cells: frames.length, loop: false, frames: [], sources: { east: { route: 'skeleton-v3', reference: 'sha256:test', keypoints: frames.map(pose), provenance: [] } } }] } as unknown as Rig;
  const cells = frames.map((f, i) => {
    const base = makeImg(W, W), layer = makeImg(W, W), mask = new Uint8Array(W * W);
    for (let Y = 0; Y < W; Y++) for (let X = 0; X < W; X++) {
      const p = Y * W + X, x = X - pad, y = Y - pad, b = f.body?.(x, y);
      if (b) base.data.set([90, 90, 90, 255], p * 4);
      if ((!b || f.front) && f.item(x, y)) { mask[p] = 1; layer.data.set([150, 90, 40, 255], p * 4); }
    }
    return { key: `${clip}/east/${i}`, call: 0, base, input: base, out: layer, layer, mask, area: mask.reduce((s, v) => s + v, 0), outBand: 0, baseBand: 0, specks: 0, pinholes: 0, shifted: false, offset: [0, 0], stray: 0, posed: true } as CellOut;
  });
  return { rig, cells, pad, slot: o.slot ?? 'off_hand' };
}
const tag = (m: string) => m.startsWith('Occlusion') ? 'Occl' : m.includes('keeps its own angle') ? 'G9hang' : m.split(' ')[0];
function judge(v: Qa, b: ReturnType<typeof build>) {
  const q = v.itemQa(b.rig, v.slotOf(b.slot), 'green', b.cells.map((c) => ({ ...c, mask: c.mask.slice() })), 0, undefined, b.pad);
  const fails = [...new Set([...q.failCalls.values()].flat().map(tag))].filter((t) => /^G[459]/.test(t));
  const warns = [...new Set(q.warnings.map((m) => tag(m.replace(/^[^ ]+\/[^ ]+: (?=G|Occ)/, ''))))].filter((t) => /^(G[459]|Occl)/.test(t));
  return `${q.qa.status}${fails.length ? ` F[${fails}]` : ''}${warns.length ? ` W[${warns}]` : ''}`;
}
const rows: string[][] = [];
const row = (name: string, b: ReturnType<typeof build>) => rows.push([name, ...['old', 'new', 'fix'].map((k) => judge(V[k], b))]);

// shapes in cell coordinates
const rod = (wr: Pt, deg: number, len: number, wd = 3, from = 0) => (x: number, y: number) => {
  const a = deg * Math.PI / 180, dx = x + 0.5 - wr[0], dy = y + 0.5 - wr[1], al = dx * Math.cos(a) + dy * Math.sin(a);
  return al >= from && al <= len && Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) <= wd / 2 - 0.2;
};
const disc = (c: Pt, r: number) => (x: number, y: number) => Math.hypot(x + 0.5 - c[0], y + 0.5 - c[1]) <= r;
const W0: Pt = [20, 34];

// ---------- 1. G9 hang excuse ----------
const big = [50, 90, 130, 90, 50, 90];
row('lantern straight down, forearm 50-130', build(big.map((fore) => ({ wrist: W0, fore, item: rod(W0, 90, 16) }))));
row('sword limp straight down (20 px), forearm 50-130', build(big.map((fore) => ({ wrist: W0, fore, item: rod(W0, 90, 20) }))));
row('sword straight down, forearm 60-100 (normal walk)', build([60, 80, 100, 80, 60, 80].map((fore) => ({ wrist: W0, fore, item: rod(W0, 90, 20) }))));
const foreS = [80, 95, 80, 95, 80, 95], bladeS = [100, 72, 100, 72, 100, 72];
row('sword counter-rotates 28 deg against a 15 deg forearm', build(foreS.map((fore, i) => ({ wrist: W0, fore, item: rod(W0, bladeS[i], 20) }))));
row('sword counter-rotates 20 deg against a 12 deg forearm', build([84, 96, 84, 96, 84, 96].map((fore, i) => ({ wrist: W0, fore, item: rod(W0, [100, 80][i % 2], 20) }))));
row('mace down flips 90 deg sideways in frame 3', build(big.map((fore, i) => ({ wrist: W0, fore, item: rod(W0, i === 3 ? 0 : 90, 18) }))));
row('mace down tilts 45 deg in frame 3 (still below wrist)', build(big.map((fore, i) => ({ wrist: W0, fore, item: rod(W0, i === 3 ? 135 : 90, 18) }))));
row('sword reversed (points up) in frame 3', build(big.map((fore, i) => ({ wrist: W0, fore, item: rod(W0, i === 3 ? 270 : 90, 20) }))));
// item frozen in the world while the wrist moves away along the swing (pasted, not held)
const wr = (i: number): Pt => [20 + [0, 3, 6, 3, 0, 3][i], 34 - [0, 1, 2, 1, 0, 1][i]];
row('sword frozen in place while the wrist moves 6 px', build(big.map((fore, i) => ({ wrist: wr(i), fore, item: rod(W0, 90, 20) }))));
row('sword slides down out of the fist (gap 0-6 px)', build(big.map((fore, i) => ({ wrist: W0, fore, item: rod(W0, 90, 20 + [0, 2, 4, 6, 4, 2][i], 3, [0, 2, 4, 6, 4, 2][i]) }))));
row('chain whip hanging, sways +-10 deg', build(big.map((fore, i) => ({ wrist: W0, fore, item: rod(W0, 90 + [0, 10, 0, -10, 0, 10][i], 24, 2) }))));

// ---------- 2. G5 steady grip ----------
const walk = [80, 88, 96, 88, 80, 88];
const lens = (l: number[]) => build(walk.map((fore, i) => ({ wrist: W0, fore, item: rod(W0, fore, l[i]) })));
row('rigid blade loses 40 % of its length in 1 frame', lens([24, 24, 24, 14, 24, 24]));
row('rigid blade loses 30 % in 2 frames', lens([24, 17, 24, 17, 24, 24]));
row('rigid blade loses 45 % in 2 frames', lens([24, 13, 24, 13, 24, 24]));
row('rigid blade loses tip in 3 frames, 35 %', lens([24, 16, 16, 16, 24, 24]));
// shield strapped beside the wrist: disc r 7 centered 5 px out; frames lose the far third
const S = (cut: number) => (wrist: Pt) => (x: number, y: number) => disc([wrist[0] - 5, wrist[1]], 7)(x, y) && x + 0.5 >= wrist[0] - 12 + cut;
row('shield loses its far side (5 px) in 2 frames', build(walk.map((fore, i) => ({ wrist: W0, fore, item: S([0, 5, 0, 5, 0, 0][i])(W0) }))));
row('shield shrinks uniformly (r 7 -> 4) in 2 frames', build(walk.map((fore, i) => ({ wrist: W0, fore, item: disc([W0[0] - 5, W0[1]], [7, 4, 7, 4, 7, 7][i]) }))));

// ---------- 3. G4 occlusion excuse ----------
const torso = (x: number, y: number) => x >= 24 && x <= 40 && y >= 10 && y < 60;
const sh = [0, 0, 5, 9, 5, 0];
const slide = (f: (i: number, w: Pt) => (x: number, y: number) => boolean, clip = 'walk', front = false) => build(sh.map((s, i) => { const w: Pt = [18 + s, 34]; return { wrist: w, fore: 90, item: f(i, w), body: torso, front }; }), { clip });
row('buckler slides behind torso (test case)', slide((_i, w) => disc(w, 6)));
row('buckler in FRONT of torso, provider drops the half over the body', build(sh.map((_s, i) => { const w: Pt = [30, 34]; return { wrist: w, fore: 90, body: torso, front: true, item: (x: number, y: number) => disc(w, 6)(x, y) && !(i === 3 && x >= 24) }; })));
// frame 2 slides behind the torso (true occlusion, the smallest frame); frame 1 is out in the open, 10 px from the torso, and
// the provider drew only its top 40 % (a real drawing failure the body cannot explain)
const two = (clip: string) => build([0, -6, 9, 0, 0, 0].map((s, i) => { const w: Pt = [18 + s, 34]; return { wrist: w, fore: 90, body: torso, item: (x: number, y: number) => disc(w, 6)(x, y) && !(i === 1 && y + 0.5 > w[1] - 1) }; }), { clip });
row('frame behind torso + another frame 60 % missing in the open (walk)', two('walk'));
row('same, action clip (attack/east: G5 and G9 skip actions)', two('attack'));

// ---------- 4. scale and padding ----------
for (const w of [64, 128, 256]) {
  const s = w / 64, Wr: Pt = [20 * s, 34 * s];
  rows.push([`-- ${w} px cell --`, '', '', '']);
  row(`lantern, ${w} px`, build(big.map((fore) => ({ wrist: Wr, fore, item: rod(Wr, 90, 16 * s, 3 * s) })), { w }));
  row(`blade loses 40 % in 1 frame, ${w} px`, build(walk.map((fore, i) => ({ wrist: Wr, fore, item: rod(Wr, fore, [24, 24, 24, 14, 24, 24][i] * s, 3 * s) })), { w }));
  row(`tiny dagger 7 px loses 3 px, ${w} px`, build(walk.map((fore, i) => ({ wrist: Wr, fore, item: rod(Wr, fore, [7, 7, 4, 7, 4, 7][i] * s, 2 * s) })), { w }));
}
row('lantern, 64 px cell with 16 px pad', build(big.map((fore) => ({ wrist: W0, fore, item: rod(W0, 90, 16) })), { pad: 16 }));
row('blade loses 40 %, 64 px cell with 16 px pad', build(walk.map((fore, i) => ({ wrist: W0, fore, item: rod(W0, fore, [24, 24, 24, 14, 24, 24][i]) })), { pad: 16 }));
row('blade loses 40 % + 1 stray px 30 px away', build(walk.map((fore, i) => ({ wrist: W0, fore, item: (x: number, y: number) => rod(W0, fore, [24, 24, 24, 14, 24, 24][i])(x, y) || (i === 0 && x === 50 && y === 50) }))));

// ---------- 5. audit kinds on real bench walk keypoints (does the fix keep the intended improvements?) ----------
const FIX = new URL('app/test/fixtures/bench/', ROOT);
const bench = (b: string) => JSON.parse(readFileSync(new URL(`body${b}.json`, FIX), 'utf8')).rig as Rig;
const kp = (f: Keypoint[], l: string, c: { w: number; h: number }): Pt => { const q = f.find((p) => p.label === l)!; return [q.x * c.w, q.y * c.h]; };
const D = (r: number) => r * 180 / Math.PI;
const KIND: [string, (wr: Pt, f: number, f0: number, i: number, s: number) => (x: number, y: number) => boolean][] = [
  ['sword (rigid)', (w, f, f0, _i, s) => rod(w, 90 + f - f0, 28 * s, 3 * s)],
  ['lantern (hangs)', (w, _f, _f0, _i, s) => (x, y) => rod(w, 90, 9 * s, 1.5 * s)(x, y) || (Math.abs(x + 0.5 - w[0]) <= 3 * s && y + 0.5 - w[1] >= 9 * s && y + 0.5 - w[1] <= 17 * s)],
  ['banner (waving cloth)', (w, f, f0, i, s) => { const a = 90 + f - f0 - 180; return (x, y) => rod(w, a, 30 * s, 2 * s)(x, y) || rod([w[0] + 16 * s * Math.cos(a * Math.PI / 180), w[1] + 16 * s * Math.sin(a * Math.PI / 180)], a, 14 * s, (i % 2 ? 6 : 12) * s, 0)(x, y); }],
  ['torch (flicker)', (w, f, f0, i, s) => (x, y) => rod(w, 90 + f - f0 - 180, 12 * s, 2 * s)(x, y) || rod(w, 90 + f - f0 - 180, (12 + [6, 3, 7, 2][i % 4]) * s, 4 * s, 12 * s)(x, y)],
];
const kindRows: string[][] = [];
for (const b of ['A', 'N']) {
  const rig = bench(b), w = rig.cell.w, s = w / 64;
  for (const [name, draw] of KIND) {
    const cnt: Record<string, Record<string, number>> = { old: {}, new: {}, fix: {} };
    for (const d of ['south', 'east', 'north']) {
      const a = rig.animations.find((x) => x.id === 'walk')!, ks = a.sources![d as 'south']!.keypoints!;
      const fore = ks.map((f) => { const e = kp(f, 'RIGHT ELBOW', rig.cell), r = kp(f, 'RIGHT ARM', rig.cell); return D(Math.atan2(r[1] - e[1], r[0] - e[0])); });
      const cells = ks.map((f, i) => { const m = new Uint8Array(w * w), it = draw(kp(f, 'RIGHT ARM', rig.cell), fore[i], fore[0], i, s); for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (it(x, y)) m[y * w + x] = 1; const base = makeImg(w, w), layer = makeImg(w, w); for (let p = 0; p < m.length; p++) if (m[p]) layer.data.set([150, 90, 40, 255], p * 4); return { key: `walk/${d}/${i}`, call: 0, base, input: base, out: layer, layer, mask: m, area: m.reduce((t, v) => t + v, 0), outBand: 0, baseBand: 0, specks: 0, pinholes: 0, shifted: false, offset: [0, 0], stray: 0, posed: true } as CellOut; });
      for (const k of ['old', 'new', 'fix']) {
        const q = V[k].itemQa(rig, V[k].slotOf('main_hand'), 'green', cells, 0);
        for (const t of new Set([...q.failCalls.values()].flat().map((m) => `F${m.split(' ')[0]}`))) cnt[k][t] = (cnt[k][t] ?? 0) + 1;
      }
    }
    kindRows.push([`${b} (${w} px) ${name}, 3 walk views`, ...['old', 'new', 'fix'].map((k) => Object.entries(cnt[k]).map(([t, n]) => `${t}x${n}`).join(' ') || 'no fails')]);
  }
}

// ---------- 6. saved shield controls (real frames) and mutations ----------
const fx = JSON.parse(readFileSync(new URL('app/test/fixtures/shield-occlusion.json', ROOT), 'utf8')) as { clips: { id: string; dir: string; cell: { w: number; h: number }; pad: number; pivot: { x: number; y: number }; frames: { points: Keypoint[]; mask: [number, number][]; body: [number, number][]; baseBand: number }[] }[] };
function saved(clip: typeof fx.clips[number]) {
  const w = clip.cell.w + 2 * clip.pad, h = clip.cell.h + 2 * clip.pad;
  const rig = { cell: clip.cell, pivot: clip.pivot, baseItem: 'base', baseHash: 'sha256:test', directions: [{ id: clip.dir }],
    animations: [{ id: 'walk', cells: clip.frames.length, loop: true, frames: [], sources: { [clip.dir]: { route: 'skeleton-v3', reference: 'sha256:test', provenance: [], keypoints: clip.frames.map((f) => LABELS.map((label) => f.points.find((p) => p.label === label) ?? { label, x: 0.5, y: 0.5 })) } } }] } as unknown as Rig;
  const cells = clip.frames.map((f, i) => {
    const layer = makeImg(w, h), base = makeImg(w, h), mask = new Uint8Array(w * h);
    for (const [st, n] of f.mask) for (let p = st; p < st + n; p++) { mask[p] = 1; layer.data.set([120, 70, 30, 255], p * 4); }
    for (const [st, n] of f.body) for (let p = st; p < st + n; p++) base.data.set([80, 80, 80, 255], p * 4);
    return { key: `walk/${clip.dir}/${i}`, call: 0, layer, base, mask, input: base, out: layer, area: mask.reduce((s, n) => s + n, 0), baseBand: f.baseBand, outBand: 0, specks: 0, pinholes: 0, shifted: false, offset: [0, 0], stray: 0, posed: true } as CellOut;
  });
  return { rig, cells, pad: clip.pad, slot: 'off_hand' as const, w };
}
const shieldRows: string[][] = [];
const srow = (name: string, b: ReturnType<typeof saved>) => shieldRows.push([name, ...['old', 'new', 'fix'].map((k) => judge(V[k], b))]);
for (const clip of fx.clips) {
  const id = `${clip.id.slice(-12)} ${clip.dir}`;
  srow(`${id}: saved`, saved(clip));
  // drop the half of the largest frame's mask that lies farthest from the body column, in the middle frame
  const cut = (pick: (x: number, cx: number, bodyLeft: boolean) => boolean) => { const b = saved(clip), i = b.cells.length >> 1, c = b.cells[i];
    let sx = 0, n = 0; for (let p = 0; p < c.mask.length; p++) if (c.mask[p]) { sx += p % b.w; n++; }
    let bx = 0, bn = 0; for (let p = 0; p < c.mask.length; p++) if (c.base.data[p * 4 + 3]) { bx += p % b.w; bn++; }
    const cx = sx / n, bodyLeft = bx / bn < cx;
    for (let p = 0; p < c.mask.length; p++) if (c.mask[p] && pick(p % b.w, cx, bodyLeft)) { c.mask[p] = 0; c.layer.data.fill(0, p * 4, p * 4 + 4); }
    c.area = c.mask.reduce((s, v) => s + v, 0); return b; };
  srow(`${id}: middle frame loses its half AWAY from the body`, cut((x, cx, bl) => bl ? x > cx : x < cx));
  srow(`${id}: middle frame loses its half TOWARD the body`, cut((x, cx, bl) => bl ? x < cx : x > cx));
}

// why the north-east mutation passes the new G4 excuse: the largest frame already differs from the smallest by real occlusion
{
  const clip = fx.clips.find((c) => c.dir === 'north-east')!, b = saved(clip), i = b.cells.length >> 1, c = b.cells[i];
  let sx = 0, n = 0, bx = 0, bn = 0;
  for (let p = 0; p < c.mask.length; p++) { if (c.mask[p]) { sx += p % b.w; n++; } if (c.base.data[p * 4 + 3]) { bx += p % b.w; bn++; } }
  const cx = sx / n, bodyLeft = bx / bn < cx;
  for (let p = 0; p < c.mask.length; p++) if (c.mask[p] && (bodyLeft ? p % b.w > cx : p % b.w < cx)) { c.mask[p] = 0; c.layer.data.fill(0, p * 4, p * 4 + 4); }
  c.area = c.mask.reduce((s, v) => s + v, 0);
  const areas = b.cells.map((x) => x.area), ref = b.cells.reduce((m, x) => x.area > m.area ? x : m), med = [...areas].sort((x, y) => x - y);
  const wrists = b.rig.animations[0].sources!['north-east' as 'east']!.keypoints!.map((f) => { const q = f.find((p) => p.label === 'LEFT ARM')!; return [q.x * clip.cell.w + b.pad, q.y * clip.cell.h + b.pad] as Pt; });
  const v = (V.new as unknown as { heldVisibility: (a: CellOut, b: CellOut, x: Pt, y: Pt) => object }).heldVisibility(ref, c, wrists[+ref.key.split('/')[2]], wrists[i]);
  console.log(`north-east, middle frame cut AWAY from the body: areas ${areas.join(',')}, median ${(med[3] + med[4]) / 2}, ref ${ref.key}, heldVisibility(ref, cut) ${JSON.stringify(v)}\n`);
}

// F2 threshold sweep: which share of the largest reach must every frame keep
const sweep: string[][] = [];
for (const loss of [0.2, 0.25, 0.3, 0.35, 0.4, 0.5]) {
  const l = Math.round(24 * (1 - loss)), b = lens([24, l, 24, l, 24, 24]);
  sweep.push([`blade loses ${loss * 100} % in 2 frames`, ...['old', 'new', 'fix', 'f2at75', 'f2at60'].map((k) => judge(V[k], b))]);
}
for (const [fl, label] of [[[6, 3, 7, 2], 'audit torch 2-7 px flame'], [[6, 4, 6, 4], 'torch 4-6 px flame']] as const) {
  const b = build(walk.map((fore, i) => ({ wrist: W0, fore, item: (x: number, y: number) => rod(W0, fore - 180, 12, 2)(x, y) || rod(W0, fore - 180, 12 + fl[i % 4], 4, 12)(x, y) })));
  sweep.push([label, ...['old', 'new', 'fix', 'f2at75', 'f2at60'].map((k) => judge(V[k], b))]);
}

const table = (head: string[], r: string[][]) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...r.map((x) => `| ${x.join(' | ')} |`)].join('\n');
console.log('## Synthetic cases (64 px unless noted; F = fail, W = warning)\n');
console.log(table(['case', 'old (edc604be)', 'new (working tree)', 'fix (F1+F2 0.70+F3)'], rows));
console.log('\n## Audit kinds on bench walk keypoints (main hand, south/east/north)\n');
console.log(table(['kind', 'old', 'new', 'fix'], kindRows));
console.log('\n## Saved shield controls (app/test/fixtures/shield-occlusion.json) and mutations\n');
console.log(table(['clip', 'old', 'new', 'fix'], shieldRows));
console.log('\n## F2 threshold sweep (64 px, walk)\n');
console.log(table(['case', 'old', 'new', 'fix (F2 0.70)', 'F2 0.75 only', 'F2 0.60 only'], sweep));
