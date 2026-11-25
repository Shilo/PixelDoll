# Handoff: independent review of batch item generation

2026-11-24. Research handoff for a new agent. This document is evidence and suggestions, not a decision. Treat every claim below as a hypothesis to attack.

## Your mandate

You are the independent reviewer and researcher for PixelDoll's batch item generation.

Your job is to challenge, retest and extend the work below, then tell the owner what you actually believe and what to do. Do not accept this document at face value. Rerun the measurements, test the assumptions, look for simpler alternatives, and reach your own conclusion even if it disagrees with everything here.

The owner wants the best approach for allowing batching, both in functionality and in user experience, and the best pipeline for it. "Best" means cheap, reliable, honest about costs and losses, simple for casual users, and compatible with per-item swappable layers.

Research first. Do not implement app behavior until the owner approves the conclusion.

## Where the evidence is

- Branch: `research/batch-item-extraction`
- Worktree: `C:\Users\shilo\.local\share\opencode\worktree\ecf412\batch-item-spike`
- Commit at handoff: `174a4756f` (the handoff commit is on top)
- Main checkout: `C:\Programming_Files\Shilocity\PixelLab\PixelDoll`

Read in this order:

1. `docs/research/2026-11-24-batch-item-generation/README.md`
2. `docs/research/2026-11-24-batch-item-generation/findings/` (all four files)
3. `docs/research/2026-11-24-batch-extraction/README.md`
4. `docs/research/2026-11-24-batch-extraction/findings/` (all four files)
5. `docs/research/2026-11-24-batch-extraction/BRIEF.md`
6. The harness and extractor scripts in `docs/research/2026-11-24-batch-extraction/`

Create your own branch and worktree. Do not work inside the evidence worktree and do not rewrite its history. Read it, copy what you need, and keep your own outputs separate.

Offline tooling used: Python 3.14, Pillow 13, numpy, scipy. Run the scripts from the repository root; they read `app/public/fixtures/s2`. No paid call is required to rerun the offline work. Generated media is git-ignored in `out/` and `out_ref/`; the markdown tables and small JSON files are committed.

## The goal

Let a user generate several equipment items for the same character and animation with less cost than generating each item separately, without silently corrupting layers or the paperdoll contract.

Hard constraints:
- The app is client-only and calls PixelLab v2 from the browser.
- Only the models in `AGENTS.md` are allowed; anything else needs an owner decision.
- Each item must remain a complete, frame-aligned, separately exportable layer when the mode promises separate layers.
- Paid costs and irreversible losses must be disclosed before spending.
- No backward compatibility is required, but old data must not brick the app.

## What we found (claims to verify, not facts)

### Public PixelLab surface

- The live OpenAPI had 140 paths on 2026-11-24, up from 102 in the repository snapshot. No paperdoll, equipment-slot, wearable or multi-item-per-animation endpoint was found.
- The closest public features are Transfer Outfit, Create Character State, 1-direction objects with `item_descriptions`, 8-direction objects, `generate-8-rotations-v3` with `direction_images`, UI split-template states, and `inpaint-image-pro-flash` changes-only output.
- We found no public evidence that PixelLab's website has a paperdoll batch mode. If the owner saw one behind sign-in, it is not public and must not be cited as public capability.
- The API may have changed again. Re-fetch the spec and the docs before relying on this.

### Cost model

For one 3-view, 6-frame move at 64 px:

| Shape | 2 items | 3 items | Notes |
|---|---:|---:|---|
| Separate, default skeleton route | 38 | 57 | 19 per new item: 10 dress + 9 pose |
| Shared dress request, separate images | 28 | 37 | One 10-gen dress call plus 9 per item |
| Anchored route, current | 60 | 90 | 6 edit calls per item |
| Shared body, one composite | 19 | 19 | Any item count |
| One outfit layer | 19 | 19 | One layer, not swappable |

These are model estimates from the app's price functions, not receipts. Recompute them from the code and verify actual billing live.

### Deterministic separation (offline simulation)

We alpha-composited the accepted S2 item layers into a synthetic shared-body composite and tried to recover each item.

- Disjoint items were recoverable. The best extractor made 0 assignment errors on the auto-batch-safe group (vest, hat, sword), 96.0% tolerance-1 IoU under a 1 px shape change, 100% on exact art and palette drift. Worst disjoint pair: 94.0% tolerance-1 IoU.
- Overlapping items were not recoverable as complete layers. Hidden pixels do not exist: 85.5% of hair under a steel helmet, 46.6% of a vest under a cape, up to 100% in some frames.
- Connected components merge touching items. Palette distance is the only reliable separator on this fixture.
- The pre-pay detector that worked was: different slots, same class, one chroma key, no standing silhouette overlap in any direction, at least a 2 px standing gap, and no reference palettes within 18 RGB. It had 0 false safes at a 4 px overlap bar, and 1 residual 3 px contact at an any-pixel bar.
- Slot alone was 50% false safe. Standing overlap alone was 22% false safe.
- The automatic verifier missed 46.2% of assignment errors. It is a review router, not a certification.
- Union-find grouping merged all six items and must not be used. Safety is not transitive.

### Suggested product shape

1. Separate generation, today's default.
2. Generate together, separate layers: one request, each item on its own mannequin image. Safe by construction, needs a live probe.
3. Draw together on one body: one composite, split only for detected-disjoint groups. Conditional on a live probe and mandatory review.
4. One outfit layer: one drawing kept as one item. Cheap and coherent, but not swappable. Parked.

