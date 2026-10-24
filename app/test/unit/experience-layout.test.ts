import { describe, expect, test } from 'vitest'
import { actorScale } from '../../src/studio/experience/ground.ts'

describe('immersive stage frame fitting',()=>{
  for(const frame of [{w:96,h:96,x:48,y:80},{w:256,h:256,x:128,y:252},{w:384,h:192,x:300,y:100}]) {
    test(`complete ${frame.w}×${frame.h} frame stays inside a short phone stage`,()=>{
      const area={width:296,height:74}, scale=actorScale(frame,area)
      expect(scale).toBeGreaterThan(0)
      expect(area.width*.5-frame.x*scale).toBeGreaterThanOrEqual(-.001)
      expect(area.width*.5+(frame.w-frame.x)*scale).toBeLessThanOrEqual(area.width+.001)
      expect(area.height*.77-frame.y*scale).toBeGreaterThanOrEqual(-.001)
      expect(area.height*.77+(frame.h-frame.y)*scale).toBeLessThanOrEqual(area.height+.001)
    })
  }
  test('uses integer physical pixel scale when sufficient space exists',()=>{
    const density=1.5,scale=actorScale({w:96,h:96,x:48,y:80},{width:900,height:530},density)
    expect(Number.isInteger(scale*density)).toBe(true)
  })
})
