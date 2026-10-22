# Character import compatibility and Cancel follow-up

Date: 2026-10-22. Scope: verify actual PixelLab export archives, clarify the supported format boundary, fix import cancellation, and plan shared equipment without paid fitting experiments.

## Supported formats and challenged assumptions

The account browser lists the authenticated account's characters exposed by [`GET /characters`](https://api.pixellab.ai/v2/docs#tag/character-library/GET/characters), 20 per page. The live official documentation confirms offset/limit pagination and a total count. It is not a public catalog of all PixelLab users. Account entries not exposed by that API cannot be promised; a known character link or a compatible exported ZIP is a separate import route.

| Input | Supported behavior |
|---|---|
| Current PixelLab character ZIP | Root `metadata.json` maps state/rotation/animation paths. Referenced folders and filenames can vary. A multi-state export offers a state chooser. |
| Older PixelLab frame ZIP | Root metadata plus conventional `rotations/<direction>.png` and optional `animations/<move>/<direction>/frame_<number>.png`. |
| Current PixelDoll ZIP | Editable `project.json`, original `cells/` images and rig/item metadata, including accompanying engine files. The JSON contract is documented and open. |
| Older PixelDoll engine ZIP | PixelDoll `manifest.json` and referenced sheets; its existing limitations on missing rest/dressed references remain explicit. |
| Enclosing folders | Supported around these layouts, including nested packaging and unrelated outer README files. Metadata paths remain relative to their character root. |
| Several candidate enclosing character folders | Refused with a specific explanation, rather than choosing an arbitrary one. A declared root metadata/manifest takes precedence. This differs from PixelLab's supported states inside one metadata file. |
| Arbitrary PNG folders, custom JSON or standalone spritesheets | Unsupported. A reliable future importer needs an explicit direction/frame/pivot layout mapper; heuristic guessing could silently break animation order, alignment and grips. |

“Flexible ZIP” should mean flexibility with a known layout contract, not guessing semantics from unrelated art. The new offline regression proves that a current PixelLab metadata map can refer to arbitrarily named safe PNG paths, including nested folders, spaces and Unicode, inside an enclosing package. Existing ZIP path/CRC/size and image bounds are preserved.

## Real PixelLab exports and Codex browser

The previous run imported a real raw PixelLab ZIP through the online importer and manually reimported a completed PixelDoll ZIP. It did not complete a manual creator-website Export-button test. This follow-up explicitly closes the raw-file chooser gap.

The creator URL redirected to PixelLab's signed-out landing page. A Codex-browser direct download attempt failed with an unavailable paused response. As an authorized download fallback, PowerShell fetched the documented public PixelLab export URL without credentials or Authorization headers; the saved bytes were not repacked or edited. Codex browser then selected that exact file through the actual local file chooser.

| Export | Result |
|---|---|
| Selected state, `GET /characters/f6a0bdc5-354e-4682-8df3-55fc3d118737/zip?states=f6a0bdc5-354e-4682-8df3-55fc3d118737` | HTTP 200, `application/zip`, **71,596 bytes**, **33 entries**. SHA-256 `e802a81417d15772c338484c98d17bc2ca5745f3ee959585238b21d768ffe4d2`. |
| Default group export, same URL without `states` | HTTP 200, `application/zip`, **127,287 bytes**, **57 entries**. SHA-256 `dfb32b70e574cb3193bb91bbea80e85e47d7dd5dc322094ae5f9a2b664f83347`. |

The actual archives use `metadata.json` with `group_id`, `states`, `export_version` and `export_date`, plus state folders such as `Idle/rotations/` and `Idle/animations/walking/east/frame_000.png`. The default export contains **Idle** and **wearing a simple gre** states. It is not a synthetic fixture or a PixelDoll ZIP renamed as a PixelLab export.

The selected-state ZIP was previewed and saved in the normal localhost-5198 app as **PixelLab original ZIP — verified** with setup unchecked. It contains eight independent standing directions, an eight-frame walking clip and a four-frame breathing-idle clip. Walking/breathing are sparse south/east clips; no other motion directions were invented. Offline parsing verified 32 referenced images. Parsing each state of the default export separately verified eight views plus rest/walking/breathing for Idle, and eight views plus rest/walking for the second state, with 24 images in the latter.

Codex browser also opened the unchanged default ZIP, showed both states, and switched to **wearing a simple gre**: its preview reported eight directions and two moves. Cancel then returned to **PixelLab original ZIP — verified** without saving that second state. The successful second-state check ran after concurrent development edits settled; an earlier attempt was interrupted by a development reload and was not counted as a pass. Screenshot: `docs/testing/img/real-pixellab-zip-states.png` (local, ignored).

