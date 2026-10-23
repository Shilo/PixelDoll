// Offline raster palette boards, not an interactive app or production component.
// Run from any directory with Node that supports the project's native TS imports.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from '../../../../../app/node_modules/playwright/index.mjs';
import { loadFixture } from '../../../../../app/src/lib/compose/fixture.ts';
import { composeCell, bakedFrame, cellImg, layerFrame, over } from '../../../../../app/src/lib/compose/compose.ts';
import { makeImg } from '../../../../../app/src/lib/image/png.ts';
import { encodePngBytes } from '../../../../../app/src/lib/image/pngraw.ts';

const folder = new URL('./', import.meta.url);
const fixture = new URL('../../../../../app/public/fixtures/s2/', import.meta.url);
const project = await loadFixture(async path => new Uint8Array(await readFile(new URL(path, fixture))));
const frame = bakedFrame(project.manifest);
const actor = composeCell(project, project.manifest.presets[0].items, 'walk', 'south', 0, frame);
function crop(im) {
  let x0=im.w,y0=im.h,x1=0,y1=0;
  for(let y=0;y<im.h;y++) for(let x=0;x<im.w;x++) if(im.data[(y*im.w+x)*4+3]) {x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  const out=makeImg(x1-x0+1,y1-y0+1);
  for(let y=0;y<out.h;y++) out.data.set(im.data.subarray(((y+y0)*im.w+x0)*4,((y+y0)*im.w+x1+1)*4),y*out.w*4);
  return out;
}
const sprite=crop(actor), spritePng=await encodePngBytes(sprite);
await writeFile(new URL('demo-adventurer.png',folder),spritePng);
const hats=[];
for(const item of project.manifest.items.filter(it=>it.slot==='head')) {
  const im=makeImg(frame.w,frame.h);
  for(const l of item.layers) {const c=cellImg(project,l,'walk','south',0);const f=layerFrame(project.manifest.rig,l);if(c)over(im,c,frame.x-f.x,frame.y-f.y);}
  hats.push({name:item.name,png:Buffer.from(await encodePngBytes(crop(im))).toString('base64')});
}
const palettes=[
 {id:'bronze',title:'01  Obsidian / Porcelain Bronze',note:'Recommended · warm, restrained accents',dark:['#111317','#202329','#F2EEE6','#B8B5AD','#C9A66B'],light:['#EEEAE2','#FAF7F0','#25282D','#5E625F','#76562F']},
 {id:'frost',title:'02  Graphite / Frost',note:'Alternative · cooler, precise simulation atmosphere',dark:['#11171C','#202A31','#EDF3F4','#AEBCC0','#9DCDDA'],light:['#E8EEF0','#F7FBFC','#202A31','#52636B','#2E697D']},
 {id:'sage',title:'03  Basalt / Sage',note:'Alternative · softer, subdued mineral colors',dark:['#131A18','#222E29','#EFF3E9','#B5C2B4','#B4C8A1'],light:['#E9EEE4','#F7FAF3','#26332C','#57695B','#4A654A']}
];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1800,height:1010},deviceScaleFactor:1});
await page.route('**/*',r=>r.abort());
await page.setContent('<canvas width="1800" height="1010"></canvas>');
const evidence=[];
for(const palette of palettes) {
 const world=await readFile(new URL(`${palette.id}-world.png`,folder));
 const result=await page.evaluate(async ({palette,world,sprite,hats,raw})=>{
  const c=document.querySelector('canvas'),g=c.getContext('2d',{willReadFrequently:true});
  const load=async b=>{const i=new Image();i.src='data:image/png;base64,'+b;await i.decode();return i;};
  const [bg,hero,...headgear]=await Promise.all([load(world),load(sprite),...hats.map(h=>load(h.png))]);
  const text=(s,x,y,size,color,font='Segoe UI',weight=400)=>{g.fillStyle=color;g.font=`${weight} ${size}px "${font}"`;g.fillText(s,x,y);};
  const box=(x,y,w,h,fill,stroke,r=8)=>{g.beginPath();g.roundRect(x,y,w,h,r);if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=1.5;g.stroke();}};
  g.fillStyle='#101419';g.fillRect(0,0,c.width,c.height);
  text(palette.title,40,55,34,'#F2F0E9','Georgia');
  text(palette.note,40,89,18,'#BAC2CB');
  text('PALETTE STUDY  /  Same demo sprite in both appearances',1100,51,16,'#BAC2CB');
  const checks=[];
  for(let v=0;v<2;v++) {
   const p=v?palette.light:palette.dark,[worldColor,surface,ink,muted,accent]=p,x=40+v*880,y=158,w=840,h=570;
   text(v?'LIGHT':'DARK',x,137,16,'#D6DBE0','Segoe UI',600);
   g.save();g.beginPath();g.roundRect(x,y,w,h,12);g.clip();
   const sh=bg.height/2,sw=sh*w/h;
   g.drawImage(bg,(bg.width-sw)/2,v*sh,sw,sh,x,y,w,h);
   const alpha=(hex,a)=>hex+Math.round(a*255).toString(16).padStart(2,'0');
   const left=g.createLinearGradient(x,y,x+480,y);left.addColorStop(0,alpha(surface,.76));left.addColorStop(1,alpha(surface,0));g.fillStyle=left;g.fillRect(x,y,w,h);
   const right=g.createLinearGradient(x+420,y,x+w,y);right.addColorStop(0,alpha(surface,0));right.addColorStop(.42,alpha(surface,.94));right.addColorStop(1,alpha(surface,.99));g.fillStyle=right;g.fillRect(x,y,w,h);
   text('Customize character',x+28,y+42,16,muted);
   text('Adventurer',x+28,y+83,34,ink,'Georgia');
   text('Demo',x+30,y+112,15,muted);
   const rx=x+510,ry=y+58;
   text('Wardrobe',rx,ry,18,accent,'Segoe UI',600);text('Colours',rx+127,ry,18,muted);
   g.fillStyle=accent;g.fillRect(rx,ry+13,86,2);
   text('Headwear',rx,ry+66,18,ink,'Segoe UI',600);
   for(let k=0;k<2;k++) {
    const cx=rx+k*145,cy=ry+89;
    box(cx,cy,133,151,alpha(surface,.60),k===0?accent:alpha(muted,.35));
    const im=headgear[k];if(im){g.imageSmoothingEnabled=false;const z=3;g.drawImage(im,cx+Math.floor((133-im.width*z)/2),cy+20,im.width*z,im.height*z);g.imageSmoothingEnabled=true;}
    text(k?'Wizard hat':'Steel helmet',cx+12,cy+131,15,k===0?accent:ink);
    if(k===0)text('✓',cx+108,cy+24,18,accent);
   }
   box(rx,ry+260,278,42,alpha(surface,.65),alpha(muted,.35));text('None',rx+119,ry+287,16,ink);
   box(rx,ry+341,278,46,accent,null);text('New head item',rx+84,ry+371,17,v?'#FFFFFF':p[0],'Segoe UI',600);
   text('Use a saved design',rx+67,ry+418,16,muted);
   // Source RGBA drawn after all backings. No opacity, filters, shadows or reflections.
   const scale=5,hx=x+Math.floor(230-hero.width*scale/2),hy=y+455-hero.height*scale;
   g.imageSmoothingEnabled=false;g.drawImage(hero,hx,hy,hero.width*scale,hero.height*scale);g.imageSmoothingEnabled=true;
   const pixels=g.getImageData(hx,hy,hero.width*scale,hero.height*scale).data;let count=0;
   for(let yy=0;yy<hero.height;yy++)for(let xx=0;xx<hero.width;xx++) {const a=(yy*hero.width+xx)*4;if(raw[a+3]!==255)continue;const b=((yy*scale+2)*hero.width*scale+xx*scale+2)*4;for(let q=0;q<4;q++)if(pixels[b+q]!==raw[a+q])throw Error('Sprite pixel drift');count++;}
   checks.push({appearance:v?'light':'dark',opaquePixelsVerified:count,scale});
   text('Actual demo · Walk / South / frame 1',x+70,y+530,15,muted);
   g.restore();
   const labels=['World','UI backing','Text','Secondary','Selection'];
   for(let k=0;k<5;k++) {const sx=x+k*168;box(sx,758,152,43,p[k],'#45505A',5);text(labels[k],sx,829,16,'#C9D0D7');text(p[k],sx,856,17,'#F2F0E9','Consolas');}
  }
  text('Changes: environment artwork, UI text, backing gradients and selection/action colors.',40,922,20,'#E7EBEE');
  text('Unchanged: source character and equipment pixels. No lighting, tint, added shadow or reflection.',40,956,18,'#AEB9C4');
  return {png:c.toDataURL('image/png').split(',')[1],checks};
 },{palette,world:world.toString('base64'),sprite:Buffer.from(spritePng).toString('base64'),hats,raw:Array.from(sprite.data)});
 await writeFile(new URL(`${palette.id}-palette.png`,folder),Buffer.from(result.png,'base64'));
 evidence.push({palette:palette.id,...result.checks.reduce((o,v)=>({...o,[v.appearance]:v}),{})});
 console.log(`${palette.id}: written; source sprite pixels verified in dark and light`);
}
await browser.close();
await writeFile(new URL('verification.json',folder),JSON.stringify({source:'app/public/fixtures/s2',preset:'adventurer',animation:'walk',direction:'south',frame:0,composite:'composeCell + bakedFrame',spritePngSha256:createHash('sha256').update(spritePng).digest('hex'),evidence},null,2)+'\n');
