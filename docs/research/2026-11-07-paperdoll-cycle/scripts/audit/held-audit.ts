// Audit of held-item assumptions (audit-held.md). Offline, synthetic shapes on real bench keypoints, production code only:
// itemQa (G4, G5, G8, G9, occlusion excuse, loop seam), postProcess (attachHeld, repairDropped), isAction, prompt wording.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/audit/held-audit.ts
import { readFileSync } from 'node:fs';
import { makeImg, type Img } from '../../../../../app/src/lib/image/png.ts';
import { gridPrompt, heldPhrase, isAction, itemQa, postProcess, slotOf, type CellOut } from '../../../../../app/src/lib/items/items.ts';
import { LABELS } from '../../../../../app/src/lib/rig/poses.ts';
import type { Keypoint, Rig } from '../../../../../app/src/lib/rig/rig.ts';

type Pt = [number, number];
const FIX = new URL('../../../../../app/test/fixtures/bench/', import.meta.url);
const bodyRig = (b: string) => JSON.parse(readFileSync(new URL(`body${b}.json`, FIX), 'utf8')).rig as Rig;
const D = (r: number) => (r * 180) / Math.PI;
const wrap = (a: number) => ((a % 360) + 540) % 360 - 180;
const line = (x0: number, y0: number, x1: number, y1: number, wd = 1): Pt[] => { const o: Pt[] = [], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4), l = Math.hypot(x1 - x0, y1 - y0) || 1; for (let i = 0; i <= n; i++) for (let k = -wd / 2; k <= wd / 2; k += 0.25) { const t = i / n; o.push([x0 + t * (x1 - x0) - (k * (y1 - y0)) / l, y0 + t * (y1 - y0) + (k * (x1 - x0)) / l]); } return o; };
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => { const o: Pt[] = []; for (let x = x0; x <= x1; x += 0.25) for (let y = y0; y <= y1; y += 0.25) o.push([x, y]); return o; };
const disc = (cx: number, cy: number, r: number): Pt[] => rect(cx - r, cy - r, cx + r, cy + r).filter(([x, y]) => Math.hypot(x - cx, y - cy) <= r);
/** Rasterize item-local points (origin at `at`, +x along `deg`) into a w x w mask. */
function raster(m: Uint8Array, w: number, at: Pt, pts: Pt[], deg: number, s = 1) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  for (const [x, y] of pts) { const X = Math.floor(at[0] + s * (x * c - y * sn)), Y = Math.floor(at[1] + s * (x * sn + y * c)); if (X >= 0 && Y >= 0 && X < w && Y < w) m[Y * w + X] = 1; }
}
function cellOf(key: string, w: number, mask: Uint8Array, body?: Uint8Array): CellOut {
  const base = makeImg(w, w), layer = makeImg(w, w);
  for (let p = 0; p < mask.length; p++) { if (mask[p]) layer.data.set([150, 90, 40, 255], p * 4); if (body?.[p]) base.data.set([90, 90, 90, 255], p * 4); }
  return { key, call: 0, base, input: base, out: layer, layer, mask, area: mask.reduce((s, v) => s + v, 0), outBand: 0, baseBand: 0, specks: 0, pinholes: 0, shifted: false, offset: [0, 0], stray: 0, posed: true } as CellOut;
}
const kp = (f: Keypoint[], l: string, cell: { w: number; h: number }): Pt => { const q = f.find((p) => p.label === l)!; return [q.x * cell.w, q.y * cell.h]; };
const fails = (q: ReturnType<typeof itemQa>) => [...q.failCalls.values()].flat();
const out: Record<string, unknown> = {};

