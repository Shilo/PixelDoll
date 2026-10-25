import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { report, runBench } from '../../scripts/bench.ts'
import { keyScore, KT } from '../../src/lib/image/chroma.ts'

// The item-pipeline benchmark (scripts/bench.ts) on the frozen real-output corpus. A change to extraction, cleanup or QA that
// moves any number must regenerate docs/testing/bench.md (`npm run bench -- --write`) so the change is reviewed, and the defects
// fixed on 2026-10-25 must stay fixed.
const { cases, results } = await runBench()
const byId = (id: string) => results.find((r) => r.id === id)!
const share = ([hit, n]: [number, number]) => hit / n

test('docs/testing/bench.md matches the current pipeline', async () => {
  expect(await report(results, cases)).toBe(readFileSync(new URL('../../../docs/testing/bench.md', import.meta.url), 'utf8'))
})

test('every clip meets its documented verdict', () => {
  expect(results.flatMap((r) => r.misses.map((m) => `${r.id} ${m}`))).toEqual([])
})

test('fixed defects stay fixed', () => {
  expect(share(byId('a-sword96').keep)).toBeGreaterThan(0.85) // pommels (0.21 before the cleanup-order fix)
  expect(share(byId('a-axe96').keep)).toBeGreaterThan(0.85) // haft ends (0.65 before)
  expect(share(byId('a-jester-blue').keepExact)).toBe(1) // the blue key keeps the pink exactly
  expect(share(byId('b-jester-blue').keepExact)).toBe(1)
  expect(byId('a-helmet').drop[0]).toBe(0) // swords invented by slash poses never ship in a helmet layer
  expect(share(byId('a-stripes-azure').keepExact)).toBe(1) // azure keeps green + purple (magenta kept 1.3 % of the purple)
  expect(byId('n-cloak128').fails).toBe(1) // 128 px body: 6 fails at a fixed 1 px posed tolerance, 1 real at the scaled one
  // round 3 baseCut: ear tips erased under a hood or helm are hidden (G2 failed on them), and nothing else is
  for (const id of ['b-cloak', 'b-greathelm', 'c-greathelm']) expect(byId(id).fails, id).toBe(0)
  expect(byId('c-greathelm').cut).toBeGreaterThan(0)
  for (const r of results) if (!['b-cloak', 'b-greathelm', 'c-greathelm'].includes(r.id)) expect(r.cut, r.id).toBe(0) // legs drifting next to the 128 px cape, held weapons
  expect(share(byId('a-plume-azure').keepExact)).toBe(1) // steel stays gray on azure (the luminance snap made it purple)
  // grip holes: stand-in px off the body, next to the bow, left transparent (closeGrip fills them: 30 without it on this seed)
  const holes = byId('a-bow96').cells.filter((c) => c.posed).reduce((n, c) => {
    const w = c.base.w, o = c.out.data, near = (x: number, y: number) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < w && c.mask[Y * w + X]) return true } return false }
    for (let p = 0; p < c.mask.length; p++) if (!c.base.data[p * 4 + 3] && !c.mask[p] && o[p * 4 + 3] >= 128 && keyScore('green', o[p * 4], o[p * 4 + 1], o[p * 4 + 2]) >= KT && near(p % w, (p / w) | 0)) n++
    return n
  }, 0)
  expect(holes).toBeLessThanOrEqual(26)
})
