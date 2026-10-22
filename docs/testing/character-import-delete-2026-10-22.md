# Character import and deletion — 2026-10-22

Implemented in `7dc91f9`; follow-up regression coverage and documentation accompany this report.

## Design and research

The requested sub-agent brainstorming recommended retaining the character switcher, putting **Import character…** beside **New character…**, and putting **Delete character…** beside Rename. Import has its own sheet, with device and PixelLab tabs. Free import remains accessible from the welcome screen.

Reviewed the current [PixelLab character library documentation](https://api.pixellab.ai/v2/docs#tag/character-library) in Codex browser and the checked-in OpenAPI snapshot. A real unauthenticated character ZIP confirmed the current multi-state metadata format: `states[].character` plus explicit `states[].frames.rotations` and `states[].frames.animations` paths. Selecting `?states=<id>` still returns the states wrapper. The measured ZIP omitted per-frame skeletons, despite the documentation describing keypoint metadata. Imported art therefore uses the existing anchor item route; new moves require a compatible PixelDoll pose rig.

No PixelLab generations were requested and no credentials were read or printed. Account-library tests used synthetic keys with mocked GET responses.

## Verification

Used the pinned Node.js 24.22.1, npm 11.19.1, Vitest 4.1.12 and Playwright 1.64.1 with installed managed Chromium.

| Check | Result |
|---|---|
| Strict Svelte/application/config/test type checks | 0 errors, 0 warnings |
| Unit suite | 49 passed |
| Browser suite | 9 passed |
| Production build | Passed |
| Distribution guard | Clean |

Unit coverage includes stored/deflated ZIPs, CRC and path rejection, PNG expansion limits, multi-state and legacy PixelLab archives, state selection after an incompatible state, sparse animations, independent east/west artwork, opaque-crop rejection, long-clip item planning, editable PixelDoll round trips, older sheet rehydration, dressed keyframes, image hashes and free library reads.

New browser regressions cover local export/import, independent duplicate copies, reload persistence, deletion cancellation, current/last-character deletion, demo protection, PixelLab connection and pagination, public ZIP downloads without Authorization, and refusal to delete while a persisted generation is pending. Existing Studio, responsive, authentication and browser PNG/IndexedDB checks also passed. The final browser run used separate ports 5407/5307 and `test-results/character-import-validation` to avoid another contributor's concurrent runner and artifacts. The committed normal runner includes the new tests.

## Codex browser review

At `http://localhost:5198`, manually verified:

- Welcome and character-menu import entry points.
- A real PixelLab character imported as eight directions, with rest, walking and breathing idle clips.
- A source clip extending outside the 64 px cell was refused with its exact filename and clipped-pixel count.
- Equipment planning covers the imported character's 32 existing frames without sending a generation.
- Exported the imported character, selected that ZIP through the actual file chooser, and imported a separate local copy. Both copies remained selectable after reload.
- Delete confirmation names the character, offers export, and explains local-only removal. Canceled in the live manual session; actual deletion ran only against disposable automated fixtures.
- Device import fits the 375 × 812 phone viewport. The viewport was reset afterward.

Local-only screenshots: `docs/testing/img/character-import-menu.jpg` and `docs/testing/img/character-import-phone.jpg` (gitignored).

## Limits

Device imports accept PixelLab character ZIPs and PixelDoll export ZIPs up to 64 MB, not standalone PNGs. Imported PixelLab clothing/hair remains baked into the base. Visible pixels must fit the 64 px cell without rescaling. Older engine exports restore layers and outfits but cannot restore missing rest images or managed rig metadata. New PixelDoll ZIPs carry an editable `project.json` plus original cell images for future round trips. Cross-engine and physical-device coverage were not added for this feature.

Other contributors' source changes and commits were retained; feature commits staged explicit files or verified shared-file hunks only.

## Adversarial review and pipeline parity follow-up

The requested independent reviewer challenged the implementation, then reviewed the new setup path. Each accepted finding was traced or reproduced before changing code:

| Finding | Independent challenge and resolution |
|---|---|
| Old sheet-only ZIPs retain dressed-keyframe hashes whose images are absent | Confirmed against loadProject: remove unavailable dressed references and the misleading skeleton-pose route. Regression imports the old export and reexports it. |
| A containing folder with both project.json and manifest.json is rejected | Confirmed that the old exactly-one-marker check misidentified the root. Normalize the common archive prefix; round-trip regression added. These first two fixes are committed in `0df2124`. |
| Baked tuck variants duplicate themselves on a later export | Confirmed with a head slot clipping hair: restore editable originals, remap preset references and regenerate variants once on export. Unzip the reexport in regression coverage. |
| Deleting one character clears another character's review results | Confirmed that resetting the global result map exceeds the deleted character's scope. Remove only that character's draft results; a browser regression preserves another character's pending review. |
| Reloading setup could resubmit an unknown paid request | Confirmed: seeded deduplication alone excludes terminal/lost records. Setup now requests resume-safe queue lookup and propagates terminal errors with Jobs guidance. Reload tests cover lost, failed and cancelled outcomes with zero submissions. |
| A standing-reference selector can disagree with the actual saved reference | Confirmed, but replacing the reference would invalidate existing dressed equipment. Lock and explain saved reference views; preview the actual input. The reviewer verified both this fix and the paid-resume fix. |

We challenged the suggestion to rerender all imported clips through creation: that would change original pixels and invalidate existing equipment. Preserve those clips, estimate their real poses, attach the shared rig contract and use the shared render pipeline for future work. An imported clip cannot honestly be scored against a requested pose it never had; its adherence is `null`, while palette/feet/border checks still run. The reviewer agreed with this approach and found no confirmed defect in short-clip padding/held-frame rotation, long-clip batching, west-view action reflection, camera propagation, finite joint validation or atomic publication.

### PixelLab research in Codex browser

Read the official [skeleton estimation](https://api.pixellab.ai/v2/docs#tag/skeleton-animation/POST/estimate-skeleton), [raw skeleton-v3 animation](https://api.pixellab.ai/v2/docs#tag/skeleton-animation/POST/animate-with-skeleton-v3), and [create-character-v3 reference import](https://api.pixellab.ai/v2/docs#tag/character-creation/POST/create-character-v3) documentation. The appropriate path is:

1. Preflight the frozen 64 px humanoid artwork, required four/eight views and creation's six-pixel headroom before spending.
2. Estimate all 18 finite normalized joints on every unique original body/rest image; reuse cached measurements.
3. Register the normalized south reference plus every remaining supplied direction in the current account. Supplying all views uses the 0.25-gen connection path; it does not generate replacement art. Preserve the source appearance and camera angle, including independent western views.
4. Atomically attach rest views, clip keypoints and measured poses, anchors, provenance, QA and the managed character record. Existing layers/materials/outfits remain intact.
5. Use the existing item pipeline: chroma reference dressing, skeleton posing, extraction, quality gates and 96 px held canvases. Short clips pad to three poses and trim outputs; long clips split at fifteen while retaining exact original cell indices. A synthetic one-cell standing clip reuses its dressed reference.
6. Add idle, walk, authored actions or described moves through the shared body-render and equipment-repose path. Preserve actual appearance instead of applying creation's bald/underwear prompt defaults.

Manual Codex browser review also exercised setup on the real imported public sample. Its south view has only two pixels above the head, so setup correctly refuses before any request. The existing import remains usable. Screenshot: `docs/testing/img/character-rig-preflight.jpg` (local, ignored). This is an intentional creation-compatibility limit, not an estimator claim.

The successful browser regression uses disposable synthetic four-view artwork and mocks every API response. It verifies the explicit setup cost, deduplicated measurement, all supplied registration views, source appearance/camera, persisted joints/QA, 96 px weapon planning, added four-direction idle through raw skeleton-v3, lossless original rest cells and reload persistence. No live generation or token read was needed. Existing arbitrary clothes/hair remain inseparable base pixels; old equipment missing dressed references requires recreation before following new moves.

Final combined checkout validation: **57 unit tests passed**, **13 browser tests passed** (42.3 s), strict Svelte/application/config/test checks **0 errors / 0 warnings**, production build passed, distribution guard clean. The full browser suite includes the concurrent Inspector and connection/key-storage regressions; their files remain owned by their respective contributors. Tests used separate localhost ports 5407/5307 and a separate artifact directory. Final review evidence also includes the updated character menu screenshot at `docs/testing/img/character-import-menu.jpg`.

## Live PixelLab end-to-end test

The user subsequently authorized real API testing of import, setup, equipment, a new move and export. This run used Codex browser, the existing account library and the localhost-only agent app on port 5199. The app obtained its development credential through its existing server-side contract; no token or `.env` contents were printed, captured or committed. The normal app on port 5198 was used for the final local import and offline checks.

### Actual browser workflow

1. Browsed the real PixelLab account library and imported an existing eight-view Ragnarok-style humanoid with grey shirt and shorts. The source had rotations but no animations. Saved a new local copy named **PixelLab live import — Ragnarok**; no existing character was overwritten.
2. Ran the explicit **Set up character** action. All eight standing views were estimated and registered with all supplied views using `create-character-v3`; the displayed estimate was **1.05 gens**. The managed registration ID is `232a70b6-534e-4723-ae40-92017c6ea079`.
3. Generated **simple iron open-face helmet, no horns, no plume, face visible**. All eight standing views passed the checks on the first design call; visually reviewed them and pressed **Keep it**.
4. Added an eight-frame **Slash** move in all eight independent directions, with the helmet selected to follow it. The normal body-render/re-estimate checks and item-pose checks ran. The existing automatic retry and `inpaint-v3` fallback paths were needed for the helmet's east/west views. No extra generation task was started after this move. Activity eventually reported **Nothing generating**, with **98.95 gens** spent for the entire live run; the monetary-credit balance did not change.
5. Viewed the result in all directions and exported through the normal **Godot 4.x** ZIP UI. The downloaded archive is **370,529 bytes**, with **226 entries**. Offline parsing verified a usable complete rig, valid 18-joint measurements for every stored frame, eight dressed equipment references, body/equipment coverage of both rest and Slash in every direction, an equipped current outfit, editable project data and Godot export files. The prepared original standing cells still match their rig references.
6. Selected that actual ZIP through **From this device** in the normal port-5198 app. Saved **Ragnarok — local round-trip**, reloaded and confirmed the equipped helmet and both moves persisted. Played Slash with the helmet in all eight directions without connecting a key or sending generations.
7. Changed the helmet to azure, saved **Blue helmet test**, reloaded and confirmed the saved outfit remained current. Restored the steel current look and exported again. Comparing the two actual ZIPs verified **identical decoded RGBA pixels in all 146 referenced images**, unchanged rig, skeletons, equipment layers/references and QA, plus the new saved colour outfit.

The account importer fetched and parsed a real PixelLab ZIP. The separately attempted direct raw-ZIP download from a blank browser tab was blocked because the browser download check could not establish its origin; it was not bypassed. Therefore the manual file-chooser check used the actual completed PixelDoll ZIP, rather than a second raw PixelLab ZIP download. Raw-format file parsing remains covered by the real online import and the existing local-format regression fixtures.

### Bugs found and fixed

- **Ambiguous setup wording:** “shared pose pipeline” could be mistaken for sharing equipment between characters. Commit `58828eb` says equipment is fitted to this character, and the user guide explicitly distinguishes shared tools from cross-character equipment reuse.
- **Accepted equipment was not saved as worn:** Keep it opened the project with its new item equipped only in memory. A later reload removed it from the outfit. An offline browser regression reproduced the exact accepted-item opening branch and failed after reload before the fix. Commit `ff11e24` saves and flushes that explicit outfit edit; the same regression passes. This uses the existing serialized, atomic dress-saving path and preserves concurrently saved animation/item geometry.
- **Progress callbacks emitted Svelte warnings:** the same commit removes unused assignment return values from create/move/setup callbacks. It preserves their behavior and avoids `assignment_value_stale` warnings for new runs.
- **New-move QA linked some frames to the wrong source call:** the final evidence reviewer found 32 affected helmet cells. We independently reproduced this against both actual ZIPs and traced asynchronous record ordering plus the existing-history offset. The contributor owning `run.ts` corrected the merge in `87fbfd6` by matching each selected call's produced frame keys. Its regression checks the actual item sent to storage, reordered calls, split batches, selected grid fallbacks, later replacement, preserved prior QA and refusal to save a missing source. Both this task and the independent reviewer challenged the correction and found no confirmed defect. The fix prevents new incorrect merges; it does not rewrite the historical evidence ZIPs.

The independent adversarial reviewer separately reviewed these new changes and found no confirmed defect. We checked its conclusions against the save chain and atomic `saveDress` update. The automated regression exercises the accepted-item opening branch using saved fixture geometry; real generation and acceptance were exercised separately in the live browser workflow.

Validation for this checkpoint: **67 unit tests**, **14 browser tests** (53.7 s), strict checks **0 errors / 0 warnings**, production build and distribution guard passed. These checks include the concurrent contributor's shield checkpoint; only this task's explicit source/test/doc paths were committed. No branches or worktrees were created. The coordinator independently confirmed that the pushed checkpoint's GitHub checks and Pages deployment succeeded.

### Remaining limits — do not call this output clean

- Two generated body directions retain arm-adherence warnings after their bounded retry: **west 2.24 px**, **south-west 2.41 px**, versus the **2 px** target. All Slash directions have zero feet drift and border pixels; palette fit is 0.998–1.000. These are generated-image limitations, not missing import/rig data.
- The accepted helmet remains **Needs a look** after the side-view fallback attempts. Per-cell measurements and the overall warning status survive export/reimport. Its top-level QA summary still retains the original standing-frame aggregate metrics when a new clip is appended, so those summary numbers do **not** certify that every Slash frame passed. This pre-existing reporting limitation needs a separate correction; no thresholds were relaxed and no warning was changed to pass for this test.
- The final evidence review found **32 of 72 helmet cells with incorrect source-call indices** in both saved ZIPs. We independently traced this to merging clip-local direction indices into the item's differently ordered provenance list without remapping them. Complete item-level source records, including their produced cell keys, remain present. The original evidence archives retain this defect; their image and rig comparisons do not certify accurate per-cell provenance.
- This run exercised one equipment item and one newly generated move in eight directions. It did not run the exported Godot project in the engine, generate an oversize weapon, or establish that all possible characters/models will produce clean art. Sparse/short/long clips and the 96 px weapon plan retain their automated coverage.

Local ignored evidence: `spikes/api/out/import-live/real-import-godot.pixeldoll.zip`, `local-roundtrip-godot.pixeldoll.zip`, `verification.json`, `roundtrip-verification.json`, `slash-current.png`, and `docs/testing/img/real-import-local-roundtrip.png`. The normal browser remains on the locally imported result so it can be inspected without the agent app.

After the contributor's reviewed helmet/provenance follow-up, final combined validation passed: **77 unit tests**, **14 browser tests** (41.9 s), strict checks **0 errors / 0 warnings**, production build and distribution guard clean. The browser suite ran once against the frozen source and its final production build, using the isolated ports above. The paid-test agent server on port 5199 was stopped and verified to have no listener; the human app on port 5198 remains available. No further generations were sent.

### Future equipment sharing direction

The user selected **shared designs with fitted copies**. Recommendation: keep reusable design references/palette/slot information, reuse exact pixels for an identical frozen body/pose contract, and explicitly fit a new copy for a different body before posing it through that body's existing moves and quality checks. Preview the fitting cost and result. Skeleton anchors help locate heads, joints and weapon grips; they do not make one raster layer universally fit different proportions. Official [reference-guided editing](https://api.pixellab.ai/v2/docs#tag/edit/POST/edit-images-v2) and [outfit transfer](https://api.pixellab.ai/v2/docs#tag/animate/POST/transfer-outfit-v2) were reviewed in Codex browser as candidates for a future fitting experiment. They do not guarantee exact design identity. No cross-character sharing feature or extra paid experiment was added in this task.
