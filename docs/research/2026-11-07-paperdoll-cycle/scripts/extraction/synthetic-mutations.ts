// Synthetic ground-truth mutations on a REAL frozen body (bench body A, south rest, 64 px). The dressed composite is the exact
// keyed body (toChroma) plus painted items, so item ownership is known by construction, never from the color key.
// Each stage of production chromaLayer is replayed with its exported functions to attribute losses; then the production
// extractCell (keyframe) and the posed path (extractCell posed + sizeFloor / dropOffBody against the keyframe) are scored.
import { absorbOutline, chromaLayer, chromaMask, components, despill, dropKeyOutline, KT, keyScore, toChroma, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { dropOffBody, extractCell, g2Fails, GATES, sizeFloor } from '../../../../../app/src/lib/items/items.ts';
import { baseCell, clone, count, makeImg, save, saveJson, set, zoom, type Img } from './lib.ts';

export const B = await baseCell('A', 'south', 'rest'), W = B.w, H = B.h;
const isDarkBase = (x: number, y: number) => { const i = (y * W + x) * 4; return B.data[i + 3] > 0 && (B.data[i] + B.data[i + 1] + B.data[i + 2]) / 3 < 60; };
const lumKey = (C: Img, x: number, y: number) => { const i = (y * W + x) * 4; return (0.299 * C.data[i] + 0.587 * C.data[i + 1] + 0.114 * C.data[i + 2]) / 255; };

export interface Case { id: string; what: string; key: Key; C: Img; item: Uint8Array; rgb: Map<number, number[]>; body?: Img; posedOnly?: boolean; truthBodyFP?: Uint8Array }
const mk = (id: string, what: string, key: Key = 'green', base = B) => {
  const C = toChroma(base, key), item = new Uint8Array(W * H), rgb = new Map<number, number[]>();
  const paint = (x: number, y: number, c: number[], owner: 'item' | 'body' = 'item') => {
    set(C, x, y, c);
    if (owner === 'item') { item[y * W + x] = 1; rgb.set(y * W + x, c); } else item[y * W + x] = 0;
  };
  return { C, item, rgb, paint, done: (extra: Partial<Case> = {}): Case => ({ id, what, key, C, item, rgb, ...(base !== B ? { body: base } : {}), ...extra }) };
};
export const cases: Case[] = [];
const BROWN = [112, 72, 40], GOLD = [222, 186, 64], RED = [150, 34, 38], SILVER = [178, 180, 192], DARK = [28, 22, 24];

// 1. belts and cords: 1 px on the body's own internal outline (row 42 waist line, row 28 neck line) versus off it
{ const k = mk('belt-1px-on-waistline', '1 px brown belt drawn on the dark waist line (row 42)'); for (let x = 22; x <= 41; x++) if (B.data[(42 * W + x) * 4 + 3]) k.paint(x, 42, BROWN); cases.push(k.done()); }
{ const k = mk('belt-1px-row-38', '1 px brown belt one band higher (row 38, light body)'); for (let x = 21; x <= 42; x++) if (B.data[(38 * W + x) * 4 + 3]) k.paint(x, 38, BROWN); cases.push(k.done()); }
{ const k = mk('belt-2px-waist', '2 px belt rows 42-43'); for (const y of [42, 43]) for (let x = 22; x <= 41; x++) if (B.data[(y * W + x) * 4 + 3]) k.paint(x, y, BROWN); cases.push(k.done()); }
{ const k = mk('necklace-1px-neckline', '1 px silver necklace on the neck line (row 28)'); for (let x = 26; x <= 37; x++) if (B.data[(28 * W + x) * 4 + 3]) k.paint(x, 28, SILVER); cases.push(k.done()); }
{ const k = mk('belt-1px-waist+buckle', '1 px belt on the waist line with a 2x2 gold buckle'); for (let x = 22; x <= 41; x++) if (B.data[(42 * W + x) * 4 + 3]) k.paint(x, 42, BROWN); for (const [x, y] of [[31, 42], [32, 42], [31, 43], [32, 43]]) k.paint(x, y, GOLD); cases.push(k.done()); }
// 2. diagonal 1 px baldric (8-connected only)
{ const k = mk('baldric-diagonal-1px', '1 px diagonal strap across the torso'); for (let i = 0; i <= 14; i++) k.paint(24 + i, 30 + i, BROWN); cases.push(k.done()); }
// 3. tiny detached parts: a 1 px stud, 2 px and 3 px earrings next to a hat-sized item
{ const k = mk('stud-1px-detached', 'cap (rows 15-19) + detached 1 px chest stud'); for (let y = 15; y <= 19; y++) for (let x = 27; x <= 36; x++) k.paint(x, y, RED); k.paint(31, 33, GOLD); cases.push(k.done()); }
{ const k = mk('earrings-3px+cap', 'cap + two detached 3 px earrings (posed path: sizeFloor)'); for (let y = 15; y <= 19; y++) for (let x = 27; x <= 36; x++) k.paint(x, y, RED); for (const [x, y] of [[26, 24], [26, 25], [26, 26], [37, 24], [37, 25], [37, 26]]) k.paint(x, y, GOLD); cases.push(k.done()); }
// 4. holes / negative space in a red chest panel (rows 29-41, cols 25-38): body visible through 1 px and 2x2 holes, and a mesh
const panel = (k: ReturnType<typeof mk>, hole: (x: number, y: number) => boolean) => { for (let y = 29; y <= 45; y++) for (let x = 24; x <= 39; x++) if (B.data[(y * W + x) * 4 + 3] && !hole(x, y)) k.paint(x, y, RED); };
{
  // pick holes over DARK key shades (lum <= 0.3, where absorbOutline acts) and over light shades, independently of the item
  const k = mk('panel-holes', 'red panel with 1 px holes over dark and light body shades'), C0 = toChroma(B, 'green');
  const holes: [number, number][] = [];
  for (let y = 31; y <= 44; y += 2) for (let x = 26; x <= 37; x += 3) holes.push([x, y]);
  const hs = new Set(holes.map(([x, y]) => y * W + x));
  panel(k, (x, y) => hs.has(y * W + x));
  const dark = holes.filter(([x, y]) => lumKey(C0, x, y) <= 0.3).length;
  cases.push(k.done({ what: `red panel with ${holes.length} isolated 1 px holes (${dark} over dark key shades lum <= 0.3)` }));
}
{ const k = mk('panel-mesh', 'red panel with a checkerboard mesh (fishnet/chainmail gaps) rows 33-40'); panel(k, (x, y) => y >= 33 && y <= 40 && (x + y) % 2 === 0); cases.push(k.done()); }
{ const k = mk('panel-2x2-holes', 'red panel with 2x2 holes'); panel(k, (x, y) => (x === 28 || x === 29 || x === 34 || x === 35) && (y === 35 || y === 36 || y === 42 || y === 43)); cases.push(k.done()); }
// 5. outline touching the key along the rim and a dark item outline on the body edge
{ const k = mk('cape-outline-on-rim', 'cape off-body left of the arm with its 1 px dark outline over the arm rim px'); for (let y = 30; y <= 47; y++) { let rim = -1; for (let x = 0; x < W; x++) if (B.data[(y * W + x) * 4 + 3]) { rim = x; break; } if (rim < 0) continue; for (let x = rim - 4; x < rim; x++) k.paint(x, y, RED); k.paint(rim, y, DARK); } cases.push(k.done()); }
// 6. near-key and cyan/teal gear (colors no prompt word bans on green): fern, jade, seafoam green-teal, turquoise ramp
for (const [name, ramp] of [['fern', [[79, 121, 66], [60, 96, 50], [104, 150, 86]]], ['jade-teal', [[0, 168, 107], [0, 130, 90], [40, 200, 140]]], ['turquoise-ramp', [[64, 224, 208], [40, 180, 160], [25, 130, 110], [15, 90, 75]]], ['olive-drab', [[107, 142, 35], [85, 107, 47], [128, 128, 0]]]] as [string, number[][]][]) {
  const k = mk(`near-key-${name}`, `chest panel shaded in ${name} on the green key`);
  panel(k, () => false);
  let i = 0; for (const p of [...k.item.keys()].filter((p) => k.item[p])) k.paint(p % W, (p / W) | 0, ramp[i++ % ramp.length]);
  cases.push(k.done({ what: `chest panel in ${name} (${ramp.map((c) => keyScore('green', c[0], c[1], c[2])).join('/')} green key score; KT ${KT})` }));
}
// 7. partial alpha and anti-aliased fringe: panel rim blended 25/50/75 % with the key under it; off-body px at alpha 64/128/200
{
  const k = mk('aa-fringe', 'red panel whose outer ring is blended with the key body below'), C0 = toChroma(B, 'green');
  panel(k, () => false);
  const ring = [...k.item.keys()].filter((p) => k.item[p] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !k.item[p + dy * W + dx]));
  ring.forEach((p, i) => { const a = [0.25, 0.5, 0.75][i % 3], c = [0, 1, 2].map((j) => Math.round(RED[j] * a + C0.data[p * 4 + j] * (1 - a))); k.paint(p % W, (p / W) | 0, c); });
  cases.push(k.done({ what: `red panel, ${ring.length} ring px blended 25/50/75 % red over the key` }));
}
{ const k = mk('partial-alpha-offbody', 'hat brim off-body at alpha 64/128/200/255'); for (let x = 20; x <= 43; x++) for (const y of [12, 13, 14]) { const a = [64, 128, 200, 255][x % 4]; k.paint(x, y, [...RED, a]); } cases.push(k.done()); }
// 8. gear identical to the body's own RGB (bracers painted with the real skin color under them) and 9. skin repaint on the head
{ const k = mk('bracer-skin-rgb', 'forearm bracers painted with the exact real body RGB under them'); for (let y = 43; y <= 47; y++) for (const x of [22, 23, 40, 41]) if (B.data[(y * W + x) * 4 + 3] && !isDarkBase(x, y)) k.paint(x, y, [...B.data.subarray((y * W + x) * 4, (y * W + x) * 4 + 3)]); cases.push(k.done()); }
{ const k = mk('skin-repaint', 'cap + provider repaints 14 face px in a skin tone (body truth)'); for (let y = 15; y <= 19; y++) for (let x = 27; x <= 36; x++) k.paint(x, y, RED); for (let y = 20; y <= 21; y++) for (let x = 29; x <= 35; x++) k.paint(x, y, [214, 162, 124], 'body'); cases.push(k.done()); }
// 10. dark-skinned body: the same 1 px belt off the waist line (row 38) and a 1 px cord, on a darkened copy of body A
{
  const dB = clone(B); for (let i = 0; i < dB.data.length; i += 4) for (let j = 0; j < 3; j++) dB.data[i + j] = Math.round(dB.data[i + j] * 0.42);
  const k = mk('dark-skin-belt-row-38', '1 px belt on row 38 of a dark-skinned body (RGB x0.42)', 'green', dB);
  for (let x = 21; x <= 42; x++) if (dB.data[(38 * W + x) * 4 + 3]) k.paint(x, 38, BROWN);
  cases.push(k.done());
  const k2 = mk('dark-skin-baldric', '1 px diagonal strap on the dark-skinned body', 'green', dB); for (let i = 0; i <= 14; i++) k2.paint(24 + i, 30 + i, BROWN); cases.push(k2.done());
}

