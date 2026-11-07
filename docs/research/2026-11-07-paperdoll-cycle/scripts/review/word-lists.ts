// Review of the uncommitted word-list changes: expectsWaistBand (negation must modify the band; girdle, cummerbund) and
// heldSlotFor (targe, pavise, aegis, scutum). The HEAD rules are read with `git show HEAD:` and evaluated in memory, so no
// copy of old code is written. Prints old vs new per phrase with the intended answer; "WRONG" marks a rule that disagrees.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/review/word-lists.ts
import { execSync } from 'node:child_process';
import { expectsWaistBand } from '../../../../../app/src/lib/items/design-consistency.ts';
import { heldSlotFor } from '../../../../../app/src/studio/model.ts';

const show = (p: string) => execSync(`git show HEAD:${p}`, { encoding: 'utf8' });
const oldBandSrc = show('app/src/lib/items/design-consistency.ts').match(/export function expectsWaistBand\(prompt: string\): boolean \{([\s\S]*?)\n\}/)![1];
const oldBand = new Function('prompt', oldBandSrc) as (p: string) => boolean;
const oldOff = new Function(`return ${show('app/src/studio/model.ts').match(/const OFF_HAND = (\/.*\/i);/)![1]}`)() as RegExp;
const oldHeld = (p: string) => (oldOff.test(p) ? 'off_hand' : 'main_hand');

// Candidate (review only): the negation may reach the band across up to 4 modifier words ("without a thick brown leather
// belt", "no gold or silver belt") but not across a clause boundary (comma, semicolon, and, but, with, plus); plural bands.
const NEG = /\b(?:without|no|not|absent|omit)\s+(?:(?!(?:and|but|with|plus)\b)[\w-]+\s+){0,4}?(?:belt|waistband|sash|girdle|cummerbund)(?:e?s)?\b/i;
const candBand = (p: string) => !NEG.test(p) && expectsWaistBand(p);
// Candidate: drop "aegis" (also a common adjective and name) and do not let a hyphenated compound ("shield-breaker") decide.
const candOff = /\b(?:long|short|recurve|hunting|war|great|flat)?bows?\b(?!-)|\b(?:shield|buckler|targe|pavise|scutum)s?\b(?!-)/i;
const candHeld = (p: string) => (candOff.test(p) ? 'off_hand' : 'main_hand');

const mark = (got: unknown, want: unknown) => `${String(got).padEnd(9)}${got === want ? '' : 'WRONG'}`.padEnd(15);
console.log('== expectsWaistBand: phrase | intended | old | new | candidate ==');
const band: [string, boolean][] = [
  ['a tunic with no sleeves and a leather belt', true], // the audit case
  ['a robe without a leather belt', false],
  ['a robe without a wide leather belt', false],
  ['a tunic without a thick brown leather belt', false],
  ['a robe with no gold or silver belt', false],
  ['a robe, no belts', false],
  ['a robe without belts or sashes', false],
  ['a dress with no waist sash', false],
  ['no-frills belt and tunic', true],
  ['a leather belt with no buckle', true],
  ['a belt, no cape', true],
  ['a tunic with a belt but no sleeves', true],
  ['not a belt but a waist sash', true],
  ['not a belt but a sash', false], // a plain sash is excluded by the sash rule either way
  ['beltless tunic', false],
  ['belt-less tunic', false],
  ['a tunic lacking a belt', false],
  ['a dress with a silk girdle', true],
  ['a dress with no girdle', false],
  ['tuxedo with a red cummerbund', true],
  ['a red tunic, not belted', false],
  ['a tunic with a belt that is not visible from the back', false],
  ['a tunic with no visible belt', false],
  ['a tunic with no embroidery, leather belt', true],
];
for (const [p, want] of band) console.log(p.padEnd(56), String(want).padEnd(7), mark(oldBand(p), want), mark(expectsWaistBand(p), want), mark(candBand(p), want));

console.log('\n== heldSlotFor: phrase | intended | old | new | candidate ==');
const held: [string, string][] = [
  ['a wooden targe', 'off_hand'], ['a tall pavise', 'off_hand'], ['the aegis', 'off_hand'], ['roman scutum', 'off_hand'],
  ['aegis-engraved sword', 'main_hand'], ['sword of the aegis', 'main_hand'], ['Aegis blade', 'main_hand'], ['spear with an aegis crest', 'main_hand'],
  ['targeting crossbow', 'main_hand'], ['scutum-shaped mace', 'main_hand'], ['shield-breaker axe', 'main_hand'], ['sword with a shield emblem', 'main_hand'],
  ['bowie knife', 'main_hand'], ['crossbow', 'main_hand'], ['bow staff', 'main_hand'],
];
for (const [p, want] of held) console.log(p.padEnd(56), want.padEnd(10), mark(oldHeld(p), want), mark(heldSlotFor(p), want), mark(candHeld(p), want));
