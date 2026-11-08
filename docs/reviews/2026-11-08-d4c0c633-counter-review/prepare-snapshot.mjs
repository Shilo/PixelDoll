import {mkdirSync,writeFileSync,existsSync,symlinkSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
const here=fileURLToPath(new URL('./',import.meta.url)),root=path.resolve(here,'../../..'),tmp=path.join(here,'temp.local'),fixed=process.argv.includes('--fixed'),snapshot=path.join(tmp,fixed?'fixed':'pinned');
mkdirSync(snapshot,{recursive:true});
const rev='d4c0c633d4ba9fbffd8a9765420a0527c100e208',tar=path.join(tmp,fixed?'fixed.tar':'pinned.tar');
execFileSync('git',['archive','--format=tar','--output',tar,rev],{cwd:root});execFileSync('tar',['-xf',tar,'-C',snapshot]);
if(fixed){
 const module='app/src/lib/items/items.ts',pinned=readFileSync(path.join(snapshot,module),'utf8'),current=readFileSync(path.join(root,module),'utf8');
 const start='export function decisiveAction(',end='/** Action clips';
 const block=s=>s.slice(s.indexOf(start),s.indexOf(end,s.indexOf(start)));
 if(!pinned.includes(start)||!current.includes(start)||!pinned.includes(end)||!current.includes(end))throw new Error('Missing classifier boundary');
 const corrected=pinned.replace(block(pinned),block(current));
 writeFileSync(path.join(snapshot,module),corrected);writeFileSync(path.join(tmp,'corrected-items.ts'),corrected);
 const test='app/test/unit/move-classification.test.ts';writeFileSync(path.join(snapshot,test),readFileSync(path.join(root,test)));
}
const modules=path.join(snapshot,'app/node_modules');if(!existsSync(modules))symlinkSync(path.join(root,'app/node_modules'),modules,'junction');
writeFileSync(path.join(snapshot,'app/playwright.counter-review.config.mts'),`import base from './playwright.config.ts';
const localOnly={proxy:{server:'http://127.0.0.1:9',bypass:'localhost,127.0.0.1,[::1]'},args:['--host-resolver-rules=MAP *.pixellab.ai ~NOTFOUND']};
export default {...base,use:{...base.use,launchOptions:localOnly}};
`);
const source=readFileSync(path.join(snapshot,'app/src/lib/items/items.ts'));
writeFileSync(here+(fixed?'fixed-snapshot.json':'snapshot.json'),JSON.stringify({revision:rev,sourceSha256:createHash('sha256').update(source).digest('hex'),snapshot:fixed?'temp.local/fixed':'temp.local/pinned',overlay:fixed?'Only the owned decisiveAction function and move-classification tests':'None',dependencies:'Junction to existing app/node_modules; no install and no dependency changes',exclusions:'Other uncommitted source, tests, exports and private .env are not archived'},null,2)+'\n');
console.log('Prepared committed-source snapshot with existing dependencies and offline browser wrapper.');
