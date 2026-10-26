// Round 9 step 2: dress the body's REAL text-animated frames (no skeleton). The body frames are chroma-keyed, an editor adds
// the item, and the item is keyed out; the anchor is the round 6 dressed rest view of the same direction.
// Tools: ea = edit-animation-v2 [anchor + 8 frames]; to = transfer-outfit-v2 (reference = anchor, 8 frames);
//        ei = edit-images-v2 one sheet image (both directions + anchors); ip = inpaint-v3 one sheet (anchors kept, item area masked).
// Usage (spikes/api): node --env-file=<repo root>/.env x28/dress.mts <tool> <item> <clip> [dirs comma]   (clip = e.g. pm_walk)
// Without the key it only evaluates stored results: node x28/dress.mts eval <tool> <item> <clip> [dirs]
import fs from 'node:fs';
import { b64, call, load, save, OUT, items, chroma, SEED, BODY, framesOf, spent, TOTAL_CAP, type Img } from './lib.mts';

const X26 = `${OUT}/../x26`;
export const ITEMS: Record<string, { slot: string; prompt: string; anchor: (d: string) => Promise<Img>; grow: number }> = {
  cloak: { slot: 'back', prompt: 'a long red cloak open at the front, hanging from the shoulders down to the calves', anchor: (d) => load(`${X26}/X3/state_cloak.${d}.png`), grow: 10 },
  hair: { slot: 'hair', prompt: 'shoulder-length dark brown hair, no hat', anchor: (d) => load(`${X26}/X4/dress_hair2.${['south', 'east'].indexOf(d)}.png`), grow: 6 },
  // the round 6 sword keyframe is 112 px (held items get a 16 px pad); its 80 px center crop keeps the blade (checked below)
  sword: { slot: 'main_hand', prompt: 'a steel longsword', anchor: async (d) => crop(await load(`${X26}/X4/dress_sword.${['south', 'east'].indexOf(d)}.png`), 16), grow: 99 },
};
const crop = (im: Img, p: number): Img => { const w = im.w - 2 * p, o = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y++) o.set(im.data.subarray(((y + p) * im.w + p) * 4, ((y + p) * im.w + p + w) * 4), y * w * 4); return { w, h: w, data: o }; };
const C = 80, size = { width: C, height: C };
const img = async (im: Img) => ({ type: 'base64', base64: await b64(im), format: 'png' });
const keyOf = (item: string) => chroma.pickKey(ITEMS[item].prompt);
const say = (item: string) => { const it = ITEMS[item]; return items.slotOf(it.slot).class === 'held' ? items.heldPhrase(it.prompt, it.slot) : it.prompt; };
/** Body frames 1..8 of a stored text clip (index 0 is the model's echo of the input). */
export const bodyFrames = async (clip: string, d: string) => (await framesOf(`${OUT}/B/${clip}_${d}`))!.slice(1);
const cellNames = (clip: string, d: string, n: number) => Array.from({ length: n }, (_, i) => `${clip.split('_')[1]}/${d}/${i + 1}`);

/** Sheet layout: per direction one row block = anchor + frames, 6 columns. */
function sheet(cells: Img[], cols = 6) { const rows = Math.ceil(cells.length / cols), W = cols * C, H = rows * C, o = new Uint8ClampedArray(W * H * 4);
  cells.forEach((c, i) => { const ox = (i % cols) * C, oy = Math.floor(i / cols) * C;
    for (let y = 0; y < C; y++) o.set(c.data.subarray(y * C * 4, (y + 1) * C * 4), ((oy + y) * W + ox) * 4); });
  return { w: W, h: H, data: o }; }
const cut = (S: Img, i: number, cols = 6): Img => { const ox = (i % cols) * C, oy = Math.floor(i / cols) * C, o = new Uint8ClampedArray(C * C * 4);
  for (let y = 0; y < C; y++) o.set(S.data.subarray(((oy + y) * S.w + ox) * 4, ((oy + y) * S.w + ox + C) * 4), y * C * 4); return { w: C, h: C, data: o }; };
/** Inpaint mask: white where the item may go = the body grown by `grow` px (the whole cell for held items); anchors black. */
function mask(cells: Img[], keep: boolean[], grow: number) {
  return cells.map((c, i) => { const m = new Uint8ClampedArray(C * C * 4);
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) { let on = false;
      if (!keep[i]) for (let dy = -grow; dy <= grow && !on; dy++) for (let dx = -grow; dx <= grow && !on; dx++) { const X = x + dx, Y = y + dy; on = X >= 0 && Y >= 0 && X < C && Y < C && c.data[(Y * C + X) * 4 + 3] > 0; }
      const j = (y * C + x) * 4, v = on ? 255 : 0; m[j] = m[j + 1] = m[j + 2] = v; m[j + 3] = 255; }
    return { w: C, h: C, data: m }; });
}

