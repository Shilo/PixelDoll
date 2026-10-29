// Render the current targeted campaign and paired historical controls offline. No API calls.
import fs from 'node:fs';
import path from 'node:path';
import {registerHooks} from 'node:module';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {bodyComponents,borderPx} from '../../../app/src/lib/rig/clips.ts';
import {contactSheet} from '../../../app/src/lib/items/items.ts';
import {sheet} from '../animation-research-2026-10-27/preview.mts';
const hook=registerHooks({load(url,context,next){const result=next(url,context);if(url.endsWith('/studio/shareMedia.ts'))return{...result,source:String(result.source).replace("import { GIFEncoder, quantize, applyPalette } from 'gifenc'","import gifenc from 'gifenc'; const { GIFEncoder, quantize, applyPalette } = gifenc")};return result}});
const {encodeShareMedia}=await import('../../../app/src/studio/shareMedia.ts');hook.deregister();
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/motion-targeted-2026-10-28'),evidence=JSON.parse(fs.readFileSync(path.join(out,'evidence.json'),'utf8'));
const old=JSON.parse(fs.readFileSync(path.join(root,'spikes/api/out/motion-lab-2026-10-28/evidence.json'),'utf8'));
const rows=[],gallery=[];const decode=(png:string)=>decodePngBytes(Buffer.from(png,'base64'));
for(const row of evidence.records.filter((r:any)=>r.phase==='authored-contact-v1'&&r.job?.state==='done'&&!r.context)){
  const d=row.document,id=`${d.fixture.id}-${d.clip.id}-${d.direction}-${row.seed}${d.hands?'-'+d.hands:''}`,frames=await Promise.all(row.images.map((i:any)=>decode(i.png))),played=frames.slice(0,d.buffer?-1:undefined),before=old.records.findLast((r:any)=>r.job?.state==='done'&&!r.context&&r.document.revision==='ground-support-v2'&&r.document.fixture.id===d.fixture.id&&r.document.clip.id===d.clip.id&&r.document.direction===d.direction&&r.seed===row.seed);
  fs.writeFileSync(path.join(out,id+'.png'),await encodePngBytes(contactSheet(Array.from({length:Math.ceil(frames.length/6)},(_,i)=>frames.slice(i*6,i*6+6)),2,0)));
  fs.writeFileSync(path.join(out,id+'.overlay.png'),await encodePngBytes(sheet(frames,row.job.params.keypoints,true)));
  for(let i=0;i<frames.length;i++)fs.writeFileSync(path.join(out,`${id}.${i}.png`),await encodePngBytes(frames[i]));
  fs.writeFileSync(path.join(out,id+'.gif'),await encodeShareMedia({frames:played.map((image,i)=>({image,ms:d.durations[i]})),still:played[0],animated:true,grid:false,previewRows:1,omitted:[],mime:'image/gif',extension:'gif'},2));
  if(before){const b=await Promise.all(before.images.map((i:any)=>decode(i.png)));fs.writeFileSync(path.join(out,id+'.before-after.png'),await encodePngBytes(contactSheet([b.slice(0,12),frames.slice(0,12)],2,0)));}
  rows.push({id,jobId:row.job.id,fixture:d.fixture.id,clip:d.clip.id,direction:d.direction,seed:row.seed,gens:row.job.gens,frames:frames.length,bodyHashes:row.images.map((i:any)=>i.sha),beforeJobId:before?.job.id??null,authoredContacts:!!d.planting,borderPixels:frames.map(borderPx),detachedPixels:frames.map(im=>bodyComponents(im).detachedPixels),bufferExcluded:d.buffer,qualified:false});
  gallery.push(`<article><h2>${id}</h2><img src="${id}.gif" alt="Timed raw candidate"><p><a href="${id}.png">All raw frames</a> · <a href="${id}.overlay.png">Requested joints</a>${before?` · <a href="${id}.before-after.png">Before top, after bottom</a>`:''}</p></article>`);
}
const current=evidence.records.filter((r:any)=>r.phase==='authored-contact-v1'),jobs=new Map<string,any>(current.filter((r:any)=>r.job).map((r:any)=>[r.job.id,r.job])),gens=[...jobs.values()].reduce((n,j)=>n+j.gens,0);
const report={phase:'authored-contact-v1',priorGenerations:806,phaseGenerations:gens,totalGenerations:806+gens,reservations:current.length,uniqueJobs:jobs.size,returnedImages:[...jobs.values()].reduce((n,j)=>n+j.jobs.flatMap((s:any)=>s.results).length,0),estimatedReserved:current.reduce((n:number,r:any)=>n+r.estimate,0),reserved:current.reduce((n:number,r:any)=>n+Math.max(r.estimate,r.job?.gens??0),0),states:Object.fromEntries(['done','submitting','running','queued','failed','canceled'].map(s=>[s,[...jobs.values()].filter(j=>j.state===s).length])),unresolvedReservations:current.filter((r:any)=>!r.job).length,rows};
fs.writeFileSync(path.join(out,'targeted-analysis.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(out,'review.html'),`<!doctype html><meta charset="utf-8"><title>Targeted motion qualification</title><h1>Targeted motion qualification</h1><p>Raw returned pixels, authored playback durations. Contact locks describe requested joints, not rendered soles. Research candidates remain unqualified until visual review. Fall buffers are shown in raw strips and excluded from GIFs.</p><style>body{font:16px system-ui;background:#181a20;color:#eee;margin:24px}article{display:inline-block;vertical-align:top;width:320px;padding:12px}img{image-rendering:pixelated;width:280px;background:#292c32}a{color:#9dc8ff}</style>${gallery.join('\n')}`);console.log(JSON.stringify({...report,rows:rows.map(r=>({id:r.id,border:Math.max(...r.borderPixels),detached:Math.max(...r.detachedPixels)}))}));
