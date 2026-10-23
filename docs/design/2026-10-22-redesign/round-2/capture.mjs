import {chromium} from '../../../../app/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const browser=await chromium.launch({headless:true});
const reports=[];
for(const [device,width,height] of [['desktop',1440,900],['mobile',390,844]]){
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const concept of ['grove','outpost','yard','blueprint','clay','islands']) for(const screen of ['select','create','dress','topdown','side']){
  if(device==='mobile'&&['topdown','side'].includes(screen)&&concept!=='yard')continue;
  await page.goto(`http://127.0.0.1:5201/round-2/index.html?capture=1&concept=${concept}&screen=${screen}`);
  await page.waitForFunction(()=>window.studyReady);
  await page.screenshot({path:path.join(here,'mockups',`${concept}-${device}-${screen}.png`)});
  reports.push({device,concept,screen,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors:[...errors]});
 }
 await page.close();
}
await browser.close();
fs.writeFileSync(path.join(here,'mockups/verification.json'),JSON.stringify(reports,null,2)+'\n');
console.log(JSON.stringify({captures:reports.length,passed:reports.every(r=>!r.overflow&&!r.errors.length)},null,2));
