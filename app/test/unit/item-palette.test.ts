import { afterEach, expect, test, vi } from 'vitest';
import { itemPaletteMatcher } from '../../src/lib/dress/item-palette.ts';
import { itemPaletteRepairPlan, matchItemColors, type RigCtx } from '../../src/lib/items/run.ts';
import * as store from '../../src/lib/store/project.ts';
import { queue } from '../../src/lib/pixellab/queue.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import { fromHex } from '../../src/lib/dress/palette.ts';
import { variantRampOf } from '../../src/lib/dress/dress.ts';
import type { Hex, Item, Material, Manifest } from '../../src/lib/store/manifest.ts';
afterEach(() => vi.restoreAllMocks());
const ramp: Hex[] = ['#3e4143','#505558','#7e8488','#8c9295','#a4acb1','#bdcbd1','#d0d8db','#ebebe9'];
const material = (cols: Hex[] = ramp, id = 'metal'): Material => ({ id, label:'Metal',owner:'sword',ramp:cols,variants:{} });
const owner = {id:'sword',materials:['metal']};
function pixels(cols: string[]) { const im=makeImg(cols.length,1);cols.forEach((h,i)=>{const c=fromHex(h);im.data.set([c>>16,(c>>8)&255,c&255,255],4*i)});return im; }
const colors = (im: Img) => Array.from({length:im.w*im.h},(_,i)=>[...im.data.slice(i*4,i*4+3)]);
test('matches only the eleven known eligible steel colors while preserving warm guard, outline and already owned RGB',()=>{
 const source=pixels(['#4b525c','#2e3c46','#394753','#dfe3e5','#b8c1c9','#9da6b1','#717882','#6c757d','#ffffff','#bec1c4','#626063','#352f17','#555a49','#665a51','#000000','#433f1f']);
 const mats=[material(),{...material(['#433f1f'],'wood'),owner:'sword'}],before=source.data.slice();
 const r=itemPaletteMatcher(owner,mats).apply(source);
 expect(r.changedPixels).toBe(11);expect(r.unmatchedPixels).toBe(0);expect(source.data).toEqual(before);
 expect(colors(r.image).slice(11)).toEqual(colors(source).slice(11));expect([...r.image.data].filter((_,i)=>i%4===3)).toEqual([...source.data].filter((_,i)=>i%4===3));
 expect(colors(r.image).slice(0,11)).toEqual(colors(pixels(['#505558','#3e4143','#3e4143','#ebebe9','#bdcbd1','#a4acb1','#7e8488','#7e8488','#ebebe9','#bdcbd1','#505558'])));
});
test('fixed24-channel bound accepts24 and refuses25 and the dark-edge counterexample',()=>{
 const r=itemPaletteMatcher(owner,[material(['#7c7c7c'])]).apply(pixels(['#646464','#636363']));
 expect(r.changedPixels).toBe(1);expect(r.unmatchedPixels).toBe(1);expect(colors(r.image)[1]).toEqual([99,99,99]);
 const edge=itemPaletteMatcher(owner,[material()]).apply(pixels(['#24282b']));expect(edge.changedPixels).toBe(0);expect(edge.unmatchedPixels).toBe(1);
});
test('global material claims, transparent RGB, tied nearest colors and unsupported families stay byte exact',()=>{
 const src=pixels(['#2e3c46','#646464','#a84f30']);src.data.set([255,255,255,0],4);
 const r=itemPaletteMatcher(owner,[material(),{...material(['#2e3c46'],'body_shirt'),owner:'body'}]).apply(src);
 expect(r.image.data).toEqual(src.data);expect(r.changedPixels).toBe(0);
 const tied=itemPaletteMatcher(owner,[material(['#5a5a5a','#6e6e6e'])]).apply(pixels(['#646464']));expect(tied.changedPixels).toBe(0);expect(tied.unmatchedPixels).toBe(1);
});
test('multiple neutral owners and absent owned neutral material fail closed',()=>{
 expect(()=>itemPaletteMatcher({...owner,materials:['metal','other']},[material(),material(['#c0c0c0'],'other')])).toThrow('exactly one');
 expect(()=>itemPaletteMatcher(owner,[{...material(),owner:'someone_else'}])).toThrow('exactly one');
});
async function fixture(){
 const raw=pixels(['#2e3c46','#352f17','#000000','#ffffff']),body=pixels(['#804020','#804020','#804020','#804020']),h=await cellHash(raw),b=await cellHash(body);
 const mat=material();mat.variants.custom=['#ff0000','#0000ff','#00ff00','#f000f0','#123456','#ffffff','#202020','#c0c0c0'];
 const item:Item={id:'sword',name:'Sword',slot:'main_hand',status:'accepted',mirror:'generate',materials:['metal'],prompt:'steel sword',baseHash:b,provenance:[{endpoint:'/inpaint-v3',params:{},seed:1,requestHash:'sha256:raw',createdAt:'before',produced:['slash/south/0','slash/south/1']}],designWarnings:['D1 original design warning'],qa:{minKeyKept:.98,maxKeyOutside:0,minAreaRatio:.7,maxAreaCV:.1,maxPaletteDist:0,clipPx:0,status:'accepted',rerolls:1,cells:{},clips:{'slash/south':{minKeyKept:.98,maxKeyOutside:0,minAreaRatio:.7,maxAreaCV:.1,maxPaletteDist:0,clipPx:0,status:'accepted'}}},layers:[{id:'fg',role:'fg',z:150,cell:{w:4,h:1},pivot:{x:2,y:1},cells:{idle:{south:[h,h]},slash:{south:[h,h],east:[h,h]}}}]};
 const manifest:Manifest={format:'pixeldoll/1',name:'Original',app:'',rig:{cell:{w:4,h:1},pivot:{x:2,y:1},baseItem:'body',baseHash:b,directions:[{id:'south'},{id:'east'}],animations:[{id:'idle',cells:2,loop:true,frames:[]},{id:'slash',cells:2,loop:false,frames:[]}]},materials:[mat],slots:[{id:'body',class:'base',z:10},{id:'main_hand',class:'held',z:150}],presets:[{id:'outfit',name:'Custom',items:{main_hand:'sword'},variants:{metal:'custom'}}],items:[{...item,id:'body',slot:'body',materials:[],provenance:[],qa:undefined,layers:[{id:'main',role:'fg',z:10,cells:{idle:{south:[b,b]},slash:{south:[b,b],east:[b,b]}}}]},item]};
 const current:store.StoredProject={id:'rig-test',savedAt:'before',manifest},images=new Map([[h,raw],[b,body]]),posts=vi.spyOn(queue,'enqueue');
 vi.spyOn(store,'loadProject').mockImplementation(async()=>{const rec=structuredClone(current);return{rec,project:{manifest:rec.manifest,images}} as RigCtx});
 let race:(()=>void)|undefined;
 const save=vi.spyOn(store,'saveItem').mockImplementation(async(_id,next,newImages,_ladder,check)=>{race?.();check?.(current);current.manifest.items[current.manifest.items.findIndex(i=>i.id===next.id)]=next;newImages.forEach((im,h)=>images.set(h,im));});
 return {current,images,h,raw,item,mat,posts,save,setRace:(f:()=>void)=>{race=f}};
}
test('free scoped publication preserves old shared pixels, QA, source, material ramps, custom variants and other views',async()=>{
 const f=await fixture(),before=structuredClone(f.current),oldCustom=variantRampOf(f.mat,'custom'),oldPick=variantRampOf(f.mat,'#234567');
 const plan=await itemPaletteRepairPlan('rig-test','sword','slash','south');expect(plan).toMatchObject({changedPixels:4,changedFrames:[0,1],unmatchedPixels:0,materialId:'metal'});
 await matchItemColors('rig-test','sword','slash','south',plan);
 const out=f.current.manifest.items[1];expect(out.layers[0].cells!.slash!.south![0]).not.toBe(f.h);expect(out.layers[0].cells!.idle).toEqual(f.item.layers[0].cells!.idle);expect(out.layers[0].cells!.slash!.east).toEqual(f.item.layers[0].cells!.slash!.east);expect(f.images.get(f.h)!.data).toEqual(f.raw.data);
 expect(f.current.manifest.materials).toEqual(before.manifest.materials);expect(f.current.manifest.presets).toEqual(before.manifest.presets);expect(f.current.manifest.items[0]).toEqual(before.manifest.items[0]);expect(f.current.manifest.rig).toEqual(before.manifest.rig);
 expect(out.qa).toEqual(f.item.qa);expect(out.designWarnings).toEqual(f.item.designWarnings);expect(out.provenance).toEqual(f.item.provenance);expect(variantRampOf(f.current.manifest.materials[0],'custom')).toEqual(oldCustom);expect(variantRampOf(f.current.manifest.materials[0],'#234567')).toEqual(oldPick);
 expect(out.paletteRepairs?.[0]).toMatchObject({version:'neutral-owned-v1',materialId:'metal',anim:'slash',dir:'south',frames:[{cell:0,changedPixels:2,layers:[{id:'fg',before:f.h,after:out.layers[0].cells!.slash!.south![0]}]},{cell:1,changedPixels:2}]});expect(f.posts).not.toHaveBeenCalled();
 await expect(itemPaletteRepairPlan('rig-test','sword','slash','south')).rejects.toThrow('No eligible');
});
test('reviewed counts or material/rig/item changes refuse before publication',async()=>{
 const f=await fixture(),plan=await itemPaletteRepairPlan('rig-test','sword','slash','south');
 await expect(matchItemColors('rig-test','sword','slash','south',{...plan,changedPixels:999})).rejects.toThrow('changed');expect(f.save).not.toHaveBeenCalled();
 f.current.manifest.materials[0].variants.custom[0]='#abcdef';await expect(matchItemColors('rig-test','sword','slash','south',plan)).rejects.toThrow('changed');expect(f.posts).not.toHaveBeenCalled();
});
test.each(['item','rig','material'] as const)('atomic %s edits cannot be overwritten after reviewed preparation',async kind=>{
 const f=await fixture(),plan=await itemPaletteRepairPlan('rig-test','sword','slash','south');
 f.setRace(()=>{if(kind==='item')f.current.manifest.items[1].name='Latest';else if(kind==='rig')f.current.manifest.rig.pivot.x++;else f.current.manifest.materials[0].ramp[0]='#313131';});
 await expect(matchItemColors('rig-test','sword','slash','south',plan)).rejects.toThrow('Existing colors were kept');expect(f.current.manifest.items[1].paletteRepairs).toBeUndefined();expect(f.posts).not.toHaveBeenCalled();
});
test('unrelated latest outfit/name changes survive the atomic free edit',async()=>{
 const f=await fixture(),plan=await itemPaletteRepairPlan('rig-test','sword','slash','south');f.setRace(()=>{f.current.manifest.name='Latest';f.current.manifest.presets[0].name='Latest outfit'});
 await matchItemColors('rig-test','sword','slash','south',plan);expect(f.current.manifest.name).toBe('Latest');expect(f.current.manifest.presets[0].name).toBe('Latest outfit');expect(f.posts).not.toHaveBeenCalled();
});

