// Round 9: zero-generation dressing for near-rigid head items. Track the head in each real body frame (translation that best
// matches the rest view's head pixels) and paste the anchor's item layer there. Free and identical in every frame; it cannot
// turn, tilt or swing with the motion. Frame px the rest view lacks at that spot (a crossing arm) stay in front.
// Usage (spikes/api): node x28/paste.mts <item> <clip> [dirs]   -> out/x28/D/paste_<item>_<clip>_<d>.comp_<d>.<i>.png
import { save, OUT, chroma, BODY, type Img } from './lib.mts';
import { ITEMS, bodyFrames } from './dress.mts';

const C = 80;
const at = (im: Img, x: number, y: number) => (y * im.w + x) * 4;
function headBox(rest: Img) { let y0 = C; for (let y = 0; y < C && y0 === C; y++) for (let x = 0; x < C; x++) if (rest.data[at(rest, x, y) + 3]) { y0 = y; break; }
  return { y0, y1: y0 + 16 }; } // ~the head of a 64 px body
/** Shift (±12 px) whose head pixels best match the rest view's head (sum of color distance over the rest head's opaque px). */
function track(rest: Img, f: Img): [number, number] {
  const { y0, y1 } = headBox(rest); let best: [number, number] = [0, 0], bs = Infinity;
  for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) { let s = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < C; x++) { const i = at(rest, x, y); if (!rest.data[i + 3]) continue;
      const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= C || Y >= C) { s += 300; continue; }
      const j = at(f, X, Y); s += f.data[j + 3] ? Math.abs(rest.data[i] - f.data[j]) + Math.abs(rest.data[i + 1] - f.data[j + 1]) + Math.abs(rest.data[i + 2] - f.data[j + 2]) : 300; }
    if (s < bs) { bs = s; best = [dx, dy]; } }
  return best;
}

if (import.meta.main) {
  const [item, clip, dirs = 'south,east'] = process.argv.slice(2), it = ITEMS[item], key = chroma.pickKey(it.prompt);
  for (const d of dirs.split(',')) {
    const rest = await BODY.rest(d), layer = chroma.chromaLayer(await it.anchor(d), key, chroma.toChroma(rest, key)).layer, shifts: string[] = [];
    for (const [i, f] of (await bodyFrames(clip, d)).entries()) {
      const [dx, dy] = track(rest, f), comp = { w: C, h: C, data: new Uint8ClampedArray(f.data) };
      for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) { const X = x + dx, Y = y + dy, i2 = at(layer, x, y);
        if (!layer.data[i2 + 3] || X < 0 || Y < 0 || X >= C || Y >= C) continue;
        // occlusion: a frame px that the rest view did not have here (an arm crossing the head) stays in front of the item
        const j = at(f, X, Y), r = at(rest, x, y), front = f.data[j + 3] > 0 && (!rest.data[r + 3] || Math.abs(f.data[j] - rest.data[r]) + Math.abs(f.data[j + 1] - rest.data[r + 1]) + Math.abs(f.data[j + 2] - rest.data[r + 2]) > 90);
        if (!front) comp.data.set(layer.data.subarray(i2, i2 + 4), at(comp, X, Y)); }
      await save(`${OUT}/D/paste_${item}_${clip}_${d[0]}.comp_${d}.${i}.png`, comp); shifts.push(`${dx},${dy}`);
    }
    console.log(item, clip, d, 'head shifts', shifts.join(' '));
  }
}
