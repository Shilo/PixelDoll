# Proposed orientation-only held-wording experiment

**Proposal only. No requests submitted, no budget approved by this document, and no PixelLab balance or price queried.**

The historical minimal/negative comparisons bundled hand, arm-freezing, object-count and orientation changes, with unequal seeds. They justify retaining the current wording for now but do not isolate the orientation clause's effect. A future test should change one factor and score final paper-doll compatibility.

## Arms

- A: exact current production wording and current pose/grid builders.
- O: remove only “pointing down and slightly outward” from the dress wording. Keep the item description, named hand, arm-freeze sentence, exact current one-item clause, negative clauses and all pose/grid descriptions unchanged.

Example main-hand O:

> {item}, held in the character's right hand; exactly one weapon, no other weapons, no scabbard, no shield; the arms stay exactly as they are

Off-hand O retains “left hand” and “exactly one held item, nothing in the right hand.” This is an ablation for causal diagnosis, not a claim that the noun “weapon” is ideal for every held object. Do not change it in the same experiment. A separate later factor may test object-neutral wording if needed.

Earlier no-orientation trials, including the expanded-padding sword experiment, make success uncertain. Their poor results are relevant negative evidence. This proposal is useful only if the owner wants a balanced causal comparison or a new body/pose qualification, not to repeat unsuccessful variants indefinitely.

## Frozen plan before any approval

1. Select two independent frozen native bodies with different proportions and right/left grip visibility, three item families (ordinary sword, upright torch, off-hand shield), and two paired seeds. That is **24 experimental conditions** across both arms, not a quoted number of API requests. Exclude the contradictory main-hand-shield case from acceptance rates; keep it as an optional separately labeled stress condition.
2. Record exact raw body/rest hashes, size, direction coverage, padding, stored requested/measured poses, slot and request JSON. Use production request builders and calculate the actual call plan offline; native size/frame caps can split dress requests. Resolve the preexisting zero-padding semantic gap before claiming cross-size parity.
3. Give the owner that concrete plan, request count and an explicitly uncertain estimate based on applicable documented pricing. Obtain any required final paid approval. Reuse only genuinely identical completed request identities. Never resend unknown requests or substitute another seed silently.
4. Compare both arms at dress stage, then qualify both through the same final idle/walk poses. Dress success alone cannot win. Preserve matching successful and failed conditions rather than advancing only the preferred arm. Stop on unresolved submission/billing ambiguity rather than adding replacement trials.

## Predeclared scoring

- Required: intended hand; exactly one object; frozen body preservation; canvas/pivot alignment; design/material/size preservation; visible intended grip; valid extraction and cuts; acceptable orientation for that item; animation/direction consistency; no unreviewed artifact or disappearing terminal part.
- Score each field independently for every view/frame. Distinguish ordinary occlusion from wrong hand and extractor loss from raw generation failure.
- Use blinded labels where practical; include raw output, extracted layer, composite and temporal playback. Track disagreements and uncertain ownership instead of forcing a good/bad label.
- Report body/item/seed conditions, not independent-frame significance. Keep provider failures and all charges in the denominator ledger. Report pass, warning and failure separately; do not combine warning with clean success without showing both.
- Require the candidate to preserve ordinary sword and off-hand-shield controls while improving upright-object intent through the full pipeline. A cleaner standalone torch that moves the body or changes hands fails the modular-paper-doll objective.

No wording should be promoted on this proposal alone. If O fails, preserve that negative result with exact scope and stop treating orientation removal as an established improvement.
