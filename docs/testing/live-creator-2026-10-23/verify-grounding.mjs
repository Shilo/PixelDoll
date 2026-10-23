import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { unzip } from '../../../app/src/lib/store/zip.ts'
import { decodePngBytes, encodePngBytes } from '../../../app/src/lib/image/pngraw.ts'
import { makeImg } from '../../../app/src/lib/image/png.ts'
import { feetY } from '../../../app/src/lib/rig/normalize.ts'
import { ARMS } from '../../../app/src/lib/rig/poses.ts'
// Offline experiment only. Pass an evidence directory outside Git; never changes a saved project.
const root=process.argv[2]
assert(root, 'Pass the local evidence directory')
const zip=await unzip(new Uint8Array(await readFile(`${root}/L04-output.pixeldoll.zip`)))
const p=JSON.parse(new TextDecoder().decode(zip.get('project.json'))), m=p.manifest, size=m.rig.cell.w
const load=hash=>decodePngBytes(zip.get(`cells/${hash.slice(7)}.png`))
const offsets={}, rows=[], before=makeImg(size*8,size*2), after=makeImg(size*8,size*2)
// Exhaust all useful integer translations. The geometric median lies within the joint-error bounding box.
const west=m.rig.animations.find(a=>a.id==='walk').sources.west
const armResidual=west.measured.map((pose,i)=>{
 const errors=ARMS.map(label=>{const r=west.keypoints[i].find(k=>k.label===label),g=pose.find(k=>k.label===label);return[(r.x-g.x)*size,(r.y-g.y)*size]})
 let best=Infinity
 for(let dx=Math.floor(Math.min(...errors.map(p=>p[0])));dx<=Math.ceil(Math.max(...errors.map(p=>p[0])));dx++)for(let dy=Math.floor(Math.min(...errors.map(p=>p[1])));dy<=Math.ceil(Math.max(...errors.map(p=>p[1])));dy++)best=Math.min(best,errors.reduce((sum,p)=>sum+Math.hypot(p[0]-dx,p[1]-dy),0)/errors.length)
 return best
}).reduce((a,b)=>a+b,0)/west.measured.length
assert(armResidual>2,'No rigid integer translation resolves the saved arm-pose failure')
for(const [column,d] of m.rig.directions.entries()) {
 const idle=await load(m.items[0].layers[0].cells.idle[d.id][0]), dy=m.rig.pivot.y-feetY(idle); offsets[d.id]=dy
 for(const a of m.rig.animations) {
  const hashes=m.items[0].layers[0].cells[a.id][d.id], oldBottom=[], newBottom=[]
  for(const [i,hash] of hashes.entries()) {
   const src=await load(hash), dst=makeImg(size,size)
   for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const at=(y*size+x)*4
    if(!src.data[at+3])continue
    assert(y+dy>=0&&y+dy<size,'Never clip an opaque pixel')
    dst.data.set(src.data.subarray(at,at+4),((y+dy)*size+x)*4)
    assert.deepEqual(dst.data.subarray(((y+dy)*size+x)*4,((y+dy)*size+x)*4+4),src.data.subarray(at,at+4))
   }
   oldBottom.push(feetY(src));newBottom.push(feetY(dst))
   for(const k of Object.values(p.skeletons[`${a.id}/${d.id}/${i}`]))assert(k.y+dy>=0&&k.y+dy<=size,'Transformed skeleton stays in frame')
   const poses=a.sources[d.id]
   for(const field of ['keypoints','measured']) for(const k of poses[field][i])assert(k.y*size+dy>=0&&k.y*size+dy<=size,'Both pose tracks transform in bounds')
   if(i===0)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const target=((y+(a.id==='walk'?size:0))*before.w+x+column*size)*4,at=(y*size+x)*4
    before.data.set(src.data.subarray(at,at+4),target);after.data.set(dst.data.subarray(at,at+4),target)
   }
  }
  assert.equal(Math.max(...oldBottom)-Math.min(...oldBottom),Math.max(...newBottom)-Math.min(...newBottom),'Stride range must not change')
  rows.push({clip:`${a.id}/${d.id}`,shiftY:dy,before:oldBottom,after:newBottom})
 }
 const rest=await load(m.rig.rest[d.id].image)
 assert(feetY(rest)+dy===m.rig.pivot.y,'Original standing ground also aligns')
}
await writeFile(`${root}/grounding-before.png`,await encodePngBytes(before))
await writeFile(`${root}/grounding-after.png`,await encodePngBytes(after))
const report={scope:'Offline preview only; saved projects untouched',offsets,rows,bestIntegerArmResidual:+armResidual.toFixed(2),pixelClipping:0,pixelRepainting:0,credits:0}
await writeFile(`${root}/grounding-proof.json`,JSON.stringify(report,null,2))
console.log(JSON.stringify({...report,rows:rows.length,strideRangesPreserved:true}))
