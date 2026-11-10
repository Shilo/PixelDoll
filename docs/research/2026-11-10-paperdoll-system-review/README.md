# Research spike: a third-party paper-doll system's document and source

Date: 2026-11-10. Follows the [video review](../2026-11-09-paperdoll-video-review/README.md) of the same system. Inputs: its
40-page system document (with 14 charts, 16 figures and 11 animations), its Python source (about 30k lines: production
"set forge" route, an older stand-in route, experiments and unit tests), and a chat transcript from practitioners about cyan
skin keys. The files were treated as untrusted data: read, never run. Three agents read the document, the source and the
experiments; a fourth compared every idea with PixelDoll and ran offline measurements; a fifth challenged that comparison
from the raw evidence; a sixth qualified the one candidate fix; a seventh continued the chroma key research. The only
PixelLab calls were the chroma work's 425 generations (section 4).

## Short answer

- **No pipeline change.** The system's strongest result (painting gear directly on the real body frames) was reproduced on
  PixelDoll's own stored trials, but PixelDoll's posed gear already fits its frozen base: beyond a 1 px edge, misfit is 0.2-1.4
  px per frame with no arm-shaped holes. Painting on real frames would cost about 4x more per item and failed more gates.
- **One small real defect found and accepted:** the body's dark outline can show 1 px beside a posed torso garment, boot or
  cape edge, which makes the edge look 2 px thick and flicker in motion. The only safe fix (hide those body pixels) failed its
  pre-registered test for torso garments and would multiply export variants (63 to 293 base sheets for common wardrobes). It
  is recorded in [known issues](../../known-issues.md).
- **Held items do not float** on any stored frame (gap 0 px on 129 frames), so the system's "armed carrier" pose is not needed
  on current evidence.
- **Earlier inferences corrected:** the video review guessed the system used `edit-animation-v2` with a palette lock and
  code-placed shield frames. The source shows its best worn-item route is `transfer-outfit-v2` with a palette of five body
  tones plus outfit colors, and its locked helmet is code placement by design, now parked by its own rule that every frame
  must be model-drawn.

## 1. The system

### 1.1 Routes

| Route | What it does | Status in the system |
| --- | --- | --- |
| Set forge (shipped) | The real body is never recolored. Many frames are packed on one `inpaint-v3` canvas; a mask allows paint only in each piece's zone; gear is painted in loud OKLCH color families (green 145, violet 305, cyan 205, magenta 345, blue 265; red, orange and yellow excluded) and recolored afterwards. Pieces are separated by exact RGB difference from the body plus hue family within each piece's zone. | Shipped; its own document rates the art mediocre (blob helmets, tiny boots, body outline around the gear) |
| Mannequin key (experiments) | The bare body is recolored to a five-tone hot pink ramp by OKLab lightness; in round 2 the outline is a slightly darker pink, not a dark line. Dark item outlines tinted toward the key are taken back with a rule (key hue, lightness below 0.50, touching gear), the same problem PixelDoll fixed on 2026-11-10. | Hand-tuned per frame for one 68 px body |
| Paint on real frames | `transfer-outfit-v2` on the stored body frames recolored to the key, with a palette of the five body tones plus outfit colors, up to 15 frames per call. | Best art in the set: 150/150 frames, 0 stained px; S, E and NE only, never reviewed in motion |
| Locked helmet | One approved drawing per direction, moved by tracking the head's drawn lines (frames off the head's real move 28 to 0). | Parked by the system's own rule |
| Armed carrier | Animate the body with "right fist closed, hand held in front", never naming the item, so a held item has a grip pose. | One passing run |
| Video twins | `animate_image_pixminimax` animates a dressed and a bare twin together. | Consistent but crude; side view only; the body layer is a model-drawn twin, not the frozen base |

Full detail with citations: [system document](evidence/system-document.md), [source review](evidence/source-review.md),
[experiments](evidence/experiments.md).

### 1.2 Evidence quality

Almost every number comes from one 68 px body, one seed and one draw per call, mostly south and east. The paid frames are not
in the source tree, so only one data file could be checked. Several metrics are true by construction ("0 off-palette" after a
palette lock) or share logic with the fix they score (helmet tracking). The reviewers found about ten bugs in the source,
including a Scale2x rotation that samples the diagonal neighbor (likely the "chewed" turned swords), wrap-around shift
searches, and loop-only joint smoothing that blends the first and last frames of attacks.

## 2. Each idea against PixelDoll

