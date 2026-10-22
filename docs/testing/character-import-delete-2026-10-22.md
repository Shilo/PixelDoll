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
