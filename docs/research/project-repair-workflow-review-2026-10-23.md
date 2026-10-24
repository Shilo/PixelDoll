# PixelDoll: project challenge and frame-repair decision

Review date: 2026-10-23. Decision support, not an approved implementation plan.

## Recommendation

**Add an optional, narrowly scoped equipment-frame repair workspace. Do not build a general pixel-art editor.** Fix structural acceptance and review coverage first. Keep the frozen body protected initially; give pose diagnosis a separate path. Support external finishing through a deliberate replacement import later.

The product should promise **AI-assisted creation of editable, synchronized paperdoll assets**, with automated checks and optional human finishing. The existing “every pixel comes from PixelLab; never draws” goal is a self-imposed restriction that works against usable output. Human correction is compatible with minimal required effort: most users should never need to open the repair workspace.

This recommendation is supported by current defects and comparable products. It is not proof of user demand for a large integrated art suite. A bounded prototype and timed repair trials should determine how much editing to ship.

## Scope and evidence limits

Three sub-agents independently examined (1) generation, skeletons, extraction and QA; (2) Studio, composition, storage, recolor and exports; and (3) current official competitor documentation. The primary review examined their findings, core documentation, current source, historical experiments and recent body/rotation audits, and ran local verification.

The review covers the product's complete asset lifecycle and its supporting documentation. It is not a line-by-line security audit of every module, a new visual review of every historical generated frame, or a fresh verification of every engine runtime. Findings distinguish reproduced defects, source-established limitations, historical evidence and recommendations.

The checkout already contained uncommitted export, test, documentation and design work. Those changes were preserved. Conclusions describe the inspected working snapshot; they do not imply that all features are in the released v0.1.0 build. No PixelLab token or `.env` was read, and no paid API request was made.

## What is worth preserving

- **Frozen raster body plus synchronized equipment cells** is the appropriate output model for traditional engine paperdolling. Runtime bones are unnecessary for this product.
- **Stored source images, poses, pivots, hashes and provenance** avoid relying on non-repeatable AI generations. Reuse them for repair history rather than introducing another document system.
- **Chroma-mannequin generation** is a practical way to obtain overlays from a composite-only AI service. The spike evidence is useful, provided its measured success is not promoted into a universal guarantee.
- **Exact palette swaps, explicit move/direction coverage, oversize layers sharing a pivot, client-only exports and recoverable project ZIPs** directly serve game production.
- The recent decision to retain detached body details and treat uncertain pose, border and silhouette measurements as review observations is sound. The rotation-origin rollback is a particularly useful example of challenging an attractive automation against real geometry.

These foundations justify improving the product. They do not justify claiming perfect anatomical consistency, semantic layer separation or quality merely because the exported result matches the compositor.

## Highest-priority findings

Priorities describe product impact. P1 means address before relying on the workflow or adding an editor over it; P2 means a material limitation or prerequisite for the proposed feature.

### 1. P1: malformed batches can produce a clean, accepted item with missing cells

**Reproduced offline through real evaluation, acceptance and save functions.**

`evaluateItem()` records wrong frame count/dimensions in `g1`, then excludes those calls from the cells used to compute QA (`app/src/lib/items/run.ts:280`, `:288`, `:312`, `:319`). `acceptItem()` checks that jobs are done and that some QA exists, but does not block `g1` or require complete selected-cell coverage (`:356`). `buildItem()` fills missing cells with `null` (`app/src/lib/items/items.ts:865`). The Studio enters review when any evaluated cells exist (`app/src/studio/state.svelte.ts:520`), and its Clean badge uses the survivor QA status (`app/src/studio/GenCard.svelte:37`).

The queue does not prevent this case: its result validation checks parseable, positive dimensions within the image size limit, rather than the exact request shape (`app/src/lib/pixellab/queue.ts:734–739`).

Reproduction: a 32 × 32 rig with one south cell in each of idle/hurt; an anchor-route torso item; the first completed edit returns a valid chroma body with a 3 × 3 red item; the next completed anchored edit returns a valid anchor plus a valid 16 × 16 transparent PNG. Both calls have exhausted retries. The probe replaced the queue with completed synthetic job records and IndexedDB with in-memory storage; PNG encoding/decoding, extraction, item QA, build, `evaluateItem`, `acceptItem` and `saveItem` were real.

Observed result:

