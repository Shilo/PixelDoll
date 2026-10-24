# Production parity review checkpoint

2026-10-24. Work stopped at the user's request. This is a review checkpoint, not a final visual approval.

## Evidence and verification boundary

- Initial strict comparison captured all five core screens at matching 1440×900, 390×844, and 768×1024. Local images: `docs/testing/strict-{prototype,production}-{width}-{selection,create,preview,topdown,side}.png`.
- Independent comparison gallery: `app/test-results/experience-comparison/gallery-before.html`, with 40 matching desktop/phone pairs across both appearances and preserved baseline metadata/hashes.
- `gallery-iteration1.html` is explicitly intermediate, before the painted-bounds actor sizing repair. Do not use it as evidence of final actor sizing.
- **The final 40 `app-after` pairs were not reviewed before stopping. Final production visual parity is not certified.**

## Confirmed original deviations and subsequent decisions

Initial strict review found substantial differences from the approved prototype: desktop modes moved below identity; reduced control typography; tiny equipment art and inline categories; old creator composition under a new background; missing mobile search; inconsistent phone/tablet actor sizing; and a live sky horizon mismatch. These were genuine visual differences, independent of passing functional tests.

Parent subsequently repaired screen hierarchy, creator composition, mobile search, item artwork, playback sizing, live sky cropping, and actor fitting. Latest source changes also place None in the shared item grid, use three phone columns, and correct phone category label height. Those latest repairs still need final image review.

Iteration-one phone creator screenshots showed overlapping Appearance/Prompt text and a narrow Name input. Parent reports these are fixed in the later build; integration audit added glyph-fit, tab separation, and Name-width assertions. Parent also reports the title is now left aligned. These statements are not a substitute for the unfinished final visual review.

Accepted production differences:

- Real material ramps replace the disconnected prototype sample palette. They legitimately require vertical scrolling; do not fabricate a five-color palette to match a stub.
- A real saved-character library need not contain the prototype's three authored demo outfits.
- Account, activity, API inspection, validation, repair, and saved-outfit controls remain functional production additions.
- The compact phone creator footer retains the real estimate/API inspection beside a clear approximately 239×44 primary action. Parent deliberately retained this to reserve form height; its geometry alone is not a blocker.

## Confirmed remaining follow-up

**P2: initial creator focus.** Prototype focuses Name. Production `Sheet.svelte` searches only `.sheet-body` for its initial text field, so the full creator focuses Details even though Name appears above it in the heading. Parent explicitly left this unimplemented for the next reviewer. Prefer Name for the full creator on fine pointers while preserving the deliberate phone virtual-keyboard policy and generic sheet behavior.

## Bounds helper delivered

- `app/src/studio/experience/bounds.ts`: `paintedFrame(project, items): Frame` caches alpha bounds per immutable Img, unions every visible equipped pose and body rest, respects compositor visibility/tuck variants and layer pivots, conservatively includes mirror counterparts, and safely falls back for missing/malformed art.
- It changes fitting metadata only; rendering/export pixels and the full baked frame remain unchanged.
- `app/test/unit/experience-bounds.test.ts`: 12 targeted tests passed, as did `tsc -p tsconfig.test.json --incremental false`.
- That agent-local test run used default Node 25. Parent was supplied the result and will include it in pinned-runtime validation. Required runtime is `.runtime.tmp/node-v24.22.1-win-x64/node.exe`; do not describe the agent-local run as pinned-runtime evidence.

Earlier independent Chromium and installed WebKit 2359 checks verified repaired Inspect/Export focus return, popup Escape focus return, narrow Inspect transport, and landscape More/Held-item access. Later touch/input changes and the final visual build require their own recorded verification. No paid API calls were made during this review.
