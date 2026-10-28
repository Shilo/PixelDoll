// Offline evidence inspection. Usage from spikes/api: node animation-research-2026-10-27/analyze.mts [export.json]
import fs from 'node:fs';
import path from 'node:path';
import { encodePngBytes, decodePngBytes } from '../../../app/src/lib/image/pngraw.ts';
import { bodyComponents, paletteFit, borderPx } from '../../../app/src/lib/rig/clips.ts';
import { jobImages } from '../../../app/src/lib/pixellab/routes.ts';
import { trackPatch } from '../../../app/src/lib/rig/skeleton.ts';
type Img = { w:number; h:number; data:Uint8ClampedArray };
const out=path.resolve(import.meta.dirname,'../out/animation-research-2026-10-27');
const file=process.argv[2]??path.join(out,'evidence.json');
const evidence=JSON.parse(fs.readFileSync(file,'utf8'));
const inputs=JSON.parse(fs.readFileSync(path.join(out,'inputs.json'),'utf8'));
const decode=async(b64:string)=>decodePngBytes(new Uint8Array(Buffer.from(b64.replace(/^data:[^,]+,/,''),'base64')));
const save=async(name:string,im:Img)=>fs.writeFileSync(path.join(out,name),await encodePngBytes(im));
const area=(im:Img)=>{let n=0;for(let i=3;i<im.data.length;i+=4)if(im.data[i])n++;return n;};
const changed=(a:Img,b:Img)=>{let n=0;for(let i=0;i<a.data.length;i+=4)if((a.data[i+3]||b.data[i+3])&&(a.data[i]!==b.data[i]||a.data[i+1]!==b.data[i+1]||a.data[i+2]!==b.data[i+2]||a.data[i+3]!==b.data[i+3]))n++;return n;};
const edges=[['NOSE','NECK'],['NECK','RIGHT SHOULDER'],['RIGHT SHOULDER','RIGHT ELBOW'],['RIGHT ELBOW','RIGHT ARM'],['NECK','LEFT SHOULDER'],['LEFT SHOULDER','LEFT ELBOW'],['LEFT ELBOW','LEFT ARM'],['NECK','RIGHT HIP'],['RIGHT HIP','RIGHT KNEE'],['RIGHT KNEE','RIGHT LEG'],['NECK','LEFT HIP'],['LEFT HIP','LEFT KNEE'],['LEFT KNEE','LEFT LEG']];
function sheet(images:Img[],poses?:any[][]):Img{
  const scale=3,w=images[0].w*scale,h=images[0].h*scale,width=w*images.length;
  const data=new Uint8ClampedArray(width*h*4);
  for(const [i,im]of images.entries())for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const a=(Math.floor(y/scale)*im.w+Math.floor(x/scale))*4,b=(y*width+i*w+x)*4,alpha=im.data[a+3]/255;
    const bg=((Math.floor(x/12)+Math.floor(y/12))%2)*5+34;
    for(let k=0;k<3;k++)data[b+k]=Math.round(im.data[a+k]*alpha+bg*(1-alpha));data[b+3]=255;
  }
  const dot=(x:number,y:number,c:number[])=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=width||y>=h)return;const p=(y*width+x)*4;data.set([...c,255],p);};
  poses?.forEach((pose,i)=>{
    const kp=Object.fromEntries(pose.map(k=>[k.label,k]));
    for(const [a,b]of edges){const p=kp[a],q=kp[b],n=Math.ceil(Math.hypot(p.x-q.x,p.y-q.y)*Math.max(w,h));
      const c=(a+b).includes('RIGHT')?[255,80,80]:(a+b).includes('LEFT')?[60,180,255]:[255,240,100];
      for(let t=0;t<=n;t++)dot(i*w+(p.x+(q.x-p.x)*t/Math.max(1,n))*w,(p.y+(q.y-p.y)*t/Math.max(1,n))*h,c);
    }
  });return{w:width,h,data};
}
const reports:any[]=[];
for(const [id,row]of Object.entries<any>(evidence.cases)){
  if(row.result?.status!=='completed')continue;
  const ims:Img[]=[];
  for(const ji of jobImages(row.result.last_response)){
    if(ji.b64)ims.push(await decode(ji.b64));
    else if(ji.rgba)ims.push({w:ji.rgba.w,h:ji.rgba.h,data:new Uint8ClampedArray(Buffer.from(ji.rgba.b64,'base64'))});
    else throw Error('URL-only output needs explicit retrieval before analysis: '+id);
  }
  if(!ims.length)throw Error('Completed result has no images: '+id);
  const reference=await decode(row.body.first_frame.base64);
  for(const [i,im]of ims.entries())await save(`${id}.${i}.png`,im);
  await save(`${id}.strip.png`,sheet(ims));
  await save(`${id}.reference.png`,sheet([reference],row.body.first_frame_keypoints?[row.body.first_frame_keypoints]:undefined));
  if(row.body.keypoints)await save(`${id}.overlay.png`,sheet(ims,row.body.keypoints));
  const counts=ims.map(area),diffs=ims.slice(1).map((im,i)=>changed(im,ims[i]));
  const registration=id.startsWith('hold_')?trackPatch(reference,ims[0],[Math.floor(reference.w/2),Math.floor(reference.h/2)],Math.floor(Math.max(reference.w,reference.h)/2),[0,0],8):undefined;
  reports.push({id,frames:ims.length,size:[reference.w,reference.h],usage:row.result.usage,
    referenceArea:area(reference),areas:counts,areaMin:Math.min(...counts),areaMax:Math.max(...counts),
    paletteFit:paletteFit(reference,ims),adjacentChangedPixels:diffs,referenceChangedPixels:ims.map(im=>changed(im,reference)),
    referenceRegistration:registration,identicalAdjacentFrames:diffs.filter(n=>n===0).length,detachedPixels:ims.map(im=>bodyComponents(im).detachedPixels),
    borderPixels:ims.map(borderPx)});
}
const allUsage=Object.values<any>(evidence.cases).map(r=>r.result?.usage?.generations).filter(n=>typeof n==='number');
const summary={cases:reports.length,reserved:Object.values<any>(evidence.cases).reduce((n,c)=>n+c.estimate,0),reportedGenerations:allUsage.reduce((a,b)=>a+b,0),balances:evidence.balances,reports};
fs.writeFileSync(path.join(out,'analysis.json'),JSON.stringify(summary,null,2));
const esc=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const gallery=['<!doctype html><html lang="en"><meta charset="utf-8"><title>Animation diagnosis evidence</title><style>body{background:#191b20;color:#eee;font:16px system-ui;margin:24px}img,canvas{image-rendering:pixelated;background:#292b30}article{border-top:1px solid #777;margin:25px 0;padding:16px 0}.scroll{overflow:auto}p{max-width:1000px}button{padding:8px}canvas{width:240px;height:240px}</style><h1>PixelDoll animation diagnosis evidence</h1><p>Research date: October 27, 2026. Raw frames are retained. Overlays show requested joints, not re-estimated output. Frame change counts are diagnostics, not naturalness scores. All motion previews use the recorded case durations when available.</p>'];
gallery.push(`<p><strong>${reports.length} completed cases, ${reports.reduce((n,r)=>n+r.frames,0)} returned frames, ${summary.reportedGenerations} provider-reported generations.</strong> Open the matching case below to inspect its reference, playback, raw strip and requested joints.</p>`);
for(const r of reports){
  const row=evidence.cases[r.id];const durations=row.durations??(inputs.cases.find((c:any)=>c.id===r.id)?.durations)??120;
  const srcs=Array.from({length:r.frames},(_,i)=>`${r.id}.${i}.png`);
  gallery.push(`<article id="${esc(r.id)}"><h2>${esc(r.id)}</h2><p>${r.frames} frames; area ${r.areaMin}-${r.areaMax} px; detached ${r.detachedPixels.join(', ')}; adjacent changed ${r.adjacentChangedPixels.join(', ')}.</p><img src="${r.id}.reference.png" alt="Reference with input joints"><canvas width="${r.size[0]}" height="${r.size[1]}" data-frames='${JSON.stringify(srcs)}' data-durations='${JSON.stringify(durations)}'></canvas><div class="scroll"><img src="${r.id}.strip.png" alt="Raw frames"></div>${row.body.keypoints?`<details><summary>Requested joints over raw output</summary><div class="scroll"><img src="${r.id}.overlay.png" alt="Requested joints over output"></div></details>`:''}</article>`);
}
gallery.push('<h1>Historical round 8 evidence, generated October 26</h1><p>Reopened stored frames. These are previous paid results, not newly billed tests.</p>');
for(const dir of ['south','east'])for(const [move,arm,ms]of [['walk','M1',110],['walk2','M2',110],['slash2','M2',[70,70,80,120,50,50,60,140,100,90,90,90]],['die2s','M2',[100,100,100,90,80,80,100,140,400]]] as const){
  const c=inputs.cases.find((c:any)=>c.id===`${move}_${dir}_depth`);
  const count=c.body.keypoints.length,ims:Img[]=[];
  for(let i=0;i<count;i++)ims.push(await decodePngBytes(new Uint8Array(fs.readFileSync(path.resolve(out,`../x27/${arm}/body_${move}_${dir}.${i}.png`)))));
  const id=`historical_${move}_${dir}`;
  await save(`${id}.strip.png`,sheet(ims));await save(`${id}.overlay.png`,sheet(ims,c.body.keypoints));
  for(const[i,im]of ims.entries())await save(`${id}.${i}.png`,im);
  const srcs=ims.map((_,i)=>`${id}.${i}.png`);
  gallery.push(`<article><h2>${id}</h2><canvas width="${ims[0].w}" height="${ims[0].h}" data-frames='${JSON.stringify(srcs)}' data-durations='${JSON.stringify(ms)}'></canvas><div class="scroll"><img src="${id}.strip.png" alt="Historical raw frames"></div><details><summary>Requested joints over historical frames</summary><div class="scroll"><img src="${id}.overlay.png" alt="Requested joints over historical output"></div></details></article>`);
}
gallery.push(`<script>document.querySelectorAll('canvas').forEach(async c=>{const images=await Promise.all(JSON.parse(c.dataset.frames).map(src=>new Promise((resolve,reject)=>{const i=new Image;i.onload=()=>resolve(i);i.onerror=reject;i.src=src})));const ds=JSON.parse(c.dataset.durations);let n=0;const tick=()=>{const i=n++%images.length;c.getContext('2d').clearRect(0,0,c.width,c.height);c.getContext('2d').drawImage(images[i],0,0);setTimeout(tick,Array.isArray(ds)?ds[i]:ds)};tick()})</script></html>`);
fs.writeFileSync(path.join(out,'index.html'),gallery.join('\n'));
console.log(JSON.stringify({cases:reports.length,reserved:summary.reserved,reportedGenerations:summary.reportedGenerations,reports},null,2));
