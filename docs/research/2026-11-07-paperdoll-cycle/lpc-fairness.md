# Rim guard and skin tone on human-drawn LPC bodies

Date: 2026-11-07. Free, offline, no PixelLab calls. Scripts: [scripts/lpc-fairness/](scripts/lpc-fairness/). Follows
[fairness.md](fairness.md), which left one gap open: dark thin items lose more px over deep skin, measured only on two bench
bodies whose skin was recolored synthetically.

## Question

Is the dark-item gap real on human-drawn multi-tone bodies, and can a rule close it without shipping more false px (dark
mannequin redraws), especially on deep skin?

## Ground truth

Source: the local Universal LPC Spritesheet Character Generator checkout
(`C:/Programming_Files/Shilocity/PixelLab/checkouts/lpc-generator`, commit 9bf06be19). Licenses per its `CREDITS.csv`:
OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0. The images are read in place for measurement only; nothing is copied into this repo.

- Bodies: `spritesheets/body/bodies/{male,female}/walk.png` plus `spritesheets/head/heads/human/{male,female}/walk.png`,
  64 px cells, south and east rows, walk frames 0, 2, 4, 6. Two bases: bare, and with charcoal pants
  (`legs/pants/male/walk.png`, `legs/pants/thin/walk.png`, recolored with the cloth palette).
- Skin tones: the generator's own hand-picked 6-shade ramps, applied exactly as the generator does (index map from ULPC
  `light`, tolerance 1): `palette_definitions/body/body_ulpc.json` light, amber, olive, taupe, bronze, brown, black (dev tones)
  and `body_lpcr.json` porcelain, peach, tan, tawny, honey, bronze, brown, coffee (held out).
- Items (`spritesheets/...`, `walk/<color>.png`), dark and light variants. Dev items: `torso/waist/belt_leather` (charcoal,
  white), `torso/waist/sash` (black, white), `neck/necklace/chain` (iron, silver), `neck/capetie` (black, white). Held-out items:
  `torso/waist/belt_loose` (charcoal, tan), `torso/waist/belt_double` (brown, slate), `torso/aprons/suspenders` (black, white),
  `neck/scarf` (black, white), `neck/tie/bowtie/adult` (black, white), `neck/necklace/simple` (gold, steel),
  `neck/charm/box` (steel, bronze). Plus the 1 px synthetic straps of fairness.md (black 40,34,36 horizontal and diagonal, brown
  112,72,40 horizontal), placed at the LPC belt row.
- Extractor input: `toChroma(body, 'green')` with the item px painted on top. A px is dark when its luminance is below 0.25,
  the production split. Redraw modes: none; olive 48,46,11 on the whole silhouette ring; olive on 50 % of the interior outline
  px (known from the source palette); and scattered redraws over dark key shades (key luminance <= 0.3) at 15 % and 30 %,
  in three palettes: the reviewer's olive, the olive family (seven dark colors the production guard drops on the real green
  bench, hue 57 to 82 degrees: `bench-drops.ts`), and two brown bench drops (45,33,7 and 46,24,6) that come from red cape
  cases and may be cape px rather than redraws.
- Every rule runs through the production mask chain (`chromaMask`, the rule, `absorbOutline`, components of 2+ px). The
  production rule matched `dropKeyOutline` and `extractCell` on every one of 17,178 checked inputs.

Outputs (not committed): `C:/Programming_Files/Shilocity/PixelLab/checkouts/cycle-2026-11-07/lpc-fairness/results.json` and
`sheet.png` (`sheet.ts`: light and coffee male, suspenders and the 1 px strap, kept px under each rule).

15 tones x 2 bodies x 2 bases x 2 directions x 4 frames x 7 redraw modes x (22 LPC item variants, 3 synthetic straps, no item).

## Results

### Is the gap real?

Only when an item is a 1 px line, and then it is far larger than the synthetic recolor suggested. The cause is the absolute
clause `mean RGB < 60`: what matters is how many of a tone's skin shades sit under 60, not its overall lightness (ULPC taupe,
0 shades, loses nothing; the lighter ULPC olive, 1 shade, does).

Dark item px lost under production, modes none, rim olive and outline olive 50 %, both bases (dev and held-out LPC items
pooled; the horizontal and diagonal 1 px black straps pooled separately):

