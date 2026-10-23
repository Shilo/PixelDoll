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

Ignored evidence in `docs/testing/img/professional-audit/independent-live-runtime/`: `recovery-inspection.json`, `idle-trajectories.json` (requested/measured right/left wrist points and both anchor tracks for every direction), `east-flipped-east-west-rest-and-idle.png`, and `analyse-recovery.mts`. The original recovered ZIP is retained as `docs/testing/img/professional-audit/recovered-independent-idle.pixeldoll.zip`. No source changes or paid calls were needed for this inspection; independent 96 px weapon runtime evidence is recorded separately below.

## Actual recovered independent idle engine runtimes

Exported the actual recovered idle-only artifact offline with the frozen application code, then ran its generated Godot, Phaser and Aseprite files in the real runtimes. Source ZIP SHA-256: `a192066ab8bc4edf4529d0214837c8a84a48603d044278314a193d514b848e97`. This is actual independent four-direction body artwork, with four frames in every direction, and **no equipment/96 px layer**. No PixelLab request was made.

| Runtime | Actual recovered idle result |
| --- | --- |
| Phaser 3.90.0, Chromium/WebGL | **65,536 pixel comparisons, 0 differences**; all four frames visited in S/E/N/W, including independently rendered west; 120 live steps, 480 clock/pivot checks, 0 mismatches. |
| Phaser 4.2.1, Chromium/WebGL | **65,536 pixel comparisons, 0 differences**; all four frames visited in every direction; 120 live steps, 480 clock/pivot checks, 0 mismatches. |
| Godot 4.7.1, imported scene/headless | **65,536 pixel comparisons; 65,705 checks; 0 failures**; all four body-clock frames advanced. Runtime-selected textures are composed with Image, not a GPU screenshot. |
| Aseprite 1.3.18.6-x64 CLI | **16 timeline frames, 4 tags**, correct durations/loops and pivot `(32,59)`; **0/65,536 flattened differences** and **0/65,536 per-layer differences**. |

The Phaser capture was visually inspected and shows south, east, north and the independently rendered west body. Every engine's west frame agrees with the actual recovered west pixels already shown to differ from flipped east. This proves preservation/playback of the recovered idle directions; it does not upgrade the failed full idle+walk creation to a success or prove a weapon's anatomical grip. The subsequent 96 px equipment test is recorded separately below. Godot's reference-PNG warning is limited to the test harness's direct baked image loading.

Ignored evidence: `docs/testing/img/professional-audit/independent-idle-runtime/` contains source-hash metadata, exported files, `phaser-results.json`, `godot-results.json`, Aseprite `export/cli_colours/` frame sheets/metadata, scripts and the inspected `shot_oversize_export_3.90.0.png` / `4.2.1.png`. The owned localhost-only server was stopped after verification.

## Actual independent 96 px idle sword verification

Inspected the accepted/equipped **Audit steel sword** from the real UI download `audit-independent-idle-generic.pixeldoll.zip` (**94,377 B**, SHA-256 `f0944e737c6f6f80df8ba3d51357ab2f6f02f14ca643ffb62e0a227b7f7d919c`). This is **Audit independent idle**: four explicit directions, four idle cells per direction, original rest views, 64×64 body pivot `(32,59)`, and separate 96×96 sword fg/bg layers pivot `(48,75)`. Both body/item mirror metadata says `generate`; no direction has `mirrorOf`. Engine files and baked references were exported offline from this actual editable ZIP, without another PixelLab call. Slash was still running and is not included in this result.

