// Offline: one screening sheet per template (rows top to bottom: raw template south, Studio re-render south, raw template
// east, Studio re-render east), 4x, 100 ms GIFs not needed. No network.
import fs from 'node:fs';
import path from 'node:path';
import './env.mts';
import { OUT, load, save } from '../c25/lib.mts';
const SCREEN: string[] = JSON.parse(fs.readFileSync(path.join(OUT, 'mannequin-templates.json'), 'utf8')).ids.filter((id: string) => !/^walk/.test(id));
type Img = { w: number; h: number; data: Uint8ClampedArray };
const SCALE = 4, GAP = 6, BG = [40, 40, 46];
// argv: [view] [ids comma list]; default south+east for every non-walk template.
const VIEW = process.argv[2] === "both" ? undefined : process.argv[2];
const SEED = process.env.SEED ?? "31";
const ONLY = process.argv[3]?.split(',');
const dst = path.join(OUT, VIEW ? `sheets-${VIEW}-s${SEED}` : `sheets-s${SEED}`);
fs.mkdirSync(dst, { recursive: true });
const seq = async (stem: string) => { const out: Img[] = []; for (let i = 0; fs.existsSync(`${stem}.${i}.png`); i++) out.push(await load(`${stem}.${i}.png`)); return out; };
for (const id of ONLY ?? SCREEN) {
  const views = VIEW ? [VIEW] : ['south', 'east'];
  const rows: Img[][] = [];
  for (const v of views) rows.push(await seq(path.join(OUT, id, `${v}_s${SEED}.norm`)), await seq(path.join(OUT, id, `T_${v}_s${SEED}`)));
  const cell = 84, n = Math.max(1, ...rows.map((r) => r.length));
  const W = n * (cell * SCALE + GAP), H = rows.length * (cell * SCALE + GAP);
  const sheet: Img = { w: W, h: H, data: new Uint8ClampedArray(W * H * 4) };
  for (let p = 0; p < W * H; p++) sheet.data.set([...BG, 255], p * 4);
  rows.forEach((row, r) => row.forEach((f, i) => {
    for (let y = 0; y < f.h * SCALE; y++) for (let x = 0; x < f.w * SCALE; x++) {
      const si = (Math.floor(y / SCALE) * f.w + Math.floor(x / SCALE)) * 4, a = f.data[si + 3] / 255;
      const di = ((r * (cell * SCALE + GAP) + y) * W + i * (cell * SCALE + GAP) + x) * 4;
      for (let c = 0; c < 3; c++) sheet.data[di + c] = Math.round(f.data[si + c] * a + sheet.data[di + c] * (1 - a));
    }
  }));
  await save(path.join(dst, `${id}.png`), sheet);
}
console.log('sheets', SCREEN.length, dst);
