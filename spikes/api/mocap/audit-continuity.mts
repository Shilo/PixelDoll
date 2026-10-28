import fs from 'node:fs';
import {newDocument,buildDocument} from '../../../app/src/ui/motion-lab/model.ts';
import {retargetMotion,MOTION_EDGES,sub3,dot3,length3} from '../../../app/src/lib/rig/motion.ts';
const library=JSON.parse(fs.readFileSync(new URL('../../../app/dev-fixtures/motion-lab/library.json',import.meta.url)));
const rows=[];
for(const fixture of library.fixtures)for(const clip of library.clips)for(const direction of Object.keys(fixture.references)){
  const doc=newDocument(library,fixture,clip,direction),fit=buildDocument(doc),dense=retargetMotion(clip,fit.calibration,doc.options);
  let maximum={degrees:0,time:0,bone:''};
  for(let i=1;i<dense.frames.length;i++)for(const[a,b]of MOTION_EDGES){const u=sub3(dense.frames[i-1].points[b],dense.frames[i-1].points[a]),v=sub3(dense.frames[i].points[b],dense.frames[i].points[a]),degrees=Math.acos(Math.max(-1,Math.min(1,dot3(u,v)/length3(u)/length3(v))))*180/Math.PI;if(degrees>maximum.degrees)maximum={degrees,time:clip.samples[i].time,bone:a+' -> '+b};}
  rows.push({fixture:fixture.id,clip:clip.id,direction,...maximum});
}
rows.sort((a,b)=>b.degrees-a.degrees);
fs.writeFileSync(new URL('../out/motion-lab-2026-10-28/dense-continuity.json',import.meta.url),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows.slice(0,12),null,2));
