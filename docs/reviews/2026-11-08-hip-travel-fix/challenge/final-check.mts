import{readFileSync,writeFileSync}from'node:fs';import{fileURLToPath,pathToFileURL}from'node:url';import{createHash}from'node:crypto';import assert from'node:assert/strict';
import{before,rest}from'./probe.mts';import{run,hit}from'./false-clear-qa.mts';
const here=fileURLToPath(new URL('./',import.meta.url)),root=fileURLToPath(new URL('../../../../',import.meta.url)),fixedRoot=here+'../temp.local/fixed/',meta=JSON.parse(readFileSync(here+'../fixed-snapshot.json','utf8'));
for(const[path,expected]of Object.entries(meta.files)){assert.equal(createHash('sha256').update(readFileSync(fixedRoot+path)).digest('hex'),expected);}
const mod=await import(pathToFileURL(fixedRoot+'app/src/lib/items/items.ts').href),summaries=await import(pathToFileURL(fixedRoot+'app/src/lib/items/qa-summary.ts').href),model=await import(pathToFileURL(fixedRoot+'app/src/studio/model.ts').href);
const classifier=(s:string)=>s.slice(s.indexOf('export function decisiveAction('),s.indexOf('export const GATES',s.indexOf('export function decisiveAction(')));
assert.equal(classifier(readFileSync(here+'temp.local/before/app/src/lib/items/items.ts','utf8')),classifier(readFileSync(fixedRoot+'app/src/lib/items/items.ts','utf8')));
const residual=JSON.parse(readFileSync(root+'docs/reviews/2026-11-08-d4c0c633-counter-review/gates/travel-results.json','utf8')).hits;
const rows:any[]=[];const compact=(r:any)=>({action:r.action,status:r.status,failures:r.failures,warnings:r.warnings,softCalls:r.softCalls,motionReviewClips:r.qa.motionReviewClips??0});
const fixtures=[...residual.map((x:any,i:number)=>({source:{frame:x.requested,measured:x.measured},label:`original-${i}`})),{source:hit,label:'false-clear'}];
for(const{source,label}of fixtures)for(const id of['run','dodge'])for(const bad of[false,true])for(const flip of[false,true]){
 const a=run(before,bad,flip,source,id),b=run(mod,bad,flip,source,id);assert.equal(a.action,b.action);assert.deepEqual(a.failures,b.failures);assert.deepEqual(a.softCalls,b.softCalls);
 if(id==='run'&&bad&&flip){assert.equal(a.status,'pass');assert.equal(b.status,'warn');assert.equal(b.qa.motionReviewClips,1);assert.equal(b.warnings.filter((x:string)=>x.startsWith('G16 ')).length,1);}
 if(id==='dodge'||!flip)assert.equal(a.status,b.status);
 rows.push({label,id,bad,flip,before:compact(a),fixed:compact(b)});
}
const legitimate=JSON.parse(readFileSync(here+'results.json','utf8')).newFalseNegatives[0],good={frame:legitimate.frame,measured:legitimate.frame};
const attackFollow=run(mod,false,false,good,'run'),attackWorld=run(mod,false,false,good,'run',Math.PI/2);
assert.equal(attackFollow.action,true);assert.equal(attackFollow.status,'pass');assert.equal(attackWorld.status,'warn');assert.equal(attackWorld.failures.length,0);assert.equal(attackWorld.qa.motionReviewClips,1);
const dirty=run(mod,true,true,hit,'run'),dirty2=run(mod,true,true,hit,'jog'),clean=run(mod,true,false,hit,'run'),clean2=run(mod,true,false,hit,'jog');
const accepted=summaries.acceptQa(dirty.qa);assert.equal(accepted.status,'accepted');assert.equal(accepted.motionReviewClips,1);assert(model.qaReasons(accepted,true,true,dirty.rig).includes("Check the item's size and angle as it moves"));
const two=summaries.mergeQa({qa:accepted,layers:[]}as any,dirty2.qa,dirty2.qa.cells);assert.equal(two.motionReviewClips,2);
const one=summaries.mergeQa({qa:summaries.acceptQa(two),layers:[]}as any,clean.qa,clean.qa.cells);assert.equal(one.motionReviewClips,1);assert.equal(one.clips['run/south'].motionReviewClips,undefined);assert.equal(one.clips['jog/south'].motionReviewClips,1);
const none=summaries.mergeQa({qa:one,layers:[]}as any,clean2.qa,clean2.qa.cells);assert.equal(none.motionReviewClips,undefined);assert.equal(none.status,'pass');
const restored=JSON.parse(JSON.stringify(accepted));assert.equal(restored.motionReviewClips,1);assert(model.qaReasons(restored,true,true,dirty.rig).includes("Check the item's size and angle as it moves"));
const result={hashes:meta.files,classifierUnchanged:true,rows,validAction:{following:compact(attackFollow),worldFixed:compact(attackWorld)},summaryControls:{accepted:accepted.motionReviewClips,two:two.motionReviewClips,one:one.motionReviewClips,none:none.motionReviewClips??0,reasons:model.qaReasons(restored,true,true,dirty.rig)},qualification:'Direct actual itemQa and summary/presentation helpers, JSON roundtrip only; not a live browser Keep/reload/recolor/export run.'};
writeFileSync(here+'final-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({rows:rows.length,classifierUnchanged:true,validAction:result.validAction,summaryControls:result.summaryControls}));
