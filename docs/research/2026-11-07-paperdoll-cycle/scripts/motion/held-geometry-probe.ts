// Offline motion and held-equipment geometry probe (2026-11-07 paperdoll cycle, motion researcher).
// Replays the frozen benchmark's real held-item outputs (app/test/fixtures/bench: a-sword96, a-axe96, a-bow96) through the
// production extraction/cleanup/QA (app/scripts/bench.ts runCase -> extractCell, postProcess, itemQa, dirGate), then applies
// synthetic damage with known ground truth and re-runs the same production gates. No network, no PixelLab, no app edits.
// Run from the repo root:  node docs/research/2026-11-07-paperdoll-cycle/scripts/motion/held-geometry-probe.ts [outDir]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runCase } from '../../../../../app/scripts/bench.ts';
import { alignedIoU, angleDiff, axisOf, dirGate, GATES, itemQa, padImg, padOf, slotOf, type CellOut, type Route } from '../../../../../app/src/lib/items/items.ts';
import { centroid, maskOf } from '../../../../../app/src/lib/image/similarity.ts';
import { makeImg, type Img } from '../../../../../app/src/lib/image/png.ts';
import { layerFrame, over, rigFrame, unionFrame } from '../../../../../app/src/lib/compose/compose.ts';
import { autoFrame } from '../../../../../app/src/studio/characterConfig.ts';
import type { Keypoint, Rig } from '../../../../../app/src/lib/rig/rig.ts';

const OUT = process.argv[2] ?? 'C:/Programming_Files/Shilocity/PixelLab/checkouts/cycle-2026-11-07/motion';
mkdirSync(OUT, { recursive: true });
const FIX = new URL('../../../../../app/test/fixtures/bench/', import.meta.url);
const cases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')) as { id: string; body: string; slot: string; key: Route; pad: number; clips: string[] }[];
const HELD = cases.filter((c) => c.pad);

