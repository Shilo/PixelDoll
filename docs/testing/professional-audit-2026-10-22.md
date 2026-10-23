# Professional product audit — 2026-10-22

## Working agreement

All implementation and team testing use the shared managed worktree at `C:\Users\shilo\.codex\worktrees\professional-audit\PixelDoll`, branch `codex/professional-audit`, starting from committed HEAD. The original checkout contains unrelated uncommitted equipment-library work and was left untouched. Nothing was deployed.

The user authorized autonomous review, online research, subagent collaboration and necessary paid PixelLab tests. Credentials were used only through ignored agent-mode configuration, never printed, exported or committed. Worktree servers use localhost:5299 (agent) and 5297 (regular); browser regressions use 5499/5498 to avoid other checkouts' servers.

## Review method

Pipeline/API, data/export and Studio reviewers investigated independently, then challenged each other's fixes with concrete counterexamples and regressions. Root reviewed the integrated behavior and used the Codex browser. Agreement required evidence, rather than votes. Generation source was held stable during the final live import/setup/item run. The resulting cost-label, malformed-batch acceptance and long-name layout follow-ups were then checked offline before the final integrated run.

- [Pipeline research and audit](../research/professional-pipeline-audit-2026-10-22.md): current official API, rig/pose checks, paid queue and token behavior.
- [Data/export audit](professional-data-audit-2026-10-22.md): imports, atomic storage, recolours and engine output.
- [Studio audit](professional-studio-audit-2026-10-22.md): navigation, error recovery, keyboard controls and draft review.
- [Handedness implementation scope](../research/handedness-implementation-scope-2026-10-22.md): evidence against an insufficient item-only mirror toggle.

## Corrections

- Removed credential broadcasting/adoption between tabs. Forget remains credential-free; stale balance/auth responses cannot restore disconnected credentials or outdated balances.
- Guarded queue leadership, asynchronous submission and flow ownership across disconnects, cancellation, retries and development reloads. Historical unknown paid outcomes remain terminal and are never automatically resent. Shared requests retain independent consumers; cancelling one flow cannot cancel another's work. A fresh explicit attempt may recover only proven automatic unsent cancellations.
- Restricted generic paid retries to documented HTTP 429 rejection. Generic 423/503/529 and ambiguous 5xx remain unknown; the observed animation 500 exception requires an exact simple no-job refusal. Accepted job-ID evidence overrides every status, including 401/402, and is retained without resending. Free GETs keep transient retries.
- Added credential revisions at queue submit/poll/offline-probe boundaries. Late old-key errors cannot pause a replacement connection or release work after Forget/reconnect.
- Persist terminal Create/Move/Setup failures before releasing their invocation guard. Reload restores the failure UI without restarting dependent work; deliberate retries replace the marker. Failed marker storage preserves the original error and explains recovery.
- Extended the synchronous skeleton-estimation deadline to ten minutes after real requests exceeded the previous two-minute timeout. Other requests keep their shorter deadline. This is a bounded client policy, not a provider SLA.
- Validate original provider joint coordinates before rounding, reordering or clamping. Preflight all supplied managed directions before spending on any missing reference. Unavailable optional data retains the bounded fallback; top-level skeleton nullability is documented, while nested nullish handling preserves compatibility with unspecified fields; supplied incomplete/nonfinite/out-of-range maps fail. A rendered clip can enter selection only with complete real measurements; incomplete candidates cannot beat a valid art-warning candidate or reach publication.
- Reject incomplete/nonfinite/duplicate pose joints and malformed packed inpaint geometry rather than letting absent frames improve quality averages.
- Bake selected outfit palettes into engine layers. Editable project data stays intact; body recolour overlays, hide/clip rules, tuck variants and ordinary equipment all preserve intended pixels.
- Reject unsafe/duplicate IDs, invalid layer geometry/pivots, fractional frame references and excessive logical image allocations, including archives that reuse the same PNG repeatedly.
- Publish accepted items and region splits atomically with their blobs. Preserve concurrently added materials and prevent delayed saves or deletion from restoring dangling selections or replacing a newer frozen base.
- Guard project navigation, rename/delete completion, generation progress and draft persistence against stale async results. Queue-follower actions now explain the active-tab restriction in visible Activity UI. Generated draft review can select every move. Composite keyboard controls maintain a usable tab stop.
- Clarify generation estimates, optional retries/fallback costs and variable queue timing. Synchronous requests use an indeterminate waiting indicator instead of invented 0% progress; tab-close/offline copy acknowledges unknown requests and possible charges. Keep existing custom CSS and responsive layouts; add no dependency or backend.

