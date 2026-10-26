import { expect, test } from 'vitest'
import { autoFrame, draftErrors, facingErrors, facingOf, freshSeed, newCharacterDraft, readPrompt, sizeErrors, toggleDirection, toggleMirror, TRAITS, UNSET, writeDetails, writeTrait, type Mirrors, type Trait } from '../../src/studio/characterConfig.ts'
import { baseMoveSpecs, creationDirections, createCharacter, type CreateSpec } from '../../src/studio/create.ts'
import { createPlan, movePlan } from '../../src/studio/apiPlans.ts'
import type { Manifest } from '../../src/lib/store/manifest.ts'
import { BASE_BODY } from '../../src/studio/model.ts'
import { DIRECTIONS, type DirectionName } from '../../src/lib/rig/rig.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import { normalize } from '../../src/lib/rig/normalize.ts'
import { flipH } from '../../src/lib/rig/mirror.ts'

// This matrix checks local configuration and known request fields. It makes no HTTP requests and cannot establish
// whether PixelLab follows a soft appearance hint, or validate image/keypoint payloads that depend on its response.
const pairs: [DirectionName, DirectionName][] = [['north-west', 'north-east'], ['west', 'east'], ['south-west', 'south-east']]
type Facing = { selected: DirectionName[]; mirrors: Mirrors }
function allPlans(): Facing[] {
  const plans: Facing[] = []
  for (let cardinals = 0; cardinals < 4; cardinals++) for (let code = 0; code < 216; code++) {
    const plan: Facing = { selected: [], mirrors: {} }
    if (cardinals & 1) plan.selected.push('north')
    if (cardinals & 2) plan.selected.push('south')
    let remaining = code
    for (const [left, right] of pairs) {
      // Six legal pair states: none, left only, right only, both unique, left mirrored, right mirrored.
      const state = remaining % 6; remaining = Math.floor(remaining / 6)
      if ([1, 3, 4, 5].includes(state)) plan.selected.push(left)
      if ([2, 3, 4, 5].includes(state)) plan.selected.push(right)
      if (state === 4) plan.mirrors[left] = right
      if (state === 5) plan.mirrors[right] = left
    }
    if (plan.selected.length) plans.push(plan)
  }
  return plans
}
const plans = allPlans()
const specOf = (plan: Facing): CreateSpec => ({ description: 'A freckled humanoid', name: 'Matrix', size: 64, frame: 80, view: 'low top-down', seed: 321, exactPrompt: true, directions: facingOf(plan) })
/** Creation makes only the Default move; idle and walk come from "Add idle + walk" on the created rig (same directions, camera and seed). */
function basePlan(spec: CreateSpec) {
  const manifest = { rig: { cell: { w: spec.frame!, h: spec.frame! }, view: spec.view, directions: creationDirections(spec), animations: [{ id: 'default', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }] }, items: [] } as unknown as Manifest
  return baseMoveSpecs(manifest, spec.seed).flatMap(move => movePlan({ manifest, character: { id: 'managed', looks: 'looks' } }, move))
}

test('all 863 nonempty facing plans create without animation and map only their unique sources to idle + walk requests', () => {
  expect(plans).toHaveLength(863)
  expect(new Set(plans.map(plan => JSON.stringify(facingOf(plan)))).size).toBe(863)
  for (const plan of plans) {
    const spec = specOf(plan), directions = facingOf(plan)
    expect(facingErrors(directions)).toEqual([])
    expect(creationDirections(spec)).toEqual(directions)
    const expectedSources = DIRECTIONS.filter(dir => plan.selected.includes(dir) && !plan.mirrors[dir])
    const calls = createPlan(spec)
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/create-character-v3', body: { description: spec.description, image_size: { width: 64, height: 64 } } })
    expect(calls[1].body).toMatchObject({ n_directions: 8 })
    expect(calls[1].note).toContain('all eight original')
    expect(calls.filter(call => call.path === '/characters/animations' || call.path === '/animate-with-skeleton-v3')).toEqual([])
    const moves = basePlan(spec)
    const motion = moves.filter(call => call.path === '/characters/animations')
    expect(motion.map(call => (call.body as { directions: string[] }).directions)).toEqual(expectedSources.map(dir => [dir]))
    const render = moves.filter(call => call.path === '/animate-with-skeleton-v3')
    expect(render.map(call => (call.body as { direction: string }).direction)).toEqual([...expectedSources, ...expectedSources])
    expect(render.every(call => (call.body as { seed: number }).seed === 422)).toBe(true)
  }
})

