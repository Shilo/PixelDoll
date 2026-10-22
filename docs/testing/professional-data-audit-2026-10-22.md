# Data, compositing and export audit — 2026-10-22

Worktree: `codex/professional-audit`. All work and tests used the shared professional-audit worktree; the original checkout's
uncommitted equipment-library work was left untouched. This report covers data/import/export and independently reviewed
Studio navigation races; broader UI and live PixelLab evidence are in the main professional audit report.

## Findings and fixes

| Finding | Fix and evidence |
| --- | --- |
| Layer exports ignored outfit colour selections, including skin/shirt/shorts; engine runtimes equipped source-colour sheets. | Export normalization creates deterministic ordinary colour-baked item copies only for palettes actually used by exported outfits. Outfits select these copies; matching combinations reuse them. The canonical body remains a hidden animation clock, with a synced ordinary body overlay. Original editable project data is unchanged. |
| Body hide/clip rules could miss the exported body overlay. | All existing hide targets include the visible body slot; clipping targets it instead of the hidden clock. The overlay's intentional `hides(body)` avoids self-hiding. Identity-palette body copies preserve original-colour outfits and permit body clipping without extra canonical body items. Parent supplied the counterexample; dedicated pixel regressions cover item hides, slot hides, clipping and uncoloured clipping. |
| Imported item/slot/outfit IDs could become unsafe ZIP paths, layer pivots could request huge baked canvases, and fractional frame references passed rig validation. | Shared validation rejects unsafe or duplicate IDs, invalid layer IDs/roles, layer cells outside 1–256 px, pivots outside their own cell, and noninteger animation/playlist indices. Export validates before making derived variants. Existing internal `item~cover` tuck variants remain valid. |
| Unique PNG byte/pixel limits missed repeated logical sheet references, allowing a small archive to request excessive allocations. | Import counts every referenced logical frame/sheet before decoding or slicing, bounded to 64M pixels, even when paths/hashes repeat. Dimensions must be positive bounded integers before accounting; frame lists must be arrays, so negative-size/object-length budget subtraction cannot bypass the cap. Independent pipeline agent found and challenged both bypasses. |
| Godot resource IDs collapsed distinct valid move IDs such as `walk-fast` and `walk_fast`. | Separator characters now use reversible hexadecimal escapes, keeping all resource IDs distinct while satisfying Godot's allowed characters. Runtime imports and focused regression pass. |
| Item acceptance and shirt/short region persistence wrote blobs separately from project references. | Existing `updateCharacter` publishes both in one IndexedDB transaction, closing the garbage-collection gap. Region preparation refuses to overwrite a newer frozen base while retaining metadata-only split updates. |
| Deletion retained material ownership/outfit selections, and delayed autosave could restore references or wipe a concurrently accepted item's materials. | Deletion clears owned materials, linked-material targets, saved/current selections and variants. Autosave retains materials for items introduced after its snapshot and cleans dangling references. Focused tests exercise the mutation semantics with a concurrent newer record. |

Colour normalization runs before tuck normalization. All engines therefore consume the same already-coloured PNG layers;
no shader, backend or new dependency was added. `project.json` uses the original source manifest and original cells.

## Verification

- `export-colours.test.ts`: exact source recolour/composite equality for two outfits, three directions including a mirror,
  body and equipment colours, hair-under-helmet tuck masks, baked PNG rows, engine-only reimport and unchanged editable
  ZIP roundtrip. Also checks Aseprite's flattened visible first outfit, Godot/Unity/Phaser overlay metadata, deterministic
  IDs, duplicate palette reuse, ID/slot collisions, linked materials, later-only body recolour, body hides and clipping.
- `export-validation.test.ts`: archive-path IDs, oversized/negative geometry, fractional frame references and Godot ID collisions.
- `dress-persistence.test.ts`: new-item material survival, item deletion cleanup, stale autosave cleanup and newer-base protection.
- `character-import.test.ts`: existing current/legacy PixelLab and PixelDoll import tests plus repeated-reference budget rejection
  and rejection of negative dimensions before materialization. The existing 48/56-in-64 input path is unchanged; oversize validation/selftests retain 96px layer geometry.
