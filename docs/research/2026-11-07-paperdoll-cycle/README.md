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
| [fairness.md](fairness.md) | Rim guard dark rule across skin tones: three rules on recolored bench bodies and the real corpus |
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
| Rim guard dark rule and skin tone | Deep skin midtones counted as outline under the fixed mean RGB 60. For a light generated pixel the dark base pixel must now also be a real line (near-black or much darker than a neighbor). Light thin items keep 191/201 (A) on every tone and 427/427/425 of 453 (N), against 188 and 413 on deep skin before; false pixels match the old rule; 10 real shipped px change. Dark items keep the old rule and its gap. A relative threshold and a contrast-only rule were rejected (a real speck; 2.5 times the false pixels on deep skin). See [fairness.md](fairness.md). | **Implemented** (`dropKeyOutline`) |
| Dark thin items over deep skin (LPC ground truth) | On human-drawn LPC bodies a 1 px black strap kept 98.9 % on light skin and 32 % on the deepest tone. On the green key a dark generated px over non-line dark skin now counts as a redraw only if it leans toward green or is off a straight run of dark, non-green px: about 94 % kept, scattered olive redraws ship exactly as before, the bench changes in 1 px. See [lpc-fairness.md](lpc-fairness.md). | **Implemented** (`dropKeyOutline`, green key only) |
| Body-palette check for repainted skin | Flags 0 of 627 real cells exactly, catches only exact copies, and misses or false-flags unevenly by skin tone. | **Rejected** |
| Dressed-keyframe skeleton as `first_frame_keypoints` (E1) | Paid estimate check below: bare controls reproduce rest joints within 0.11 px, dressed keyframes drift 0.35 to 1.01 px mean, up to 2.64 px, while the pose is unchanged. Sending them would encode false pose offsets against the body's shared keypoints. | **Rejected** without the 19-generation pose A/B |
| Neutral hand wording (audit-held 2) | Paid A/B, 22 dress calls: swords and shields draw the same under every wording. Without "pointing down", PixelLab puts upright objects (torch, bouquet) in the left hand even when the prompt names the right (wrong hand in 11 of 16 torch and bouquet front and back views across both new wordings), and the audit's wording also bends the arm (key outside up to 0.107). See [hand-wording-ab.md](hand-wording-ab.md). | **Rejected**: current wording kept; torches and bouquets still draw upside down |
| Design detail note (code-map row 1) | A same-color patch of the dressed design (4 px at 64 px, scaled with the cell) that is gone from a posed locomotion frame now raises the G15 review note. Frozen bench: 0 of 328 locomotion frames flagged at 1x, 2x and 4x; live: a gold emblem tunic and a buckle shirt (72 posed frames) passed with no note. The review measured that a presence test sees only details in their own color (6 of 1,046 erased real patches had no shade elsewhere), so attacks, body-colored details and shared shades stay unchecked. | **Implemented** (`dirGate`, `DETAIL`) |
| Adjacency dye ramp merge | On 45 labeled PixelDoll materials: production 33 exact, proposed hybrid 30 with 6 cross-material items (clothes with skin, gold guard into blade). A guarded variant reaches 36 but its limits were tuned after seeing both corpora. | **Rejected as proposed; guarded variant deferred** to blind held-out items |
| Inpaint grid price by canvas shape | 11 billed canvas shapes in the repository's records, against the catalog's 256²/341²/512² bands: area misses 448×112 (billed 15, quoted 10) and 480×240 (billed 25, quoted 15); no longest-side rule gives both 448×112 = 15 and 432×288 = 25 (a 240×240 receipt is $0.08, the 10 band). The mean of the two sides matches all of them and never quotes below area; band edges are pinned only to [256, 280) and [336, 360). Inferred, not a provider formula. | **Implemented** (`gridEstimate`) |
| 13 to 14 frame pose price | REST documents only 3, 8 and 15 frames; the 4-generation quote errs high. | No change |
| Signed check on action clips, contact and reach warnings, per-frame grip export | Thresholds rest on two items or are untested in engines. | Deferred |

## Paid ledger

| Date | Requests | Purpose | Reported cost |
| --- | --- | --- | --- |
| 2026-11-07 | 14 × `estimate-skeleton` through the production `joints()` path in Agent mode | E1 discriminating check: 10 dressed bench keyframes (a-cape, a-chest, b-cloak, b-tunic, a-helmet; south and east) and 4 bare-body controls. Packet file SHA-256 `b8caee36…`, built by `scripts/provider-estimate-packets.ts` | $0.0724 USD, 0 subscription generations; all 14 completed |

