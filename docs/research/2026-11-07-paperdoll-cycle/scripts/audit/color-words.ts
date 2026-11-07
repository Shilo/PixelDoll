// Audit (2026-11-07 color/prompt audit): which color words, phrases and languages the prompt regexes miss, and what the
// production key pick then does to an item drawn in that color. Offline; production functions are imported, never copied.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/audit/color-words.ts
import { KEYS, KT, keyScore, pickKey, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { GRAYISH } from '../../../../../app/src/lib/items/items.ts';
import { expectsWaistBand } from '../../../../../app/src/lib/items/design-consistency.ts';
import { heldSlotFor } from '../../../../../app/src/studio/model.ts';

// Common English color words (single words, no "green"/"blue" compounds) with conventional sRGB values.
const WORDS: Record<string, string> = {
  // green family and blue-greens
  aquamarine: '7fffd4', chartreuse: '7fff00', celadon: 'ace1af', sage: '9caf88', pistachio: '93c572', avocado: '568203', kelly: '4cbb17',
  hunter: '355e3b', pine: '01796f', fern: '4f7942', moss: '8a9a5b', olive: '808000', lime: '32cd32', jade: '00a86b', emerald: '50c878',
  mint: '3eb489', seafoam: '93e9be', viridian: '40826d', malachite: '0bda51', shamrock: '009e60', harlequin: '3fff00', asparagus: '87a96b',
  artichoke: '8f9779', basil: '579229', spring: '00ff7f', lawn: '7cfc00', khaki: 'c3b091', army: '4b5320', camo: '78866b', sea: '2e8b57',
  jungle: '29ab87', bottle: '006a4e', apple: '8db600', pear: 'd1e231', kiwi: '8ee53f', laurel: 'a9ba9d', myrtle: '317873', pea: '52a447',
  leaf: '5ca904', grass: '4ca628', forest: '228b22', ivy: '307d3e', clover: '3a5f0b', lichen: '8fa876', verdigris: '43b3ae', neon: '39ff14',
  toxic: '6aff00', slime: '99cc00', swamp: '6c7a3a', bamboo: '7bb661', cactus: '587246', pickle: '597d35', frog: '58bc08', lizard: '71aa34',
  teal: '008080', turquoise: '40e0d0', cyan: '00ffff', aqua: '00ffff', cerulean: '007ba7', sky: '87ceeb',
  // reds, pinks, purples
  red: 'ff0000', crimson: 'dc143c', scarlet: 'ff2400', maroon: '800000', burgundy: '800020', wine: '722f37', cherry: 'de3163', ruby: 'e0115f',
  garnet: '733635', blood: '8a0303', vermilion: 'e34234', cardinal: 'c41e3a', carmine: '960018', rust: 'b7410e', brick: 'cb4154',
  coral: 'ff7f50', salmon: 'fa8072', pink: 'ffc0cb', rose: 'ff007f', blush: 'de5d83', raspberry: 'e30b5c', cerise: 'de3163', magenta: 'ff00ff',
  fuchsia: 'ff00ff', hotpink: 'ff69b4', bubblegum: 'ffc1cc', flamingo: 'fc8eac', mauve: 'e0b0ff', lilac: 'c8a2c8', lavender: 'b57edc',
  violet: '8f00ff', purple: '800080', plum: '8e4585', indigo: '4b0082', amethyst: '9966cc', orchid: 'da70d6', eggplant: '614051',
  aubergine: '3d0734', grape: '6f2da8', wisteria: 'c9a0dc', heliotrope: 'df73ff', byzantium: '702963', puce: 'cc8899', royal: '7851a9',
  // blues
  blue: '0000ff', navy: '000080', azure: '007fff', cobalt: '0047ab', sapphire: '0f52ba', denim: '1560bd', ultramarine: '3f00ff',
  cornflower: '6495ed', midnight: '191970', periwinkle: 'ccccff', ice: 'd6ecef', powder: 'b0e0e6', ocean: '006994', steelblue: '4682b4',
  // warm and neutral
  orange: 'ffa500', tangerine: 'f28500', amber: 'ffbf00', gold: 'ffd700', golden: 'daa520', yellow: 'ffff00', lemon: 'fff700',
  mustard: 'ffdb58', saffron: 'f4c430', ochre: 'cc7722', honey: 'eb9605', bronze: 'cd7f32', copper: 'b87333', brass: 'b5a642', tan: 'd2b48c',
  beige: 'f5f5dc', cream: 'fffdd0', ivory: 'fffff0', peach: 'ffe5b4', apricot: 'fbceb1', brown: '964b00', chocolate: '7b3f00', coffee: '6f4e37',
  mahogany: 'c04000', chestnut: '954535', walnut: '773f1a', umber: '635147', sepia: '704214', sienna: 'a0522d', auburn: 'a52a2a', taupe: '483c32',
  sand: 'c2b280', white: 'ffffff', black: '000000', gray: '808080', silver: 'c0c0c0', charcoal: '36454f', slate: '708090', gunmetal: '2a3439',
  pewter: '8e9196', platinum: 'e5e4e2', pearl: 'eae0c8', bone: 'e3dac9', ebony: '555d50', obsidian: '0b1215', onyx: '353839', jet: '343434',
  chrome: 'dbe4eb', titanium: '878681', smoke: '738276', snow: 'fffafa',
};
const rgb = (h: string) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4), 16)];
/** A drawn item uses a shading ramp: shadow, midtone, base, highlight. */
const shades = (c: number[]) => [c.map((v) => Math.round(v * 0.55)), c.map((v) => Math.round(v * 0.75)), c, c.map((v) => Math.round(v + (255 - v) * 0.3))];
const hits = (k: Key, c: number[]) => shades(c).filter((s) => keyScore(k, s[0], s[1], s[2]) >= KT).length;
/** Measured choice: the first key (pickKey order) on which no shade scores as key. */
const measured = (c: number[]) => KEYS.find((k) => hits(k, c) === 0);

