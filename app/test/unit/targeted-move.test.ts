import { afterEach, expect, test, vi } from 'vitest'
import { addMove, moveDirections, moveEstimate } from '../../src/studio/create.ts'
import { queue, type JobRec } from '../../src/lib/pixellab/queue.ts'
import * as db from '../../src/lib/store/db.ts'
import * as projects from '../../src/lib/store/project.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import { encodePngBytes } from '../../src/lib/image/pngraw.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import { cellHash, type Keypoint, type DirectionName } from '../../src/lib/rig/rig.ts'
import type { Manifest } from '../../src/lib/store/manifest.ts'
afterEach(()=>vi.restoreAllMocks())
async function fixture(fail=false){
 const dirs:DirectionName[]=['south','east','north','west'], im=makeImg(64,64)
 for(let y=10;y<60;y++)for(let x=25;x<39;x++)im.data.set([180,140,120,255],(y*64+x)*4)
 const hash=await cellHash(im), points:Keypoint[]=LABELS.map((label,i)=>({label,x:.3+i*.01,y:.3+i*.015}))
 const rig:Manifest['rig']={cell:{w:64,h:64},pivot:{x:32,y:60},baseHash:hash,baseItem:'base',directions:dirs.map(id=>({id})),animations:[{id:'idle',cells:4,loop:true,frames:[0,1,2,3].map(cell=>({cell,ms:100})),sources:Object.fromEntries(dirs.map(d=>[d,{route:'skeleton-v3',reference:hash,keypoints:[points,points,points,points],measured:[points,points,points,points],motion:'old',provenance:[]}]))}],rest:Object.fromEntries(dirs.map(d=>[d,{image:hash,keypoints:points}])),anchors:{hand_r:{idle:Object.fromEntries(dirs.map(d=>[d,Array.from({length:4},()=>[3,4])]))}}}
 const cells={idle:Object.fromEntries(dirs.map(d=>[d,[hash,hash,hash,hash]]))}
 const manifest:Manifest={format:'pixeldoll/1',name:'Test',app:'',rig,slots:[],materials:[],presets:[],items:[{id:'base',name:'Body',slot:'body',status:'accepted',mirror:'generate',prompt:'body',materials:[],baseHash:hash,provenance:[],layers:[{id:'main',role:'fg',z:0,cells:structuredClone(cells)}]},{id:'hat',name:'Hat',slot:'head',status:'accepted',mirror:'generate',prompt:'hat',materials:[],baseHash:hash,provenance:[],layers:[{id:'main',role:'fg',z:10,cells:structuredClone(cells)}]}]}
 let saved:projects.StoredProject={id:'rig-target',savedAt:'original',manifest,character:{id:'managed',looks:'body'},skeletons:Object.fromEntries(dirs.flatMap(d=>[0,1,2,3].map(i=>[`idle/${d}/${i}`,{NOSE:{x:3,y:4,z:0}}]))),rigQa:{warnings:['idle/east: old failure','idle/south: retained'],clips:Object.fromEntries(dirs.map(d=>[`idle/${d}`,{adherence:1,feetDrift:0,paletteFit:1,border:0,stray:0,fails:[]}]))}}
 const original=structuredClone(saved),blobs=new Map<string,Blob>();let requested:Keypoint[][]=[]
 vi.spyOn(projects,'loadProject').mockImplementation(async()=>{const rec=structuredClone(saved);return{rec,project:{manifest:rec.manifest,images:new Map([[hash,im]])}}})
 vi.spyOn(db,'updateCharacter').mockImplementation(async(_id,_blobs,change)=>{saved=change(structuredClone(saved)) as projects.StoredProject});
 vi.spyOn(db,'get').mockImplementation(async()=>structuredClone(saved));vi.spyOn(db,'getBlob').mockImplementation(async h=>blobs.get(h))
 const put=vi.spyOn(db,'put').mockResolvedValue(undefined),update=vi.spyOn(db,'update').mockImplementation(async(_s,_id,change)=>{saved=change(structuredClone(saved)) as projects.StoredProject})
 const enqueue=vi.spyOn(queue,'enqueue').mockImplementation(async req=>{
  if(req.path==='/animate-with-skeleton-v3'){
   requested=(req.body as {keypoints:Keypoint[][]}).keypoints
   const outputs=await Promise.all(requested.map(async(_,i)=>{const image=structuredClone(im);image.data[(10*64+25)*4]=180+i;const sha='frame-'+i;blobs.set(sha,new Blob([(await encodePngBytes(image)) as Uint8Array<ArrayBuffer>],{type:'image/png'}));return{label:String(i),sha}}))
   return{id:'raw',state:'done',endpoint:req.path,params:req.body,requestHash:'raw',createdAt:0,gens:3,usd:0,jobs:[{id:'job',results:outputs}]} as unknown as JobRec
  }
  if(req.path==='/estimate-skeleton')return{state:'done',response:{keypoints:requested[0].map(p=>({...p,x:p.x+(fail&&p.label.includes('ARM')?.3:0)}))},jobs:[]} as unknown as JobRec
  throw Error('Unexpected route')
 })
 return{saved:()=>saved,original,enqueue,put,update,run:(change:Record<string,unknown>={})=>addMove('rig-target',{id:'idle',action:'idle',frames:4,items:[],seed:23,replace:true,poseStyle:'visible-side-v1',dirs:['east'],...change})}
}
test('targeted replacement preserves every unselected body/item/pose row and clears only stale target diagnostics',async()=>{
 const f=await fixture();await f.run();const next=f.saved(),before=f.original
 expect(f.enqueue.mock.calls.filter(([r])=>r.path==='/animate-with-skeleton-v3')).toHaveLength(1)
 expect((f.enqueue.mock.calls[0][0].body as {direction:string;action:string}).direction).toBe('east');expect((f.enqueue.mock.calls[0][0].body as {action:string}).action).toContain('no weapon')
 for(const d of ['south','north','west'] as const){expect(next.manifest.items[0].layers[0].cells!.idle![d]).toEqual(before.manifest.items[0].layers[0].cells!.idle![d]);expect(next.manifest.items[1].layers[0].cells!.idle![d]).toEqual(before.manifest.items[1].layers[0].cells!.idle![d]);expect(next.manifest.rig.animations[0].sources![d]).toEqual(before.manifest.rig.animations[0].sources![d]);expect(next.manifest.rig.anchors!.hand_r!.idle![d]).toEqual(before.manifest.rig.anchors!.hand_r!.idle![d]);expect(next.skeletons![`idle/${d}/0`]).toEqual(before.skeletons![`idle/${d}/0`])}
 expect(next.manifest.items[1].layers[0].cells!.idle!.east).toBeUndefined();expect((next.rigQa as {warnings:string[]}).warnings).toEqual(['idle/south: retained'])
})

