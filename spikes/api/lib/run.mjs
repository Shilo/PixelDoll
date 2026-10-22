// Node-only experiment harness: output dir, call log (base64 stripped), balance-delta cost tracking, image saving.
import fs from 'node:fs';
import path from 'node:path';
import { client, findImages, fetchBytes } from './api.mjs';
import { decode, encode, fromB64, fromRawB64 } from './img.mjs';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const strip = (v) => typeof v === 'string' && v.length > 300 ? `<${v.length} chars>` : Array.isArray(v) ? v.map(strip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, strip(x)])) : v;

export function experiment(name) {
  const dir = path.join(ROOT, 'out', name); fs.mkdirSync(dir, { recursive: true });
  const logFile = path.join(dir, 'calls.jsonl');
  const log = {
    call: (c) => fs.appendFileSync(logFile, JSON.stringify({ t: new Date().toISOString(), ...strip(c) }) + '\n'),
    event: (e) => fs.appendFileSync(logFile, JSON.stringify({ t: new Date().toISOString(), event: strip(e) }) + '\n'),
  };
  const api = process.env.PIXELLAB_API_KEY_AGENT_DEV ? client({ key: process.env.PIXELLAB_API_KEY_AGENT_DEV, log }) : null; // offline scripts need no key
  const save = (file, im) => { fs.writeFileSync(path.join(dir, file), encode(im)); return im; };
  const saveJson = (file, obj) => fs.writeFileSync(path.join(dir, file), JSON.stringify(strip(obj), null, 2));
  const load = (file) => decode(fs.readFileSync(path.isAbsolute(file) ? file : path.join(dir, file)));
  // Measure the generation cost of fn via balance delta (assumes no parallel spending on this account).
  async function costed(label, fn) {
    const b0 = await api.balance(); const t0 = Date.now();
    const r = await fn();
    const b1 = await api.balance();
    const cost = { label, ms: Date.now() - t0, usd: +(b0.credits.usd - b1.credits.usd).toFixed(4), generations: +(b0.subscription.generations - b1.subscription.generations).toFixed(3), reported: r?.res?.usage || r?.jobs?.map(j => j.usage) };
    fs.appendFileSync(path.join(dir, 'costs.jsonl'), JSON.stringify(cost) + '\n');
    console.log('COST', JSON.stringify(cost));
    return r;
  }
  return { dir, api, log, save, saveJson, load, costed };
}

// Decode every image in a payload (base64 png / rgba_bytes / url). rgba needs size hint.
export async function imagesOf(obj, sizeHint) {
  const out = [];
  for (const f of findImages(obj)) {
    if (f.url) out.push({ ...f, im: decode(await fetchBytes(f.url)) });
    else if (f.type === 'rgba_bytes') out.push({ ...f, im: fromRawB64(f.b64, sizeHint.w, sizeHint.h) });
    else out.push({ ...f, im: fromB64(f.b64) });
  }
  return out;
}
