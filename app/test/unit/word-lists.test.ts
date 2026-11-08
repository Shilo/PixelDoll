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
  expect(smudgedViews('back', 'a red cape', [view(0), view(0), view(26)])).toEqual([false, false, 'smudge'])
  // a single drawn view keeps the single-view rule
  expect(smudgedViews('back', 'a red cape', [view(26), makeImg(w, w) as Img])).toEqual(['smudge', false])
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
  expect(smudgedViews('back', 'a red cape', [view(26), view(26)])).toEqual(['smudge', 'smudge'])
  for (const p of ['a robe without a wide leather belt', 'a coat without a thick brown leather belt', 'no gold or silver belt', 'a dress with no belts']) expect(expectsWaistBand(p), p).toBe(false)
  for (const p of ['a vest with no buttons, and a belt', 'no hat but a red belt']) expect(expectsWaistBand(p), p).toBe(true)
  for (const p of ['aegis-engraved sword', 'shield-breaker axe', 'spear with an aegis crest']) expect(heldSlotFor(p), p).toBe('main_hand')
})

test('review R5 and R6: counts keep the noun, and decorations do not move the item to the other hand', async () => {
  const { itemNameFrom } = await import('../../src/studio/model.ts')
  expect(itemNameFrom('a pair of leather boots')).toBe('Leather boots')
  expect(itemNameFrom('the pair of leather gloves')).toBe('Leather gloves')
  expect(itemNameFrom('pair of leather boots')).toBe('Leather boots')
  expect(itemNameFrom('iron lantern hanging from a short chain')).toBe('Iron lantern')
  for (const p of ['a steel sword with a scutum emblem', 'a battle axe with a shield-shaped guard', 'a mace decorated with a bow']) expect(heldSlotFor(p), p).toBe('main_hand')
  for (const p of ['a scutum', 'a round wooden shield with a lion emblem', 'a wooden longbow with a leather grip']) expect(heldSlotFor(p), p).toBe('off_hand')
})

test('review R3: a dark detail on one side is reported as uncertain, a gray smudge still as a smudge', async () => {
  const { plainReason } = await import('../../src/studio/model.ts')
  const tunic = (patch?: number[]) => { // a blue tunic, optionally with a 9 x 9 patch
    const im = makeImg(w, w)
    for (let y = 4; y < 28; y++) for (let x = 6; x < 26; x++) im.data.set([40, 80, 200, 255], (y * w + x) * 4)
    if (patch) for (let y = 10; y < 19; y++) for (let x = 11; x < 20; x++) im.data.set([...patch, 255], (y * w + x) * 4)
    return im
  }
  const CHARCOAL = [20, 20, 20], ASH = [150, 150, 150]
  // a charcoal medallion on the front only: uncertain, not a smudge
  expect(smudgedViews('torso_outer', 'a blue tunic with a charcoal medallion on the front', [tunic(CHARCOAL), tunic(), tunic()])).toEqual(['dark', false, false])
  // the same medallion in every view passes
  expect(smudgedViews('torso_outer', 'a blue tunic with a charcoal medallion', [tunic(CHARCOAL), tunic(CHARCOAL), tunic(CHARCOAL)])).toEqual([false, false, false])
  // an unrequested dark patch is still reported, as uncertain
  expect(smudgedViews('torso_outer', 'a blue tunic', [tunic(CHARCOAL), tunic(), tunic()])).toEqual(['dark', false, false])
  // a gray patch in one view stays a smudge
  expect(smudgedViews('torso_outer', 'a blue tunic', [tunic(ASH), tunic(), tunic()])).toEqual(['smudge', false, false])
  expect(plainReason('D1 keyframe rest/south/0: a dark patch not seen in the other views, possibly not part of the design')).toBe('A dark patch is not seen in the other views; check that it is part of the design')
})

test('review round 2: color pairs and adjective lists keep shields in the off hand; "of" names keep their meaning', async () => {
  const { itemNameFrom } = await import('../../src/studio/model.ts')
  for (const p of ['a black and gold kite shield', 'a red and white round shield', 'a large, round wooden shield', 'a sturdy, iron-banded wooden shield', 'a golden, ornate buckler', 'a shield of the realm', 'a pair of shields', 'a pair of bucklers']) expect(heldSlotFor(p), p).toBe('off_hand')
  for (const p of ['a steel sword with a scutum emblem', 'a sword of the shield guard', 'a two-handed sword', 'a mace engraved with a bow']) expect(heldSlotFor(p), p).toBe('main_hand')
  for (const [desc, name] of [['a cloak of shadows', 'Cloak of shadows'], ['a ring of power', 'Ring of power'], ['boots of speed', 'Boots of speed'], ['a set of throwing knives', 'Throwing knives'], ['pairs of iron gauntlets', 'Iron gauntlets'], ['a sword of a thousand truths', 'Sword'], ['an iron lantern hanging from a short chain', 'Iron lantern']]) expect(itemNameFrom(desc), desc).toBe(name)
})