Suggested default: separate, with the together option priced and visible. No permanent setting.

## Why these claims may be wrong

Attack at least these:

1. **Fixture bias.** One 64 px character, six items, three directions, two moves, no keypoints, no 8-direction rig, no held-item canvas beyond the sword. The 94% worst-pair margin is thin.
2. **Simulation bias.** Alpha compositing of accepted art models occlusion but not a model redrawing the body and all items in one pass. It also assumes the model draws each item exactly where the reference says.
3. **Drift model.** The measured drift was applied as a constant RGB offset, one morphology and one shift. Real generation varies per frame and per item.
4. **Reference leakage.** The extractor uses an accepted reference cell and its mask. A real pipeline has to create that reference before the batch and must not use the batch's own output as the reference.
5. **Metric choice.** Strict IoU collapses under a 1 px shape change that may be visually fine. Tolerance-1 IoU may be too generous. Decide which bar the product should use.
6. **Detector validation.** Rule C was validated on two moves of one body. A false safe causes permanent loss. Test more bodies, sizes, directions, moves, held items and 8-direction rigs.
7. **Verifier weakness.** A 46.2% false pass is not a gate. Either find a completeness signal that compares to the generated item-colored area, or keep mandatory human review.
8. **Cost.** The 10-generation floor and the frame caps are contract facts, but actual billing and model behavior need live receipts.
9. **UX.** The grouping preview and warnings were designed, not tested with users. Test whether users understand "different slots", "no overlap in standing views" and "not checked for motion".

## Live testing budget

The owner approved up to **1,000 generations** for live testing and qualification. This is real money.

Rules:
- Check `GET /balance` before and after. Log the receipt and the delta.
- Start with the smallest decisive probe. Do not spend the budget because it exists.
- Never auto-resend a paid request after a failure.
- Stop when a probe is decisive. A failed probe is a result.
- Use the agent server (`npm run dev:agent`) for browser checks, or a server-side key for direct calls. Never print, log, screenshot or commit the token or `.env`.
- Use stored S2 frames and existing accepted art as inputs where possible.
- Keep every prompt, seed, request body and receipt in the research folder, with base64 stripped.
- If a call fails validation, fix the request before spending again.
- Prefer paired arms with one variable at a time.

Starting probes, not a fixed plan:

1. **Request-level batch, 10 generations.** One `edit-animation-v2` request with two items' own mannequin images. Does the model keep each item's design separate or impose one design on all images? Check whether the per-image prompt mapping is respected.
2. **Shared-body disjoint group, 10 generations.** One call with the eight walk/south chroma cells and the vest, hat and sword prompt. Run the reference extractor on the result. Kill if wrong-item share exceeds 1% or tolerance-1 IoU falls below 90% for any item or frame.
3. **Palette collision, 10 generations.** Helmet and sword, which the offline work says should fail. If it passes live, the 18 RGB rule is too strict. If it fails, the rule is confirmed.
4. **Overlap, 10 generations.** Cape and vest, which the offline work says cannot be split. Confirm the hidden-pixel loss live so the product warning is based on a real result.
5. **Second body or size.** Repeat the winning shape on a second body, 96 px or 128 px, and one 8-direction or diagonal case. This is where the 94% margin is most likely to break.
6. **Held item.** Test whether a shared-body group can include a held item on the 96 px canvas without breaking the pivot, grip and hand mark.

Spend the remaining budget only on questions that change the recommended pipeline or UX. Do not use it to polish a route that is already rejected.

## Open questions

- Does one request with several items' own images preserve each item independently, or does the model treat them as frames of one animation?
- Can a shared-body call draw several items coherently, or does it merge, omit or misplace them?
- Can the extractor's reference be created from the standing dress step without an extra paid call? What is the minimum reference data?
- Is the 18 RGB palette rule correct, too strict or too loose on real generated colors?
- Does the verifier have a completeness signal that works, for example the generated item-colored area in the composite versus the extracted area?
- What is the best UX for showing groups, overlap risk, loss and per-item fallback? Does the user understand it?
- Should the product ever offer a merged outfit layer, and if so, is it a new slot or a custom slot?
- What is the smallest data-model change for a shared request record, per-item frame mapping and cost ownership?

## Deliverables

Produce your own research folder, for example `docs/research/2026-11-24-batch-review-independent/`, with:

1. A README that states your independent verdict and recommended pipeline.
2. Your retest results, including every number you could not reproduce and why.
3. A live-test ledger with requests, seeds, generations and receipts.
4. A UX recommendation with the exact copy and the states a user sees.
5. A cost table recomputed from the app's price functions and checked against receipts.
6. A board card or card update for the recommended next step.
7. A short list of what you would still not ship and why.

Do not implement the feature unless the owner asks. If you do implement later, follow the repository rules: one card, worktree and branch, tests at the cheapest level, format changed files, and no paid call without consent.

## What the owner needs from you

One clear answer:

- Which batching modes are worth building, in what order?
- What exact detection rule, extraction algorithm and verification gate should ship?
- What should the default be, and what must the user see before paying?
- What is the expected cost and failure rate, with live evidence?
- What should we explicitly not build?

Then the evidence behind it, and the remaining risks.