| Runtime | Actual 96 px idle sword result |
| --- | --- |
| Phaser 3.90.0, Chromium/WebGL | **294,912 pixel comparisons, 0 differences**, both current sword and default outfits; all four frames visited in all directions; 120 live steps, 1,440 follower/pivot checks including 960 oversize-layer checks, 0 mismatches. |
| Phaser 4.2.1, Chromium/WebGL | Same **294,912 pixel comparisons, 0 differences**, 1,440 follower/pivot checks and 960 oversize checks, 0 mismatches. |
| Godot 4.7.1, imported scene/headless | **294,912 pixel comparisons; 295,466 checks; 0 failures**. Static checks include 32 actual 96 px layer frames; equipped live playback adds 360 follower checks, including 240 oversize-layer checks. Body clock visited all four frames. |
| Aseprite 1.3.18.6-x64 CLI | **16 frames, 4 tags**, correct timing/loops, actual layer order sword.bg → body → sword.fg, and 96×96 canvas pivot `(48,75)`; **0/147,456 flattened pixel differences**, **0/442,368 per-layer differences** over 48 layer frames. |

All sixteen composed sword cells and requested-wrist overlays were visually inspected. Blade shape and attachment remain visually stable; south/north right-side placement is clear. Profile views do not establish anatomical handedness from whole-blade proximity alone. In west the nearest sword-pixel distances to requested right/left wrists are respectively **3.659/3.343, 3.302/3.258, 3.660/3.344, 3.302/3.258 px**; real measured wrists likewise leave all four frames ambiguous. The correct outcome stays **manually accepted / Needs a look**, with west `hand:'?'`; it is not a clean handedness proof. Stored aggregate grip counts are **10 right, 0 left, 6 ambiguous, 0 no-contact**. The G8 patch preserves this uncertainty while distinguishing genuinely missing tracks and detached silhouettes; opposite-hand contact still fails.

The independent west sword pixels are not mirrored east artwork: foreground differs by **21/23/16/21 pixels** and background by **34/74/37/35 pixels** across cells 0–3. Full requested/measured wrist trajectories and nearest-pixel positions are retained, so a later Slash result can be assessed separately instead of inferred from idle.

Evidence under ignored `docs/testing/img/professional-audit/independent-live-runtime/`: original `actual-idle-sword.pixeldoll.zip`, `prepare-results.json`, `sword-grip-inspection.json`, `idle-sword-contactsheet.png`, `idle-wrist-overlay-redR-blueL.png`, `phaser-results.json`, `godot-results.json`, exported resources, Aseprite `export/cli_colours/`, runtime screenshots and scripts. Godot uses headless Image composition of actual runtime-selected textures; its direct reference-PNG warning is test-only. No Unity editor or attack animation success is claimed here. The owned localhost-only scratch server was stopped after these checks.

## Actual Slash: faithful engine export, failed artwork quality

The next real UI ZIP, `audit-independent-idle-generic.pixeldoll (1).zip`, is **275,321 B**, SHA-256 `2303a73a4aaba119a919f7eb8f71c89a9b0dedf5dba2088e4ab94790e3d7405c`. It contains the recovered four-view idle plus **8 Slash cells in each of four explicit directions**, and the 96 px sword fg/bg layers. All paid jobs settled; the root observed **$0.582** for this flow including rerolls, without unknown outcomes. This completed generation/storage/export workflow is **not a clean artwork or anatomical-motion result**.

All 32 Slash cells were reviewed by the root in Codex browser, including a sword-off countertest; independently inspected contact sheets and separated body/fg/bg images confirm west frames 1–2 retain a lowered blade while an upper blade/fragment appears, with additional west/east gray remnants. The base alone has the raised arm and no sword. Explicit foreground/background cells already contain these defects; composition has no idle-layer fallback. West cell1 is not repaired; only west0/7 carry `repaired:true`. The split partitions pixels and attachment cleanup removes pixels; neither can combine a new raised blade with an old lowered one.

The item remains **QA `fail`**, with west minimum-area ratio **0.36**, minimum key kept **0.945**, and uncertain grip. Slash S/N are `warn`, E `pass`, W `fail`; the previously accepted idle-west uncertainty survives. No gate was weakened, no pixels repainted, and no failed art was certified clean.

