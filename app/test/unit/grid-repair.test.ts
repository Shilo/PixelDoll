import { afterEach, expect, test, vi } from 'vitest'
import { gridRepairRequest, regridClip, type RigCtx } from '../../src/lib/items/run.ts'
import { queue, type JobRec } from '../../src/lib/pixellab/queue.ts'
import * as db from '../../src/lib/store/db.ts'
import * as store from '../../src/lib/store/project.ts'
import { base64ToBytes, makeImg, type Img } from '../../src/lib/image/png.ts'
import { decodePngBytes, encodePngBytes } from '../../src/lib/image/pngraw.ts'
import { inputCell, padImg } from '../../src/lib/items/items.ts'
import { cellHash, type DirectionName } from '../../src/lib/rig/rig.ts'
import { LABELS, fromApi } from '../../src/lib/rig/poses.ts'
import { sha256 } from '../../src/lib/image/hash.ts'
import type { Item, Manifest } from '../../src/lib/store/manifest.ts'
afterEach(()=>vi.restoreAllMocks())
async function fixture(mode='pass'){
 const dirs:DirectionName[]=['south','east','north','west'],body=makeImg(64,64)
 for(let y=10;y<60;y++)for(let x=24;x<40;x++)body.data.set([170,120,90,255],(y*64+x)*4)
 const h=await cellHash(body),points=LABELS.map(label=>({label,x:(label==='RIGHT ARM'?25:label==='LEFT ARM'?38:32)/64,y:30/64})),blobs=new Map<string,Blob>()
 const put=async(im:Img)=>{const bytes=await encodePngBytes(im),hash=await sha256(bytes);blobs.set(hash,new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'image/png'}));return hash}
 const reference=inputCell(padImg(body,16),'green');for(let y=46;y<68;y++)for(let x=39;x<42;x++)reference.data.set([180,180,190,255],(y*96+x)*4)
 const rh=await put(reference),ih=await cellHash(reference)
 const item:Item={id:'sword',name:'Sword',slot:'main_hand',status:'accepted',mirror:'generate',prompt:'steel sword with gold hilt',materials:[],provenance:[],baseHash:h,route:'skeleton-pose',key:'green',dressed:Object.fromEntries(dirs.map(d=>[d,`sha256:${rh}`])),layers:[{id:'fg',role:'fg',z:150,cell:{w:96,h:96},pivot:{x:48,y:76},cells:{idle:{west:[ih]},slash:{south:Array(8).fill(ih),west:Array(8).fill(ih)}}},{id:'bg',role:'bg',z:1,cell:{w:96,h:96},pivot:{x:48,y:76},cells:{idle:{west:[null]},slash:{south:Array(8).fill(null),west:Array(8).fill(null)}}}]}
 const manifest:Manifest={format:'pixeldoll/1',name:'Test',app:'',slots:[],materials:[],presets:[],rig:{cell:{w:64,h:64},pivot:{x:32,y:60},baseHash:h,baseItem:'base',directions:dirs.map(id=>({id})),rest:Object.fromEntries(dirs.map(d=>[d,{image:h,keypoints:points}])),animations:[{id:'slash',cells:8,loop:false,frames:[],sources:Object.fromEntries(dirs.map(d=>[d,{route:'skeleton-v3',reference:h,keypoints:Array(8).fill(points),measured:Array(8).fill(points),provenance:[]}]))}]},items:[{...item,id:'base',slot:'body',dressed:undefined,layers:[{id:'main',role:'fg',z:10,cells:{slash:Object.fromEntries(dirs.map(d=>[d,Array(8).fill(h)]))}}]},item]}
 const ctx:RigCtx={rec:{id:'rig-grid',savedAt:'original',manifest,skeletons:Object.fromEntries(dirs.flatMap(d=>Array.from({length:8},(_,i)=>[`slash/${d}/${i}`,fromApi(points,manifest.rig.cell)])))},project:{manifest,images:new Map([[h,body],[ih,reference]])}}
 let current=structuredClone(ctx.rec),saved:Item|undefined
 vi.spyOn(db,'getBlob').mockImplementation(async hash=>blobs.get(hash))
 const save=vi.spyOn(store,'saveItem').mockImplementation(async(_id,next,_images,_slots,check)=>{check?.(current);saved=next})
 const enqueue=vi.spyOn(queue,'enqueue').mockImplementation(async req=>{
  if(mode==='lost')return{state:'lost',error:'unknown test response'} as JobRec
  const raw=(req.body as {inpainting_image:{image:{base64:string}}}).inpainting_image.image.base64
  const grid=mode==='geometry'?makeImg(256,192):await decodePngBytes(base64ToBytes(raw))
  for(let i=0;i<8&&mode!=='geometry';i++){const ox=i%4*96,oy=Math.floor(i/4)*96;for(let y=25;y<47;y++)for(let x=39;x<42;x++)grid.data.set([180,180,190,255],((oy+y)*grid.w+ox+x)*4);if(mode==='fail')for(let y=35;y<50;y++)for(let x=45;x<51;x++)grid.data.fill(0,((oy+y)*grid.w+ox+x)*4,((oy+y)*grid.w+ox+x)*4+4)}
  if(mode==='race')current.manifest.rig.pivot.y++
  const hash=await put(grid)
  return{id:'grid',state:'done',endpoint:req.path,params:req.body,requestHash:'grid',createdAt:0,gens:10,usd:0,jobs:[{id:'grid-job',results:[{label:'0',sha:hash}]}]} as unknown as JobRec
 })
 return{ctx,item,body,save,enqueue,saved:()=>saved,current:()=>current}
}
test('96px request uses frozen padded frames, measured wrist masks, protected references and a bounded grid',async()=>{
 const f=await fixture();f.ctx.rec.manifest.rig.animations[0].sources!.west!.keypoints![0][4].x=.95
 const req=await gridRepairRequest(f.ctx,f.item,'slash','west',123),b=req.body as {description:string;inpainting_image:{image:{base64:string};size:{width:number;height:number}};mask_image:{image:{base64:string}}}
 expect(b.inpainting_image.size).toEqual({width:384,height:288});expect(b.description).toContain('96x96');expect(b.description).toContain('right hand');expect(b.description).toContain('exactly one weapon');expect(b.description).not.toContain('empty hands')
 const im=await decodePngBytes(base64ToBytes(b.inpainting_image.image.base64)),mask=await decodePngBytes(base64ToBytes(b.mask_image.image.base64))
 expect(mask.data[(46*384+41)*4]).toBe(255);expect(mask.data[(90*384+90)*4]).toBe(0)
 for(let y=192;y<288;y++)for(let x=0;x<384;x++)expect(mask.data[(y*384+x)*4]).toBe(0)
 const expected=inputCell(padImg(f.body,16),'green');for(let y=0;y<96;y++)expect([...im.data.subarray(y*384*4,(y*384+96)*4)]).toEqual([...expected.data.subarray(y*96*4,(y+1)*96*4)])
 expect(f.enqueue).not.toHaveBeenCalled()
})
test('successful fixed-frame repair retains96px pivot, other directions and idle while linking real grid provenance',async()=>{
 const f=await fixture(),before=structuredClone(f.item),r=await regridClip(f.ctx,f.item,'slash','west',123)
 expect(r.saved).toBe(true);expect(r.qa.failCalls.size).toBe(0);expect(f.enqueue.mock.calls[0][0].path).toBe('/inpaint-v3')
 const item=f.saved()!;expect(item.layers[0].cell).toEqual({w:96,h:96});expect(item.layers[0].pivot).toEqual({x:48,y:76});expect(item.layers[0].cells!.idle).toEqual(before.layers[0].cells!.idle);expect(item.layers[0].cells!.slash!.south).toEqual(before.layers[0].cells!.slash!.south)
 expect(item.layers[0].cells!.slash!.west).toHaveLength(8);expect(item.provenance.at(-1)?.endpoint).toBe('/inpaint-v3');expect(f.ctx.rec.manifest.rig).toEqual(f.current().manifest.rig)
})
test('failed quality keeps old pixels and never calls publication',async()=>{const f=await fixture('fail'),before=structuredClone(f.item),r=await regridClip(f.ctx,f.item,'slash','west',123);expect(r.saved).toBe(false);expect(f.save).not.toHaveBeenCalled();expect(f.item).toEqual(before)})
test.each(['geometry','lost'] as const)('invalid or unknown %s output cannot publish',async mode=>{const f=await fixture(mode);await expect(regridClip(f.ctx,f.item,'slash','west',123)).rejects.toThrow();expect(f.save).not.toHaveBeenCalled()})
test('concurrent rig edits reject inside the atomic publication guard',async()=>{const f=await fixture('race');await expect(regridClip(f.ctx,f.item,'slash','west',123)).rejects.toThrow('changed while');expect(f.saved()).toBeUndefined()})
test('missing actual measurements, excessive canvas and wrong selected frame identities fail before paid enqueue',async()=>{
 const f=await fixture();delete f.ctx.rec.skeletons;delete f.ctx.rec.manifest.rig.animations[0].sources!.west!.measured
 await expect(gridRepairRequest(f.ctx,f.item,'slash','west',1)).rejects.toThrow('measured hand positions')
 for(const cells of [['slash/east/0'],['slash/west/8'],['slash/west/0','slash/west/0']])await expect(gridRepairRequest(f.ctx,f.item,'slash','west',1,cells)).rejects.toThrow('unique existing frames')
 f.ctx.rec.manifest.rig.animations[0].cells=30;await expect(gridRepairRequest(f.ctx,f.item,'slash','west',1)).rejects.toThrow('512')
 expect(f.enqueue).not.toHaveBeenCalled()
})


test('an out-of-cell observed wrist cannot create an empty off-canvas paid mask',async()=>{const f=await fixture();f.ctx.rec.skeletons!['slash/west/0']['RIGHT ARM'].x=1000;await expect(gridRepairRequest(f.ctx,f.item,'slash','west',1)).rejects.toThrow('valid measured hand positions');expect(f.enqueue).not.toHaveBeenCalled()})
