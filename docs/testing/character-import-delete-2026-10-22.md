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
