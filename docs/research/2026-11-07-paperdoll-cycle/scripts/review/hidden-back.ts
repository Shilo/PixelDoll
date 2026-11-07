// Review of the uncommitted Back-slot hiddenViews change: which empty front views it now excuses.
// Part 1 replays the frozen bench back items (a-cape, b-cloak, n-cloak128) through production extractCell and measures each
// back view's on-body share and body coverage, then simulates a failed front dress (south, and south-east where drawn).
// Part 2 draws realistic synthetic Back-slot shapes on the real north rest bodies (A 64, B 80, N 160) from their keypoints.
// For every case it reports the new rule's inputs, the verdict with slot 'back' (new) and without a slot (old behavior),
// and the share of the item that would stick out past the front silhouette (the north layer mirrored onto the south body).
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/review/hidden-back.ts
import { readFileSync } from 'node:fs';
import { bandOf, cutRows, extractCell, hiddenViews } from '../../../../../app/src/lib/items/items.ts';
import { fromApi } from '../../../../../app/src/lib/rig/poses.ts';
import { body, cell, FIX, load, makeImg, type Img } from '../extraction/lib.ts';

type Dir = 'south' | 'south-east' | 'east' | 'north-east' | 'north';
const alpha = (im: Img, p: number) => im.data[p * 4 + 3] > 0;
const flip = (im: Img) => { const o = makeImg(im.w, im.h); for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) o.data.set(im.data.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4), (y * im.w + im.w - 1 - x) * 4); return o; };
function measure(K: Img, B: Img, front?: Img) {
  let item = 0, on = 0, area = 0, outFront = 0;
  const F = front && flip(K);
  for (let p = 0; p < K.w * K.h; p++) { if (alpha(B, p)) area++; if (alpha(K, p)) { item++; if (alpha(B, p)) on++; } if (F && front && alpha(F, p) && !alpha(front, p)) outFront++; }
  return { item, on: item ? on / item : 0, cover: area ? item / area : 0, outFront: item ? outFront / item : 0, outFrontPx: outFront };
}
const pct = (x: number) => (x * 100).toFixed(0).padStart(3) + ' %';
const verdict = (cells: { key: string; area: number; base: Img }[], keys: Partial<Record<Dir, Img>>) =>
  `old [${[...hiddenViews(cells, keys)].join(',')}] new [${[...hiddenViews(cells, keys, 'back')].join(',')}]`;
const empty = (im: Img) => makeImg(im.w, im.h);
const areaOf = (im: Img) => { let n = 0; for (let p = 0; p < im.w * im.h; p++) if (alpha(im, p)) n++; return n; };

