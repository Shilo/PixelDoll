// Arm S: recover walk calls whose job outlived the client's poll on the local API. GET only: polls each job id named in the
// stage log and saves its frames as paid() would; never resubmits. Usage (from spikes/api): C25_RUN=... node c25/s_recover.mts <log>
import './y_env.mts';
import fs from 'node:fs';
import { api, routes, save, OUT } from './lib.mts';
import { fileOf } from './arm_s.mts';
const APP = new URL('../../../app/src/lib/', import.meta.url).href;
const { decodePngBytes } = await import(APP + 'image/pngraw.ts');
const log = fs.readFileSync(`${OUT}/${process.argv[2] ?? 'stage2.log'}`, 'utf8');
await Promise.all([...log.matchAll(/ERROR S A (\S+) (\S+) walk\/(\S+): job (\S+) timed out/g)].map(async ([, item, a, d, id]) => {
  const file = fileOf('A', item, a, `walk_${d}`);
  if (fs.existsSync(`${file}.json`)) return;
  const { job } = await api!.waitJob(id, { timeoutMs: 90 * 60e3 });
  const imgs: any[] = [];
  for (const ji of routes.jobImages(job.last_response)) imgs.push(ji.b64 ? await decodePngBytes(new Uint8Array(Buffer.from(ji.b64, 'base64'))) : ji.rgba ? { w: ji.rgba.w, h: ji.rgba.h, data: new Uint8ClampedArray(Buffer.from(ji.rgba.b64, 'base64')) } : await decodePngBytes(new Uint8Array(await (await fetch(ji.url)).arrayBuffer())));
  for (const [i, im] of imgs.entries()) await save(`${file}.${i}.png`, im);
  fs.writeFileSync(`${file}.json`, JSON.stringify({ label: `S A ${item} ${a} walk/${d}`, frames: imgs.length, usage: [job.usage], seed: 7, recovered: id }));
  fs.appendFileSync(`${OUT}/recovered.jsonl`, JSON.stringify({ label: `S A ${item} ${a} walk/${d}`, job: id, gens: job.usage?.generations, frames: imgs.length }) + '\n');
  console.log(`RECOVERED ${item} ${a} walk/${d}: ${imgs.length} frames, ${job.usage?.generations} gens`);
}));
