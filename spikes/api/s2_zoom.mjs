// S2 helper: zoomed crop sheet. usage: node s2_zoom.mjs out.png y0 y1 file1 file2 ...  (paths relative to out/)
import { experiment } from './lib/run.mjs';
import { canvasTo } from './lib/img.mjs';
import { sheet } from './lib/sheet.mjs';
const X = experiment('s2_zoom');
const [name, y0, y1, ...files] = process.argv.slice(2);
const crop = im => canvasTo(im, im.w, +y1 - +y0, 0, -+y0);
const rows = []; for (let i = 0; i < files.length; i += 4) rows.push(files.slice(i, i + 4).map(f => crop(X.load(`../${f}`))));
X.save(name, sheet(rows, { s: 8, checker: 8 }));
