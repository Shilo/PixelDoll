import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const endpoint=git('rev-parse','50eeea36'),baseline=git('rev-parse','6006a55c');
const paths=git('diff','--name-only',baseline,endpoint).split('\n');
const files=paths.map(path=>{
  const pinned=execFileSync('git',['show',endpoint+':'+path],{cwd:root});
  const compared=path.startsWith('app/')||path.endsWith('claude-response.md');
  if(compared&&!pinned.equals(readFileSync(new URL('../../../'+path,import.meta.url))))throw new Error('Drift at '+path);
  return {path,gitBlob:git('rev-parse',endpoint+':'+path),sha256:createHash('sha256').update(pinned).digest('hex'),worktreeComparison:compared?'identical-to-pin':'review-index-intentionally-updated-by-this-delivery'};
});
writeFileSync(new URL('inventory.json',import.meta.url),JSON.stringify({baseline,endpoint,checkoutAtReview:git('rev-parse','HEAD'),files},null,2)+'\n');
console.log(files.length+' reviewed paths match 50eeea36.');
