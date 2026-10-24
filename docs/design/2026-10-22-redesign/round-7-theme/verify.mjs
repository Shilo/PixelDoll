// Offline browser contract checks and equal-viewport evidence. No production/API state.
import { chromium, webkit } from '../../../../app/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
throw new Error('Historical Bronze verification is frozen, including --capture and --no-report. Use https://github.com/Shilo/bronze-ui for current checks, or reproduce PixelDoll commit 003bef2 in a separate checkout. Existing reports and screenshots must not be overwritten.');
const engine = process.argv.includes('--webkit') ? webkit : chromium;
const capture = process.argv.includes('--capture');
const evidence = new URL('./evidence/', import.meta.url); await mkdir(evidence,{recursive:true});
const report={engine:engine.name(),result:'passed',cases:[],checks:[],errors:[],external:[]};
const browser=await engine.launch({headless:true});
let activePage;
const sizes=[{width:1920,height:1080},{width:390,height:844},{width:320,height:568},{width:844,height:390}];
const pages=['Scene','Controls','Creator','Library','Feedback','Overlays'];
const shot=async(page,name,fullPage=true)=>{if(capture)await page.screenshot({path:fileURLToPath(new URL(name+'.png',evidence)),fullPage});};
async function artworkReady(page) {
  await page.getByRole('button',{name:'Steel helmet',exact:true}).waitFor();
  await page.waitForFunction(()=>{const c=document.querySelector('.scene-actor canvas');return c&&c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0);});
}
try {
for(const size of sizes) for(const theme of ['dark','light']) {
  const context=await browser.newContext({viewport:size,deviceScaleFactor:1,hasTouch:size.width<1000});
  const page=await context.newPage();
  activePage=page;
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('request',r=>{if(!/^(http:\/\/127\.0\.0\.1:5203|data:|blob:)/.test(r.url()))report.external.push(r.url());});
  await page.goto(`http://127.0.0.1:5203/?theme=${theme}`);
  await artworkReady(page);
  await page.getByRole('button',{name:'Pause animation',exact:true}).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
  assert.equal(await page.locator('html').evaluate(e=>getComputedStyle(e).colorScheme),theme);
  if(await page.evaluate(()=>CSS.supports('scrollbar-color','auto'))) {
    const scroll=await page.locator('html').evaluate(e=>getComputedStyle(e).scrollbarColor);
    assert.notEqual(scroll,'auto');
    assert.equal(await page.locator('.lab-nav').evaluate(e=>getComputedStyle(e).scrollbarColor),scroll,'nested scrollbar inherits theme');
    assert.equal(await page.locator('html').evaluate(e=>getComputedStyle(e).scrollbarWidth),'auto');
  }
  const actor=()=>page.locator('.scene-actor canvas').first().evaluate(c=>c.toDataURL());
  const source=await actor();
  await page.getByTestId('theme').click(); assert.equal(await actor(),source);
  await page.getByTestId('theme').click(); assert.equal(await actor(),source);
  await page.goto('http://127.0.0.1:5203/');
  assert.equal(await page.locator('html').getAttribute('data-theme'),theme,'explicit choice survives reload without URL override');
  await artworkReady(page);
  await page.getByRole('button',{name:'Pause animation',exact:true}).click();
  const prefix=`${size.width===1920?'desktop':size.width===390?'mobile':size.width===320?'narrow':'landscape'}-${theme}`;
  for(const section of pages) {
    await page.getByRole('navigation',{name:'Component sections'}).getByRole('button',{name:section,exact:true}).click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${prefix}/${section} overflow`);
    if(size.width===1920 || size.width===390) await shot(page,`${prefix}-${section.toLowerCase()}`);
    report.cases.push({theme,...size,section,result:'passed'});
  }
  // Cross-family regressions discovered in independent review.
  await page.getByRole('button',{name:'Controls',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search sample characters'}).fill('Mira');
  assert.equal(await page.getByRole('button',{name:/Mira Demo/}).getAttribute('aria-pressed'),'false');
  await page.getByRole('button',{name:/Mira Demo/}).click();
  await page.getByRole('searchbox').fill('');
  assert.equal(await page.getByRole('button',{name:/Mira Demo/}).getAttribute('aria-pressed'),'true');
  const color=await page.locator('input[type=color]').boundingBox();assert.ok(color.width>=44&&color.height>=44);
  await page.getByRole('button',{name:'Color #a73933',exact:true}).click();
  await page.getByRole('button',{name:'Reset colors',exact:true}).click();
  assert.equal(await page.locator('input[type=color]').inputValue(),'#858581');
  await page.getByRole('switch',{name:'Transparent background'}).uncheck();
  assert.equal(await page.getByRole('switch').isChecked(),false);
  await page.getByLabel('Character archive',{exact:true}).setInputFiles({name:'sample.zip',mimeType:'application/zip',buffer:Buffer.from('local filename specimen')});
  assert.match(await page.getByRole('status').last().innerText(),/sample.zip; nothing uploaded/);
  await page.getByRole('button',{name:'Library',exact:true}).click();
  await page.getByRole('button',{name:'Name sample outfit',exact:true}).click();
  await page.getByRole('textbox',{name:'Outfit name',exact:true}).fill('Reviewed outfit');
  await page.getByRole('button',{name:'Save sample',exact:true}).click();
  assert.ok(await page.getByText('Reviewed outfit',{exact:true}).isVisible());
  const menuOwner=page.getByRole('button',{name:'Character actions',exact:true});await menuOwner.click();
  await page.getByRole('button',{name:'Rename',exact:true}).click();
  await page.getByRole('dialog',{name:'Rename character',exact:true}).waitFor();await page.keyboard.press('Escape');
  assert.ok(await menuOwner.evaluate(e=>e===document.activeElement));
  await page.getByRole('radio',{name:'Original',exact:true}).focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('radio',{name:'Warm steel',exact:true}).getAttribute('aria-checked'),'true');
  // Form tabs, inline error association, joined field geometry.
  await page.getByRole('button',{name:'Creator',exact:true}).click();
  const appearance=page.getByRole('tab',{name:'Appearance',exact:true});await appearance.focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab',{name:'Prompt',exact:true}).getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#panel-Appearance').count(),1);
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('spinbutton',{name:'Body size'}).fill('33');
  await page.getByRole('button',{name:'Validate sample',exact:true}).click();
  assert.equal(await page.getByRole('spinbutton',{name:'Body size'}).getAttribute('aria-invalid'),'true');
  const errorId=await page.getByRole('spinbutton',{name:'Body size'}).getAttribute('aria-describedby');
  assert.match(await page.locator(`[id="${errorId}"]`).innerText(),/steps of 4/);
  assert.ok(await page.getByRole('spinbutton',{name:'Body size'}).evaluate(e=>getComputedStyle(e.parentElement).boxShadow!=='none'));
  const units=await page.locator('.pd-unit').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));
  assert.ok(Math.abs(units[0]-units[1])<=2,`unaligned fields ${units}`);
  if(size.width<1000) for(const box of await page.locator('.direction-pair button').evaluateAll(es=>es.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))))assert.ok(box.w>=44&&box.h>=44,JSON.stringify(box));
  if(size.width===1920 || size.width===390)await shot(page,`${prefix}-validation`);
  // Scrollable native modal, exclusive choices, busy dismissal, returned focus.
  await page.getByRole('button',{name:'Overlays',exact:true}).click();
  const opener=page.getByRole('button',{name:'Open export dialog',exact:true});await opener.click();
  const dialog=page.getByRole('dialog',{name:'Export',exact:true});await dialog.waitFor();
  assert.ok(await dialog.evaluate(e=>e.matches(':modal')));
  await dialog.getByRole('radio',{name:'Godot',exact:true}).focus();await page.keyboard.press('ArrowRight');
  assert.equal(await dialog.getByRole('radio',{name:'Unity',exact:true}).getAttribute('aria-checked'),'true');
  const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=size.width+1&&box.y+box.height<=size.height+1);
  if(size.width<600)assert.ok(box.width>=await page.evaluate(()=>document.documentElement.clientWidth)-1,'phone sheet fills available width');
  if(size.width===1920 || size.width===390)await shot(page,`${prefix}-dialog`,false);
  await dialog.getByRole('button',{name:'Prepare sample',exact:true}).click();await page.keyboard.press('Escape');assert.ok(await dialog.isVisible());
  await dialog.getByText('Sample prepared',{exact:true}).waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.ok(await opener.evaluate(e=>e===document.activeElement));
  // Help stays hoverable; Escape removes tip before parent modal.
  await page.getByRole('button',{name:'Long review',exact:true}).click();
  await page.getByRole('button',{name:'Direction 1 help',exact:true}).click();
  assert.ok(await page.getByRole('tooltip').isVisible());await page.keyboard.press('Escape');assert.equal(await page.getByRole('tooltip').isVisible(),false);
  assert.ok(await page.getByRole('dialog',{name:'Long review',exact:true}).isVisible());await page.keyboard.press('Escape');
  // Nonmodal popover has real dismissal and allows Tab to leave.
  await page.getByRole('button',{name:'Open API details',exact:true}).click();
  const api=page.getByRole('dialog',{name:'API calls',exact:true});await api.waitFor();
  assert.equal(await api.evaluate(e=>e.matches(':modal')),false);
  await api.getByRole('button',{name:'Copy sample',exact:true}).focus();await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(()=>!document.querySelector('#api-sample').contains(document.activeElement)));
  if(size.width===1920 || size.width===390)await shot(page,`${prefix}-popover`,false);
  // Tab can focus help outside this nonmodal panel; dismiss the top layer first.
  await page.keyboard.press('Escape');
  if (await api.isVisible()) await page.keyboard.press('Escape');
  await api.waitFor({state:'hidden'});
  // Theme fallbacks must override BOTH schemes; no blur or broken semantic colors.
  await page.getByRole('button',{name:'Scene',exact:true}).click();
  if(size.width<1000) for(const box of await page.locator('.playback button').evaluateAll(es=>es.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))))assert.ok(box.w>=44&&box.h>=44,JSON.stringify(box));
  await page.emulateMedia({forcedColors:'active'});
  assert.equal(await page.locator('html').evaluate(e=>getComputedStyle(e).getPropertyValue('--pd-surface').trim()),'Canvas');
  if(await page.evaluate(()=>CSS.supports('scrollbar-color','auto')))assert.equal(await page.locator('html').evaluate(e=>getComputedStyle(e).scrollbarColor),'auto');
  assert.equal(await page.locator('.playback').evaluate(e=>getComputedStyle(e).backdropFilter),'none');
  await page.emulateMedia({forcedColors:'none',contrast:'more',reducedMotion:'reduce'});
  assert.equal(await page.locator('.playback').evaluate(e=>getComputedStyle(e).backdropFilter),'none');
  if(engine===chromium) { const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});assert.equal(await page.locator('.playback').evaluate(e=>getComputedStyle(e).backdropFilter),'none'); }
  await context.close();
}
assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
report.checks=['48 screen/appearance/viewport combinations without horizontal overflow','Native light/dark color-scheme, persisted choice, source actor canvas unchanged on switch','Themed root/nested scrollbars, native width and forced-color fallback','Stable filtered character identity, palette reset and 44px color picker','Checkbox switch state; keyboard prompt tabs with retained panels','Local file selection, outfit editing, ramp keyboard and popup-to-dialog focus return','Associated numeric error, joined field marker and aligned heights','44px coarse-pointer playback/compass/mirror targets including narrow portrait and landscape','Native modal bounds and full-width phone sheet, choice keyboard navigation, busy Escape protection, opener return','Help in top layer and nested Escape ordering','Nonmodal API panel permits keyboard exit','Forced colors in both themes, contrast/motion and Chromium reduced-transparency fallbacks','No page errors or external requests'];
} catch(error) { report.result='failed';report.errors.push(String(error));if(activePage&&!activePage.isClosed()){await activePage.screenshot({path:fileURLToPath(new URL(`failure-${engine.name()}.png`,evidence))}).catch(()=>{});report.visibleFailure=await activePage.locator('body').innerText().catch(()=>'Unavailable');}throw error; }
finally { await browser.close();if(!process.argv.includes('--no-report'))await writeFile(new URL(`verification-${engine.name()}.json`,import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({result:report.result,cases:report.cases.length,checks:report.checks,errors:report.errors},null,2)); }