| Tone | Skin lum | Skin shades under mean RGB 60 | LPC items: dark px lost | 1 px straps: dark px lost | 1 px straps: kept |
| --- | ---: | ---: | ---: | ---: | ---: |
| LPCR porcelain (held out) | 0.82 | 0 | 124 of 459,660 | 27 of 2,406 | 98.9 % |
| ULPC light | 0.75 | 0 | 118 | 27 | 98.9 % |
| ULPC amber | 0.72 | 0 | 119 | 27 | 98.9 % |
| LPCR peach (held out) | 0.67 | 0 | 129 | 27 | 98.9 % |
| LPCR tan (held out) | 0.59 | 1 | 155 | 128 | 94.7 % |
| LPCR tawny (held out) | 0.51 | 1 | 152 | 130 | 94.6 % |
| ULPC olive | 0.51 | 1 | 145 | 122 | 94.9 % |
| ULPC taupe | 0.49 | 0 | 120 | 26 | 98.9 % |
| ULPC bronze | 0.41 | 1 | 157 | 128 | 94.7 % |
| LPCR honey (held out) | 0.40 | 1 | 165 | 120 | 95.0 % |
| ULPC brown | 0.39 | 1 | 155 | 124 | 94.8 % |
| LPCR bronze (held out) | 0.29 | 2 | 197 | 279 | 88.4 % |
| LPCR brown (held out) | 0.24 | 3 | 258 | 672 | 72.1 % |
| ULPC black | 0.22 | 3 | 248 | 669 | 72.2 % |
| LPCR coffee (held out) | 0.17 | 4 | 260 | 1,631 | 32.2 % |

Skin lum is the mean luminance of the skin px; the item totals are the same on every row.

Per item, production, mode none, dark px kept: real LPC items stay at 99.3 % or more on every tone except the suspenders, the
thinnest LPC strap (black 98.3 % on light skin, 96.7 % on the darkest three; white suspenders, whose dark px are its outline,
93.1 % and 91.0 %). The 1 px black strap keeps 98.1 % on light skin, 91.4 % with one skin shade under 60, 85.8 % with two,
66.8 % with three and 28.4 % on LPCR coffee; the diagonal 1 px baldric 100 %, 97.7 %, 86.5 %, 67.7 % and 18.8 %.

### Candidates

All three keep production's treatment of light generated px and differ only for dark generated px (luminance < 0.25) over a
base px with mean RGB < 60 that is not a real line (`lineByContrast`: base luminance < 0.06 or < 0.5 x its brightest opaque
8-neighbor). Production treats every such px as outline.