### Root review: replacement animations

Replacing a body animation previously advanced every item's baseHash while retaining old fitted pixels. Publication now invalidates that clip on all nonbase items; only successful re-posing restores coverage. Unaffected clips, rest designs and retry history survive. Legacy QA remains explicitly incomplete.

Counter-review found stale joint/anchor measurements and concurrent move metadata could also survive or overwrite replacement. Target pose data is cleared. Both post-render loading and atomic publication check the expected base and a rig/managed-character fingerprint, allowing unrelated outfit edits while rejecting competing move changes. Regressions verify composed pixels, retained QA, idempotence, pose invalidation and version semantics.

## Final automated and runtime evidence

Pinned Node 24.22.1/npm 11.19.1 and the committed lockfile were used. Installation audit reported zero vulnerabilities.

| Check | Final result |
| --- | --- |
| Strict Svelte and TypeScript checks | Pass; zero Svelte errors or warnings, both TypeScript projects pass |
| Unit tests | 321 passed across 34 files |
| Production/browser suite | 34 passed; production build and agent-token dist guard pass |
| Phaser 3.90.0 and 4.2.1 | Each: 49,152 rendered pixel comparisons, zero differences; 1,080 follower checks over 120 animation steps, zero frame/pivot mismatches |
| Godot 4.7.1 imported scene | 49,214 headless runtime checks, zero failures; includes 49,152 composited pixel comparisons and advancing hidden animation clock |
| Aseprite 1.3.18.6 CLI | Both palette-first exports: zero differences over 24,576 flattened pixels and 589,824 per-layer pixels per export; tags, timing and pivot match |

The engine fixture deliberately includes body clipping, recoloured body/equipment, two outfits, two frames and mirrored directions. Godot uses actual runtime-selected textures with headless Image composition, not a GPU screenshot. The synthetic fixture is 64px; the actual 96px sword verification is recorded separately below. Full evidence and limitations are in the data report. An early new browser test raced project loading; its setup was corrected before the final 34-test pass. The accepted-warning UI fixture also required publishing fresh manifest/item references; its corrected regression passes.

## Codex browser inspection

Exercised onboarding/demo, equipping, hide rules, item ordering, saved outfits, palette controls, moves, import, rename, reload persistence, generation drafts, queue Activity and all five export preparation choices and actual downloads. Downloaded a generic editable archive and reimported it through the actual file chooser; the renamed local copy retained edits after reload. Inspected rig setup preflight without spending on the demo. Downloaded the verified helmet through the actual Godot (125,877 bytes), Unity (126,780), Phaser (128,222) and Aseprite (145,679) buttons as well as generic PNG+JSON. All ZIP CRC checks passed and the expected scene/importer/atlas/layer files were present. This does not constitute Unity editor execution.

Checked desktop, 768×1024 tablet, 390×844 portrait, 844×390 landscape and 320×568 short portrait. Wardrobe/inspector stacking, stage controls, missing-direction warnings and reachable generation form/footer were inspected. A long accepted item name exposed horizontal wardrobe overflow at 1280×720; rows now shrink around their fixed controls, and Codex DOM measurements confirm scroll width equals client width. A follower-tab action initially appeared inert because its toast was behind a modal; the visible Activity explanation and retained draft were then verified in the Codex browser and a two-tab regression.

### Actual downloaded helmet packages

The actual Studio downloads were also run through installed engines, independently of the synthetic palette fixture. Their eight layer PNG sheets byte-match the offline reference export. Phaser 3.90.0 and 4.2.1 each passed 819,200 pixel comparisons and 3,840 follower checks over 480 live animation steps with zero differences or sync/pivot mismatches. Godot 4.7.1 passed 820,584 checks, including 819,200 composited pixels, using the actual downloaded scene. The actual Aseprite CLI processed 28 timeline frames and seven tags: zero differences over 114,688 flattened pixels and 229,376 layer pixels. Engine sheet counts include transparent unsupported-direction rows; the Aseprite timeline includes actual available clip-directions. This is real generated 64px helmet coverage, not independent 96px weapon proof.

## Real PixelLab evidence

