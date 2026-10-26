// Round 9 body-clip QA (no API calls): drawn props, broken bits, size and feet drift, and facing drift (which drawn rest
// view each frame's colors resemble most). Usage (spikes/api): node x28/qa.mts [filter]
import fs from 'node:fs';
import { OUT, BODY, clips, framesOf, type Img } from './lib.mts';

const opaque = (im: Img) => { let n = 0; for (let i = 3; i < im.data.length; i += 4) if (im.data[i]) n++; return n; };
function box(im: Img) { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.data[(y * im.w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2 }; }
/** Color histogram (4 bits per channel) of opaque px, for a facing guess: front views show face/chest colors, backs do not. */
const hist = (im: Img) => { const h = new Map<number, number>(); let n = 0;
  for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3]) { const k = ((im.data[i] >> 4) << 8) | ((im.data[i + 1] >> 4) << 4) | (im.data[i + 2] >> 4); h.set(k, (h.get(k) ?? 0) + 1); n++; }
  for (const [k, v] of h) h.set(k, v / n); return h; };
const sim = (a: Map<number, number>, b: Map<number, number>) => { let s = 0; for (const [k, v] of a) s += Math.min(v, b.get(k) ?? 0); return s; };

export async function qa(file: string, d: string) {
  const all = await framesOf(file); if (!all) return null;
  const frames = all.slice(1), rest = await BODY.rest(d), rb = box(rest), ra = opaque(rest);
  const views = Object.fromEntries(await Promise.all(['south', 'east', 'north'].map(async (v) => [v, hist(await BODY.rest(v))])));
  const rows = frames.map((im) => { const b = box(im), h = hist(im), a = opaque(im);
    const near = Object.entries(views).sort((p, q) => sim(h, q[1] as any) - sim(h, p[1] as any))[0][0];
    return { foreign: Math.round(a * (1 - clips.paletteFit(rest, [im], 24))), detached: clips.bodyComponents(im).detachedPixels, area: a / ra, feet: b.y1 - rb.y1, dx: b.cx - rb.cx, near }; });
  const r = (k: 'area' | 'feet' | 'dx') => [Math.min(...rows.map((x) => x[k])), Math.max(...rows.map((x) => x[k]))].map((v) => +v.toFixed(k === 'area' ? 2 : 1));
  return { size: `${frames[0].w}x${frames[0].h}`, props: rows.filter((x) => x.foreign >= 12).length, maxForeign: Math.max(...rows.map((x) => x.foreign)), maxDetached: Math.max(...rows.map((x) => x.detached)), area: r('area'), feet: r('feet'), dx: r('dx'), offFacing: rows.filter((x) => x.near !== d).map((x) => x.near[0]).join(''), n: frames.length };
}

if (import.meta.main) {
  const f = process.argv[2];
  for (const n of fs.readdirSync(`${OUT}/B`).filter((n) => n.endsWith('.json') && (!f || n.includes(f))).sort()) {
    const id = n.slice(0, -5), d = id.endsWith('south') ? 'south' : 'east', r = (await qa(`${OUT}/B/${id}`, d))!;
    console.log(id.padEnd(18), r.size, `props ${r.props}/${r.n} (max ${r.maxForeign})`.padEnd(18), `detached ${r.maxDetached}`.padEnd(13), `area ${r.area.join('–')}`.padEnd(15), `feet ${r.feet.join('..')}`.padEnd(14), `dx ${r.dx.join('..')}`.padEnd(16), `off-facing ${r.offFacing || '-'}`);
  }
}
