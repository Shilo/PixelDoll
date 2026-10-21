// Offline: re-extract every E4 run with given variants; temporal table + final sheets (base / composite / layer / base+layer).
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { over } from './lib/img.mjs';
import { layerFrom, layerStats, paletteJaccard, metrics } from './lib/diff.mjs';
import { VARIANTS } from './lib/extract.mjs';
import { sheet } from './lib/sheet.mjs';
const X = experiment('e4_anim');
const SK = JSON.parse(fs.readFileSync(`${X.dir}/walk_skeletons.json`));
const HEAD = ['NOSE', 'LEFT EYE', 'RIGHT EYE', 'LEFT EAR', 'RIGHT EAR'];
const cl = (x0, y0, x1, y1) => { x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(64, Math.ceil(x1)); y1 = Math.min(64, Math.ceil(y1)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
// generous slots: weapons get the whole half-canvas on the hand side
const REG = {
  helmet: (k) => { const cx = HEAD.reduce((a, l) => a + k[l][0], 0) / 5; return cl(cx - 12, 0, cx + 12, k.NECK[1] + 2); },
  sword: (k, d) => d === 'south' ? cl(0, k['RIGHT ARM'][1] - 22, k['RIGHT ARM'][0] + 6, 64) : cl(0, 10, 64, 64),
  chest: (k) => { const xs = ['LEFT SHOULDER', 'RIGHT SHOULDER', 'LEFT ELBOW', 'RIGHT ELBOW'].map(l => k[l][0]); return cl(Math.min(...xs) - 2, k.NECK[1] - 2, Math.max(...xs) + 3, Math.max(k['LEFT HIP'][1], k['RIGHT HIP'][1]) + 3); },
};
const variants = (process.argv[2] || 'slot_novel_cc,slot_novel2_grow1').split(',');
const tags = [...new Set(fs.readdirSync(X.dir).filter(f => /\.out7\.png$/.test(f)).map(f => f.replace('.out7.png', '')))];
const table = [];
for (const tag of tags) {
  const [, item, dir, route] = tag.match(/^(\w+)_(\w+)__(.+)$/);
  for (const v of variants) {
    const st = [], rows = [[], [], [], []]; let outside = 0, resid = 0;
    for (let i = 0; i < 8; i++) {
      const B = X.load(`../e2_anim/walk_${dir}_${i}.png`), C = X.load(`${tag}.out${i}.png`), r = REG[item](SK[`${dir}_${i}`], dir);
      const mask = VARIANTS[v](B, C, r), L = layerFrom(C, mask), s = layerStats(L), m = metrics(B, C, mask, { region: r });
      st.push(s); outside += m.outsideChanged; resid += m.residualInRegion;
      rows[0].push(B); rows[1].push(C); rows[2].push(L); rows[3].push(over(B, L));
      if (v === variants.at(-1)) X.save(`${tag}.final_layer${i}.png`, L);
    }
    const a = st.map(s => s.area), mean = a.reduce((x, y) => x + y) / 8, cv = Math.sqrt(a.reduce((x, y) => x + (y - mean) ** 2, 0) / 8) / mean;
    const pj = st.map((s, i) => i ? paletteJaccard(s.palette, st[i - 1].palette) : 1).slice(1);
    table.push({ tag, variant: v, layerPxMean: +mean.toFixed(0), areaCV: +cv.toFixed(2), adjPaletteJ: +(pj.reduce((x, y) => x + y) / 7).toFixed(2), colorsMean: +(st.reduce((x, s) => x + s.colors, 0) / 8).toFixed(1), bodyPxChangedOutsideSlot: +(outside / 8).toFixed(0), inSlotResidual: +(resid / 8).toFixed(0) });
    if (v === variants.at(-1)) X.save(`${tag}.final_sheet.png`, sheet(rows, { s: 3 }));
  }
}
console.table(table); X.saveJson('reextract_table.json', table);