const rows = Object.entries(WORDS).map(([w, h]) => {
  const c = rgb(h), k = pickKey(`a ${w} cloak`);
  return { w, k, base: keyScore(k, c[0], c[1], c[2]) >= KT, shades: hits(k, c), greenShades: hits('green', c), measured: measured(c) ?? '-' };
});
const greenColliding = rows.filter((r) => r.greenShades > 0);
const greenMissed = greenColliding.filter((r) => r.k === 'green');
const collide = rows.filter((r) => r.shades > 0);
console.log(`Color words: ${rows.length}. Shades scoring as green key (>= KT ${KT}) for ${greenColliding.length} words; HUES.green misses ${greenMissed.length} of them:`);
console.log('  ' + greenMissed.map((r) => `${r.w}(${r.greenShades}/4${r.base ? ', base' : ''})`).join(' '));
console.log(`After pickKey, ${collide.length} words still have >= 1 of 4 shades scoring as the PICKED key (base color itself: ${rows.filter((r) => r.base).length}):`);
console.log('  ' + collide.map((r) => `${r.w}->${r.k}(${r.shades}/4)`).join(' '));
const fixable = collide.filter((r) => r.measured !== '-');
console.log(`A key picked from the measured colors avoids the collision for ${fixable.length} of ${collide.length}: ` + fixable.map((r) => `${r.w}->${r.measured}`).join(' '));

