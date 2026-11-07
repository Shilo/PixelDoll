# Executed post-handoff qualification

November 7, 2026. Actual experiments, application fixes and independent challenge following the [ComfyUI](../comfyui-paperdoll-review-2026-11-07.md), [hybrid body/clothing](../hybrid-body-motion-review-2026-11-07.md), and [RGB MoCap](../rgbmocap-pixeldoll-review-2026-11-07.md) source reviews. The separate [broader cycle](../2026-11-07-paperdoll-cycle/README.md) ran concurrently; its work and spending are not attributed to this follow-up.

## Delivered changes

1. **Protect repair-grid frame permissions.** Independent probes showed overlong masks writing into a protected reference and an unused tail cell. Shared `packGrid` validation now rejects mismatched lists, canvases, buffers and columns, preserving valid bytes, null protection and nonzero mask occupancy. Eighteen new regression cases cover this boundary. Current normal callers already supplied valid inputs; this is not a claim of an observed malformed paid submission.
2. **Reject malformed motion-source timelines.** Actual Motion Lab JSON imports accepted descending, negative and out-of-duration source times and contradictory same-time poses. Shared sampling/retargeting validation rejects them with clear errors. Sixteen regression cases preserve valid holds, zero-duration stills and partial coverage. All 36 valid controls across three body proportions, two views, six moves and 3,234 frames retain identical output hashes.

The grid guard entered shared history in `eb55d9a0` while the broader cycle committed `items.ts`; this follow-up's grid tests are `83fd289a`. The motion fix and tests are `d4795a0f`. Only this run's explicit file paths were staged by its coordinator. Later concurrent edits remain separate.

## Experiments and decisions

| Area | Executed evidence | Decision and limit |
| --- | --- | --- |
| Frame/mask and receipt contracts | Before/after structural mutations, independent protected-cell spill reproduction, valid occupancy and byte controls, saved receipt reuse | Accept the narrow grid guard; retain existing request identity and recovery. |
| Source raster versus joints | Ten retained sources, 180 joints: 41 gear-occluded; 139 visible joints coincide with keyed pixels | No rerigging default promoted. This is weak visible-witness support, not independent anatomical truth. |
| Thin details and ownership | Eighteen labeled extraction cases: 11 exact; nine false-gear and 21 lost-gear pixels | Retain negative evidence. No global chroma, smoothing or component-removal change. Oracle masks do not prove mask acquisition. |
| Equipment combinations/material owners | 96 independently painted finite states, including mirrored views, overlapping cuts, four palettes and RGB shared across owners | Exact composition, baked/live parity, valid order permutations and equip/unequip restoration pass. Not arbitrary equipment fit or within-item semantic recovery. |
| Native rendering | Godot 4.7.1 Sprite2D/SubViewport with a 2-by-2 nearest/linear and integer/half-pixel probe | The linear half-pixel negative control exposes color/alpha leakage. Other tested conditions preserve measured channels. Premultiplied readback is explicit; no claim about atlas/import/compression/generated export or all engines. |
| Endpoint dressing | Eight real PixMiniMax calls, matched plain/cloth-language prompts, public fixtures, all outputs retained and blind-reviewed | No new default. No endpoint exactly reproduces the zero-cost overlay. Palette/shape scores can pass while pixel/color-boundary details change. |
| RGB MoCap motion | Existing licensed motion controls, real authoring-import mutations, source and public export-availability checks | Timing-contract improvement qualified. Actual reconstruction and a genuine RGB MoCap export/converter remain unqualified. |

See [ComfyUI qualification](comfyui/README.md), [motion qualification](motion/README.md), [live execution and evaluation](live/README.md), and the [independent challenge/coverage ledger](challenge.md). Their scripts and compact results record source hashes, commands, counterexamples and limits. Large inputs, provider PNGs, native project/cache and galleries remain ignored.

## Live protocol and accounting

The [protocol](live/protocol.md) was written before submission. [prepare.mts](live/prepare.mts) writes an ignored public-fixture plan and browser page; it cannot submit a paid call itself. The page uses the production queue and Agent connection, records a claim before enqueue and requires an explicit click. Live work used a host-integrated browser on a separate loopback origin from keyless tests.

Eight completed requests report **$0.09793791823254691 USD**, zero subscription generations, no unknown outcome and no automatic resend. Earlier broad-cycle estimate requests are a separate ledger.

Each request returned nine images: output zero is decoded-pixel-identical to its input, followed by eight generated frames. PNG encoding bytes differ. The pilot predeclared eight raw outputs and raw index seven; that mismatch remains a protocol deviation. Evaluation keeps index seven as primary and separately reports last-frame index eight as sensitivity. It does not silently change the protocol, choose a favorable frame or buy a retry.

The garment already fits the supplied body, so exact free overlay is a zero-cost control. This intentionally easy feasibility pilot cannot prove cross-body fitting or savings. Different drape can legitimately change silhouette. Keep raw geometry, ownership uncertainty, palette, motif/edge fidelity and frozen recomposition separate, including negative samples.

## Application verification

- `npm run check`: zero Svelte errors/warnings; TypeScript phases passed.
- `npm test`: **1,932 passed, one existing skip**, 155 files, including 34 new contract cases. The first invocation collected no tests because sandbox temporary-file renames were denied; an owned workspace temporary directory resolved it.
- `npm run e2e -- studio.spec.ts selftests.spec.ts`: **68 passed, 2.6 minutes**, separate ports/output. The first launch looked in a nonexistent sandbox browser cache and failed before app assertions. The corrected run used the already installed browser cache, without test/config/assertion changes.
- Independent adversarial probes reproduce both defects before their fixes and preserve valid controls afterward. No assertions were weakened.

Checks ran on the shared tree including committed broader-cycle changes. Later concurrent edits are not claimed as this run's work or silently included in its verification. Preserve captured source hashes and historical before results when replaying the scripts with the repository-pinned Node version.

## Remaining qualification

Actual ComfyUI model inference, RGB MoCap reconstruction and genuine export conversion, general FBX/BVH import, MakeHuman/voxel beauty output, novel-body garment fitting, measured human correction effort and universal equipment compatibility remain unproven. Public previews and synthetic fixtures do not substitute for that execution. The public RGB repository tree check covers its pinned tree and stated extensions; it does not prove no export exists elsewhere. The additional official releases API check returned no releases on this date.

Obtain a legitimately usable structured RGB MoCap export before claiming conversion success. Use held-out bodies/designs and matched current controls before promoting a generation route. The independent ledger separates tested strengths, implemented fixes, rejected hypotheses, and prerequisites; it does not equate full unit-test passage with solving all paper-doll generation problems.