// ---------- helpers (geometry only; QA is always production code) ----------
const sum = (m: Uint8Array) => m.reduce((a, b) => a + b, 0);
const clone = (c: CellOut): CellOut => ({ ...c, layer: { w: c.layer.w, h: c.layer.h, data: new Uint8ClampedArray(c.layer.data) }, mask: new Uint8Array(c.mask) });
const kp = (rig: Rig, key: string, label: string, pad: number): [number, number] | undefined => {
  const [a, d, i] = key.split('/');
  const k = (a === 'rest' ? rig.rest?.[d as 'south']?.keypoints : rig.animations.find((x) => x.id === a)?.sources?.[d as 'south']?.keypoints?.[+i]) as Keypoint[] | undefined;
  const q = k?.find((p) => p.label === label);
  return q ? [q.x * rig.cell.w + pad, q.y * rig.cell.h + pad] : undefined;
};
/** Remap item pixels with f (pixel center -> pixel center). Pixels mapped off the canvas are dropped and counted. */
function remap(c: CellOut, f: (x: number, y: number) => [number, number]): { cell: CellOut; dropped: number } {
  const o = clone(c), { w, h } = c.layer, layer = makeImg(w, h), mask = new Uint8Array(w * h);
  let dropped = 0;
  for (let p = 0; p < c.mask.length; p++) {
    if (!c.mask[p]) continue;
    const [X, Y] = f((p % w) + 0.5, ((p / w) | 0) + 0.5), x = Math.floor(X), y = Math.floor(Y);
    if (x < 0 || y < 0 || x >= w || y >= h) { dropped++; continue; }
    const q = y * w + x;
    layer.data.set(c.layer.data.subarray(p * 4, p * 4 + 4), q * 4);
    mask[q] = 1;
  }
  o.layer = layer; o.mask = mask; o.area = sum(mask);
  return { cell: o, dropped };
}
const reflectAbout = (c: CellOut, [px, py]: [number, number]) => remap(c, (x, y) => [2 * px - x, 2 * py - y]);
const flipAboutX = (c: CellOut, axis: number) => remap(c, (x, y) => [2 * axis - x, y]);
const shift = (c: CellOut, dx: number, dy: number) => remap(c, (x, y) => [x + dx, y + dy]);
const truncate = (c: CellOut, at: [number, number], r: number) => remap(c, (x, y) => (Math.hypot(x - at[0], y - at[1]) <= r ? [x, y] : [-1e9, -1e9]));
const verdictOf = (clip: string, fails: string[], warnings: string[]) => {
  const hit = (m: string) => m.includes(` ${clip}/`) || m.includes(` ${clip}:`) || m.includes(` ${clip} `);
  const f = fails.filter(hit), w = warnings.filter(hit);
  return f.length ? `fail:${[...new Set(f.map((m) => m.split(' ')[0]))].sort().join('+')}` : w.length ? `warn:${[...new Set(w.map((m) => m.split(' ')[0]))].sort().join('+')}` : 'pass';
};
const codes = (v: string) => new Set(v === 'pass' ? [] : v.split(':')[1].split('+').map((c) => `${v.split(':')[0]}:${c}`));
function gate(rig: Rig, c: { slot: string; key: Route }, pad: number, cells: CellOut[], keys: Record<string, Img>, clips: string[]) {
  const slot = slotOf(c.slot), q = itemQa(rig, slot, c.key, cells, 0, GATES.keyOutsidePosed, pad), h = dirGate(slot, cells, keys, rig);
  const fails = [...q.failCalls.values(), ...h.fails.values()].flat(), warnings = [...q.warnings, ...h.warnings];
  return { verdicts: Object.fromEntries(clips.map((k) => [k, verdictOf(k, fails, warnings)])), fails, warnings };
}
/** Signed item direction relative to the forearm (deg, -180..180): wrist -> item centroid against elbow -> wrist. */
function signedRel(rig: Rig, slotId: string, c: CellOut, pad: number) {
  const side = slotId === 'off_hand' ? 'LEFT' : 'RIGHT', w = kp(rig, c.key, `${side} ARM`, pad), e = kp(rig, c.key, `${side} ELBOW`, pad), ct = centroid(c.mask, c.layer.w);
  if (!w || !e || !ct) return null;
  const cx = ct[0] + 0.5 - w[0], cy = ct[1] + 0.5 - w[1];
  let reach = 0;
  for (let p = 0; p < c.mask.length; p++) if (c.mask[p]) reach = Math.max(reach, Math.hypot((p % c.layer.w) + 0.5 - w[0], ((p / c.layer.w) | 0) + 0.5 - w[1]));
  const off = Math.hypot(cx, cy), fore = Math.atan2(w[1] - e[1], w[0] - e[0]), rel = ((Math.atan2(cy, cx) - fore) * 180) / Math.PI;
  // oriented principal axis: the production unsigned axis (axisOf), pointed from the wrist toward the item centroid
  const ax = axisOf(c.mask, c.layer.w);
  let orel: number | null = null;
  if (ax != null) { let t = ax; if (Math.cos(t) * cx + Math.sin(t) * cy < 0) t += Math.PI; orel = ((((t - fore) * 180) / Math.PI + 540) % 360) - 180; }
  return { rel: ((rel + 540) % 360) - 180, orel, off, reach, confident: reach > 0 && off >= 0.25 * reach };
}
const wrapD = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const nearestPx = (m: Uint8Array, w: number, [x, y]: [number, number]) => { let d = Infinity; for (let p = 0; p < m.length; p++) if (m[p]) d = Math.min(d, Math.hypot((p % w) + 0.5 - x, ((p / w) | 0) + 0.5 - y)); return d; };

const report: Record<string, unknown> = { generated: new Date().toISOString(), node: process.version, gates: GATES };
const mutationRows: Record<string, unknown>[] = [];
const signed: { case: string; key: string; rel: number; orel: number | null; off: number; reach: number; confident: boolean; kind: 'real' | 'reversed' }[] = [];
const contacts: { case: string; key: string; gap: number }[] = [];
const reachRows: Record<string, unknown>[] = [];
const roundTrip: Record<string, unknown>[] = [];

