import { expect, test } from 'vitest'
import { gridEstimate, packGrid, planGens } from '../../src/lib/items/items.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import { moveEstimate } from '../../src/studio/create.ts'
import type { Manifest } from '../../src/lib/store/manifest.ts'

test.each([
 [{w:64,h:64},8,4,4,{w:256,h:192,gens:10}],
 [{w:96,h:96},8,4,4,{w:384,h:288,gens:15}],
 [{w:96,h:96},16,3,5,{w:480,h:384,gens:25}],
] as const)('estimate uses the actual packed frame and protected-reference canvas', (cell,frames,refs,cols,expected)=>{
 const grid=packGrid(Array(frames+refs).fill(makeImg(cell.w,cell.h)),Array(frames+refs).fill(null),cols)
 const estimate=gridEstimate(cell,frames,refs,cols);expect(estimate).toEqual(expected);expect([estimate.w,estimate.h]).toEqual([grid.image.w,grid.image.h])
})

test('area tiers use explicit catalog square boundaries, with per-side submission limits retained',()=>{
 expect(gridEstimate({w:256,h:256},1,0,1).gens).toBe(10);expect(gridEstimate({w:257,h:256},1,0,1).gens).toBe(15)
 expect(gridEstimate({w:341,h:341},1,0,1).gens).toBe(15);expect(gridEstimate({w:342,h:341},1,0,1).gens).toBe(25)
 expect(gridEstimate({w:512,h:512},1,0,1).gens).toBe(25);expect(()=>gridEstimate({w:513,h:32},1,0,1)).toThrow('512')
})

test('protected references and padded unused cells can increase the quoted tier',()=>{
 expect(gridEstimate({w:96,h:96},4,0).gens).toBe(10);expect(gridEstimate({w:96,h:96},4,1).gens).toBe(15)
 expect(gridEstimate({w:96,h:96},8,4).gens).toBe(15);expect(gridEstimate({w:96,h:96},8,5).gens).toBe(25)
 expect(gridEstimate({w:64,h:64},32,0)).toMatchObject({w:256,h:512});expect(()=>gridEstimate({w:64,h:64},32,1)).toThrow('512')
})

test('invalid frame/reference/dimension counts cannot produce a misleading finite estimate',()=>{
 for(const [cell,frames,refs,cols] of [[{w:64,h:64},0,1,4],[{w:64,h:64},8,-1,4],[{w:64,h:64},8,1.5,4],[{w:NaN,h:64},8,1,4],[{w:64,h:64},8,1,0]] as const)expect(()=>gridEstimate(cell,frames,refs,cols)).toThrow()
})

test('move estimate prices each actual item canvas with only its matching direction reference',()=>{
 const dirs=['south','east','north','west'],dressed=Object.fromEntries(dirs.map(d=>[d,'sha256:reference']))
 const m={rig:{cell:{w:64,h:64},directions:dirs.map(id=>({id}))},items:[{id:'small',layers:[{}],dressed},{id:'sword',layers:[{cell:{w:96,h:96}}],dressed}]} as unknown as Manifest
 expect(moveEstimate(m,{id:'walk',frames:8,items:['sword'],dirs:['north'],itemMethod:'grid'})).toMatchObject({body:0,items:15,gens:15})
 expect(moveEstimate(m,{id:'walk',frames:8,items:['small','sword'],dirs:['north','south'],itemMethod:'grid'}).items).toBe(50)
 m.items[1].dressed!['north-east']='sha256:extra';expect(moveEstimate(m,{id:'walk',frames:8,items:['sword'],dirs:['north'],itemMethod:'grid'}).items).toBe(15)
})

test('fallback plan costs include one matching reference and keep normal pose/edit estimates unchanged',()=>{
 const plan=[{kind:'dress' as const,cells:['rest/south/0','rest/east/0','rest/north/0','rest/west/0']},{kind:'grid' as const,cells:Array.from({length:8},(_,i)=>`slash/north/${i}`)}]
 expect(planGens(plan)).toBe(20);expect(planGens(plan,{w:96,h:96})).toBe(25)
 expect(planGens([{kind:'pose',cells:Array(8).fill('slash/north/0')},{kind:'edit',cells:['idle/south/0']}])).toBe(13)
})
