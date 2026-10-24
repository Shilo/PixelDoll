import { afterEach, expect, test, vi } from 'vitest'
import { poseItemClip, type RigCtx } from '../../src/lib/items/run.ts'
import { queue, type JobRec } from '../../src/lib/pixellab/queue.ts'
import * as db from '../../src/lib/store/db.ts'
import * as store from '../../src/lib/store/project.ts'
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { encodePngBytes } from '../../src/lib/image/pngraw.ts'
import { sha256 } from '../../src/lib/image/hash.ts'
import { cellHash, type Keypoint, type Rig } from '../../src/lib/rig/rig.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import { inputCell, padImg, packGrid } from '../../src/lib/items/items.ts'
import type { Item, Manifest } from '../../src/lib/store/manifest.ts'

afterEach(() => vi.restoreAllMocks())
type Mode = 'clean' | 'damaged' | 'worse' | 'count' | 'geometry' | 'lost' | 'canceled' | 'abort'
async function fixture(modes: Mode[], directions: ('south' | 'west')[] = ['west'], held = true) {
  const pad=held?16:0, canvas=64+2*pad
  const base = makeImg(64, 64)
  for (let y = 10; y < 60; y++) for (let x = 24; x < 40; x++) base.data.set([170, 120, 90, 255], (y * 64 + x) * 4)
  const hash = await cellHash(base), rest: Keypoint[] = LABELS.map(label => ({ label, x: (label === 'RIGHT ARM' ? 25 : label === 'LEFT ARM' ? 38 : 32) / 64, y: 30 / 64 }))
  const rig: Rig = { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, baseHash: hash, baseItem: 'base', directions: directions.map(id => ({ id })), animations: [{ id: 'walk', cells: 4, loop: true, frames: [0,1,2,3].map(cell => ({ cell, ms: 100 })), sources: {} }], rest: {} }
  for (const d of directions) { rig.rest![d] = { image: hash, keypoints: rest }; rig.animations[0].sources![d] = { route: 'skeleton-v3', reference: hash, keypoints: Array.from({length:4}, () => rest), provenance: [] } }
  const blobs = new Map<string, Blob>(), seen: JobRec[] = [], counts = new Map<string, number>()
  const putImage = async (im: Img) => { const bytes = await encodePngBytes(im), sha = await sha256(bytes); blobs.set(sha, new Blob([bytes as Uint8Array<ArrayBuffer>], {type:'image/png'})); return sha }
  function output(mode: Mode, attempt: number) {
    if (mode === 'geometry') return makeImg(32, 32)
    const im = inputCell(padImg(base, pad), 'green')
    // Stable synthetic weapon touches the right wrist; damage is measured by real G2/G7, not mocked QA counts.
    for (let y = 30 + pad; y < 51 + pad; y++) for (let x = (mode === 'worse' ? 0 : 21 + pad); x < 26 + pad; x++) im.data.set([210, 40 + attempt * 20, 40, 255], (y * canvas + x) * 4)
    if (mode !== 'clean') for (let y = 20 + pad; y < 32 + pad; y++) for (let x = 29 + pad; x < 35 + pad; x++) im.data.fill(0, (y * canvas + x) * 4, (y * canvas + x) * 4 + 4)
    return im
  }
  const dressed = await putImage(output('clean', 0))
  const item: Item = { id: 'sword', name: 'Sword', slot: held?'main_hand':'back', status: 'accepted', mirror: 'generate', key: 'green', route: 'skeleton-pose', prompt: 'red short blade', materials: [], provenance: [], baseHash: hash, dressed: Object.fromEntries(directions.map(d => [d, `sha256:${dressed}`])), layers: [{ id: 'fg', role: 'fg', z: 150, cell: {w:canvas,h:canvas}, pivot: {x:32+pad,y:60+pad}, cells: {} }, { id: 'bg', role: 'bg', z: 1, cell: {w:canvas,h:canvas}, pivot: {x:32+pad,y:60+pad}, cells: {} }], qa: { status:'pass', minKeyKept:1, maxKeyOutside:0, minAreaRatio:1, maxAreaCV:0, maxPaletteDist:0, clipPx:0, rerolls:7, cells:{}, clips:{} } }
  const manifest: Manifest = { format:'pixeldoll/1', app:'test', name:'Synthetic', rig, slots:[], materials:[], presets:[], items:[{ ...item, id:'base', slot:'body', dressed:undefined, layers:[{id:'main',role:'fg',z:10,cells:{walk:Object.fromEntries(directions.map(d=>[d,[hash,hash,hash,hash]]))}}]}, item] }
  const ctx: RigCtx = {rec:{id:'rig-selection',manifest,savedAt:'original'},project:{manifest,images:new Map([[hash,base]])}}
  vi.spyOn(db,'getBlob').mockImplementation(async sha => blobs.get(sha))
  const save = vi.spyOn(store,'saveItem').mockResolvedValue()
  vi.spyOn(queue,'enqueue').mockImplementation(async req => {
    if(req.path==='/inpaint-v3'){
      const raw=await putImage(packGrid([...Array.from({length:4},()=>output(modes[2]??'clean',2)),output('clean',0)],Array(5).fill(null)).image)
      const record={id:'grid',endpoint:req.path,method:req.method,params:req.body,requestHash:'grid',createdAt:0,gens:10,usd:0,state:'done',jobs:[{id:'job-grid',results:[{label:'0',sha:raw}]}]} as unknown as JobRec
      seen.push(record);return record
    }
    const dir = (req.body as {direction:string}).direction, attempt = counts.get(dir) ?? 0; counts.set(dir,attempt+1)
    const mode = modes[attempt]
    if(mode==='abort') throw new DOMException('Synthetic canceled flow','AbortError')
    const raw = await putImage(output(mode,attempt))
    const record = { id:`${dir}-${attempt}`, endpoint:req.path, method:req.method, params:req.body, requestHash:`${dir}-${attempt}`, createdAt:0, gens:3, usd:0, state:mode==='lost'||mode==='canceled'?mode:'done', error:mode, jobs:[{id:`job-${dir}-${attempt}`, results:Array.from({length:mode==='count'?3:4},(_,i)=>({label:String(i),sha:raw}))}] } as unknown as JobRec
    seen.push(record); return record
  })
  return { run:()=>poseItemClip(ctx,item,'walk'), save, seen, counts, item, output, saved:()=>save.mock.calls.at(-1)![1] }
}
const selected = (item:Item) => item.provenance.map(p=>p.jobId)