```json
{
  "g1": [[1, "G1 output 16x16"]],
  "qaStatus": "pass",
  "cells": ["idle/south/0"],
  "warnings": [],
  "acceptedQa": "pass",
  "persistedHurt": [null]
}
```

The card can still list a G1 reason while showing Clean; this is an inconsistent status, not a claim that every warning is hidden. The independent acceptance guard is the more serious failure.

**Action:** separate structural blockers from overridable visual concerns. Require exact requested coverage and valid dimensions before acceptance, and make the overall badge include structural failures. Intentionally omitted moves must remain distinct from failed requested output. An editor must not turn an absent malformed batch into an implicitly successful item.

### 2. P1: generation review does not expose the complete result it asks users to accept

`GenCard.svelte:20` fixes its preview to `g.draft.spec.anims[0]`; `:53–60` previews only that move across directions. Its outfit contains only the draft item's slot (`:28`), so review does not show interactions with the current outfit. Keep accepts the item, including other generated moves.

The accepted-item Stage can inspect moves later, but that does not substitute for complete pre-acceptance review. A malformed or visibly wrong later move can be absent from the review animation. The manual-repair entry point should begin with **choose the affected frame**, not with a blank editor.

**Action:** selectable move/direction/frame, flagged-cell navigation, current-outfit comparison, isolate-item view and explicit coverage. Distinguish “automated checks passed,” “needs review,” and “accepted by you.” A Clean badge must never imply visual correctness.

### 3. P1: current automation cannot deliver every usable item without a correction path

Current TODO entries explicitly retain unresolved shield east-walk discontinuities, cape hem smudges and real helmet hurt-frame deformation (`TODO.md:8–12`). The saved shield audit reports a centroid shift of approximately 13.55 px while the requested wrist moves 0.68 px, while carefully declining to infer a unique root cause ([item quality follow-up](../testing/item-quality-follow-up-2026-10-22.md)).

Historical T3 testing records both false paid retries and a false pass for armor smears, plus a cape wrapping the wrong anatomy despite repeated rolls ([T3 report](../testing/T3_item_coverage_report.md)). Later fixes supersede several of those particular failures; the report remains evidence that threshold scores and repeated sampling are fallible. Historical cost figures are not current API price promises.

**Action:** provide local correction for bounded visible defects. Do not solve every exception with another heuristic, another paid roll, or a weakened threshold. Preserve the original and allow a reviewed revision.

### 4. P1 for an editor: existing history and persistence do not cover pixel mutations

Current undo stores dressing state, not image/cell history (`app/src/studio/state.svelte.ts:237–253`; `app/src/lib/dress/project.ts:35–43`). `saveDress()` persists dressing data (`:72–89`). Wrapping a pixel change in the current commit helper would not make it safely undoable or persistent.

Images are shared by content hash (`app/src/lib/store/manifest.ts:143–148`), and recolor indexing caches by image object (`app/src/lib/dress/dress.ts:112–143`). Editing `Img.data` in place could change multiple cells or copies and leave stale recolor caches. Export validation checks image presence/dimensions, while editable import recomputes hashes and rejects mismatches (`app/src/lib/export/generic.ts:40–50`; `app/src/lib/store/import.ts:93–98`).

**Action:** immutable cells, fresh hashes, before/after references, one stroke per undo command, atomic publication of blobs and manifest references, and persisted original references for revert. The existing `db.updateCharacter()` is a useful transaction primitive (`app/src/lib/store/db.ts:49–65`). Keep original/history references reachable so blob garbage collection cannot remove them.

### 5. P1 for an editor: later work can overwrite a repair

`mergeClip()` constructs an updated item from its operation's earlier item snapshot (`app/src/lib/items/run.ts:439–451`). `saveItem()` replaces the matching item as a whole (`app/src/lib/store/project.ts:57–63`). A new move finishing after a pixel repair could overwrite it, including a repair on another move. This is an integration risk for the proposed editor, not a claim that current users already lose unsupported pixel edits.

**Action:** commit against expected prior cell hashes/revisions; merge only the intended changed cells. Lock repaired cells against replacement by default. On overlapping generation, present the old, repaired and regenerated versions. A smaller first implementation can temporarily exclude generation on an item while its repair session is open, but still needs protection for delayed job publication and other tabs. Existing equipment target/extension stamps provide a related pattern (`app/src/lib/equipment/copy.ts:18–24`, `:76–85`).

