// Review of the uncommitted D1 change (smudgedViews): a dressed view fails only when designGraySmudges says so AND its gray
// share exceeds the lowest share of the item's other drawn views by more than DESIGN.gray. Compares, per dressed keyframe:
//   old    : designGraySmudges per view (HEAD rule; the function itself is unchanged)
//   new    : smudgedViews (min of the other drawn views)
//   median : same, baseline = median of the other drawn views
//   min2   : new, but a view keeps the old rule unless at least 2 other drawn views exist (2-view items)
//   band   : new, but per vertical third of the item bbox (a smudge must be matched by gray at the same body-relative height)
// on the frozen bench (every keyframe, prompt with no gray word), the T3 red cape keys (helmet-occlusion.json capeKeys) with
// counterfactual copies of its north hem smudge, and synthetic views. Production code only; nothing is written.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/review/d1-cross-view.ts
import { readFileSync } from 'node:fs';
import { DESIGN, designGraySmudges, grayShare, smudgedViews } from '../../../../../app/src/lib/items/items.ts';
import { runPipe } from '../extraction/bench-replay.ts';
import { clone, FIX, makeImg, type Img } from '../extraction/lib.ts';

const PROMPT = 'a red item'; // no GRAYISH word, so pixels decide
const drawn = (l: Img) => l.data.some((v, i) => i % 4 === 3 && v);
const med = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2; };
type Rule = (slot: string, prompt: string, ls: Img[]) => boolean[];
const base = (pick: (others: number[]) => number, minOthers = 1): Rule => (slot, prompt, ls) => {
  const d = ls.map(drawn), sh = ls.map((l, i) => (d[i] ? grayShare(l) : 0));
  return ls.map((l, i) => {
    if (!designGraySmudges(slot, prompt, l)) return false;
    const o = sh.filter((_, j) => j !== i && d[j]);
    return o.length < minOthers || sh[i] - pick(o) > DESIGN.gray;
  });
};
/** Gray share per vertical third of the item bbox (counted against the whole layer, so thirds sum to grayShare). */
function thirds(L: Img): number[] {
  const g = grayShare(L), out = [0, 0, 0];
  if (!g) return out;
  let y0 = L.h, y1 = -1, n = 0;
  for (let p = 0; p < L.w * L.h; p++) if (L.data[p * 4 + 3]) { const y = (p / L.w) | 0; y0 = Math.min(y0, y); y1 = Math.max(y1, y); n++; }
  const cnt = [0, 0, 0];
  for (let p = 0; p < L.w * L.h; p++) if (L.data[p * 4 + 3]) {
    const [r, gg, b] = L.data.subarray(p * 4, p * 4 + 3), mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    if (mx >= 48 && (mx - mn) / mx < 0.25) cnt[Math.min(2, Math.floor((((p / L.w) | 0) - y0) * 3 / (y1 - y0 + 1)))]++;
  }
  return cnt.map((c) => c / n);
}
const bandRule: Rule = (slot, prompt, ls) => {
  const d = ls.map(drawn), t = ls.map((l, i) => (d[i] ? thirds(l) : [0, 0, 0]));
  return ls.map((l, i) => {
    if (!designGraySmudges(slot, prompt, l)) return false;
    const o = t.filter((_, j) => j !== i && d[j]);
    return !o.length || t[i].reduce((s, v, k) => s + Math.max(0, v - Math.min(...o.map((x) => x[k]))), 0) > DESIGN.gray;
  });
};
const RULES: Record<string, Rule> = {
  old: (s, p, ls) => ls.map((l) => designGraySmudges(s, p, l)), new: smudgedViews, median: base(med), min2: base((o) => Math.min(...o), 2), band: bandRule,
};
const fmt = (b: boolean[]) => b.map((x) => (x ? 'F' : '.')).join('');
const header = () => console.log('case'.padEnd(44), 'shares'.padEnd(34), Object.keys(RULES).map((k) => k.padEnd(6)).join(' '));
function row(name: string, slot: string, ls: Img[], prompt = PROMPT) {
  const r = Object.fromEntries(Object.entries(RULES).map(([k, f]) => [k, fmt(f(slot, prompt, ls))]));
  const diff = r.old !== r.new ? (r.new.split('F').length < r.old.split('F').length ? '  <- new passes a view old failed' : '  <- new fails a view old passed') : '';
  console.log(name.padEnd(44), ls.map((l) => grayShare(l).toFixed(3)).join(' ').padEnd(34), Object.values(r).map((v) => v.padEnd(6)).join(' ') + diff);
  return r;
}

console.log('F = view fails D1, . = passes; view order as listed by each source\n');
console.log('== frozen bench keyframes (every case, prompt without a gray word) ==');
header();
const cases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8'));
let changed = 0;
for (const c of cases) {
  const { kf } = await runPipe(c);
  const r = row(`${c.id} [${kf.map((k) => k.key.split('/')[1]).join(',')}]`, c.slot, kf.map((k) => k.layer));
  if (r.old !== r.new) changed++;
}
console.log(`bench cases where old and new differ: ${changed} of ${cases.length}\n`);

