import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=fileURLToPath(new URL('./',import.meta.url)),root=path.resolve(here,'../../../..'),tmp=path.join(here,'temp.local');
mkdirSync(path.join(tmp,'fixtures/bench'),{recursive:true});
for(const b of ['A','B','C','N'])copyFileSync(path.join(root,`app/test/fixtures/bench/body${b}.json`),path.join(tmp,`fixtures/bench/body${b}.json`));
const original=execFileSync('git',['show','d4c0c633:app/test/unit/move-classification.test.ts'],{cwd:root,encoding:'utf8'});
for(const [label,rev]of [['before','3eed2a9c'],['after','d4c0c633'],['ancestor','50eeea36']]){
 const folder=path.join(tmp,label);mkdirSync(folder,{recursive:true});
 const tar=path.join(tmp,label+'.tar');execFileSync('git',['archive','--format=tar','--output',tar,rev,'app/src','app/package.json'],{cwd:root});execFileSync('tar',['-xf',tar,'-C',folder]);
 if(label!=='ancestor')writeFileSync(path.join(folder,'motion.test.ts'),original.replaceAll("'../../src/",`'${path.join(folder,'app/src').replaceAll('\\','/')}/`));
}
console.log('Prepared pinned source and unchanged production test.');