Earlier live creation attempts exposed lost-response resume and sibling-flow lifecycle bugs, which are now fixed. One development reload produced an unsafe automatic re-enqueue before the correction. A subsequent explicit new attempt generated body/motion assets, but slow synchronous skeleton requests exceeded the old two-minute deadline. Their outcomes remain recorded as unknown; none was automatically resent after the fix. Those earlier attempts did not produce a complete saved new character; they are superseded by the successful controlled run below.

Recovered the generated character through the free public ZIP import, preserving four rest directions and three sparse walking clips (28 unique frames). The latest-source rig setup completed successfully using sequential estimates with the extended deadline. Imported appearance was corrected to match the actual short brown hair, grey shirt/shorts and bare feet; this prompt did not test a bald base.

The helmet test started before rig setup completed and therefore used the UI-disclosed anchor edit-animation fallback, rather than the primary skeleton-pose item route. Both batches completed: the ledger records 10 gens for the first and $0.080 for the second. Rig setup records 3.05 gens. The helmet passed numerical QA; all four rest views and all 24 walking frames were inspected visually at enlarged scale, then accepted and equipped. No obvious head drift or stray body pixels were observed. The short brim is a provider interpretation of the skullcap prompt, rather than a precisely authored silhouette.

Exported the accepted rig/item through the actual PNG+JSON download (137,926-byte ZIP), then imported it through the file chooser into the regular keyless server as “Audit verified helmet.” Four directions, four clips and the separate helmet survived; current outfit and Clean status were retained. The editable archive is saved locally under ignored `docs/testing/img/professional-audit/verified-helmet.pixeldoll.zip`.

The paid run also exposed that the draft Details cost omitted dollar-billed calls. Cost reporting now reads the reactive ledger and includes both currencies. Estimates are labelled estimates rather than guaranteed generation minimums, with explicit dollar-billing/retry disclosure. Independent final review additionally found a malformed excluded batch could leave surviving QA marked Clean; review now marks the draft as needing attention, and acceptance refuses structurally malformed batches. Ordinary flagged-artwork acceptance remains explicit. Accepted appearance reasons are stored independently of replaceable move QA, stay visible after every move is replaced, and survive the editable ZIP roundtrip. Shared import/export validation rejects malformed warning metadata. Source-call details include dollars without misrepresenting selected provenance as total retry spend.

A later controlled full creation completed successfully on stable source using the corrected estimator deadline. “Audit bald character” uses a 48px bald human, four legacy directions (west mirrored), four-frame idle and eight-frame walk. It saved all 36 generated frames plus mirrored coverage, with complete measured joints and no clip hard failures. The recorded adherence is 0.27–0.59px; one retained global warning reports 2px south-walk foot drift from pivot y59. All four idle/walk views were inspected in the Codex browser and the editable ZIP downloaded (194,846 bytes). The session ledger records $0.528. No automatic retry of an unknown outcome was needed. Original source-view assets and results remain in the ledger for a controlled independent-direction comparison.

Account balance is shared and some lost requests may have run or charged. A global balance difference cannot establish exact audit cost. No top-up or automatic retry of unknown paid outcomes was performed.

## Independent directions and publication follow-up

