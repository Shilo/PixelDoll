// B11: verify the .aseprite export with the real Aseprite CLI (batch mode only).
// node docs/testing/b11_aseprite_tests/verify-aseprite.ts <fixture s1|s2|s5> <outDir> [zmut]
// zmut: adds a south head/hand fg override behind the body, and also checks that a copy with cel z-indexes zeroed DIFFERS.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const APP = new URL('../../../app/', import.meta.url).href;
const { loadFixture } = await import(APP + 'src/lib/compose/fixture.ts');
const { exportFiles } = await import(APP + 'src/lib/export/export.ts');
const { decodePngBytes } = await import(APP + 'src/lib/image/pngraw.ts');
const ASE = 'C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe';

const [fixture = 's1', outDir = 'out', mode = ''] = process.argv.slice(2);
const p = await loadFixture(async (f: string) => readFileSync(new URL(`${fixture === 's2' ? 'public/fixtures' : 'dev-fixtures'}/${fixture}/${f}`, APP)));
if (mode === 'zmut') {
  const head = p.manifest.slots.find((s: { id: string }) => s.id === (fixture === 's5' ? 'main_hand' : 'head'));
  head.zOverrides = [...(head.zOverrides ?? []), { layer: 'fg', z: 1, dir: 'south' }];
}
const r = await exportFiles(p, { engines: ['aseprite', 'generic'], baked: true, exportedAt: 'T' });
if (r.errors.length) throw new Error(r.errors.join('\n'));
const tree = join(outDir, `${fixture}${mode}`);
rmSync(tree, { recursive: true, force: true });
for (const e of r.entries) { mkdirSync(dirname(join(tree, e.name)), { recursive: true }); writeFileSync(join(tree, e.name), e.data); }
const m = JSON.parse(readFileSync(join(tree, 'manifest.json'), 'utf8'));
const file = join(tree, r.entries.find((e: { name: string }) => e.name.endsWith('.aseprite')).name);
const png = async (f: string) => decodePngBytes(new Uint8Array(readFileSync(f)));

const ase = (args: string[]) => execFileSync(ASE, ['-b', ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
function run(src: string, tag: string) {
  const o = join(tree, 'cli_' + tag);
  mkdirSync(o, { recursive: true });
  const listing = ase(['--list-layers', '--list-tags', '--list-slices', src, '--format', 'json-array', '--sheet-type', 'rows', '--sheet-columns', '16', '--data', join(o, 'comp.json'), '--sheet', join(o, 'comp.png')]);
  ase(['--all-layers', '--split-layers', src, '--filename-format', '{layer}|{frame}', '--format', 'json-array', '--sheet-type', 'rows', '--sheet-columns', '16', '--data', join(o, 'layers.json'), '--sheet', join(o, 'layers.png')]);
  return { o, listing };
}

// expected timeline
const frames: { anim: string; dir: string; row: number; cell: number; ms: number }[] = [], tags: string[] = [];
for (const a of m.rig.animations) for (const dir of a.directions) {
  const from = frames.length, row = m.rig.directions.findIndex((d: { id: string }) => d.id === dir);
  for (const f of a.frames) frames.push({ anim: a.id, dir, row, cell: f.cell, ms: f.ms });
  tags.push(`${a.id}_${dir}:${from}-${frames.length - 1}`);
}
const bf = { w: m.export.bakedCell.w, h: m.export.bakedCell.h, x: m.export.bakedPivot.x, y: m.export.bakedPivot.y };
const layerName = (it: { slot: string; id: string; layers: unknown[] }, l: { id: string }) => `${it.slot}.${it.id}${it.layers.length > 1 ? '.' + l.id : ''}`;
const layers = new Map<string, { sheets: Record<string, string>; cell: { w: number; h: number }; pivot: { x: number; y: number } }>();
for (const it of m.items) for (const l of it.layers) layers.set(layerName(it, l), l);

const sub = (im: { w: number; data: Uint8ClampedArray }, x: number, y: number, w: number, h: number, ox = 0, oy = 0, cw = w, ch = h) => {
  const o = new Uint8ClampedArray(cw * ch * 4);
  for (let r = 0; r < h; r++) o.set(im.data.subarray(((y + r) * im.w + x) * 4, ((y + r) * im.w + x + w) * 4), ((oy + r) * cw + ox) * 4);
  return o;
};
const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if ((a[i + 3] || b[i + 3]) && (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3])) n++;
  return n;
};

