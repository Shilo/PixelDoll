import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here=fileURLToPath(new URL('./',import.meta.url)),root=path.resolve(here,'../../..'),tmp=path.join(here,'temp.local');
mkdirSync(path.join(tmp,'fixtures/bench'),{recursive:true});
for(const b of ['A','B','C','N'])copyFileSync(path.join(root,`app/test/fixtures/bench/body${b}.json`),path.join(tmp,`fixtures/bench/body${b}.json`));
const original=execFileSync('git',['show','3eed2a9c:app/test/unit/move-classification.test.ts'],{cwd:root,encoding:'utf8'});
for(const [label,rev]of [['before','50eeea36'],['after','3eed2a9c']]){
 const folder=path.join(tmp,label);mkdirSync(folder,{recursive:true});
 const tar=path.join(tmp,label+'.tar');execFileSync('git',['archive','--format=tar','--output',tar,rev,'app/src','app/package.json'],{cwd:root});
 execFileSync('tar',['-xf',tar,'-C',folder]);
 const src=path.join(folder,'app/src').replaceAll('\\','/');
 writeFileSync(path.join(folder,'motion.test.ts'),original.replaceAll("'../../src/",`'${src}/`));
}
console.log('Prepared unchanged four new production tests against both pinned revisions.');