for (const c of HELD) {
  const res = await runCase(c as never), body = JSON.parse(readFileSync(new URL(`body${c.body}.json`, FIX), 'utf8')), rig = body.rig as Rig;
  const pad = c.pad, W = rig.cell.w + 2 * pad, side = c.slot === 'off_hand' ? 'LEFT' : 'RIGHT';
  const keys: Record<string, Img> = Object.fromEntries(res.cells.filter((x) => x.key.startsWith('rest/')).map((x) => [x.key.split('/')[1], x.layer]));
  const posed = res.cells.filter((x) => !x.key.startsWith('rest/'));
  const base = gate(rig, c, pad, posed, keys, c.clips);
  report[`baseline:${c.id}`] = { verdicts: base.verdicts, fails: base.fails, warnings: base.warnings };

  // real-frame descriptors (valid-output controls)
  for (const x of posed) {
    const s = signedRel(rig, c.slot, x, pad), wr = kp(rig, x.key, `${side} ARM`, pad);
    if (s) signed.push({ case: c.id, key: x.key, ...s, kind: 'real' });
    if (wr && x.area) contacts.push({ case: c.id, key: x.key, gap: +nearestPx(x.mask, W, wr).toFixed(2) });
  }
  // reach from the requested wrist on the dressed keyframes and posed frames; margin to the canvas
  for (const x of res.cells) {
    const wr = kp(rig, x.key, `${side} ARM`, pad);
    if (!wr || !x.area) continue;
    let reach = 0, minMargin = Infinity, beyond = { l: 0, t: 0, r: 0, b: 0 };
    for (let p = 0; p < x.mask.length; p++) if (x.mask[p]) {
      const X = p % W, Y = (p / W) | 0;
      reach = Math.max(reach, Math.hypot(X + 0.5 - wr[0], Y + 0.5 - wr[1]));
      minMargin = Math.min(minMargin, X, Y, W - 1 - X, W - 1 - Y);
      beyond = { l: Math.max(beyond.l, pad - X), t: Math.max(beyond.t, pad - Y), r: Math.max(beyond.r, X - (pad + rig.cell.w - 1)), b: Math.max(beyond.b, Y - (pad + rig.cell.h - 1)) };
    }
    reachRows.push({ case: c.id, key: x.key, reach: +reach.toFixed(2), minMargin, beyondRigCell: beyond });
  }

  // ---------- synthetic damage on real frames ----------
  for (const clip of c.clips) {
    const [anim, dir] = clip.split('/'), cs = posed.filter((x) => x.key.startsWith(`${clip}/`)), idx = (k: string) => +k.split('/')[2];
    const run = (name: string, mutate: (x: CellOut) => { cell: CellOut; dropped: number } | null, frames: number[], playlist?: number[]) => {
      let dropped = 0, applied = 0;
      const cells = posed.map((x) => {
        if (!x.key.startsWith(`${clip}/`) || !frames.includes(idx(x.key))) return x;
        const m = mutate(x);
        if (!m) return x;
        dropped += m.dropped; applied++;
        return m.cell;
      });
      let r = rig;
      if (playlist) { r = structuredClone(rig); r.animations.find((a) => a.id === anim)!.frames = playlist.map((cell) => ({ cell, ms: 100 })); }
      if (!applied && !playlist) return;
      const g = gate(r, c, pad, cells, keys, c.clips), before = codes(base.verdicts[clip]), after = codes(g.verdicts[clip]);
      const added = [...after].filter((k) => !before.has(k));
      // message level: any new fail or warning text naming this clip (a second G8 warning in an already-warned clip counts)
      const mine = (m: string) => m.includes(` ${clip}/`) || m.includes(` ${clip}:`) || m.includes(` ${clip} `);
      const newFails = g.fails.filter((m) => mine(m) && !base.fails.includes(m)), newWarns = g.warnings.filter((m) => mine(m) && !base.warnings.includes(m));
      mutationRows.push({ case: c.id, clip, mutation: name, frames, applied, dropped, baseline: base.verdicts[clip], mutated: g.verdicts[clip], newCodes: added, newFails, newWarns,
        caught: newFails.length ? 'fail' : newWarns.length ? 'warn' : 'silent' });
    };
    const wristOf = (x: CellOut) => kp(rig, x.key, `${side} ARM`, pad)!;
    // 1. 180-degree reversal about the gripping wrist: one interior frame, then a persistent reversal from frame 4
    run('reverse-about-wrist f3', (x) => reflectAbout(x, wristOf(x)), [3]);
    run('reverse-about-wrist f4-7', (x) => reflectAbout(x, wristOf(x)), [4, 5, 6, 7]);
    // 2. tip/hilt swap in place: 180 degrees about the item's own centroid (same axis, same location, wrong end in hand)
    run('tip-hilt swap f3', (x) => { const ct = centroid(x.mask, W); return ct ? reflectAbout(x, [ct[0] + 0.5, ct[1] + 0.5]) : null; }, [3]);
    // 3. wrong side: mirror the item layer about the body pivot (other hand position)
    run('mirror-about-pivot f3', (x) => flipAboutX(x, rig.pivot.x + pad), [3]);
    run('mirror-about-pivot whole clip', (x) => flipAboutX(x, rig.pivot.x + pad), [0, 1, 2, 3, 4, 5, 6, 7]);
    // 4. detached from the hand: move frame 3 outward along wrist -> centroid by d px
    for (const d of [2, 3, 4, 5, 6, 8]) run(`detach ${d}px f3`, (x) => { const wr = wristOf(x), ct = centroid(x.mask, W); if (!ct) return null; const v = [ct[0] + 0.5 - wr[0], ct[1] + 0.5 - wr[1]], n = Math.hypot(v[0], v[1]) || 1; return shift(x, Math.round((d * v[0]) / n), Math.round((d * v[1]) / n)); }, [3]);
    // 5. cropped long weapon: keep only pixels within 60 % / 80 % of the frame's reach from the wrist
    for (const k of [0.6, 0.8]) run(`truncate ${k * 100}% reach f3`, (x) => { const wr = wristOf(x); let reach = 0; for (let p = 0; p < x.mask.length; p++) if (x.mask[p]) reach = Math.max(reach, Math.hypot((p % W) + 0.5 - wr[0], ((p / W) | 0) + 0.5 - wr[1])); return truncate(x, wr, k * reach); }, [3]);
    // 6. playback: a reversed frame that the playlist skips, and a ping-pong playlist with a reversed frame
    run('reverse f3, playlist skips odd cells', (x) => reflectAbout(x, wristOf(x)), [3], [0, 2, 4, 6]);
    run('reverse f3, ping-pong playlist', (x) => reflectAbout(x, wristOf(x)), [3], [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1]);
    // valid controls: playlist permutations without damage must not change the verdict
    run('control: ping-pong playlist', () => null, [], [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1]);
    run('control: holds playlist', () => null, [], [0, 0, 1, 2, 2, 3, 4, 5, 6, 7, 7]);
    run('control: shift whole clip 0px', (x) => shift(x, 0, 0), [0, 1, 2, 3, 4, 5, 6, 7]);
    // reversed-frame signed descriptors
    for (const x of cs) { const m = reflectAbout(x, wristOf(x)).cell, s = signedRel(rig, c.slot, m, pad); if (s) signed.push({ case: c.id, key: x.key, ...s, kind: 'reversed' }); }
  }

  // ---------- metamorphic: add common padding P, shift the layer pivot by P, expect identical QA and world placement ----------
  for (const P of [4, 8]) {
    const grow = (x: CellOut): CellOut => {
      const g = clone(x), m = new Uint8Array((W + 2 * P) ** 2);
      g.base = padImg(x.base, P); g.layer = padImg(x.layer, P); g.out = padImg(x.out, P); g.input = padImg(x.input, P);
      for (let p = 0; p < x.mask.length; p++) if (x.mask[p]) m[((((p / W) | 0) + P) * (W + 2 * P)) + (p % W) + P] = 1;
      g.mask = m;
      if (x.rawKeyOutside) { const rm = new Uint8Array(m.length); for (let p = 0; p < x.rawKeyOutside.mask.length; p++) if (x.rawKeyOutside.mask[p]) rm[((((p / W) | 0) + P) * (W + 2 * P)) + (p % W) + P] = 1; g.rawKeyOutside = { ...x.rawKeyOutside, mask: rm }; }
      return g;
    };
    const big = posed.map(grow), bigKeys = Object.fromEntries(Object.entries(keys).map(([d, im]) => [d, padImg(im, P)]));
    const g = gate(rig, c, pad + P, big, bigKeys, c.clips);
    const norm = (s: string[]) => s.map((m) => m.replace(/[\d.]+/g, '#')).sort();
    const sameVerdicts = JSON.stringify(g.verdicts) === JSON.stringify(base.verdicts);
    const diffMsgs = [...new Set([...norm(g.fails), ...norm(g.warnings)])].filter((m) => !new Set([...norm(base.fails), ...norm(base.warnings)]).has(m));
    // world placement through the production frame helpers: base at the rig pivot, layer at its own pivot
    let pixelDiffs = 0;
    for (const [i, x] of posed.entries()) {
      const L0 = { cell: { w: W, h: W }, pivot: { x: rig.pivot.x + pad, y: rig.pivot.y + pad } }, L1 = { cell: { w: W + 2 * P, h: W + 2 * P }, pivot: { x: rig.pivot.x + pad + P, y: rig.pivot.y + pad + P } };
      const draw = (L: typeof L0, layer: Img, base: Img) => {
        const f = unionFrame([rigFrame(rig), layerFrame(rig, L0), layerFrame(rig, L1)]), o = makeImg(f.w, f.h);
        over(o, base, f.x - rig.pivot.x, f.y - rig.pivot.y); over(o, layer, f.x - L.pivot.x, f.y - L.pivot.y); return o;
      };
      const rigBase = makeImg(rig.cell.w, rig.cell.h);
      for (let y = 0; y < rig.cell.h; y++) rigBase.data.set(x.base.data.subarray(((y + pad) * W + pad) * 4, ((y + pad) * W + pad + rig.cell.w) * 4), y * rig.cell.w * 4);
      const a = draw(L0, x.layer, rigBase), b = draw(L1, big[i].layer, rigBase);
      for (let k = 0; k < a.data.length; k++) if (a.data[k] !== b.data[k]) { pixelDiffs++; }
    }
    roundTrip.push({ case: c.id, P, sameVerdicts, newMessages: diffMsgs, composedByteDiffs: pixelDiffs, baselineVerdicts: base.verdicts, paddedVerdicts: g.verdicts });
  }

  // ---------- mirror invariance under the production label convention (labels kept, x flipped) ----------
  {
    const fr = structuredClone(rig) as Rig, axis = rig.pivot.x; // pixel-edge pivot: flipping about x = pivot keeps the pivot
    const flipK = (k: Keypoint[]) => k.map((q) => ({ ...q, x: +(2 * axis / rig.cell.w - q.x).toFixed(5) }));
    for (const a of fr.animations) for (const s of Object.values(a.sources ?? {})) if (s?.keypoints) s.keypoints = s.keypoints.map(flipK);
    for (const r of Object.values(fr.rest ?? {})) if (r) r.keypoints = flipK(r.keypoints);
    const flipImg = (im: Img) => { const o = makeImg(im.w, im.h); for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const X = 2 * (axis + pad) - 1 - x; if (X >= 0 && X < im.w) o.data.set(im.data.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4), (y * im.w + X) * 4); } return o; };
    const fl = posed.map((x) => { const g = clone(x); g.base = flipImg(x.base); g.layer = flipImg(x.layer); g.out = flipImg(x.out); g.mask = maskOf(g.layer); g.area = sum(g.mask); return g; });
    const fk = Object.fromEntries(Object.entries(keys).map(([d, im]) => [d, flipImg(im)]));
    const kept = gate(fr, c, pad, fl, fk, c.clips);
    // anatomical labels (a provider estimate of a truly mirrored body names the screen-left hand LEFT): swap RIGHT/LEFT
    const sw = structuredClone(fr) as Rig, swap = (k: Keypoint[]) => k.map((q) => ({ ...q, label: q.label.startsWith('RIGHT') ? q.label.replace('RIGHT', 'LEFT') : q.label.startsWith('LEFT') ? q.label.replace('LEFT', 'RIGHT') : q.label }));
    for (const a of sw.animations) for (const s of Object.values(a.sources ?? {})) if (s?.keypoints) s.keypoints = s.keypoints.map(swap);
    for (const r of Object.values(sw.rest ?? {})) if (r) r.keypoints = swap(r.keypoints);
    const anat = gate(sw, c, pad, fl, fk, c.clips);
    report[`mirror:${c.id}`] = { baseline: base.verdicts, flippedLabelsKept: kept.verdicts, flippedLabelsAnatomical: anat.verdicts };
  }
}

