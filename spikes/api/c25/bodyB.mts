// Studio-created bodies exported from the agent dev server's IndexedDB to out/c25/<name>.json (c25/receive.mjs): production Rig
// plus rest views, idle/walk frames and measured skeletons. Body B is a 64 px slender elf in an 80 px frame, Top-down 8 with 5
// drawn views; round 2 adds body128 (128 px human, 160 px frame) and chibi (64 px chibi dwarf), both Top-down 4.
import fs from 'node:fs';
import path from 'node:path';
import { type Img } from './lib.mts';
const APP = new URL('../../../app/src/lib/', import.meta.url).href;
const { decodePngBytes } = await import(APP + 'image/pngraw.ts');
export function studioBody(name: string) {
  const J = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../out/c25/${name}.json`), 'utf8'));
  const cache = new Map<string, Img>();
  const img = async (sha: string): Promise<Img> => cache.get(sha) ?? (cache.set(sha, await decodePngBytes(new Uint8Array(Buffer.from(J.images[sha], 'base64')))), cache.get(sha)!);
  return {
    rig: J.rig,
    drawn: J.rig.directions.filter((d: any) => !d.mirrorOf).map((d: any) => d.id) as string[],
    rest: (d: string) => img(J.rig.rest[d].image),
    base: (d: string, anim: string, i: number) => img(J.body.cells[anim][d][i]),
    /** Measured keypoints (px) of a body frame, as production's skelOf returns them. */
    skel: (key: string) => J.skeletons[key],
  };
}
const B = studioBody('bodyB');
export const rigB = () => B.rig;
export const DRAWN = B.drawn;
export const restB = B.rest;
export const baseB = B.base;
export const skelB = B.skel;
