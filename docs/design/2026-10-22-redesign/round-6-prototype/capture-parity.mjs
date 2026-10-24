// Review every theme/screen at the mockups' logical viewport; no production routes.
import {chromium} from '../../../../app/node_modules/playwright/index.mjs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const phase=process.argv[2]??'after',root=new URL(`./evidence/parity-${phase}/`,import.meta.url);
await mkdir(root,{recursive:true});
const browser=await chromium.launch({headless:true});
try{for(const mobile of [false,true])for(const theme of ['obsidian','porcelain']){
 const context=await browser.newContext({viewport:{width:mobile?450:1920,height:mobile?800:1080},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
 const page=await context.newPage();await page.goto('http://127.0.0.1:5202');await page.waitForFunction(()=>window.prototype?.ready);
 const click=action=>page.locator(`[data-action="${action}"]`).filter({visible:true}).first().click();
 if((await page.evaluate(()=>window.prototype.snapshot().state.theme))!==theme){await click('more');await click('theme:'+theme);}
 const rows=[];
 async function record(screen){await page.waitForTimeout(180);await page.evaluate(()=>document.querySelector('#toast').hidden=true);const name=`${theme}-${mobile?'mobile':'desktop'}-${screen}.png`,shot=await page.screenshot();await writeFile(new URL(name,root),shot);const mock=await readFile(new URL('../round-5-mockups/images/'+name,import.meta.url));rows.push({screen,mock:mock.toString('base64'),actual:shot.toString('base64')});}
 for(const screen of ['selection','creation','preview','topdown','side']){
  if(screen==='creation')await click('create');
  if(screen==='preview'){await click('back');await click('customize');await click('play');}
  if(screen==='topdown'||screen==='side')await click('view:'+screen);
  await record(screen);
  if(mobile&&screen==='creation'&&phase==='after'){for(const [section,extra]of [[1,'creation-size'],[2,'creation-directions']]){await page.locator('.creator').evaluate((el,i)=>el.scrollTop=el.children[i].offsetTop,section);await record(extra);}}
 }
 // Canvas only packages evidence; mockups and screenshots remain unmodified alongside it.
 const review=await context.newPage();await review.setContent('<canvas></canvas>');
 for(const r of rows){const pair=await review.evaluate(async({r,mobile})=>{const w=mobile?900:1920,h=mobile?1600:1080,c=document.querySelector('canvas');c.width=w*2;c.height=h+56;const g=c.getContext('2d');g.fillStyle='#111317';g.fillRect(0,0,c.width,c.height);g.fillStyle='#f2eee6';g.font='24px Segoe UI';g.fillText('Approved image mockup',24,37);g.fillText('Live playable prototype',w+24,37);for(const [j,key]of ['mock','actual'].entries()){const im=new Image();im.src='data:image/png;base64,'+r[key];await im.decode();if(im.width!==w||im.height!==h)throw Error('Mismatched comparison dimensions');g.drawImage(im,j*w,56);}return c.toDataURL().split(',')[1];},{r,mobile});await writeFile(new URL(`${theme}-${mobile?'mobile':'desktop'}-${r.screen}-pair.png`,root),Buffer.from(pair,'base64'));}
 const result=await review.evaluate(async({rows,mobile,theme,phase})=>{const w=mobile?450:800,h=mobile?800:450,c=document.querySelector('canvas');c.width=w*2;c.height=(h+40)*rows.length;const g=c.getContext('2d');g.fillStyle='#111317';g.fillRect(0,0,c.width,c.height);for(let i=0;i<rows.length;i++){const r=rows[i],y=i*(h+40);g.fillStyle='#f2eee6';g.font='18px Segoe UI';g.fillText(theme+' · '+r.screen+' · approved mockup',12,y+26);g.fillText('Playable · '+phase,w+12,y+26);for(const [j,key]of ['mock','actual'].entries()){const im=new Image();im.src='data:image/png;base64,'+r[key];await im.decode();g.drawImage(im,j*w,y+40,w,h);}}return c.toDataURL().split(',')[1];},{rows,mobile,theme,phase});
 await writeFile(new URL(`${theme}-${mobile?'mobile':'desktop'}-comparison.png`,root),Buffer.from(result,'base64'));await context.close();
} }finally{await browser.close();}
console.log(`Captured matching-resolution screen pairs and four comparison sheets: parity-${phase}`);
