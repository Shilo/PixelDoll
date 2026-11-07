import { expect, test } from 'vitest'
import { itemNameFrom } from '../../src/studio/model.ts'

test.each([
  ['iron lantern hanging from a short chain', 'Iron lantern'],
  ['steel longsword with a gold crossguard', 'Steel longsword'],
  ['brown leather travel backpack', 'Brown leather travel backpack'],
  ['a straw farmer hat, frayed', 'Straw farmer hat'],
  ['pair of leather boots', 'Leather boots'],
  ['cloak of shadows', 'Cloak'],
])('item names come from the description head: %s', (desc, name) => expect(itemNameFrom(desc)).toBe(name))
