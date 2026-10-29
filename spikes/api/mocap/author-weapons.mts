// Explicit directional weapon authoring on frozen frames. No API calls or automatic acceptance.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {makeImg,bytesToBase64} from '../../../app/src/lib/image/png.ts';
import {padImg,recompose,contactSheet} from '../../../app/src/lib/items/items.ts';
import {rigidAttachment,occludeAttachment,validateAttachment,type AttachmentDocument} from '../../../app/src/ui/motion-lab/attachment.ts';
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/motion-targeted-2026-10-28'),e=JSON.parse(fs.readFileSync(path.join(out,'evidence.json'),'utf8')),design='c3df7cc0-e236-4d71-a246-d7028f376f70';
const rows=[],sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
// Pixel measurements from the enlarged raw strips. Hidden grips are identified separately below.
const tracks={
  south:{body:'8cc67dad-89b1-48ef-8619-95e0835c815c',grips:[[32,56],[30,47],[41,30],[41,21],[37,29],[32,40],[45,55],[65,71],[59,71],[42,61],[34,59],[32,56]],angles:[135,170,-120,-95,-75,-40,45,80,100,120,135,135],sourceGrip:[42,64],axis:[17,88],bridge:[[46,60],[38,68]],ambiguous:[7,8,9]},
  east:{body:'82038950-a3ab-4e4f-ab92-da53503749d7',grips:[[45,62],[42,57],[29,46],[33,44],[38,44],[58,47],[78,52],[80,61],[79,59],[74,56],[60,59],[46,61]],angles:[60,155,-135,-110,-70,-80,35,65,80,85,70,60],sourceGrip:[56,65],axis:[88,88],bridge:[[50,61],[62,68]],ambiguous:[5]},
  north:{body:'d6ac5a99-2236-4908-97e2-d1a2487b49b7',grips:[[75,57],[78,49],[69,39],[72,36],[77,32],[78,38],[67,47],[44,65],[41,66],[58,56],[77,56],[75,57]],angles:[45,0,-60,-85,-105,-140,135,100,80,60,45,45],sourceGrip:[67,65],axis:[95,90],bridge:[[63,61],[73,68]],ambiguous:[7,8,9]},
};
for(const [direction,t]of Object.entries(tracks)){
  const row=e.records.find((r:any)=>r.job?.id===t.body);if(!row||row.job.state!=='done')throw new Error('Frozen attack evidence is missing.');
  const raw=fs.readFileSync(path.join(out,`asset-${design}-${direction}.png`)),source=await decodePngBytes(raw),original=new Uint8ClampedArray(source.data),a=t.bridge[0],b=t.bridge[1];let restored=0;
  // Extraction removes the handle hidden by the source hand. Reconstruct that hidden shaft explicitly before rotating it.
  for(let y=0;y<source.h;y++)for(let x=0;x<source.w;x++){const dx=b[0]-a[0],dy=b[1]-a[1],u=Math.max(0,Math.min(1,((x+0.5-a[0])*dx+(y+0.5-a[1])*dy)/(dx*dx+dy*dy))),distance=Math.hypot(x+0.5-a[0]-u*dx,y+0.5-a[1]-u*dy),p=(y*source.w+x)*4;if(!original[p+3]&&distance<=1.5){source.data.set(distance<=0.65?[111,74,43,255]:[39,29,24,255],p);restored++;}}
  const completed=await encodePngBytes(source);fs.writeFileSync(path.join(out,`authored-sword-${direction}.png`),completed);
  const bodyImages=await Promise.all(row.images.map((i:any)=>decodePngBytes(Buffer.from(i.png,'base64')))),doc:AttachmentDocument={version:1,kind:'pixeldoll-authored-attachment',body:{jobId:row.job.id,hashes:row.images.map((i:any)=>i.sha),cell:{w:bodyImages[0].w,h:bodyImages[0].h},pivot:row.document.fixture.pivot,direction,padding:40},asset:{png:bytesToBase64(completed),grip:{x:t.sourceGrip[0],y:t.sourceGrip[1]},axis:{x:t.axis[0],y:t.axis[1]}},frames:[],notes:`Research authoring, unqualified. Visible grips measured from raw pixels; hidden/ambiguous grips: zero-based frames ${t.ambiguous.join(', ')}. Independent blade-angle track. Source hidden handle reconstructed manually. Body turns and perspective remain separate rejection reasons.`};
  const composites=[],before=[],layers=[],measurements=[];
  for(let i=0;i<bodyImages.length;i++){
    const body=padImg(bodyImages[i],40),grip={x:t.grips[i][0]+24,y:t.grips[i][1]+24},mask=makeImg(body.w,body.h),r=t.ambiguous.includes(i)?4:2.5;
    // Explicit authored hand-region disks, clipped by actual body alpha in the compositor. These are not inferred finger masks.
    for(let y=0;y<mask.h;y++)for(let x=0;x<mask.w;x++)if((direction==='east'&&i===5)||Math.hypot(x+0.5-grip.x,y+0.5-grip.y)<=r)mask.data.set([255,255,255,255],(y*mask.w+x)*4);
    const frame={grip,angle:t.angles[i],occluder:bytesToBase64(await encodePngBytes(mask))};doc.frames.push(frame);
    const angle=frame.angle*Math.PI/180-Math.atan2(doc.asset.axis.y-doc.asset.grip.y,doc.asset.axis.x-doc.asset.grip.x),placed=rigidAttachment(source,doc.asset.grip,grip,angle,body),occluded=occludeAttachment(placed.image,body,mask),composite=recompose({base:body,layer:occluded.image});
    composites.push(composite);before.push(recompose({base:body,layer:placed.image}));layers.push(occluded.image);measurements.push({frame:i,bodySha:row.images[i].sha,grip,angle:frame.angle,gripVisibility:t.ambiguous.includes(i)?'hidden-or-ambiguous':'visually-estimated',hiddenPixels:occluded.hidden,clippedSourcePixels:placed.clippedSourcePixels});
    for(const[name,image]of [['body',body],['layer',occluded.image],['composite',composite]] as const)fs.writeFileSync(path.join(out,`authored-${direction}-${i}-${name}.png`),await encodePngBytes(image));
  }
  validateAttachment(doc,doc.body);fs.writeFileSync(path.join(out,`authored-attachment-${direction}.json`),JSON.stringify(doc));
  fs.writeFileSync(path.join(out,`authored-attachment-${direction}.png`),await encodePngBytes(contactSheet(Array.from({length:3},(_,i)=>composites.slice(i*4,i*4+4)),3,0)));
  fs.writeFileSync(path.join(out,`authored-attachment-${direction}.before-after.png`),await encodePngBytes(contactSheet([before.slice(0,6),composites.slice(0,6)],3,0)));
  rows.push({direction,bodyId:row.job.id,designId:design,sourceRawSha:sha(raw),sourceAuthoredSha:sha(completed),restoredHandlePixels:restored,qualified:false,notes:doc.notes,frames:measurements});
}
fs.writeFileSync(path.join(out,'authored-attachment-analysis.json'),JSON.stringify({paidRequests:0,bodyPixelEdits:0,rows},null,2));console.log(JSON.stringify(rows.map(r=>({view:r.direction,restored:r.restoredHandlePixels,hidden:r.frames.reduce((n,f)=>n+f.hiddenPixels,0),clipping:r.frames.filter(f=>f.clippedSourcePixels).map(f=>({frame:f.frame,pixels:f.clippedSourcePixels}))}))));
