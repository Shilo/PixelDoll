// Round 6 experiments (2026-10-26, docs/research/generation-pipeline-review-2026-10-25.md §11.5): shared helpers.
// Same safety rules as c25/lib.mts: one ledger with hard caps, a `.sent` marker per paid call, never an automatic resend.
// Run from spikes/api: node --env-file=<repo root>/.env x26/<step>.mts
import fs from 'node:fs';
import path from 'node:path';
process.env.C25_RUN = 'x26';
process.env.C25_CAP ??= '110';
const lib = await import('../c25/lib.mts');
export const { api, b64, save, load, items, chroma, routes, clips, OUT, spent, TOTAL_CAP } = lib;
export type Img = { w: number; h: number; data: Uint8ClampedArray };
const APP = new URL('../../../app/src/lib/', import.meta.url).href;
export const poses = await import(APP + 'rig/poses.ts');
export const estimate = await import(APP + 'rig/estimate.ts');
const { decodePngBytes } = await import(APP + 'image/pngraw.ts');
const { studioBody } = await import('../c25/bodyB.mts');

export const BODY = studioBody('c27man'); // round 5's fully bare default body: 64 px in an 80 px frame, S/E/N drawn
export const RIG = BODY.rig, CELL = RIG.cell;
export const LOOKS = 'a human man, bald, with plain bare skin everywhere, nothing worn, barefoot, empty hands, no weapon';
export const DIRS = ['south', 'east'] as const;
export const SEED = 7;
const LEDGER = path.join(OUT, 'ledger.jsonl');

export const flipH = (im: Img): Img => {
  const o = new Uint8ClampedArray(im.data.length);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) for (let c = 0; c < 4; c++) o[(y * im.w + im.w - 1 - x) * 4 + c] = im.data[(y * im.w + x) * 4 + c];
  return { w: im.w, h: im.h, data: o };
};

async function decode(j: any): Promise<Img> {
  if (j.b64) return decodePngBytes(new Uint8Array(Buffer.from(j.b64, 'base64')));
  if (j.rgba) return { w: j.rgba.w, h: j.rgba.h, data: new Uint8ClampedArray(Buffer.from(j.rgba.b64, 'base64')) };
  const r = await fetch(j.url);
  return decodePngBytes(new Uint8Array(await r.arrayBuffer()));
}

/**
 * One paid background call. Frames land in `<file>.<label>.png` (labels from the job: direction names or indices), the
 * submit response in `<file>.json`. A call whose result exists is never sent again; one with only a `.sent` marker is
 * reported as possibly run and not resent.
 */
export async function call(o: { arm: string; label: string; file: string; req: { path: string; body: any }; estimate: number; armCap: number }): Promise<{ imgs: Record<string, Img>; res: any; ms: number } | null> {
  const done = `${o.file}.json`, sent = `${o.file}.sent`;
  if (fs.existsSync(done)) {
    const J = JSON.parse(fs.readFileSync(done, 'utf8')), imgs: Record<string, Img> = {};
    for (const l of J.labels) imgs[l] = await load(`${o.file}.${l.replace(/\//g, '_')}.png`);
    return { imgs, res: J.res, ms: J.ms };
  }
  if (fs.existsSync(sent)) { console.log(`LOST? ${o.label}: sent earlier without a stored result; not resending`); return null; }
  const armSpent = spent(o.arm), total = spent();
  if (armSpent + o.estimate > o.armCap || total + o.estimate > TOTAL_CAP) { console.log(`CAP ${o.label}: arm ${armSpent}/${o.armCap}, total ${total}/${TOTAL_CAP}`); return null; }
  if (!api) throw new Error('no agent key (run with --env-file=<repo root>/.env)');
  fs.mkdirSync(path.dirname(o.file), { recursive: true });
  fs.writeFileSync(sent, new Date().toISOString());
  const t0 = Date.now();
  let r: any;
  try { r = await api.run(o.req.path, o.req.body); }
  catch (e: any) {
    fs.appendFileSync(LEDGER, JSON.stringify({ arm: o.arm, label: o.label, estimate: o.estimate, error: String(e.message).slice(0, 300), status: e.status }) + '\n');
    console.log(`ERROR ${o.label}: ${String(e.message).slice(0, 300)}`);
    return null;
  }
  const usage = [r.res?.usage, ...r.jobs.map((j: any) => j.usage)].filter(Boolean);
  const gens = usage.reduce((s: number, u: any) => s + (u.generations ?? 0), 0) || undefined;
  const imgs: Record<string, Img> = {};
  for (const j of r.jobs) for (const ji of routes.jobImages(j.last_response)) imgs[ji.label] = await decode(ji);
  for (const [l, im] of Object.entries(imgs)) await save(`${o.file}.${l.replace(/\//g, '_')}.png`, im);
  const ms = Date.now() - t0;
  fs.writeFileSync(done, JSON.stringify({ label: o.label, labels: Object.keys(imgs), res: r.res, ms, usage, lastResponseKeys: r.jobs.map((j: any) => Object.keys(j.last_response ?? {})) }));
  fs.appendFileSync(LEDGER, JSON.stringify({ arm: o.arm, label: o.label, estimate: o.estimate, gens, usage, frames: Object.keys(imgs).length, ms }) + '\n');
  console.log(`DONE ${o.label}: ${Object.keys(imgs).length} images, ${gens ?? '?'} gens (est ${o.estimate}), ${(ms / 1000).toFixed(0)} s`);
  return { imgs, res: r.res, ms };
}