test('all 12,082 direction and mirror transitions preserve valid sources and deterministic promotion', () => {
  let operations = 0
  for (const plan of plans) {
    for (const dir of DIRECTIONS) {
      const changed = structuredClone(plan), removed = plan.selected.includes(dir)
      toggleDirection(changed, dir); operations++
      expect(changed.selected.includes(dir)).toBe(!removed)
      expect(facingErrors(facingOf(changed))).toEqual(changed.selected.length ? [] : ['Choose at least one direction.'])
      if (removed) {
        expect(changed.mirrors[dir]).toBeUndefined()
        for (const target of DIRECTIONS.filter(target => plan.mirrors[target] === dir)) {
          expect(changed.selected).toContain(target)
          expect(changed.mirrors[target]).toBeUndefined()
        }
      }
    }
    for (const [left, right] of pairs) for (const [target, source] of [[left, right], [right, left]]) {
      const changed = structuredClone(plan)
      toggleMirror(changed, target); operations++
      expect(facingErrors(facingOf(changed))).toEqual([])
      if (plan.mirrors[target]) expect(changed.mirrors[target]).toBeUndefined()
      else {
        expect(changed.mirrors[target]).toBe(source)
        expect(changed.mirrors[source]).toBeUndefined()
        expect(changed.selected).toEqual(expect.arrayContaining([target, source]))
      }
    }
  }
  expect(operations).toBe(12_082)
})

test('all 57 supported four-pixel body sizes map exactly and every unsupported integer is rejected before work', async () => {
  let sizes = 0
  for (let body = 32; body <= 256; body++) {
    const frame = autoFrame(body), draft = newCharacterDraft()
    draft.body = body
    if (body % 4) {
      expect(sizeErrors(body, frame)).not.toEqual([])
      expect(draftErrors(draft)).not.toEqual([])
      await expect(createCharacter({ ...specOf(plans[0]), size: body, frame })).rejects.toThrow('Body size')
      // A persisted legacy spec without an explicit frame must also stop before contacting PixelLab.
      const { frame: _, ...legacy } = { ...specOf(plans[0]), size: body }
      await expect(createCharacter(legacy)).rejects.toThrow('Body size must be 32–256 pixels in 4 px steps')
      continue
    }
    sizes++
    expect(sizeErrors(body, frame)).toEqual([])
    expect(frame).toBeGreaterThanOrEqual(body)
    expect(frame).toBeLessThanOrEqual(256)
    expect(sizeErrors(body, frame - 1)).not.toEqual([])
    expect(sizeErrors(body, 256)).toEqual([])
    expect(sizeErrors(body, frame + 0.5)).not.toEqual([])
    expect(draftErrors(draft)).toEqual([])
    const spec = { ...specOf(plans[0]), size: body, frame }
    const calls = createPlan(spec)
    expect(calls[0].body).toMatchObject({ image_size: { width: body, height: body } })
    expect(calls[1].note).toContain(`padded to ${frame} px`)
    // Frame is applied locally to response images; it must not replace the source image_size.
    expect(calls[1].body).not.toHaveProperty('image_size')
  }
  expect(sizes).toBe(57)
  for (const body of [undefined, NaN, -1, 0, 31, 32.5, 256.5, 257, Infinity]) expect(sizeErrors(body, 256)).not.toEqual([])
  expect([48, 64, 96, 128].map(autoFrame)).toEqual([64, 80, 128, 160])
})

test('all 21 appearance choices, including Not set, map into the exact description and back', () => {
  const choices: Record<Trait, string[]> = {
    kind: ['Human', 'Elf', 'Dwarf', 'Orc', 'Undead'], build: ['Slender', 'Broad', 'Muscular', 'Rounded'],
    proportions: ['Natural', 'Chibi'], skin: ['Deep brown', 'Brown', 'Tan', 'Light tan', 'Light', 'Pale'],
  }
  let total = 0
  for (const key of Object.keys(choices) as Trait[]) {
    expect(TRAITS[key].options).toEqual(choices[key])
    for (const option of [UNSET, ...choices[key]]) {
      total++
      const draft = newCharacterDraft()
      writeDetails(draft, 'Distinctive freckles')
      // Exercise Not set as removal, rather than only checking the already-unset initial state.
      writeTrait(draft, key, choices[key][0]); writeTrait(draft, key, option)
      const expected = `Distinctive freckles\n${option === UNSET ? '' : `${TRAITS[key].label}: ${option}\n`}${BASE_BODY}`
      expect(draft.prompt).toBe(expected)
      const parsed = newCharacterDraft(); readPrompt(parsed, expected)
      expect(parsed[key]).toBe(option)
      expect(parsed.details).toBe('Distinctive freckles')
      const spec = { ...specOf(plans[0]), description: draft.prompt }
      expect(createPlan(spec)[0].body).toHaveProperty('description', expected)
    }
  }
  expect(total).toBe(21)
})

