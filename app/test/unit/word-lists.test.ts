import { expect, test } from 'vitest'
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { smudgedViews } from '../../src/lib/items/items.ts'
import { expectsWaistBand } from '../../src/lib/items/design-consistency.ts'
import { heldSlotFor } from '../../src/studio/model.ts'

const w = 32
const view = (gray: number) => { // a red design with `gray` px of off-white detail
  const im = makeImg(w, w); for (let p = 0; p < 200; p++) im.data.set(p < gray ? [225, 222, 215, 255] : [190, 40, 45, 255], p * 4); return im
}

test('a neutral emblem drawn in every view is design, not a smudge, whatever the prompt calls it', () => {
  const views = [view(18), view(16), view(20)] // a skull emblem: 8-10 % neutral in every view
  expect(smudgedViews('head', 'red pirate hat with a skull emblem', views)).toEqual([false, false, false])
})

test('a gray smudge in one view still fails that view only', () => {
  // T3: the cape hem smudge appeared only from the north
  expect(smudgedViews('back', 'a red cape', [view(0), view(0), view(26)])).toEqual([false, false, true])
  // a single drawn view keeps the single-view rule
  expect(smudgedViews('back', 'a red cape', [view(26), makeImg(w, w) as Img])).toEqual([true, false])
})

test('a negation must modify the belt itself', () => {
  expect(expectsWaistBand('a tunic with no sleeves and a leather belt')).toBe(true)
  expect(expectsWaistBand('a robe without a leather belt')).toBe(false)
  expect(expectsWaistBand('a dress with a silk girdle')).toBe(true)
  expect(expectsWaistBand('no belt')).toBe(false)
})

test('common shield words default to the off hand', () => {
  for (const p of ['a wooden targe', 'a tall pavise', 'round shield', 'longbow']) expect(heldSlotFor(p), p).toBe('off_hand')
  expect(heldSlotFor('steel sword')).toBe('main_hand')
})

test('review cases: two-view items, wider negations and weapon names', () => {
  // a two-view item smudged in both views: one view cannot excuse the other (2026-11-07 review)
  expect(smudgedViews('back', 'a red cape', [view(26), view(26)])).toEqual([true, true])
  for (const p of ['a robe without a wide leather belt', 'a coat without a thick brown leather belt', 'no gold or silver belt', 'a dress with no belts']) expect(expectsWaistBand(p), p).toBe(false)
  for (const p of ['a vest with no buttons, and a belt', 'no hat but a red belt']) expect(expectsWaistBand(p), p).toBe(true)
  for (const p of ['aegis-engraved sword', 'shield-breaker axe', 'spear with an aegis crest']) expect(heldSlotFor(p), p).toBe('main_hand')
})
