# ComfyUI mechanism qualification against production PixelDoll

November 7, 2026. This follows the [ComfyUI source review](../../comfyui-paperdoll-review-2026-11-07.md) with actual offline execution. It does not claim that ComfyUI inference, a custom node, or an external generation model ran locally.

## Outcome

The comparison found and fixed a concrete structural boundary in production `packGrid`: malformed frame/mask lists and incompatible canvas buffers previously reached the packing loop. An oversized occupancy mask could assign edit permission to a later frame or unused cell. The shared helper now rejects those mismatches before producing a repair grid.

This is input-contract hardening, not evidence that current users had already been billed for malformed grids. Inspected production and development callers construct matching arrays. Correct existing output bytes, null protected masks, nonzero occupancy masks, and unused protected cells remain unchanged.

The art corpus remains mixed: 11 of 18 independently labeled cases are exact, with nine false equipment pixels and 21 omitted equipment pixels across the complete corpus. The difficult cases expose ownership ambiguity and existing cleanup tradeoffs. They do not support changing color thresholds, making a global morphological repair, or adopting VNCCS's illustrated-image matting as a new default.

## Executed artifacts

- [qualify.mjs](qualify.mjs): calls the actual production request identity, queue, grid pack/cut, extraction, and chroma helpers.
- [results.json](results.json): final results with exact production source hashes, Node version, in-memory request counts, independent-label scores, and limitations.
- [exploratory-before.json](exploratory-before.json): initial exploratory output retained, including a subsequently rejected interpretation of nonbinary occupancy masks.
- [source-witnesses.mjs](source-witnesses.mjs) and [source-witness-results.json](source-witness-results.json): retained public standing sources checked against assigned rest joints and visible mannequin evidence.
- [unit-before.json](unit-before.json), [unit-after.json](unit-after.json), and [unit-final.json](unit-final.json): actual Vitest reports, including failing-before evidence and final focused regressions.

Node `v24.22.1`, npm `11.19.1`, Vitest `4.1.12`. Tests used the repository's pinned Node executable. `TEMP` and `TMP` pointed to the ignored `app/test-results-comfy-contract-tmp/` directory. No packages were installed. Existing unrelated source edits were present; the hashes in `results.json` identify the exact helper contents used by the final probe.

## Production contract experiment

The ComfyUI comparison identified a transferable risk: convenient list broadcasting and mask conversion can hide incorrect frame correspondence. Rather than replicate that behavior, the experiment called PixelDoll's existing shared `packGrid` helper with controlled malformed inputs.

The new [focused unit file](../../../../app/test/unit/comfy-frame-mask-contract.test.ts) covers:

- Too few or too many mask entries.
- Short and oversized per-cell mask buffers, including a three-frame/two-column spill into a protected later cell.
- Zero, negative, fractional, nonfinite column counts.
- Empty frame lists, mixed canvas sizes, invalid dimensions, and truncated RGBA buffers.
- Valid frame byte round trips, input immutability, exact white/black mask polarity, null reference protection, unused tail protection, and mask values `128` and `255` retaining their nonzero occupancy meaning.

Before the guard, 17 of the 18 focused tests failed and one passed. Some malformed inputs were silently accepted; others failed only incidentally with an allocation or buffer error rather than at the contract boundary. These are 17 failed assertions over related structural conditions, not 17 unrelated product defects.

After the fix, all 18 focused tests pass. The final seven-suite run passes 109 tests, including existing stencil enforcement, grid repair, grid estimation, grip, queue resume, and anchored-move recovery. The final production-helper probe passes 18 of 18 contract checks. Existing canonical request hashing correctly distinguishes source, mask, dimensions, seed, route, and ordered edit frames. Reloading the completed in-memory queue record reuses its receipt with one injected POST in total.

The request-hash probes deliberately use tiny synthetic byte payloads to isolate canonical hashing. They do not prove PNG validity, provider acceptance, or complete endpoint preflight. The structural packing tests separately establish rejection before a usable malformed grid can be produced. No real provider transport is present in the queue fixture.

