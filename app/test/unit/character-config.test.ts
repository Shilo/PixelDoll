import { expect, test } from 'vitest'
import { autoFrame, draftErrors, facingErrors, facingOf, newCharacterDraft, PRESETS, presetOf, readPrompt, setPreset, toggleDirection, toggleMirror, UNSET, writeDetails, writeTrait } from '../../src/studio/characterConfig.ts'
import { BASE_BODY } from '../../src/studio/model.ts'
import { DIRECTIONS } from '../../src/lib/rig/rig.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import { skeletonInput, unpadSkeleton } from '../../src/lib/rig/estimate.ts'
import { buildRig } from '../../src/lib/rig/freeze.ts'
import { flipH } from '../../src/lib/rig/mirror.ts'
import { padOf } from '../../src/lib/items/items.ts'

test.each(PRESETS)('$label selects a valid, independent mirror plan', preset => {
  const d = newCharacterDraft(); setPreset(d, preset.id)
  expect(facingErrors(facingOf(d))).toEqual([])
  expect(presetOf(d)).toBe(preset.id)
  expect(d.view).toBe(preset.view)
})
test('mirrors reverse atomically and deleting a source promotes the surviving view', () => {
  const d = newCharacterDraft()
  toggleMirror(d, 'east')
  expect(d.mirrors.east).toBe('west'); expect(d.mirrors.west).toBeUndefined()
  expect(toggleDirection(d, 'west')).toBe('E now uses its own view.')
  expect(d.selected).toContain('east'); expect(d.mirrors.east).toBeUndefined()
  toggleMirror(d, 'west')
  expect(d.selected).toContain('west'); expect(d.mirrors.west).toBe('east')
  toggleMirror(d, 'north'); expect(d.mirrors.north).toBeUndefined()
})
test('mixed direction operations cannot create dangling or cyclic mirrors', () => {
  const d = newCharacterDraft()
  for (let i = 0; i < 512; i++) {
    const dir = DIRECTIONS[(i * 13 + Math.floor(i / 9)) % 8]
    if (i % 3) toggleMirror(d, dir); else toggleDirection(d, dir)
    expect(facingErrors(facingOf(d))).toEqual(d.selected.length ? [] : ['Choose at least one direction.'])
  }
  expect(facingErrors([{ id: 'west', mirrorOf: 'east' }, { id: 'east', mirrorOf: 'west' }])).not.toEqual([])
})
test('raw prompts are lossless and prose is never guessed as a trait', () => {
  const d = newCharacterDraft(), text = 'Not an elf. No pale skin.\n\nKind: Elf\nBuild: Broad\n  keep this  \n'
  readPrompt(d, text)
  expect(d.prompt).toBe(text); expect(d.kind).toBe('Elf'); expect(d.skin).toBe(UNSET)
  expect(d.details).toBe('Not an elf. No pale skin.\n\n  keep this')
  writeTrait(d, 'build', 'Rounded')
  expect(d.prompt).toBe(text.replace('Build: Broad', 'Build: Rounded'))
  writeTrait(d, 'kind', UNSET); expect(d.prompt).not.toContain('Kind: Elf')
  expect(d.prompt).toContain('Not an elf. No pale skin.')
})
test('conflicting trait lines remain editable prose until explicitly replaced', () => {
  const d = newCharacterDraft()
  readPrompt(d, 'Kind: Elf\nKind: Orc\nSkin: Pale')
  expect(d.kind).toBe(UNSET); expect(d.details).toContain('Kind: Orc')
  writeTrait(d, 'kind', 'Human')
  expect(d.prompt).toBe('Kind: Human\nSkin: Pale')
  writeDetails(d, 'A friendly face')
  expect(d.prompt).toBe('A friendly face\nKind: Human\nSkin: Pale')
})

test('canonical trait lines entered in Details synchronize immediately and survive subsequent trait edits', () => {
  const d = newCharacterDraft()
  writeDetails(d, 'Kind: Elf\nBuild: Broad\nA friendly face')
  expect(d.kind).toBe('Elf'); expect(d.build).toBe('Broad'); expect(d.details).toBe('A friendly face')
  const before = d.prompt
  writeTrait(d, 'skin', 'Pale')
  expect(d.details).toBe('A friendly face'); expect(d.prompt).toContain(before.split('\n')[0])
  expect(d.prompt.match(/Kind: Elf/g)).toHaveLength(1)
})

