import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=fileURLToPath(new URL('./',import.meta.url)),root=fileURLToPath(new URL('../../../',import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const module='app/src/lib/items/items.ts',test='app/test/unit/move-classification.test.ts';
const pinned=readFileSync(here+'temp.local/pinned/'+module),fixed=readFileSync(here+'temp.local/fixed/'+module),corrected=readFileSync(here+'temp.local/corrected-items.ts');
assert(pinned.equals(execFileSync('git',['show',`d4c0c633:${module}`],{cwd:root})));assert(fixed.equals(corrected));
const block=s=>s.slice(s.indexOf('export function decisiveAction('),s.indexOf('/** Action clips',s.indexOf('export function decisiveAction(')));
assert.equal(block(fixed.toString()),block(readFileSync(root+module,'utf8')));
assert(readFileSync(here+'temp.local/fixed/'+test).equals(readFileSync(root+test)));
const logs={};
for(const name of ['check','unit','unit-quiet','pinned-focused','bench','browser','fixed-check','fixed-unit','fixed-bench','fixed-browser','regression']){
 const path=`app/test-results-d4-review-${name}.log`,raw=readFileSync(root+path),text=raw.toString().replace(/\x1b\[[0-9;]*m/g,'');
 logs[name]={path,sha256:hash(raw),passingBrowserBodies:(text.match(/^\s+ok\s+\d+\s+\[/gm)||[]).length,failingBrowserBodies:(text.match(/^\s+x\s+\d+\s+\[/gm)||[]).length,
 summaries:text.split(/\r?\n/).filter(l=>/svelte-check found|Test Files|Tests\s+\d|\d+ passed \([\d.]+m\)|Duration|Test timed out|\bok \|/.test(l))};
}
assert.equal(logs.browser.passingBrowserBodies,68);assert.equal(logs['fixed-browser'].passingBrowserBodies,68);assert.equal(logs['fixed-browser'].failingBrowserBodies,0);
const regressions=JSON.parse(readFileSync(here+'regression-results.json','utf8')),focused=JSON.parse(readFileSync(here+'pinned-focused-results.json','utf8'));
assert.equal(focused.numPassedTests,14);assert.equal(focused.numFailedTests,0);
const result={reviewed:'d4c0c633d4ba9fbffd8a9765420a0527c100e208',baseline:'3eed2a9c05e90f7b0febccc80e7caff804642ae0',node:process.version,
 source:{pinnedSha256:hash(pinned),fixedSha256:hash(fixed),ownedFunctionMatchesWorkingTree:true,ownedTestSha256:hash(readFileSync(root+test)),sharedWorktreeSourceIntentionallyNotStagedWhole:true},
 exits:{pinnedCheck:0,pinnedFullUnitAttempts:[1,1],pinnedFocused:0,pinnedBench:0,pinnedBrowser:0,fixedCheck:0,fixedUnit:0,fixedBench:0,fixedBrowser:0,pairedNewRegressions:1},logs,
 pairedNewRegressions:regressions.testResults.map(f=>({name:f.name.replace(root.replaceAll('\\','/'),''),cases:f.assertionResults.filter(a=>a.status!=='skipped').map(a=>({title:a.title,status:a.status}))})),
 tracking:'Public board-card creation rejected by automatic approval review; no mutation retried. File work remained independently authorized.',
 transport:'No PixelLab calls; Node review preload plus offline Playwright wrapper, keyless loopback servers and workspace TEMP/TMP.'};
writeFileSync(here+'verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({source:result.source,pinnedBrowser:68,fixedBrowser:68,focused:14}));