### 6. P2: layer order has misleading scope and limited repair power

The inspector selects an item, but `moveLayer()` writes foreground `slot.zOverrides` (`app/src/studio/state.svelte.ts:373–385`). That changes alternatives in the same slot, rather than only the selected item. The UI exposes global/direction scope, not a single frame or a background-piece control. The manifest's override type has more scope than this UI exposes (`app/src/lib/store/manifest.ts:46`), but that alone does not establish support for item-specific per-cell ordering in every runtime.

**Action:** name the scope explicitly. Distinguish a slot stacking rule from an item repair. For existing fg/bg items, an atomic pixel transfer between the two pieces is often a smaller first solution than inventing a general animated ordering system. Item-specific per-cell ordering would require an audited schema, compositor and exporter contract.

### 7. P1: replacing a body move can bless old equipment with the new compatibility hash

Source inspection establishes a compatibility gap beyond the proposed editor. `addBodyClip()` replaces body cells and recomputes `baseHash`, then advances every item matching the old hash to the new hash (`app/src/studio/create.ts:385–406`). Its replacement-path comment explicitly retains the old equipment cells until chosen items are reposed. `addMove()` reposes only the selected equipment (`:317–323`). Unselected items, or an item whose new pose fails after body publication, can retain old clip artwork while claiming compatibility with the replacement body.

Export staleness checks use the hash (`app/src/lib/export/generic.ts:60–68`); equalizing it removes that protection. This is a source-established path, not a new browser reproduction. Appending a genuinely new move is different: old body cells are unchanged and missing equipment coverage can remain explicit.

**Action:** distinguish added coverage from replacement revisions. Invalidate affected equipment cells or publish a candidate body/equipment revision atomically after review; do not relabel retained old clip pixels as refitted. This must precede general body or pose editing.

## Challenge the generation and skeleton model

### A conditioning skeleton is not a deterministic deformation rig

The app stores the requested pose sequence and uses it again to generate equipment (`app/src/lib/items/items.ts:19–20`, `:117`, `:299–302`). This is sensible consistency conditioning. It does not bind every generated item pixel to the actual raster body's hand, head or depth.

The app separately measures body joints and records estimated differences. The recent body audit correctly treats those differences as uncertain observations, not proof of incorrect art ([body quality audit](../testing/body-quality-audit-2026-10-23.md); `app/src/lib/rig/clips.ts:75–97`). Therefore neither replacing all requested poses with estimated poses nor trusting requested poses unconditionally is justified. Both are imperfect evidence about the raster output.

There are three different operations the product must keep distinct:

1. **Correct an observed joint/anchor** to improve fitting or diagnosis of an existing raster frame. This does not move the body pixels.
2. **Edit a requested pose** to change a future generation. This requires an explicitly priced generation and a reviewed new result.
3. **Paint final raster pixels** to finish an existing item. This does not teach future moves the correction.

A skeleton overlay with requested/observed joints, left/right labels, shared pivot and clear uncertainty is useful before an extensive pose-authoring UI. Add narrowly scoped joint correction only when representative defects demonstrate it helps. Do not advertise that dragging bones can non-destructively reanimate the frozen wardrobe.

There is also an immediate recovery gap: rendering/setup stops when a frame lacks complete valid estimated joints (`app/src/studio/create.ts:115–117`; `app/src/lib/rig/setup.ts:83–86`). That refusal protects the rig contract, but users cannot supply missing observations to finish already-generated artwork. Preserve a recoverable candidate and consider free manual annotation of missing/incorrect observed joints as a separate bounded control. Never fabricate estimator output, overwrite historical requested poses, or resend successful paid image calls merely to retry metadata recovery.

The action tables are authored heuristics for views and actions (`app/src/lib/rig/poses.ts:1–5`, `:54` onward). Their success on tested humanoids is not proof of correct projection/anatomy for every camera, proportion or imported body. PixelLab's own [skeleton guide](https://www.pixellab.ai/docs/tools/animate-with-skeleton) acknowledges imperfect estimates and instructs users to inspect and edit skeleton frames. That guide includes older/template workflows; it supports the human-review principle, not permission to use prohibited legacy endpoints.

### Scale and coverage claims need an evidence matrix