test('all 225 integer image sizes preserve exact pixels locally, independently of from-scratch generation increments', () => {
  for (let body = 32; body <= 256; body++) {
    const source = makeImg(body, body)
    const points = [{ x: 3, y: 5, rgba: [23, 67, 101, 255] }, { x: body - 4, y: body - 6, rgba: [181, 37, 89, 255] }]
    for (const point of points) source.data.set(point.rgba, (point.y * body + point.x) * 4)
    for (const frame of new Set([autoFrame(body), 256])) {
      const padded = normalize(source, frame, frame), mirrored = flipH(padded.img)
      const xOffset = Math.floor((frame - body) / 2), yOffset = Math.max(0, frame - body - 4)
      expect(padded.img.w).toBe(frame); expect(padded.img.h).toBe(frame)
      expect(padded.cutPx).toBe(0)
      expect(padded.offset).toEqual([xOffset, yOffset])
      for (const point of points) {
        const x = point.x + xOffset, y = point.y + yOffset
        expect([...padded.img.data.slice((y * frame + x) * 4, (y * frame + x) * 4 + 4)]).toEqual(point.rgba)
        const reflected = frame - 1 - x
        expect([...mirrored.data.slice((y * frame + reflected) * 4, (y * frame + reflected) * 4 + 4)]).toEqual(point.rgba)
      }
    }
  }
})

test('all camera values propagate through source, registration and raw requests, with invalid cameras rejected before work', async () => {
  for (const view of ['low top-down', 'high top-down', 'side'] as const) {
    const calls = createPlan({ ...specOf(plans[0]), view })
    expect(calls[0].body).toHaveProperty('view', view)
    expect(calls[1].body).toHaveProperty('view', view)
    const render = basePlan({ ...specOf(plans[0]), view }).filter(call => call.path === '/animate-with-skeleton-v3')
    expect(render).not.toHaveLength(0)
    for (const call of render) expect(call.body).toHaveProperty('view', view)
  }
  await expect(createCharacter({ ...specOf(plans[0]), view: 'overhead' as CreateSpec['view'] })).rejects.toThrow('Invalid camera')
})

test('blank and explicit seeds keep their intended request semantics and reject invalid values locally', async () => {
  const max = Number.MAX_SAFE_INTEGER - 100_000
  for (const seed of ['0', '1', '321', String(max)]) {
    const draft = newCharacterDraft(); draft.seed = seed
    expect(draftErrors(draft)).toEqual([])
    const calls = createPlan({ ...specOf(plans[0]), seed: Number(seed) })
    expect(calls[0].body).toHaveProperty('seed', Number(seed))
    expect(calls[1].body).toHaveProperty('seed', Number(seed))
    const moves = basePlan({ ...specOf(plans[0]), seed: Number(seed) })
    expect(moves.filter(call => call.path === '/characters/animations')).not.toHaveLength(0)
    for (const call of moves.filter(call => call.path === '/characters/animations')) expect(call.body).toHaveProperty('seed', Number(seed))
    for (const call of moves.filter(call => call.path === '/animate-with-skeleton-v3')) expect(call.body).toHaveProperty('seed', Number(seed) + 101)
  }
  const blank = newCharacterDraft(); expect(draftErrors(blank)).toEqual([])
  for (const call of createPlan(specOf(plans[0]), true)) if (call.body) expect(JSON.parse(JSON.stringify(call.body))).not.toHaveProperty('seed')
  for (let i = 0; i < 16; i++) { const seed = freshSeed(); expect(Number.isInteger(seed) && seed >= 1 && seed <= 2_000_000_000).toBe(true) }
  for (const seed of ['-1', '1.5', '1e3', ' 1', '1 ', 'NaN', 'Infinity', String(max + 1)]) {
    const draft = newCharacterDraft(); draft.seed = seed
    expect(draftErrors(draft)).toContain('Seed must be a safe, non-negative whole number.')
  }
  for (const seed of [-1, 1.5, NaN, Infinity, max + 1]) await expect(createCharacter({ ...specOf(plans[0]), seed })).rejects.toThrow('Invalid seed')
})