console.log('== T3 red cape keys (helmet-occlusion.json capeKeys: south, east, north) ==');
header();
const fx = JSON.parse(readFileSync(new URL('../helmet-occlusion.json', FIX), 'utf8'));
const decode = (im: { w: number; h: number; runs: number[][] }) => { const o = makeImg(im.w, im.h); for (const [s, n, ...rgba] of im.runs) for (let p = s; p < s + n; p++) o.data.set(rgba, p * 4); return o; };
const T = ['south', 'east', 'north'].map((d) => decode(fx.capeKeys[d]));
row('T3 as generated', 'back', T, 'a red cape');
// counterfactual: copy the north hem smudge (lit gray px, by offset from the bbox bottom-center) onto opaque px of other views
const bbox = (L: Img) => { let x0 = L.w, x1 = -1, y1 = -1; for (let p = 0; p < L.w * L.h; p++) if (L.data[p * 4 + 3]) { const x = p % L.w, y = (p / L.w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { cx: (x0 + x1) >> 1, y1 }; };
const smudge: { dx: number; dy: number; rgba: number[] }[] = [];
{ const L = T[2], b = bbox(L); for (let p = 0; p < L.w * L.h; p++) if (L.data[p * 4 + 3]) { const [r, g, bl] = L.data.subarray(p * 4, p * 4 + 3), mx = Math.max(r, g, bl), mn = Math.min(r, g, bl); if (mx >= 48 && (mx - mn) / mx < 0.25) smudge.push({ dx: p % L.w - b.cx, dy: ((p / L.w) | 0) - b.y1, rgba: [r, g, bl, 255] }); } }
const paint = (L: Img) => { const o = clone(L), b = bbox(o); let n = 0; for (const s of smudge) { const x = b.cx + s.dx, y = b.y1 + s.dy; if (x < 0 || y < 0 || x >= o.w || y >= o.h || !o.data[(y * o.w + x) * 4 + 3]) continue; o.data.set(s.rgba, (y * o.w + x) * 4); n++; } return { o, n }; };
const S1 = paint(T[0]), E1 = paint(T[1]);
console.log(`north smudge px ${smudge.length}; copied onto south ${S1.n}, east ${E1.n}`);
row('T3 smudge north + south', 'back', [S1.o, T[1], T[2]], 'a red cape');
row('T3 smudge north + east', 'back', [T[0], E1.o, T[2]], 'a red cape');
row('T3 smudge in all three views', 'back', [S1.o, E1.o, T[2]], 'a red cape');
row('T3 2-view item (east, north), smudge only N', 'back', [T[1], T[2]], 'a red cape');
row('T3 2-view item (east, north), smudge both', 'back', [E1.o, T[2]], 'a red cape');
console.log();

console.log('== synthetic 32x32 views: 200 px red design, `g` px off-white (225,222,215) at the top, `s` px smudge (71,64,58) at the bottom ==');
header();
const v = (g: number, s = 0) => { const im = makeImg(32, 32); for (let p = 0; p < 200; p++) im.data.set(p < g ? [225, 222, 215, 255] : p >= 200 - s ? [71, 64, 58, 255] : [190, 40, 45, 255], p * 4); return im; };
row('smudge 1 of 3 (T3 shape)', 'back', [v(0), v(0), v(24)]);
row('smudge 2 of 3', 'back', [v(0, 24), v(0), v(0, 24)]);
row('smudge 3 of 3', 'back', [v(0, 22), v(0, 24), v(0, 26)]);
row('smudge 4 of 5 (8-dir)', 'back', [v(0, 22), v(0, 24), v(0, 26), v(0, 22), v(0)]);
row('smudge 5 of 5 (8-dir)', 'back', [v(0, 22), v(0, 24), v(0, 26), v(0, 22), v(0, 20)]);
row('2-view item, smudge in one', 'back', [v(0), v(0, 24)]);
row('2-view item, smudge in both', 'back', [v(0, 22), v(0, 24)]);
row('emblem 9 % in all 3 views', 'head', [v(18), v(16), v(20)]);
row('emblem 9 % front only (pirate skull)', 'head', [v(18), v(0), v(0)]);
row('emblem 9 % front+side, not back', 'head', [v(18), v(12), v(0)]);
row('emblem all + 4 % smudge on one', 'head', [v(18), v(16), v(18, 8)]);
row('emblem all + 7 % smudge on one', 'head', [v(18), v(16), v(18, 14)]);
row('emblem all, smudge 2 of 3 at 7 %', 'head', [v(18, 14), v(16), v(18, 14)]);
row('sliver view 6 px (2 gray) + clean views', 'back', [(() => { const im = makeImg(32, 32); for (let p = 0; p < 6; p++) im.data.set(p < 2 ? [120, 118, 115, 255] : [190, 40, 45, 255], p * 4); return im; })(), v(0), v(0, 24)]);
