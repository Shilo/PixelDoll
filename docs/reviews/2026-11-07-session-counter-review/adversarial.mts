import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { head, baseline, rigOf, blade, rect } from './temp.local/controls.mts';
import { validateRig } from '../../../app/src/lib/rig/rig.ts';
import { renderPoses, newDocument } from '../../../app/src/ui/motion-lab/model.ts';

const here = new URL('./', import.meta.url), root = new URL('../../../', here);
const sha = (value: string | Uint8ClampedArray) => createHash('sha256').update(value).digest('hex');
const rig = rigOf(), rest = rig.rest.south.keypoints;
const search: any[] = [];
for (const joint of rest) for (let x = 0.05; x < 1; x += 0.05) for (let y = 0.05; y < 1; y += 0.05) {
  const r = structuredClone(rig);
  Object.assign(r.animations[0].sources.south.measured[2].find(p => p.label === joint.label)!, { x, y });
  if (head.items.decisiveAction(r, 'walk', 'south')) search.push({ joint: joint.label, x: +x.toFixed(2), y: +y.toFixed(2) });
}
const hipsCollapsed = structuredClone(rig);
for (const p of hipsCollapsed.animations[0].sources.south.measured[2]) if (p.label.endsWith('HIP')) p.y = 10 / 64;
const neckOutlier = structuredClone(rig);
Object.assign(neckOutlier.animations[0].sources.south.measured[2].find(p=>p.label==='NECK')!, {x:0.05,y:0.5});
const body = head.png.makeImg(64, 64);
for (const box of [[24,20,16,24],[27,7,11,11],[19,21,3,16],[43,21,3,16],[20,21,24,3],[27,40,3,21],[35,40,3,21]]) rect(body, ...box as any, [160,110,80]);
for (const r of [rig,hipsCollapsed,neckOutlier]) {
  r.baseHash='sha256:'+sha(body.data);r.rest.south.image=r.baseHash;
  r.animations[0].frames=Array.from({length:6},(_,cell)=>({cell,ms:100}));
}
const judge = (r: any, defective: boolean) => {
  const cells = Array.from({length:6}, (_,i) => blade(i, defective && i === 3, body));
  const q = head.items.itemQa(r, head.items.slotOf('main_hand'), 'green', cells, 0);
  return { validatedRigErrors:validateRig(r), action: head.items.isAction('walk/south', r), status:q.qa.status, failures:[...q.failCalls.values()].flat(), warnings:q.warnings,
    hashes: cells.map(c=>sha(c.layer.data)), sourceQa: head.clips.clipQa({ anim:'walk',rest:body,frames:Array(6).fill(body), requested:r.animations[0].sources.south.keypoints, measured:r.animations[0].sources.south.measured, stray:0, facing:{dir:'south',rest} }) };
};
const rigFiles = ['A','B','C','N'].map(b=>'app/test/fixtures/bench/body'+b+'.json').concat('app/test/fixtures/helmet-occlusion.json');
const exportsDir = 'docs/testing/img/audit-worktree-39533f7/testing-img/professional-audit/';
if (existsSync(new URL(exportsDir, root))) for (const folder of readdirSync(new URL(exportsDir, root))) {
  const p = exportsDir + folder + '/export/manifest.json'; if(existsSync(new URL(p, root))) rigFiles.push(p);
}
const motionRows: any[] = [], subsamples: any[] = [];
for (const path of rigFiles) {
  const bytes = readFileSync(new URL(path, root), 'utf8'), j=JSON.parse(bytes), r=j.rig ?? j.manifest?.rig;
  for(const a of r.animations) for(const dir of Object.keys(a.sources ?? {})) {
    const row={path,hash:sha(bytes),anim:a.id,dir,decisive:head.items.decisiveAction(r,a.id,dir)};
    motionRows.push(row);
    if(a.id === 'slash') for(const offset of [0,1]) {
      const seq=a.sources[dir].keypoints, n=seq?.length ?? 0;
      if(n<8) continue;
      const pick=Array.from({length:4},(_,i)=>Math.floor((i*2+offset)*n/8));
      const sub=structuredClone(r), clip=sub.animations.find(c=>c.id===a.id), src=clip.sources[dir];
      clip.cells=4;src.keypoints=pick.map(i=>seq[i]);if(src.measured)src.measured=pick.map(i=>src.measured[i]);
      subsamples.push({path,dir,pick,decisive:head.items.decisiveAction(sub,a.id,dir)});
    }
  }
}
const model = readFileSync(new URL('../../../app/src/studio/model.ts', here),'utf8');
const library=JSON.parse(readFileSync(new URL('../../../app/dev-fixtures/motion-lab/library.json',here),'utf8'));
const kaykit=[];
for(const direction of ['south','east','north','west']) {
  const doc=newDocument(library,library.fixtures[0],library.clips.find(c=>c.id==='death'),direction as any), rendered=renderPoses(doc);
  const r=structuredClone(rig);r.cell={w:doc.fixture.cell.w+2*doc.padding,h:doc.fixture.cell.h+2*doc.padding};
  r.rest={[direction]:{image:r.baseHash,keypoints:rendered.result.rest}};
  r.animations=[{id:'death',cells:rendered.poses.length,loop:false,frames:[],sources:{[direction]:{keypoints:rendered.poses}}}];
  kaykit.push({fixture:doc.fixture.id,direction,frames:rendered.poses.length,decisive:head.items.decisiveAction(r,'death',direction)});
}
const lexicalSource = model.split(/\r?\n/).filter(l => ['const OFF_HAND = ','const SUBJECT_END = ','const stripCount = ','export const heldSlotFor = '].some(prefix=>l.startsWith(prefix))).join('\n')
  + '\n' + model.match(/const itemHead = \([\s\S]*?\n};/)![0] + '\n' + model.match(/export function itemNameFrom\([\s\S]*?\n}/)![0];
