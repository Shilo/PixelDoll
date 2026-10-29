// Manual visible-toe annotations, independently checked against raw alpha. No API calls or pixel repair.
import fs from 'node:fs';
import path from 'node:path';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {contactSheet} from '../../../app/src/lib/items/items.ts';
import {measureSoles,validateSoles,type SoleReview} from '../../../app/src/ui/motion-lab/soles.ts';
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/motion-targeted-2026-10-28'),e=JSON.parse(fs.readFileSync(path.join(out,'evidence.json'),'utf8'));
const cases=[
  {name:'before-east-walk',id:'e4cdef7e-9fc6-4eb4-b9fa-45ec0a3d6ecc',planFrom:'8c0c23ad-7225-4761-9a5d-e094b2d8c16c',left:[[0,54,69],[1,53,69],[2,49,69],[3,46,69]],right:[[6,54,72],[7,51,73],[8,48,73],[9,45,73]]},
  {name:'authored-east-walk',id:'8c0c23ad-7225-4761-9a5d-e094b2d8c16c',left:[[0,55,68],[1,52,69],[2,49,69],[3,47,69],[4,45,69]],right:[[6,55,71],[7,51,72],[8,49,72],[9,47,72],[10,44,72]]},
  {name:'authored-east-run',id:'24b1eb69-d836-48e4-b724-1097551b8e37',left:[[1,56,70],[2,52,70]],right:[[7,57,73],[8,50,72]]},
];
const rows=[];
for(const c of cases){const row=e.records.find((r:any)=>r.job?.id===c.id),planRow=c.planFrom?e.records.find((r:any)=>r.job?.id===c.planFrom):row,d=row.document,images=await Promise.all(row.images.map((im:any)=>decodePngBytes(Buffer.from(im.png,'base64'))));
  const review:SoleReview={version:1,kind:'pixeldoll-rendered-sole-review',binding:{jobId:row.job.id,hashes:row.images.map((im:any)=>im.sha),cell:{w:images[0].w,h:images[0].h},direction:d.direction,elevation:d.elevation,azimuth:d.azimuth,times:d.times,duration:d.clip.duration,loop:d.clip.loop,plan:planRow.document.planting},frames:images.map(()=>({})),notes:'Agent visually estimated the forward toe outline from enlarged raw native pixels, then checked each marked pixel is opaque. One seed, east adult only. Frame-boundary projected stability under R_i = v * sourceTime_i; not a 3D contact or continuous runtime certification. Before uses the same proposed windows/root velocity for comparison.'};
  for(const[foot,points]of [['LEFT LEG',c.left],['RIGHT LEG',c.right]] as const)for(const[i,x,y]of points){if(!images[i].data[(y*images[i].w+x)*4+3])throw new Error(`Toe annotation is transparent: ${c.name}/${i}/${foot}`);review.frames[i][foot]={x:x+0.5,y:y+0.5,landmark:'toe'};}
  validateSoles(review,review.binding);const measurements=measureSoles(review);fs.writeFileSync(path.join(out,c.name+'-soles.json'),JSON.stringify({...review,measurements,qualified:false},null,2));
  const annotated=images.map((im,i)=>{const image={...im,data:new Uint8ClampedArray(im.data)};for(const[foot,p]of Object.entries(review.frames[i])){const x=Math.floor(p.x),y=Math.floor(p.y);for(const[dx,dy]of [[-1,0],[0,0],[1,0],[0,-1],[0,1]])image.data.set(foot==='RIGHT LEG'?[255,60,60,255]:[80,120,255,255],((y+dy)*image.w+x+dx)*4);}return image});
  fs.writeFileSync(path.join(out,c.name+'-soles.png'),await encodePngBytes(contactSheet(Array.from({length:3},(_,i)=>annotated.slice(i*4,i*4+4)),3,0)));
  rows.push({name:c.name,jobId:row.job.id,notes:review.notes,measurements});
}
fs.writeFileSync(path.join(out,'rendered-sole-analysis.json'),JSON.stringify({paidRequests:0,bodyPixelEdits:0,scope:'Manual projected toe samples on one adult east seed. Other bodies/views remain unmeasured, not implicitly passed.',rows},null,2));console.log(JSON.stringify(rows.map(r=>({case:r.name,contacts:r.measurements.map(m=>({foot:m.foot,marks:m.marked,expected:m.expected,sourceTimeSpan:m.temporalSpan,supportDuration:m.supportDuration,projectedSpan:m.worldSpan}))}))));