test('Details preserves intermediate whitespace during normal multiword typing', () => {
  const d = newCharacterDraft(), text = 'A freckled elf\n\nWith a kind face '
  for (let i = 1; i <= text.length; i++) {
    writeDetails(d, text.slice(0, i))
    expect(d.details).toBe(text.slice(0, i))
  }
})
test('details and traits produce one exact prompt without accumulating base hints', () => {
  const d = newCharacterDraft(); expect(draftErrors(d)).toEqual([])
  readPrompt(d, ''); expect(draftErrors(d)).toContain('Enter a character prompt.')
  readPrompt(d, BASE_BODY); writeDetails(d, 'freckled dwarf'); writeTrait(d, 'kind', 'Dwarf'); writeDetails(d, 'elderly dwarf')
  expect(d.prompt).toBe(`elderly dwarf\nKind: Dwarf\n${BASE_BODY}`)
  expect(draftErrors(d)).toEqual([])
  d.seed = '1e3'; expect(draftErrors(d)).toContain('Seed must be a safe, non-negative whole number.')
  d.seed = '0'; expect(draftErrors(d)).toEqual([])
  d.body = 224; d.frame = autoFrame(d.body); expect(draftErrors(d)).toEqual([])
  d.body = 257; expect(draftErrors(d)[0]).toContain('32–256')
  expect([48, 64, 96, 128].map(autoFrame)).toEqual([64, 80, 128, 160])
})
test('skeleton estimation pads without scaling and restores fractional coordinates', () => {
  const source = makeImg(81, 81); source.data.set([1, 2, 3, 255], (17 * 81 + 19) * 4)
  const input = skeletonInput(source)
  expect(input.image.w).toBe(128); expect(input.x).toBe(23)
  expect([...input.image.data.slice(((17 + 23) * 128 + 19 + 23) * 4, ((17 + 23) * 128 + 19 + 23) * 4 + 4)]).toEqual([1, 2, 3, 255])
  const [k] = unpadSkeleton([{ label: 'HEAD', x: (19.5 + 23) / 128, y: (17.5 + 23) / 128 }], input, source)
  expect(k.x).toBeCloseTo(19.5 / 81); expect(k.y).toBeCloseTo(17.5 / 81)
  const square = makeImg(256, 256); expect(skeletonInput(square).image).toBe(square)
  expect(() => skeletonInput(makeImg(257, 257))).toThrow('256')
})
test.each([64, 81, 160, 256])('freeze supports %ipx frames, no south, and east mirrored from west', async size => {
  const im = makeImg(size, size)
  for (let y = 12; y < size - 4; y++) for (let x = 15; x < 23; x++) im.data.set([120, 70, 40, 255], (y * size + x) * 4)
  const b = await buildRig([{ id: 'idle', dirs: { west: [im, im] } }], { size, directions: [{ id: 'east', mirrorOf: 'west' }, { id: 'west' }] })
  expect(b.errors).toEqual([]); expect(b.warnings).toEqual([])
  expect(b.rig.pivot.x).toBe(Math.floor(size / 2))
  expect(b.cells['idle/east/0'].img.data).toEqual(flipH(im).data)
  expect(b.rig.directions).toEqual([{ id: 'east', mirrorOf: 'west' }, { id: 'west' }])
})
test('held equipment padding stays symmetric and within the 256 px API limit', () => {
  for (const size of [64, 81, 160, 224, 225, 240, 255, 256]) {
    const pad = padOf('main_hand', 'skel', { w: size, h: size })
    expect(Number.isInteger(pad)).toBe(true); expect(pad).toBeGreaterThanOrEqual(0); expect(size + 2 * pad).toBeLessThanOrEqual(256)
  }
  expect(padOf('main_hand', 'skel', { w: 240, h: 240 })).toBe(8)
  expect(padOf('main_hand', 'skel', { w: 256, h: 256 })).toBe(0)
})
