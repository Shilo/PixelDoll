# Native axe clip in Studio, November 2, 2026

## Outcome and scope

The corrected eight-frame east axe candidate now has an editable PixelDoll project and a separate engine export. It imports, equips, removes, plays and exports through the actual Studio. Inspect now has visible Previous frame / Next frame buttons and a frame counter. These controls are a production application improvement; they do not generate or repair artwork.

The art remains experimental. This closes the gap between the isolated Lab proof and using that proof in the application. It does not qualify a universal animation preset, other directions, other weapons or other body shapes. No paid requests were needed. The latest 500-unit allowance remains at 15 spent and 485 unused.

## Before and after

| Before | After | Limit |
|---|---|---|
| Native attachment evidence was a separate Lab archive. | Existing local project import opens the same body and item layers in Studio. | It is an explicit experimental import, not a shipped default or a newly generated character. |
| Precise Studio stepping required hidden comma/period shortcuts. | Inspect exposes previous/next controls, visible playlist position, automatic pause while stepping and wrap in both directions. Keyboard and buttons share the same helper. | Frame stepping inspects an existing image; it does not correct anatomy. |
| One visible front toe was measured. | Both feet are annotated where visible. | Rear foot in frames 4/5 (zero-based) is merged with the other foot and remains unknown. |
| Exact native exports had been checked outside Studio. | Actual Studio canvas pixels, wear/remove, quality warnings and UI export are exercised in the browser regression. | Studio applies its existing garment color-region normalization, described below. |

The prior [palm correction](2026-11-02-palm-grip-correction.md) is still the source of the visual grip change. This continuation does not claim another art improvement. Browser inspection of all eight frames confirms that the corrected source is being displayed, including the full axe head in the two formerly rejected control poses. Thumb shape, foreshortening, transition timing and the overlapping feet still merit an artist's review. A fixed visible toe is not proof of physically correct weight transfer.

## Artifacts and reproduction

- [Studio project ZIP](artifacts/2026-11-02-east-axe-studio.zip): import using the character menu's **Import character…** action. Leave **Set up the pose rig next** unchecked for this offline review. Choose **Axe attack**, pause, and open **Inspect**. The axe must remain labeled **Needs a look**.
- [Engine ZIP](artifacts/2026-11-02-east-axe-engine.zip): generic and Phaser files, editable project, separate layers and baked outfits. This is the offline exporter result, not a claim of a newly executed game-engine runtime test.
- [Retained source ZIP](artifacts/2026-11-02-gripped-axe-east.zip): all eight original body, weapon and preview PNGs, authoring data and explicit `qualified:false`.
- Generator: `spikes/api/mocap/package-studio-axe.mts`. Run with Node 24.22.1 and `--experimental-transform-types` from the repository root. Plain strip-only Node rejects the existing import error class's constructor parameter property; no application class was changed to accommodate that script.
- Durable audit data: [integration and foot/color audits](2026-11-02-studio-axe-results.json).

Source archive SHA256: `2b753653143df05b8b2a08d9e940c19230d2fa405e87f679b964522e416b27f3`.
Studio ZIP SHA256: `5b65af499bad05c081482d03a2c60d2b817371d2a2fd2b9b2d1c56b5cde6dbbe`.
Engine ZIP SHA256: `686665e374f2d3b5ba2a5ec312725926244d5ce9a5206ac49b049d64c9dadd47`.

The project uses native 144 px cells and pivot (72,107). Only east exists. Default uses pose 0; Axe attack uses eight distinct cells with durations 120,120,80,80,80,120,100,220 ms. Its authored engine metadata is nonlooping. Studio preview may repeat for inspection. UI exports use the app's existing global **Play animation once** preference, so select **Axe attack** in Export > Settings to export it as a single play. The regression checks both editable project and engine manifest behavior.

Both imported items have `qa.status:warn` and `unmeasured:true`; required scalar storage fields are neutral and hidden by the existing unmeasured UI. Their `status:accepted` makes them usable local records. It does not assert measured QA or professional art acceptance. No skeleton, hidden landmark, rig measurement, generated provenance or camera model is fabricated.

## Exact pixels and the failed initial check

