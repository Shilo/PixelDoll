// Independent challenge of the motion candidates A (signed G9), B (pixel-center G8) and C (held repair disc radius).
// Offline: replays the frozen held benchmark (app/test/fixtures/bench a-sword96, a-axe96, a-bow96) through production
// runCase (extractCell, postProcess) and production geometry helpers (axisOf, angleDiff, centroid). No network, no app edits.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/challenge/held-challenge.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runCase } from '../../../../../app/scripts/bench.ts';
import { angleDiff, axisOf, isAction, type CellOut } from '../../../../../app/src/lib/items/items.ts';
import { centroid } from '../../../../../app/src/lib/image/similarity.ts';
import type { Keypoint, Rig } from '../../../../../app/src/lib/rig/rig.ts';

const OUT = 'C:/Programming_Files/Shilocity/PixelLab/checkouts/cycle-2026-11-07/challenge';
mkdirSync(OUT, { recursive: true });
const FIX = new URL('../../../../../app/test/fixtures/bench/', import.meta.url);
const cases = (JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')) as { id: string; body: string; slot: string; pad: number; clips: string[] }[]).filter((c) => c.pad);
const sum = (m: Uint8Array) => m.reduce((a, b) => a + b, 0);
const wrap = (a: number) => ((a % 360) + 540) % 360 - 180;
const D = (r: number) => (r * 180) / Math.PI;

type Frame = { key: string; mask: Uint8Array; w: number; wr: [number, number]; el: [number, number]; base: Uint8Array };
/** Oriented axis relative to the forearm (deg), as the motion spike proposes: production axisOf pointed from the wrist toward the centroid. */
function oriented(f: Frame) {
  const ct = centroid(f.mask, f.w), ax = axisOf(f.mask, f.w);
  const fore = Math.atan2(f.wr[1] - f.el[1], f.wr[0] - f.el[0]), foreLen = Math.hypot(f.wr[0] - f.el[0], f.wr[1] - f.el[1]);
  if (!ct || ax == null) return { rel: null as number | null, unsigned: null as number | null, conf: false, ratio: 0, foreLen, n: sum(f.mask) };
  const cx = ct[0] + 0.5 - f.wr[0], cy = ct[1] + 0.5 - f.wr[1];
  let reach = 0;
  for (let p = 0; p < f.mask.length; p++) if (f.mask[p]) reach = Math.max(reach, Math.hypot((p % f.w) + 0.5 - f.wr[0], ((p / f.w) | 0) + 0.5 - f.wr[1]));
  let t = ax; if (Math.cos(t) * cx + Math.sin(t) * cy < 0) t += Math.PI;
  const ratio = reach ? Math.hypot(cx, cy) / reach : 0;
  return { rel: wrap(D(t - fore)), unsigned: ax - fore, conf: ratio >= 0.25, ratio, foreLen, n: sum(f.mask) };
}
/** Three rule variants on one transition. prod: unsigned > 30 on locomotion (current). V1: spike (signed > 90 fail loco, > 120 warn action, abstain).
 * V2: reviewer (signed when confident else unsigned, 30 fail on loco; warn > 120 on action only when both forearms are >= 3 px). */
function judge(a: Frame, b: Frame, action: boolean) {
  const x = oriented(a), y = oriented(b);
  if (x.unsigned == null || y.unsigned == null) return { prod: 'abstain', v1: 'abstain', v2: 'abstain', signed: null, unsignedD: null, x, y };
  const unsignedD = angleDiff(x.unsigned, y.unsigned);
  const signed = x.conf && y.conf ? Math.abs(wrap(x.rel! - y.rel!)) : null;
  const prod = action ? 'unchecked' : unsignedD > 30 ? 'fail' : 'ok';
  const v1 = signed == null ? (action ? 'abstain' : prod) : action ? (signed > 120 ? 'warn' : 'ok') : signed > 90 ? 'fail' : prod;
  const short = Math.min(x.foreLen, y.foreLen) < 3;
  const v2 = action ? (signed == null || short ? 'abstain' : signed > 120 ? 'warn' : 'ok') : (signed ?? unsignedD) > 30 ? 'fail' : 'ok';
  return { prod, v1, v2, signed, unsignedD, x, y };
}

// ---------- gather real frames ----------
const real: Record<string, Frame[]> = {}, rigs: Record<string, Rig> = {}, cellsBy: Record<string, CellOut[]> = {};
for (const c of cases) {
  const res = await runCase(c as never), rig = (JSON.parse(readFileSync(new URL(`body${c.body}.json`, FIX), 'utf8')).rig) as Rig;
  rigs[c.id] = rig; cellsBy[c.id] = res.cells;
  const side = c.slot === 'off_hand' ? 'LEFT' : 'RIGHT', W = rig.cell.w + 2 * c.pad;
  for (const x of res.cells.filter((y) => !y.key.startsWith('rest/'))) {
    const [a, d, i] = x.key.split('/'), k = rig.animations.find((q) => q.id === a)!.sources![d as 'south']!.keypoints![+i] as Keypoint[];
    const at = (l: string): [number, number] => { const q = k.find((p) => p.label === l)!; return [q.x * rig.cell.w + c.pad, q.y * rig.cell.h + c.pad]; };
    const base = new Uint8Array(W * W); for (let p = 0; p < base.length; p++) base[p] = x.base.data[p * 4 + 3] ? 1 : 0;
    (real[`${c.id} ${a}/${d}`] ??= []).push({ key: x.key, mask: x.mask, w: W, wr: at(`${side} ARM`), el: at(`${side} ELBOW`), base });
  }
}
const transitions = (fs: Frame[]) => fs.slice(1).map((f, i) => [fs[i], f] as const);

// ---------- A1: real transitions, all variants, with forearm length ----------
const realRows: Record<string, unknown>[] = [];
const tally = { prod: {} as Record<string, number>, v1: {} as Record<string, number>, v2: {} as Record<string, number> };
for (const [clip, fs] of Object.entries(real)) {
  const action = isAction(clip.split(' ')[1]);
  for (const [a, b] of transitions(fs)) {
    const j = judge(a, b, action);
    for (const v of ['prod', 'v1', 'v2'] as const) tally[v][`${clip.startsWith('a-bow') ? 'bow' : 'blade'} ${action ? 'action' : 'loco'} ${j[v]}`] = (tally[v][`${clip.startsWith('a-bow') ? 'bow' : 'blade'} ${action ? 'action' : 'loco'} ${j[v]}`] ?? 0) + 1;
    realRows.push({ clip, from: a.key, to: b.key, signed: j.signed == null ? null : +j.signed.toFixed(1), unsigned: j.unsignedD == null ? null : +j.unsignedD.toFixed(1), ratioA: +j.x.ratio.toFixed(2), ratioB: +j.y.ratio.toFixed(2), foreA: +j.x.foreLen.toFixed(1), foreB: +j.y.foreLen.toFixed(1), prod: j.prod, v1: j.v1, v2: j.v2 });
  }
}
const fore = Object.values(real).flat().map((f) => Math.hypot(f.wr[0] - f.el[0], f.wr[1] - f.el[1]));

// ---------- A2: rotation sweep about the wrist (frame 3 of every clip), inverse-mapped so the mask has no holes ----------
function rotate(f: Frame, deg: number): Frame {
  const r = (-deg * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r), m = new Uint8Array(f.mask.length), h = f.mask.length / f.w;
  for (let y = 0; y < h; y++) for (let x = 0; x < f.w; x++) {
    const dx = x + 0.5 - f.wr[0], dy = y + 0.5 - f.wr[1], X = Math.floor(f.wr[0] + dx * cs - dy * sn), Y = Math.floor(f.wr[1] + dx * sn + dy * cs);
    if (X >= 0 && Y >= 0 && X < f.w && Y < h && f.mask[Y * f.w + X]) m[y * f.w + x] = 1;
  }
  return { ...f, mask: m };
}
const sweep: Record<string, Record<string, string>> = {};
for (const deg of [20, 30, 45, 60, 90, 120, 150, 165, 180]) {
  const t = { loco: { prod: 0, v1: 0, v2: 0, n: 0 }, action: { prod: 0, v1: 0, v2: 0, n: 0 } };
  for (const [clip, fs] of Object.entries(real)) {
    if (clip.startsWith('a-bow') || fs.length < 5) continue;
    const action = isAction(clip.split(' ')[1]), g = action ? t.action : t.loco, bad = rotate(fs[3], deg);
    g.n++;
    // a transition into and out of the damaged frame; a clip is caught when either transition flags
    const js = [judge(fs[2], bad, action), judge(bad, fs[4], action)];
    for (const v of ['prod', 'v1', 'v2'] as const) if (js.some((j) => j[v] === 'fail' || j[v] === 'warn')) g[v]++;
  }
  sweep[`${deg} deg`] = { loco: `${t.loco.prod}/${t.loco.v1}/${t.loco.v2} of ${t.loco.n}`, action: `${t.action.prod}/${t.action.v1}/${t.action.v2} of ${t.action.n}` };
}

// ---------- A3: grip-centered poles (staff/spear) that follow the real blade direction rigidly; ownership truth = valid ----------
// The pole is a 2 px line along the real frame's oriented axis through the wrist, from -f*L to +(1-f)*L. Optionally the part
// over the body silhouette is hidden (item behind the body), as in side walks. Every flag here is a false flag.
function pole(f: Frame, frac: number, L: number, hide: boolean): Frame | null {
  const o = oriented(f);
  if (o.rel == null) return null;
  const fore = Math.atan2(f.wr[1] - f.el[1], f.wr[0] - f.el[0]), t = fore + (o.rel * Math.PI) / 180, ux = Math.cos(t), uy = Math.sin(t), m = new Uint8Array(f.mask.length), h = f.mask.length / f.w;
  for (let s = -frac * L; s <= (1 - frac) * L; s += 0.25) for (const off of [-0.5, 0.5]) {
    const X = Math.floor(f.wr[0] + s * ux - off * uy), Y = Math.floor(f.wr[1] + s * uy + off * ux);
    if (X >= 0 && Y >= 0 && X < f.w && Y < h && !(hide && f.base[Y * f.w + X])) m[Y * f.w + X] = 1;
  }
  return { ...f, mask: m };
}
const poles: Record<string, unknown>[] = [];
for (const frac of [0.15, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5]) for (const hide of [false, true]) {
  let pairs = 0, abst = 0; const fl = { prod: 0, v1: 0, v2: 0 }, flips: string[] = [];
  for (const [clip, fs] of Object.entries(real)) {
    if (clip.startsWith('a-bow') || isAction(clip.split(' ')[1])) continue;
    const ps = fs.map((f) => pole(f, frac, 40, hide));
    for (let i = 1; i < ps.length; i++) {
      if (!ps[i - 1] || !ps[i]) continue;
      const j = judge(ps[i - 1]!, ps[i]!, false); pairs++;
      if (j.signed == null) abst++;
      for (const v of ['prod', 'v1', 'v2'] as const) if (j[v] === 'fail') fl[v]++;
      if (j.v2 === 'fail' && flips.length < 3) flips.push(`${clip} ${i - 1}->${i} signed ${j.signed?.toFixed(0)} unsigned ${j.unsignedD?.toFixed(0)} ratio ${j.x.ratio.toFixed(2)}/${j.y.ratio.toFixed(2)}`);
    }
  }
  poles.push({ gripFraction: frac, hiddenBehindBody: hide, pairs, abstained: abst, falseFail: `${fl.prod}/${fl.v1}/${fl.v2}`, examples: flips });
}

// ---------- A4: small blades (dagger): keep the real blade within r px of the wrist; truth = valid ----------
const daggers: Record<string, unknown>[] = [];
for (const r of [6, 8, 10, 14]) {
  let pairs = 0, abst = 0, nullAxis = 0; const fl = { prod: 0, v1: 0, v2: 0 };
  for (const [clip, fs] of Object.entries(real)) {
    if (clip.startsWith('a-bow') || isAction(clip.split(' ')[1])) continue;
    const ds = fs.map((f) => { const m = new Uint8Array(f.mask.length); for (let p = 0; p < m.length; p++) if (f.mask[p] && Math.hypot((p % f.w) + 0.5 - f.wr[0], ((p / f.w) | 0) + 0.5 - f.wr[1]) <= r) m[p] = 1; return { ...f, mask: m }; });
    for (let i = 1; i < ds.length; i++) {
      const j = judge(ds[i - 1], ds[i], false); pairs++;
      if (j.unsignedD == null) { nullAxis++; continue; }
      if (j.signed == null) abst++;
      for (const v of ['prod', 'v1', 'v2'] as const) if (j[v] === 'fail') fl[v]++;
    }
  }
  daggers.push({ radius: r, pairs, axisNull: nullAxis, abstained: abst, falseFail: `${fl.prod}/${fl.v1}/${fl.v2}` });
}

// ---------- A5: would production's occlusion excuse (heldVisibility, items.ts ~826, not exported; mirrored here line for line)
// swallow a signed reversal? It runs before a transition is counted whenever the angle exceeds the gate.
function visibility(a: Frame, b: Frame) {
  const w = a.w, h = a.mask.length / w, dx = Math.round(b.wr[0] - a.wr[0]), dy = Math.round(b.wr[1] - a.wr[1]);
  const dil = (m: Uint8Array) => { const o = new Uint8Array(m.length); for (let p = 0; p < m.length; p++) if (m[p]) for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) { const X = (p % w) + xx, Y = ((p / w) | 0) + yy; if (X >= 0 && Y >= 0 && X < w && Y < h) o[Y * w + X] = 1; } return o; };
  const bodyA = dil(a.base), bodyB = dil(b.base), at = (m: Uint8Array, x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !!m[y * w + x];
  let shared = 0, different = 0, hiddenA = 0, hiddenB = 0;
  for (let y = Math.min(0, -dy); y < Math.max(h, h - dy); y++) for (let x = Math.min(0, -dx); x < Math.max(w, w - dx); x++) {
    const av = at(a.mask, x, y), bv = at(b.mask, x + dx, y + dy);
    if (av && bv) shared++; else if (av) { if (at(bodyB, x + dx, y + dy)) hiddenB++; else different++; } else if (bv) { if (at(bodyA, x, y)) hiddenA++; else different++; }
  }
  return shared >= 6 && hiddenA + hiddenB >= different && shared / (shared + different) >= 0.3 && hiddenA + hiddenB > 0;
}
const excuse: Record<string, number> = { reversalTransitions: 0, flaggedBySigned: 0, excusedByOcclusion: 0 };
for (const [clip, fs] of Object.entries(real)) {
  if (clip.startsWith('a-bow') || isAction(clip.split(' ')[1]) || fs.length < 5) continue;
  for (const i of [1, 2, 3, 4, 5, 6]) {
    if (!fs[i + 1]) continue;
    const bad = rotate(fs[i], 180);
    for (const [a, b] of [[fs[i - 1], bad], [bad, fs[i + 1]]] as const) {
      excuse.reversalTransitions++;
      const j = judge(a, b, false);
      if (j.v2 === 'fail' && j.prod !== 'fail') { excuse.flaggedBySigned++; if (visibility(a, b)) excuse.excusedByOcclusion++; }
    }
  }
}

// ---------- B: G8 clip decisions on the UNMIRRORED bench, index vs pixel-center distances ----------
const g8: Record<string, unknown>[] = [];
for (const c of cases) {
  const rig = rigs[c.id], W = rig.cell.w + 2 * c.pad;
  for (const clip of c.clips) {
    const [a, d] = clip.split('/'), cs = cellsBy[c.id].filter((x) => x.key.startsWith(`${clip}/`));
    const out: Record<string, string> = {};
    for (const [name, half] of [['index', 0], ['center', 0.5]] as const) {
      let r = 0, l = 0, none = 0;
      const per: string[] = [];
      for (const x of cs) {
        const i = +x.key.split('/')[2], k = rig.animations.find((q) => q.id === a)!.sources![d as 'south']!.keypoints![i] as Keypoint[];
        const at = (lab: string): [number, number] => { const q = k.find((p) => p.label === lab)!; return [q.x * rig.cell.w + c.pad, q.y * rig.cell.h + c.pad]; };
        const dist = ([px, py]: [number, number]) => { let m = 1e9; for (let p = 0; p < x.mask.length; p++) if (x.mask[p]) m = Math.min(m, Math.hypot((p % W) + half - px, ((p / W) | 0) + half - py)); return m; };
        const dr = dist(at('RIGHT ARM')), dl = dist(at('LEFT ARM'));
        if (Math.min(dr, dl) > 6) { none++; per.push('-'); continue; }
        if (dr + 2 < dl) { r++; per.push('R'); } else if (dl + 2 < dr) { l++; per.push('L'); } else per.push('?');
      }
      const hand = (r + l) * 2 < cs.length ? '?' : r > l ? 'r' : l > r ? 'l' : '?';
      out[name] = `${hand} (${per.join('')}${none ? `, ${none} none` : ''})`;
    }
    g8.push({ case: c.id, clip, ...out, changed: out.index.split(' ')[0] !== out.center.split(' ')[0] });
  }
}

// ---------- C: dressed-keyframe reach per direction vs posed reach (does the keyframe predict the posed extent?) ----------
const reach: Record<string, unknown>[] = [];
for (const c of cases) {
  const rig = rigs[c.id], W = rig.cell.w + 2 * c.pad, side = c.slot === 'off_hand' ? 'LEFT' : 'RIGHT';
  const reachOf = (m: Uint8Array, wr: [number, number]) => { let r = 0; for (let p = 0; p < m.length; p++) if (m[p]) r = Math.max(r, Math.hypot((p % W) + 0.5 - wr[0], ((p / W) | 0) + 0.5 - wr[1])); return r; };
  const kfReach: Record<string, number> = {};
  for (const x of cellsBy[c.id].filter((y) => y.key.startsWith('rest/'))) {
    const d = x.key.split('/')[1], k = rig.rest![d as 'south']!.keypoints as Keypoint[], q = k.find((p) => p.label === `${side} ARM`)!;
    kfReach[d] = +reachOf(x.mask, [q.x * rig.cell.w + c.pad, q.y * rig.cell.h + c.pad]).toFixed(1);
  }
  const allKf = Math.max(...Object.values(kfReach));
  for (const [clip, fs] of Object.entries(real).filter(([k]) => k.startsWith(c.id + ' '))) {
    const d = clip.split(' ')[1].split('/')[1], posed = Math.max(...fs.map((f) => reachOf(f.mask, f.wr)));
    reach.push({ clip, keyframeReachSameDir: kfReach[d], keyframeReachAllDirs: allKf, posedMaxReach: +posed.toFixed(1), exceedsSameDir: posed > kfReach[d] + 3, exceedsAllDirs: posed > allKf + 3 });
  }
}

const report = {
  foreLen: { frames: fore.length, min: +Math.min(...fore).toFixed(2), under3: fore.filter((v) => v < 3).length, under5: fore.filter((v) => v < 5).length },
  tally, worstReal: realRows.filter((r) => r.signed != null).sort((a, b) => (b.signed as number) - (a.signed as number)).slice(0, 8),
  sweep, excuse, poles, daggers, g8: g8.filter((r) => r.changed), g8All: g8, reach,
};
writeFileSync(`${OUT}/held-challenge.json`, JSON.stringify({ ...report, realRows }, null, 1));
console.log(JSON.stringify(report, null, 1));