| 2026-11-07 | 22 × `edit-animation-v2` dress calls through the app queue in Agent mode | Hand wording A/B ([hand-wording-ab.md](hand-wording-ab.md)): 4 items × 2 wordings × 2 seeds, plus 3 items × 2 seeds of a third wording | $1.76 USD (22 × $0.08), 0 subscription generations; all 22 completed |
| 2026-11-07 | 2 × `edit-animation-v2` dress + 12 × `animate-with-skeleton-v3` pose calls through production `runItem` in Agent mode (nothing saved) | Real small held items: "a small steel dagger" and "a short curved knife with a wooden handle", idle and walk in three views on the 80 px Live Test character | $0.44 USD; all 14 completed |
| 2026-11-07 | 2 × `edit-animation-v2` dress + 6 × `animate-with-skeleton-v3` pose calls through production `runItem` in Agent mode (nothing saved) | Live check of the G15 design-detail note: "a red wool tunic with a small gold sun emblem on the chest" and "a blue linen shirt with a brown leather belt and a square silver buckle", idle and walk in three views | $0.35 USD; all 8 completed; both items passed with no G15 note, and the 5 px gold emblem appears in all 12 front frames |
| 2026-11-07 | 12 × `edit-animation-v2` dress calls, then 3 × `edit-animation-v2` + 18 × `animate-with-skeleton-v3` through production `runItem` (nothing saved) | Upright held objects: off-hand and main-hand upright wordings on the dress call, then the off-hand default through the full pipeline ([hand-wording-ab.md](hand-wording-ab.md)) | $0.96 + $0.62 USD; all completed; the off-hand default failed on all three items and was reverted |
| 2026-11-07 | 1 × `edit-animation-v2` + 6 × `animate-with-skeleton-v3` through production `runItem` (nothing saved) | Main-hand torch for the flip-about-the-grip prototype ([hand-wording-ab.md](hand-wording-ab.md)) | $0.22 USD; passed every check; the flip was rejected |
| 2026-11-07 | 203 calls: production `runItem` for 7 items with the current and the minimal hand wording, then 4 more wordings on the dress call | Minimal and negative held-item wordings ([hand-wording-ab.md](hand-wording-ab.md)) | $8.98 USD; one PixelLab pose failure; current wording kept |
| 2026-11-08 | 80 calls: 77 through production `runItem` for sword, torch, axe, mug, spellbook and lantern with object-neutral and direction-free held wordings, 3 dress-only (A sword, torch and axe replayed free) | Object-neutral one-item clause ([hand-wording-ab.md](hand-wording-ab.md)) | $2.62 USD; "exactly one held item" adopted on policy, posing and off hand unverified; direction clause kept |
| 2026-11-08 | 40 dress calls on a new 80 px body (4 items, 2 seeds, 5 hand wordings incl. a wrist dot) plus 4 items through idle and walk | Hand marker instead of a forced direction ([hand-wording-ab.md](hand-wording-ab.md)) | 533 subscription gens; wrist dot adopted, "pointing down" removed |
| 2026-11-08 | 20 dress, 12 item pose and 12 body render calls on a new 80 px body, plus 7 described-move motions | Prompt trim: dress words, item pose suffix, body render action, chroma key words ([prompt-trim-ab.md](prompt-trim-ab.md)) | Subscription gens only; "natural" and the cape-only repair line dropped, other words kept; described moves found failing on an extra motion frame |

Balance observations, not reconciled: the account read $14.31 USD credit before the run and $24.16 after, with 0 of 10,000 subscription generations left (Tier 3). The increase cannot come from these requests; it is recorded, not explained. Before the wording A/B it read $18.14, and $16.12 with 21 of its 22 calls done ($1.68 recorded), so $0.34 is unaccounted for; no other paid request ran in the app at the time. Later, $15.08 before the upright tests and $12.95 after ($1.58 recorded): $0.55 unaccounted for. Either PixelLab charges more than the job usage reports, or another client uses the same agent key.

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
still switch (green to magenta for the lantern). It was harmless here, but the hint's stated reason is imprecise. Offline
check on the bench keyframes (2026-11-07): stray key pixels outside the body are exact mannequin shades on one drift case
(n-cloak128 north, 0 of 54 off the ramp), but on b-jester, whose colors do not lean toward the key (near-key share 0.02 to
0.06), 64 to 73 % of them are redrawn shades off the ramp, as many as on a true collision (a-jester-magenta, 96 %). Color
cannot separate drift from item pixels, so the trigger was left unchanged.

## Resumption

No paid job is pending or unknown from this cycle (last checked after the flip prototype, balance $12.73 USD credit). The agent server ran on `localhost:5199` in Agent mode. Next discriminating work, in order:

1. Done for the green key: human-drawn LPC bodies in 15 tones ([lpc-fairness.md](lpc-fairness.md)) showed 1 px dark straps kept 32 % on the deepest tone; the guard now keeps about 94 % there with no more olive redraw px. Still open: magenta, blue and azure keys keep the old gap, and real PixelLab redraws over deep skin were never observed.
2. Done as a live check, not a stored fixture: two real short blades on the 80 px Live Test character (72 posed frames) reach 7 to 19 px from the wrist, mostly above the 10 px signed-direction floor. The curved knife passed every check. The steel dagger failed G4, G5 and G9 on walk/south only, and those failures are real: PixelLab drew a diagonal blade in frame 0 and a hilt stub pointing down in frames 1 to 3. No false fail on a real small blade. Still open: a stored small-item bench fixture, and the 120 degree action warning on more than two items.
3. Done: when one view of a skeleton item move fails, the finished views are saved and Try again requests only the missing ones (not on a replace move), and after a save conflict "Use saved frames" reattaches the finished jobs with no new request. Still open: a failed later batch of a long (> 15 frame) view repays its earlier batches on Try again (code-map row 3).
4. Partly done: G15 now notes a design detail in its own color that a posed walk or idle frame loses (code-map row 1). Still open: details sharing a shade with other parts, attacks, and comparing standing views with each other.
6. Upright held objects (torch, bouquet) draw upside down; wording changes and an off-hand default were tested and rejected ([hand-wording-ab.md](hand-wording-ab.md)). Untested idea: flip the extracted item about the grip.
7. The retry key hint ("measured from this design's colors") was checked against all triggers (K1, G3, G4) and is accurate as written; the earlier note only meant a G3 trigger can offer it.
5. Done: inpaint grids price by the mean side (15/25 edge at 336, the highest mean billed 15), and repairs pack into the cheapest layout (for example 86 px cells, 4 frames + 1 reference: 258×172 at 10 instead of 344×172 at 15). The new-item draft fallback stays on 4 columns until a matched quality test of other layouts.
