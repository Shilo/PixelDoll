// Arm H prototype: cover erased base px (base opaque, output alpha < 128) in components of <= MAX px that touch the item, using the
// color of an adjacent item px (repeated dilation inside the component). Renders today vs filled, composited over the real base.
const A = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { runBench } = await import(A + 'scripts/bench.ts');
const { components } = await import(A + 'src/lib/image/chroma.ts');
const { recompose } = await import(A + 'src/lib/items/items.ts');
const { makeImg } = await import(A + 'src/lib/image/png.ts');
const { encodePngBytes } = await import(A + 'src/lib/image/pngraw.ts');
const fs = await import('node:fs');
const MAX = +(process.argv[3] ?? 24);
export function cover(c: any) {
  const w = c.base.w, h = c.base.h, er = new Uint8Array(w * h);
  for (let p = 0; p < er.length; p++) if (c.base.data[p * 4 + 3] && c.out.data[p * 4 + 3] < 128 && !c.mask[p]) er[p] = 1;
  const mask = new Uint8Array(c.mask), layer = { ...c.layer, data: new Uint8ClampedArray(c.layer.data) }; let n = 0;
  for (const comp of components(er, w, h)) {
    const border = comp.some((p) => { const x = p % w, y = (p / w) | 0; return !x || !y || x === w - 1 || y === h - 1; });
    if (border || comp.length > MAX) continue;
    let todo = new Set(comp), grew = true;
    while (todo.size && grew) { grew = false;
      for (const p of [...todo]) { const x = p % w, y = (p / w) | 0;
        for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) { const X = x + dx, Y = y + dy, q = Y * w + X;
          if (X >= 0 && Y >= 0 && X < w && Y < h && mask[q] && !todo.has(q)) { layer.data.set(layer.data.subarray(q * 4, q * 4 + 4), p * 4); mask[p] = 1; todo.delete(p); grew = true; n++; break; } } } }
    if (todo.size) for (const p of comp) if (todo.has(p)) continue; // untouched remainder (not reachable from the item) stays as is
  }
  return { mask, layer, n };
}
if (import.meta.main) {
  const { results } = await runBench(process.argv[2]);
  for (const r of results) {
    const rows = r.cells.filter((c: any) => /rest\/|\/(0|4)$/.test(c.key)).slice(0, 12);
    const C = rows[0].base.w, S = 4, o = makeImg(2 * C * S, rows.length * C * S);
    rows.forEach((c: any, ri: number) => { const f = cover(c); [recompose(c), recompose({ base: c.base, layer: f.layer })].forEach((im: any, ci: number) => { for (let y = 0; y < C * S; y++) for (let x = 0; x < C * S; x++) { const i = (((y / S) | 0) * C + ((x / S) | 0)) * 4; o.data.set(im.data[i + 3] ? im.data.subarray(i, i + 4) : [60, 60, 70, 255], ((ri * C * S + y) * o.w + ci * C * S + x) * 4); } }); });
    fs.writeFileSync(`C:/Users/shilo/AppData/Local/Temp/claude/C--Programming-Files-Shilocity-PixelLab-PixelDoll/91cf4d27-6716-43bd-8f98-273789a675e4/scratchpad/fill_${r.id}.png`, await encodePngBytes(o));
    console.log(r.id, 'filled px', r.cells.reduce((s: number, c: any) => s + cover(c).n, 0));
  }
}
