import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=fileURLToPath(new URL('./',import.meta.url)),r=JSON.parse(readFileSync(here+'policy-results.json','utf8')),source=JSON.parse(readFileSync(here+'source-results.json','utf8'));
assert.equal(r.count,1080);assert.equal(r.changed,r.changes.length);assert.equal(r.candidateHash,source.candidateSourceSha256);assert(source.classifierAndNameRuleByteIdentical);
assert(r.changes.every(x=>x.id==='run'&&['residual','clear'].includes(x.motion)&&['flip','size','empty-one'].includes(x.kind)));
assert(!r.changes.some(x=>x.size===32&&x.kind==='flip'));assert(!r.changes.some(x=>x.slot==='torso_outer'&&x.kind==='flip'));
for(const row of r.summary){assert.deepEqual(row.soft,[]);if(row.id==='dodge'||row.kind==='clean'||row.motion==='rest'||row.kind==='empty-all')assert.equal(row.before,row.after);}
for(const motion of['residual','clear'])for(const kind of['flip','size']){
 const row=r.summary.find(x=>x.id==='run'&&x.motion===motion&&x.kind===kind);assert.equal(row.before,'pass');assert.equal(row.after,'warn');assert.equal(row.qa.motionReviewClips,1);assert.equal(row.qa.clips['run/south'].motionReviewClips,1);
 assert(row.warnings.some(s=>s.startsWith('G16 ')));
}
const result={cases:r.count,changed:r.changed,candidateHash:r.candidateHash,allClassifierAndHardFailureAssertionsPassedInProbe:true,
 unchanged:['ordinary action names','clean equipment','normal rest motion','all-empty clips','unobservable short-item reversals','non-held item rotations'],
 reviewed:['residual hip-error reversal','residual size variation','strong gait-named action reversal','strong gait-named action size variation'],
 duplicateCountControl:'Each native review case retains exactly one total and one per-clip motionReviewClips count',
 retrySignalControl:'Native summary cases have no softCalls entries; this is not a queue-level paid-request test'};
writeFileSync(here+'policy-check-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