// ---------- 0. forearm swing between consecutive frames (real bench keypoints) ----------
const swing: Record<string, unknown>[] = [];
for (const b of ['A', 'B', 'C', 'N']) {
  const rig = bodyRig(b);
  for (const a of rig.animations) for (const [d, src] of Object.entries(a.sources ?? {})) for (const side of ['RIGHT', 'LEFT']) {
    const ang = src!.keypoints!.map((f) => { const e = kp(f, `${side} ELBOW`, rig.cell), wr = kp(f, `${side} ARM`, rig.cell); return D(Math.atan2(wr[1] - e[1], wr[0] - e[0])); });
    const steps = ang.slice(1).map((v, i) => Math.abs(wrap(v - ang[i])));
    swing.push({ body: b, clip: `${a.id}/${d}`, side, maxStep: +Math.max(...steps).toFixed(1), seam: +Math.abs(wrap(ang[0] - ang.at(-1)!)).toFixed(1), range: +(Math.max(...ang) - Math.min(...ang)).toFixed(1) });
  }
}
out.forearmSwing = { clips: swing.length, locoOver30: swing.filter((s) => !isAction(s.clip as string) && (s.maxStep as number) > 30).map((s) => `${s.body} ${s.clip} ${s.side} ${s.maxStep}`), locoMaxStep: Math.max(...swing.filter((s) => !isAction(s.clip as string)).map((s) => s.maxStep as number)) };

// ---------- 1. G9/G5/G8 on item kinds that are not rigid blades, posed on real walk keypoints ----------
// Shapes are item-local (+x away from the grip). rigid = turns with the forearm; hang = gravity keeps it pointing down.
type Kind = { name: string; draw: (m: Uint8Array, w: number, wr: Pt, fore: number, fore0: number, i: number, s: number) => void };
const rigidAngle = (fore: number, fore0: number) => 90 + (fore - fore0); // dressed "pointing down" at rest, then turns with the hand
const KINDS: Kind[] = [
  { name: 'sword (rigid control)', draw: (m, w, wr, f, f0, _i, s) => raster(m, w, wr, [...line(-3, 0, 28, 0, 3), ...line(2, -4, 2, 4, 2)], rigidAngle(f, f0), s) },
  { name: 'lantern on a chain (hangs)', draw: (m, w, wr, _f, _f0, _i, s) => raster(m, w, wr, [...line(1, 0, 9, 0, 1), ...rect(9, -3, 17, 3)], 90, s) },
  { name: 'flail (rigid handle, hanging chain + ball)', draw: (m, w, wr, f, f0, _i, s) => { const a = rigidAngle(f, f0) * Math.PI / 180, tip: Pt = [wr[0] + s * 10 * Math.cos(a), wr[1] + s * 10 * Math.sin(a)]; raster(m, w, wr, line(-2, 0, 10, 0, 2), rigidAngle(f, f0), s); raster(m, w, tip, [...line(0, 0, 8, 0, 1), ...disc(11, 0, 3)], 90, s); } },
  { name: 'banner (rigid pole, waving cloth)', draw: (m, w, wr, f, f0, i, s) => raster(m, w, wr, [...line(-4, 0, 30, 0, 2), ...rect(16, 1, 30, i % 2 ? 6 : 12)], rigidAngle(f, f0) - 180, s) },
  { name: 'torch, flickering flame (rigid)', draw: (m, w, wr, f, f0, i, s) => raster(m, w, wr, [...line(-2, 0, 12, 0, 2), ...rect(12, -2, 12 + [6, 3, 7, 2][i % 4], 2)], rigidAngle(f, f0) - 180, s) },
  { name: 'orb floating 4 px above the palm (rigid)', draw: (m, w, wr, _f, _f0, _i, s) => raster(m, w, wr, disc(0, -8, 3.5), 0, s) },
];
const g = (msgs: string[], tag: string) => msgs.filter((x) => x.startsWith(tag)).length;
const kindRows: Record<string, unknown>[] = [];
for (const b of ['A', 'N']) {
  const rig = bodyRig(b), w = rig.cell.w, s = w / 64;
  for (const kind of KINDS) {
    let clips = 0; const t = { G9: 0, G5: 0, G4: 0, G8warn: 0, occl: 0, seam: 0 };
    for (const d of ['south', 'east', 'north']) {
      const a = rig.animations.find((x) => x.id === 'walk')!, ks = a.sources![d as 'south']!.keypoints!;
      const fore = ks.map((f) => { const e = kp(f, 'RIGHT ELBOW', rig.cell), wr = kp(f, 'RIGHT ARM', rig.cell); return D(Math.atan2(wr[1] - e[1], wr[0] - e[0])); });
      const cells = ks.map((f, i) => { const m = new Uint8Array(w * w); kind.draw(m, w, kp(f, 'RIGHT ARM', rig.cell), fore[i], fore[0], i, s); return cellOf(`walk/${d}/${i}`, w, m); });
      const q = itemQa(rig, slotOf('main_hand'), 'green', cells, 0), f = fails(q);
      clips++; t.G9 += +!!g(f, 'G9'); t.G5 += +!!g(f, 'G5'); t.G4 += +!!g(f, 'G4'); t.G8warn += +q.warnings.some((x) => x.startsWith('G8') || x.includes(': G8')); t.occl += +q.warnings.some((x) => x.includes('Occlusion')); t.seam += +q.warnings.some((x) => x.includes('when the move loops'));
    }
    kindRows.push({ body: `${b} (${w} px)`, kind: kind.name, clips, failG9: t.G9, failG5: t.G5, failG4: t.G4, warnG8: t.G8warn, warnSeam: t.seam });
  }
}
// off hand (the far arm in east views swings up to 49 deg per frame on the bench)
for (const b of ['A', 'B', 'C', 'N']) {
  const rig = bodyRig(b), w = rig.cell.w, s = w / 64;
  for (const kind of KINDS.slice(0, 3)) for (const d of ['east']) {
    const a = rig.animations.find((x) => x.id === 'walk')!, ks = a.sources![d as 'south']!.keypoints!;
    const fore = ks.map((f) => { const e = kp(f, 'LEFT ELBOW', rig.cell), wr = kp(f, 'LEFT ARM', rig.cell); return D(Math.atan2(wr[1] - e[1], wr[0] - e[0])); });
    const cells = ks.map((f, i) => { const m = new Uint8Array(w * w); kind.draw(m, w, kp(f, 'LEFT ARM', rig.cell), fore[i], fore[0], i, s); return cellOf(`walk/${d}/${i}`, w, m); });
    const q = itemQa(rig, slotOf('off_hand'), 'green', cells, 0), f = fails(q);
    kindRows.push({ body: `${b} (${w} px)`, kind: `${kind.name}, off hand, walk/${d}`, clips: 1, fails: f, warnings: q.warnings });
  }
}
out.kinds = kindRows;

