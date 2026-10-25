// Body B: a Studio-created character (64 px slender elf in an 80 px frame, Top-down 8 with 5 drawn views, idle + walk),
// exported from the agent dev server's IndexedDB to out/c25/bodyB.json (c25/receive.mjs). Production Rig plus its frames.
import fs from 'node:fs';
import path from 'node:path';
import { type Img } from './lib.mts';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/src/lib/';
const { decodePngBytes } = await import(APP + 'image/pngraw.ts');
const J = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../out/c25/bodyB.json'), 'utf8'));
const cache = new Map<string, Img>();
const img = async (sha: string): Promise<Img> => cache.get(sha) ?? (cache.set(sha, await decodePngBytes(new Uint8Array(Buffer.from(J.images[sha], 'base64')))), cache.get(sha)!);
export const rigB = () => J.rig;
export const DRAWN: string[] = J.rig.directions.filter((d: any) => !d.mirrorOf).map((d: any) => d.id);
export const restB = (d: string) => img(J.rig.rest[d].image);
export const baseB = (d: string, anim: string, i: number) => img(J.body.cells[anim][d][i]);
/** Measured keypoints (px) of a body frame, as production's skelOf returns them. */
export const skelB = (key: string) => J.skeletons[key];
