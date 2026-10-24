import { chromium } from '../../../app/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const browser=await chromium.launch({headless:true});
const reports=[];
for(const [device,width,height] of [['desktop',1440,900],['mobile',390,844]]){
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const concept of ['camp','atelier','quiet']) for(const screen of ['select','create','dress']){
  await page.goto(`http://127.0.0.1:5201/?capture=1&concept=${concept}&screen=${screen}`);
  await page.waitForFunction(()=>window.prototypeReady);
  await page.screenshot({path:path.join(here,'mockups',`${concept}-${device}-${screen}.png`)});
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,visibleControls:[...document.querySelectorAll('button')].filter(x=>x.getClientRects().length).length}));
  reports.push({device,concept,screen,...layout,errors:[...errors]});
 }
 await page.close();
}
const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
await page.goto('http://127.0.0.1:5201/?capture=1&concept=camp&screen=select');await page.waitForFunction(()=>window.prototypeReady);
await page.getByRole('button',{name:'Customize Rowan',exact:true}).click();
await page.locator('[data-action="item:hat"]').click();
if(!(await page.locator('[data-action="item:hat"]').getAttribute('aria-pressed')==='true'))throw Error('Equipment selection did not update');
await page.getByRole('button',{name:'Face east',exact:true}).click();
await page.getByRole('button',{name:'Export',exact:true}).click();
await page.screenshot({path:path.join(here,'mockups','camp-desktop-export.png')});
await page.getByRole('button',{name:'Close dialog',exact:true}).click();
await page.getByRole('button',{name:'Characters',exact:true}).click();
await page.getByRole('button',{name:'All characters · 6',exact:true}).click();
await page.locator('#library-search').fill('Mira');
if(await page.locator('#library-list button:visible').count()!==1)throw Error('Library search did not filter');
await page.getByRole('button',{name:'Close dialog',exact:true}).click();
await page.getByRole('button',{name:'New character',exact:true}).click();
await page.getByRole('button',{name:'Review drawing cost',exact:true}).click();
await page.getByRole('button',{name:'Simulate appearance review',exact:true}).click();
await page.screenshot({path:path.join(here,'mockups','camp-desktop-review.png')});
await page.getByRole('button',{name:'Close dialog',exact:true}).click();
await page.goto('http://127.0.0.1:5201/?capture=1&concept=camp&screen=dress');await page.waitForFunction(()=>window.prototypeReady);
const interactionErrors=[];page.on('pageerror',e=>interactionErrors.push(e.message));
await page.locator('[data-action="tone:2"]').click();
await page.getByRole('button',{name:'Inspect all frames',exact:true}).click();
if(await page.locator('.proof-grid canvas').count()!==4)throw Error('Missing proof views');
await page.getByRole('button',{name:'Switch world / plain backdrop',exact:true}).click();
if(!(await page.locator('#game').getAttribute('class')).includes('proof-mode'))throw Error('Plain backdrop not enabled');
await page.getByRole('button',{name:'Face west, mirrored',exact:true}).click();
if(!(await page.locator('.direction-note').isVisible()))throw Error('Mirror note missing');
await page.screenshot({path:path.join(here,'mockups','camp-desktop-inspect.png')});
await page.setViewportSize({width:390,height:844});
await page.getByRole('button',{name:'All parts',exact:true}).click();
await page.locator('.overlay [data-action="cat:Hands"]').click();
await page.locator('.add-item').click();
if(!(await page.getByRole('heading',{name:'Make a new item',exact:true}).isVisible()))throw Error('Mobile new item unreachable');
if(interactionErrors.length)throw Error(interactionErrors.join('\n'));
reports.push({interactionChecks:'PASS',checks:['character selection','equip wizard hat','direction change','export dialog','library search','creation cost gate','appearance review','recolour','four-view inspection','plain backdrop','mirrored-state notice','phone all-parts picker','phone new-item access']});
for(const [device,width,height] of [['small',320,568],['landscape',844,390]]){
 await page.setViewportSize({width,height});
 for(const screen of ['select','create','dress']){
  await page.goto(`http://127.0.0.1:5201/?capture=1&concept=camp&screen=${screen}`);await page.waitForFunction(()=>window.prototypeReady);
  await page.screenshot({path:path.join(here,'mockups',`camp-${device}-${screen}.png`)});
  reports.push({device,concept:'camp',screen,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
 }
}
await page.setViewportSize({width:1520,height:1100});
for(const concept of ['camp','atelier','quiet']){
 await page.goto(`http://127.0.0.1:5201/board-${concept}.html`);await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
 await page.screenshot({path:path.join(here,'mockups',`board-${concept}.png`),fullPage:true});
}
await browser.close();
fs.writeFileSync(path.join(here,'mockups/verification.json'),JSON.stringify(reports,null,2)+'\n');
console.log(JSON.stringify({captures:30,primaryMockups:18,interactionChecks:13,viewportChecks:24,passed:reports.every(r=>!r.overflow&&!r.errors?.length)},null,2));
