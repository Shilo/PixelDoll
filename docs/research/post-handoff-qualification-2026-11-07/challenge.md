# Independent challenge of post-handoff qualification

November 7, 2026. Final independent review of the executed qualification below, with remaining prerequisites explicitly retained. This review challenges the research and PixelDoll together. It does not treat source inspection, passing unit tests, native model execution, and improved generated equipment as interchangeable evidence.

Scope: the research directions added to the [repeatable workflow](../../handoff/paperdoll-improvement-cycle.md), the [ComfyUI spike](../comfyui-paperdoll-review-2026-11-07.md), [hybrid workflow spike](../hybrid-body-motion-review-2026-11-07.md), and [RGB MoCap spike](../rgbmocap-pixeldoll-review-2026-11-07.md). The separate [active broad-cycle results](../2026-11-07-paperdoll-cycle/README.md) are referenced evidence owned by another ongoing effort, not changes or paid work authored by this reviewer.

## Evidence rules and boundaries

- **Source reviewed:** documentation or implementation read; no runtime result implied.
- **Offline reproduced:** a named script ran against production helpers or an independent fixture, with exact input and source hashes.
- **Qualified for a narrow change:** a reproduced failure, valid countercontrols, and before/after evidence support the stated behavior only.
- **Native or provider tested:** the actual application/model/export or PixelLab request ran. A proxy or injected queue response does not count.
- **Untested:** evidence has not been collected. This is different from a demonstrated access, license, or execution blocker.

Starting committed research revision: `b0dd65d7`. Production files also have concurrent changes from the broad cycle. Probe JSON records exact source hashes and runtime so results cannot be attributed to the commit alone. No private attachments, chat quotations, or credentials are used by this review's retained probes.

## Coverage ledger

| Research area | Evidence available at this draft | What is not established | Current disposition |
| --- | --- | --- | --- |
| Equipment compatibility, coverage and fitted copies | Existing design/fit code and regression cases distinguish free exact-cell reuse, target stamps, and paid fitting; broad-cycle code review examines publication and recovery | Natural fit across body families, arbitrary outfit compatibility, or a direct 3D motion importer | Retain existing contracts; qualify new representations before expanding promises |
| Combinatorial and metamorphic testing | Independent 96-state golden fixture covers three binary equipment choices, three views and four owner-local palette selections, plus existing cut/export and broad-cycle controls | Coverage of the complete equipment/body/direction/move/material domain | The finite fixture passes; do not call it exhaustive real-equipment interaction testing |
| Pixel topology and tiny features | Comfy-inspired fixtures independently label strands, holes, diagonal connections and isolated pixels; broad-cycle ground truth already exposes cleanup and outline ambiguity | A universally safe topology repair or a hard invariant across valid pose changes | Use independent ownership labels and negative controls; reject universal cleanup rules |
| Browser/native rendering parity | New native Godot four-condition texture/render/readback probe tests filtering, half-pixel phase and alpha interpretation; historical native checks cover other particular contracts | Imported texture compression, atlases, browser parity, all phases and other engines | Narrow native behavior measured; retain untested boundaries explicitly |
| Material identity beyond RGB | A 96-state fixture preserves different item owners sharing RGB; the Comfy probe assigns different semantic labels to identical observations | Within-item same-RGB material identity, recovery from color alone, or a qualified semantic-ID acquisition process | Retain working owner-local recoloring; reject color-only semantic ownership guarantees |
| Correction effort and calibrated abstention | Existing review/recovery UX and targeted gate probes | Human correction effort, calibrated confidence, defect-specific false-acceptance/review coverage, or safe correction propagation | Research and measurement remain; agent time is only a proxy |
| Vocabulary and discovery coverage | New ComfyUI, motion and fitting terminology and primary-source acquisitions extend earlier research | Every possible source, language, marketplace or community was searched | Expand the taxonomy; preserve missing channels explicitly |
| ComfyUI data contracts and recovery | Production identity and queue controls already exist; synthetic mask/cardinality and injected recovery probes run; the independent spill challenge rejects malformed data after the structural guard | Native ComfyUI inference, external model quality, or proof current app callers naturally produce malformed masks | Accept the narrowly qualified structural guard; do not present it as a measured generation-quality gain |
| Dressed-source geometry and source joints | Earlier matched conditioning trials had mixed results; the broad cycle's 14-request estimate check found dressed estimates can introduce offsets | A paid pose A/B showing improved equipment from automatically re-estimating source joints | Do not promote automatic re-estimation; test an explicit unresolved question |
| Last-frame dressing and external H3 | Eight actual PixMiniMax requests, retained raw images, predeclared endpoint and sensitivity analysis, independent label-blind review and receipt audit | External H3/ComfyUI inference, novel-garment fitting, held-out body/design generalization or savings against contemporaneous edit/transfer controls | Reject default promotion from this pilot; retain the protocol deviation and actual costs |
| 3D proxy, voxel and owner/depth passes | MakeHuman/MPFB and Blender source mechanisms reviewed | Native direct-versus-voxel output, styled-pixel correspondence, face quality, or exact generated-pixel ownership | Rendered labels can ground their own fixtures; transfer to stylized output remains unqualified |
| RGB MoCap and motion conversion | Existing licensed GLB-baked controls exercise shared motion math; the document-boundary challenge now rejects malformed timelines while retaining authored holds | Actual RGB MoCap reconstruction/export, a verified FBX/BVH adapter, or superior captured motion and generated equipment | Accept narrow timeline validation; retain native/export and provider gaps |