if (import.meta.main) {
const band = { x: 0, y: 0, w: 1e3, h: H };
const rows: Record<string, unknown>[] = [];
const sheet = makeImg(W * 4, H * cases.length);
for (const c of cases) {
  const base = c.body ?? B, label = c.item, n = count(label);
  const m1 = chromaMask(c.C, c.key), m2 = dropKeyOutline(m1, base, c.C, c.key), m3 = absorbOutline(m2, base, c.C, c.key);
  const r = chromaLayer(c.C, c.key, base), m4 = r.mask;
  const lostAt = (prev: Uint8Array, next: Uint8Array) => { let l = 0; for (let p = 0; p < W * H; p++) if (label[p] && prev[p] && !next[p]) l++; return l; };
  const fp = (m: Uint8Array) => { let f = 0; for (let p = 0; p < W * H; p++) if (m[p] && !label[p]) f++; return f; };
  const key = extractCell({ key: 'rest/south/0', call: 0, base, out: c.C, route: c.key, band });
  const posed = extractCell({ key: 'walk/south/0', call: 1, base, out: c.C, route: c.key, band, posed: true });
  const posed2 = extractCell({ key: 'walk/south/1', call: 1, base, out: c.C, route: c.key, band, posed: true });
  sizeFloor([posed], { south: key.layer });
  dropOffBody([posed2]);
  let kept = 0, recolored = 0, offPalette = 0;
  const palette = new Set([...c.rgb.values()].map((v) => v.slice(0, 3).join()));
  for (let p = 0; p < W * H; p++) if (label[p] && key.mask[p]) {
    kept++;
    const got = [...key.layer.data.subarray(p * 4, p * 4 + 3)].join();
    if (got !== c.rgb.get(p)!.slice(0, 3).join()) recolored++;
    if (!palette.has(got)) offPalette++;
  }
  const keptPosed = [...label.keys()].filter((p) => label[p] && posed.mask[p]).length;
  const keptBody = [...label.keys()].filter((p) => label[p] && posed2.mask[p]).length;
  const row = {
    case: c.id, what: c.what, itemPx: n,
    lostChromaMask: n - [...label.keys()].filter((p) => label[p] && m1[p]).length, lostDropKeyOutline: lostAt(m1, m2), lostAbsorb: lostAt(m2, m3), lostMinPx: lostAt(m3, m4),
    keptKeyframe: kept, recoloredByDespill: recolored, offPaletteKept: offPalette, falseItemKeyframe: fp(key.mask), keptPosedSizeFloor: keptPosed, keptPosedDropOffBody: keptBody,
    G2: `${key.keyKept?.toFixed(3)} lost ${key.keyLost} ${g2Fails(key) ? 'FAIL' : 'pass'}`, G3: `${key.keyOutside?.toFixed(3)} ${(key.keyOutside ?? 0) > GATES.keyOutside ? 'FAIL' : 'pass'}`, specks: key.specks, pinholes: key.pinholes,
  };
  rows.push(row);
  const i = cases.indexOf(c);
  const truth = makeImg(W, H); for (let p = 0; p < W * H; p++) if (label[p]) truth.data.set(c.C.data.subarray(p * 4, p * 4 + 4), p * 4);
  for (const [j, im] of [c.C, truth, key.layer, posed.layer].entries()) for (let y = 0; y < H; y++) sheet.data.set(im.data.subarray(y * W * 4, (y + 1) * W * 4), ((i * H + y) * W * 4 + j * W) * 4);
}
console.table(rows.map(({ what, ...r }) => r));
for (const r of rows) console.log(`${r.case}: ${r.what}`);
saveJson('synthetic-mutations.json', rows);
await save('synthetic-mutations-sheet.png', zoom(sheet, 3));
console.log('columns of the sheet: composite | truth | keyframe layer | posed layer after sizeFloor');
}
