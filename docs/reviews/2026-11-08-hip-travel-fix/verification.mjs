import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=fileURLToPath(new URL('./',import.meta.url)),root=fileURLToPath(new URL('../../../',import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const source=readFileSync(here+'temp.local/integration/app/src/lib/items/items.ts','utf8'),baseline=execFileSync('git',['show','c1024a0c:app/src/lib/items/items.ts'],{cwd:root,encoding:'utf8'});
const block=s=>s.slice(s.indexOf('export function decisiveAction('),s.indexOf('export const GATES'));
assert.equal(block(source),block(baseline));
const files=['app/src/lib/items/items.ts','app/src/lib/items/qa-summary.ts','app/src/studio/model.ts','app/test/e2e/studio.spec.ts','app/test/unit/motion-review.test.ts','app/test/fixtures/motion-review.json'];
const qaBlock=s=>s.slice(s.indexOf('function evaluateQa('),s.indexOf('// ---------- B14',s.indexOf('function evaluateQa(')));
const owned=Object.fromEntries(files.map(f=>{const tested=readFileSync(here+'temp.local/integration/'+f),current=readFileSync(root+f);if(f==='app/src/lib/items/items.ts')assert.equal(qaBlock(tested.toString()),qaBlock(current.toString()),'Owned QA evaluator drifted');else assert(tested.equals(current),f+' drifted from the tested integration snapshot');return[f,hash(tested)]}));
const logs={};
for(const name of ['check','unit-initial','unit','bench','focused','regression','browser','crash-replay','integration-check','integration-unit','integration-unit-serial','integration-bench','integration-browser']){
 const path=`app/test-results-hip-travel-${name}.log`,raw=readFileSync(root+path),text=raw.toString().replace(/\x1b\[[0-9;]*m/g,'');
 logs[name]={path,sha256:hash(raw),passingBrowserBodies:(text.match(/^\s+ok\s+\d+\s+\[/gm)||[]).length,failingBrowserBodies:(text.match(/^\s+x\s+\d+\s+\[/gm)||[]).length,
 summaries:text.split(/\r?\n/).filter(l=>/svelte-check found|Test Files|Tests\s+\d|\d+ passed \([\d.]+[ms]\)|Duration|Test timed out|Running \d+ tests|\bok \|/.test(l))};
}
assert.equal(logs.browser.passingBrowserBodies,247);assert.equal(logs.browser.failingBrowserBodies,1);
assert.equal(logs['crash-replay'].passingBrowserBodies,1);assert.equal(logs['crash-replay'].failingBrowserBodies,0);
assert.equal(logs['integration-browser'].passingBrowserBodies,248);assert.equal(logs['integration-browser'].failingBrowserBodies,0);
const paired=JSON.parse(readFileSync(here+'regression-results.json','utf8')),focused=JSON.parse(readFileSync(here+'focused-results.json','utf8'));
assert.equal(focused.numPassedTests,7);assert.equal(focused.numFailedTests,0);
const result={baseline:'c1024a0c',integrationBase:'aa222267',node:process.version,ownedTestedFiles:owned,
 manifestTestedSha256:hash(readFileSync(here+'temp.local/integration/app/src/lib/store/manifest.ts')),
 classificationBlockSha256:hash(block(source)),classificationBlockByteIdentical:true,
 exits:{check:0,unitInitial:1,unit:0,bench:0,focused:0,pairedRegression:1,firstFullBrowser:1,isolatedCrashReplay:0,integrationCheck:0,integrationUnitDefault:1,integrationUnitOneWorker:0,integrationBench:0,integrationFullBrowser:0},
 logs,pairedRegression:paired.testResults.map(f=>({path:f.name.replace(root.replaceAll('\\','/'),''),tests:f.assertionResults.map(a=>({title:a.title,status:a.status}))})),
 tracking:'https://github.com/users/Shilo/projects/7?pane=issue&itemId=297488640',
 scope:'Only owned QA policy/presentation/schema field and tests; classifier, requests, pixels and other agents work unchanged.',
 transport:'No real PixelLab calls. Node review preload, offline browser wrapper, keyless loopback servers and workspace TEMP/TMP.'};
writeFileSync(here+'verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({ownedFiles:files.length,classificationUnchanged:true,browser:[247,1],integrationBrowser:[248,0]}));
