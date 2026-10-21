// S5: zoomed contact sheet of raw posed frames (composite as returned) for chosen clips. usage: node s5_zoom.mjs <out.png> <scale> <file-prefix>...
import { experiment } from './lib/run.mjs';
import { sheet } from './lib/sheet.mjs';
const X = experiment('s5_held'), [out, s, ...pre] = process.argv.slice(2);
X.save(out, sheet(pre.map(p => [...Array(8).keys()].map(i => X.load(`${p}_${i}.png`))), { s: +s }));
