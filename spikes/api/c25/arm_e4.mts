// Arm E4: items from a concept image. Concept A = a different character wearing a steel helmet (S1 inpaint composite, same
// style); concept B = a standalone 128 px horned viking helmet sprite (Pro Flash; foreign scale). Local paste-up: crop the item,
// scale it to body A's head from the rest keypoints (nearest), quantize to <= 16 colors, paste onto the south chroma view.
// Arms (seed 7, body A S/E/N): traw = transfer-outfit-v2 with the raw concept; tpaste = transfer-outfit-v2 with the paste-up;
// ea = anchored edit-animation-v2 with the paste-up as frame 1 (output 0 dropped). Usage: node --env-file=../../.env c25/arm_e4.mts concept|run
import path from 'node:path';
import { items, chroma, paid, pool, b64, save, load, OUT, exists, type Img } from './lib.mts';
import { rigA, restA, DIRS } from './s4rig.mts';
const rig = rigA(), cell = rig.cell, CELLS = DIRS.map((d) => `rest/${d}/0`), SEED = +(process.env.E4_SEED ?? 7), CAP = 140; // seed 11: replication
const sfx = SEED === 7 ? '' : `_s${SEED}`;
const EV = path.resolve(import.meta.dirname, '../out');
export const CONCEPTS = { A: { prompt: 'a simple steel helmet', file: `${EV}/e3_static/helmet__inpaint-v3.out0.png` }, B: { prompt: 'a horned viking helmet with gold trim', file: `${OUT}/E4/conceptB.0.png` } } as const;
const blank = (w: number, h: number): Img => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
const px = (im: Img, x: number, y: number) => im.data.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4);