export const fileOf = (tool: string, item: string, clip: string, dirs: string[]) => `${OUT}/D/${tool}_${item}_${clip}_${dirs.map((d) => d[0]).join('')}`;

/** One paid call; returns per direction the 8 dressed frames (chroma body + item), or null. */
export async function dress(tool: string, item: string, clip: string, dirs: string[]) {
  const it = ITEMS[item], key = keyOf(item), file = fileOf(tool, item, clip, dirs);
  const per = await Promise.all(dirs.map(async (d) => ({ d, anchor: await it.anchor(d), frames: (await bodyFrames(clip, d)).map((f) => chroma.toChroma(f, key)) })));
  if (tool === 'ea' || tool === 'to') {
    const { d, anchor, frames } = per[0];
    const req = tool === 'ea'
      ? { path: '/edit-animation-v2', body: { description: items.itemPrompt(say(item), key, cellNames(clip, d, 8), `rest/${d}/0`), frames: await Promise.all([anchor, ...frames].map(async (f) => ({ image: await img(f), size }))), image_size: size, no_background: true, seed: SEED } }
      : { path: '/transfer-outfit-v2', body: { reference_image: { image: await img(anchor), size }, frames: await Promise.all(frames.map(async (f) => ({ image: await img(f), size }))), image_size: size, no_background: true, seed: SEED,
          additional_instructions: `Transfer ONLY the ${say(item)} from the reference onto the ${chroma.KEY_NAME[key]} mannequin in every frame, identical design and colors, fitted to each frame's pose. Facing ${d}. Keep the mannequin's pose, silhouette and ${chroma.KEY_NAME[key]} color exactly; no other clothing, weapons or effects.` } };
    const r = await call({ arm: tool, label: `${tool} ${item} ${clip} ${d}`, file, req, estimate: 15, armCap: 600 });
    if (!r) return null;
    const outs = Object.keys(r.imgs).sort((a, b) => +a.split('/').pop()! - +b.split('/').pop()!).map((k) => r.imgs[k]);
    return { [d]: tool === 'ea' ? outs.slice(1) : outs };
  }
  // sheets: cells = [anchor d1, frames d1..., anchor d2, frames d2...] in rows of 6 (anchor + 5, then 3 + ...): simple index order
  const cells = per.flatMap((p) => [p.anchor, ...p.frames]), keep = per.flatMap((p) => [true, ...p.frames.map(() => false)]);
  const S = sheet(cells), note = per.map((p, k) => `cells ${k * 9 + 1}-${k * 9 + 9} face ${p.d}: cell ${k * 9 + 1} already wears it, cells ${k * 9 + 2}-${k * 9 + 9} are ${clip.split('_')[1]} frames`).join('; ');
  const layout = `The image is a grid of ${cells.length} pixel-art cells of ${C}x${C} px, ${6} per row, read left to right, top to bottom; ${note}.`;
  const desc = `${layout} Add ${say(item)} to the ${chroma.KEY_NAME[key]} mannequin in every cell that lacks it: copy exactly the design, colors and size from the cells that already wear it, fitted to each cell's pose. Keep the mannequin's pose, silhouette and ${chroma.KEY_NAME[key]} color and the transparent background exactly; nothing else changes; no other clothing, weapons or effects.`;
  const req = tool === 'ei'
    ? { path: '/edit-images-v2', body: { method: 'edit_with_text', edit_images: [{ image: await img(S), width: S.w, height: S.h }], image_size: { width: S.w, height: S.h }, description: desc, no_background: true, seed: SEED } }
    : { path: '/inpaint-v3', body: { description: desc, inpainting_image: { image: await img(S), size: { width: S.w, height: S.h } }, mask_image: { image: await img(sheet(mask(cells, keep, it.grow))), size: { width: S.w, height: S.h } }, no_background: true, seed: SEED } };
  const r = await call({ arm: tool, label: `${tool} ${item} ${clip} ${dirs.join('+')}`, file, req, estimate: 25, armCap: 600 });
  if (!r) return null;
  const out = Object.values(r.imgs)[0];
  return Object.fromEntries(per.map((p, k) => [p.d, p.frames.map((_, i) => cut(out, k * 9 + 1 + i))]));
}

