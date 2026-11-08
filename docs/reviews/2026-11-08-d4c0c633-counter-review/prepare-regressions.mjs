import {mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const here=fileURLToPath(new URL('./',import.meta.url)),tmp=here+'temp.local/';
mkdirSync(tmp+'fixtures/bench',{recursive:true});
for(const b of ['A','B','C','N'])copyFileSync(tmp+`pinned/app/test/fixtures/bench/body${b}.json`,tmp+`fixtures/bench/body${b}.json`);
const original=readFileSync(tmp+'fixed/app/test/unit/move-classification.test.ts','utf8');
for(const [label,source]of [['before','pinned'],['after','fixed']]){
 const folder=tmp+'regression-'+label+'/';mkdirSync(folder,{recursive:true});
 writeFileSync(folder+'motion.test.ts',original.replaceAll("'../../src/",`'${(tmp+source+'/app/src/').replaceAll('\\','/')}`));
}
console.log('Prepared unchanged new tests against clean pinned and corrected source.');