/** Synchronous estimate-skeleton of one frame (0.1 gen), cached in `<file>.json`; returns keypoints in the frame's own 0-1 coords. */
export async function estimateFrame(o: { arm: string; label: string; file: string; img: Img; armCap: number }) {
  const done = `${o.file}.json`;
  if (fs.existsSync(done)) return JSON.parse(fs.readFileSync(done, 'utf8')).keypoints;
  if (spent(o.arm) + 0.1 > o.armCap || spent() + 0.1 > TOTAL_CAP) { console.log(`CAP ${o.label}`); return null; }
  const { image, scale, ox, oy } = estimateInput(o.img);
  let r: any;
  try { r = await api!.post('/estimate-skeleton', { image: { type: 'base64', base64: await b64(image), format: 'png' } }); }
  catch (e: any) { fs.appendFileSync(LEDGER, JSON.stringify({ arm: o.arm, label: o.label, estimate: 0.1, error: String(e.message).slice(0, 300) }) + '\n'); return null; }
  const kps = (r.keypoints ?? r.skeleton ?? r).map((k: any) => ({ label: k.label, x: (k.x * scale - ox) / o.img.w, y: (k.y * scale - oy) / o.img.h, z_index: k.z_index }));
  fs.mkdirSync(path.dirname(o.file), { recursive: true });
  fs.writeFileSync(done, JSON.stringify({ keypoints: kps, usage: r.usage }));
  fs.appendFileSync(LEDGER, JSON.stringify({ arm: o.arm, label: o.label, estimate: 0.1, gens: r.usage?.generations ?? 0.1 }) + '\n');
  return kps;
}
/** Pad a frame to a square power-of-two canvas (16..256) centered; returns the scale/offsets to map 0-1 results back. */
function estimateInput(im: Img) {
  const s = [16, 32, 64, 128, 256].find((n) => n >= Math.max(im.w, im.h)) ?? 256, ox = Math.floor((s - im.w) / 2), oy = Math.floor((s - im.h) / 2);
  const out = new Uint8ClampedArray(s * s * 4);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) for (let c = 0; c < 4; c++) out[((y + oy) * s + x + ox) * 4 + c] = im.data[(y * im.w + x) * 4 + c];
  return { image: { w: s, h: s, data: out }, scale: s, ox, oy };
}

export const restKps = (d: string) => RIG.rest[d].keypoints as { label: string; x: number; y: number }[];
/** Change-retarget: the body's rest pose plus each frame's offset from the source's own first frame (0-1 coords of the rig cell). */
export function retarget(src: { label: string; x: number; y: number }[][], d: string, srcCell: { w: number; h: number }) {
  const rest = restKps(d), at = (f: any[], l: string) => f.find((k) => k.label === l);
  return src.map((f) => rest.map((r) => {
    const a = at(f, r.label), b = at(src[0], r.label);
    const x = r.x + ((a.x - b.x) * srcCell.w) / CELL.w, y = r.y + ((a.y - b.y) * srcCell.h) / CELL.h;
    return { label: r.label, x: +Math.min(0.98, Math.max(0.02, x)).toFixed(4), y: +Math.min(0.98, Math.max(0.02, y)).toFixed(4) };
  }));
}

/** Raw skeleton-v3 render of the bare body through a keypoint sequence (production rawClip). */
export async function renderBody(o: { arm: string; armCap: number; name: string; dir: string; action: string; keypoints: any[][] }) {
  const req = clips.rawClip({ first: await b64(await BODY.rest(o.dir)), rest: restKps(o.dir), keypoints: o.keypoints, description: LOOKS, action: o.action, dir: o.dir as any, seed: SEED });
  const r = await call({ arm: o.arm, label: `${o.arm} body ${o.name} ${o.dir}`, file: `${OUT}/${o.arm}/body_${o.name}_${o.dir}`, req: req as any, estimate: clips.poseCallGens(o.keypoints.length), armCap: o.armCap });
  return r && Object.keys(r.imgs).sort((a, b) => +a.split('/').pop()! - +b.split('/').pop()!).map((k) => r.imgs[k]);
}