## Independent adversarial probes

Run from the repository root with the pinned Node runtime. The scripts do not call a provider, read credentials, or mutate application source.

### A. Motion document validation and authored holds

[motion-timing-challenge.mts](challenge/motion-timing-challenge.mts) imports the real Motion Lab `newDocument`, `validateDocument`, and `buildDocument`, using the public CC0 baked motion library. Each mutation is serialized and parsed as JSON before validation. This tests an actual authoring-document boundary, rather than only passing an impossible in-memory value directly to a geometry helper.

[Before results](challenge/motion-timing-before.json), Node `v24.22.1`:

- A valid existing document imports and builds 12 finite frames.
- Repeated requested target times import and build four finite frames. These represent valid authored holds and must survive a timing fix.
- Descending source chronology, contradictory poses at a duplicate source timestamp, negative source timestamps, and a source sample beyond its declared duration all import and build finite output.
- A JSON-null duration and a missing source joint already reject. Do not report them as newly uncovered user-facing failures.

A fix must distinguish identical-pose/contact equal-time holds from contradictory equal-time source observations. Do not require complete source coverage of the duration, a particular frame rate, or strictly increasing requested target times without a separately justified contract.

**After-fix result:** [motion-timing-after.json](challenge/motion-timing-after.json) rejects all four previously accepted malformed timelines. The valid document and equal-time authored hold still build finite output. The existing missing-joint rejection remains. The new shared validator also reports an explicit source-duration error for the JSON-null duration, which already failed later in the old implementation.

**Narrow verdict: accept timeline validation.** The worker's additional controls preserve identical duplicate poses/contacts, a single pose, zero duration, partial source coverage, and valid existing output hashes. Geometry checks and authoring validation do not establish natural motion, RGB MoCap export correctness, or better rendered equipment.

### B. A malformed grid mask can edit a protected neighboring cell

[pack-grid-challenge.mts](challenge/pack-grid-challenge.mts) uses three independently painted 4-by-4 cells in a two-column grid. Cell 2 is a protected reference; the fourth grid position is unused tail space. The test labels both regions before calling production `packGrid`.

[Before results](challenge/pack-grid-before.json), Node `v24.22.1`:

- A 17-byte mask for the first 16-pixel cell, with byte 16 set, writes white into the protected reference below it.
- The same overlong mask on the second cell writes white into the unused tail below it.
- Short/extra mask lists, a short frame mask, fractional columns and zero columns also return rather than reporting the malformed contract.
- Valid occupancy values 1, 128 and 255 produce identical mask bytes. Valid frames survive pack/cut byte-for-byte; null references and tail stay protected; inputs remain unchanged.

This establishes a structural helper-boundary defect and a concrete protection spill. It does not prove a current production caller sends such malformed data or that a paid job suffered this defect. A structural guard must preserve nonzero occupancy semantics; rejecting 128 or 255 as inherently invalid would create an unnecessary behavior change.

**After-fix result:** [pack-grid-after.json](challenge/pack-grid-after.json) rejects all seven structural challenges before packing. Both reference/tail spills reject through the mask-size guard. The three valid occupancy controls, source-cell byte equality, protected reference/tail, and input immutability remain unchanged.

**Narrow verdict: accept the structural grid guard.** This protects the helper's frame/mask boundary. Request-identity checks and injected queue completion do not establish real provider billing, native ComfyUI behavior, or image fidelity.

