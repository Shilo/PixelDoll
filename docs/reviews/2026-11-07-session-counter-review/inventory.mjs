import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const baseline=git('rev-parse','bb830dfb'), endpoint=git('rev-parse','19646f09');
const excluded=git('rev-parse','9c9a2138');
const commits=git('log','--reverse','--format=%H%x09%aI%x09%s',baseline+'..'+endpoint).split('\n').map(line=>{
  const [sha,date,subject]=line.split('\t');return {sha,date,subject,files:git('diff-tree','--no-commit-id','--name-only','-r',sha).split('\n').filter(Boolean)};
}).filter(c=>c.sha!==excluded);
const sources=git('diff','--name-only',baseline,endpoint,'--','app/src').split('\n').filter(Boolean).map(path=>{
  const actual=readFileSync(new URL('../../../'+path,import.meta.url));
  const pinned=execFileSync('git',['show',endpoint+':'+path],{cwd:root});
  if(!actual.equals(pinned))throw new Error('Application drift: '+path);
  return {path,gitBlob:git('rev-parse',endpoint+':'+path),sha256:createHash('sha256').update(actual).digest('hex')};
});
const fixtureSources=['app/test/unit/automatic-recovery.test.ts','app/test/e2e/studio.spec.ts','app/test/e2e/immersive-helpers.ts','app/dev-fixtures/motion-lab/library.json','docs/research/pixellab/pixellab-openapi-v2.json'].map(path=>({path,sha256:createHash('sha256').update(readFileSync(new URL('../../../'+path,import.meta.url))).digest('hex')}));
writeFileSync(new URL('inventory.json',import.meta.url),JSON.stringify({baseline,endpoint,handoff:git('rev-parse','304f27bd'),checkoutAtReview:git('rev-parse','HEAD'),excluded,claudeCommitCount:commits.length,commits,sources,fixtureSources},null,2)+'\n');
console.log(commits.length+' Claude commits; '+sources.length+' changed source paths match the functional pin.');
