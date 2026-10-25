import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { report, runBench } from '../../scripts/bench.ts'

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
})