### C. Challenge the extraction and source-witness conclusions

The [Comfy qualification results](comfyui/results.json) retain 18 independently labeled extraction cases, including mutually incompatible semantic labels on identical observed inputs. Eleven cases have exact masks; the remaining cases retain nine false-positive pixels and lose 21 labeled item pixels in aggregate. This is a small constructed test set, not a statistical equipment failure rate. An isolated valid detail is removed while the identical observed stray is removed correctly; same-key-colored valid gear is lost while the identical body observation is rejected correctly. These pairs refute any claim that color-only cleanup resolves unknown ownership universally.

An explicit ownership stencil preserves the two hole cases in the tested extraction step. The stencil is an oracle supplied by the test, not an automatically acquired correct label. Neither successful stencil enforcement nor a smaller mask establishes that the app can discover that stencil or recover an entirely missing garment.

The [source-witness probe](comfyui/source-witness-results.json) checks retained assigned joints against visible key-colored raster support, deduplicating repeated packets. Key support and registration are useful diagnostics, but they do not independently locate an anatomical landmark. A joint inside a cyan region is not proof it is the correct wrist, knee, or source pose. Occluded and unsupported witnesses must remain abstentions. Do not convert these measurements into proof that automatic dressed-source re-estimation helps or that the current source geometry is anatomically correct.

### D. Finite equipment combinations, cuts, mirrors and material owners

[equipment-combination-challenge.mts](challenge/equipment-combination-challenge.mts) constructs an independent binary-alpha fixture with three gear slots, overlapping body-cut regions, and identical gray RGB shared by the body and each item owner. Expected pixels are painted from declared fixture geometry and selected semantic owners before production composition, without reading production output as truth.

[Results](challenge/equipment-combination-results.json), Node `v24.22.1`: all 96 states pass exact golden pixels, live/baked composition parity, valid item-order permutations, and restoration of the bare body after unequipping. The states cover all eight equipment subsets, south/east/mirrored-west views, and four independently selected owner-local palette combinations. All seven required baked body-cut combinations preserve the same result. Inputs remain immutable.

**Verdict: retain the existing composition and owner-local recoloring behavior.** This is exhaustive only for the declared three-slot synthetic fixture. Its deliberately nonoverlapping gear pixels make the tested order permutations valid; it does not assert commutativity where actual layers overlap. It does not establish arbitrary fitted compatibility, correct flexible cloth, native renderer parity, or separate semantic materials sharing one RGB inside the same item. No product change is justified by these passing controls alone.

### E. Native Godot sampling and alpha readback

[native-renderer-probe.gd](challenge/native-renderer-probe.gd) actually ran in Godot `4.7.1-stable`, using the `gl_compatibility` renderer. A private, ignored project was launched in background mode, then stopped with no runtime errors. No application setting or installed dependency changed. [native-renderer-project.mjs](challenge/native-renderer-project.mjs) recreates that isolated project under ignored `challenge/godot.local/`; the generated project, cache and bridge files are not committed.

The fixture paints known opaque, partly transparent, grayscale and thin colored pixels into an `ImageTexture`, renders a `Sprite2D` in a transparent `SubViewport`, and compares native readback against the declared source. [Native measurements](challenge/native-renderer-results.json) include the engine version and probe hash.

| Native condition | Opaque RGB differences | Alpha differences | New nonzero-alpha pixels outside source coverage |
| --- | ---: | ---: | ---: |
| Nearest, integer position | 0 | 0 | 0 |
| Linear, integer position | 0 | 0 | 0 |
| Nearest, half-pixel position | 0 | 0 | 0 |
| Linear, half-pixel position | 16 | 38 | 20 |

The native readback stores partly transparent RGB premultiplied by alpha: source red `[255,0,0,128]` returns `[128,0,0,128]`. Comparing those channels as straight alpha would falsely report two damaged pixels even in the aligned passing controls. All three passing controls have zero error against the premultiplied expectation. The shifted linear negative control demonstrates that this test detects actual sampling damage rather than always returning a favorable result.

**Verdict: qualify this native sampling/readback observation, not a universal export guarantee.** This tests the direct texture/render/readback path, with no asset-import compression, mipmaps, atlas boundaries, generated PixelDoll export, browser canvas, other engine, or other fractional phase. Do not conclude that every half-pixel placement is safe from the single nearest-filter condition. No production renderer change is justified without a failing real export or app workflow.