The creator now accepts 32–256 px source sizes in 4 px steps and configurable framing (`app/src/studio/characterConfig.ts:33`, `:114–119`). Core documentation still foregrounds 48/56 into 64 and 4/8 directions. Several cleanup tolerances remain absolute pixel measurements, such as head-mask dilation, wrist proximity and one-pixel registration (`app/src/lib/items/items.ts:308–309`, `:356–357`, `:454`).

This does not demonstrate a defect at every other size. It establishes that generalized input support exceeds the original 64 px empirical validation. Do not blindly multiply all thresholds by size: one pixel, the smallest legal detail and estimator error do not scale in the same way.

Publish separate support/validation coverage for source size, frame size, camera, proportions, independent/mirrored directions, slot class, move class and imported versus generated art. “Accepted input” and “validated high-quality equipment” are different promises. Prioritize offline stored-frame experiments and controlled counterexamples before paid expansion tests.

### Mirroring is a production choice, not a free correctness guarantee

Mirrored asymmetric gear changes visual handedness. A frame editor cannot resolve this across all actions by changing one cel. Show the source relationship and scope before an edit. Prefer independent direction generation where handedness matters, subject to the existing allowed-model policy and explicit cost.

Never propagate a painted patch to different poses by default. Even a rigid hat's apparent movement can include projection and occlusion; cloth, hair and weapons are less safe. Optional multi-cell operations need an explicit selection and diff preview.

### Base editing needs a separate revision contract

Frozen-body pixels determine `baseHash`, body silhouettes, stored references, measured joints, anchors and item compatibility (`app/src/lib/rig/rig.ts:17–26`, `:39–64`; `app/src/lib/export/generic.ts:60–66`). A body edit cannot safely be treated like changing a hat pixel.

For the first release, lock the body in the repair workspace. Future base correction should create a reviewed revision/copy and distinguish cosmetic color changes from silhouette/pose changes. Reassess affected geometry and equipment compatibility; retain originals and pending-job revision guards. Do not silently stamp every item with a new `baseHash` or regenerate the wardrobe.

## Challenge extraction and layering

### Color-key separation is classification, not true semantic layers

The model returns composites. Keying can identify likely visible equipment, not reconstruct hidden fabric or prove that every non-key pixel is equipment. The G2 key-preservation check excludes pixels already classified as item (`app/src/lib/image/chroma.ts:181–196`). An offline counterexample with a 3 × 3 off-key body redraw produced a nine-pixel “item” while reporting key kept = 1 and lost = 0. This demonstrates circular evidence in that case, not failure of every real item.

Retain generation composites and before/after extraction inspection. “Paint,” “erase,” and “restore from pre-cleanup” are different actions. A repair tool should help the user see whether the error originated in generation, classification, or cleanup.

### Cleanup can delete legitimate detail

`chromaLayer()` removes small components (`app/src/lib/image/chroma.ts:173–178`); posed extraction additionally removes components smaller than max(4 px, 15% of the largest) before later post-processing (`app/src/lib/items/items.ts:264–270`). Other routines remove pixels based on body overlap, head reference support or wrist proximity (`:308–420`).

An offline probe kept a 100-pixel item plus a detached three-pixel detail in ordinary extraction, but posed extraction reduced the area from 103 to 100 and logged three stray pixels. This proves the detail-loss mechanism on a controlled example; it does not prove a specific production item lost an intentional jewel.

These rules are useful defaults, not authority to delete user-approved pixels. Preserve the raw result, expose a cleanup difference where possible, and never run destructive extraction/cleanup again over an accepted manual repair.

### Foreground/background partition does not recover depth

`splitFgBg()` places item pixels overlapping body alpha in foreground and all other pixels in background (`app/src/lib/compose/split.ts:5–10`). Drawing those pieces back around the same body reproduces the source overlay by construction. That is a valuable preservation invariant, not proof of anatomically correct depth.

Pre-occluded item cells can be effective for the frozen body. They do not contain complete hidden shapes, and their holes are tied to that pose. A pencil cannot automatically recover the unseen back of a shield. Likewise, moving a layer behind the body can hide an incorrect overlap but cannot invent missing material.

For existing split items, offer “move selected pixels to front/back,” with a composite preview, rather than asking users to erase and redraw. More complex arm/cape or garment relationships may eventually need explicit occlusion masks. Treat that as a separate data/export feature, not something a generic Layers panel solves automatically.

