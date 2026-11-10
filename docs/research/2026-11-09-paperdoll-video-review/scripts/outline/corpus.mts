// Frozen bench corpus (app/test/fixtures/bench via scripts/bench.ts runBench) and the S4 q3e keyframes, baseline vs variants.
// Run from app/: node --import <scratch>/outline/hook.mjs <scratch>/outline/corpus.mts
import fs from 'node:fs';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const SCR = process.env.OUT_DIR ?? import.meta.dirname; // sheets and logs
const { runBench, report } = await import(APP + 'scripts/bench.ts');
const chroma = await import(APP + 'src/lib/image/chroma.ts');
const items = await import(APP + 'src/lib/items/items.ts');
const { encodePngBytes } = await import(APP + 'src/lib/image/pngraw.ts');
const SP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/spikes/api/c25/';
const { restA, keyframeA, S4_ITEMS, DIRS, rigA } = await import(SP + 's4rig.mts');
const { cropMark } = await import('./sheet.mts');
type Img = { w: number; h: number; data: Uint8ClampedArray };
const VARIANTS = (process.env.VARIANTS ?? 'off,v1,v2').split(',');
const px = (im: Img, p: number) => [im.data[p * 4], im.data[p * 4 + 1], im.data[p * 4 + 2]];
const lum = (c: number[]) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
const skelOf = (rig: any, d: string) => Object.fromEntries(rig.rest[d].keypoints.map((p: any) => [p.label, { x: p.x * rig.cell.w, y: p.y * rig.cell.h }]));
const rig = rigA();
async function run(v: string) {
  (globalThis as any).__OUTLINE = v;
  const { cases, results } = await runBench();
  const rep = await report(results, cases);
  const s4: any[] = [];
  for (const [item, { slot }] of Object.entries(S4_ITEMS) as any) {
    if (slot === 'main_hand') continue; // held keyframes need the padded cell; skipped
    for (const d of DIRS) s4.push({ id: `s4/${item}/${d}`, c: items.extractCell({ key: `rest/${d}/0`, call: 0, base: await restA(d), out: await keyframeA(item, d), route: 'green', band: items.bandOf(slot, skelOf(rig, d), 64) }) });
  }
  const cells = [...results.flatMap((r: any) => r.cells.map((c: any) => ({ id: `${r.id}/${c.key}`, case: r.id, key: cases.find((x: any) => x.id === r.id).key, c }))), ...s4.map((x) => ({ ...x, case: 's4', key: 'green' }))];
  return { rep, results, cells };
}
const res: Record<string, any> = {};
for (const v of VARIANTS) res[v] = await run(v);
const B = res.off;
const lostOf = (c: any, k: any) => { const o: number[] = []; for (let p = 0; p < c.mask.length; p++) { if (c.mask[p] || c.out.data[p * 4 + 3] < 128) continue; const [r, g, b] = px(c.out, p); if (chroma.keyScore(k, r, g, b) >= chroma.KT && chroma.rampDistance(k, r, g, b) > 40) o.push(p); } return o; };
const keyOf = (c: any) => c.chroma ?? 'none';
let baseLost = 0; for (const x of B.cells) if (keyOf(x.c) !== 'none') baseLost += lostOf(x.c, keyOf(x.c)).length;
console.log('cells', B.cells.length, 'baseline lost px (far-from-ramp key px dropped)', baseLost);
for (const v of VARIANTS.filter((x) => x !== 'off')) {
  const R = res[v];
  const repDiff = B.rep.split('\n').map((l: string, i: number) => [l, R.rep.split('\n')[i]]).filter(([a, b]: string[]) => a !== b);
  console.log(`\n## ${v}: report lines changed ${repDiff.length}`); for (const [a, b] of repDiff) console.log('  -', a, '\n  +', b);
  let add = 0, dark = 0, onBodyLine = 0, g2c = 0, g3c = 0, n = 0;
  const per: Record<string, number> = {}, rows: Record<string, any[]> = {};
  for (const [i, x] of R.cells.entries()) {
    const cb = B.cells[i].c, cv = x.c; n++;
    const added: number[] = [];
    for (let p = 0; p < cv.mask.length; p++) if (cv.mask[p] && !cb.mask[p]) added.push(p);
    const removed = [...cb.mask.keys()].filter((p) => cb.mask[p] && !cv.mask[p]).length;
    if (items.g2Fails(cb) !== items.g2Fails(cv)) g2c++;
    const lim = cv.posed ? items.GATES.keyOutsidePosed : items.GATES.keyOutside;
    if (((cb.keyOutside ?? 0) > lim) !== ((cv.keyOutside ?? 0) > lim)) g3c++;
    if (!added.length && !removed) continue;
    add += added.length; per[x.case] = (per[x.case] ?? 0) + added.length;
    for (const p of added) { if (lum(px(cv.out, p)) < 0.138) dark++; const bc = px(cv.base, p); if (cv.base.data[p * 4 + 3] && (bc[0] + bc[1] + bc[2]) / 3 < 40) onBodyLine++; }
    if (removed) console.log('  removed px (postProcess interaction)', x.id, removed);
    (rows[x.case] ??= []).push({ out: cv.out, lb0: cb.layer, layerOnly: cv.layer, lost: lostOf(cb, keyOf(cb)).filter((p) => !added.includes(p)), added });
  }
  console.log(`cells ${n}, added px ${add} (${(add / n).toFixed(3)} per cell; dark ${dark}; over a dark body line ${onBodyLine}), G2 flips ${g2c}, G3 flips ${g3c}`);
  console.log('added per case', per);
  for (const [k, r] of Object.entries(rows)) { const f = `${SCR}sheets/corpus_${v}/crop_${k}.png`; fs.mkdirSync(`${SCR}sheets/corpus_${v}`, { recursive: true }); fs.writeFileSync(f, await encodePngBytes(cropMark(r.slice(0, +(process.env.NROW ?? 10)).slice(+(process.env.ROW0 ?? 0)), +(process.env.ZOOM ?? 10)))); }
}