New characters now default to independently generated directions, preserving the provider’s western originals and independently rendering the western actions. The advanced economy option explicitly discloses hand switching from mirroring. Missing policy in historical drafts retains legacy request identities and frozen projects retain their existing pixels. Offline tests cover exact direction-set validation, all western anatomical action trajectories, eight-direction held-item batching and four policy/count combinations through recoloured, tucked ZIP/engine exports. The live independent four-direction full creation stopped on two final `/estimate-skeleton` HTTP 500 Internal Server Error responses. Their paid outcomes remain unknown and were not resent; waiting sibling estimates were cancelled, and the already-submitted western render continued polling. The displayed ledger after the already-submitted western render settled recorded $0.509, excluding any unknown charges. This full run is not a pass. A developer-only offline recovery helper then built a 103,061-byte editable archive containing only four complete idle directions (four frames each). It requires full request identity, original provider rotation/rest PNGs, exact cleaned PNG input hashes and successful real measurements. All 16 measurement hashes and stored skeletons match; clip adherence is 0.27/0.46/0.31/0.54px with no clip failures. West differs from flipped east at rest (44 opaque pixel differences) and every idle cell (64/95/96/122). Selected source records total $0.1861; this is provenance cost, not the full failed-run bill. Imported it through the actual file chooser as “Audit independent idle” and visually inspected all 16 frames. The two unknown inputs are nonblank 64px east-walking cells with 520/525 opaque pixels; the HTTP500 cause remains unproven. The original unknown requests were not resent. Root dismissed the failed creation through keyless Studio before reconnecting. The primary 96px right-hand sword completed on stable source. One bounded western quality reroll resolved the body-key leakage; the session ledger records $0.195. All 16 idle composites were visually inspected before explicit acceptance. The west profile remains marked Needs a look because valid nearby wrists make silhouette-based grip classification ambiguous. The initial three-call limit was reduced to one after native spinner controls confirmed the setting; this was not a serial run throughout. Acceptance, reload and an actual 94,377-byte editable ZIP download passed. Reimported that ZIP through the real file chooser into regular keyless Studio as “Audit verified sword”; all four directions, the equipped layer and the west grip warning survived. An actual Metal→azure palette change recoloured the blade in all four views without changing the body or wood ramp; Undo restored the original palette. The independent four-direction slash with the sword selected completed at a deliberately confirmed three-call limit. The session ledger records $0.582, including known quality rerolls; no request became unknown. Six body renders and 48 genuine joint estimates completed, including a 5:08 estimate that the former two-minute deadline would have lost. The final 32 sword attack frames were all inspected in the Codex browser. This is a completed execution test, not a quality pass: west frames 1/2 retain a lowered sword ghost and an incomplete raised weapon; side frames also contain flat grey remnants. Taking the sword off removes both weapon shapes. Explicit FG/BG inspection rules out rest fallback and places the defect in the equipment artwork. A separate visible read-only inspector verified exact request identities and PNG hashes for both west source rolls: each original provider result already contains the lowered sword and upper ghost before extraction. Selected derived layers match the stored pixels exactly. Saved item QA remains failed; body east/west adherence is 2.77/2.10px and retains its failures. No manual pixel deletion or forced acceptance was performed.

A separate adversarial review found deterministic base-derived project IDs could overwrite a customized saved project when a completed drawing was reused. New creation attempts persist a unique publication ID and intent fingerprint before spending; publication is insert-only, matching published recovery returns the existing customized project, and conflicting intent fails before API use. Unit and browser regressions cover retries and persistence failures.

### Actual independent 96px sword package

The actual accepted idle sword ZIP preserves four explicit directions with no mirrors, 64px body pivot `(32,59)` and 96px equipment pivot `(48,75)`. Phaser 3.90.0 and 4.2.1 each passed 294,912 pixel comparisons with zero differences, plus 1,440 clock/pivot checks and 960 oversize checks over 120 animation steps. Godot passed 295,466 checks including 294,912 pixels, 360 live follower checks and 240 live 96px-layer checks, with zero failures. Aseprite processed 16 frames/four tags, with zero differences across 147,456 flattened pixels and 442,368 per-layer pixels. West sword artwork differs from flipped east in every cell. This verifies idle pixel preservation and synchronization; numerical profile ambiguity remains visible and no attack result is inferred.

The live review exposed two G8 diagnostic defects. Complete but ambiguous wrist tracks were described as absent, and detached artwork could vote for a hand before the existing contact-distance test. Per-clip missing-position, ambiguity and contact warnings now remain distinct and cannot be hidden by a confident sibling. Appropriate review state and explanations survive acceptance/reload; historical metrics without a confirmed hand use a generic uncertainty explanation rather than claiming missing positions. Existing thresholds and actual opposite-hand failures remain unchanged. The team also reproduced a nonfinite capacity bypass with mock paid requests; the queue now preserves the prior valid limit, while valid UI edits take effect immediately before blur. These follow-ups are committed as `4f954b6`.

### Final attack review and software corrections

The actual 275,321-byte attack archive was imported through the real file chooser into regular keyless Studio as “Audit slash needs review.” Both moves, all directions and failed QA survived reload. Export now warns about the flagged sword and the east/west body checks before enabling download, while preserving analysis/export access. The regular preview remains on the separately verified idle sword, with its honest west grip warning.