// Border contact is a review note, not proof of clipping; equal hard-failure counts keep the first candidate.
test.each([{modes:['damaged','worse'], winner:0},{modes:['damaged','damaged'],winner:0},{modes:['damaged','clean'],winner:1},{modes:['worse','damaged'],winner:0}] as const)('keeps strictly better complete cells with matching provenance, preserving first on tie: %o', async ({modes,winner}) => {
  const f = await fixture([...modes]), q = await f.run(), saved = f.saved()
  expect(f.seen).toHaveLength(2); expect(f.save).toHaveBeenCalledOnce()
  expect(selected(saved)).toEqual([`job-west-${winner}`])
  expect(Object.values(saved.qa!.cells).every(c=>saved.provenance[c.provenance!].jobId===`job-west-${winner}`)).toBe(true)
  expect(q.qa.rerolls).toBe(1); expect(saved.qa!.rerolls).toBe(8)
  const images = f.save.mock.calls.at(-1)![2]
  const contains = (green:number) => [...images.values()].some(im=>{for(let p=0;p<im.data.length;p+=4)if(im.data[p]===210&&im.data[p+1]===green&&im.data[p+2]===40&&im.data[p+3])return true;return false})
  expect(contains(40+winner*20)).toBe(true); expect(contains(40+(1-winner)*20)).toBe(false)
  if(modes[winner]==='clean') expect(q.qa.status).toBe('pass'); else expect(q.qa.status).toBe('fail')
})

test.each(['count','geometry'] as const)('malformed later %s cannot displace the first complete candidate or reset retry history', async malformed => {
  const f=await fixture(['damaged',malformed]); const q=await f.run()
  expect(selected(f.saved())).toEqual(['job-west-0']); expect(q.qa.rerolls).toBe(1)
})

test.each(['count','geometry'] as const)('malformed first %s is never promoted and the complete second candidate may win', async malformed => {
  const f=await fixture([malformed,'clean']); await f.run()
  expect(selected(f.saved())).toEqual(['job-west-1']); expect(f.saved().qa!.rerolls).toBe(8)
})

test('two malformed responses publish no partial direction',async()=>{
  const f=await fixture(['count','geometry']); await expect(f.run()).rejects.toThrow('missing or malformed frames twice'); expect(f.save).not.toHaveBeenCalled()
})

test.each(['lost','canceled'] as const)('a later %s outcome still stops publication instead of silently falling back',async state=>{
  const f=await fixture(['damaged',state]); await expect(f.run()).rejects.toThrow(state); expect(f.save).not.toHaveBeenCalled(); expect(f.seen).toHaveLength(2)
})

test('retry history counts actual additional calls across directions rather than selected attempt indices',async()=>{
  const f=await fixture(['damaged','worse'],['south','west']),q=await f.run()
  expect(f.seen).toHaveLength(4); expect(selected(f.saved()).sort()).toEqual(['job-south-0','job-west-0'])
  expect(q.qa.rerolls).toBe(2); expect(f.saved().qa!.rerolls).toBe(9)
})

test('clean first attempt does not spend a needless retry or increment history',async()=>{
  const f=await fixture(['clean']);const q=await f.run()
  expect(f.seen).toHaveLength(1);expect(q.qa.rerolls).toBe(0);expect(f.saved().qa!.rerolls).toBe(7)
})


test('AbortError during an optional retry propagates without publishing the earlier candidate',async()=>{
  const f=await fixture(['damaged','abort']);await expect(f.run()).rejects.toMatchObject({name:'AbortError'})
  expect(f.save).not.toHaveBeenCalled();expect(f.counts.get('west')).toBe(2)
})


test('grid fallback counts its attempted call even when tied and the first raw pixels remain selected',async()=>{
  const f=await fixture(['damaged','worse','damaged'],['west'],false),q=await f.run()
  expect(f.seen).toHaveLength(3);expect(selected(f.saved())).toEqual(['job-west-0'])
  expect(q.qa.rerolls).toBe(2);expect(f.saved().qa!.rerolls).toBe(9)
})
