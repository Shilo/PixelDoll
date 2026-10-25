import { expect, test } from 'vitest'
import { BASE_BODY, BASE_CLOTHES } from '../../src/studio/model.ts'
import { creationLooks } from '../../src/studio/create.ts'

// The body's own animation calls describe its clothes. They used to always say "t-shirt and shorts", so a prompt that dressed the
// base differently still asked every body animation for a t-shirt.
test('the body description follows the base body line of the prompt', () => {
  expect(creationLooks({ description: `a human man ${BASE_BODY}`, exactPrompt: true })).toBe(`a human man, bald, ${BASE_CLOTHES}, barefoot, empty hands, no weapon`)
  expect(creationLooks({ description: 'a knight in plate armor', exactPrompt: true })).toBe('a knight in plate armor, empty hands, no weapon')
  const old = 'plain bald paperdoll base body, wearing a plain light gray t-shirt and plain dark gray shorts, barefoot, no hair, no accessories, neutral standing pose with arms slightly away from the torso'
  expect(creationLooks({ description: `x\n${old}`, exactPrompt: true })).toBe('x, bald, wearing a plain light gray t-shirt and plain dark gray shorts, barefoot, empty hands, no weapon')
})