// ---------- signed orientation separation ----------
const real = signed.filter((s) => s.kind === 'real'), rev = signed.filter((s) => s.kind === 'reversed');
const pairDelta = (list: typeof signed) => {
  const out: { case: string; from: string; to: string; delta: number; confident: boolean }[] = [];
  for (const s of list) { const [a, d, i] = s.key.split('/'), n = list.find((t) => t.case === s.case && t.key === `${a}/${d}/${+i + 1}`); if (n) out.push({ case: s.case, from: s.key, to: n.key, delta: +wrapD(s.rel, n.rel).toFixed(1), confident: s.confident && n.confident }); }
  return out;
};
const realD = pairDelta(real);
// delta of a reversed frame against its real neighbours
const revD = rev.flatMap((s) => { const [a, d, i] = s.key.split('/'); return real.filter((t) => t.case === s.case && (t.key === `${a}/${d}/${+i - 1}` || t.key === `${a}/${d}/${+i + 1}`)).map((t) => ({ case: s.case, key: s.key, delta: +wrapD(s.rel, t.rel).toFixed(1), confident: s.confident && t.confident })); });
const q = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : NaN; };
const sep = (thr: number) => ({ threshold: thr, realPairsOver: realD.filter((d) => d.confident && d.delta > thr).length, realConfidentPairs: realD.filter((d) => d.confident).length, reversedCaught: revD.filter((d) => d.confident && d.delta > thr).length, reversedConfident: revD.filter((d) => d.confident).length, reversedTotal: revD.length });
report.signed = {
  realPairs: realD.length, realConfident: realD.filter((d) => d.confident).length,
  realDeltaP50: q(realD.filter((d) => d.confident).map((d) => d.delta), 0.5), realDeltaP95: q(realD.filter((d) => d.confident).map((d) => d.delta), 0.95), realDeltaMax: Math.max(...realD.filter((d) => d.confident).map((d) => d.delta)),
  worstRealPairs: realD.filter((d) => d.confident).sort((a, b) => b.delta - a.delta).slice(0, 8),
  reversedDeltaMin: Math.min(...revD.filter((d) => d.confident).map((d) => d.delta)), reversedDeltaP05: q(revD.filter((d) => d.confident).map((d) => d.delta), 0.05),
  lowestReversed: revD.filter((d) => d.confident).sort((a, b) => a.delta - b.delta).slice(0, 8),
  abstainReal: real.filter((s) => !s.confident).length, abstainRealOf: real.length,
  separation: [60, 75, 90, 105, 120].map(sep),
};
// Oriented-axis descriptor split by item kind and motion class (locomotion vs action, as production isAction names them).
{
  const loco = (k: string) => /idle|walk|run/.test(k.split('/')[0]);
  const groups: Record<string, unknown> = {};
  for (const [name, keep] of [['blade (sword/axe) locomotion', (s: { case: string; key: string }) => s.case !== 'a-bow96' && loco(s.key)], ['blade (sword/axe) action', (s: { case: string; key: string }) => s.case !== 'a-bow96' && !loco(s.key)], ['bow locomotion', (s: { case: string; key: string }) => s.case === 'a-bow96']] as const) {
    const R = real.filter(keep), V = rev.filter(keep);
    const rd: { from: string; delta: number }[] = [];
    for (const s of R) { const [a, d, i] = s.key.split('/'), n = R.find((t) => t.case === s.case && t.key === `${a}/${d}/${+i + 1}`); if (n && s.orel != null && n.orel != null && s.confident && n.confident) rd.push({ from: `${s.case} ${s.key}`, delta: +wrapD(s.orel, n.orel).toFixed(1) }); }
    const vd: number[] = [];
    for (const s of V) { const [a, d, i] = s.key.split('/'); for (const t of R.filter((t) => t.case === s.case && (t.key === `${a}/${d}/${+i - 1}` || t.key === `${a}/${d}/${+i + 1}`))) if (s.orel != null && t.orel != null && s.confident && t.confident) vd.push(+wrapD(s.orel, t.orel).toFixed(1)); }
    groups[name] = { realPairs: rd.length, realMax: Math.max(...rd.map((x) => x.delta)), realP95: q(rd.map((x) => x.delta), 0.95), worstReal: rd.sort((a, b) => b.delta - a.delta).slice(0, 4), reversedPairs: vd.length, reversedMin: Math.min(...vd), reversedP05: q(vd, 0.05),
      at90: { realOver: rd.filter((x) => x.delta > 90).length, reversedOver: vd.filter((x) => x > 90).length }, at120: { realOver: rd.filter((x) => x.delta > 120).length, reversedOver: vd.filter((x) => x > 120).length } };
  }
  report.orientedAxis = groups;
}
// unsigned axis: a reversal about the wrist keeps the principal axis by construction; verify numerically on real frames
{
  let n = 0, max = 0;
  for (const c of HELD) {
    const res = await runCase(c as never), rig = JSON.parse(readFileSync(new URL(`body${c.body}.json`, FIX), 'utf8')).rig as Rig, W = rig.cell.w + 2 * c.pad, side = c.slot === 'off_hand' ? 'LEFT' : 'RIGHT';
    for (const x of res.cells.filter((y) => !y.key.startsWith('rest/') && y.area >= 6)) {
      const wr = kp(rig, x.key, `${side} ARM`, c.pad)!, r = reflectAbout(x, wr).cell, a = axisOf(x.mask, W), b = axisOf(r.mask, W);
      if (a == null || b == null) continue;
      n++; max = Math.max(max, angleDiff(a, b));
      (report.unsignedIoU ??= [] as number[]) && (report.unsignedIoU as number[]).push(+alignedIoU(x.mask, r.mask, W).toFixed(3));
    }
  }
  const ious = report.unsignedIoU as number[];
  report.unsigned = { frames: n, maxAxisChangeDeg: +max.toFixed(2), alignedIoUOfReversalP05: q(ious, 0.05), alignedIoUOfReversalP50: q(ious, 0.5), heldIoUGate: GATES.heldIoU, belowGate: ious.filter((v) => v < GATES.heldIoU).length };
  delete report.unsignedIoU;
}
report.contact = { frames: contacts.length, p50: q(contacts.map((c) => c.gap), 0.5), p95: q(contacts.map((c) => c.gap), 0.95), max: Math.max(...contacts.map((c) => c.gap)), over2: contacts.filter((c) => c.gap > 2).length, over4: contacts.filter((c) => c.gap > 4).length, over6: contacts.filter((c) => c.gap > 6).length, worst: contacts.sort((a, b) => b.gap - a.gap).slice(0, 6) };