/** Item pixels of a concept: B = its alpha; A = non-skin px above the shoulders (the composite also has a body). */
function itemOf(name: 'A' | 'B', im: Img): Img {
  const o = blank(im.w, im.h);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const p = px(im, x, y); if (p[3] < 128) continue;
    if (name === 'A' && (y > 24 || Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]) > 40)) continue; // S1 helmet: rows < 24, steel and outline are low-saturation (skin is not)
    o.data.set(p, (y * im.w + x) * 4);
  }
  return o;
}
const bbox = (im: Img) => { let x0 = im.w, y0 = im.h, x1 = -1, y1 = -1; for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (px(im, x, y)[3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1 }; };
/** Nearest-neighbor resample of the item's bbox to width w (keeps aspect). */
function scaleTo(im: Img, w: number): Img {
  const b = bbox(im), sw = b.x1 - b.x0 + 1, sh = b.y1 - b.y0 + 1, h = Math.max(1, Math.round((sh * w) / sw)), o = blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o.data.set(px(im, b.x0 + Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / w)), b.y0 + Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / h))), (y * w + x) * 4);
  return o;
}
/** k-means palette reduction to <= k colors (pixel art: few colors, seeded by the most frequent). */
function quantize(im: Img, k = 16): Img {
  const cols: number[][] = [];
  for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3]) cols.push([im.data[i], im.data[i + 1], im.data[i + 2]]);
  const freq = new Map<string, number>(); for (const c of cols) freq.set(c.join(), (freq.get(c.join()) ?? 0) + 1);
  if (freq.size <= k) return im;
  let cent = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([s]) => s.split(',').map(Number));
  const near = (c: number[]) => cent.reduce((bi, m, i) => (Math.hypot(...m.map((v, j) => v - c[j])) < Math.hypot(...cent[bi].map((v, j) => v - c[j])) ? i : bi), 0);
  for (let it = 0; it < 8; it++) { const sum = cent.map(() => [0, 0, 0, 0]); for (const c of cols) { const s = sum[near(c)]; s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; s[3]++; } cent = sum.map((s, i) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]].map(Math.round) : cent[i])); }
  const o = { ...im, data: new Uint8ClampedArray(im.data) };
  for (let i = 0; i < o.data.length; i += 4) if (o.data[i + 3]) { const m = cent[near([o.data[i], o.data[i + 1], o.data[i + 2]])]; o.data.set([m[0], m[1], m[2], 255], i); }
  return o;
}
/** Head box of body A's south rest view from its keypoints: ear span and the eye row. */
async function headA() { // head silhouette width at the eye row of the south rest view (keypoints give the row)
  const k = Object.fromEntries((rig.rest as any).south.keypoints.map((p: any) => [p.label, { x: p.x * 64, y: p.y * 64 }]));
  const eyeY = Math.round((k['LEFT EYE'].y + k['RIGHT EYE'].y) / 2), r = await restA('south');
  let x0 = 64, x1 = -1; for (let x = 0; x < 64; x++) if (r.data[(eyeY * 64 + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  return { cx: (x0 + x1 + 1) / 2, w: x1 - x0 + 1, eyeY };
}
export async function pasteUp(name: 'A' | 'B') {
  const item = quantize(itemOf(name, await load(CONCEPTS[name].file))), h = await headA();
  const s = scaleTo(item, name === 'B' ? Math.round(h.w * 1.6) : h.w + 2) /* B's horns stick out sideways */, view = chroma.toChroma(await restA('south'), 'green');
  const x0 = Math.round(h.cx - s.w / 2), y0 = Math.round(h.eyeY + 1 - s.h); // the helmet's lower edge sits just below the eyes
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const p = px(s, x, y); if (p[3] && x0 + x >= 0 && y0 + y >= 0 && x0 + x < 64 && y0 + y < 64) view.data.set(p, ((y0 + y) * 64 + x0 + x) * 4); }
  return { paste: view, item, scaled: s };
}
const key = 'green', color = 'bright green';
const transferBody = async (name: 'A' | 'B', ref: Img) => ({
  reference_image: { image: { type: 'base64', base64: await b64(ref), format: 'png' }, size: { width: ref.w, height: ref.h } },
  frames: await Promise.all(DIRS.map(async (d) => ({ image: { type: 'base64', base64: await b64(chroma.toChroma(await restA(d), key)), format: 'png' }, size: { width: 64, height: 64 } }))),
  image_size: { width: 64, height: 64 }, seed: SEED, no_background: true,
  additional_instructions: `Transfer ONLY the identical ${CONCEPTS[name].prompt} from the reference onto the ${color} mannequin in every target frame. Target directions in order: ${DIRS.join(', ')}. Use the reference colors even if the description names the original color. Preserve target body silhouette, limb positions, ${color} chroma-key ramp and transparent background exactly. Empty hands; no other clothing, weapons or effects. Keep the headwear design; fit it to the target head. Do not transfer the reference body shape.`,
});
export async function arm(name: 'A' | 'B', v: 'traw' | 'tpaste' | 'ea') {
  const { paste } = await pasteUp(name), file = `${OUT}/E4/${name}_${v}${sfx}`, label = `E4 ${name} ${v}${sfx}`;
  if (v === 'ea') {
    const req = items.itemRoute.edit([await b64(paste), ...(await Promise.all(DIRS.map(async (d) => b64(chroma.toChroma(await restA(d), key)))))], items.itemPrompt(CONCEPTS[name].prompt, key, CELLS, 'rest/south/0'), SEED, cell);
    const out = await paid({ arm: 'E4', label, file, req: req as any, estimate: 10, armCap: CAP });
    return out && out.slice(1); // drop the anchor's output
  }
  const ref = v === 'traw' ? await load(CONCEPTS[name].file) : paste;
  return paid({ arm: 'E4', label, file, req: { path: '/transfer-outfit-v2', body: await transferBody(name, ref) }, estimate: 10, armCap: CAP });
}
if (import.meta.main) {
  const mode = process.argv[2] ?? 'concept';
  if (mode === 'concept') { // concept B costs one Pro Flash image
    await paid({ arm: 'E4', label: 'E4 concept B', file: `${OUT}/E4/conceptB`, req: { path: '/create-image-pro-flash', body: { description: 'a horned viking helmet with gold trim, single item, no character, no head, game item sprite', image_size: { width: 128, height: 128 }, no_background: true, seed: SEED } }, estimate: 6, armCap: CAP });
    for (const n of ['A', 'B'] as const) if (exists(CONCEPTS[n].file)) { const p = await pasteUp(n); await save(`${OUT}/E4/paste_${n}.png`, p.paste); await save(`${OUT}/E4/item_${n}.png`, p.scaled); }
  } else await pool((['A', 'B'] as const).flatMap((n) => (['traw', 'tpaste', 'ea'] as const).map((v) => () => arm(n, v))), 6);
}
