import { expect, test } from 'vitest'
import { itemNameFrom } from '../../src/studio/model.ts'

test.each([
  ['iron lantern hanging from a short chain', 'Iron lantern'],
  ['steel longsword with a gold crossguard', 'Steel longsword'],
  ['brown leather travel backpack', 'Brown leather travel backpack'],
  ['a straw farmer hat, frayed', 'Straw farmer hat'],
  ['pair of leather boots', 'Leather boots'],
  // "of" names the item; cutting it lost meaning (2026-11-07 counter-review R5)
  ['cloak of shadows', 'Cloak of shadows'],
])('item names come from the description head: %s', (desc, name) => expect(itemNameFrom(desc)).toBe(name))
