import {mkdirSync,readFileSync,writeFileSync,existsSync,symlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
const here=fileURLToPath(new URL('./',import.meta.url)),root=path.resolve(here,'../../..'),tmp=here+'temp.local/',integration=process.argv.includes('--integration'),rev=integration?'aa222267':'c1024a0c',fixed=!process.argv.includes('--baseline'),label=integration?'integration':fixed?'fixed':'baseline',dir=tmp+label+'/';
mkdirSync(dir,{recursive:true});execFileSync('git',['archive','--format=tar','--output',tmp+label+'.tar',rev],{cwd:root});execFileSync('tar',['-xf',tmp+label+'.tar','-C',dir]);
if(fixed){
 for(const file of ['app/src/lib/items/qa-summary.ts','app/src/studio/model.ts','app/test/unit/motion-review.test.ts','app/test/fixtures/motion-review.json','app/test/e2e/studio.spec.ts'])writeFileSync(dir+file,readFileSync(path.join(root,file)));
 // Another agent can edit prompt wording in this same module. Overlay only the owned quality evaluator.
 const itemFile='app/src/lib/items/items.ts',itemBase=readFileSync(dir+itemFile,'utf8'),itemCurrent=readFileSync(path.join(root,itemFile),'utf8');
 const qaBlock=s=>{const begin=s.indexOf('function evaluateQa('),end=s.indexOf('// ---------- B14',begin);if(begin<0||end<0)throw new Error('Missing QA boundary');return s.slice(begin,end)};
 const itemFixed=itemBase.replace(qaBlock(itemBase),qaBlock(itemCurrent));writeFileSync(dir+itemFile,itemFixed);writeFileSync(tmp+'corrected-items'+(integration?'-integration':'')+'.ts',itemFixed);
 const file='app/src/lib/store/manifest.ts',source=readFileSync(dir+file,'utf8'),marker='  heldHangReviewClips?: number;',line="  motionReviewClips?: number; // observable item changes needing review when motion overrides a gait label\n";
 const at=source.indexOf('\n',source.indexOf(marker));if(!source.includes(marker)||source.includes('motionReviewClips'))throw new Error('Unexpected manifest baseline');
 const corrected=source.slice(0,at+1)+line+source.slice(at+1);writeFileSync(dir+file,corrected);writeFileSync(tmp+'corrected-manifest'+(integration?'-integration':'')+'.ts',corrected);
}
if(!existsSync(dir+'app/node_modules'))symlinkSync(path.join(root,'app/node_modules'),dir+'app/node_modules','junction');
writeFileSync(dir+'app/playwright.hip-review.config.mts',`import base from './playwright.config.ts';
const offline={proxy:{server:'http://127.0.0.1:9',bypass:'localhost,127.0.0.1,[::1]'},args:['--host-resolver-rules=MAP *.pixellab.ai ~NOTFOUND']};
export default {...base,use:{...base.use,launchOptions:offline}};\n`);
const files=['app/src/lib/items/items.ts','app/src/lib/items/qa-summary.ts','app/src/lib/store/manifest.ts','app/src/studio/model.ts'];
const hash=b=>createHash('sha256').update(b).digest('hex');
writeFileSync(here+label+'-snapshot.json',JSON.stringify({baseline:execFileSync('git',['rev-parse',rev],{cwd:root,encoding:'utf8'}).trim(),overlay:fixed?'Only owned QA sources, one manifest field and new tests':'None',files:Object.fromEntries(files.map(f=>[f,hash(readFileSync(dir+f))])),dependencies:'Existing dependency junction; no install',excludes:'Other agents export edits, private .env and untracked files'},null,2)+'\n');
console.log('Prepared '+label+' source snapshot.');
