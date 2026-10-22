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
- Validate original provider joint coordinates before rounding, reordering or clamping. Preflight all supplied managed directions before spending on any missing reference. Nullable unavailable containers retain the documented bounded fallback; supplied incomplete/nonfinite/out-of-range maps fail. A rendered clip can enter selection only with complete real measurements; incomplete candidates cannot beat a valid art-warning candidate or reach publication.
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
| Unit tests | 280 passed across 29 files |
| Production/browser suite | 31 passed; production build and agent-token dist guard pass |
| Phaser 3.90.0 and 4.2.1 | Each: 49,152 rendered pixel comparisons, zero differences; 1,080 follower checks over 120 animation steps, zero frame/pivot mismatches |
| Godot 4.7.1 imported scene | 49,214 headless runtime checks, zero failures; includes 49,152 composited pixel comparisons and advancing hidden animation clock |
| Aseprite 1.3.18.6 CLI | Both palette-first exports: zero differences over 24,576 flattened pixels and 589,824 per-layer pixels per export; tags, timing and pivot match |

The engine fixture deliberately includes body clipping, recoloured body/equipment, two outfits, two frames and mirrored directions. Godot uses actual runtime-selected textures with headless Image composition, not a GPU screenshot. The fixture is 64px; no new 96px live-engine claim is made. Full evidence and limitations are in the data report. An early new browser test raced project loading; its setup was corrected before the final 31-test pass. The accepted-warning UI fixture also required publishing fresh manifest/item references; its corrected regression passes.

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

New characters now default to independently generated directions, preserving the provider’s western originals and independently rendering the western actions. The advanced economy option explicitly discloses hand switching from mirroring. Missing policy in historical drafts retains legacy request identities and frozen projects retain their existing pixels. Offline tests cover exact direction-set validation, all western anatomical action trajectories, eight-direction held-item batching and four policy/count combinations through recoloured, tucked ZIP/engine exports. The live independent four-direction full creation stopped on two final `/estimate-skeleton` HTTP 500 Internal Server Error responses. Their paid outcomes remain unknown and were not resent; waiting sibling estimates were cancelled, and the already-submitted western render continued polling. The displayed ledger after the already-submitted western render settled recorded $0.509, excluding any unknown charges. This full run is not a pass. A developer-only offline recovery helper then built a 103,061-byte editable archive containing only four complete idle directions (four frames each). It requires full request identity, original provider rotation/rest PNGs, exact cleaned PNG input hashes and successful real measurements. All 16 measurement hashes and stored skeletons match; clip adherence is 0.27/0.46/0.31/0.54px with no clip failures. West differs from flipped east at rest (44 opaque pixel differences) and every idle cell (64/95/96/122). Selected source records total $0.1861; this is provenance cost, not the full failed-run bill. Imported it through the actual file chooser as “Audit independent idle” and visually inspected all 16 frames. The two unknown inputs are nonblank 64px east-walking cells with 520/525 opaque pixels; the HTTP500 cause remains unproven. The original unknown requests were not resent. Root dismissed the failed creation through keyless Studio before reconnecting. A primary 96px right-hand sword test is now running on stable source at concurrency one; slash and export acceptance remain pending.

A separate adversarial review found deterministic base-derived project IDs could overwrite a customized saved project when a completed drawing was reused. New creation attempts persist a unique publication ID and intent fingerprint before spending; publication is insert-only, matching published recovery returns the existing customized project, and conflicting intent fails before API use. Unit and browser regressions cover retries and persistence failures.

## Remaining limits

Existing shield east-walk warnings, cape smudges and helmet hurt-frame artwork remain explicit quality work; warnings are not acceptance. Independently generated anatomical body directions/actions are required to preserve attacking handedness: flipping an asymmetric body swaps the active arm. No superficial item-only toggle was introduced.

Unity live editor and Godot Aseprite Wizard remain unverified here. Physical-device and screen-reader certification are not claimed. Existing PWA, final-origin and theme decisions remain deferred. Passing this bounded audit does not certify all possible archives, provider artwork or engine customizations.
