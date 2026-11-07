// Offline preparation only. The generated, ignored browser page requires an explicit paid click.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { base64ToBytes, bytesToBase64, makeImg } from '../../../../app/src/lib/image/png.ts';
import { decodePngBytes, encodePngBytes } from '../../../../app/src/lib/image/pngraw.ts';
import { over } from '../../../../app/src/lib/compose/compose.ts';
import { toChroma, KEY_NAME } from '../../../../app/src/lib/image/chroma.ts';
import type { TrialPacket } from '../../../../app/src/ui/item-trial/trial.ts';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const output = resolve(root, 'app/test-results-post-handoff-live');
mkdirSync(output, { recursive: true });
const trials = [];
for (const [caseIndex, caseId] of ['a-chest', 'b-tunic'].entries()) {
  for (const [viewIndex, direction] of ['south', 'east'].entries()) {
    const packet = JSON.parse(readFileSync(resolve(root, `app/test-results-item-trials/packets/${caseId}-${direction}-raw-110601.json`), 'utf8')) as TrialPacket;
    const base = await decodePngBytes(base64ToBytes(packet.reference.base));
    const garment = await decodePngBytes(base64ToBytes(packet.reference.layer));
    const collage = makeImg(2 * base.w, base.h);
    over(collage, toChroma(base, packet.key));
    over(collage, garment, base.w, 0);
    const firstFrame = bytesToBase64(await encodePngBytes(collage));
    const description = `Pixel art, fixed camera and fixed pixel grid. There is one mannequin on the left and a separate garment on the right. ` +
      `The mannequin stays completely frozen in exactly the same pose, location, scale and appearance for all frames. ` +
      `Keep its ${KEY_NAME[packet.key]} mannequin colors exactly unchanged; the garment must not use ${KEY_NAME[packet.key]}. ` +
      `The garment on the right teleports onto the mannequin in a flash and keeps exactly its colors, neckline, border and other design details. ` +
      `The right-hand garment disappears after dressing. The last frame shows the dressed mannequin at its original left-hand position. ` +
      `Garment: ${packet.prompt}.`;
    for (const arm of ['plain', 'physics']) {
      trials.push({ id: `${caseId}-${direction}-${arm}`, caseId, direction, arm,
        seed: 110701 + caseIndex * 10 + viewIndex, cell: packet.cell, packet,
        request: { method: 'POST', path: '/animate-pixminimax', body: {
          first_frame: { type: 'base64', base64: firstFrame },
          description: description + (arm === 'physics' ? ' Real cloth physics then settle the garment: gravity pulls the soft cloth onto the shoulders, torso and arms, producing natural folds while the mannequin remains frozen.' : ''),
          frame_count: 8, seed: 110701 + caseIndex * 10 + viewIndex, no_background: true,
          direction, view: packet.rig.view ?? 'low top-down',
        } },
      });
    }
  }
}
const plan = { version: 1, id: 'endpoint-dressing-2026-11-07-pilot', expectedResults: 8, candidateIndex: 7,
  purpose: 'Matched plain versus cloth-settling endpoint dressing, fixed left crop, all frames retained; no default promotion.', trials };