| Direction | Recomputed body pose adherence (px) | Requested right/left wrist travel (px) | Actual measured right/left wrist travel (px) |
| --- | --- | --- | --- |
| South | 0.9802 | 85.20 / 7.28 | 81.96 / 6.49 |
| East | **2.7683 (fails 2 px gate)** | 88.82 / 4.80 | 89.21 / **55.93** |
| North | 1.0829 | 76.45 / 7.53 | 74.13 / 8.41 |
| West | **2.0974 (fails 2 px gate)** | 65.91 / 3.83 | **37.94** / 4.12 |

These use every genuine selected measured frame, independently recomputing the stored adherence. East's measured left wrist departs by up to **23.71 px** and west's right wrist by **21.34 px** on individual frames. Estimator labeling and rendered motion can be uncertain under profile occlusion; these measurements do not establish fully correct right-hand attack motion. The original body QA failure warnings are retained.

### Original-provider versus derived proof

The root operated the visible, read-only `/dev-fixtures/audit-pose-inspection/index.html`: selected the actual project, inspected west/south, and downloaded **290,527 B / 51 files**. Exact selected provenance/request hash/background-job identity, original dressed input pixels, requested poses, complete logical output indices, every raw PNG hash and every derived comparison were checked. The page defaults agent mode off, blocks external connections, imports no client/queue/bootstrap, and never submits, mutates projects/jobs, replaces or accepts an item. Its seven parser identity regressions and strict checks pass.

Both original west provider rolls' **raw PNG frame1 already shows the lowered sword and upper gray weapon/ghost**; their input keyframe contains a single lowered sword. The selected second roll's derived masks equal all eight currently stored item cells with **zero pixel differences**, proving faithful extraction/recomposition rather than a software-added second weapon.

| Actual source roll | Failed checks | Outcome |
| --- | --- | --- |
| West first, seed271204 | **3**: G2 cells1/4; G4 minimum area19% | Bad provider artwork, fail. |
| West second, seed1081539, originally selected | **4**: G2 cells1/3/4; G4 minimum area36%; plus G8 uncertainty/no-contact warnings | Bad provider artwork, fail; all derived pixels match stored item. |
| South first, seed1175788 | 1 G2 failure | Fail. |
| South second, seed1986123, selected | 0 failures; one G8 no-contact warning | Warn; all derived pixels match stored item. |

This real counterexample justifies the bounded `poseItemClip` fix: preserve the complete candidate with fewer failed checks, retain the first on ties, keep pixels/provenance together, and count additional attempt history independently of the winning roll. Malformed candidates cannot displace complete ones; unknown/cancel/abort still stop publication. The future fix chooses west's first roll by the existing metric and south's second, but **both west rolls remain defective**. It neither repairs this stored artifact nor proves that the first is visually good. No more paid generations or forced pixel cleanup were used to hide that limit.

### Actual engine fidelity on the failed artwork

| Runtime | Result preserving the actual source, including defects |
| --- | --- |
| Phaser 3.90.0, Chromium/WebGL | **884,736 pixel comparisons, 0 differences**, current/default outfits; 240 live steps, 2,880 follower/pivot checks including 1,920 oversize checks, 0 mismatches. Every idle0–3 and Slash0–7 frame visited in S/E/N/W. |
| Phaser 4.2.1, Chromium/WebGL | Same **884,736 pixel comparisons, 0 differences**, 2,880 checks/1,920 oversize checks, 0 mismatches; all frames visited. |
| Godot 4.7.1, imported scene/headless | **884,736 pixel comparisons; 886,035 checks; 0 failures**. 96 static oversize layer-frame checks; 720 equipped live follower checks including 480 oversize checks; idle0–3 and Slash0–7 clocks advanced. |
| Aseprite 1.3.18.6-x64 CLI | **48 frames, 8 tags**, correct durations, loop/repeat settings, bg→body→fg order and pivot `(48,75)`; **0/442,368 flattened differences**, **0/1,327,104 per-layer differences** over144layer frames. |

