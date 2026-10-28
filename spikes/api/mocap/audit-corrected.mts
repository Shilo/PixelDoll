// Offline audit of the actual authored defaults, including per-body cameras, timing, padding and view adaptations.
import fs from 'node:fs';
import path from 'node:path';
import { MOTION_EDGES,sub3,length3 } from '../../../app/src/lib/rig/motion.ts';
import { newDocument,buildDocument,renderPoses,type MotionLibrary } from '../../../app/src/ui/motion-lab/model.ts';
import type { DirectionName } from '../../../app/src/lib/rig/rig.ts';
const root=path.resolve(import.meta.dirname,'../../..');
const library=JSON.parse(fs.readFileSync(path.join(root,'app/dev-fixtures/motion-lab/library.json'),'utf8')) as MotionLibrary;
const results=[];
for(const fixture of library.fixtures)for(const clip of library.clips)for(const direction of Object.keys(fixture.references) as DirectionName[]){
  const document=newDocument(library,fixture,clip,direction),fit=buildDocument(document);
  renderPoses(document);
  const points=fit.frames.flatMap(f=>f.keypoints);
  results.push({fixture:fixture.id,clip:clip.id,direction,canvas:[fit.calibration.width,fit.calibration.height],options:document.options,camera:{elevation:document.elevation,azimuth:document.azimuth},issues:fit.frames.flatMap(f=>f.issues),
    maxLengthError:Math.max(...fit.frames.flatMap(f=>MOTION_EDGES.map(([a,b])=>Math.abs(length3(sub3(f.points[b],f.points[a]))-length3(sub3(fit.reference[b],fit.reference[a])))))),
    minX:Math.min(...points.map(k=>k.x)),maxX:Math.max(...points.map(k=>k.x)),minY:Math.min(...points.map(k=>k.y)),maxY:Math.max(...points.map(k=>k.y))});
}
const summary={cases:results.length,maxLengthError:Math.max(...results.map(r=>r.maxLengthError)),casesWithReachWarnings:results.filter(r=>r.issues.length).length};
const out=path.join(root,'spikes/api/out/motion-lab-2026-10-28');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'offline-audit.json'),JSON.stringify({summary,results},null,2));console.log(JSON.stringify(summary));
