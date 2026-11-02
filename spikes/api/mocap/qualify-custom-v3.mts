// Offline only: inspect downloaded custom V3 frames and compare the frozen reference.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {contactSheet} from '../../../app/src/lib/items/items.ts';
import {bodyComponents,borderPx} from '../../../app/src/lib/rig/clips.ts';
import type {Img} from '../../../app/src/lib/image/png.ts';
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/motion-custom-v3-2026-11-01');
const read=async(file:string)=>decodePngBytes(fs.readFileSync(file));
function bounds(im:Img){const pixels=[];for(let y=0;y<im.h;y++)for(let x=0;x<im.w;x++)if(im.data[(y*im.w+x)*4+3])pixels.push([x,y]);if(!pixels.length)throw new Error('Empty image');const x=Math.min(...pixels.map(p=>p[0])),y=Math.min(...pixels.map(p=>p[1])),w=Math.max(...pixels.map(p=>p[0]))-x+1,h=Math.max(...pixels.map(p=>p[1]))-y+1;const rgba=new Uint8Array(w*h*4);for(let j=0;j<h;j++)for(let i=0;i<w;i++){const k=((y+j)*im.w+x+i)*4;if(im.data[k+3])rgba.set(im.data.subarray(k,k+4),(j*w+i)*4);}return{x,y,w,h,opaque:pixels.length,trimmedSha256:createHash('sha256').update(rgba).digest('hex')};}
const reference=await read(path.join(out,'reference-south.png')),baseline=await read(path.join(out,'baseline-reference-south.png'));
const a=bounds(reference),b=bounds(baseline),report:{reference:unknown;directions:unknown[]}={reference:{managed:{cell:[reference.w,reference.h],...a},baseline:{cell:[baseline.w,baseline.h],...b},sameOpaquePixelsAfterTranslation:a.w===b.w&&a.h===b.h&&a.trimmedSha256===b.trimmedSha256,note:'If false, this is a related-character workflow comparison, not a controlled pixel-identical A/B.'},directions:[]};
const oldEvidence=JSON.parse(fs.readFileSync(path.join(root,'spikes/api/out/motion-targeted-2026-10-28/evidence.json'),'utf8'));
const previews:unknown[]=[],figures:string[]=[];
for(const direction of ['south','east']){
  const folder=process.argv[2]?path.join(process.argv[2],direction):path.join(out,'frames',direction);if(!fs.existsSync(folder))continue;
  const names=fs.readdirSync(folder).filter(f=>f.endsWith('.png')).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const images=await Promise.all(names.map(f=>read(path.join(folder,f))));if(!images.length)throw new Error('No frames in '+folder);
  const panels=contactSheet([images],1,0);fs.writeFileSync(path.join(out,`custom-${direction}.png`),await encodePngBytes(panels));
  fs.writeFileSync(path.join(out,`custom-${direction}-large.png`),await encodePngBytes(contactSheet([images.slice(0,4),images.slice(4)],4,4)));
  const old=oldEvidence.records.find((r:any)=>r.job?.id===(direction==='south'?'8cc67dad-89b1-48ef-8619-95e0835c815c':'82038950-a3ab-4e4f-ab92-da53503749d7'));
  if(!old)throw new Error('Frozen comparison candidate missing.');
  const oldFrames=await Promise.all(old.images.map((im:any)=>decodePngBytes(Buffer.from(im.png,'base64'))));
  fs.writeFileSync(path.join(out,`baseline-${direction}.png`),await encodePngBytes(contactSheet([oldFrames],1,0)));
  previews.push({name:`Stored raw conversion / ${direction}`,cell:[oldFrames[0].w,oldFrames[0].h],frames:old.images.map((im:any)=>im.png),ms:old.document.durations});
  previews.push({name:`Managed custom V3 / ${direction}`,cell:[images[0].w,images[0].h],frames:names.map(f=>fs.readFileSync(path.join(folder,f)).toString('base64')),ms:images.map(()=>150)});
  figures.push(`<h2>${direction}: new frames 1-8</h2><img width="100%" src="data:image/png;base64,${fs.readFileSync(path.join(out,`custom-${direction}-large.png`)).toString('base64')}">`);
  const bottomOutline=images.map(im=>{const box=bounds(im),bottom=box.y+box.h-1,xs:number[]=[];for(let y=bottom-1;y<=bottom;y++)for(let x=0;x<im.w;x++)if(im.data[(y*im.w+x)*4+3])xs.push(x);return{left:Math.min(...xs),right:Math.max(...xs),bottom};});
  const outlineRanges=Object.fromEntries((['left','right','bottom'] as const).map(k=>[k,Math.max(...bottomOutline.map(p=>p[k]))-Math.min(...bottomOutline.map(p=>p[k]))]));
  report.directions.push({direction,frames:names.map((file,i)=>({file,cell:[images[i].w,images[i].h],bounds:bounds(images[i]),borderPixels:borderPx(images[i]),detachedPixels:bodyComponents(images[i]).detachedPixels})),bottomTwoRowsOutline:{samples:bottomOutline,ranges:outlineRanges,note:'Silhouette proxy only. Changes can come from foot shape or pose, not just sliding; does not certify planted soles.'},soleQualification:'Requires visible heel/toe marks, not the silhouette bottom or ankle proxy.',equippedGrip:'Untested: no weapon in reference.'});
}
fs.writeFileSync(path.join(out,'offline-analysis.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
const preview=path.join(root,'app/test-results-motion-custom-v3-review');fs.mkdirSync(preview,{recursive:true});
fs.writeFileSync(path.join(preview,'index.html'),`<!doctype html><meta charset="utf-8"><title>Custom V3 motion qualification</title><style>body{background:#18181c;color:#eee;font:16px system-ui;margin:24px}h1{font-size:24px}section{display:flex;gap:24px;flex-wrap:wrap}article{width:260px}canvas{width:240px;height:240px;background:#303038;image-rendering:pixelated}img{image-rendering:pixelated;max-width:1200px}p{max-width:1150px}</style><h1>Custom V3: completed south + east comparison</h1><p>6 generations settled. Campaign total: 998/1000. Foot offsets requested fixed on all eight frames. Research only: weapon grip and occlusion untested; reference artwork differs from the frozen baseline.</p><p>Managed playback below uses an illustrative 150 ms per frame; the downloaded metadata supplies no timing. Stored baseline uses its recorded timings. Repeating an attack here is for inspection.</p><section id="clips"></section>${figures.join('')}<script>const clips=${JSON.stringify(previews)};for(const clip of clips){const a=document.createElement('article');a.innerHTML='<h2>'+clip.name+'</h2>';const c=document.createElement('canvas');[c.width,c.height]=clip.cell;a.append(c);document.querySelector('#clips').append(a);const ctx=c.getContext('2d'),ims=clip.frames.map(p=>{const im=new Image();im.src='data:image/png;base64,'+p;return im});let i=0;function tick(){ctx.clearRect(0,0,c.width,c.height);if(ims[i].complete)ctx.drawImage(ims[i],0,0);const ms=clip.ms[i]??150;i=(i+1)%ims.length;setTimeout(tick,ms)}tick()}</script>`);
