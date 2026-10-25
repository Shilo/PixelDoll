// Campaign 2026-10-25 harness: production request builders and extraction from app/src/lib, the spike REST client, a spend
// ledger with hard caps, and no automatic resubmission of a paid request. Outputs stay local (spikes/api/out/c25, git-ignored).
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore spike JS client
import { client } from '../lib/api.mjs';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/src/lib/';
export const items = await import(APP + 'items/items.ts');
export const chroma = await import(APP + 'image/chroma.ts');
export const routes = await import(APP + 'pixellab/routes.ts');
export const clips = await import(APP + 'rig/clips.ts');
const { decodePngBytes, encodePngBytes } = await import(APP + 'image/pngraw.ts');
export type Img = { w: number; h: number; data: Uint8ClampedArray };

export const OUT = path.resolve(import.meta.dirname, '../out/c25');
fs.mkdirSync(OUT, { recursive: true });
const strip = (v: any): any => typeof v === 'string' && v.length > 300 ? `<${v.length} chars>` : Array.isArray(v) ? v.map(strip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, strip(x)])) : v;
const logFile = path.join(OUT, 'calls.jsonl');
const log = { call: (c: any) => fs.appendFileSync(logFile, JSON.stringify({ t: new Date().toISOString(), ...strip(c) }) + '\n'), event: (e: any) => fs.appendFileSync(logFile, JSON.stringify({ t: new Date().toISOString(), event: strip(e) }) + '\n') };
const key = process.env.PIXELLAB_API_KEY_AGENT_DEV;
export const api = key ? client({ key, log }) : null;

export const b64 = async (im: Img) => Buffer.from(await encodePngBytes(im)).toString('base64');
export const save = async (file: string, im: Img) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, await encodePngBytes(im)); return im; };
export const load = async (file: string): Promise<Img> => decodePngBytes(new Uint8Array(fs.readFileSync(file)));
export const exists = (f: string) => fs.existsSync(f);

// ---------- spend ledger: every paid call is recorded; an arm refuses to start a call that could pass its cap ----------
const LEDGER = path.join(OUT, 'ledger.jsonl');
export const spent = (arm?: string) => !fs.existsSync(LEDGER) ? 0 : fs.readFileSync(LEDGER, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !arm || r.arm === arm).reduce((s, r) => s + (r.gens ?? r.estimate), 0);
export const TOTAL_CAP = 943; // 1,000 approved minus 57 spent creating body B in the Studio (balance delta)
let READONLY = false;
/** Evaluation scripts call this first: paid() then only returns stored results. */
export const readOnly = () => { READONLY = true; };

async function decodeJobImage(j: any): Promise<Img> {
  if (j.b64) return decodePngBytes(new Uint8Array(Buffer.from(j.b64, 'base64')));
  if (j.rgba) return { w: j.rgba.w, h: j.rgba.h, data: new Uint8ClampedArray(Buffer.from(j.rgba.b64, 'base64')) };
  const r = await fetch(j.url); return decodePngBytes(new Uint8Array(await r.arrayBuffer()));
}

/**
 * One paid call. `file` is where its frames go (`<file>.<i>.png`) and also the idempotency marker: a call whose frames exist is
 * never sent again, and a call whose `<file>.sent` marker exists but has no frames is reported, not resent (it may have run).
 */
export async function paid(o: { arm: string; label: string; file: string; req: { path: string; body: any }; estimate: number; armCap: number }): Promise<Img[] | null> {
  const done = `${o.file}.json`, sent = `${o.file}.sent`;
  if (fs.existsSync(done)) { const n = JSON.parse(fs.readFileSync(done, 'utf8')).frames; return Promise.all(Array.from({ length: n }, (_, i) => load(`${o.file}.${i}.png`))); }
  if (READONLY) return null; // evaluation never spends
  if (fs.existsSync(sent)) { console.log(`LOST? ${o.label}: sent earlier without a stored result; not resending`); return null; }
  if (spent(o.arm) + o.estimate > o.armCap || spent() + o.estimate > TOTAL_CAP) { console.log(`CAP ${o.label}: arm ${spent(o.arm)}/${o.armCap}, total ${spent()}/${TOTAL_CAP}`); return null; }
  if (!api) throw new Error('no agent key (run with --env-file=../../.env)');
  fs.mkdirSync(path.dirname(o.file), { recursive: true });
  fs.writeFileSync(sent, new Date().toISOString());
  const t0 = Date.now();
  let r: any;
  try { r = await api.run(o.req.path, o.req.body); }
  catch (e: any) {
    fs.appendFileSync(LEDGER, JSON.stringify({ arm: o.arm, label: o.label, estimate: o.estimate, error: String(e.message).slice(0, 300), status: e.status }) + '\n');
    console.log(`ERROR ${o.label}: ${String(e.message).slice(0, 200)}`); return null;
  }
  const usage = [r.res?.usage, ...r.jobs.map((j: any) => j.usage)].filter(Boolean);
  const gens = usage.reduce((s: number, u: any) => s + (u.generations ?? 0), 0) || undefined;
  const imgs: Img[] = [];
  for (const j of r.jobs) for (const ji of routes.jobImages(j.last_response)) imgs.push(await decodeJobImage(ji));
  for (const [i, im] of imgs.entries()) await save(`${o.file}.${i}.png`, im);
  fs.writeFileSync(done, JSON.stringify({ label: o.label, frames: imgs.length, ms: Date.now() - t0, usage, seed: o.req.body.seed }));
  fs.appendFileSync(LEDGER, JSON.stringify({ arm: o.arm, label: o.label, estimate: o.estimate, gens, usage, frames: imgs.length, ms: Date.now() - t0 }) + '\n');
  console.log(`DONE ${o.label}: ${imgs.length} frames, ${gens ?? '?'} gens (est ${o.estimate}), ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return imgs;
}

/** Run tasks with a concurrency limit. */
export async function pool<T>(tasks: (() => Promise<T>)[], n = 6): Promise<T[]> {
  const out: T[] = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); } }));
  return out;
}