This verifies exporter geometry/pivots/clocks and preservation of QA/data; it is not approval of the source animation. Godot uses headless Image composition of actual selected textures and emits only the test-reference PNG warning. No Unity editor run or clean attack-generation claim is made.

Ignored evidence is kept separately in `docs/testing/img/professional-audit/independent-slash96-runtime/`: original ZIP, `slash-motion-validation.json`, `sword-grip-inspection.json`, `slash-source-qa.json`, `slash-{south,east,north,west}-row.png`, full/marked contact sheets, per-frame `slash-west-*-composite-body-fg-bg.png`, engine results/screenshots/resources, Aseprite CLI output and `source-roll-inspection/` containing original diagnostic ZIP, raw PNGs, before/after masks, selected markers and summary. The earlier successful96pxidle evidence is unchanged. The owned localhost-only scratch server was stopped after verification; no app source was edited for these offline checks.

## Follow-up: genuine side-Slash repair investigation

The user requested correction of the remaining art rather than treating engine fidelity as completion. Offline forensic boards (`body-{east,west}-original-requested-measured.png`, rows original/requested/measured, red right arm/blue left) and `body-pose-forensics.json` isolate the original failures:

- East frames1–3 track the active right wrist within0.64/1.24/0.64px, but the estimator moves the passive left wrist onto the raised arm: errors17.64/23.71/15.90px. Their frame means are5.63/8.04/5.35px.
- West frames1–2 miss the active right wrist by20.31/21.34px and elbow by11.39/12.54px; frame means5.53/5.95px. The requested wind-up crosses behind the head; frame2's visible raised hand is absent in the processed body.
- Swapping left/right labels makes every frame's mean worse (East2 is only near-tied8.04→8.13). This is not a whole-label inversion, shared coordinate offset or canvas-scale error. These observations do not justify replacing actual estimates with requested targets or weakening the gate.

The visible read-only body inspector exported the original source rolls from explicit body-source provenance, exact request/job hashes, original rest pixels and complete frame order. Evidence lives in `independent-slash96-runtime/body-source-inspection/` (`actual-body-inspection.zip`, `body-inspection.json`, per-roll original/processed/removed PNGs). **Cleanup did not remove a legitimate raised hand:** selected west roll2 removes13 detached grey weapon/motion pixels on frame2, not skin. Its raw image already lacks the intended raised fist. West roll1 contains invented connected long blades despite the unarmed appearance prompt; cleanup removes7/48 detached pixels on frames1/2 but retains the connected blades. East removes0 pixels on both rolls.

Strict raw-cleaned-to-stored equality is false because Studio's existing shirt/shorts split deliberately changes the blue least-significant bit of garment colours. A separate exact comparison (`compare-body-source.mts`) confirms west roll2 and east roll1 match all8 stored silhouettes and all non-region RGB channels:0 alpha/geometry differences and0 non-region colour differences. Their only differences are the documented1/255 garment bit; the other rolls have genuine silhouette/colour differences. The inspector reports strict differences honestly rather than silently tolerating them.

The minimal repair strategy is a **versioned, pre-authored visible front guard for side views**, preserving anatomical labels, original bone lengths, legacy targets and unchanged south/north clips. Real output must still pass the unchanged2px pose-adherence gate. A held-item fallback edits the actual frozen padded96px frames with measured-wrist masks, protected reference cells and held-specific wording;8frames+4references form384×288, within the official512px inpaint limit. This is permitted Pro editing of existing artwork. It does not certify a single blade automatically; all32 actual cells still require independent visual review. The request constraints and first-frame pose requirements were checked against the [official live OpenAPI](https://api.pixellab.ai/v2/openapi.json).

Storage now permits a synchronous `saveItem` precondition inside its read/write transaction, before any manifest mutation. The repair caller rejects changed/deleted rigs or items while preserving unrelated latest outfit/name edits. Three focused storage tests and seven offline body identity/PNG/zero-network tests pass; independent targeted-body/grid tests bring this focused check to22 passing cases. Actual repaired output and new engine verification remain pending at this point in the record.