// ---------- scale: held padding and the fixed 34 px grid-repair disc across supported body sizes ----------
const swordAxe = reachRows.filter((r) => (r.case as string) !== 'a-bow96');
const maxReach48 = Math.max(...swordAxe.map((r) => r.reach as number));
const ovr = { l: 0, t: 0, r: 0, b: 0 };
for (const r of swordAxe) for (const k of ["l", "t", "r", "b"] as const) ovr[k] = Math.max(ovr[k], (r.beyondRigCell as typeof ovr)[k]);
const sizes: Record<string, unknown>[] = [];
for (let body = 32; body <= 256; body += 4) {
  const frame = autoFrame(body), pad = padOf('main_hand', 'skel', { w: frame, h: frame }), s = body / 48;
  // inference: equipment and pose extents scale with body size; the 64 px bench cell around a 48 px body is the reference
  const needBeyondFrame = Math.max(...(['l', 't', 'r', 'b'] as const).map((k) => ovr[k] * s - ((frame - body) - (64 - 48)) / 2));
  sizes.push({ body, frame, pad, canvas: frame + 2 * pad, scaledReach: +(maxReach48 * s).toFixed(1), discCovers: maxReach48 * s <= 34, scaledOverflowBeyondFrame: +needBeyondFrame.toFixed(1), padSuffices: needBeyondFrame <= pad });
}
report.scale = { reference: { bodyPx: 48, cell: 64, maxReachFromWrist: +maxReach48.toFixed(2), maxBeyondRigCell: ovr }, discRadius: 34,
  bodiesWhereDiscTruncates: sizes.filter((s) => !s.discCovers).map((s) => s.body), bodiesWherePadShort: sizes.filter((s) => !s.padSuffices).map((s) => s.body), sizes };
