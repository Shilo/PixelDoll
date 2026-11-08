import {mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=fileURLToPath(new URL('./',import.meta.url)),tmp=here+'temp.local/';
mkdirSync(tmp+'fixtures',{recursive:true});copyFileSync(tmp+'fixed/app/test/fixtures/motion-review.json',tmp+'fixtures/motion-review.json');
const original=readFileSync(tmp+'fixed/app/test/unit/motion-review.test.ts','utf8');
for(const [label,source]of [['before','baseline'],['after','fixed']]){
 const folder=tmp+'regression-'+label+'/';mkdirSync(folder,{recursive:true});
 const src=(tmp+source+'/app/src/').replaceAll('\\','/'),pub=pathToFileURL(tmp+source+'/app/public/fixtures/s2/').href;
 writeFileSync(folder+'motion-review.test.ts',original.replaceAll("'../../src/",`'${src}`).replaceAll('../../public/fixtures/s2/',pub));
}
console.log('Prepared unchanged new regression tests against baseline and correction.');