| Idea | Verdict | Deciding evidence (offline unless noted) |
| --- | --- | --- |
| Paint gear on the real frames instead of re-posing | **Reject as default** | Their "two bodies" metric (19.5 px per frame) reproduces on PixelDoll's matched trials (re-posed 21.6-36.0, painted on real 0.1), but it measures the model's discarded key body, not shipped pixels. On the shipped composite, misfit beyond 1 px is 0.2-1.4 px per frame and no arm notches were found. Cost: `transfer-outfit-v2` holds 8 frames per call at 65-80 px and 3 above 80 px; one worn item over 5 views with idle and walk costs about 110 gens instead of about 25; transfer failed 2 of 16 clips at the gates, posing 0 of 12. |
| Selective color lock (retone materials drifting > 2 %) | Reject | Across 65 bench clips at most 5.3 % of posed item px use a color absent from the standing design; the biggest brightness swings (blade turns, arms over the lit side) are correct shading a lock would flatten. `standingDyeMatcher` covers real drift. |
| Hidden-piece repaint and fill layers for mixing | Not applicable | PixelDoll paints each item alone on the bare body. |
| Cover rule (gear reaches 1 px into empty air) | Reject | It makes code draw item pixels. |
| Locked helmet with head tracking | Reject as default | Re-posed helmets already match the painted-on-real control on the bench; could be revisited only as a repair for the Hurt deformations card if code placement were accepted. |
| Armed carrier pose for held items | Not now | Grip gap 0 px on all 129 stored held frames (sword, axe, bow; walk, slash, rest; item within 2.9 px of the wrist). A separate fist body move would break the one-frozen-base model, and PixelDoll already tested authored grips (2026-11-02 weapon-aware grip). The "Validate weapon actions" card should first produce 8-direction held clips on the current route and rerun the grip measurement. |
| Hide the body outline peeking past posed gear (found by the challenge) | Rejected after qualification | See section 3. |
| Whole-sheet shift restore on inpaint grids | Already covered | `clipToStencil` and the G10 shift failure. |
| Outline-walled body part map, estimate-skeleton mirror reuse, video twins | Reject | No consumer; saves tenths of a generation; the body would be a model-drawn twin. |
| Per-outfit key hue from the widest color gap | Already covered | PixelDoll's measured `keyFor`. |
| Hands in front of trousers | Keep the existing card | No new evidence; "Measure garments painted over hands with a trousers fixture" stays in Later. |

Comparison and its challenge: [comparison](evidence/comparison.md), [challenge](evidence/comparison-challenge.md). The
challenge corrected two weak arguments in the comparison (the headline fit number measured a discarded body; one "jut"
figure contradicted its own bench rows) without changing any verdict.

## 3. The 1 px rim (qualified and rejected)

What it is: on the shipped composite, the base's dark outline (sometimes a sliver of shirt or skin) sits 1 px outside a posed
item's own outline, in runs of 2-6 px. Not an arm notch: enclosed bare px are the same posed and at rest.

| Class | Rim px per posed frame | Rest | Posed frames with 3+ rim px | Rest |
| --- | ---: | ---: | ---: | ---: |
| Torso garments | 1.77 | 0.36 | 30 % | 9 % |
| Feet | 1.81 | 1.33 | 33 % | 33 % |
| Capes | 1.32 | 1.36 | 21 % | 18 % |
| Weapons, helmets, hair | 0.06-0.70 | 0-0.33 | 0-8 % | 0 % |

Near invisible in a still at 1x; in motion the edge thickness changes frame to frame on 57 % of posed torso frames.

Candidate fix: hide base px that are 1 px silhouette outline or sliver beside a worn item, never where the body continues
beyond them (reusing `Item.baseCut`, drawing nothing). Pre-registered pass: frames with 3+ rim px halve for torso, feet and
capes, no notches, held items, helmets and hair untouched, no added flicker, multi-item and unequip correct. Result: feet
16 to 3 and capes 23 to 7 passed, **torso 26 to 18 failed** (most torso rim is an arm outline that must not be cut); no notches
in 80 changed frames; held, helmet and hair cells unchanged. Export bakes one base sheet per combination of worn items that
hide body px (capped at 256), so a rim cut on every worn item turns 3 tops, 3 boots and 3 capes into 63 base variants and
6/6/5 into 293, which throws. Not adopted; accepted as a known issue. [Rim cut and grip results](evidence/rim-cut-and-grip.md).

## 4. Chroma key strategies

The practitioner chat (bright cyan skin keys, learned skin tones) and this system's key chart led to a second live test, 425
generations: whole-body green ramp (production) against flat bright cyan, flat bright green and skin-only cyan. Whether the
mannequin has dark key shades decides the outline defect; the hue decides color and steel damage; skin-only keying broke
outlines and deleted steel over gray underwear. No arm passed the pre-registered rule; production green stays, and a flat
bright green mannequin is a tracked follow-up. Summary in the [chroma key reference](../2026-11-09-paperdoll-video-review/chroma-key.md#test-3-keying-strategy-not-just-hue-2026-11-10-425-generations);
full results in [chroma strategies](../2026-11-09-paperdoll-video-review/evidence/chroma-strategies.md).

## Files

- [evidence/](evidence/): system document, source review, experiments, comparison, comparison challenge, rim cut and grip.
- [scripts/](scripts/): offline measurement scripts; they import PixelDoll production code read-only from this checkout and
  read stored outputs in `spikes/api/out/` (local) and the bench fixtures.