The offline project/engine exporter roundtrips all eight armed frames exactly against native source, and all eight unequipped frames exactly against the frozen body. Actual Studio opening also runs the pre-existing B15 shirt/shorts color split. It encodes garment regions in the blue channel's least significant bit, already documented in [known issues](../known-issues.md). Therefore an unconditional original-RGBA assertion initially failed at frame 0, pixel (74,49): native (28,17,19,255), Studio (28,17,18,255).

The final check does not use a color-distance tolerance. It explicitly derives the existing B15 transform and requires every rendered RGBA byte to equal that result. An independent bound rejects any red, green, alpha or higher-blue-bit change against source. Changed blue values per armed frame are 29,39,28,34,26,45,28,8. No geometry, opacity or axe-head loss is accepted. The real downloaded editable export is recomposed and compared exactly to those same expected frames.

This also means the source body's historical exact identity and Studio's normalized body identity are distinct. Do not describe the Studio image as byte-identical to the unnormalized B-star source.

The existing classifier is a low-chroma color heuristic, not a semantic clothing mask. This bare-body candidate also contains dark colors it tags. Its 1/255 effect is accounted for here; it neither explains the original uncanny motion nor proves those pixels represent clothing. The accepted per-layer-mask limitation has not been expanded into an unrelated palette redesign.

## Foot evidence

Front sole mark (76.5,106.5) is opaque and stationary in all eight frozen frames with fixed root (0,0). Rear sole mark (77.5,100.5) is visible and stationary in six frames. The rear mark is deliberately unmeasured in frames 4/5, where the feet merge. There is no new body drawing, hidden-foot inference, engine displacement, walking-speed measurement or certification of full foot planting.

## Verification and remaining limits

Live browser review used the ordinary credential-free dev server at localhost:5200, separate from the existing 5199 review. No agent token was read and no PixelLab requests were needed. The actual Studio downloaded `experimental-east-axe-review-godot.pixeldoll.zip`. An offline read of that actual download recomposed all eight frames exactly against the declared normalized source and confirmed warnings and single-play metadata. This checks download/integration only, not Godot runtime execution. Local screenshots of Studio frames 4 and 5 are retained under `spikes/api/out/studio-axe-2026-11-02/`.

The new browser regression blocks and counts all PixelLab requests, imports the durable ZIP, checks warnings, compares all eight canvas frames, checks wrapping and keyboard stepping, checks a one-frame clip disables stepping, verifies phone portrait/landscape control visibility, removes/re-equips the item and inspects the actual exported archive. It also requires no page errors.

During test authoring, an incorrect `.tile` descendant selector timed out on the separate None button; it was replaced with the actual semantic button locator. A later run was stopped after manual review exposed the missing Export > Settings navigation in the test. The corrected focused case passed in 5.7 seconds. No application assertions, test timeouts or quality thresholds were weakened.

Strict checking completed with zero errors and zero warnings. The full unit suite completed with 1,439 passing tests and one existing skip. The focused native Studio regression passed. The required full browser suite passed all 168 tests in 7.2 minutes, including Inspector stability, mobile layouts, explicit paid consent, unknown-response handling, export and crash recovery. The new case also passed under the full parallel run. No paid generation loop, automatic retries, backend, new dependency or new importer was added.

The full run's dev-server diagnostics included fixture-thumbnail fetch warnings and one ResizeObserver notification. They did not fail the suite; this task does not claim to have fixed those unrelated diagnostics. The new clip regression reported no page errors or PixelLab requests. Actual game-engine execution and additional native art directions were not run in this continuation.

Tracking remains unsynchronized: the board's active and archived lists failed for missing saved GitHub project scopes. No authorization was expanded or board mutation claimed. File work continues under the user's explicit continuation on `codex/motion-lab`.

The next art work, if requested, is narrow manual review/correction of the merged rear-foot poses and candidate-specific perspective/timing. Native independent artwork is needed before supporting additional views. More AI generations cannot currently be justified as a reliable fix based on the failed source-pinned control. No broad research cycle is required.

The later [independent challenge and counter-review](../reviews/2026-11-02-final-motion-review.md) completed that narrow evidence review. It did not establish a missing-foot or timing defect requiring new pixels. It did find and fix a stale-image error in the attachment editor. No further evidenced repair remains for this bounded clip/tooling follow-up; broad preset quality remains unqualified.