### F. Actual live endpoint experiment, sealed judgments and receipt audit

The reviewer saved [blind-judgments.md](challenge/blind-judgments.md) before reading the arm mapping, evaluator or numerical report. Its SHA-256 is `0ecf498564650b8868087c23b7f6513b3e246257ebcb31ce5ccd981e7a2f1b9a`; the audit records that same sealed judgment hash. The review inspected all eight candidates, both endpoint indices and all 72 raw images through integer-enlarged contact sheets. It did not infer provider timing from the gallery's artificial playback cadence.

After unblinding, the three directional preferences were all for plain dressing: case 01 high confidence, case 02 low confidence, case 03 medium confidence. Case 04 was a tie because both variants invented conspicuous golden structures. This agrees with the cohort's design-retention measurements but is not a statistical prompt-quality ranking or independent garment-ownership annotation. Changed drape can be legitimate; invented motifs and the loss of recognizable reference structure still matter independently of palette membership.

[live-evidence-audit.mts](challenge/live-evidence-audit.mts) independently checks the retained raw evidence, rather than trusting the evaluator's summary. [Audit results](challenge/live-evidence-audit.json) verify:

- Eight distinct request identities, queue records and provider jobs, each with one recorded attempt and a prior durable claim.
- All 72 image references have matching PNG hashes, consecutive provider labels and full native dimensions. There are 68 distinct PNG hashes because each pair shares its exact decoded source anchor.
- All 72 blind-gallery raw images match the corresponding retained decoded provider image. The primary raw index remains 7 and the sensitivity index remains 8.
- Output zero is decoded-RGBA-exact in eight of eight requests, while its PNG bytes differ in all eight. All 16 endpoint right panels have zero nonzero-alpha pixels, not merely zero pixels above an opacity threshold.
- Within each of four pairs, canonical requests are identical except the description. Equal requested seeds are a matching condition, not proof of shared model noise.
- Stored provider usage sums to the same **$0.09793791823254691 USD** as the queue receipts, with zero subscription generations. This audits retained usage/receipts, not a separate bank or account statement. The auditor made no provider calls.

Every request returned nine images against the predeclared eight-output protocol. The [live report](live/README.md) correctly preserves that deviation and keeps raw index 7 primary while reporting raw index 8 separately. The apparent included source anchor does not retroactively make the original protocol conformant. No best frame was chosen, failed sample discarded, or paid retry purchased.

**Verdict: no endpoint-dressing or cloth-settling default is qualified.** A recognizable dressed sprite for a small charge is demonstrated; exact approved-design retention, novel garment fitting, general modularity and savings are not. The zero-cost overlay already solves these already-fitted fixtures exactly. In this pilot, palette distance zero coexists with changed garment structure, so neither palette success nor favorable frozen-body recomposition may stand in for raw and semantic review.

## Final decisions and remaining prerequisites

Accept the two narrow shared input-contract improvements: structural grid packing and motion-source timeline validation. Retain the existing composition/recolor behavior supported by the finite golden controls. Reject a universal color/topology cleanup, automatic dressed-source rerigging, endpoint-dressing default, or a claim that ComfyUI/H3 solves registered equipment based on these results.

The coordinator reports passing type checks, 1,932 unit tests with one existing skip, and 68 affected Studio/selftest browser checks. Those checks ran on a shared tree with broader-cycle changes; later unrelated edits are not silently included. The reviewer independently ran the adversarial before/after scripts, the 96-state combination challenge, native Godot probe and live evidence audit. This document does not reclassify the coordinator's complete application suite as an independent execution by the reviewer.

The central [qualification report](README.md) and live report were reviewed after unblinding and preserve these boundaries. Actual RGB MoCap reconstruction and a genuine structured export/converter remain prerequisites. A pinned repository tree without structured files and an empty official release listing do not prove no legitimate export exists elsewhere. Native ComfyUI/model inference, MakeHuman/voxel beauty output, held-out novel garments and body families, measured human correction effort, automatic ownership-label acquisition, and broad renderer/export parity remain unqualified.

Further research should pursue a specific discriminating experiment or legitimate prerequisite, rather than repeat a favorable example or call all paper-doll research complete. The productive next evidence is a permitted structured motion export, held-out clothing/body cases with contemporaneous controls, or independently labeled defect-mask/correction work. These remaining areas do not invalidate the tested narrow fixes, and passing those fixes does not erase the remaining work.