| Rule | Dark generated px over a dark, non-line base px counts as outline when |
| --- | --- |
| prod | always |
| allLocal (the reviewer's relaxation, reference) | never |
| hueGate | its color leans toward the key: hue within 75 degrees of the key hue and channel spread >= 12 (set from the three redraw colors named in fairness.md, before any LPC run) |
| stroke | it is not on a straight run (row, column or diagonal) of 4+ non-key px |
| hueStroke | it leans toward the key, or it is not on such a run |

Dark item px lost, all items, modes none, rim olive, outline olive 50 %:

Cells: LPC items / 1 px straps.

| Tone | old | prod | allLocal | hueGate | stroke | hueStroke |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| LPCR porcelain (held out) | 124 / 27 | 124 / 27 | 118 / 27 | 118 / 27 | 118 / 27 | 118 / 27 |
| ULPC light | 118 / 27 | 118 / 27 | 114 / 27 | 114 / 27 | 114 / 27 | 114 / 27 |
| ULPC taupe | 120 / 26 | 120 / 26 | 114 / 26 | 114 / 26 | 114 / 26 | 114 / 26 |
| ULPC olive | 145 / 122 | 145 / 122 | 126 / 114 | 126 / 114 | 126 / 114 | 126 / 114 |
| LPCR tan (held out) | 155 / 128 | 155 / 128 | 136 / 120 | 136 / 120 | 136 / 120 | 136 / 120 |
| ULPC bronze | 157 / 128 | 157 / 128 | 151 / 75 | 151 / 75 | 151 / 75 | 151 / 75 |
| LPCR honey (held out) | 165 / 120 | 165 / 120 | 146 / 112 | 146 / 112 | 146 / 112 | 146 / 112 |
| LPCR bronze (held out) | 219 / 279 | 197 / 279 | 147 / 123 | 147 / 123 | 147 / 123 | 147 / 123 |
| LPCR brown (held out) | 284 / 672 | 258 / 672 | 169 / 178 | 169 / 178 | 184 / 178 | 184 / 178 |
| ULPC black | 285 / 669 | 248 / 669 | 152 / 122 | 152 / 122 | 167 / 122 | 167 / 122 |
| LPCR coffee (held out) | 299 / 1,631 | 260 / 1,631 | 159 / 151 | 159 / 151 | 177 / 151 | 177 / 151 |
| all 15 tones | 2,626 / 4,137 | 2,502 / 4,137 | 2,054 / 1,324 | 2,054 / 1,325 | 2,102 / 1,325 | 2,102 / 1,325 |

Rows not shown (amber, peach, tawny, ULPC brown) follow their shade count. Light item px: every candidate equals production
(846 + 372 lost of 1.18 M LPC px; 1,147 of 24,120 synthetic), since only dark generated px are touched.

False px shipped with no item present (the redraw-only test of the review), both bases:

Cells: scatter olive 15 % / scatter olive 30 % / scatter brown 30 %. `old` equals `prod` in every cell. The olive-family scatter
(seven colors) gives exactly the olive 30 % numbers for every rule.

| Tone | prod | allLocal | hueGate | stroke | hueStroke |
| --- | ---: | ---: | ---: | ---: | ---: |
| LPCR porcelain (held out) | 337 / 1,254 / 1,254 | 390 / 1,396 / 1,396 | 337 / 1,254 / 1,396 | 339 / 1,274 / 1,274 | 337 / 1,254 / 1,274 |
| ULPC light | 250 / 1,046 / 1,046 | 309 / 1,178 / 1,178 | 250 / 1,046 / 1,178 | 253 / 1,066 / 1,066 | 250 / 1,046 / 1,066 |
| ULPC olive | 440 / 1,571 / 1,571 | 515 / 1,788 / 1,788 | 440 / 1,571 / 1,788 | 440 / 1,608 / 1,608 | 440 / 1,571 / 1,608 |
| ULPC bronze | 942 / 3,273 / 3,273 | 1,059 / 3,549 / 3,549 | 942 / 3,273 / 3,549 | 942 / 3,328 / 3,328 | 942 / 3,273 / 3,328 |
| LPCR bronze (held out) | 852 / 3,019 / 3,019 | 1,145 / 3,685 / 3,685 | 852 / 3,019 / 3,685 | 861 / 3,115 / 3,115 | 852 / 3,019 / 3,115 |
| LPCR brown (held out) | 1,711 / 5,908 / 5,908 | 2,324 / 7,492 / 7,492 | 1,711 / 5,908 / 7,492 | 1,747 / 6,294 / 6,294 | 1,711 / 5,908 / 6,294 |
| ULPC black | 1,572 / 5,829 / 5,829 | 2,343 / 7,581 / 7,581 | 1,572 / 5,829 / 7,581 | 1,616 / 6,245 / 6,245 | 1,572 / 5,829 / 6,245 |
| LPCR coffee (held out) | 688 / 3,704 / 3,704 | 2,686 / 8,483 / 8,483 | 688 / 3,704 / 8,483 | 898 / 5,109 / 5,109 | 688 / 3,704 / 5,109 |
| all 15 tones | 10,068 / 37,344 / 37,344 | 14,529 / 48,119 / 48,119 | 10,068 / 37,344 / 48,119 | 10,402 / 39,975 / 39,975 | 10,068 / 37,344 / 39,975 |

With items present, extra false px appear for every candidate, as they did for production over `old`: a recovered item px
anchors the redraw px touching it. Under olive or olive-family redraws, hueGate and hueStroke leave every redraw px's own status
as in production (all such px lean toward the key), so their extra px can only come through a recovered item neighbor. Summed
over the realistic modes (none, rim olive, outline olive 50 %), all items, against production: old -437, allLocal +2,980,
hueGate +825, stroke +1,120, hueStroke +784 (LPCR coffee: allLocal and hueGate +204, stroke and hueStroke +193; ULPC light: +4
for every candidate).

Real frozen bench, 12 green cases, raw extractor masks against production (`bench-diff.ts`):

hueStroke and stroke add 1 px: 36,49,12 (olive) over body 35,38,51 at n-cloak128 walk/south/0 (64,99), anchored by a neighbor
they now keep, in the dark-shorts area where fairness.md found the relative rule's olive speck. hueGate adds 8 px, among them 3
olive and 3 of b-cloak's dark brick red (45,17,5) cape shade. allLocal adds 12. No candidate drops a px production keeps.

## Conclusion

**The gap is real on human-drawn bodies, but only for 1 px dark lines, and there it is much larger than the synthetic recolor
measured.** Real LPC thin items, which are 2+ px wide and carry their own outline, keep 99.9 % of their dark px in aggregate on every
tone; the deepest tones lose about twice the px of the lightest (248 to 260 against 118 to 129 of 459,660), and only the
suspenders, the thinnest LPC strap, lose a visible 1.6 to 2.1 points more on the darkest three tones. A 1 px black strap or
baldric keeps 98.9 % on light skin, 95 % with one skin shade under mean RGB 60, 88 % with two, 72 % with three and 32 % on LPCR
coffee (the diagonal baldric alone 19 %). The driver is the absolute clause: the number of skin shades under 60, not overall
lightness (taupe loses nothing; the lighter olive does).

**No candidate closes the gap with zero extra false px in every test.** All three recover the same strap px (4,137 lost to
about 1,325; LPCR coffee 1,631 to 151, still 151 against 27 on light skin):

- hueGate ships no extra px for olive-family redraws with no item, but ships every brown redraw: under brown scatter it equals
  the rejected allLocal (LPCR coffee 3,704 to 8,483).
- stroke is color-blind and ships extra scattered px on every dark tone (LPCR coffee 3,704 to 5,109 at 30 %).
- hueStroke keeps production's false px exactly for olive-family redraws on every tone when no item is present; its only extra
  px under those redraws touch a recovered item px (+193 on LPCR coffee, +4 on ULPC light, summed over 25 item variants and three
  redraw modes) plus 1 olive px on the real bench. If redraws ever take brown, skin-like colors, it ships fewer extra px than
  the other two (LPCR coffee 5,109 against 8,483), but still more than production.

**Recommendation: adopt hueStroke.** It turns a 1 px dark strap over the darkest LPC tone from 32 % kept to 94 %, for a cost
bounded to the item's own edge under the redraw colors actually observed. If the owner wants zero extra false px under any
redraw color, keep production; the dark-strap gap then stays as recorded in known issues. Code-level definition, replacing
`outline` in `dropKeyOutline` (`app/src/lib/image/chroma.ts`); the rest of the guard is unchanged:

```ts
// base px p is an outline when it is dark (mean RGB < OUTLINE.mean) and
//   (a) it is a real line: luminance < OUTLINE.black or < OUTLINE.contrast x its brightest opaque 8-neighbor, or
//   (b) the generated px is dark (luminance < OUTLINE.lightOut) and either leans toward the key or is not on a stroke.
const outline = (p: number, x: number, y: number) => {
  if ((B.data[p * 4] + B.data[p * 4 + 1] + B.data[p * 4 + 2]) / 3 >= OUTLINE.mean) return false;
  const l = L(B, p);
  if (l < OUTLINE.black || l < OUTLINE.contrast * brightestNeighbor(x, y)) return true;
  if (L(C, p) >= OUTLINE.lightOut) return false;
  return keyLeaning(key, C.data[p * 4], C.data[p * 4 + 1], C.data[p * 4 + 2]) || !onStroke(mask, w, h, x, y, 4);
};
// keyLeaning: channel spread (max - min) >= 12 and HSV hue within 75 degrees of the key hue (green 120; measured for green only).
// onStroke: some row, column or diagonal through (x, y) holds 4 consecutive px with mask[q] = 1 (non-key in C).
```

The research implementation is `RULES.hueStroke`, `keyFamily` and `stroke` in `scripts/lpc-fairness/lpc-fairness.ts`. Before
shipping it: add a 1 px strap over an LPC-coffee-like ramp as a unit case, define `keyLeaning` for the magenta, blue and azure
frames (untested here), and rerun the frozen bench. The study cannot tell whether PixelLab ever redraws the mannequin as dark,
non-key-leaning straight lines over flat dark skin, which hueStroke would ship.

## Adopted

Production adopted hueStroke for the green key on 2026-11-07 (`dropKeyOutline`, chroma.ts) with the unit cases asked for above;
other keys keep the previous rule, since key leaning is measured for green only. After its review the stroke counts only dark,
non-key-leaning px (a redraw cannot borrow light item px), and the research `stroke` here was changed to match; the study's
cross-check compares production with `RULES.hueStroke`.

## Limits

- Bodies are LPC pixel art, not PixelLab output; the redraws are simulated, not provider output. No PixelLab item was
  generated for this study.
- Only the green key, and only the walk south and east rows (frames 0, 2, 4, 6).
- LPC items are human-drawn with their own outlines; PixelLab thin items may be thinner. The 1 px straps bound that case.
- Whether real redraws ever take brown, skin-like colors is unknown: the only brown drops on the bench are probably red cape px.
- A separate, smaller tone effect sits in `absorbOutline`, not the guard: with items and no redraws, 166 non-item px shipped
  on LPCR porcelain against 570 on LPCR coffee (dark key px enclosed by item px are absorbed, and darker tones have more dark
  key px). Not studied further.