Raw comparison exposed a concrete selection defect: west roll one failed three checks, roll two failed four, but the old item runner kept the last roll. The runner now retains the complete candidate with the fewest failed checks, keeps the first on ties, preserves matching provenance, rejects malformed count/geometry candidates, and records additional attempt history independently of the winner. Unknown outcomes, cancellation and abort still stop publication. Both actual west rolls remain bad artwork; selecting the better one does not repair them or rewrite saved evidence. These fixes and the export warnings are committed in `cd1122a`.

The actual failed-quality attack package also passes export fidelity checks: Phaser 3.90.0 and 4.2.1 each compare 884,736 pixels with zero differences and complete 2,880 clock/pivot checks plus 1,920 oversize checks over 240 steps. Godot passes 886,035 checks including 884,736 pixels, 720 live follower checks and 480 live oversize checks. Aseprite preserves 48 timeline frames/eight tags, with zero differences over 442,368 flattened pixels and 1,327,104 layer pixels. These prove faithful preservation of flagged artwork, not quality acceptance.

Final source validation through `cd1122a`: 321 unit tests across 34 files, 34 browser tests, strict checks with zero errors/warnings, production build (412.16 KB main JavaScript) and credential guard clean. Both offline evidence tools are excluded from production. Exact-token staged scans pass. All paid requests settled before the agent server was stopped; the regular localhost preview remains available. No push, merge or deployment was performed.

## Scoped Slash repair follow-up

`c101df5` adds selected-direction body replacement, missing-direction equipment recovery, a 96px frozen-body masked item
repair, and explicit measurement-only recovery. New side Slash uses versioned visible front/up targets and a separated
passive arm. Historical intents retain their original request arrays. Scoped replacements preserve other directions and
moves and refuse failed body candidates. Item publication checks the current rig and original equipment atomically.

The original West body's thirteen removed pixels were grey motion fragments, not skin: the raw provider image already
lacked its intended raised hand. A new East/West render visibly fixes the connected-hand/occlusion problem. Both renders
completed for six gens, but their first two joint requests returned HTTP 500. They remain recorded as unknown, with no
automatic resend or body publication. The new explicit recovery reused those exact renders, sequentially completed all
fifteen unique unfinished estimator inputs for 1.5 gens, and retained the unknown originals. All sixteen cells now have
genuine complete measurements: East adherence 0.78 px and West 0.81 px, both within the unchanged 2 px gate. East passes all
body checks. West fails only palette fit 0.962 against 0.97, so neither replacement was published. This distinguishes a
successful pose correction and paid recovery from a complete accepted asset.

Recovery persists reviewed IDs, rig version and consent before submission. Atomic estimate claims prevent duplicate
forks and stale overwrites across tabs, including first checks with no earlier ledger record. The scheduler cannot send
a new ordinary request before its first ledger save commits. An atomic body-publication receipt lets an interrupted
equipment step resume without redrawing the body; legitimate garment colour tagging advances only a matching receipt.
Independent reviews challenged delayed writes, aborted claims, progressed records, stale tabs and reload boundaries.

Validation at `c101df5`: 383 unit tests across 42 files, 37 browser tests, strict checks with zero errors/warnings and a
429.49 KB production main bundle with clean credential guard. Exact-token staged and bundle scans passed. Read-only
raw/cleaned/requested/measured inspection tools remain development-only and cannot call PixelLab or alter projects.

`1f2ee6e` adds an explicit cached-frame colour repair. Raw West has 177/4,619 outlier pixels; broad RGB quantization would
incorrectly map some dark skin to grey. The fixed `near-rest-v1` policy changes only unique, hue-compatible nearest
standing colours within 16/255 per channel, and only existing outliers beyond the unchanged 12/255 tolerance. Raw and
changed shares are capped at 5%; broad, ambiguous or different-hue matches are refused. Independent before/after review
approved 39 changes across West frames 1–4, mostly near-black outline pixels. Alpha, coordinates, warm skin and the
remaining 138 unsafe outliers stay intact. Fit becomes 0.970123; the existing garment-region tagging leaves that exact
result unchanged. This narrow correction was approved visually, not merely because its result crosses the gate.

The live **Match body colours** action reused both completed renders and all unchanged measurements. Four genuinely new
corrected-PNG estimates completed for 0.4 gens, the body passed all gates and was published, and selected East/West sword
posing began. Raw/final input PNG hashes and correction counts survive in `ClipSource.processing`. A correction known
to remain below the palette gate is rejected before paid measurements. The UI separately discloses the selected sword's
six-gen posing baseline and possible dollar charges/retries. The selected East/West sword poses completed on their first calls for six gens.

