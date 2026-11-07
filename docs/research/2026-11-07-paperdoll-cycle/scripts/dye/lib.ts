// Labeled dye-material corpus for the 2026-11-07 cycle: retained PixelLab item layers in the repository.
// Sources: the demo fixture (app/public/fixtures/s2), dev fixtures s1 and s5, and the frozen benchmark
// (app/test/fixtures/bench, extracted with production code through this cycle's runPipe). Production code is imported, never copied.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { decodePngBytes, encodePngBytes } from '../../../../../app/src/lib/image/pngraw.ts';
import { makeImg, type Img } from '../../../../../app/src/lib/image/png.ts';
import { lab } from '../../../../../app/src/lib/dress/palette.ts';
import { runPipe } from '../extraction/bench-replay.ts';

export const OUT = 'C:/Programming_Files/Shilocity/PixelLab/checkouts/cycle-2026-11-07/dye/';
export const save = async (name: string, im: Img) => { mkdirSync(dirname(OUT + name), { recursive: true }); writeFileSync(OUT + name, await encodePngBytes(im)); };
export const saveJson = (name: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(OUT + name, JSON.stringify(v, null, 1)); };

export interface Item {
  id: string; source: string; slot: string; prompt: string;
  /** Every stored cell, as deriveMaterials sees them (itemImgs). */
  frames: Img[];
  /** One standing or first frame per drawn direction (adjacency for the candidate). */
  standing: Img[];
  /** pixeldoll/1 fixtures let the base claim colors first. */
  claimedByBase?: Set<number>;
}

const ROOT = new URL('../../../../../app/', import.meta.url);
const png = async (rel: string) => decodePngBytes(new Uint8Array(readFileSync(new URL(rel, ROOT))));
const cut = (sheet: Img, C: number, row: number, col: number): Img => {
  const o = makeImg(C, C);
  for (let y = 0; y < C; y++) o.data.set(sheet.data.subarray(((row * C + y) * sheet.w + col * C) * 4, ((row * C + y) * sheet.w + col * C + C) * 4), y * C * 4);
  return o;
};
const empty = (im: Img) => { for (let i = 3; i < im.data.length; i += 4) if (im.data[i]) return false; return true; };

async function fixtureItems(dir: string, tag: string): Promise<Item[]> {
  const f = JSON.parse(readFileSync(new URL(`${dir}/fixture.json`, ROOT), 'utf8'));
  const anims: Record<string, number> = Object.fromEntries(f.rig.animations.map((a: { id: string; cells: number }) => [a.id, a.cells]));
  const rows = f.rig.directions.filter((d: { mirrorOf?: string }) => !d.mirrorOf).length;
  const out: Item[] = [];
  for (const it of f.items) {
    const frames: Img[] = [], standing: Img[] = [];
    for (const l of it.layers) for (const [anim, rel] of Object.entries(l.sheets as Record<string, string>)) {
      const sheet = await png(`${dir}/${rel}`), n = anims[anim], C = sheet.w / n;
      const rowsHere = sheet.h / C;
      if (rowsHere !== Math.round(rowsHere) || rowsHere > rows) throw new Error(`${it.id} ${anim}: unexpected sheet ${sheet.w}x${sheet.h}`);
      for (let r = 0; r < rowsHere; r++) for (let c = 0; c < n; c++) {
        const im = cut(sheet, C, r, c);
        if (empty(im)) continue;
        frames.push(im);
        if (anim === 'walk' && c === 0) standing.push(im);
      }
    }
    out.push({ id: `${tag}/${it.id}`, source: `app/${dir}`, slot: it.slot, prompt: it.prompt ?? it.name, frames, standing });
  }
  return out;
}


async function benchItems(): Promise<Item[]> {
  const cases = JSON.parse(readFileSync(new URL('test/fixtures/bench/cases.json', ROOT), 'utf8')).filter((c: { role?: string; key: string }) => !c.role && c.key !== 'none');
  const out: Item[] = [];
  for (const c of cases) {
    const run = await runPipe(c);
    const kf = run.kf.map((x) => x.layer).filter((im) => !empty(im)), cells = run.cells.map((x) => x.layer).filter((im) => !empty(im));
    out.push({ id: `bench/${c.id}`, source: 'app/test/fixtures/bench (runPipe)', slot: c.slot, prompt: c.source, frames: [...kf, ...cells], standing: kf });
  }
  return out;
}

export async function loadItems(): Promise<Item[]> {
  const s2 = await fixtureItems('public/fixtures/s2', 's2'), s1 = await fixtureItems('dev-fixtures/s1', 's1'), s5 = await fixtureItems('dev-fixtures/s5', 's5');
  return [...s2, ...s1, ...s5, ...(await benchItems())];
}

const key = (c: number) => { const [L, a, b] = lab(c), C = Math.hypot(a, b), h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360; return C < 0.04 ? [-1, L] : [Math.floor(h / 30), L]; };

/** Neutral display order: achromatic first, then 30-degree hue buckets, each dark to light. */
export const displayOrder = (cols: number[]) => [...cols].sort((p, q) => { const a = key(p), b = key(q); return a[0] - b[0] || a[1] - b[1]; });

