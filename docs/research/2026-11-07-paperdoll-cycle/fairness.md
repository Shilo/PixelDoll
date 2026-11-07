# Rim guard and skin tone

Date: 2026-11-07. Free, offline. Scripts: [scripts/fairness/](scripts/fairness/).

## Problem

The rim guard (`dropKeyOutline`, `app/src/lib/image/chroma.ts`) drops a non-key pixel when the body under it looks like an
outline and two of its neighbors are key, because PixelLab often redraws the mannequin's outline in a non-key shade. Until
this change "looks like an outline" included "mean RGB below 60". A deep skin tone's own midtones sit under 60, so a thin
belt or strap over a darker-skinned body lost more pixels than over a lighter one.

## Rules compared

| Rule | Dark when |
| --- | --- |
| absolute (old) | mean RGB < 60 |
| relative 0.20 | luminance below 20 % of the cell's own luminance range |
| local 0.5 | luminance under 0.06, or under half of the brightest 8-neighbor |
| absolute + local 0.5 | both of the above: under 60 and much darker than a neighbor (near-black always counts) |
| **adopted** | mean RGB < 60, and, only when the generated px is light (luminance >= 0.25), also near-black or under half of the brightest neighbor |

## Results

Synthetic thin items (belt, black strap, necklace, baldric) over real bench bodies A (64 px) and N (160 px), with skin recolored
light, medium and deep and three provider redraw modes. Kept item px through the whole production extractor
(`shipped-layers.ts`):

| Body | Old light | Old medium | Old deep | Absolute + local | Adopted light | Adopted medium | Adopted deep |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A (of 201) | 191 | 191 | 188 | 191 (all tones) | 191 | 191 | 191 |
| N (of 453) | 421 | 421 | 413 | 439 (all tones) | 427 | 427 | 425 |

**Why not absolute + local.** It kept the most item px, but the independent review showed it stops guarding dark clothing and
deep-skin shadow against the dark mannequin redraws the guard exists for. Scattering olive 48,46,11 over dark key shades on all
150 cells of the four bench bodies, with no item present, shipped 500 false px on light skin and 1,282 on deep skin at a 15 %
rate (old rule: 108 and 122); at 30 %, 2,664 and 5,405 (old: 1,253 and 1,409). The fairness probes above could not see this:
their redraws sit on near-black base px, which every rule treats as dark.

**Adopted rule.** Mannequin redraw colors (48,46,11, 27,40,4, 36,49,12) have luminance 0.13 to 0.17, a brown belt 0.32 and silver
0.7. Testing contrast only for light generated px keeps the gains for light thin items and gives exactly the old false px in
every scattered-redraw case. Dark items (a black strap) keep the old behavior, including its skin-tone gap: on the review's
synthetic set a black strap keeps 2,779 of 3,304 px on light skin and 2,567 on deep skin under both the old and adopted rules.

**Real corpus.** The 20 frozen bench cases' shipped layers change in 10 px, all additions: 7 px of the a-bow96 string, 2 px of an
a-stripes-azure stripe edge, and 1 px at a-axe96 walk/east/3 that is likely the corner of a redrawn body outline, kept because
its neighbor on the handle now anchors it. The bench report changes only one area spread (a-bow96 0.122 to 0.124).

**Rejected alternatives.** The relative rule added a new 7 px floating speck to a real cloak frame (n-cloak128 walk/south/1):
olive mannequin shade over dark shorts. Local contrast alone lost 2 px on body A. The generated color alone cannot separate
dark item px from mannequin shades: every dark color lies within about 30 to 40 of the key ramp's dark end (`rampDistance`).

## Limits

Dark thin items still lose more px over deep skin than over light skin. Synthetic bodies recolor only the warm skin px of two real
bodies; the redraw study used the green key only; there is still no human-drawn multi-tone ground truth (LPC bodies, ecosystem
rank 4).