No generations, skeleton estimations or fitting requests were sent in this follow-up. A signed-in creator-website click remains a different coverage claim and is not implied by the public export-endpoint test.

## Cancel reproduction and correction

Codex browser reproduced an idle import dialog remaining visible after Cancel in the active localhost session. A fresh isolated Chromium idle-dialog regression passed before the correction, so it does not independently reproduce that session-specific symptom.

The controlled pending-download regression did reproduce a concrete defect: the old close handler refused all cancellation while `busy`, including a free ZIP download. It failed with the dialog still open before the fix. Commit `46cecd6`:

- Allows Cancel, Escape and backdrop dismissal while reading/preparing; aborts library/ZIP network reads and guards late results after unmount.
- Retains bounded read timeouts when composing the cancellation signal.
- Visibly disables Cancel only during local-copy saving, with a distinct saving message; setup choice is disabled during save too.
- Prevents a completed save from reopening setup after its sheet has been destroyed.
- Prevents pagination reentry while a page is loading.
- Clarifies account pagination and supported ZIP layouts in the importer; gives ambiguous character roots a specific error.

The delayed-download test now releases a valid PixelLab-format ZIP rather than an error response. It checks closure, reopening a clean import and retaining the current character. The isolated tests cover idle Cancel/Escape/focus return and realistic 20-entry first-page/one-entry last-page navigation, including Previous/Next bounds. External-abort unit coverage verifies both composed signals abort; timeout wiring is also reviewed in code, rather than claiming the test waits two minutes.

An independent reviewer challenged the implementation and found no confirmed regression. Its valid coverage observation—the first delayed response was a 404—was accepted and corrected to the valid late ZIP above. Other contributors' source and commits were preserved; only the six owned source/test files were staged for the fix.

## Shared-equipment research and agreed plan

The [implementation plan](../research/shared-equipment-fitted-copies-plan.md) was produced with the requested research subagent and challenged in both directions. A separate adversarial reviewer found no substantive contradiction. Root Codex browser checked the live official transfer/edit/inpaint/skeleton and Pro Flash documentation; no paid fitting route was tested or advertised as proven.

Key resolved disagreements: exact old-frame reuse versus future dressed-reference reuse; pixel/geometry proof instead of `baseHash` or matching skeletons alone; target-local immutable fitted copies; no automatic paid fallback cascade; source-independent snapshots and atomic storage; an explicit item-scoped palette ownership/version prerequisite; route qualification by item class; two-stage cost/review before target publication. The plan defines M0–M6 milestones, failure/resume behavior, export portability and acceptance criteria. It is a plan, not an implemented shared-equipment feature.

Local ignored evidence: `spikes/api/out/import-compat/pixellab-original.zip`, `pixellab-all-states.zip`, their verification JSON, and the offline verification script. Archive downloads used only free GETs; no token or environment-file contents were printed, captured or committed.

## Verification checkpoint

Used pinned Node.js 24.22.1, npm 11.19.1, Vitest 4.1.12 and Playwright 1.64.1 with managed Chromium.

| Check | Result |
|---|---|
| Focused import unit tests | **16 passed**, including metadata paths, ambiguous roots, invalid layouts and abort signals |
| Combined unit suite, run by the QA contributor | **89 passed** |
| Final strict Svelte/application/config/test checks | **0 errors, 0 warnings** |
| Combined browser suite | **17 passed** in **48.2 s**, including import/setup/moves, deletion, Cancel, persistence, pagination, responsive controls, connection drafts and persisted QA/export |
| Production build and distribution guard | Passed; clean |
| Shared plan review | Research subagent and root agreed after substantive challenges; separate adversarial review found no contradiction |

The first combined browser run had 16 passes and one trace-file teardown error (`ENOENT`), without an application assertion failure. The rerun used a unique artifact directory and passed all 17. Test servers used isolated ports 5407/5307. Hash comparison verified unchanged import, QA, Svelte component and test sources across these runs. A concurrent `studio.css` edit landed after the build; its owner retained responsibility for rebuilding and checking that later style checkpoint. This report does not mislabel the earlier built CSS as that later revision.

The account-list behavior was verified against the live official contract and a realistic paginated browser fixture. This follow-up did not enumerate every page of the live account: port 5199 was already occupied by another testing process, which was preserved. The earlier real-account import run demonstrated its live library; no whole-account census is claimed here.