### Outfit-specific occlusion must remain outfit-specific

Hair tucking removes hair above a covering item's lowest opaque pixel per column and extends that boundary to nearby columns; its own source calls out holes/circlets (`app/src/lib/compose/compose.ts:47–72`). Permanently erasing hair to make one hat fit damages other outfits.

Provide a clear way to inspect/disable heuristic tucking before editing source hair. A later pair-specific tuck mask can preserve both assets, but requires consistent preview and engine behavior. Do not silently bake outfit-specific fixes into shared equipment cells.

## Documentation findings

The documents contain valuable experiment records, but “current,” “proven” and “historical” are not consistently separated.

| Document | Evidence/problem | Recommended correction |
| --- | --- | --- |
| Architecture goals, lines 20–22 | Every pixel from PixelLab; no drawing; one accept/re-roll review | Propose AI-generated originals plus optional local repairs; distinguish low default effort from a ban on expert control. This is a proposed product decision, not a silently adopted requirement. |
| Architecture rig table, lines 48–55 | Fixed 64 cell/48 body; largest body component retained | Current source supports configurable geometry; recent body policy retains components. The same doc's later QA section contradicts the table. Replace the old contract and retain the original spike assumptions as history. |
| Architecture build-status tables, lines 314–355 | Still says raw skeleton routes must be added and M2 rebuilt | Date and label historical harness status separately from production implementation. |
| Architecture retry text, lines 133–136 versus 185 | Two rerolls versus reroll once | Derive exact retry and replacement budgets from current orchestration; distinguish retransmission of unknown requests from new, bounded quality generations. |
| Architecture QA table, lines 162 and 168 | Key-outside thresholds differ from code; centroid spread is described as a pass gate | Current `GATES` uses 0.05 posed / 0.02 other (`items.ts:487`, `run.ts:318`); anchor spread is informational (`items.ts:653–656`). Document actual enforced checks rather than the proposed gate. |
| README/PLAN/AGENTS | Fixed-size pipeline summary understates current creator/import capabilities | Keep invariant summaries small and link to a current supported-geometry/route matrix. Preserve explicit user constraints and allowed-model rules. |
| User guide, lines 130 and 87–99 | Sharing between bodies is called future immediately after an implemented shared-design workflow | State current compatible-copy and limited paid-fit support consistently. |
| User guide, line 196; editable ZIP spec | Aseprite is editable, but no supported return path preserving generation metadata | Explain downstream finishing versus PixelDoll project recovery versus replacement import. |
| User guide, line 149; README/AGENTS quality language | Clean/checks can be interpreted as correctness guarantees | Say exactly which checks ran, coverage and limitations; show manual review separately. Fix the acceptance bug before making a complete-check claim. |
| Test reports/plan | Pixel-identical engine rendering is prominent | Scope this to runtime agreement on tested fixtures. It proves preservation of PixelDoll output, not artistic correctness, correct anatomy or arbitrary combination coverage. |
| Design redesign documents | Immersive prototypes are richly specified while production integration is separate | Keep proposal/accepted design/implemented/released states explicit. Preserve direct pixel inspection, warnings, coverage and repair access in any new scene-based UI. |

The [rotation-origin withdrawal](../testing/rotation-origin-audit-2026-10-23.md) explicitly retracts the inference that matching silhouette bottoms establishes a common rotation origin. Keep that withdrawal linked to earlier alignment reports. Do not replace the discarded heuristic with another unvalidated head/ankle alignment rule.

Recommended documentation ownership: architecture = implemented invariants; PLAN = accepted decisions and next priorities; TODO = unresolved work; guide = shipped user behavior; research/spikes = dated evidence and hypotheses. Each material evidence claim should identify tested geometry, assets, route and date. Avoid maintaining multiple contradictory full pipeline descriptions.

## What comparable tools actually establish

Primary official sources accessed 2026-10-23. This is documentation research, not a hands-on benchmark or a claim about product popularity.

