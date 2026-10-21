// Real sprite data: the S2 "adventurer" fixture (app/public/fixtures/s2), sheets are 64 px cells,
// rows = south, east, north; west = east mirrored.
export const CELL = 64
export const DIRS = ['south', 'east', 'north', 'west'] as const
export type Dir = (typeof DIRS)[number]
export const ROW: Record<Dir, number> = { south: 0, east: 1, north: 2, west: 1 }

export const MOVES = [
  { id: 'walk', name: 'Walk', frames: 8, ms: 100, dirs: '4 directions' },
  { id: 'cross-punch', name: 'Punch', frames: 6, ms: 100, dirs: 'south only' },
] as const
export type MoveId = (typeof MOVES)[number]['id']

export type Item = { id: string; name: string; group: string; slot: string; z: number; moves: MoveId[]; hides?: string[]; material?: string }
const L = (slot: string, id: string, anim: string) => `./sprites/layers/${slot}/${id}/main/${anim}.png`

export const BASE: Item = { id: 'base', name: 'Base body', group: 'Body', slot: 'body', z: 10, moves: ['walk', 'cross-punch'] }
export const ITEMS: Item[] = [
  { id: 'helmet_steel', name: 'Steel helmet', group: 'Head', slot: 'head', z: 130, moves: ['walk', 'cross-punch'], hides: ['hair'], material: 'metal' },
  { id: 'hat_wizard', name: 'Wizard hat', group: 'Head', slot: 'head', z: 130, moves: ['walk'], material: 'cloth' },
  { id: 'hair_brown', name: 'Messy hair', group: 'Hair', slot: 'hair', z: 110, moves: ['walk', 'cross-punch'], material: 'hair' },
  { id: 'vest_leather', name: 'Leather vest', group: 'Body', slot: 'torso_inner', z: 40, moves: ['walk', 'cross-punch'], material: 'leather' },
  { id: 'cape_red', name: 'Red cape', group: 'Back', slot: 'back', z: 90, moves: ['walk', 'cross-punch'], material: 'cape' },
  { id: 'sword_steel', name: 'Longsword', group: 'Hands', slot: 'main_hand', z: 150, moves: ['walk', 'cross-punch'], material: 'metal' },
]
export const sheet = (it: Item, move: MoveId) => L(it.slot, it.id, it.moves.includes(move) ? move : 'walk')

// 8 user-facing slot groups (D1 §4.1), each with a Lucide + a pixelarticons glyph.
export const GROUPS = [
  { id: 'Head', icon: 'hard-hat', pixel: 'crown', empty: 'hats' },
  { id: 'Hair', icon: 'scissors', pixel: 'scissors', empty: 'hair' },
  { id: 'Face', icon: 'glasses', pixel: 'sunglasses', empty: 'glasses or masks' },
  { id: 'Body', icon: 'shirt', pixel: 'shirt', empty: 'tops' },
  { id: 'Legs', icon: 'person-standing', pixel: 'human', empty: 'trousers' },
  { id: 'Feet', icon: 'footprints', pixel: 'human-arms-down', empty: 'boots' },
  { id: 'Back', icon: 'backpack', pixel: 'backpack', empty: 'capes' },
  { id: 'Hands', icon: 'sword', pixel: 'sword', empty: 'weapons' },
] as const

// Recolour options per material (ramps are display swatches; the canvas mock uses a CSS filter per option).
export type Option = { id: string; name: string; ramp: string[]; filter: string }
export const MATERIALS: { id: string; name: string; options: Option[] }[] = [
  { id: 'cape', name: 'Cape', options: [
    { id: 'red', name: 'Crimson', ramp: ['#4a1420', '#8c2433', '#c43a3f', '#e8705a'], filter: 'none' },
    { id: 'blue', name: 'Royal', ramp: ['#16224a', '#29408c', '#3b5dc9', '#6d9be8'], filter: 'hue-rotate(225deg) saturate(1.1)' },
    { id: 'green', name: 'Forest', ramp: ['#13331f', '#1f5c34', '#38b764', '#7fd99a'], filter: 'hue-rotate(120deg) saturate(0.85)' },
    { id: 'violet', name: 'Plum', ramp: ['#2e1438', '#552266', '#8a3fa3', '#c27ad6'], filter: 'hue-rotate(285deg)' },
  ] },
  { id: 'leather', name: 'Leather', options: [
    { id: 'brown', name: 'Saddle', ramp: ['#3b2416', '#6b4128', '#9c6b43', '#c9986b'], filter: 'none' },
    { id: 'black', name: 'Black', ramp: ['#141416', '#2a2a30', '#45454f', '#6c6c78'], filter: 'grayscale(1) brightness(0.6)' },
    { id: 'tan', name: 'Tan', ramp: ['#6b4a2a', '#a37444', '#d6a76b', '#f2d49b'], filter: 'brightness(1.3) saturate(0.9)' },
    { id: 'oxblood', name: 'Oxblood', ramp: ['#2e0f12', '#5c1d24', '#8a2f36', '#b5545a'], filter: 'hue-rotate(-25deg) saturate(1.4)' },
  ] },
  { id: 'metal', name: 'Metal', options: [
    { id: 'steel', name: 'Steel', ramp: ['#2b3440', '#566c86', '#94b0c2', '#f4f4f4'], filter: 'none' },
    { id: 'gold', name: 'Gold', ramp: ['#5c3a12', '#a86f1f', '#e0a83a', '#ffcd75'], filter: 'sepia(1) saturate(2.2) hue-rotate(-10deg)' },
    { id: 'bronze', name: 'Bronze', ramp: ['#3d2414', '#7a4a26', '#b0753d', '#d9a066'], filter: 'sepia(1) saturate(1.3) hue-rotate(-20deg) brightness(0.85)' },
    { id: 'dark', name: 'Iron', ramp: ['#16181c', '#2f343b', '#4d545e', '#7b8490'], filter: 'brightness(0.6)' },
  ] },
  { id: 'hair', name: 'Hair', options: [
    { id: 'brown', name: 'Brown', ramp: ['#24160f', '#4a2d1c', '#73472b', '#9c6a45'], filter: 'none' },
    { id: 'blonde', name: 'Blonde', ramp: ['#6b4a1f', '#b08436', '#e0bd5c', '#f7e39a'], filter: 'brightness(1.9) saturate(1.2)' },
    { id: 'black', name: 'Black', ramp: ['#0f0f12', '#1f1f26', '#33333d', '#4f4f5c'], filter: 'grayscale(1) brightness(0.55)' },
    { id: 'ginger', name: 'Ginger', ramp: ['#4a1c0c', '#8c3414', '#c9561e', '#ef8a3c'], filter: 'saturate(2) brightness(1.3) hue-rotate(-10deg)' },
  ] },
]

// Generation in progress (S2 x4 run b5_chest48_A): 16 cells = walk S (8) + walk E (8).
export const GEN = {
  name: 'Iron breastplate', group: 'Body', done: 10, cells: 16,
  cell: (i: number) => ({ base: `./sprites/gen/b5_chest48_A.base${i}.png`, layer: `./sprites/gen/b5_chest48_A.layer${i}.png`, out: `./sprites/gen/b5_chest48_A.out${i}.png` }),
}

export const OUTFITS = [
  { id: 'adventurer', name: 'Adventurer', wear: ['helmet_steel', 'vest_leather', 'cape_red', 'sword_steel'] },
  { id: 'wizard', name: 'Travelling wizard', wear: ['hat_wizard', 'hair_brown', 'cape_red'] },
  { id: 'bare', name: 'Base only', wear: [] },
]