writeFileSync(resolve(output, 'plan.json'), JSON.stringify(plan));
writeFileSync(resolve(output, 'index.html'), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Endpoint dressing qualification</title>
<style>body{font:16px system-ui;background:#15181c;color:#eee;max-width:1100px;margin:2rem auto;padding:1rem}button,a{margin:.5rem;padding:.7rem}table{border-collapse:collapse}td,th{padding:.5rem;border:1px solid #777}pre{white-space:pre-wrap}img{image-rendering:pixelated;max-width:100%}</style>
<h1>Endpoint dressing qualification</h1><p>Agent mode · public frozen fixtures · real PixelLab credits</p>
<p>Eight planned PixMiniMax requests, eight returned frames each. Only the last frame in the fixed left cell is the acceptance candidate. All failures and receipts are retained. Actual charges are reported by the provider. No automatic resubmission.</p>
<p id="status">Connecting Agent mode…</p><button id="submit" disabled>Submit 8 planned paid requests</button><button id="export" disabled>Prepare retained evidence download</button><a id="download" hidden>Download retained evidence</a>
<table><thead><tr><th>Case</th><th>View</th><th>Arm</th><th>Seed</th><th>Input</th><th>Request identity</th><th>Receipt</th></tr></thead><tbody id="rows"></tbody></table><pre id="progress"></pre>
<script type="module">
import { Queue, requestIdentity } from '/src/lib/pixellab/queue.ts';
import { connectLab } from '/src/ui/motion-lab/run.ts';
import * as db from '/src/lib/store/db.ts';
import { bytesToBase64 } from '/src/lib/image/png.ts';
const plan = await (await fetch('./plan.json', {cache:'no-store'})).json();
const tag = 'post-handoff-endpoint-pilot';
const queue = new Queue({recordTag:tag,channel:tag,lockName:tag});
const claimsKey = tag + '-claims';
const claims = () => JSON.parse(localStorage.getItem(claimsKey) ?? '{}');
const prepared = await Promise.all(plan.trials.map(async t => ({...t,identity:await requestIdentity(t.request)})));
const status = document.querySelector('#status'), submit = document.querySelector('#submit'), exportButton = document.querySelector('#export');
function render() {
  const saved = claims(), snapshot = queue.snapshot();
  const rows = document.querySelector('#rows'); rows.replaceChildren();
  for (const t of prepared) {
    const record = snapshot.jobs.find(j => j.requestHash === t.identity.requestHash);
    const row = document.createElement('tr');
    for (const value of [t.caseId,t.direction,t.arm,t.seed,t.cell.w*2+'×'+t.cell.h,t.identity.requestHash,record ? record.state+' · '+record.id : saved[t.identity.requestHash] ? 'Claimed; inspect saved receipt' : 'Unclaimed']) {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    }
    rows.append(row);
  }
  document.querySelector('#progress').textContent = JSON.stringify({counts:snapshot.counts,usd:snapshot.sessionUsd,subscriptionGenerations:snapshot.sessionGens,receipts:snapshot.jobs.map(j=>({id:j.id,state:j.state,results:j.jobs.flatMap(s=>s.results).length,usd:j.usd,generations:j.gens,error:j.error}))},null,2);
}
queue.subscribe(render);
try {
  const balance = await connectLab(queue);
  if (!balance) throw new Error('Agent access is unavailable. No request was sent.');
  const blocked = prepared.map(t => queue.planBlocks(t.request,1)).find(Boolean);
  if (blocked) throw new Error(blocked);
  status.textContent = 'Agent connected. Review all fixed request identities before the paid click.';
  submit.disabled = false; exportButton.disabled = false;
} catch (error) { status.textContent = error.message; }
submit.onclick = async () => {
  submit.disabled = true;
  try {
    await navigator.locks.request(tag+'-claims', async () => {
      for (const t of prepared) {
        const saved = claims();
        if (saved[t.identity.requestHash]) continue;
        const existing = (await db.all('jobs')).find(j=>j.requestHash===t.identity.requestHash);
        if (existing) { saved[t.identity.requestHash]={jobId:existing.id};localStorage.setItem(claimsKey,JSON.stringify(saved));continue; }
        saved[t.identity.requestHash]={claimedAt:new Date().toISOString()};
        localStorage.setItem(claimsKey,JSON.stringify(saved));
        const job = await queue.enqueue(t.request,{label:'Endpoint pilot '+t.id,tag,activityScope:tag,playerRequested:true,minimumTier:1});
        saved[t.identity.requestHash].jobId=job.id;localStorage.setItem(claimsKey,JSON.stringify(saved));
      }
    });
    status.textContent='Planned requests claimed and queued. Reloading will retain claims and never resubmit unknown outcomes.';
  } catch(error) { status.textContent=error.message+' Claims remain retained; no automatic resubmission.'; }
  render();
};
exportButton.onclick=async()=>{
  exportButton.disabled=true;
  try {
    const jobs=queue.snapshot().jobs;
    const evidence={plan,claims:claims(),exportedAt:new Date().toISOString(),jobs:await Promise.all(jobs.map(async job=>({job,images:await Promise.all(job.jobs.flatMap(s=>s.results).map(async result=>{
      const blob=await db.getBlob(result.sha);if(!blob)throw new Error('Missing retained output '+result.sha);
      return {sha:result.sha,png:bytesToBase64(new Uint8Array(await blob.arrayBuffer()))};
    }))})))};
    const link=document.querySelector('#download');if(link.dataset.url)URL.revokeObjectURL(link.dataset.url);
    link.href=URL.createObjectURL(new Blob([JSON.stringify(evidence)],{type:'application/json'}));link.dataset.url=link.href;link.download='endpoint-dressing-evidence.json';link.hidden=false;
    status.textContent='Evidence prepared. Download before evaluating; all raw frames and receipts are retained.';
  }catch(error){status.textContent=error.message;}finally{exportButton.disabled=false;}
};
render();
</script></html>`);
console.log(`Prepared ${trials.length} public requests; no paid call submitted. Output: app/test-results-post-handoff-live/`);
