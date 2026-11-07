// Audit (audit-worn.md): synthetic worn-item cases (truth known by construction) through production gates and cleanup.
// Each case prints what production does and whether that matches the constructed truth. Offline, production code only.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/audit/worn-synthetic.ts
import { readFileSync } from 'node:fs';
import { makeImg, type Img } from '../../../../../app/src/lib/image/png.ts';
import { toChroma } from '../../../../../app/src/lib/image/chroma.ts';
import { maskOf } from '../../../../../app/src/lib/image/similarity.ts';
import { bandOf, dirGate, dropOffBody, extractCell, g2Fails, hiddenViews, isAction, itemQa, slotOf, trimToKeyframe, type CellOut } from '../../../../../app/src/lib/items/items.ts';
import { actionOf } from '../../../../../app/src/lib/rig/clips.ts';
import { fixedFacingLocomotion } from '../../../../../app/src/lib/rig/pose-review.ts';
import { missingLowerGarment } from '../../../../../app/src/lib/items/garment-coverage.ts';
import { fromApi } from '../../../../../app/src/lib/rig/poses.ts';
import type { Rig } from '../../../../../app/src/lib/rig/rig.ts';
import type { Skeleton } from '../../../../../app/src/lib/rig/skeleton.ts';
import { FIX } from '../extraction/lib.ts';

const SKIN = [180, 140, 120, 255], ITEM = [120, 70, 30, 255];
const rect = (im: Img, x0: number, y0: number, x1: number, y1: number, c: number[]) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) im.data.set(c, (y * im.w + x) * 4); };
const sum = (m: ArrayLike<number>) => { let n = 0; for (let i = 0; i < m.length; i++) n += m[i] ? 1 : 0; return n; };
const head = (s: string) => console.log(`\n== ${s}`);
/** Body: 16 px wide torso (x 8-23, y 6-31) on a 32 px cell; the item painted over the green-keyed body. */
const W = 32;
const mkBase = () => { const b = makeImg(W, W); rect(b, 8, 6, 23, 31, SKIN); return b; };
const dress = (base: Img, paint: (o: Img) => void) => { const o = toChroma(base, 'green'); paint(o); return o; };

// ---------- 1. isAction / actionOf / fixedFacingLocomotion on move ids ----------
head('1. move-name tests (isAction: G5, G11-G14 and held G9 off when true; actionOf: pose prompt words)');
const names = ['idle', 'walk', 'run', 'jog', 'stroll', 'sprint', 'march', 'breathe', 'dance', 'walk_cycle', 'Walk_Cycle', 'sidle', 'rune-blast', 'brunch', 'walk-and-slash', 'drunk-walk', 'running-jump', 'trot', 'caminar', 'laufen'];
console.table(names.map((n) => ({ id: n, isAction: isAction(`${n}/south/0`), fixedFacingLocomotion: fixedFacingLocomotion(n), actionOf: actionOf(n) })));
// MoveSheet.svelte slug (copied verbatim for the probe only: it is component-local): a non-Latin description gives an empty id
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
console.log('MoveSheet slug("走る ジョギング") =', JSON.stringify(slug('走る ジョギング')), '| slug("jog in place") =', slug('jog in place'));

// ---------- 2. G5 depends on the name: same areas, "walk" vs "jog" ----------
head('2. G5: identical area series under walk and jog (areas 20,14,20,14: CV 0.18 > 0.15)');
const rigOf = (anims: string[], n = 4): Rig => ({ cell: { w: W, h: W }, pivot: { x: 16, y: 32 }, baseItem: 'base', baseHash: 'sha256:x', directions: [{ id: 'south' }], animations: anims.map((id) => ({ id, cells: n, loop: true, frames: [] })) } as unknown as Rig);
const cellWith = (key: string, base: Img, paint: (o: Img) => void, posed = true) => extractCell({ key, call: 1, base, out: dress(base, paint), route: 'green', band: bandOf('arms', undefined, W), posed });
const areas = (anim: string, ns: number[]) => ns.map((n, i) => cellWith(`${anim}/south/${i}`, mkBase(), (o) => rect(o, 10, 10, 10 + n - 1, 10, ITEM)));
for (const anim of ['walk', 'jog']) {
  const q = itemQa(rigOf([anim]), slotOf('torso_outer'), 'green', areas(anim, [20, 14, 20, 14]), 0);
  console.log(anim.padEnd(5), 'fails:', JSON.stringify([...q.failCalls.values()].flat()), 'status', q.qa.status);
}

// ---------- 3. G4: a small worn item the body occludes in one frame (a ring on the far hand) ----------
head('3. G4: a 4 px ring visible in 3 of 4 walk frames (far hand behind the torso in frame 2)');
{
  const cells = [4, 4, 0, 4].map((n, i) => cellWith(`walk/south/${i}`, mkBase(), (o) => n && rect(o, 20, 20, 21, 21, ITEM)));
  const q = itemQa(rigOf(['walk']), slotOf('arms'), 'green', cells, 0);
  console.log('fails:', JSON.stringify([...q.failCalls.values()].flat()));
}

