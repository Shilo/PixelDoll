# Shared-body batch generation: auto-batching and deterministic extraction

2026-11-24. Branch `research/batch-item-extraction`. Research only: no app behavior changed, no paid PixelLab calls, no token use. Every number comes from the accepted S2 fixture or public PixelLab sources.

Read with:

- [BRIEF.md](BRIEF.md): the question and constraints.
- [separation-baseline.md](findings/separation-baseline.md): four baseline extractors, disjoint versus overlapping pairs, and injected drift.
- [auto-batch-detector.md](findings/auto-batch-detector.md): can the app predict which items are safe to batch before paying?
- [reference-extractor.md](findings/reference-extractor.md): the reference-guided extractor, its ship thresholds, the verifier, and the live probe.
- [ux-and-pipeline.md](findings/ux-and-pipeline.md): the three modes, the grouping preview, warnings, and the smallest safe implementation.

## Answer

**The owner's idea works, but only for items that never overlap.** For disjoint items, a shared-body generation can be split back into separate layers deterministically. For items that overlap in any frame, it cannot: the hidden pixels do not exist, and touching items merge.

- **Extraction:** on the auto-batch-safe group (vest, hat, sword), the reference-guided extractor made **0 assignment errors** in 42 item-frames, with 96.0% tolerance-1 IoU under a 1 px shape change and 100% on exact art and palette drift. Worst disjoint pair: 94.0% tolerance-1 IoU, 0% wrong-item pixels.
- **Detection:** the winning pre-pay rule is different slots, no standing silhouette overlap, at least a 2 px standing gap in every direction, and no reference palette within 18 RGB. On the fixture it had **0 false safes** at the 4 px material bar. Slot alone is 50% false safe; standing overlap alone is 22%.
- **Verification:** the automatic verifier cannot certify a layer. It catches gross failures but false-passes 46.2% of assignment errors, so a human must still review every frame.
- **Cost:** a shared-body batch costs about 19 generations for any number of items on a 3-view 6-frame move, against 19 per item separately. Three items: 19 versus 57.

So the first spike's "dead for separate layers" was too broad. The correct statement is: **dead for overlapping items, viable for a detected-disjoint subset, with review.** Whether the model actually draws several items coherently in one pass is still unproven; that is one 10-generation probe.

## 1. What changed from the first spike

The first spike measured accepted layers and concluded that a composite cannot be split. That is true for overlapping items. This spike tested the case the owner described: group only items that are in different slots and do not overlap. In that case the union is the sum of disjoint regions, so a per-item color model can recover each region. The measurement confirms it.

The two findings are compatible:

| Case                                    | Extractable?     | Why                                                                           |
| --------------------------------------- | ---------------- | ----------------------------------------------------------------------------- |
| Items overlap in any frame              | No               | Hidden pixels never exist; touching items merge                               |
| Items disjoint in every frame           | Yes, with review | Each item's pixels are present and separately colored                         |
| Predicted disjoint, but motion overlaps | No               | The prediction is a standing-view claim; post-generation checks must catch it |

## 2. The pre-pay detector

Do not use slot bands as the safety test. They separate head from legs, not hair from hat or vest from cape. Use this rule, in order:

1. **Different slots.** Same-slot items cannot be worn together and always overlap.
2. **Same class.** Worn with worn, rigid with rigid. Never mix a held item into a worn group: held items use a 96 px canvas, a shared pivot and a hand mark.
3. **One chroma key.** A second key can delete a whole item. Group by key.
4. **No standing silhouette overlap in any direction**, using the stored standing layers.
5. **At least a 2 px gap** between the two silhouettes in every direction. Pairs that sit 0 to 1 px apart while standing are the ones that collide in motion.
6. **No palette collision:** refuse a pair whose reference palettes have any color within 18 RGB, the top of the measured drift. This is what rejects helmet plus sword, the only disjoint pair with real assignment errors.
7. **Frame cap:** the group's rest views must fit one call (16 images at 64 px, 9 at 80, 4 above).

On the S2 fixture this produces one batch group: vest, hat, sword. Under the safe UX rule that excludes held items, it is vest and hat. Everything else stays separate. That is a modest but real saving, not a free-for-all.

Detection is not transitive. Do not use union-find: on the fixture it merged all six items into one group. Use greedy pairwise-safe groups and show each group to the user.

## 3. The extractor

Per item, per frame:

1. Color likelihood from the accepted reference palette, with a sharp scale (sigma 8 RGB). A flat scale ties near-identical colors such as the hat's gold trim and the sword's gold hilt.
2. Reject the chroma key and the known base palette.
3. Soft priors: slot band from the current body geometry, the registered reference mask, and the previous frame's mask.
4. Z-order tie-break when two items claim the same pixel, recording the pixels the lower item loses.
5. Component cleanup and temporal inheritance across frames.

Measured ship bar: **at most 1% wrong-item pixels and at least 90% tolerance-1 IoU.** The worst disjoint pair has a 4.0-point margin. That margin is thin on one 64 px fixture and should be re-measured on a second body before it becomes a hard gate.

The verifier (area, palette, boundary, empty frames, z-order violations) is a **review router**, not an accept gate. It blocked gross failures and ranked frames, but missed 46.2% of assignment errors. Never auto-accept on it.

## 4. The three modes

| Mode                               | What one paid request draws         | Layers                                                 | Status                                                    |
| ---------------------------------- | ----------------------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| Separate                           | One item's own mannequin images     | One complete layer per item                            | Ships today                                               |
| Generate together, separate layers | Several items' own mannequin images | One complete layer per item                            | Safe pending a 10-gen probe; saves the 10-gen dress floor |
| Draw together on one body          | Several items on one body           | One composite, split only for detected-disjoint groups | Conditional on the probe and review                       |

**Recommended default:** separate, with the together option visible and priced. After the probes pass, the owner can preselect together for eligible groups. No permanent setting; the choice is per submission.

**Grouping preview:** show the proposed group, the reason per item ("different slot", "no overlap in standing views", "same key"), the group price against the separate price, and a "Keep separate" control. Never auto-submit.

**Image review:** show every generated frame for every item, a conflict heatmap, and, for one-drawing groups, the pixels each item lost. Say **"Not checked for motion"** next to any standing-view claim. Never say "safe".

**Warnings:** one job for the group, all-or-nothing failure, no per-item retry inside the request, and for one drawing, permanent loss of any pixels under another item. Keep good items if extraction fails; price a per-item fallback and ask before spending.

## 5. Proposed live probes (needs approval)

The offline work cannot see three things a real call changes: the body is redrawn, the model may drift the design per frame, and one key must suit every item.

| Probe                    | Generations | Question                                                                                                                        | Kill condition                                                               |
| ------------------------ | ----------: | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Safe request-level batch |          10 | Can one request dress two items on their own mannequin images without blending the designs?                                     | One design imposed on both, order changed, or billed above 10                |
| Shared-body group        |          10 | Does one call draw vest, hat and sword coherently on the eight walk/south cells, and does the extractor still hit the ship bar? | Wrong-item share above 1% or tolerance-1 IoU below 90% for any item or frame |
| Fixture qualification    |          30 | East with all three, north and cross-punch with vest and sword                                                                  | Same bar; stop on failure, never resend                                      |

Total 20 to 50 generations, about $0.10 to $0.25 at the planning ratio. The shared-body probe request is written out in [reference-extractor.md](findings/reference-extractor.md#cheapest-live-probe).

## 6. Limits

- One 64 px character, six items, three directions, two moves, no keypoints in the fixture, no 8-direction rig.
- The offline composite is alpha compositing of accepted art. It models occlusion exactly but not a model redrawing the body and all items in one pass.
- The drift is the measured magnitude, not a sample: a constant color offset, one morphology, one shift.
- The palette-collision threshold of 18 RGB comes from the measured drift, not from an extraction experiment.
- The verifier's completeness signal compares to the accepted reference area, not to the generated item-colored area. That is the first thing to improve if the mode ships.
- PixelLab's internal extraction is not public. Nothing here depends on it.

## 7. Recommendation

1. **Build the safe request-level batch first.** It keeps separate layers by construction and saves 10 generations per extra new item. One 10-generation probe decides it.
2. **Add the auto-batch detector and grouping preview** even for that mode, because it is the same user-facing idea and it prevents useless groups.
3. **Treat the shared-body mode as a second, conditional stage.** Ship it only after the 10-generation probe passes, only for detected-disjoint groups, with mandatory review and the loss warning.
4. **Do not ship a general "draw everything together" switch.** The evidence supports a conservative, detected subset, not a blanket mode.

## 8. Files

Scripts and outputs live beside the findings: `harness.py`, `reference_extractor.py`, `verifier_sweep.py`, `pair_truth.py`, `evaluate_rules.py`, `out/` and `out_ref/` (git-ignored generated media).

External sources are the same public PixelLab pages and the repository evidence cited in the first spike; no private PixelLab information was used.