## Independent art labels and negative controls

Labels are authored from known shapes before extraction. The expected masks are not copied from the extractor. Inputs remain immutable.

| Case family | Cases | Result |
| --- | ---: | --- |
| Wide enclosed body hole | 4 keys | All four exact. |
| Connected one-pixel strand | 4 keys | All 35 intended pixels survive per case, but each adds two false equipment pixels. |
| Three-pixel diagonal connection | 4 keys | All four exact under 8-connectivity; recorded 4-connectivity differs as expected. |
| One-pixel body hole | Bright and dark green | Bright hole exact; dark hole fills one known body pixel. An explicit protected stencil preserves both holes. |
| Isolated one-pixel detail versus stray artifact | 2 identically observed inputs with opposite labels | Cleanup rejects the artifact, but also removes the legitimate one-pixel detail. The color image alone cannot satisfy both labels. |
| Same key RGB belonging to body versus gear | 2 identically observed inputs with opposite labels | Correctly removes the body case but loses 20 legitimate gear pixels in the opposite-label control. This establishes missing ownership information, not a threshold that should simply be weakened. |

Totals: 18 cases, 11 exact, nine false gear pixels, 21 lost gear pixels. The synthetic cases are adversarial controls, not estimates of real-world failure frequency. No extraction change was made by this task. The existing broader cycle's independently authored despill changes are identified by source hashes rather than attributed to this work.

## Retained source geometry check

The source review raised a narrower concern: the pose route pairs a generated dressed source bitmap with stored rest joints. The retained matched trial packets allow that concern to be checked without generating new images.

Twenty raw-conditioning packets reduce to ten unique standing sources after deduplicating the source/base/layer/key/rest-joint content. Across 180 assigned joints, 41 are covered by approved gear and are treated as occluded evidence. The remaining 139 land exactly on visible mannequin-key pixels. None lacks visible-key support within three pixels. There are 12 key-colored pixels outside the frozen body among 4,923 visible key pixels.

This cohort does not demonstrate a source/rest-joint mismatch or qualify automatic rerigging. Visible key support is not an independent anatomical landmark label, and near-body support cannot prove exact joint identity. The [completed canonical-conditioning live comparison](../../deep-paperdoll-live-trials-2026-11-06.md) was mixed and did not qualify a default change. This probe adds measured source witnesses; it does not turn an already investigated conditioning idea into a new discovery.

## Commands and verification

From the repository root with the pinned Node selected:

```text
node docs/research/post-handoff-qualification-2026-11-07/comfyui/qualify.mjs
node docs/research/post-handoff-qualification-2026-11-07/comfyui/source-witnesses.mjs
```

From `app/`:

```text
npm test -- comfy-frame-mask-contract --reporter=json --outputFile=../docs/research/post-handoff-qualification-2026-11-07/comfyui/unit-before.json
npm test -- comfy-frame-mask-contract item-stencil grid-repair grid-estimate clean-grip --reporter=json --outputFile=../docs/research/post-handoff-qualification-2026-11-07/comfyui/unit-after.json
npm test -- comfy-frame-mask-contract item-stencil grid-repair grid-estimate clean-grip queue-resume anchored-item-moves --maxWorkers=2 --reporter=json --outputFile=../docs/research/post-handoff-qualification-2026-11-07/comfyui/unit-final.json
npm run check
```

The before command was run before the guard and failed as recorded. The after and final commands passed. Type and Svelte checks passed with zero errors and warnings. Whitespace checks passed. No browser or paid-generation test was performed by this subtask; the coordinator owns cross-cutting verification and any required live workflow testing.

The first exploratory script launch failed because `Array.map(structuredClone)` passed its index as the clone options argument. The harness was corrected to call `structuredClone` in an explicit callback before results were collected. The initial probe also treated nonzero masks as an error; code/caller review and independent challenge rejected that assumption. Final tests explicitly preserve nonzero mask semantics. Neither harness correction changes production acceptance criteria to conceal a failed product test.
