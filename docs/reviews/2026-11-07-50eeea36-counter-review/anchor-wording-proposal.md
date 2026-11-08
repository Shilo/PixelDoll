# Anchored held-item wording: evaluate a small, separate change

Review recommendation only. No PixelLab request, balance query or paid experiment is authorized or executed by this document.

Anchored equipment should eventually express which hand the selected slot represents and that only one instance of the requested item is added. Those are product requirements. That does not establish which wording will satisfy them without changing frozen body pixels.

The full S5 phrase also prescribes downward orientation and unchanged arms. It was qualified on the skeleton route. Copying that entire phrase into anchored editing would bundle an untested orientation policy into a different route. Keep the current anchor behavior until a bounded comparison supports a replacement.

## Candidate arms

Use existing `itemPrompt` and reference/target packing unchanged. Change only the item phrase passed to it:

| Arm | Item phrase |
| --- | --- |
| A | Current plain item description |
| B | `{item}, held in the character's right hand` for main hand; left for off hand |
| C | B plus `; add exactly one instance of this item in each editable target frame` |

Do not add “pointing down,” a weapon-only noun, a new arm pose, or “nothing in the other hand” in this experiment. The opposite hand may contain imported artwork that the frozen-body contract must preserve. A versus B isolates hand naming; B versus C isolates item count. These candidates are hypotheses, not generation-quality claims.

## Offline prerequisites

- Compare actual dispatch, new-item preview and resumed-draft preview for every arm, both slots and representative native sizes. Keep reference ordering, seeds, image sizes and masks fixed; check description limits after construction.
- Retain an ordinary worn-item negative control, so anchor wording cannot leak into head/body clothing.
- Prepare paired exact frozen source images with independently labeled visible hands and independently drawn directions. Include near/far hand occlusion and an imported source with protected opposite-hand pixels.
- Derive call counts and estimates from the concrete request plan. An experimental condition is not necessarily one request, because edit calls can split at native frame caps.
- Hand and object-count QA must not use the same noun/hand matcher as its ground-truth judge. Store artifact hashes and report uncertainty rather than silently guessing the visible hand.

## Future paid qualification, only if the owner authorizes it

Use equal seeds for A/B/C on two proportionally different bodies, a main-hand blade, an upright non-weapon and a normal off-hand shield. Keep a contradictory main-hand shield separately labeled if used at all. Score raw output, extracted layer and composite across the complete frozen clip; a dressed standing view alone cannot qualify the route.

Require correct intended hand, one item, preserved body/other-hand pixels, stable grip and design, aligned frames, consistent views and valid extraction. Report pass/warn/fail and provider failures separately. Reuse only exact completed request identities; never auto-resend ambiguous work. Stop rather than expanding an unsuccessful comparison indefinitely.

The preexisting hidden-view note loss is a separate offline follow-up. It can be worth fixing without buying generations, but first preserve its meaning: the current `plainReason('G4 ...')` becomes “The item is missing in some frames.” Simply saving a legitimate-occlusion note through that formatter would mislabel it. Use hidden-view and genuinely missing-item controls and prove Keep/reopen/merge/export if that work is authorized.
