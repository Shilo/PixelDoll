import {chromium} from '../../../../app/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const file=name=>new URL('./evidence/'+name+'.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1');
try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  await page.goto('http://127.0.0.1:5202');await page.waitForFunction(()=>window.prototype?.ready);
  const click=action=>page.locator(`[data-action="${action}"]`).filter({visible:true}).first().click();
  await click('customize');await click('play');
  for(const theme of ['obsidian','porcelain']){
    if((await page.evaluate(()=>window.prototype.snapshot().state.theme))!==theme){await click('more');await click('theme:'+theme);}
    const p=await page.locator('.palette').boundingBox();
    await page.screenshot({path:file('palette-ring-'+(theme==='obsidian'?'dark':'light')),clip:{x:p.x-8,y:p.y-60,width:340,height:125}});
  }
  await page.locator('[data-field=clip]').selectOption('cross-punch');await click('direction:south');await page.keyboard.press('w');await page.waitForFunction(()=>window.prototype.snapshot().resolved.missing);
  await page.screenshot({path:file('preview-keyboard-north-light')});
  await page.locator('[data-field=clip]').selectOption('walk');await click('direction:south');await page.setViewportSize({width:450,height:800});
  const paint=await page.locator('.swatch').first().evaluate(el=>{const b=el.getBoundingClientRect(),scroll=el.closest('.wardrobe-scroll').getBoundingClientRect();return {left:b.left,edge:scroll.left};});assert.ok(paint.left-6>=paint.edge);
  await page.screenshot({path:file('mobile-shared-controls-light')});
  console.log('Captured both palette appearances, keyboard-facing coverage and mobile shared controls.');
}finally{await browser.close();}