Validation at `1f2ee6e`: 414 unit tests across 43 files, 38 browser tests, strict checks with zero errors/warnings, a
436.27 KB production main bundle, clean credential guard and exact-token scans. No new package dependency was added.

### Completed four-direction Slash artwork

The repaired East/West body passes every unchanged body gate: adherence is 0.78/0.81 px, with no foot drift or border
clipping. Their new sword poses contain one blade and meet the active fist. Independent enlarged review challenged the
initial assumption that retained North/South artwork was already good: North frame 4 and South frames 3/4 had misplaced
grips. The team confirmed those defects against isolated body/wrist evidence before spending again.

Explicit **Try new item frames** repaired North and South separately using the frozen body, a 96 px layer and four
protected design references. Each 384×288 inpaint completed for 15 gens, with no unknown outcome or automatic reroll.
The resulting 243,822-byte editable ZIP has SHA-256
`856a992e54d1e10c5d395bf39bb3625a4d5cc4e75241e6849380b1f2210d43f6`.
All body pixels/metadata, all idle cells and the already repaired East/West equipment remain identical; only the
selected North/South Slash equipment changed. All 32 final sword frames were reviewed independently at 8×, then stepped
through all four directions in the Codex browser. The original floating grips and duplicate weapon are corrected.
Automated body-change, size-variation and grip-uncertainty warnings remain visible; no thresholds or warnings were hidden.

The final actual package passes Phaser 3.90/4.2 (884,736 pixels each, zero differences; 2,880 clock/pivot checks and 1,920
oversize checks each), Godot (886,035 checks, zero failures) and Aseprite (48 frames/eight tags, zero flattened/per-layer
pixel differences). These certify tested pixel preservation and synchronization, alongside the separate visual review.

The live 15-gen charges exposed an inaccurate fixed 10-gen inpaint estimate. Shared pricing now uses the actual packed
canvas including protected references and unused packed cells. Official 256²/341²/512² tiers are 10/15/25 gens; using area
for non-square inputs is explicitly an inference supported by observed charges. Fresh-item retry estimates now price the
actual new plan rather than historical fallback calls, and disable safely when the project cannot be read.

### Exact recolour after repair

A final independent histogram/enlarged review caught new blade greys outside the original saved Metal ramp. Normal-size
blue previews concealed uncoloured steel edges/highlights. Rebuilding or extending the material ramp was rejected:
that could change custom variant lengths and the mean used for future swatches, altering old saved outfits.

**Match item colours · Free** now previews the number of pixels/frames in the selected saved move/view and makes no
PixelLab call. Fixed `neutral-owned-v1` matches only unclaimed neutral/cool pixels to exactly one eligible item-owned
neutral material. Nearest RGB must be unique and within 24/255 per channel; warm guards/skin, claimed colours, transparent
pixels and excluded dark outlines stay intact. A proposed 32 limit was challenged with a dark-edge counterexample and
reduced to 24, preserving the same actual successful mappings. Larger/ambiguous differences remain unchanged.

The operation replaces only selected stored image references, preserves old shared image objects and all palette IDs,
ramps, custom variants, original paid provenance and historical QA, and records per-frame before/after hashes/counts.
Atomic reviewed fingerprints bind the scope, rig, item and every material definition. Stale edits refuse publication;
current outfits survive. The writer preflights the same bounded metadata contract used by export/import. The UI remains
usable offline/disconnected and preserves the selected move/view and saved recolour after an in-place refresh.

The actual Codex-browser actions changed North 231/South 234/West 10 pixels in 8/8/1 frames; East already needed no change.
Enlarged before/after blue previews confirm complete steel recolouring with the same single blade and fist contact.
Reload, real editable download and actual file-chooser reimport as **Audit final Slash** pass, retaining four independent
directions, two moves, separate 96px equipment, Azure Metal/original Wood and all review warnings.

