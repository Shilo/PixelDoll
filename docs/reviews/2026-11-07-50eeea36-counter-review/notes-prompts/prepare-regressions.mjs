import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const here=new URL('./',import.meta.url);
// Coordinator prepares exact 6006a55c and 50eeea36 application-source exports under the parent review's temp.local.
const tracked=readFileSync(new URL('../../../../app/test/unit/automatic-recovery.test.ts',here),'utf8');
for(const revision of ['before','after']) {
  const src=fileURLToPath(new URL('../temp.local/'+revision+'/app/src/',here)).replaceAll('\\','/');
  const folder=new URL('temp.local/'+revision+'/',here);mkdirSync(folder,{recursive:true});
  writeFileSync(new URL('regression.test.ts',folder),tracked.replaceAll("'../../src/",`'${src}`));
}
