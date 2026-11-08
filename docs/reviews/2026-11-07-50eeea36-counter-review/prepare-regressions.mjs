import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here=fileURLToPath(new URL('./',import.meta.url)), root=path.resolve(here,'../../..'), tmp=path.join(here,'temp.local');
mkdirSync(path.join(tmp,'fixtures/bench'),{recursive:true});
for(const b of ['A','B','C','N'])copyFileSync(path.join(root,`app/test/fixtures/bench/body${b}.json`),path.join(tmp,`fixtures/bench/body${b}.json`));
const original=readFileSync(path.join(root,'app/test/unit/move-classification.test.ts'),'utf8'), appSrc=path.join(root,'app/src').replaceAll('\\','/');
for(const [label,rev]of [['before','6006a55c'],['after','50eeea36']]){
  const folder=path.join(tmp,label);mkdirSync(folder,{recursive:true});
  const tar=path.join(tmp,label+'.tar');execFileSync('git',['archive','--format=tar','--output',tar,rev,'app/src','app/package.json'],{cwd:root});
  execFileSync('tar',['-xf',tar,'-C',folder]);
  let test=original.replaceAll("'../../src/",`'${appSrc}/`);
  test=test.replace(`'${appSrc}/lib/items/items.ts'`,`'${folder.replaceAll('\\','/')}/app/src/lib/items/items.ts'`);
  writeFileSync(path.join(folder,'motion.test.ts'),test);
}
console.log('Prepared unchanged production F1 regression cases against both source revisions.');