// ---------- 2. attachHeld: valid parts that are not one connected piece ----------
const still = (w: number, wr: Pt): Keypoint[] => LABELS.map((label) => ({ label, x: (label === 'RIGHT ARM' ? wr[0] : label === 'RIGHT ELBOW' ? wr[0] : label.startsWith('LEFT') ? w * 0.7 : w * 0.5) / w, y: (label === 'RIGHT ARM' ? wr[1] : label === 'RIGHT ELBOW' ? wr[1] - 6 : w * 0.4) / w }));
function stillRig(w: number, wr: Pt, n = 2): Rig {
  const k = still(w, wr);
  return { cell: { w, h: w }, pivot: { x: w / 2, y: w - 4 }, baseItem: 'base', baseHash: 'sha256:t', directions: [{ id: 'south' }], rest: { south: { image: 'sha256:r', keypoints: k } }, animations: [{ id: 'idle', cells: n, loop: true, sources: { south: { route: 'skeleton-v3', reference: 'sha256:t', keypoints: Array.from({ length: n }, () => k), provenance: [] } } }] } as unknown as Rig;
}
const attachRows: Record<string, unknown>[] = [];
const attach = (name: string, w: number, wr: Pt, pts: Pt[]) => {
  const m = new Uint8Array(w * w); raster(m, w, wr, pts, 0);
  const c = cellOf('idle/south/0', w, m), before = c.area, rig = stillRig(w, wr, 1);
  (rig.animations[0] as { cells: number }).cells = 1;
  postProcess(rig, slotOf('main_hand'), [c], {}, 0);
  attachRows.push({ case: name, canvas: w, itemPx: before, deletedPx: before - c.area, deletedShare: +((before - c.area) / before).toFixed(2) });
};
// nunchaku: stick in hand, a 3-link chain drawn as separate dots, second stick (as large as the first)
attach('nunchaku, chain links 2 px apart', 64, [20, 20], [...line(-2, 0, 10, 0, 2), ...[13, 16, 19].flatMap((x) => rect(x, 0, x, 0)), ...line(22, 0, 34, 0, 2)]);
attach('orb above the palm + 4 sparkles (3x3) 5 px away', 64, [30, 30], [...disc(0, -9, 4), ...[[-10, -9], [10, -9], [0, -19], [0, 1.5]].flatMap(([x, y]) => rect(x - 1, y - 1, x + 1, y + 1)).filter(([, y]) => y < -3)]);
attach('crossbow + bolt in flight 6 px ahead', 64, [20, 30], [...line(-2, 0, 14, 0, 3), ...line(14, -6, 14, 6, 1), ...line(20, 0, 30, 0, 1)]);
for (const s of [1, 1.5, 2.5, 4]) {
  const canvas = Math.round(64 * s), fist = Math.round(3 * s);
  // staff gripped near its middle by the right hand; the other hand closes over it further along, covering `fist` px of shaft
  attach(`two-handed staff, far hand covers ${fist} px (x${s})`, canvas, [canvas / 2 - 10 * s, canvas / 2], [...line(-20 * s, 0, 10 * s, 0, 2), ...line(10 * s + fist + 1, 0, 22 * s, 0, 2)]);
  // held-pommel.test.ts geometry scaled with the body: blade from the fist down-right, 3x2 pommel beside the wrist
  attach(`sword, pommel beside the wrist (x${s})`, canvas, [canvas / 2, canvas / 2], [...line(3 * s, 3 * s, 28 * s, 28 * s, 2), ...rect(-4 * s, -3.5 * s, -4 * s + 2, -3.5 * s + 1)]);
}
// a long item in the far hand of a side view passes behind the torso: the stand-in body splits it in two (8-frame clip, then QA)
{
  const w = 64, body = new Uint8Array(w * w), wr: Pt = [24, 34], rig = stillRig(w, wr, 8);
  (rig.animations[0] as { id: string }).id = 'walk';
  for (let y = 10; y < 60; y++) for (let x = 27; x < 39; x++) body[y * w + x] = 1;
  const cells = Array.from({ length: 8 }, (_, i) => { const m = new Uint8Array(w * w); raster(m, w, wr, line(-12, 0, 24, -6, 2), 0); for (let p = 0; p < m.length; p++) if (body[p]) m[p] = 0; return cellOf(`walk/south/${i}`, w, m, body); });
  const before = cells.reduce((s, c) => s + c.area, 0);
  postProcess(rig, slotOf('main_hand'), cells, {}, 0);
  const q = itemQa(rig, slotOf('main_hand'), 'green', cells, 0);
  attachRows.push({ case: 'spear in the hand behind the torso, tip visible past the far side (8-frame walk)', canvas: w, itemPx: before, deletedPx: before - cells.reduce((s, c) => s + c.area, 0), deletedShare: +(1 - cells.reduce((s, c) => s + c.area, 0) / before).toFixed(2), qaFails: fails(q), qaWarnings: q.warnings, strayPxMetric: q.qa.strayPx });
}
out.attachHeld = attachRows;