test('regeneration keeps explicit play-once preferences, including choices changed during frame publication', async () => {
 const f = await fixture()
 f.saved().manifest.rig.animations[0].loop = false
 await f.run()
 expect(f.saved().manifest.rig.animations[0].loop).toBe(false)
 vi.restoreAllMocks()
 const g = await fixture(), m = g.saved().manifest
 m.rig.animations.push({ ...structuredClone(m.rig.animations[0]), id: 'cast' })
 for (const item of m.items) item.layers[0].cells!.cast = structuredClone(item.layers[0].cells!.idle)
 g.put.mockImplementation(async store => { if (store === 'blobs') for (const animation of g.saved().manifest.rig.animations) animation.loop = false })
 await g.run()
 expect(g.saved().manifest.rig.animations.map(a => [a.id, a.loop])).toEqual([['idle', false], ['cast', false]])
})
test('failed genuine measurements cannot publish a targeted replacement or invalidate prior equipment',async()=>{const f=await fixture(true);await expect(f.run()).rejects.toThrow('still fails body-pose');expect(f.put).not.toHaveBeenCalled();expect(f.update).not.toHaveBeenCalled();expect(f.saved()).toEqual(f.original)})
test('invalid subset, new partial move and changed partial frame count are rejected before spending',async()=>{for(const change of [{dirs:[]},{dirs:['east','east']},{dirs:['bad']},{id:'cast',dirs:['east']},{action:'slash'}]){const f=await fixture();await expect(f.run(change)).rejects.toThrow();expect(f.enqueue).not.toHaveBeenCalled();vi.restoreAllMocks()}})
test('selected direction costs distinguish body replacement from frozen-frame equipment repair',async()=>{const f=await fixture(),m=f.original.manifest;expect(moveDirections(m,['west','east'])).toEqual(['east','west']);expect(moveEstimate(m,{action:'idle',frames:4,items:['hat'],dirs:['east','west']}).gens).toBeCloseTo(12.8);expect(moveEstimate(m,{action:'idle',frames:4,items:['hat'],dirs:['west'],itemMethod:'grid'})).toMatchObject({body:0,items:10,gens:10})})
