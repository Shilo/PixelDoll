// Analyze a credential-free Motion Lab evidence export. No PixelLab calls.
import fs from 'node:fs';
import path from 'node:path';
import { decodePngBytes,encodePngBytes } from '../../../app/src/lib/image/pngraw.ts';
import type { Img } from '../../../app/src/lib/image/png.ts';
import { bodyComponents,borderPx,paletteFit } from '../../../app/src/lib/rig/clips.ts';
import { contactSheet } from '../../../app/src/lib/items/items.ts';
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/motion-lab-2026-10-28');
const evidence=JSON.parse(fs.readFileSync(process.argv[2]??path.join(out,'evidence.json'),'utf8'));
const decode=(png:string)=>decodePngBytes(new Uint8Array(Buffer.from(png,'base64'))),reports=[];
const esc=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const gallery=['<!doctype html><meta charset="utf-8"><title>Corrected motion evidence</title><h1>Corrected motion evidence</h1><p>Raw outputs, authored timing. Pixel counts are diagnostics, not naturalness scores. Terminal buffers remain visible in strips but are excluded from playback.</p>'];
for(const [caseIndex,row]of evidence.records.entries()){
  if(row.job?.state!=='done'||row.context)continue;
  const images:Img[]=await Promise.all(row.images.map((im:{png:string})=>decode(im.png))),reference=await decode(row.inputs[0].png),cell=images[0];
  const id=`case-${caseIndex}-${row.document.fixture.id}-${row.document.clip.id}-${row.document.direction}`;
  const panels=[reference,...images],sheet=contactSheet(Array.from({length:Math.ceil(panels.length/6)},(_,i)=>panels.slice(i*6,i*6+6)),1,0);
  fs.writeFileSync(path.join(out,`${id}.png`),await encodePngBytes(sheet));
  for(const [i,image]of images.entries())fs.writeFileSync(path.join(out,`${id}.${i}.png`),await encodePngBytes(image));
  const report={id,jobId:row.job.id,label:row.label,fixture:row.document.fixture.id,clip:row.document.clip.id,direction:row.document.direction,seed:row.seed,revision:row.document.revision??'initial',gens:row.job.gens,frames:images.length,review:row.review??null,borderPixels:images.map(borderPx),detachedPixels:images.map(im=>bodyComponents(im).detachedPixels),paletteFit:paletteFit(reference,images),size:[cell.w,cell.h]};reports.push(report);
  Object.assign(report,{bufferExcluded:row.document.buffer,playbackBorderPixels:report.borderPixels.slice(0,row.document.buffer?-1:undefined),playbackDetachedPixels:report.detachedPixels.slice(0,row.document.buffer?-1:undefined)});
  const played=images.slice(0,row.document.buffer?-1:undefined).map((_,i)=>`${id}.${i}.png`);
  gallery.push(`<article id="${id}"><h2>${esc(row.label)}</h2><p>${report.gens} gens; border: ${report.borderPixels.join(', ')}; detached: ${report.detachedPixels.join(', ')}. First sheet cell is the reference.</p><canvas width="${cell.w}" height="${cell.h}" data-images='${JSON.stringify(played)}' data-durations='${JSON.stringify(row.document.durations)}'></canvas><p><img src="${id}.png" width="${sheet.w*2}" alt="Reference followed by raw generated frames"></p></article>`);
}
gallery.push(`<style>body{font:16px system-ui;margin:24px;background:#181a20;color:#eee}img,canvas{image-rendering:pixelated;background:#292c32}canvas{width:240px}article{border-top:1px solid #777;padding-top:16px}img{max-width:100%}</style><script>document.querySelectorAll('canvas').forEach(async c=>{const images=await Promise.all(JSON.parse(c.dataset.images).map(src=>new Promise((resolve,reject)=>{const i=new Image;i.onload=()=>resolve(i);i.onerror=reject;i.src=src}))),ds=JSON.parse(c.dataset.durations);let n=0;function tick(){const f=n++%images.length;c.getContext('2d').clearRect(0,0,c.width,c.height);c.getContext('2d').drawImage(images[f],0,0);setTimeout(tick,ds[f]??120)}tick()})</script>`);
const uniqueJobs=new Map<string,{gens:number}>(evidence.records.filter((r:any)=>r.job).map((r:any)=>[r.job.id,r.job]));
const summary={cap:evidence.cap,reserved:evidence.reserved,providerGenerations:[...uniqueJobs.values()].reduce((n,j)=>n+j.gens,0),complete:reports.length,uniqueJobs:uniqueJobs.size,records:reports};
fs.writeFileSync(path.join(out,'render-analysis.json'),JSON.stringify(summary,null,2));fs.writeFileSync(path.join(out,'index.html'),gallery.join('\n'));console.log(JSON.stringify({reserved:summary.reserved,providerGenerations:summary.providerGenerations,complete:summary.complete}));
