// Evaluate round 5 (read-only). T: per item, keyframe area and largest part per view, production QA of the posed walks, and the px
// the old 4 px posed floor would have dropped. F: shoulder width per south/north text-move frame against the idle median.
// U: production QA per item and body, plus layer-over-base sheets (out/c25e/U/*.sheet.png) for the openings check.
import fs from 'node:fs';
import { readOnly, OUT, items, chroma, load, type Img } from './lib.mts';
readOnly();
import { evaluate, sheetOf, type Case } from './evaluate.mts';
import { rigA, restA, baseA, DIRS } from './s4rig.mts';
import { T_ITEMS, U_ITEMS, U_BODIES, F_FRAMES, fileOf, bodyU } from './arm_r5.mts';
const { components } = await import(new URL('../../../app/src/lib/image/chroma.ts', import.meta.url).href);
const frames = async (f: string) => { if (!fs.existsSync(`${f}.json`)) return null; const n = JSON.parse(fs.readFileSync(`${f}.json`, 'utf8')).frames; return Promise.all(Array.from({ length: n }, (_, i) => load(`${f}.${i}.png`))); };
const parts = (im: Img) => { const m = new Uint8Array(im.w * im.h); for (let p = 0; p < m.length; p++) m[p] = im.data[p * 4 + 3] ? 1 : 0; return components(m, im.w, im.h).map((c: number[]) => c.length).sort((a: number, b: number) => b - a); };
const mode = process.argv[2] ?? 'all';
if (mode === 'all' || mode === 'T') for (const [item, t] of Object.entries(T_ITEMS)) {
  const kf = await frames(fileOf('T', item, 'dress')); if (!kf) { console.log(`T ${item}: no dress`); continue; }
  const c: Case = { name: item, slot: t.slot, key: chroma.pickKey(t.prompt) as any, pad: 0, rig: rigA(), rest: {}, dress: {}, clips: [] };
  for (const [i, d] of DIRS.entries()) {
    c.rest[d] = await restA(d); c.dress[d] = kf[i];
    const w = await frames(fileOf('T', item, `walk_${d}`)); if (w) c.clips.push({ anim: 'walk', dir: d, frames: await Promise.all(w.map(async (o, k) => ({ base: await baseA(d, 'walk', k), out: o }))) });
  }
  const r = evaluate(c);
  console.log(`T ${item}: keyframes ${r.keyframes.map((k: any) => `${k.dir[0]} area ${k.area} parts [${parts(r.keys[k.dir]).slice(0, 4).join(',')}]`).join(' | ')}`);
  for (const cl of c.clips) {
    const cs = r.cells.filter((x: any) => x.key.startsWith(`walk/${cl.dir}/`)), small = cs.reduce((s: number, x: any) => s + parts(x.layer).filter((n: number) => n < 4).reduce((a: number, b: number) => a + b, 0), 0);
    console.log(`  walk/${cl.dir}: areas ${cs.map((x: any) => x.area).join(',')} | px in parts < 4 (old floor drops them) ${small}`);
  }
  console.log(`  status ${r.status} fails ${JSON.stringify(r.fails)} warnings ${JSON.stringify(r.warnings).slice(0, 300)}`);
  await sheetOf(`${OUT}/T/${item}.sheet.png`, r, c, 4);
}
if (mode === 'all' || mode === 'F') {
  const shoulders = (f: string) => {
    const file = `${fileOf('F', 'joints', f.replace('.png', ''))}.json`; if (!fs.existsSync(file)) return null;
    const k = JSON.parse(fs.readFileSync(file, 'utf8')).response?.keypoints; if (!Array.isArray(k)) return null;
    const at = (l: string) => k.find((p: any) => p.label === l);
    const L = at('LEFT SHOULDER'), R = at('RIGHT SHOULDER'), LH = at('LEFT HIP'), RH = at('RIGHT HIP');
    return L && R ? { sw: (L.x - R.x) * 128, hw: LH && RH ? (LH.x - RH.x) * 128 : null } : null; // signed: + when the character's left is screen right (south)
  };
  const byClip = new Map<string, string[]>();
  for (const f of F_FRAMES()) { const k = f.replace(/_\d+\.png$/, ''); (byClip.get(k) ?? (byClip.set(k, []), byClip.get(k)!)).push(f); }
  const ref: Record<string, number> = {};
  for (const d of ['south', 'north']) { const v = [...byClip.entries()].filter(([k]) => /_idle_/.test(k) && k.endsWith(d)).flatMap(([, fs_]) => fs_.map((f) => shoulders(f)?.sw).filter((x): x is number => x != null)); v.sort((a, b) => a - b); ref[d] = v[v.length >> 1]; }
  console.log('F idle median shoulder width', JSON.stringify(ref));
  for (const [k, fs_] of byClip) {
    const d = k.endsWith('south') ? 'south' : 'north', ws = fs_.sort((a, b) => +a.match(/_(\d+)\.png/)![1] - +b.match(/_(\d+)\.png/)![1]).map((f) => shoulders(f)?.sw);
    const ratio = ws.map((w) => (w == null ? null : +(w / ref[d]).toFixed(2)));
    console.log(`F ${k.padEnd(30)} ${ratio.map((x) => (x == null ? '  - ' : x.toFixed(2).padStart(5))).join(' ')}`);
  }
}
if (mode === 'all' || mode === 'U') for (const body of U_BODIES) for (const [item, t] of Object.entries(U_ITEMS)) {
  let b; try { b = bodyU(body); } catch { console.log(`U ${body}: not exported`); break; }
  const kf = await frames(fileOf('U', `${body}_${item}`, 'dress')); if (!kf) { console.log(`U ${body} ${item}: no dress`); continue; }
  const c: Case = { name: `${body} ${item}`, slot: t.slot, key: chroma.pickKey(t.prompt) as any, pad: 0, rig: b.rig, rest: {}, dress: {}, clips: [] };
  for (const [i, d] of b.drawn.entries()) {
    c.rest[d] = await b.rest(d); c.dress[d] = kf[i];
    const both = await frames(fileOf('U', `${body}_${item}`, `both_${d}`)); if (!both) continue;
    c.clips.push({ anim: 'idle', dir: d, frames: await Promise.all(both.slice(0, 4).map(async (o, k) => ({ base: await b.base(d, 'idle', k), out: o }))) });
    c.clips.push({ anim: 'walk', dir: d, frames: await Promise.all(both.slice(4, 12).map(async (o, k) => ({ base: await b.base(d, 'walk', k), out: o }))) });
  }
  const r = evaluate(c), failing = c.clips.map((cl) => `${cl.anim}/${cl.dir}`).filter((k) => r.fails.some((f: string) => f.includes(` ${k}`)));
  console.log(`U ${body.padEnd(9)} ${item.padEnd(6)} ${r.status} | keyframes ${r.keyframes.map((k: any) => `${k.dir[0]} ${k.keyKept}/${k.keyOutside}/${k.area}`).join(' ')} | failing clips ${failing.join(',') || '-'} | ${JSON.stringify(r.fails).slice(0, 200)}`);
  await sheetOf(`${OUT}/U/${body}_${item}.sheet.png`, r, c, 4);
}
