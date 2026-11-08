import{mkdirSync,readFileSync,writeFileSync}from'node:fs';import{execFileSync}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';import{createHash}from'node:crypto';import assert from'node:assert/strict';
const here=fileURLToPath(new URL('./',import.meta.url)),root=fileURLToPath(new URL('../../../../',import.meta.url)),tmp=here+'temp.local/';
const pin='c1024a0c';
for(const dir of['before','candidate']){mkdirSync(tmp+dir,{recursive:true});execFileSync('git',['archive','--format=tar','--output',tmp+dir+'.tar',pin,'app/src','app/package.json'],{cwd:root});execFileSync('tar',['-xf',tmp+dir+'.tar','-C',tmp+dir]);}
const src=readFileSync(tmp+'candidate/app/src/lib/items/items.ts','utf8');
const old=`    const from = (l: string, q: string) => Math.hypot(p[l].x - dx - rest[q].x, p[l].y - dy - rest[q].y);
    const moved = Math.max(0, ...Object.keys(rest).filter(plausible).map((l) => Math.min(from(l, l), rest[mirror(l)] ? from(l, mirror(l)) : Infinity))) / H;
    const rise = Math.max(-1, ...['RIGHT ARM', 'LEFT ARM'].filter(plausible).map((l) => (rest[l].y - (p[l].y - dy)) / H));`;
const next=`    const translations = [[dx, dy], ...['RIGHT HIP', 'LEFT HIP'].map(l => [p[l].x - rest[l].x, p[l].y - rest[l].y])];
    const moved = Math.max(0, ...Object.keys(rest).filter(plausible).map(l => Math.min(...translations.map(([tx,ty]) => Math.min(Math.hypot(p[l].x-tx-rest[l].x,p[l].y-ty-rest[l].y),rest[mirror(l)]?Math.hypot(p[l].x-tx-rest[mirror(l)].x,p[l].y-ty-rest[mirror(l)].y):Infinity))))) / H;
    const rise = Math.max(-1, ...['RIGHT ARM', 'LEFT ARM'].filter(plausible).map(l => Math.min(...translations.map(([,ty]) => (rest[l].y-(p[l].y-ty))/H))));`;
assert(src.includes(old));writeFileSync(tmp+'candidate/app/src/lib/items/items.ts',src.replace(old,next));
const before=await import(pathToFileURL(tmp+'before/app/src/lib/items/items.ts').href),candidate=await import(pathToFileURL(tmp+'candidate/app/src/lib/items/items.ts').href),{LABELS,hasAll}=await import(pathToFileURL(tmp+'before/app/src/lib/rig/poses.ts').href);
const px:Record<string,[number,number]>={NOSE:[32,10],NECK:[32,20],'RIGHT SHOULDER':[24,22],'LEFT SHOULDER':[40,22],'RIGHT ELBOW':[20,27],'LEFT ELBOW':[44,27],'RIGHT ARM':[20,35],'LEFT ARM':[44,35],'RIGHT HIP':[28,40],'LEFT HIP':[36,40],'RIGHT KNEE':[28,50],'LEFT KNEE':[36,50],'RIGHT LEG':[28,60],'LEFT LEG':[36,60],'RIGHT EYE':[30,9],'LEFT EYE':[34,9],'RIGHT EAR':[28,10],'LEFT EAR':[36,10]};
const rest=LABELS.map((label:string)=>({label,x:px[label][0]/64,y:px[label][1]/64}));
const rig=(frame:any[])=>({cell:{w:64,h:64},rest:{south:{keypoints:rest}},animations:[{id:'run-slash',sources:{south:{keypoints:[rest,frame,rest],measured:[rest,frame,rest]}}}]} as any);
const lookup=(p:any[])=>Object.fromEntries(p.map(q=>[q.label,q]));
const angle=(p:any[],pivot:string,labels:string[],deg:number)=>{const q=lookup(p),t=deg*Math.PI/180,c=Math.cos(t),s=Math.sin(t);return p.map(x=>{if(!labels.includes(x.label))return{...x};const dx=x.x-q[pivot].x,dy=x.y-q[pivot].y;return{...x,x:q[pivot].x+dx*c-dy*s,y:q[pivot].y+dx*s+dy*c};});};
const pelvis=(p:any[],deg:number)=>{const t=deg*Math.PI/180,c=Math.cos(t),s=Math.sin(t);return p.map(x=>{if(!/HIP|KNEE|LEG/.test(x.label))return{...x};const h=rest.find((q:any)=>q.label===(x.label.startsWith('RIGHT')?'RIGHT HIP':'LEFT HIP'))!,dx=h.x-.5,dy=h.y-.625;return{...x,x:x.x+.5+dx*c-dy*s-h.x,y:x.y+.625+dx*s+dy*c-h.y};});};
const oldTravel=JSON.parse(readFileSync(root+'docs/reviews/2026-11-08-d4c0c633-counter-review/gates/travel-results.json','utf8'));
const residual=oldTravel.hits.map((h:any)=>({before:before.decisiveAction(rig(h.measured),'run-slash','south'),candidate:candidate.decisiveAction(rig(h.measured),'run-slash','south')}));
const failures:any[]=[];
// Arm rotations preserve upper/forearm lengths. Pelvic tilt rigidly translates each complete leg chain.
for(let shoulder=-180;shoulder<=180;shoulder+=2)for(let elbow=-180;elbow<=180;elbow+=2){
 let p=angle(rest,'RIGHT SHOULDER',['RIGHT ELBOW','RIGHT ARM'],shoulder);p=angle(p,'RIGHT ELBOW',['RIGHT ARM'],elbow);
 for(const tilt of[-40,-30,-20,20,30,40]){const frame=pelvis(p,tilt);if(!hasAll(frame))continue;const r=rig(frame),a=before.decisiveAction(r,'run-slash','south'),b=candidate.decisiveAction(r,'run-slash','south');if(a&&!b){failures.push({shoulder,elbow,tilt,frame});if(failures.length>=4)break;}}
 if(failures.length>=4)break;
}
const result={pin,beforeSourceHash:createHash('sha256').update(src).digest('hex'),candidateSourceHash:createHash('sha256').update(readFileSync(tmp+'candidate/app/src/lib/items/items.ts')).digest('hex'),residual,newFalseNegatives:failures};writeFileSync(here+'results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({residual,newFalseNegatives:failures.map(({frame,...r})=>r)}));
export{before,candidate,rest,rig,angle,pelvis};
