// S2: stack independently generated chroma layers over the frozen base (S1 base, walk S + E). Order: base, cape, boots, chest, helmet, sword.
import { experiment } from './lib/run.mjs';
import { over } from './lib/img.mjs';
import { sheet } from './lib/sheet.mjs';
const X = experiment('s2_x1');
const ORDER = ['cape_green_ea2', 'boots_green_ea2', 'chest_green_ea2', 'helmet_green_ea2', 'sword_green_ea2'];
const rows = [];
for (const [d, off] of [['south', 0], ['east', 8]]) {
  const r = [];
  for (let i = 0; i < 8; i++) { let C = X.load(`../e2_anim/walk_${d}_${i}.png`); for (const t of ORDER) C = over(C, X.load(`${t}.layer${i + off}.png`)); r.push(C); }
  rows.push([...Array(8).keys()].map(i => X.load(`../e2_anim/walk_${d}_${i}.png`)), r);
}
X.save('stack_sheet.png', sheet(rows, { s: 3 }));
