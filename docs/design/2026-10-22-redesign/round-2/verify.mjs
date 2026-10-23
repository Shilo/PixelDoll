import {chromium} from '../../../../app/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
const errors=[],checks=[],layouts=[];page.on('pageerror',e=>errors.push(e.message));
const go=async(screen='dress',concept='yard')=>{await page.goto(`http://127.0.0.1:5201/round-2/index.html?capture=1&concept=${concept}&screen=${screen}`);await page.waitForFunction(()=>window.studyReady);};
const action=a=>page.locator(`[data-action="${a}"]`);
const assert=(condition,label)=>{if(!condition)throw Error(label);checks.push(label);};
await go('select');await action('library').click();await page.getByRole('textbox',{name:'Find a character'}).fill('Mira');assert(await page.locator('[data-name]:visible').count()===1,'Search filters the six-character library');await page.locator('.dialog [data-action="choose:0"]').click();assert(await action('dress').textContent()==='Customize Mira','Library selection chooses the intended character');await action('dress').click();
await action('item:helmet').click();assert(await action('item:helmet').getAttribute('aria-pressed')==='true','Headgear selection updates');
const before=await page.locator('#world').evaluate(c=>c.toDataURL());await action('tone:2').click();assert(await page.locator('#world').evaluate(c=>c.toDataURL())!==before,'Palette preview changes rendered pixels');
await action('dir:3').click();assert(await page.locator('.mirror-label').isVisible(),'Mirrored west direction disclosed');await action('proof').first().click();assert(await page.locator('.proof-views canvas').count()===4,'Four native-size direction previews available');await page.keyboard.press('Escape');assert(await page.locator('.dialog').count()===0,'Escape closes inspection');
await action('grid').click();assert(await action('grid').textContent()==='Grid off','Grid toggle updates');await action('bounds').click();assert(await action('bounds').textContent()==='Bounds on','Bounds toggle updates');
await action('export').click();await page.getByLabel('Export format').selectOption('Godot');await action('preview-export').click();assert(await page.getByRole('heading',{name:'Export preview',exact:true}).isVisible(),'Export is an explicit simulation');await action('close').click();
await go('create');await action('views:8').click();assert((await page.locator('#direction-copy').textContent()).includes('not present'),'Unavailable eight-view sample disclosed');await action('drawing').click();await action('review-body').click();assert(await page.getByRole('heading',{name:'Keep this appearance?',exact:true}).isVisible(),'Creation includes cost and appearance review');await action('dress').click();
await page.setViewportSize({width:390,height:844});await action('parts').last().click();await page.locator('.dialog [data-action="part:Hands"]').click();await action('new-item').first().click();assert(await page.getByRole('heading',{name:'Make a new item',exact:true}).isVisible(),'Phone all-parts and labeled new-item actions work');await action('close').click();await action('mode:Moves').click();assert(await action('topdown').last().isVisible(),'Phone movement preview discoverable from Moves');await action('topdown').last().click();assert(await action('side').isVisible(),'Phone can switch both future projections');
const atStart=await page.locator('#world').evaluate(c=>c.toDataURL());await page.keyboard.press('ArrowRight');assert(await page.locator('#world').evaluate(c=>c.toDataURL())!==atStart,'Top-down direction input changes position and pose');await action('side').click();const sideStart=await page.locator('#world').evaluate(c=>c.toDataURL());await action('move:left').click();assert(await page.locator('#world').evaluate(c=>c.toDataURL())!==sideStart,'Side study responds to touch movement');await action('reset').click();assert((await page.locator('.test-note').textContent()).includes('not simulated'),'Physics limits remain visible');
for(const [device,width,height] of [['small',320,568],['landscape',844,390]]){
 await page.setViewportSize({width,height});
 for(const screen of ['select','create','dress']){await go(screen);await page.screenshot({path:path.join(here,'mockups',`yard-${device}-${screen}.png`)});layouts.push({device,screen,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});}
}
await page.setViewportSize({width:1840,height:200});
for(const board of ['worlds','stages','future']){await page.goto(`http://127.0.0.1:5201/round-2/board-${board}.html`);await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));await page.screenshot({path:path.join(here,'mockups',`board-${board}.png`),fullPage:true});}
await browser.close();
const report={passed:!errors.length&&layouts.every(r=>!r.overflow),checks,layouts,errors};fs.writeFileSync(path.join(here,'mockups/interaction-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