// ---------- 3. G4 has no occlusion excuse: an off-hand buckler sliding partly behind the torso, its wrist moving with it ----------
{
  const w = 64, body = new Uint8Array(w * w), shifts = [0, 0, 5, 8, 5, 0, 0, 0], rows: Record<string, unknown>[] = [];
  for (let y = 10; y < 60; y++) for (let x = 34; x < 46; x++) body[y * w + x] = 1; // torso the buckler slides behind
  for (const scale of [[0, 0, 5, 8, 5, 0, 0, 0], [0, 0, 3, 5, 3, 0, 0, 0]]) {
    const rig = stillRig(w, [26, 34], 8), src = rig.animations[0].sources!.south!;
    (rig.animations[0] as { id: string }).id = 'walk';
    src.keypoints = scale.map((sh) => still(w, [44, 34]).map((p) => (p.label === 'LEFT ARM' ? { ...p, x: (26 + sh) / w, y: 34 / w } : p)));
    const cells = scale.map((sh, i) => { const m = new Uint8Array(w * w); raster(m, w, [26 + sh, 34], rect(-4, -5, 6, 5), 0); for (let p = 0; p < m.length; p++) if (body[p]) m[p] = 0; return cellOf(`walk/south/${i}`, w, m, body); });
    const q = itemQa(rig, slotOf('off_hand'), 'green', cells, 0);
    rows.push({ shifts: scale.join(), areas: cells.map((c) => c.area).join(), fails: fails(q), warnings: q.warnings });
  }
  void shifts;
  out.g4Occlusion = rows;
}

