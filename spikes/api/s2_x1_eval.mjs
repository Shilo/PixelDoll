// S2/X1 eval (offline): extract chroma layers from every s2_x1 run, composite over the REAL base, metrics + sheets.
// Also scores S1's skin-base layers (out/e4_anim/*.final_layer*.png) with the same no-GT cleanliness metrics.
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { over } from './lib/img.mjs';
import { layerFrom, layerStats, paletteJaccard, basePalette, paletteDist } from './lib/diff.mjs';
import { dropKeyOutline, chromaMask, keyKept, spill, KEY, despill } from './lib/chroma.mjs';
import { minArea, cleanliness } from './lib/clean.mjs';
import { sheet } from './lib/sheet.mjs';

const X = experiment('s2_x1');
const SK = JSON.parse(fs.readFileSync(`${X.dir}/../e4_anim/walk_skeletons.json`));
const DIRS = ['south', 'east'], base = DIRS.flatMap(d => [...Array(8).keys()].map(i => X.load(`../e2_anim/walk_${d}_${i}.png`)));
const sk = j => SK[`${DIRS[j >> 3]}_${j & 7}`];
const band = (y0, y1) => ({ x: 0, y: Math.max(0, Math.floor(y0)), w: 64, h: Math.min(64, Math.ceil(y1)) - Math.max(0, Math.floor(y0)) });
// Generous slot bands: the key colour does the real separation; slots only stop stray edits elsewhere.
export const SLOT = {
  helmet: k => band(0, k.NECK[1] + 3),
  chest: k => band(k.NECK[1] - 3, Math.max(k['LEFT HIP'][1], k['RIGHT HIP'][1]) + 6),
  boots: k => band(Math.min(k['LEFT KNEE'][1], k['RIGHT KNEE'][1]) - 3, 64),
  cape: k => band(k.NECK[1] - 4, 64),
  sword: () => band(0, 64),
};
export const ANCHOR = { helmet: 'NECK', chest: 'NECK', cape: 'NECK', boots: 'LEFT LEG', sword: 'RIGHT ARM' };
const skinPal = basePalette(base[0]).filter(([r, g, b]) => r - b > 30); // real base palette: skin + shorts ramps (for "skin leakage" metric)
const skinLeak = L => { let n = 0, k = 0; for (let i = 0; i < L.d.length; i += 4) if (L.d[i + 3]) { n++; if (paletteDist(skinPal, L.d[i], L.d[i + 1], L.d[i + 2]) <= 6) k++; } return n ? +(k / n).toFixed(3) : 0; };

export function summarize(layers, anchors) {
  const st = layers.map(layerStats), cl = layers.map(cleanliness), a = st.map(s => s.area), mean = a.reduce((x, y) => x + y) / a.length;
  const cv = Math.sqrt(a.reduce((x, y) => x + (y - mean) ** 2, 0) / a.length) / mean;
  const pj = st.slice(1).map((s, i) => paletteJaccard(s.palette, st[i].palette));
  const rel = st.map((s, i) => [s.cx - anchors[i][0], s.cy - anchors[i][1]]).filter(v => !isNaN(v[0]));
  const spread = [0, 1].map(c => +(Math.max(...rel.map(v => v[c])) - Math.min(...rel.map(v => v[c]))).toFixed(1));
  return { areaMean: +mean.toFixed(0), areaCV: +cv.toFixed(2), adjPaletteJ: +(pj.reduce((x, y) => x + y, 0) / pj.length).toFixed(2), centroidSpread: spread,
    specks: cl.reduce((x, c) => x + c.specks, 0), speckPx: cl.reduce((x, c) => x + c.speckPx, 0), pinholes: cl.reduce((x, c) => x + c.pinholes, 0), comps: +(cl.reduce((x, c) => x + c.comps, 0) / cl.length).toFixed(1), skinLeak: +(layers.reduce((x, L) => x + skinLeak(L), 0) / layers.length).toFixed(3) };
}