Final archive: `C:/Users/shilo/Downloads/audit-repaired-slash-generic.pixeldoll.zip`, 281,073 bytes, SHA-256
`32a031f1391bbe9b26d7e405c7350f446fb2588f05e9d72ceb3b1dcca385cf3b`.
Independent production-helper comparison proves exactly 475 RGB-only changes across 17 frames, zero alpha/geometry or
unexpected pixel changes, and three valid history entries. Body/idle/rig/QA/provenance remain exact. Original materials
and variant mappings remain exact; export caches only the explicitly selected Azure swatch. Phaser 3.90/4.2 each pass
884,736 pixel comparisons and 2,880 clock/pivot checks; Godot passes 886,035 checks; Aseprite preserves 48 frames/eight tags
with zero 442,368 composite or 2,211,840 per-layer differences, including the coloured item copy.

A development-only export attempt during partial hot-module reload failed; a clean reload restored export immediately.
The final production tests include the real free-action→reload→editable-download path. No paid request was made for the
colour correction. The authenticated agent server was stopped after every paid request settled; the keyless final preview
remains available. No push, merge or deployment was performed.

Final source validation: **467 unit tests across 46 files**, **42 full browser tests** and the three affected offline
colour-match/export/stale-review browser cases repeated successfully after the final history-writer safeguard. Strict
checks report zero errors/warnings; production build is 443.99 KB main JavaScript with a clean dist credential guard.
Exact-token staged/bundle scans passed. The final source adds no package dependency or backend.

## Remaining limits

Two shield east-walk drafts retain hard QA flags and remain unaccepted; stored cape smudges and helmet hurt-frame artwork also require correction or explicit review. Independent body directions/actions are implemented for new characters. The original failed Slash remains historical evidence; the new targeted repair passes body gates and manual artwork review, with soft item warnings retained. Existing and economy-mode mirrored rigs still flip asymmetric attacks. No item-only toggle was presented as an anatomical fix.

Unity live editor and Godot Aseprite Wizard remain unverified here. Physical-device and screen-reader certification are not claimed. Existing PWA, final-origin and theme decisions remain deferred. Passing this bounded audit does not certify all possible archives, provider artwork or engine customizations.


## Main-branch integration follow-up

The user requested integration into `main` and removal of the audit branch/worktree. Main had advanced independently with
shared equipment designs, reviewed fitting, default colourways and wardrobe changes. Conflicts were resolved by retaining
both feature sets. Shared copies use reviewed fit drafts instead of direct paid posing; audit direction selection,
measurement recovery, publication receipts, palette correction and atomic storage protections remain active.

The combined review found and fixed scoped integration issues: replacing body views now clears only their shared-item
coverage; extension fitting respects the selected directions and exact pending target cells, refusing a partial fit that
would require unreviewed broader standing-reference work. Import allocation checks count the original source sheets that
are actually decoded. Engine-only imports preserve rendered equipment while warning when unavailable reusable-design
snapshot lineage cannot be restored. Full editable design archives retain their reusable lineage.

Original ignored evidence was preserved and byte-verified before worktree cleanup: 5,107 files plus the local handoff,
under `C:/Programming_Files/Shilocity/PixelLab/PixelDoll/docs/testing/img/audit-worktree-39533f7/`. The `testing-img` subtree
retains original relative evidence paths. This avoids losing live-generation/engine evidence when removing dependencies,
build products and the audit checkout. The unrelated UI-redesign checkout, branch and uncommitted files are preserved.


Integrated validation passes: **521 unit tests across 53 files**, **48 browser tests**, strict checks with zero
errors/warnings, and a **535.36 KB / 180.56 KB gzip** production main bundle with a clean credential guard. Vite's
500 KB chunk advisory remains visible and is recorded in TODO. The merged Studio was also reloaded and visually checked
with the actual four-direction repaired Slash and its retained colour/review state; wardrobe counts and shared-design
controls coexist with the audit features.

Shared designs retain their free local colour matching but cannot enter the direct paid grid-repair route. Browser
regressions prove both conditions against an otherwise grid-eligible shared item. The remembered-key test now waits for
the loaded demo before opening its menu, preserving every credential assertion while avoiding an initial-navigation
popover race. Measured-clip fixtures exercise the merged atomic normalization storage contract; incomplete measurements
still publish nothing. No new paid call or automatic resend was made during integration.

The verified result is fast-forwarded into local main without changing the unrelated UI-redesign checkout. The audit
managed worktree is archived/removed only after its committed head is reachable from main; its local branch is then
removed. Push/deployment remain separate. Final integration traces and a standalone copy of this report are preserved
beside the original ignored evidence under `audit-worktree-39533f7/integration-results` and
`audit-worktree-39533f7/main-integration-report.md`.