// ---------- Part 1: bench back items ----------
interface Case { id: string; body: string; slot: string; key: string; pad: number; clips: string[] }
const cases: Case[] = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: Case) => c.slot === 'back');
console.log('Part 1: bench back items (keyframe = col 0 of the first clip row of each view)');
for (const c of cases) {
  const { body: b, sheet: bodySheet } = await body(c.body), rig = b.rig, N = rig.cell.w, sheet = await load(`${c.id}.png`);
  const dirs = [...new Set(c.clips.map((k) => k.split('/')[1]))] as Dir[];
  const keys: Partial<Record<Dir, Img>> = {}, bases: Partial<Record<Dir, Img>> = {}, cells: { key: string; area: number; base: Img }[] = [];
  for (const d of dirs) {
    const s0 = fromApi(rig.rest![d]!.keypoints, rig.cell), maxY = cutRows(c.slot, s0, N), base = cell(bodySheet, N, b.rows.indexOf(d), b.cols.indexOf('rest'));
    const k = extractCell({ key: `rest/${d}/0`, call: 0, base, out: cell(sheet, N, c.clips.findIndex((x) => x.endsWith(`/${d}`)), 0), route: c.key as 'green', band: bandOf(c.slot, s0, N), ...(maxY != null ? { cut: { maxY } } : {}) });
    keys[d] = k.layer; bases[d] = base; cells.push({ key: k.key, area: k.area, base });
  }
  for (const d of dirs.filter((x) => x.startsWith('north'))) {
    const front = d === 'north' ? bases.south : undefined, m = measure(keys[d]!, bases[d]!, front);
    console.log(`${c.id.padEnd(11)} ${N}px ${d.padEnd(10)} item ${String(m.item).padStart(5)} px  on-body ${pct(m.on)}  cover ${pct(m.cover)}${front ? `  past front silhouette ${pct(m.outFront)}` : ''}  east area ${areaOf(keys.east!)}`);
  }
  // posed north frames: how stable are the two inputs across a walk
  const wr = c.clips.indexOf('walk/north');
  if (wr >= 0) {
    const ms = Array.from({ length: 8 }, (_, i) => { const base = cell(bodySheet, N, b.rows.indexOf('north'), b.cols.indexOf(`walk/${i}`)), s1 = fromApi(rig.animations.find((a) => a.id === 'walk')!.sources!.north!.keypoints![i], rig.cell); return measure(extractCell({ key: `walk/north/${i}`, call: 1, base, out: cell(sheet, N, wr, 1 + i), route: c.key as 'green', band: bandOf(c.slot, s1, N), posed: true }).layer, base); });
    console.log(`${''.padEnd(11)} walk/north frames: on-body ${pct(Math.min(...ms.map((m) => m.on)))}..${pct(Math.max(...ms.map((m) => m.on)))}, cover ${pct(Math.min(...ms.map((m) => m.cover)))}..${pct(Math.max(...ms.map((m) => m.cover)))}`);
  }
  const fail = (ds: Dir[], mod?: (k: Partial<Record<Dir, Img>>) => void) => {
    const k2: Partial<Record<Dir, Img>> = { ...keys }; for (const d of ds) k2[d] = empty(keys[d]!); mod?.(k2);
    return verdict(cells.map((x) => ({ ...x, area: areaOf(k2[x.key.split('/')[1] as Dir]!) })), k2);
  };
  console.log(`${''.padEnd(11)} failed front (south empty): ${fail(['south'])}`);
  if (dirs.includes('south-east')) console.log(`${''.padEnd(11)} failed front (south + south-east empty): ${fail(['south', 'south-east'])}`);
  // a double failure: front empty and the back view drawn as a thin top fragment of the cape (top 20 % of its rows)
  const frag = (k: Partial<Record<Dir, Img>>) => {
    const K = keys.north!, o = makeImg(K.w, K.h); let y0 = K.h, y1 = 0;
    for (let p = 0; p < K.w * K.h; p++) if (alpha(K, p)) { y0 = Math.min(y0, (p / K.w) | 0); y1 = Math.max(y1, (p / K.w) | 0); }
    for (let p = 0; p < K.w * K.h; p++) if (alpha(K, p) && (p / K.w | 0) <= y0 + 0.2 * (y1 - y0)) o.data.set(K.data.subarray(p * 4, p * 4 + 4), p * 4);
    k.north = o;
    console.log(`${''.padEnd(11)} fragment ${areaOf(o)} px, east ${areaOf(keys.east!)} px, north/east ${(areaOf(o) / areaOf(keys.east!)).toFixed(2)} (full north ${(areaOf(keys.north!) / areaOf(keys.east!)).toFixed(2)})`);
  };
  console.log(`${''.padEnd(11)} south empty + north a top-20 % fragment: ${fail(['south'], frag)}`);
}

