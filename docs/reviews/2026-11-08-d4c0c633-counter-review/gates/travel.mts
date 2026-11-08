import{writeFileSync}from'node:fs';import{fileURLToPath}from'node:url';import assert from'node:assert/strict';
import{run,pose,rest,modules}from'./probe.mts';
const here=fileURLToPath(new URL('./',import.meta.url));
const hits:any[]=[];let tried=0;
outer:for(const lean of[20,25,30,35])for(const swing of[60,-60]){
 const frame=pose(lean,swing);const rig=(measured:any[])=>({cell:{w:64,h:64},rest:{south:{keypoints:rest}},animations:[{id:'run',sources:{south:{keypoints:[rest,frame,rest],measured:[rest,measured,rest]}}}]});
 if(Object.values(modules).some((m:any)=>m.decisiveAction(rig(frame),'run','south')))continue;
 for(const label of['RIGHT HIP','LEFT HIP'])for(let x=.025;x<1;x+=.025)for(let y=.025;y<1;y+=.025){
  tried++;const measured=frame.map(p=>p.label===label?{...p,x,y}:p),r=rig(measured),verdict=Object.fromEntries(Object.entries(modules).map(([k,m])=>[k,(m as any).decisiveAction(r,'run','south')]));
  if(Object.values(verdict).every(Boolean)){const hip={label,x,y};const cases=Object.fromEntries(Object.entries(modules).map(([k,m])=>[k,{clean:run(m,'run','south',lean,swing,hip,'clean'),flip:run(m,'run','south',lean,swing,hip,'flip'),correctMetadataFlip:run(m,'run','south',lean,swing,false,'flip')}]));hits.push({lean,swing,hip,requested:frame,measured,verdict,cases});if(hits.length>=3)break outer;}
 }
}
assert(hits.length>0,'Find the declared travel/rise ambiguity with a concrete item control');
for(const h of hits)for(const c of Object.values(h.cases)as any[]){assert.equal(c.clean.status,'pass');assert.equal(c.flip.status,'pass');assert(c.correctMetadataFlip.failures.some((f:string)=>f.startsWith('G9 ')));}
writeFileSync(here+'travel-results.json',JSON.stringify({before:'3eed2a9c',after:'d4c0c633',ancestor:'50eeea36',tried,hits},null,2)+'\n');console.log(JSON.stringify({tried,hits:hits.map(h=>({lean:h.lean,swing:h.swing,hip:h.hip,verdict:h.verdict}))}));