// ---------- 4. hiddenViews: an item the body hides from the FRONT ----------
head('4. hiddenViews: keyframes empty in south (front), drawn in east and north');
for (const [what, north, east] of [['backpack, 10 % of body', 40, 20], ['small back bow, 3 % of body', 12, 6]] as const) {
  const keys: Record<string, Img> = {}, cells: Pick<CellOut, 'key' | 'area' | 'base'>[] = [];
  for (const [d, n] of [['south', 0], ['east', east], ['north', north]] as const) {
    const L = makeImg(W, W); if (n) rect(L, 10, 10, 10 + n / 4 - 1, 13, ITEM);
    keys[d] = L; cells.push({ key: `rest/${d}/0`, area: sum(maskOf(L)), base: mkBase() });
  }
  const h = hiddenViews(cells, keys);
  console.log(what.padEnd(28), 'hidden views:', JSON.stringify([...h]), '-> south keyframe', h.has('south') ? 'review warning' : 'G4 keyframe "item missing" (failure)');
}
{ // the mirror case that is handled: glasses hidden from the back
  const keys: Record<string, Img> = {}, cells: Pick<CellOut, 'key' | 'area' | 'base'>[] = [];
  for (const [d, n] of [['south', 8], ['east', 4], ['north', 0]] as const) { const L = makeImg(W, W); if (n) rect(L, 10, 10, 10 + n / 2 - 1, 11, ITEM); keys[d] = L; cells.push({ key: `rest/${d}/0`, area: sum(maskOf(L)), base: mkBase() }); }
  console.log('glasses (control)'.padEnd(28), 'hidden views:', JSON.stringify([...hiddenViews(cells, keys)]));
}

// ---------- 5. head band clip: a detached hanging part below neck + 3 ----------
head('5. head items: detached tassel/bead below the band (NECK y 8 -> band rows 0-10) in a posed frame');
{
  const base = makeImg(W, W); rect(base, 10, 2, 21, 9, SKIN); rect(base, 8, 10, 23, 31, SKIN);
  const neck = { NECK: { x: 16, y: 8 } } as unknown as Skeleton, band = bandOf('head', neck, W);
  const paint = (o: Img) => { rect(o, 9, 1, 22, 4, ITEM); rect(o, 22, 5, 22, 8, ITEM); rect(o, 21, 12, 23, 14, ITEM); }; // hat, hanging cord, 9 px tassel detached below
  const kf = extractCell({ key: 'rest/south/0', call: 0, base, out: dress(base, paint), route: 'green', band });
  const posed = extractCell({ key: 'walk/south/0', call: 1, base, out: dress(base, paint), route: 'green', band, posed: true, clip: true });
  console.log('band rows < ', band.h, '| keyframe area', kf.area, '| identical posed frame area', posed.area, '| tassel removed:', kf.area - posed.area, 'px');
  const g = dirGate(slotOf('head'), [{ ...posed, posed: true }], { south: kf.layer });
  console.log('H4 on the identical frame:', JSON.stringify([...g.fails.values()].flat()) || 'pass');
}

// ---------- 6. trimToKeyframe: an attached part that sways (feather tip, floppy hat point) ----------
head('6. head trim: hat with an attached point that sways 3 px up/down per frame (walk, 4 frames)');
{
  const rig = { ...rigOf(['walk']), rest: { south: { image: 'sha256:x', keypoints: [] } } } as unknown as Rig;
  const hat = (tipY: number) => { const L = makeImg(W, W); rect(L, 9, 4, 18, 8, ITEM); rect(L, 19, 6, 21, 6, ITEM); rect(L, 22, tipY, 24, tipY + 1, ITEM); rect(L, 22, Math.min(6, tipY), 22, Math.max(6, tipY), ITEM); return L; };
  const K = hat(6), tips = [6, 3, 9, 3], cells = tips.map((t, i) => { const L = hat(t), m = maskOf(L); return { key: `walk/south/${i}`, call: 1, base: L, input: L, out: L, layer: L, mask: m, area: sum(m), outBand: 0, baseBand: 0, specks: 0, pinholes: 0, shifted: false, offset: [0, 0], stray: 0, posed: true } as CellOut; });
  const before = cells.map((c) => c.area), removed = trimToKeyframe(rig, cells, { south: K });
  console.log('tip rows', tips.join(','), '| areas before', before.join(','), 'after', cells.map((c) => c.area).join(','), '| removed', removed);
  const g = dirGate(slotOf('head'), cells, { south: K });
  console.log('H4:', JSON.stringify([...g.fails.values()].flat()) || 'pass');
}