- Targeted import/export/persistence suite after final source edits: **24 tests passed**. Earlier validation/selftest suite:
  **53 tests passed**. Type check at the initial colour-normalization revision: **0 errors, 0 warnings**; the root agent
  owns the final whole-worktree checks after source freeze.

### Actual engine runtime smoke

The generated synthetic fixture contains a fixed 64px body, hair and helmet, two frames, south/east/mirrored west, and two
outfit palettes (gold and rose). Both the ordinary helmet tuck case and the stronger body-clipping case were exercised.
The second run followed the body alias correction; its helmet covers rows 25–29 so clipping changes visible body pixels.
The actual Aseprite CLI check used that stronger fixture as well, exporting each palette as the first visible outfit in turn.

| Runtime | Result |
| --- | --- |
| Phaser 3.90.0, managed Chromium/WebGL | 49,152 rendered pixel comparisons per run; **0 differences** for both outfits, all three views and both frames. 120 live animation steps, 1,080 follower checks; **0 frame/pivot mismatches**. Hidden clock visited frames 0 and 1. |
| Phaser 4.2.1, managed Chromium/WebGL | Same counts and **0 differences/mismatches**; hidden clock advanced both frames. |
| Godot 4.7.1 headless, actual imported scene/runtime | 49,152 comparisons using the runtime-selected visible frame textures, actual z order and pivot offsets, plus live hidden-clock checks: **49,214 checks, 0 failures**, clock visited both frames. This uses headless Image composition rather than a GPU screenshot. |
| Aseprite 1.3.18.6-x64, actual batch CLI | Both gold-first and rose-first exports flattened exactly: **0 / 24,576 differing pixels per outfit** across three directions and two frames. Per-layer split sheets: **0 / 589,824 differences per export**, 144 layer-frames each. All three tags, frame durations, repeat behavior and 64px pivot slice matched. |

Local evidence and reproducible harness instances are under gitignored `docs/testing/img/colour-runtime/`; no token is
present. Fixture generation uses the same source shape as the committed colour-export unit test. The existing Phaser
oversize harness was reused on localhost port 8766; this particular synthetic fixture does **not** claim new 96px live coverage.
Godot's harness loaded reference PNGs directly, producing a warning about that test-only reference-loading method on export;
the generated scene itself uses imported Texture2D resources normally.

## Primary-source research and decisions