// Phrases: themes that imply a color, other languages, misspellings, hex codes, non-color words that trip a regex.
const PHRASES: [string, string][] = [
  ['goblin armor', 'model may pick green'], ['elven cloak', 'model may pick green'], ['poison dagger', 'green glow likely'], ['toxic slime gauntlets', 'green'],
  ['druid robe', 'green/brown'], ['orc war helmet', 'green'], ['camo jacket', 'greens'], ['rainbow scarf', 'contains green and purple'],
  ['iridescent beetle shell armor', 'green-purple sheen'], ["St. Patrick's day hat", 'green'], ["Link's tunic", 'green'], ['Robin Hood hat', 'green'],
  ['a leafy crown', 'green'], ['a hood the color of grass', 'green'], ['sea foam hood', 'pale green'], ['cyan-ish hood', 'cyan'],
  ['#00ff00 cape', 'green'], ['#2e8b57 cloak', 'sea green'], ['a cape in rgb(0,200,0)', 'green'],
  ['capa verde', 'es/pt/it green'], ['cape verte', 'fr green'], ['grüner Umhang', 'de green'], ['gruener Umhang', 'de green'], ['groene mantel', 'nl green'],
  ['zielony płaszcz', 'pl green'], ['зелёный плащ', 'ru green'], ['緑のマント', 'ja green'], ['绿色斗篷', 'zh green'], ['초록 망토', 'ko green'],
  ['yeşil pelerin', 'tr green'], ['jubah hijau', 'id green'], ['capa rosa', 'es pink'], ['cape violette', 'fr purple'], ['lila Umhang', 'de purple'],
  ['gren cape', 'typo green'], ['grean cape', 'typo green'], ['emrald cloak', 'typo emerald'], ['chartruse hood', 'typo'], ['forrest ranger hood', 'typo forest'],
  ['purpel robe', 'typo purple'], ['pinc dress', 'typo pink'],
  ['sublime silk robe', 'not green'], ['limestone shield', 'gray'], ['mint condition coin necklace', 'gold'], ['predator mask', 'not red'],
  ['incredible hat', 'not red'], ['Fred the pirate hat', 'not red'], ['a tattered robe', 'brown'], ['forest ranger hood', 'brown?'],
  ['jester outfit in green, purple and blue', 'all keys collide'], ['a cloak in red, green and blue', 'all keys collide'],
];
console.log('\nPhrase -> pickKey (expected color note)');
for (const [p, note] of PHRASES) console.log(`  ${pickKey(p).padEnd(7)} ${p}  [${note}]`);

// D1 gray-smudge exemption: neutral color or material words GRAYISH misses (the design check then judges gray as smudge).
const NEUTRAL = ['gray', 'grey', 'silver', 'steel', 'iron', 'white', 'black', 'charcoal', 'slate', 'gunmetal', 'pewter', 'platinum', 'pearl', 'bone',
  'skull', 'ivory', 'cream', 'chrome', 'titanium', 'mithril', 'obsidian', 'onyx', 'jet', 'ebony', 'smoke', 'snow', 'lace', 'armor', 'plate', 'knight',
  'mail', 'rivets', 'tin', 'lead', 'nickel', 'aluminum', 'zinc', 'granite', 'marble', 'concrete', 'ash', 'ashen', 'gris', 'gris oscuro', 'blanco',
  'negro', 'noir', 'blanc', 'schwarz', 'weiß', 'silber', 'argent', 'plata', 'acero', 'eisen', 'fer'];
console.log(`\nGRAYISH misses ${NEUTRAL.filter((w) => !GRAYISH.test(w)).length}/${NEUTRAL.length}: ` + NEUTRAL.filter((w) => !GRAYISH.test(w)).join(', '));

// Held slot default and waist-band expectation (regexes over the prompt).
const HELD = ['a wooden longbow', 'a recurve bow', 'a round shield', 'a kite shield', 'a wooden targe', 'a pavise', 'an aegis', 'a buckler', 'escudo de madera',
  'bouclier', 'Holzschild', 'arco largo', 'an arc', 'Langbogen', 'a crossbow', 'a magic tome', 'a lantern'];
console.log('\nheldSlotFor: ' + HELD.map((h) => `${h}=${heldSlotFor(h)}`).join('; '));
const WAIST = ['a leather belt', 'a tunic with no sleeves and a leather belt', 'trousers without pockets, with a belt', 'cinturón de cuero',
  'ceinture en cuir', 'Ledergürtel', 'a waist sash', 'an obi', 'a girdle', 'a cummerbund', 'a black belt karate gi'];
console.log('expectsWaistBand: ' + WAIST.map((w) => `${w}=${expectsWaistBand(w)}`).join('; '));

// Per key: words whose shades score as that key although the word does not ban it (keyAllowed). These matter when another
// word in the prompt forces that key (magenta after a green word, blue after green + pink, azure after green + purple).
import { keyAllowed } from '../../../../../app/src/lib/image/chroma.ts';
for (const k of KEYS) {
  const miss = Object.entries(WORDS).filter(([w, h]) => hits(k, rgb(h)) > 0 && keyAllowed(`a ${w} cloak`, k));
  console.log(`\n${k}: ${Object.entries(WORDS).filter(([, h]) => hits(k, rgb(h)) > 0).length} words collide, ${miss.length} not banned by HUES.${k}: ` + miss.map(([w, h]) => `${w}(${hits(k, rgb(h))}/4)`).join(' '));
}
