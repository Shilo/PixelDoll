# PixMiniMax terminal skeleton recipe review

November 8, 2026. Review of Lari's supplied transformation recipe, example image and `estimate_skeleton.py`, with an independent sub-agent critique.

**Recommendation: keep PixelDoll's frozen-body pipeline and do not adopt the supplied estimator.** The recipe is a plausible experiment for authoring a differently proportioned base. It provides no qualification for equipment alignment or consistent animation. Explicit PixMiniMax captions are the strongest stability hypothesis to test.

## Tested findings

| Check                  | Result and limit                                                                                                                                                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Example image          | Non-gray bounds measured 216 px for the original and 184, 182 and 183 px for the smaller characters. Their bottom rows were 247, 247, 247 and 248. These are screenshot bounds, not original-alpha or anatomical measurements. The five-panel selection does not establish the quality of a complete eight-frame job. |
| Arm-width prerequisite | All 48 stored 64 px frames in `app/dev-fixtures/s4rig/` lack the required row wider than 100 px. They are outside the script's advertised 256 px T-pose use case; the result rules out a general port, not that narrow use case.                                                                                      |
| Palette sensitivity    | Reproducing the leg-separation scan on identical synthetic silhouettes gave crotch rows 130 with a light palette and 243 with a dark palette. The RGB-sum threshold mistakes dark body pixels for gaps.                                                                                                               |
| Off-center resizing    | Executing the original `shrink()` unchanged at scale 0.8 moved the neck 8 px and the face 10 px after a 10 px input translation. Keeping head size requires translating the face with the transformed neck.                                                                                                           |
| Height and grounding   | Source inspection found an extrapolated head-top calculation and ankle joints without sole landmarks. Neither exact rendered height nor visible foot contact is guaranteed. Fixed pixel offsets and missing input validation further limit reuse.                                                                     |

The complete NumPy/Pillow estimator was **not executed** because those dependencies were unavailable. Palette and prerequisite checks reproduce selected expressions; the original resize function was executed through Python AST extraction. No dependencies were installed.

## Provider contract

The public schema checked during this review supports endpoint conditioning through raw PixMiniMax `last_frame` **and managed `end_frame`**. Managed interpolation requires matching dimensions and exactly one direction. PixelDoll can investigate this through its existing REST integration; checking only the raw field name would incorrectly suggest otherwise. Both request schemas expose `subject_description` and `initial_pose`. Sources: [OpenAPI](https://api.pixellab.ai/v2/openapi.json), [official MCP guide](https://api.pixellab.ai/mcp/docs).

A terminal skeleton is an image target. It does not provide intermediate joint constraints like [raw Skeleton v3](../../app/src/lib/rig/clips.ts). Our finer control still cannot guarantee pixel alignment, correct grips or foot contact. Validate actual body and equipped composites as well as estimated joints. A changed body needs a new frozen rig and qualified equipment fits.

## Useful follow-ups

- Test accurate subject and starting-pose captions on the existing PixMiniMax motion-source route. They were omitted at review time. Reuse [provider experiment E4](2026-11-07-paperdoll-cycle/provider.md), but describe the actual input rather than assume a mannequin. Measure failures, facing, unwanted props and final equipped output.
- Keep terminal-image conditioning as an optional authoring experiment. Compare it with a normal target sprite and structured joints before considering integration.
- Treat instant-flash wording, face/body clauses, approximately 50% success and free refusals as unverified observations. Any future comparison must retain all jobs and distinguish usable-still yield from usable-animation yield. Repeated seeds do not replace stored accepted artwork.

No paid requests or production changes resulted from this review. The four targeted unit suites (`rig-setup`, `pipeline-qa`, `independent-pipeline`, `freeze-quality-notes`) passed all 31 tests after a Windows sandbox permission failure was resolved by rerunning outside the sandbox. Full end-to-end checks were not run.

## Evidence

Local probes and detailed results remain in ignored `spikes/api/out/lari-recipe-review-2026-11-08/`; they are not included in a fresh checkout. This note preserves the decision and measured findings. The supplied script and screenshot remain external inputs.

- Script SHA-256: `7cf1e52e2d14d5e7e84aafecb984e0df633f23f3dd88cfbe51948fc6acbce7dc`.
- Public schema SHA-256: `6641199926aa0dc8dee5dc399e267cc06d2e2aa3069ef5ba1d8a56f5382b4ff9`, fetched November 9 at 03:41 UTC (November 8 Pacific).
