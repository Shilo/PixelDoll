import {chromium} from '../../../../app/node_modules/playwright/index.mjs';
import {execFileSync} from 'node:child_process';import fs from 'node:fs/promises';
const folder='docs/design/2026-10-22-redesign/round-6-prototype/';const out=folder+'evidence/regression-repair/intermediate/';await fs.mkdir(out,{recursive:true});
const oldFiles=['index.html','main.js','styles.css','glass-theme.css','theme.mjs','material.mjs','world.js','creator.js','equipment.js'];
const old=Object.fromEntries(oldFiles.map(f=>[f,execFileSync('git',['show','003bef2:'+folder+f],{encoding:'utf8'})]));
const browser=await chromium.launch(); const report=[];
try {for(const revision of ['003bef2','repaired'])for(const theme of ['obsidian','porcelain'])for(const [width,height]of [[1175,711],[1469,889]]){
const context=await browser.newContext({viewport:{width,height}});const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1')return route.abort();if(url.pathname==='/@vite/client')return route.fulfill({body:'',contentType:'text/javascript'});const path=url.pathname==='/'?'index.html':url.pathname.slice(1);if(revision==='003bef2'&&old[path])return route.fulfill({body:old[path],contentType:path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':'text/javascript'});return route.continue();});
await page.goto('http://127.0.0.1:5202');await page.waitForFunction(()=>window.prototype?.ready);const click=a=>page.locator(`[data-action="${a}"]`).filter({visible:true}).first().click();if(theme==='porcelain'){await click('more');await click('theme:porcelain');}await click('create');await page.waitForTimeout(250);const name=`${revision}-${theme}-${width}-creation.png`;await page.screenshot({path:out+name});report.push({revision,theme,width,height,file:name,errors});await context.close();}
await fs.writeFile(out+'manifest.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}finally{await browser.close();}