// ---------- 4. G8 contact limit is absolute: the bench's real 2.7 px p95 gap scaled to bigger bodies ----------
{
  const rows: Record<string, unknown>[] = [];
  for (const w of [64, 96, 160, 256]) {
    const gap = Math.round(2.7 * w / 64 * 10) / 10, wr: Pt = [w / 2 - 10, w / 2], rig = stillRig(w, wr, 2);
    for (const k of rig.animations[0].sources!.south!.keypoints!) for (const p of k) if (p.label === 'LEFT ARM') { p.x = (w / 2 + 12) / w; p.y = 0.5; }
    const cells = [0, 1].map((i) => { const m = new Uint8Array(w * w); raster(m, w, wr, line(gap, 0, gap + 20 * w / 64, 0, 3), 90); return cellOf(`idle/south/${i}`, w, m); });
    const q = itemQa(rig, slotOf('main_hand'), 'green', cells, 0);
    rows.push({ cell: w, scaledGapPx: gap, warnings: q.warnings.filter((x) => x.includes('G8')) });
  }
  out.g8Scale = rows;
}

// ---------- 5. repairDropped: a legitimately pulsing item on near-rest frames is replaced by the static keyframe ----------
{
  const w = 64, wr: Pt = [24, 34], rig = stillRig(w, wr, 4), r = [6, 6, 2, 6];
  const cells = r.map((rad, i) => { const m = new Uint8Array(w * w); raster(m, w, wr, disc(0, -10, rad), 0); return cellOf(`idle/south/${i}`, w, m); });
  const key = makeImg(w, w); { const m = new Uint8Array(w * w); raster(m, w, wr, disc(0, -10, 6), 0); for (let p = 0; p < m.length; p++) if (m[p]) key.data.set([150, 90, 40, 255], p * 4); }
  const before = cells.map((c) => c.area), res = postProcess(rig, slotOf('main_hand'), cells, { south: key as Img }, 0);
  const q = itemQa(rig, slotOf('main_hand'), 'green', cells, 0);
  out.repairDropped = { areasBefore: before, areasAfter: cells.map((c) => c.area), repaired: res.repaired, warnings: q.warnings.filter((x) => x.startsWith('R1')) };
}

// ---------- 6. locomotion is decided by the move's name ----------
out.isAction = Object.fromEntries(['walk', 'run', 'idle', 'jog', 'sprint', 'sneak', 'march', 'strafe', 'run-slash', 'idle-spin-staff', 'rune-cast', 'walkie-talkie'].map((n) => [n, isAction(`${n}/south`) ? 'action (G5/G9 off)' : 'locomotion (G5/G9 on)']));

// ---------- 7. what the dress, pose and grid prompts tell PixelLab for non-weapon items ----------
out.prompts = {
  dressMain: heldPhrase('a lit torch', 'main_hand'),
  dressShieldMain: heldPhrase('a round wooden shield', 'main_hand'),
  dressOff: heldPhrase('a bouquet of flowers', 'off_hand'),
  grid: gridPrompt({ item: 'a glowing magic orb with sparkles', slot: 'main_hand', key: 'green', anim: 'walk', dir: 'south', n: 8, refs: ['south'], cell: { w: 96, h: 96 } }).split('. ').filter((s) => /hand|effects/.test(s)),
};
console.log(JSON.stringify(out, null, 1));