| Tool | Verified relevant capability | What it establishes for PixelDoll |
| --- | --- | --- |
| [Game Character Hub](https://www.gamecharacterhub.com/portfolio-edition-features/) | Character assembly plus layers, per-frame/pixel selections, pen/eraser, undo/history and animation preview | Pixel correction can coherently belong in a character creator. Its extensive toolbox is not an MVP requirement. |
| [Universal LPC Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator) | Standardized parts, animation preview, export and explicit asset/animation compatibility gaps | Curated assembly needs coverage and compatibility discipline too. The examined source does not establish arbitrary in-app painting. |
| [Aseprite](https://www.aseprite.org/docs/animation/), [drawing](https://www.aseprite.org/docs/drawing/), [onion skinning](https://www.aseprite.org/docs/onion-skinning/) | Frames/layers/cels, pixel correction and neighboring-frame reference | Strong external finishing and useful small interaction patterns. Native export alone does not supply a safe paperdoll reimport. |
| [LibreSprite](https://github.com/LibreSprite/LibreSprite) | Open-source pixel tools, layers/frames, palettes, onion skin and animation preview | An external workflow can have a free editor option; verify actual interchange rather than assuming modern Aseprite parity. |
| [Piskel](https://www.piskelapp.com/), [official editor](https://piskelapp.github.io/piskel-embed/editor/index.html) | Browser pixel editing, frames/layers, onion skin, preview and sheet export | Browser repair is plausible; a complete mobile editor remains a substantial interaction problem. |
| [PixelLab's interface comparison](https://www.pixellab.ai/docs/ways-to-use-pixellab) | Full Pixelorama browser editing plus AI; Aseprite integration | The broad AI pixel-editor category is already served by PixelLab. PixelDoll's distinctive value is synchronized equipment, repair context and safe export. |
| [Pixelorama](https://orama-interactive.itch.io/pixelorama) | Layers/frames, onion skin, palettes, metadata, backups and sprite interchange | A capable external option. Metadata survival in a particular export/fork needs testing. |
| [Spine image workflow](https://us.esotericsoftware.com/spine-images) | External image editing and automatic image reload around a specialized skeletal workflow | An animation product can intentionally leave drawing outside the app if its roundtrip works. Bone attachment editing differs from raster-frame repair. |

Do not copy extension/UI tool limits into the REST v2 contract. For example, PixelLab's [Edit Animation UI guide](https://www.pixellab.ai/docs/tools/edit-animation-pro) is not the authoritative source for this app's endpoint availability or prices. This review proposes no new model routes and does not relax the project's allowed-model policy.

## Options and decision

| Option | Strength | Main cost/failure | Decision |
| --- | --- | --- | --- |
| Keep accept/retry/discard only | Smallest UI | Users pay for whole-result uncertainty or accept known local defects | Insufficient for production-quality output. |
| External editor only | Mature art tools, low drawing-tool maintenance | Current roundtrip is incomplete; context/mapping overhead for a one-pixel fix | Necessary escape hatch, insufficient as the sole casual repair workflow. |
| Focused in-app repair plus mapped external replacements | Fixes small defects in context; preserves paperdoll identity | Requires proper cell history, QA state and conflict handling | Recommended, delivered incrementally. |
| Full embedded sprite editor | Powerful broad authoring | Large document/tool/mobile surface; duplicates existing editors | Outside present scope. |
| More AI correction only | Can address broad design/pose problems | Paid, stochastic, may damage correct frames | Complementary explicit action, not a replacement for deterministic local fixes. |

### First user-visible workflow

From an accepted item or generation-review warning, choose **Fix frame**. Pause playback and select item → move → direction → actual cell. Keep the body locked. Show the full composite immediately and allow isolation of the editable piece. Offer pixel grid, nearest-neighbor zoom/pan, previous/next-frame ghosts, original comparison, pencil, eraser, source-palette picker and one-pixel nudges. Where the item already has fg/bg pieces, add an explicit front/back pixel transfer after its semantics are validated.

Make the affected scope visible: one cell, a deliberately selected set, or a source cell with a derived mirror. Save as a reversible local revision; show “manually edited/reviewed.” Return to animation playback for acceptance. A no-op session creates no revision and makes no network request.

The ordinary dress-up screen stays simple. Editing appears on request; it does not become a mandatory step in every generation. On phones, provide adequate zoom, pan and drawing targets, plus an explicit distinction between navigation gestures and paint. Browser-emulated touch tests are appropriate; physical-phone testing remains outside scope by the user's existing decision.

### Deliberately outside the first release

General brushes/shapes/gradients, effects/blend modes, arbitrary new layers, free rotation/resampling, canvas/pivot resizing, animation timing authoring, mesh deformation, inverse kinematics, full skeleton authoring, automatic painting propagation, arbitrary Aseprite document parsing, and editing the frozen body. These are not prerequisites for local equipment repair.

### Required implementation boundaries

1. **Cell identity:** edit the actual `animation.frames[ui.frame % animation.frames.length].cell`, not playback index; the playback counter can grow beyond the playlist length. Respect the layer's real size/pivot, especially oversize held items; thumbnail crop coordinates are unsuitable.
2. **Immutable raster revisions:** clone, paint, hash, encode, then atomically publish cell references. Store before/after references and operation scope. Commit a stroke once, not every pointer event. Retain originals across reload/export. Extend `loadProject()` and ZIP import/export reference traversal for hashes reachable only from repair history: current loading visits current cells/rest/dressed/design images (`app/src/lib/store/project.ts:28–49`), and project export includes only loaded `p.images` (`app/src/lib/store/import.ts:43–45`). Persisting an original hash protects it from garbage collection but does not alone ensure it is loaded, verified or exported after reopening.
3. **Palette identity:** paint in source colors with recolored preview. Begin with existing source ramps. Arbitrary RGB needs a material role or an explicit fixed-color detail; do not rebuild every material/variant after one stroke.
4. **Mirrors:** editing a source can affect its derived mirror. Editing only a mirrored direction requires deliberate independent materialization. Because a present row suppresses source fallback, materialize the complete affected row/pieces before editing, preserving all other cells (`app/src/lib/compose/compose.ts:123–133`).
5. **Fixed geometry:** bake integer nudges into pixels while preserving the shared pivot. Preview/reject loss at cell edges. Do not silently crop or use pivot changes as frame-local movement.
6. **QA:** preserve original generation checks as history; invalidate pixel-dependent current checks. Recompute applicable offline checks on final cells. Key-retention scores cannot be reconstructed honestly from only a repaired transparent layer. Manual acceptance is separate from automatic pass.
7. **Provenance:** record local edit history without inventing PixelLab job IDs or costs. The existing `CellQa.repaired` denotes automatic held-item repair and should not be overloaded (`app/src/lib/store/manifest.ts:102–108`). Keep source generation provenance intact.
8. **Publication:** use expected prior hashes/revisions to prevent cross-tab or late-generation overwrites. Repaired output is final authoring data, not fresh input to destructive cleanup. A future design-reference repair is a separate action with explicit future-generation implications.

### External finishing is currently one-way

`readCharacterZip()` prefers `project.json` over engine sheets (`app/src/lib/store/import.ts:65–66`). Editing `layers/*.png` therefore does not replace the restored canonical cells. Editing `cells/*.png` fails content-hash verification (`:93–98`). Removing the editable project payload to force legacy sheet import loses generation references; `.aseprite` import is not implemented.

Do not weaken backup hash validation to make editing appear supported. Add a separate **Replace frames** route: export fixed-layout PNGs plus stable item/layer/move/direction/cell mapping, geometry, palette information and expected source hashes; import a diff preview and replace only selected cells after validation. Preserve the rig and unrelated items. Reject ambiguous layout changes and stale replacements. Start with a mapped PNG package before a native Aseprite parser.

## Delivery order and decision tests

1. **Restore trustworthy review:** structural acceptance guards, full move/direction coverage, selected-frame inspection and honest badges. Correct the current-contract documentation. This is worthwhile regardless of the editor decision.
2. **Prototype equipment repair:** immutable cell revisions, pencil/erase/source palette, undo/revert, contextual playback and fixed geometry. Validate persistence/export before broadening tools.
3. **Add demonstrated layer controls:** isolation, safe nudges, fg/bg pixel transfer, and explicit tucking override where supported. Do not bundle a general occlusion architecture without representative need.
4. **Add mapped replacement import:** allow mature external editors to handle extensive drawing. Keep project recovery distinct.
5. **Evaluate upstream control separately:** rig overlays first; then joint/pose/reference corrections only with measured examples and safe dependency invalidation. Base-art revision remains a separate project.

Use saved defects rather than new paid generations for the initial trial. Include a stray pixel, missing contour, small color error, one-pixel item shift, incorrect front/back overlap, helmet/cape deformation and shield drift. Also include failures the editor should not pretend to solve: wrong anatomy, wrong handedness across views, missing geometry and an entirely wrong design.

Compare current workflow, focused repair and external roundtrip. Measure successful task completion, repair time, number of cells touched, accidental damage, final animation quality, export agreement and whether the user understands edit scope. Include users who can dress a character but do not identify as pixel artists. Inspect all relevant directions/moves, not only the repaired still.

No numerical demand or time-savings threshold is established by this review. Define the acceptance targets before the trial. Continue only if ordinary local defects are quick and safe to fix. If most frames need substantial drawing, investigate generation/rig/extraction and narrow the advertised support envelope; adding tools would merely transfer the pipeline's cost to users.

Required regressions for implementation: incomplete-batch acceptance, shared-hash isolation, actual-cell versus playback index, source/mirror scope, oversize pivot coordinates, fg/bg transfer, source-palette recolor, undo/reload/ZIP recovery, blob garbage collection, concurrent generation conflicts, source QA versus current repair status, and repaired preview/export equality. Add engine runtime checks only for changed manifest/compositing semantics; raster-only replacements should already flow through existing exporters.

## Verification during this review

- `npm run check`: zero errors/warnings.
- Unit suite: **297 passed, 1 skipped, 33 files passed**. The initial attempt hit a sandbox temporary-file rename error; rerunning with temporary files under the ignored workspace cache succeeded.
- Production build and dist guard passed. Existing bundle-size advisory remains; this is not an editor-related regression.
- The shell resolved **Node 25.0.0 / npm 11.16.0**, rather than the repo's required 24.22.1 / 11.19.1. These results describe this environment, not verification under the pinned runtime. No dependency or toolchain changes were made.
- Browser suite: the interruption removed the process handle and no final result file was available. The run left six failure artifacts: five creator request-matrix cases timed out waiting for the next recorded request, and the demo-copy/garbage-collection case threw on a null manifest. These are distinct from earlier setup failures caused by occupied ports and the sandbox browser-cache path. Only those six cases were selected for follow-up against a fresh production build, a separate normal localhost preview and the existing managed Chromium cache. **All five request-matrix cases reproduced their request-count failures.** The sixth follow-up did not complete and the process was stopped after approximately five minutes; no final JSON result or full-suite pass is claimed. The review's localhost preview was stopped as well.
- The five matrix failures are consistent with a specific test/queue contract mismatch: the matrix reuses seed 343 and expects a fresh POST after Start over, including repeated identical descriptions or changes to directions that do not alter the initial V3 request (`app/test/e2e/creator-request-matrix.spec.ts:42–58`). `run()` requests `resumeSafe`, and `Queue.enqueue()` returns an existing identical terminal record instead of resending it (`app/src/studio/create.ts:61–65`, `:166`; `app/src/lib/pixellab/queue.ts:479–489`). This source trace explains why repeated identical failed requests can leave the recorded count unchanged; it is not evidence of dropped direction fields. Align the test's distinct-attempt inputs with the intended resume/retry contract without weakening protection against duplicate paid calls. The demo-copy failure needs a separate reproduction to distinguish module/test-state issues from a production defect.
- Two additional offline probe classes established destructive small-detail cleanup and the key-preservation counterexample. The malformed-batch probe ran real evaluation/acceptance/save around synthetic queue/storage inputs. These probes are evidence for this review, not committed regression tests or live API samples.
- Existing Studio offline checks can pass vacuously on production: `app/test/e2e/studio.spec.ts:155–160` treats absent dev hooks as success/default selection, and the Studio project targets production preview (`app/playwright.config.ts:25`). A green suite does not establish those particular queue/selection assertions. TODO already tracks this gap; dedicated newer concurrency tests provide other coverage but do not make these assertions meaningful.
- Both technical sub-agents reviewed this synthesis. Their final corrections—modulo mapping of playback positions and explicit loading/export of repair-history images—are incorporated. The pipeline reviewer found no additional factual corrections. Checks are point-in-time results; concurrent uncommitted work remained in the shared checkout.

## Decision to take forward

**A repair editor belongs inside PixelDoll when it helps finish an identified equipment cell without breaking its paperdoll contract. A general art application does not.** The present bottleneck is trustworthy review and reversible control over generated output. Deliver those controls while continuing to challenge upstream generation; do not use manual editing to declare an unreliable pipeline solved.