// ---------- 7. dropOffBody: pauldrons wider than the shoulders, a glove drawn 2 px off the frozen hand ----------
head('7. dropOffBody (worn, no bgZ): detached parts < 50 % on the frozen body are deleted');
{
  const base = mkBase(); rect(base, 4, 20, 6, 22, SKIN); // a left hand beside the torso
  const paint = (o: Img) => {
    rect(o, 10, 12, 21, 20, ITEM); // chest plate (largest)
    rect(o, 4, 6, 9, 9, ITEM); rect(o, 22, 6, 27, 9, ITEM); // pauldrons: 6 px wide, 2 px on the 8-23 torso
    rect(o, 2, 21, 4, 23, ITEM); // glove: the 3x3 hand at x 4-6 redrawn 2 px left by the pose
  };
  const out = dress(base, paint);
  const c = extractCell({ key: 'walk/south/0', call: 1, base, out, route: 'green', band: bandOf('torso_outer', undefined, W), posed: true });
  const a = c.area, r = dropOffBody([c]);
  console.log('area', a, '-> removed', r, '(pauldrons 2 x 24 px, glove 9 px)');
}

// ---------- 8. G11 lower-garment check vs the real knee motion of the bench walks ----------
head('8. G11: knee-to-hip distance change over real bench walk frames (a hem near the knee follows the hips)');
for (const id of ['A', 'B', 'C', 'N']) {
  const rig = JSON.parse(readFileSync(new URL(`body${id}.json`, FIX), 'utf8')).rig as Rig, H = rig.cell.h;
  for (const d of ['south', 'east', 'north']) {
    const rest = rig.rest?.[d as 'south']?.keypoints, seq = rig.animations.find((a) => a.id === 'walk')?.sources?.[d as 'south']?.keypoints;
    if (!rest || !seq) continue;
    const kh = (k: typeof rest) => { const s = fromApi(k, rig.cell); return Math.max(s['LEFT KNEE'].y, s['RIGHT KNEE'].y) - (s['LEFT HIP'].y + s['RIGHT HIP'].y) / 2; };
    const r0 = kh(rest), deltas = seq.map((k) => +(kh(k) - r0).toFixed(1));
    // a skirt whose hem sits `below` px under the rest knee, rigid with the hips: rows below the posed knee
    const hem = (below: number, dk: number) => {
      const s0 = fromApi(rest, rig.cell), knee0 = Math.max(s0['LEFT KNEE'].y, s0['RIGHT KNEE'].y), hip0 = (s0['LEFT HIP'].y + s0['RIGHT HIP'].y) / 2, w = Math.round(H / 4);
      const design = makeImg(H, H), layer = makeImg(H, H);
      rect(design, 10, Math.round(hip0), 10 + w, Math.round(knee0 + below), ITEM); rect(layer, 10, Math.round(hip0), 10 + w, Math.round(knee0 + below), ITEM);
      const pose = { 'LEFT KNEE': { x: 0, y: knee0 + dk }, 'RIGHT KNEE': { x: 0, y: knee0 + dk } } as unknown as Skeleton;
      return missingLowerGarment(design, layer, { 'LEFT KNEE': { x: 0, y: knee0 }, 'RIGHT KNEE': { x: 0, y: knee0 } } as unknown as Skeleton, pose);
    };
    const worst = Math.max(...deltas), below = Math.max(1, Math.ceil(H / 32));
    console.log(`body ${id} ${H}px walk ${d.padEnd(5)} knee-hip delta per frame: ${deltas.join(' ')} | skirt hem ${below} px under the knee, unchanged layer, worst frame -> G11 ${hem(below, worst) ? 'FAILS' : 'passes'}`);
  }
}

// ---------- 9. baseCut cap: a hood over a base whose baked hair volume exceeds 4 % of the body ----------
head('9. baseCut: hood erases baked base hair (imported base) above the neck; cut capped at 4 % of the body');
{
  const base = makeImg(W, W); rect(base, 10, 2, 21, 9, SKIN); rect(base, 8, 10, 23, 31, SKIN); rect(base, 6, 1, 9, 8, SKIN); rect(base, 22, 1, 25, 8, SKIN); // hair puffs 2 x 32 px
  const out = dress(base, (o) => rect(o, 10, 1, 21, 9, ITEM));
  for (const x of [6, 7, 8, 9, 22, 23, 24, 25]) for (let y = 1; y <= 8; y++) out.data.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 4); // the hood replaces the puffs
  const c = extractCell({ key: 'rest/south/0', call: 0, base, out, route: 'green', band: bandOf('head', { NECK: { x: 16, y: 9 } } as unknown as Skeleton, W), cut: { maxY: 12 } });
  console.log('erased hair 64 px of', sum(maskOf(base)), 'body px | cut', c.cut ? sum(c.cut) : 0, '| keyLost', c.keyLost, '| G2 fails', g2Fails(c));
}