if (import.meta.url.endsWith('s2_x1_eval.mjs') && process.argv[1].endsWith('s2_x1_eval.mjs')) {
  const kT = +(process.argv[2] || 35), table = [];
  const tags = [...new Set(fs.readdirSync(X.dir).filter(f => /\.out7\.png$/.test(f)).map(f => f.replace('.out7.png', '')))].sort();
  for (const tag of tags) {
    const [item, v, route] = tag.split('_'), n = fs.existsSync(`${X.dir}/${tag}.out15.png`) ? 16 : 8;
    const layers = [], kept = [], sp = [], rows = [[], [], [], [], [], [], [], []];
    for (let j = 0; j < n; j++) {
      const B = base[j], C = X.load(`${tag}.out${j}.png`), m = minArea(dropKeyOutline(chromaMask(C, v, { region: SLOT[item](sk(j)), kT }), B, C, v, kT), 64, 64, 2), L = despill(layerFrom(C, m), v);
      layers.push(L); kept.push(keyKept(B, C, v, m, kT)); sp.push(spill(C, m, v));
      X.save(`${tag}.layer${j}.png`, L);
      const r = (j >> 3) * 4; rows[r].push(B); rows[r + 1].push(C); rows[r + 2].push(L); rows[r + 3].push(over(B, L));
    }
    X.save(`${tag}.final_sheet.png`, sheet(rows.filter(r => r.length), { s: 3 }));
    for (const [d, js] of n === 16 ? [['south', [0, 8]], ['east', [8, 16]]] : [['south', [0, 8]]]) {
      const Ls = layers.slice(...js), anchors = Ls.map((_, i) => sk(js[0] + i)[ANCHOR[item]]);
      table.push({ tag, dir: d, ...summarize(Ls, anchors), keyKept: +(kept.slice(...js).reduce((x, k) => x + k.kept, 0) / 8).toFixed(3), keyErased: +(kept.slice(...js).reduce((x, k) => x + k.erased, 0) / 8).toFixed(3), spill: +(sp.slice(...js).reduce((x, y) => x + y, 0) / 8).toFixed(3) });
    }
  }
  // S1 baseline: same metrics on S1's final skin-base layers
  const E4 = `${X.dir}/../e4_anim`;
  for (const tag of [...new Set(fs.readdirSync(E4).filter(f => /\.final_layer7\.png$/.test(f)).map(f => f.replace('.final_layer7.png', '')))].sort()) {
    const [, item, d] = tag.match(/^(\w+)_(\w+)__/), Ls = [...Array(8).keys()].map(i => X.load(`${E4}/${tag}.final_layer${i}.png`));
    table.push({ tag: 'S1:' + tag, dir: d, ...summarize(Ls, Ls.map((_, i) => SK[`${d}_${i}`][ANCHOR[item]])) });
  }
  console.table(table); X.saveJson(`x1_table_kT${kT}.json`, table);
  // key-score histogram of mannequin pixels (base-opaque, outside any item) to justify kT
  const hist = {};
  for (const tag of tags.filter(t => !t.includes('grey'))) { const v = tag.split('_')[1]; for (let j = 0; j < 8; j++) { const C = X.load(`${tag}.out${j}.png`), B = base[j]; for (let i = 0; i < C.d.length; i += 4) if (B.d[i + 3] && C.d[i + 3] >= 128 && !(((i >> 2) / 64 | 0) < sk(j).NECK[1] + 3)) { const s = KEY[v](C.d[i], C.d[i + 1], C.d[i + 2]), b = Math.max(-60, Math.min(200, Math.floor(s / 10) * 10)); hist[b] = (hist[b] || 0) + 1; } } }
  console.log('key-score histogram over base-opaque px (green+magenta runs, south):', JSON.stringify(Object.fromEntries(Object.entries(hist).sort((a, b) => a[0] - b[0]))));
}
