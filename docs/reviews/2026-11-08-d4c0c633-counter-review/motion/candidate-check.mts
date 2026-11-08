import{mkdirSync,readFileSync,writeFileSync}from'node:fs';import{execFileSync}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';import assert from'node:assert/strict';
const root=fileURLToPath(new URL('../../../../',import.meta.url)),here=fileURLToPath(new URL('./',import.meta.url)),temp=here+'temp.local/',dir=temp+'candidate/';mkdirSync(dir,{recursive:true});execFileSync('git',['archive','--format=tar','--output',temp+'candidate.tar','d4c0c633','app/src','app/package.json'],{cwd:root});execFileSync('tar',['-xf',temp+'candidate.tar','-C',dir]);
const source=readFileSync(dir+'app/src/lib/items/items.ts','utf8');
const old="const lean = !torsoOk ? 0 : Math.min(...pivots.map(([f, scale]) => Math.abs(angle(shoulders(p), f(p)) - angle(shoulders(rest), f(rest))) * scale[Math.sign(bend) || 1]), Math.abs(angle([p.NECK.x, p.NECK.y], hips) - angle([rest.NECK.x, rest.NECK.y], restHips)), Math.abs(bend));";
const replacement=`const independent = Math.min(...[['NOSE', 'NECK'], ['RIGHT SHOULDER', 'LEFT SHOULDER']].map(([a,b]) => plausible(a) && plausible(b) && len(rest,a,b) > 0 && len(p,a,b) > 0 ? angleDiff(Math.atan2(p[a].y-p[b].y,p[a].x-p[b].x),Math.atan2(rest[a].y-rest[b].y,rest[a].x-rest[b].x)) : 0));
    const pivotLean = pivots.map(([f, scale]) => Math.abs(angle(shoulders(p), f(p)) - angle(shoulders(rest), f(rest))) * scale[Math.sign(bend) || 1]);
    const lean = !torsoOk ? 0 : Math.min(pivotLean[0], Math.max(Math.min(...pivotLean.slice(1)), independent), Math.abs(angle([p.NECK.x, p.NECK.y], hips) - angle([rest.NECK.x, rest.NECK.y], restHips)), Math.abs(bend));`;
assert(source.includes(old));writeFileSync(dir+'app/src/lib/items/items.ts',source.replace(old,replacement));
const candidate=await import(pathToFileURL(dir+'app/src/lib/items/items.ts').href),after=await import(pathToFileURL(temp+'after/app/src/lib/items/items.ts').href);
const pelvis=JSON.parse(readFileSync(here+'pelvis-results.json','utf8'));
const rows=[];for(const q of pelvis.qa){const r=q.rig,anim=r.animations[0].id;rows.push({id:q.id,pelvis:q.pelvis,lean:q.lean,after:after.decisiveAction(r,anim,'south'),candidate:candidate.decisiveAction(r,anim,'south')});}
assert.equal(rows[1].candidate,true);assert.equal(rows[3].candidate,false);
const hip=JSON.parse(readFileSync(root+'docs/reviews/2026-11-07-3eed2a9c-counter-review/motion/hip-candidate-results.json','utf8'));const fixture=hip.fixture;
const hipRig={cell:{w:64,h:64},rest:{south:{keypoints:fixture.rest}},animations:[{id:'run',sources:{south:{keypoints:fixture.requested,measured:fixture.measured}}}]};assert.equal(candidate.decisiveAction(hipRig,'run','south'),false);
const stored=[];for(const body of['A','B','C','N']){const r=JSON.parse(execFileSync('git',['show',`d4c0c633:app/test/fixtures/bench/body${body}.json`],{cwd:root,encoding:'utf8'})).rig;for(const a of r.animations)for(const d of Object.keys(a.sources??{}))stored.push({body,id:a.id,dir:d,after:after.decisiveAction(r,a.id,d),candidate:candidate.decisiveAction(r,a.id,d)});}
assert(stored.every(r=>r.after===r.candidate));
writeFileSync(here+'candidate-results.json',JSON.stringify({scratchOnly:true,rows,n1Candidate:false,stored,changes:stored.filter(r=>r.after!==r.candidate)},null,2)+'\n');console.log(JSON.stringify({rows,n1Candidate:false,stored:stored.length,changes:stored.filter(r=>r.after!==r.candidate).length}));