// ---------- Part 2: synthetic shapes on the real north rest bodies ----------
console.log('\nPart 2: synthetic Back-slot shapes on the north rest body (front check: north layer mirrored onto the south body)');
type Pt = { x: number; y: number };
const fillWith = (w: number, inside: (x: number, y: number) => boolean) => { const o = makeImg(w, w); for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (inside(x + 0.5, y + 0.5)) o.data.set([140, 60, 40, 255], (y * w + x) * 4); return o; };
const seg = (a: Pt, b: Pt, r: number) => (x: number, y: number) => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - a.x - t * dx, y - a.y - t * dy) <= r; };
const ell = (c: Pt, rx: number, ry: number) => (x: number, y: number) => ((x - c.x) / rx) ** 2 + ((y - c.y) / ry) ** 2 <= 1;
const or = (...fs: ((x: number, y: number) => boolean)[]) => (x: number, y: number) => fs.some((f) => f(x, y));
for (const id of ['A', 'B', 'N']) {
  const { body: b, sheet } = await body(id), rig = b.rig, N = rig.cell.w;
  const north = cell(sheet, N, b.rows.indexOf('north'), b.cols.indexOf('rest')), south = cell(sheet, N, b.rows.indexOf('south'), b.cols.indexOf('rest'));
  const east = cell(sheet, N, b.rows.indexOf('east'), b.cols.indexOf('rest'));
  const s = fromApi(rig.rest!.north!.keypoints, rig.cell), P = (l: string) => s[l];
  const cx = (P('LEFT SHOULDER').x + P('RIGHT SHOULDER').x) / 2, sw = Math.abs(P('LEFT SHOULDER').x - P('RIGHT SHOULDER').x);
  const shY = (P('LEFT SHOULDER').y + P('RIGHT SHOULDER').y) / 2, neckY = P('NECK').y, hipY = (P('LEFT HIP').y + P('RIGHT HIP').y) / 2, th = hipY - shY;
  const ankleY = (P('LEFT LEG').y + P('RIGHT LEG').y) / 2, kneeY = (P('LEFT KNEE').y + P('RIGHT KNEE').y) / 2;
  const rect = (x0: number, x1: number, y0: number, y1: number) => (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const trap = (y0: number, y1: number, w0: number, w1: number) => (x: number, y: number) => y >= y0 && y <= y1 && Math.abs(x - cx) <= (w0 + (w1 - w0) * (y - y0) / (y1 - y0)) / 2;
  const shapes: [string, (x: number, y: number) => boolean][] = [
    ['backpack', rect(cx - 0.4 * sw, cx + 0.4 * sw, shY + 0.05 * th, shY + 0.75 * th)],
    ['large backpack (bedroll on top)', or(rect(cx - 0.5 * sw, cx + 0.5 * sw, shY, hipY), rect(cx - 0.65 * sw, cx + 0.65 * sw, shY - 0.25 * th, shY))],
    ['satchel / pouch', rect(cx - 0.2 * sw, cx + 0.2 * sw, shY + 0.3 * th, shY + 0.6 * th)],
    ['quiver, arrows above shoulder', seg({ x: cx + 0.3 * sw, y: hipY - 0.1 * th }, { x: cx - 0.35 * sw, y: shY - 0.5 * th }, 0.1 * sw)],
    ['back greatsword (hilt above shoulder)', seg({ x: cx + 0.35 * sw, y: hipY + 0.4 * th }, { x: cx - 0.45 * sw, y: shY - 0.6 * th }, 0.06 * sw)],
    ['shoulder capelet / mantle', trap(neckY, shY + 0.35 * th, 1.0 * sw, 1.35 * sw)],
    ['waist-length cape', trap(neckY, hipY, 1.0 * sw, 1.2 * sw)],
    ['knee-length cape', trap(neckY, kneeY, 1.0 * sw, 1.4 * sw)],
    ['full cape (ankle)', trap(neckY, ankleY - 1, 1.0 * sw, 1.5 * sw)],
    ['narrow scarf tail down the back', or(rect(cx - 0.35 * sw, cx + 0.35 * sw, neckY, neckY + 0.15 * th), rect(cx + 0.05 * sw, cx + 0.25 * sw, neckY, shY + 0.7 * th))],
    ['folded wings', or(ell({ x: cx - 0.3 * sw, y: shY + 0.15 * th }, 0.35 * sw, 0.6 * th), ell({ x: cx + 0.3 * sw, y: shY + 0.15 * th }, 0.35 * sw, 0.6 * th))],
    ['small folded wings (no tips past body)', or(ell({ x: cx - 0.22 * sw, y: shY + 0.35 * th }, 0.2 * sw, 0.35 * th), ell({ x: cx + 0.22 * sw, y: shY + 0.35 * th }, 0.2 * sw, 0.35 * th))],
    ['spread wings', or(ell({ x: cx - 0.9 * sw, y: shY }, 0.7 * sw, 0.45 * th), ell({ x: cx + 0.9 * sw, y: shY }, 0.7 * sw, 0.45 * th))],
    ['tail hanging between legs', seg({ x: cx, y: hipY }, { x: cx + 0.05 * sw, y: ankleY - 1 }, 0.1 * sw)],
    ['tail curling to the side', or(seg({ x: cx, y: hipY }, { x: cx + 0.2 * sw, y: kneeY }, 0.1 * sw), seg({ x: cx + 0.2 * sw, y: kneeY }, { x: cx + 0.8 * sw, y: ankleY - 2 }, 0.1 * sw))],
  ];
  console.log(`body ${id}: ${N} px frame, shoulder width ${sw.toFixed(1)} px, torso ${th.toFixed(1)} px`);
  for (const [name, f] of shapes) {
    const K = fillWith(N, f), m = measure(K, north, south);
    // 3 drawn views: south empty (failed front), east a small stand-in, north the shape
    const sideStub = fillWith(N, rect(cx - 2, cx + 2, shY, shY + 6)), keys: Partial<Record<Dir, Img>> = { south: empty(K), east: sideStub, north: K };
    const cells = (['south', 'east', 'north'] as Dir[]).map((d) => ({ key: `rest/${d}/0`, area: areaOf(keys[d]!), base: d === 'north' ? north : d === 'east' ? east : south }));
    const v = [...hiddenViews(cells, keys, 'back')].includes('south');
    console.log(`  ${name.padEnd(40)} item ${String(m.item).padStart(5)}  on-body ${pct(m.on)}  cover ${pct(m.cover)}  past front ${pct(m.outFront)} (${String(m.outFrontPx).padStart(4)} px)  -> south ${v ? 'EXCUSED' : 'fails'}`);
  }
}

// ---------- Part 3: front/back body symmetry and a side-view discriminator ----------
// The mirrored front check assumes the south silhouette is the north one mirrored. The side check asks where the item sits in
// the east view: a pack hung behind the body lies behind the body's row center, a capelet or scarf wraps over the shoulder.
console.log('\nPart 3: mirror symmetry (IoU of the mirrored north body with the south body) and side-view share behind the body center');
for (const id of ['A', 'B', 'N']) {
  const { body: b, sheet } = await body(id), rig = b.rig, N = rig.cell.w;
  const north = cell(sheet, N, b.rows.indexOf('north'), b.cols.indexOf('rest')), south = cell(sheet, N, b.rows.indexOf('south'), b.cols.indexOf('rest')), east = cell(sheet, N, b.rows.indexOf('east'), b.cols.indexOf('rest'));
  const F = flip(north); let i = 0, u = 0;
  for (let p = 0; p < N * N; p++) { const a = alpha(F, p), c = alpha(south, p); if (a && c) i++; if (a || c) u++; }
  const s = fromApi(rig.rest!.east!.keypoints, rig.cell), P = (l: string) => s[l];
  const sn = fromApi(rig.rest!.north!.keypoints, rig.cell), sw = Math.abs(sn['LEFT SHOULDER'].x - sn['RIGHT SHOULDER'].x);
  const shY = (P('LEFT SHOULDER').y + P('RIGHT SHOULDER').y) / 2, neckY = P('NECK').y, hipY = (P('LEFT HIP').y + P('RIGHT HIP').y) / 2, th = hipY - shY;
  const row = (y: number) => { let lo = N, hi = -1; for (let x = 0; x < N; x++) if (alpha(east, (y | 0) * N + x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); } return hi < 0 ? null : { lo, hi, mid: (lo + hi) / 2 }; };
  const behind = (K: Img) => { let n = 0, t = 0; for (let p = 0; p < N * N; p++) if (alpha(K, p)) { t++; const r = row((p / N) | 0), x = p % N; if (x < (r ? r.mid : P('NECK').x)) n++; } return t ? n / t : 0; };
  const side = (f: (x: number, y: number, r: { lo: number; hi: number; mid: number } | null) => boolean) => fillWith(N, (x, y) => f(x, y, row(y)));
  const shapes: [string, (x: number, y: number, r: { lo: number; hi: number; mid: number } | null) => boolean][] = [
    ['backpack (behind the back edge)', (x, y, r) => !!r && y >= shY + 0.05 * th && y <= shY + 0.75 * th && x >= r.lo - 0.35 * sw && x <= r.lo + 1],
    ['quiver (behind, arrows above shoulder)', (x, y, r) => y >= shY - 0.5 * th && y <= hipY - 0.1 * th && x >= (r ? r.lo : P('NECK').x - 0.2 * sw) - 0.15 * sw && x <= (r ? r.lo : P('NECK').x - 0.2 * sw) + 1],
    ['shoulder capelet (wraps the shoulder)', (x, y, r) => !!r && y >= neckY && y <= shY + 0.35 * th && x >= r.lo - 1 && x <= r.hi + 1],
    ['scarf (neck band + tail behind)', (x, y, r) => !!r && ((y >= neckY && y <= neckY + 0.15 * th && x >= r.lo && x <= r.hi) || (y > neckY + 0.15 * th && y <= shY + 0.7 * th && x >= r.lo - 2 && x <= r.lo + 1))],
    ['waist cape (back half + shoulder)', (x, y, r) => !!r && y >= neckY && y <= hipY && x >= r.lo - 2 && x <= (y < shY + 0.2 * th ? r.hi : r.mid)],
  ];
  console.log(`body ${id}: mirror IoU ${(i / u).toFixed(2)}`);
  for (const [name, f] of shapes) console.log(`  ${name.padEnd(40)} behind the body center ${pct(behind(side(f)))}`);
}

// ---------- Part 4: direction mapping, mirrored sets ----------
console.log('\nPart 4: opposite views and mirrored direction sets (64 px rectangle body, a backpack on every back view)');
{
  const w = 64, bodyImg = fillWith(w, (x, y) => x >= 24 && x < 40 && y >= 10 && y < 60), pack = fillWith(w, (x, y) => x >= 28 && x < 36 && y >= 18 && y < 32);
  const run = (drawn: string[], emptyViews: string[]) => {
    const keys: Record<string, Img> = {}; for (const d of drawn) keys[d] = emptyViews.includes(d) ? empty(pack) : pack;
    const cells = drawn.map((d) => ({ key: `rest/${d}/0`, area: areaOf(keys[d]), base: bodyImg }));
    return `drawn [${drawn.join(',')}] empty [${emptyViews.join(',')}] -> ${verdict(cells, keys as Partial<Record<Dir, Img>>)}`;
  };
  console.log(' ', run(['south', 'south-east', 'east', 'north-east', 'north'], ['south', 'south-east']), '(Top-down 8, west side mirrored: NW absent)');
  console.log(' ', run(['south', 'south-east', 'south-west', 'east', 'west', 'north-east', 'north-west', 'north'], ['south', 'south-east', 'south-west']), '(8 drawn views)');
  console.log(' ', run(['south', 'east', 'north'], ['south']), '(Top-down 4, west mirrored)');
}

// ---------- Part 5: posed frames of a hidden view (itemQa G4) ----------
// A hidden view's posed frames must stay empty. itemQa enforces it only when the clip median is 0 (items.ts G4 !med branch).
console.log('\nPart 5: itemQa on a hidden south view whose posed frames show the item');
{
  const { itemQa, slotOf } = await import('../../../../../app/src/lib/items/items.ts');
  const { toChroma } = await import('../../../../../app/src/lib/image/chroma.ts');
  const rig = { cell: { w: 8, h: 8 }, pivot: { x: 4, y: 8 }, baseItem: 'base', baseHash: 'sha256:x', directions: [{ id: 'south' }, { id: 'east' }, { id: 'north' }], animations: [{ id: 'idle', cells: 4, loop: true, frames: [] }] } as any;
  const base = makeImg(8, 8); for (let y = 2; y < 8; y++) for (let x = 2; x < 6; x++) base.data.set([180, 140, 120, 255], (y * 8 + x) * 4);
  const mk = (i: number, px: number) => { const out = toChroma(base, 'green'); for (let k = 0; k < px; k++) out.data.set([90, 90, 100, 255], ((4 + k) * 8 + 3) * 4); return extractCell({ key: `idle/south/${i}`, call: 1, base, out, route: 'green', band: bandOf('back', undefined, 8), posed: true }); };
  for (const [name, px] of [['all 4 frames empty', [0, 0, 0, 0]], ['strap in 1 of 4 frames', [3, 0, 0, 0]], ['strap in 3 of 4 frames', [3, 3, 3, 0]], ['strap in all 4 frames', [3, 3, 3, 3]]] as const) {
    const q = itemQa(rig, slotOf('back'), 'green', px.map((n, i) => mk(i, n)), 0, undefined, 0, new Set(['south']));
    console.log(`  ${name.padEnd(24)} status ${q.qa.status}  fails ${JSON.stringify([...q.failCalls.values()].flat())}  warnings ${JSON.stringify(q.warnings.filter((w) => w.includes('G4')))}`);
  }
}