test('export playback preferences do not invalidate reviewed colors or concurrent free-edit publication', async () => {
 const f = await fixture(), plan = await itemPaletteRepairPlan('rig-test', 'sword', 'slash', 'south')
 f.current.manifest.rig.animations[0].loop = false
 f.current.manifest.exportSettings = { dressedCharacterSheets: false }
 f.setRace(() => { f.current.manifest.rig.animations[1].loop = true })
 await matchItemColors('rig-test', 'sword', 'slash', 'south', plan)
 expect(f.current.manifest.rig.animations.map(a => a.loop)).toEqual([false, true])
 expect(f.current.manifest.exportSettings).toEqual({ dressedCharacterSheets: false })
 expect(f.current.manifest.items[1].paletteRepairs).toHaveLength(1)
 expect(f.posts).not.toHaveBeenCalled()
})

const historyEntry = (before: `sha256:${string}`, after = `sha256:${'1'.repeat(64)}` as const) => ({version:'neutral-owned-v1' as const,materialId:'old_material',anim:'removed_move',dir:'west' as const,frames:[{cell:4096,changedPixels:1,layers:[{id:'fg',before,after}]}]});
test('prospective1001st repair and1001 changed frames refuse with zero publication, preserving existing project',async()=>{
 const f=await fixture();f.current.manifest.items[1].paletteRepairs=Array.from({length:1000},()=>historyEntry(f.h));const before=structuredClone(f.current);
 await expect(itemPaletteRepairPlan('rig-test','sword','slash','south')).rejects.toThrow('supported history format');expect(f.save).not.toHaveBeenCalled();expect(f.current).toEqual(before);
 delete f.current.manifest.items[1].paletteRepairs;f.current.manifest.rig.animations[1].cells=1001;f.current.manifest.items[1].layers[0].cells!.slash.south=Array(1001).fill(f.h);const many=structuredClone(f.current);
 await expect(itemPaletteRepairPlan('rig-test','sword','slash','south')).rejects.toThrow('supported history format');expect(f.save).not.toHaveBeenCalled();expect(f.current).toEqual(many);expect(f.posts).not.toHaveBeenCalled();
});
test.each(['material','animation'] as const)('new history with an overlong %s id refuses locally without restricting the existing project',async kind=>{
 const f=await fixture(),long='a'.repeat(201);let anim='slash';
 if(kind==='material'){f.current.manifest.materials[0].id=long;f.current.manifest.items[1].materials=[long]}else{anim=long;f.current.manifest.rig.animations[1].id=long;const cells=f.current.manifest.items[1].layers[0].cells!;cells[long]=cells.slash;delete cells.slash;}
 const before=structuredClone(f.current);await expect(itemPaletteRepairPlan('rig-test','sword',anim,'south')).rejects.toThrow('supported history format');expect(f.current).toEqual(before);expect(f.save).not.toHaveBeenCalled();expect(f.posts).not.toHaveBeenCalled();
});
test('valid historical removed references and cell4096 remain importable and survive a new bounded correction',async()=>{
 const f=await fixture(),history=historyEntry(f.h);f.current.manifest.items[1].paletteRepairs=[history];
 const plan=await itemPaletteRepairPlan('rig-test','sword','slash','south');await matchItemColors('rig-test','sword','slash','south',plan);
 expect(f.current.manifest.items[1].paletteRepairs).toHaveLength(2);expect(f.current.manifest.items[1].paletteRepairs![0]).toEqual(history);expect(f.posts).not.toHaveBeenCalled();
});