async function check(tag: string, src: string) {
  const { o, listing } = run(src, tag);
  const comp = JSON.parse(readFileSync(join(o, 'comp.json'), 'utf8')), lay = JSON.parse(readFileSync(join(o, 'layers.json'), 'utf8'));
  const res: Record<string, unknown> = { tag };
  // meta
  const gotTags = comp.meta.frameTags.map((t: { name: string; from: number; to: number }) => `${t.name}:${t.from}-${t.to}`);
  res.tags = gotTags.join() === tags.join() ? `ok ${tags.length}` : `MISMATCH ${gotTags.join()} vs ${tags.join()}`;
  const repeatsOk = comp.meta.frameTags.every((t: { name: string; repeat?: string }) => (m.rig.animations.find((a: { id: string }) => t.name.startsWith(a.id + '_')).loop ? !t.repeat : t.repeat === '1'));
  res.repeat = repeatsOk ? 'ok' : JSON.stringify(comp.meta.frameTags);
  res.layers = comp.meta.layers.map((l: { name: string }) => l.name).join(' < ');
  res.slices = JSON.stringify(comp.meta.slices.map((s: { name: string; keys: { bounds: unknown; pivot: unknown }[] }) => [s.name, s.keys[0].bounds, s.keys[0].pivot]));
  res.listing = listing.trim().split(/\r?\n/).length + ' lines';
  const durOk = comp.frames.length === frames.length && comp.frames.every((f: { duration: number }, i: number) => f.duration === frames[i].ms);
  res.frames = `${comp.frames.length} (expected ${frames.length}), durations ${durOk ? 'ok' : 'MISMATCH'}`;
  // composite vs baked/<preset0>
  const cs = await png(join(o, 'comp.png')), baked = new Map<string, any>();
  let cd = 0, cpx = 0;
  for (const [i, fr] of frames.entries()) {
    const k = fr.anim;
    if (!baked.has(k)) baked.set(k, await png(join(tree, `baked/${m.presets[0].id}/${k}.png`)));
    const rect = comp.frames[i].frame;
    cd += diff(sub(cs, rect.x, rect.y, rect.w, rect.h), sub(baked.get(k), fr.cell * bf.w, fr.row * bf.h, bf.w, bf.h));
    cpx += bf.w * bf.h;
  }
  res.composite = `${cd} / ${cpx} px differ vs baked/${m.presets[0].id}`;
  // per layer vs layers/<...>.png sheets placed on the canvas by pivot
  const ls = await png(join(o, 'layers.png')), sheetCache = new Map<string, any>();
  let ld = 0, lpx = 0, seen = 0;
  const frameBase = Math.min(...lay.frames.map((f: { filename: string }) => +f.filename.split('|')[1]));
  for (const f of lay.frames) {
    const [name, fi] = f.filename.split('|'), fr = frames[+fi - frameBase], l = layers.get(name);
    if (!l) throw new Error(`unknown layer ${name}`);
    const path = join(tree, l.sheets[fr.anim]);
    if (!sheetCache.has(path)) sheetCache.set(path, await png(path));
    const exp = sub(sheetCache.get(path), fr.cell * l.cell.w, fr.row * l.cell.h, l.cell.w, l.cell.h, bf.x - l.pivot.x, bf.y - l.pivot.y, bf.w, bf.h);
    ld += diff(sub(ls, f.frame.x, f.frame.y, f.frame.w, f.frame.h), exp);
    lpx += bf.w * bf.h;
    seen++;
  }
  res.perLayer = `${ld} / ${lpx} px differ over ${seen} layer-frames (expected ${layers.size * frames.length})`;
  return res;
}

console.log(JSON.stringify(await check('main', file), null, 1));
if (mode === 'zmut') {
  const b = new Uint8Array(readFileSync(file)), v = new DataView(b.buffer);
  let n = 0;
  for (let p0 = 128, f = 0; f < v.getUint16(6, true); f++) {
    for (let c = p0 + 16, k = v.getUint32(p0 + 12, true); k--; c += v.getUint32(c, true))
      if (v.getUint16(c + 4, true) === 0x2005 && v.getInt16(c + 6 + 9, true)) { v.setInt16(c + 6 + 9, 0, true); n++; }
    p0 += v.getUint32(p0, true);
  }
  const z0 = file.replace('.aseprite', '_z0.aseprite');
  writeFileSync(z0, b);
  console.log(`zeroed ${n} cel z-indexes ->`, JSON.stringify(await check('z0', z0), null, 1));
}