// ---------- evaluation ----------
/** Shift (±r px) that best lines the output's key-colored body up with the input body. */
function register(base: Img, out: Img, key: chroma.Key, r: number): [number, number] {
  const k = chroma.chromaMask(out, key), b = (x: number, y: number) => x >= 0 && y >= 0 && x < C && y < C && base.data[(y * C + x) * 4 + 3] > 0;
  let best: [number, number] = [0, 0], bs = -1;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { let s = 0;
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) if (k[y * C + x]) s += b(x - dx, y - dy) ? 1 : -1;
    if (s > bs + (dx || dy ? 2 : 0)) { bs = s; best = [dx, dy]; } }
  return best;
}
const shift = (im: Img, dx: number, dy: number): Img => { const o = new Uint8ClampedArray(im.data.length);
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < C && Y < C) o.set(im.data.subarray((Y * C + X) * 4, (Y * C + X) * 4 + 4), (y * C + x) * 4); }
  return { w: C, h: C, data: o }; };
const colorsOf = (L: Img) => { const s: number[][] = []; for (let i = 0; i < L.data.length; i += 4) if (L.data[i + 3]) s.push([L.data[i], L.data[i + 1], L.data[i + 2]]); return s; };
/** Mean distance from each item px color to the nearest anchor-item color (0 = only anchor colors). */
const palDist = (L: Img, ref: number[][]) => { const c = colorsOf(L); if (!c.length || !ref.length) return null;
  return c.reduce((s, p) => s + Math.min(...ref.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]))), 0) / c.length; };

export async function evaluate(tool: string, item: string, clip: string, dirs: string[], outs: Record<string, Img[]>) {
  const it = ITEMS[item], key = keyOf(item), res: any = {};
  for (const d of dirs) {
    const anchor = await it.anchor(d), restG = chroma.toChroma(await BODY.rest(d), key);
    const ref = colorsOf(chroma.chromaLayer(anchor, key, restG).layer), refArea = ref.length;
    const bodies = await bodyFrames(clip, d), rows: any[] = [];
    for (const [i, raw] of outs[d].entries()) {
      const base = chroma.toChroma(bodies[i], key), [dx, dy] = register(base, raw, key, tool === 'ei' ? 12 : 2), out = shift(raw, dx, dy);
      const { layer, mask: m } = chroma.chromaLayer(out, key, base);
      const area = colorsOf(layer).length;
      rows.push({ dx, dy, kept: +chroma.keyKept(base, out, key, m).kept.toFixed(3), outside: +chroma.keyOutside(base, out, key).toFixed(3), area, pal: palDist(layer, ref) });
      // composite over the real (unkeyed) body frame for viewing
      const comp = { w: C, h: C, data: new Uint8ClampedArray(bodies[i].data) };
      for (let p = 0; p < C * C; p++) if (layer.data[p * 4 + 3]) comp.data.set(layer.data.subarray(p * 4, p * 4 + 4), p * 4);
      await save(`${fileOf(tool, item, clip, dirs)}.comp_${d}.${i}.png`, comp);
      await save(`${fileOf(tool, item, clip, dirs)}.layer_${d}.${i}.png`, layer);
    }
    const areas = rows.map((r) => r.area), mean = areas.reduce((a, b) => a + b, 0) / areas.length, cv = Math.sqrt(areas.reduce((a, b) => a + (b - mean) ** 2, 0) / areas.length) / (mean || 1);
    res[d] = { keptMin: Math.min(...rows.map((r) => r.kept)), outsideMax: Math.max(...rows.map((r) => r.outside)), areaVsAnchor: +(mean / refArea).toFixed(2), areaCV: +cv.toFixed(2),
      palMean: +(rows.reduce((a, r) => a + (r.pal ?? 99), 0) / rows.length).toFixed(1), missing: rows.filter((r) => r.area < refArea * 0.25).length, shifts: [...new Set(rows.map((r) => `${r.dx},${r.dy}`))].join(' ') };
  }
  fs.writeFileSync(`${fileOf(tool, item, clip, dirs)}.eval.json`, JSON.stringify(res));
  return res;
}

if (import.meta.main) {
  let [tool, item, clip, dirs = 'south'] = process.argv.slice(2), evalOnly = false;
  if (tool === 'eval') { evalOnly = true; [tool, item, clip, dirs = 'south'] = process.argv.slice(3); }
  const ds = dirs.split(','), sheetTool = tool === 'ei' || tool === 'ip';
  const groups = sheetTool ? [ds] : ds.map((d) => [d]);
  for (const g of groups) {
    const outs = evalOnly ? null : await dress(tool, item, clip, g);
    if (evalOnly || !outs) { if (!fs.existsSync(`${fileOf(tool, item, clip, g)}.json`)) continue; }
    const o = outs ?? await dress(tool, item, clip, g); // stored results load without spending
    if (o) console.log(tool, item, clip, g.join('+'), JSON.stringify(await evaluate(tool, item, clip, g, o)));
  }
  console.log(`spent ${spent()} / ${TOTAL_CAP}`);
}