const lexical = await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(lexicalSource,{mode:'transform'})).toString('base64'));
const names = ['three leather boots','a few throwing knives','2 leather gloves','a coat of arms shield','a shield of oak','a bow of yew','a steel sword; decorated with a scutum','a steel sword, bearing a scutum emblem','a ring of the northern lights','a pair of','a','一面盾牌'].map(prompt=>({prompt,name:lexical.itemNameFrom(prompt),slot:lexical.heldSlotFor(prompt)}));
const grids: any[]=[];
for(const w of [0,-1,0.5,NaN,Infinity,1,32,64,160,336,512,1e9]) for(const count of [0,-1,0.5,NaN,Infinity,1,8,15,Number.MAX_SAFE_INTEGER]) {
  const before=performance.now();try {const layout=head.items.repairGridLayout({w,h:w},count,1);grids.push({w:String(w),count:String(count),layout,ms:performance.now()-before});}
  catch(error){grids.push({w:String(w),count:String(count),error:error.message,ms:performance.now()-before});}
}
const prompts: any[]=[];
const paddedLinks=[];
for(const pad of [0,16]) {
  const original=head.png.makeImg(64,64), b=head.png.makeImg(64,64);
  rect(original,8,20,10,10);rect(original,20,24,1,2);rect(original,23,22,4,5);rect(b,40,15,10,40,[160,110,80]);
  const layer=head.items.padImg(original,pad), base=head.items.padImg(b,pad), mask=new Uint8Array(layer.w*layer.h);
  for(let p=0;p<mask.length;p++)mask[p]=layer.data[p*4+3]?1:0;
  const parts=head.items.heldParts(mask,base);
  paddedLinks.push({pad,canvas:layer.w,keptPixels:parts.comps.reduce((n,c,i)=>n+(parts.keep[i]?c.length:0),0)});
}
const mixed=head.png.makeImg(64,64), plain=head.png.makeImg(64,64);
for(const im of [mixed,plain])rect(im,20,20,24,24,[30,80,200]);
rect(mixed,22,22,9,9,[20,20,20]);rect(mixed,33,33,9,9,[150,150,150]);
const item='a patterned cloth garment '.padEnd(300,'x');
for(const slot of ['main_hand','off_hand','back'])for(const key of ['green','magenta','blue','azure'])for(const count of [1,3,8,15,16]) {
  const cells=Array.from({length:count},(_,i)=>'walk/south/'+i), held=slot!=='back';
  const dress=head.items.itemPrompt(held?head.items.heldPhrase(item,slot):item,key,cells);
  const anchored=head.items.itemPrompt(held?head.items.heldPhrase(item,slot):item,key,cells,'rest/south/0');
  const grid=head.items.gridPrompt({item,slot,key,anim:'walk',dir:'south',n:count,refs:['south','east','north'],cell:{w:64,h:64}});
  const pose=head.items.itemRoute.pose({keyframePngB64:'offline',rest,poses:[rest,rest,rest],item,slot,key,anim:'walk',dir:'south',seed:1,cell:{w:64,h:64},pad:16});
  prompts.push({slot,key,count,dress:dress.length,anchored:anchored.length,grid:grid.length,pose:(pose.body as any).description.length,
    expectedHand:!held||[dress,grid,(pose.body as any).description].every(p=>p.includes(slot==='off_hand'?'left hand':'right hand')),
    oneItem:!held||[dress,grid,(pose.body as any).description].every(p=>p.includes(slot==='off_hand'?'exactly one held item, nothing in the right hand':'exactly one weapon, no other weapons, no scabbard, no shield'))});
}
const api=JSON.parse(readFileSync(new URL('../../../docs/research/pixellab/pixellab-openapi-v2.json',here),'utf8'));
const schemaLimits={};for(const endpoint of ['/edit-animation-v2','/inpaint-v3','/animate-with-skeleton-v3']) {
  const ref=api.paths[endpoint]?.post?.requestBody?.content?.['application/json']?.schema;
  const schema=ref?.$ref?ref.$ref.split('/').slice(1).reduce((o,k)=>o[k],api):ref;
  schemaLimits[endpoint]=schema?.properties?.description?.maxLength ?? null;
}
const result = { revision: execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(root),encoding:'utf8'}).trim(),functionalPin:'19646f09',synthetic:true,
  singleJointSearch:{count:search.length,examples:search.slice(0,20)}, neckOutlier:{changedFrame:2,changedLabel:'NECK',changedPosition:{x:0.05,y:0.5},normal:judge(rig,true),defective:judge(neckOutlier,true),valid:judge(neckOutlier,false)}, collapsedHips:{normal:judge(rig,true),defective:judge(hipsCollapsed,true),valid:judge(hipsCollapsed,false)},
  rigCount:rigFiles.length,motionRows,subsamples,kaykit,names,grids,paddedLinks,mixedGrayDark:head.items.smudgedViews('back','a blue garment',[mixed,plain,plain]),
  priceEdge:head.items.gridEstimate({w:96,h:96},12,0,4),prompts,schemaLimits };
writeFileSync(new URL('adversarial-results.json',here),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({singleJointSearch:result.singleJointSearch,collapsedHips:result.collapsedHips,rigCount:rigFiles.length,slash:motionRows.filter(r=>r.anim==='slash').map(r=>r.decisive),subsamples:subsamples.filter(r=>r.decisive).length+'/'+subsamples.length,promptMax:Object.fromEntries(['dress','anchored','grid','pose'].map(k=>[k,Math.max(...prompts.map(p=>p[k]))])),schemaLimits}));
