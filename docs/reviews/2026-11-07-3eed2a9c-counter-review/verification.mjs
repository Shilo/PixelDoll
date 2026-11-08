import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const here=fileURLToPath(new URL('./',import.meta.url)),root=fileURLToPath(new URL('../../../',import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
const current=readFileSync(root+'app/src/lib/items/items.ts');
assert(current.equals(execFileSync('git',['show','3eed2a9c:app/src/lib/items/items.ts'],{cwd:root})));
const logs={};
for(const name of ['check','unit','bench','regression','browser','browser-temp-control','browser-final']){
 const path=`app/test-results-3eed-review-${name}.log`,raw=readFileSync(root+path),text=raw.toString('utf8').replace(/\x1b\[[0-9;]*m/g,'');
 logs[name]={path,sha256:hash(raw),passingBrowserBodies:(text.match(/^\s+ok\s+\d+\s+\[/gm)||[]).length,
 failingBrowserBodies:(text.match(/^\s+x\s+\d+\s+\[/gm)||[]).length,
 canceledDownloads:(text.match(/Error: download\.path: canceled/g)||[]).length,
 summaries:text.split(/\r?\n/).filter(l=>/svelte-check found|Test Files|Tests\s+\d|\d+ passed \([\d.]+m\)|Duration|\bok \|/.test(l))};
}
assert.equal(logs['browser-final'].passingBrowserBodies,68);assert.equal(logs['browser-final'].failingBrowserBodies,0);
const regressions=JSON.parse(readFileSync(here+'regression-results.json','utf8'));
const paired=regressions.testResults.map(f=>({name:f.name.replace(root.replaceAll('\\','/'),''),cases:f.assertionResults.filter(a=>a.status!=='skipped').map(a=>({title:a.title,status:a.status}))}));
const paths=execFileSync('git',['diff-tree','--no-commit-id','--name-only','-r','3eed2a9c'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/);
const files=paths.map(path=>({path,pinnedSha256:hash(execFileSync('git',['show',`3eed2a9c:${path}`],{cwd:root})),workingSha256:hash(readFileSync(root+path))}));
const result={reviewed:'3eed2a9c05e90f7b0febccc80e7caff804642ae0',baseline:'50eeea36446f146f6e499a6325843de8ffb77e96',node:process.version,sourceHash:hash(current),reviewedFiles:files,logs,pairedRegressions:paired,
 exits:{check:0,unit:0,bench:0,pairedRegressions:1,browserInitial:'interrupted during shutdown after test bodies',browserTempControl:'interrupted during shutdown after test body',browserFinal:0},
 transport:'No real PixelLab calls; review Node preload and offline Playwright wrapper. Final browser run uses workspace TEMP/TMP and unsandboxed execution for process cleanup.'};
writeFileSync(here+'verification.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({files:paths,initialBrowser:[logs.browser.passingBrowserBodies,logs.browser.failingBrowserBodies],finalBrowser:[logs['browser-final'].passingBrowserBodies,logs['browser-final'].failingBrowserBodies],regressions:paired.map(r=>r.cases.map(c=>c.status))}));
