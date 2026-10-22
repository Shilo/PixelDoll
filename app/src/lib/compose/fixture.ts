// Test project from S1's real outputs (dev-fixtures/s1/, dev server only; built by scripts/build-fixture.ts).
// fixture.json = a manifest whose layers point at sheets holding only the generated directions; mirrored rows are left out
// (compose flips them). Single-layer items in a slot with bgZ are split into fg/bg here, like the item lab will do.
import { makeImg, type Img } from '../image/png.ts';
import { decodePngBytes } from '../image/pngraw.ts';
import { baseHashOf, cellHash, cellKeys, type DirectionName, type Sha256 } from '../rig/rig.ts';
import type { Layer, Manifest, Project } from '../store/manifest.ts';
import { cellImg, layerFrame, over } from './compose.ts';
import { splitFgBg } from './split.ts';

const crop = (s: Img, x: number, y: number, w: number, h: number): Img => {
  const o = makeImg(w, h);
  for (let r = 0; r < h; r++) o.data.set(s.data.subarray(((y + r) * s.w + x) * 4, ((y + r) * s.w + x + w) * 4), r * w * 4);
  return o;
};

export async function loadFixture(read: (path: string) => Promise<Uint8Array>): Promise<Project> {
  const m = JSON.parse(new TextDecoder().decode(await read('fixture.json'))) as Manifest;
  const images = new Map<string, Img>();
  const p: Project = { manifest: m, images };
  const { w, h } = m.rig.cell;
  const put = async (im: Img): Promise<Sha256 | null> => {
    if (!im.data.some((v, i) => i % 4 === 3 && v)) return null; // transparent cell
    const k = await cellHash(im);
    images.set(k, im);
    return k;
  };

  const generated = m.rig.directions.filter((d) => !d.mirrorOf);
  for (const it of m.items)
    for (const l of it.layers) {
      const { w, h } = layerFrame(m.rig, l); // oversize layers have their own cell (v1.3.1)
      l.cells = {};
      for (const [anim, path] of Object.entries(l.sheets ?? {})) {
        const s = await decodePngBytes(await read(path)), cells = m.rig.animations.find((a) => a.id === anim)!.cells;
        l.cells[anim] = {};
        for (const [r, d] of generated.entries()) l.cells[anim][d.id] = await Promise.all(Array.from({ length: cells }, (_, c) => put(crop(s, c * w, r * h, w, h))));
      }
      delete l.sheets;
    }

  const base = m.items.find((i) => i.id === m.rig.baseItem)!.layers[0];
  for (const it of m.items) {
    const bgZ = m.slots.find((s) => s.id === it.slot)?.bgZ;
    if (bgZ == null || it.layers.length !== 1) continue;
    const main = it.layers[0], f = layerFrame(m.rig, main), geo = { cell: main.cell, pivot: main.pivot };
    const fg: Layer = { id: 'fg', role: 'fg', z: main.z, ...geo, cells: {} }, bg: Layer = { id: 'bg', role: 'bg', z: bgZ, ...geo, cells: {} };
    const baseIn = (im: Img | null) => { const o = makeImg(f.w, f.h); if (im) over(o, im, f.x - m.rig.pivot.x, f.y - m.rig.pivot.y); return o; };
    for (const [anim, dirs] of Object.entries(main.cells!)) {
      fg.cells![anim] = {};
      bg.cells![anim] = {};
      for (const [dir, cells] of Object.entries(dirs!) as [DirectionName, (Sha256 | null)[]][]) {
        const split = cells.map((k, c) => (k ? splitFgBg(images.get(k)!, baseIn(cellImg(p, base, anim, dir, c))) : null));
        fg.cells![anim]![dir] = await Promise.all(split.map((s) => (s ? put(s.fg) : null)));
        bg.cells![anim]![dir] = await Promise.all(split.map((s) => (s ? put(s.bg) : null)));
      }
    }
    it.layers = [fg, bg];
  }

  const hashes: Record<string, Sha256> = {};
  for (const k of cellKeys(m.rig)) {
    const [a, d, c] = k.split('/');
    hashes[k] = await cellHash(cellImg(p, base, a, d as DirectionName, +c) ?? makeImg(w, h));
  }
  m.rig.baseHash = await baseHashOf(m.rig, hashes);
  for (const it of m.items) it.baseHash = m.rig.baseHash;
  return p;
}