report.minMargin = { frames: reachRows.length, touching: reachRows.filter((r) => (r.minMargin as number) === 0).length, min: Math.min(...reachRows.map((r) => r.minMargin as number)) };
report.roundTrip = roundTrip;
report.reach = reachRows;
{ // distal reach vs the clip median: real frames against the truncation controls
  const byClip: Record<string, number[]> = {};
  for (const r of reachRows) { const k = r.key as string; if (k.startsWith("rest/")) continue; (byClip[`${r.case} ${k.split("/").slice(0, 2).join("/")}`] ??= []).push(r.reach as number); }
  const ratios = Object.entries(byClip).flatMap(([clip, v]) => { const m = [...v].sort((a, b) => a - b)[v.length >> 1]; return v.map((x) => ({ clip, ratio: +(x / m).toFixed(3) })); });
  report.reachRatio = { frames: ratios.length, under80: ratios.filter((r) => r.ratio < 0.8).length, under70: ratios.filter((r) => r.ratio < 0.7).length, lowest: ratios.sort((a, b) => a.ratio - b.ratio).slice(0, 8) };
}
report.mutations = mutationRows;
const tally: Record<string, Record<string, number>> = {};
for (const r of mutationRows) { const t = (tally[r.mutation as string] ??= { fail: 0, warn: 0, silent: 0 }); t[r.caught as string]++; }
report.mutationTally = tally;
writeFileSync(`${OUT}/held-geometry-probe.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ tally, oriented: report.orientedAxis, signed: { ...(report.signed as object), worstRealPairs: undefined, lowestReversed: undefined }, unsigned: report.unsigned, contact: { ...(report.contact as object), worst: undefined }, minMargin: report.minMargin, scale: { ...(report.scale as object), sizes: undefined }, roundTrip: roundTrip.map((r) => ({ case: r.case, P: r.P, same: r.sameVerdicts, newMessages: r.newMessages, bytes: r.composedByteDiffs })), mirror: Object.fromEntries(Object.entries(report).filter(([k]) => k.startsWith('mirror:'))), baseline: Object.fromEntries(Object.entries(report).filter(([k]) => k.startsWith('baseline:')).map(([k, v]) => [k, (v as { verdicts: unknown }).verdicts])) }, null, 1));
