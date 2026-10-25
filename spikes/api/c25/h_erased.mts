// Arm H survey (offline): base px the model erased (base opaque, output alpha < 128) that touch the extracted item, per cell,
// as 8-connected components; their sizes and whether they touch the cell border. Over the bench corpus (real outputs).
const A = new URL('../../../app/', import.meta.url).href;
const { runBench } = await import(A + 'scripts/bench.ts');
const { components } = await import(A + 'src/lib/image/chroma.ts');
const { cases, results } = await runBench();
const sizes: number[] = []; const per: Record<string, number> = {};
for (const r of results) for (const c of r.cells) {
  const w = c.base.w, h = c.base.h, er = new Uint8Array(w * h);
  for (let p = 0; p < er.length; p++) if (c.base.data[p * 4 + 3] && c.out.data[p * 4 + 3] < 128 && !c.mask[p]) er[p] = 1;
  for (const comp of components(er, w, h)) {
    const touches = comp.some((p) => { const x = p % w, y = (p / w) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && c.mask[Y * w + X]) return true; } return false; });
    const border = comp.some((p) => { const x = p % w, y = (p / w) | 0; return !x || !y || x === w - 1 || y === h - 1; });
    if (!touches) continue;
    sizes.push(comp.length); per[r.id] = (per[r.id] ?? 0) + comp.length;
    if (comp.length >= 6) console.log(`${r.id} ${c.key}: erased component of ${comp.length} px touching the item${border ? ' (cell border)' : ''}`);
  }
}
sizes.sort((a, b) => a - b);
console.log('per case erased px touching item:', JSON.stringify(per));
console.log('component sizes: n', sizes.length, 'median', sizes[sizes.length >> 1], 'p90', sizes[Math.floor(sizes.length * 0.9)], 'max', sizes.at(-1));