- [Godot AnimatedSprite2D](https://docs.godotengine.org/en/stable/classes/class_animatedsprite2d.html) documents frame-change
  signals, frame/progress synchronization, `centered` and `offset`. The existing shared clock plus integer pivot offsets
  follows those contracts; the colour overlay reuses ordinary follower behavior. This is an implementation inference
  tested in the actual runtime above.
- [Phaser textures](https://docs.phaser.io/phaser/concepts/textures) describes atlas frames, texture keys, pivots and nearest
  filtering. Its shared texture model supports exporting palette-specific atlas sheets without a runtime colour shader.
  The engine pixel comparisons above validate that inference for Phaser 3.90 and 4.2.
- [Unity Sprite.Create](https://docs.unity.com/en-us/engine/7000.0/script-reference/unityengine/sprite/create) documents
  normalized pivots and pixels-per-unit. The existing exporter retains each layer's pivot and the rig's shared PPU.
  This audit verified generated metadata and runtime code paths; it does **not** claim a newly signed-in Unity editor run.
- [Aseprite file specification](https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md) defines layer visibility,
  cels, z-index adjustments, durations and linked cels. Colour copies preserve those existing export structures; the
  binary readback flattened to exactly the first outfit's intended pixels.
- [PKWARE ZIP specification](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT) remains the format reference.
  Existing ZIP code verifies bounded expansion, CRCs, duplicate names and safe paths; this audit additionally bounds the
  logical decoded character, which is an application-level concern beyond compressed archive size.

## Residual limits

- Tuck normalization intentionally retains the Cartesian hair/cover combinations, including unused outfit pairs, so
  engine users can still equip arbitrary exported inventory combinations. Palette copies can increase export size and
  export computation; only palettes actually used by outfits are copied, and duplicate combinations are reused.
- Unity editor execution and the Godot Aseprite Wizard integration remain outside this run's verified claims.
- Physical devices were not tested; existing project decisions exclude physical-phone testing.
- This is a bounded review of the current implementation, not a mathematical proof that every malformed archive or
  engine customization behaves correctly. Existing unresolved generated-art quality warnings remain with the pipeline team.


## Final acceptance counter-review

The final paid smoke run exposed a misleading clean badge and missing dollar costs. Independent review found that the
legacy `ItemResult.g1` map also held nonstructural keyframe appearance checks (G2/G3/G4/D1), so rejecting every map entry
would also reject ordinary complete artwork that users are allowed to keep. The pipeline now distinguishes actual G1
structure failures, requires every expected frame key before saving, and retains valid imported-rest artwork even when
its design has a warning. Ordinary frame-art exceptions remain explicitly acceptable.

Accepted appearance messages now persist in optional `Item.designWarnings`, separate from replaceable frame QA. Studio
shows **Accepted appearance warnings** in plain words and retains **Needs a look** even when passing clip checks are
replaced or all old frame QA is invalidated. It does not fabricate clip failures or conservative legacy totals. The
editable ZIP roundtrip retains these messages. Shared import/export validation rejects non-array values, nonstring or
blank entries, more than 100 messages and strings longer than 2,000 characters before imported items reach Studio.

`gensOf` and `usdOf` count distinct current and historical draft ledger IDs. Review traced rerolls, key switches,
best-roll selection and rejected/selected grid fallback bookkeeping; every paid record remains in current/old IDs.
A manual full **Try again** starts a fresh draft; earlier attempts remain in Activity rather than the new draft's Details.
The accepted item's Details labels selected-provenance usage **Source calls**, including dollar usage, so it does not
misrepresent that selected-output provenance as the total cost of all discarded retries.

Verification: two new unit tests passed (merge/replacement/all-QA invalidation/ZIP retention and malformed ZIP metadata),
and one actual Chromium UI regression passed (plain D1/G2 messages, health badge before/after QA removal and `$0.080`
source usage). Pipeline's separate acceptance tests cover no writes for G1/missing coverage, acceptability of ordinary
art flags, design-message splitting, valid warning-bearing imported-rest cells, and mixed-currency retry totals.

## Actual downloaded helmet engine verification

After the browser accepted and reimported the paid helmet result, tested the actual UI-downloaded `audit-verified-helmet-{godot,phaser,aseprite}.pixeldoll.zip` files from Downloads. Their original sizes are **125,877 B (Godot), 128,222 B (Phaser), and 145,679 B (Aseprite)**. They contain the same accepted artwork, named **Audit verified helmet**, with a 64 px body and helmet, four explicit rest directions, and the imported walking clips. This is separate evidence from the earlier synthetic palette/tuck fixture and from the pending independent-character/96 px weapon flow.

The ignored harness merges only the actual downloaded engine folders and their original files. Its reference baked PNGs are generated offline from the downloaded editable source. All **8 downloaded layer sheet PNGs byte-match** the offline export; no regeneration or paid API call was used.

| Actual downloaded target | Result |
| --- | --- |
| Phaser 3.90.0, Chromium/WebGL | **819,200 pixel comparisons, 0 differences**, 480 live animation steps, 3,840 visible-layer clock/pivot checks, 0 mismatches. |
| Phaser 4.2.1, Chromium/WebGL | **819,200 pixel comparisons, 0 differences**, 480 live animation steps, 3,840 visible-layer clock/pivot checks, 0 mismatches. |
| Godot 4.7.1, actual imported scene/headless runtime | **819,200 pixel comparisons; 820,584 checks; 0 failures**, correct layer pivots/frame dimensions, all eight walking frames visited. Uses runtime-selected textures and Image composition, not a GPU screenshot. |
| Aseprite 1.3.18.6-x64, actual downloaded `.aseprite` through installed CLI | Correct **28 timeline frames, 7 direction/move tags**, durations, loop settings and pivot `(32,59)` on a 64×64 canvas; **0/114,688 flattened pixel differences** and **0/229,376 per-layer pixel differences** over 56 layer frames. |

Godot/Phaser compare every manifest sheet row, including transparent rows for unavailable direction/clip combinations; Aseprite's 28-frame timeline follows only the exported available combinations. Godot and Phaser cover both `current` (helmet equipped) and `default` outfits; Aseprite flattens the first, `current`, outfit and additionally verifies both exported source layers. The captured Phaser screenshot was inspected and shows the helmet on the expected rendered character. Godot warnings concern direct loading of test-only baked reference PNGs; the exported scene uses normally imported texture resources. No Unity editor execution is claimed, and this test contains no 96 px equipment.

Evidence: ignored `docs/testing/img/professional-audit/actual-helmet-runtime/` contains `prepare.mts`, `prepare-results.json`, `phaser-results.json`, `godot-results.json`, the actual extracted `export/` files, CLI `export/cli_colours/{comp,layers}.{json,png}`, and `shot_oversize_export_{3.90.0,4.2.1}.png`. The isolated static server binds localhost only and is stopped after verification. No app source changes were made for this verification.

## Actual independent idle recovery evidence

The new independent-direction idle+walk creation did **not** complete: two final walking `estimate-skeleton` requests returned HTTP500 with unknown paid outcomes and were not resent. All work settled before recovery. The separate developer-only visible helper then recovered **idle only** from known-complete saved results. It made no API calls and left projects/jobs/the failed creation untouched; the ordinary import UI saves the downloaded artifact separately. Its default connection opt-out and CSP block external API use. Ten synthetic-ledger tests and strict checks pass, including production `routes.png` + in-memory `Queue.enqueue` image-reference normalization, missing/wrong measurements, malformed joints, missing direction/duplicate frames, tampered PNG/request hashes and diagnostic immutability.

The actual downloaded `audit-recovered-independent-idle.pixeldoll.zip` is **103,061 B, 22 entries**, named **Audit independent character recovered idle**. Offline inspection verifies four explicit S/E/N/W directions, four idle cells each, **16/16 exact cleaned-frame PNG hashes matching the artifact's measurement provenance** and **16/16 stored skeletons matching the genuine measured keypoints**. Source references, original rest views, requested poses, independently measured poses, anchors, QA and provenance survive editable ZIP import. This validates the recovered idle artifact's internal evidence; the visible builder performed the original done-ledger/input checks.

| Direction | Actual idle adherence (px) | Feet drift | Palette fit | Border | QA failures |
| --- | --- | --- | --- | --- | --- |
| South | 0.27 | 0 | 1 | 0 | 0 |
| East | 0.46 | 0 | 1 | 0 | 0 |
| North | 0.31 | 0 | 1 | 0 | 0 |
| West | 0.54 | 0 | 1 | 0 | 0 |

East's cleanup removed one detached pixel; other directions removed none. The recovered original west rest image differs from a horizontal flip of east at **44 opaque pixel positions**. The west idle cells differ from flipped east by **64, 95, 96 and 122 pixels**, respectively. The comparison image was inspected: columns are east, flipped east, actual west; rows are rest followed by idle cells 0–3. These establish distinct retained west artwork; an unarmed idle alone does not prove correct weapon grip or active-arm handedness.

The artifact reports **$0.1860957463 USD in selected source records only**, with an explicit warning that the failed full flow has additional charges. This is not a full creation cost or a successful idle+walk result. The visible helper also displayed the two lost estimator inputs: both are valid, nonblank 64×64 PNGs, with **520 opaque pixels (x24–39/y13–58)** and **525 opaque pixels (x25–41/y13–58)**, matching east walking cells 3 and 4. Blank/malformed input is not supported by this evidence; the HTTP500 cause remains unknown.

Ignored evidence in `docs/testing/img/professional-audit/independent-live-runtime/`: `recovery-inspection.json`, `idle-trajectories.json` (requested/measured right/left wrist points and both anchor tracks for every direction), `east-flipped-east-west-rest-and-idle.png`, and `analyse-recovery.mts`. The original recovered ZIP is retained as `docs/testing/img/professional-audit/recovered-independent-idle.pixeldoll.zip`. No source changes or paid calls were needed for this inspection; independent 96 px weapon runtime evidence remains a separate pending test.
