# Paper-doll improvement cycle (2026-11-07)

One run of the [repeatable improvement workflow](../../handoff/paperdoll-improvement-cycle.md). Starting revision `6a33fd37` on `main`, clean tree. Board card: [Research and test external sprite tools for PixelDoll ideas](https://github.com/users/Shilo/projects/7) (Progress). Baseline before any change: `npm run check` 0 errors; `npm test` 1,890 passed, 1 skipped.

## Artifacts

| File | Content |
| --- | --- |
| [inventory.md](inventory.md), [inventory.json](inventory.json) | 272 repository documents and artifacts with dispositions (78 read in full), contradictions, claims the code no longer honors, unrun experiments |
| [provider.md](provider.md), [provider-schema-drift.json](provider-schema-drift.json) | Hosted OpenAPI (SHA-256 `3f30f844…`) against the 2026-10-20 snapshot, request-builder map, MCP and REST differences |
| [extraction.md](extraction.md) | Chroma, rim guard, despill, cleanup and gate challenge on 627 real cells and 22 synthetic ground-truth mutations |
| [motion.md](motion.md) | Held-item geometry, grip side, weapon polarity, padding round trips, contact |
| [ecosystem.md](ecosystem.md), [search-log.md](search-log.md) | Recursive discovery, new vocabulary, seven pinned acquisitions, replays on LPC ground truth |
| [code-map.md](code-map.md) | Current production call chain from New item to export, doc and code disagreements, gap matrix |
| [challenge.md](challenge.md) | Fresh independent reviewer's two-way challenge of the spikes and the code |
| [dye-ramps.md](dye-ramps.md) | Qualification of adjacency-based dye ramp merging on labeled PixelDoll items |
| `scripts/` | Reproducible offline scripts; they import production helpers. Run from the repo root with `node <file>.ts`. Large outputs and downloads live outside the repository in `checkouts/cycle-2026-11-07/` |

Claims in the spikes carry evidence labels (source, offline reproduction, paid experiment, inference, untested). Scripts ran on Node 25.0.0, not the pinned 24.22.1; production checks below ran through the repository's own npm scripts.

## Decisions

| Candidate | Evidence | Decision |
| --- | --- | --- |
| Signed held-item direction in G9 | A blade reversed about the hand kept its principal axis and passed in 28 of 30 clip runs. Production gates now fail all 6 sword and axe walk reversals; baseline verdicts and 45 playlist controls are unchanged. The reviewer showed a 90 degree threshold would silence 45 to 90 degree turns, so the signed angle replaces the unsigned one only when decisive, under the existing 30 degree limit. A stored shield clip exposed sideways centroids (`abs(cos)` mostly under 0.5), so the centroid must also lie within 45 degrees of the axis. Items reaching under 10 px stay unsigned (dagger proxy false fails). | **Implemented** (`items.ts`, `HELD_SIGNED_REACH`) |
| G8 grip distance at pixel centers | Keypoints are pixel-edge coordinates, anchors pixel indices; `nearest` measured to pixel corners, a half-pixel bias against the 2 px side margin. 0 of 15 bench clip decisions change. | **Implemented**: pixel centers, anchors +0.5 |
| Held repair disc | The fixed 34 px disc is smaller than a 64 px body's sword reach (about 39 px), and the stencil silently cut the tip. One view's own keyframe underestimates its posed reach by up to 1.8 px; the largest over all dressed views stays within 0.9 px. | **Implemented**: max reach of the largest component over dressed views + max(4 px, 10 %), never below 34 |
| Despill of green-leaning gear | Turquoise kept 64 of 254 exact colors, jade and fern 0. CF2b was rejected by the reviewer (tinted grays regain green). CF2c keeps the raw color only when nothing snaps, the pixel scores below the key with a real excess, and the despilled result is not near-gray. | **Implemented**: 254/254, 166/166, 78/78 exact; 0 of 627 real cells change |
| Saved-item review reasons | The item panel guessed reasons from fixed thresholds (G3 at 0.02 where posed frames gate at 0.05; G5 on actions that skip it) and could list duplicates. | **Implemented**: `qaReasons` names gates only for parts that did not pass, at their own limits |
| Failed-move Try again price | The estimate was computed but shown only with saved frames. | **Implemented** |
| Stale architecture and known-issues text | Automatic re-rolls, grid fallback and G3 key switching no longer run (consent change 2026-10-28); Add idle + walk adds body moves only. | **Corrected** |
| Rim guard restoration (CF1b) | Restores thin belts on dark bodies, but redrawn mannequin outlines rise from 485 to 1,202 false pixels on the 160 px body; production skin-tone gap measured by the reviewer is modest (355 vs 362, 1,696 vs 1,728). Two vetoed variants remain. | **Rejected as specified; deferred** pending visual review of 6 and 18 real candidate pixels and human-drawn multi-tone ground truth |
| Body-palette check for repainted skin | Flags 0 of 627 real cells exactly, catches only exact copies, and misses or false-flags unevenly by skin tone. | **Rejected** |
| Dressed-keyframe skeleton as `first_frame_keypoints` (E1) | Paid estimate check below: bare controls reproduce rest joints within 0.11 px, dressed keyframes drift 0.35 to 1.01 px mean, up to 2.64 px, while the pose is unchanged. Sending them would encode false pose offsets against the body's shared keypoints. | **Rejected** without the 19-generation pose A/B |
| Adjacency dye ramp merge | On 45 labeled PixelDoll materials: production 33 exact, proposed hybrid 30 with 6 cross-material items (clothes with skin, gold guard into blade). A guarded variant reaches 36 but its limits were tuned after seeing both corpora. | **Rejected as proposed; guarded variant deferred** to blind held-out items |
| 13 to 14 frame pose price | REST documents only 3, 8 and 15 frames; the 4-generation quote errs high. | No change |
| Signed check on action clips, contact and reach warnings, per-frame grip export | Thresholds rest on two items or are untested in engines. | Deferred |

## Paid ledger

| Date | Requests | Purpose | Reported cost |
| --- | --- | --- | --- |
| 2026-11-07 | 14 × `estimate-skeleton` through the production `joints()` path in Agent mode | E1 discriminating check: 10 dressed bench keyframes (a-cape, a-chest, b-cloak, b-tunic, a-helmet; south and east) and 4 bare-body controls. Packet file SHA-256 `b8caee36…`, built by `scripts/provider-estimate-packets.ts` | $0.0724 USD, 0 subscription generations; all 14 completed |

Balance observations, not reconciled: the account read $14.31 USD credit before the run and $24.16 after, with 0 of 10,000 subscription generations left (Tier 3). The increase cannot come from these requests; it is recorded, not explained.

## Verification

- `npm run check`: 0 errors. `npm test`: all files pass, 1 existing skip (1,932 tests at the final run, which includes two motion test files another agent added concurrently; new here: `qa-reasons`, `despill-own-colors`, long-blade repair disc, reversed blade G9).
- Re-review of the implementation ([challenge.md](challenge.md)) confirmed reversal coverage on 24 of 24 curved, hooked and off-axis weapon shapes and found four defects, all fixed before commit: a test comment that swallowed an assertion, skeleton items' standing views judged at the stricter G3 limit in `qaReasons`, three stale architecture passages, and a displaced doc comment. The repair disc now measures reach on the largest component so a detached fleck cannot widen it.
- Each new regression test fails with its fix reverted and passes with it.
- Updated tests and why: the despill expectation pinned the old half-despilled olive output (its no-distant-snap intent is kept and a key-scoring case added); two raw-key tests pinned corner-based wrist distances.
- `npm run e2e -- studio`: 54 of 56 passed on the first run; the two failures were this cycle's new locators (the accessible name is "Try again · Est. N gens"). Both pass after the fix.
- Motion probe through production gates after the change: reversal about the wrist fails 6 of 15 clip runs (every sword and axe walk; slash is unchecked and bows abstain), controls 45 of 45 silent.

## Live Agent-mode test (after the audit fixes)

Browser: the Claude desktop app's built-in browser pane, on the agent server at `localhost:5199` with the Agent mode badge. All
105 requests completed, $1.4343 USD and 0 subscription generations, read from the tab's job ledger (the shared balance also
moved with another agent's work).

| Step | Result |
| --- | --- |
| New character (64 px, Top-down 4, brown skin), Add idle + walk from the creator | Created. Idle failed at publication with a false "changed in another tab": the Studio's first open saved the garment-region split, which changed the rig body hash. Fixed (`41411fca`, move version leaves the body hash out); the retried Idle and the queued Walk published. |
| Sword (main hand), red cape with gold clasps, leather backpack, iron lantern on a chain (off hand) | Cape and backpack passed and saved themselves. Sword and lantern flagged the east view's hand (PixelLab drew both in the near hand, the known side-view limit). The lantern also had real stand-in body drift (G3) and offered a measured magenta background. |
| Review after a reload | Only one of two review cards loaded: concurrent checks overwrote each other's results. Fixed (`2dbbbf80`). Item names and the hand note text were also corrected (`82b0f424`). |
| Try again | The lantern's retry ran on magenta as promised and lost its G3; the sword's retry passed with only a "grip side unclear" note in east. Both kept. |
| Walk for all four items (skeleton route) | Cape, backpack and sword passed every direction (sword right hand throughout, area CV 1.7-7.3 %). Lantern passed south and north (left hand) and failed only the east hand check. No false G5 or G9 failure on any item. |
| Reload and export | Reload kept every move and item. The PNG + JSON, Godot, Phaser and Aseprite export built 432 files with no errors or warnings. |

Observation kept for later: when a keyframe fails G3 because the provider redrew the stand-in body, the measured retry key can
still switch (green to magenta for the lantern). It was harmless here, but the hint's stated reason is imprecise.

## Resumption

No paid job is pending or unknown from this cycle. The agent server ran on `localhost:5199` in Agent mode. Next discriminating work, in order:

1. Visual review of the 6 and 18 real pixels the vetoed rim-guard variants add (`scripts/challenge/rim-despill-challenge.ts`), then a multi-tone human-drawn body set (LPC bodies, ecosystem rank 4) as independent ground truth.
2. A real small held item (dagger) fixture before widening any held geometry gate; then the 120 degree action warning on more than two items.
3. Skeleton-route item moves are all-or-nothing and Try again always uses a new seed, so completed paid views are bought again (code-map row 3). Reusing completed passing views is the largest remaining cost fix.
4. Standing designs are never compared across views (code-map row 4), and small motifs pass G6 and H4 (row 1). Both need labeled damaged-motif cases before a gate.
5. Inpaint grid estimates price by area; a 448×112 grid billed 15 while the estimator says 10 (inventory). A receipt audit by canvas shape is free from retained ledgers.
