# Character creation review — 2026-10-22

Scope: review the current New character sheet, request construction, sizing, direction handling, animation pipeline and quality checks. Browser testing used the Codex in-app browser against a separate normal Vite server at `http://localhost:5417`, without a PixelLab key. No paid generations or authenticated requests were submitted. Application source was not changed.

## What creation actually does

| Control / behavior | Current implementation |
| --- | --- |
| Description | Up to 300 characters. Empty input falls back to `a human adventurer`. The app appends a bald, barefoot body wearing a light grey t-shirt and dark grey shorts, with arms slightly away from the torso. |
| Build | Slim appends `slim build`; Stocky appends `stocky build`; Average appends nothing. These are prompt hints, with no numerical body proportions, predefined meshes or measured shape checks. Average therefore does not override a description that already says stocky. Conflicting description/control choices are concatenated. |
| Skin | Any adds no instruction; the six swatches append descriptive words from `deep brown skin` through `pale skin`. The displayed colors are not an exact generation palette constraint. |
| Body size | Requests a **48×48 or 56×56 generation canvas**, rather than a guaranteed measured character height. Frames are padded without rescaling into a fixed 64×64 cell. Offsets are `(8,12)` and `(4,4)`, respectively. |
| Directions | Defaults to 4: south, east and north, with west flipped from east. The 8-direction choice generates/animates south, south-east, east, north-east and north, and flips the three west-facing directions. Asymmetric details therefore change sides in mirrored views. |
| Camera / skeleton | Fixed to `low top-down` and the bipedal `mannequin` template. There is no camera, quadruped template or model selector. |
| Starting moves | Idle has 4 cells; walk has 8. Idle poses are authored from the rest skeleton; walk motion comes from managed skeleton-v3. Both are rendered onto the rest artwork with raw skeleton-v3 and remeasured. |
| Name / seed | Name is a local project label, falling back to a heuristic from the description. Seed starts as a random positive integer and is passed to generation calls. |
| Cost display | 4 directions: about 12 minutes, 35–50 gens. 8 directions: about 18 minutes, 57–75 gens. Changing 48 to 56 does not change this estimate. These are estimates, not enforced spending limits. |

The first text-only `create-character-v3` call makes eight rotations even for a four-direction project. PixelDoll selects the needed source views, pads them, makes its mirrors and reimports all selected rest views for a managed character and skeleton. It then builds both moves, cleans frames, checks poses/colors/borders and saves the character. There is no appearance approval step between drawing the body and animating it.

## PixelLab capabilities versus PixelDoll choices

Checked the public [current OpenAPI](https://api.pixellab.ai/v2/openapi.json) as well as the repository snapshot and research. The current schema documents:

- From-scratch v3 generation at 32–256 px; reference images up to 256×256. Non-square from-scratch results are padded to a square before rotation.
- Four or eight directions, with `n_directions` applying to reference mode. Text-only generation starts with eight rotations.
- Low top-down, high top-down and side camera angles.
- A mannequin template for bipeds and bear/cat/dog/horse/lion templates for quadrupeds. This template selects skeleton reconstruction; it is distinct from Slim/Average/Stocky.
- Outline/detail guidance and a longer description limit. PixelDoll does not expose these creation style controls.

The 48/56 choices and fixed 64 cell are PixelDoll pipeline decisions. Supporting larger cells requires reviewing rig normalization, item generation, quality thresholds, animation/edit frame limits and export alignment together. Adding choices to the sheet alone would not provide supported larger characters. Animal templates likewise require a compatible pose and equipment system.

## Browser checks

| Check | Result |
| --- | --- |
| Welcome → Create and Studio menu → New character | Both open the same sheet. Defaults are Average, Any skin, 4 directions and 48 px. More options starts collapsed. |
| All four size/direction combinations | Passed. Selection, generation-size explanation and direction summary agree; cost changes to 57–75 for eight directions. |
| All three build choices | Selection works. No definitions, visual examples or prompt preview are provided. |
| Any and all six skin swatches | Selection works. At 320 px the swatches wrap rather than overflowing. |
| Keyboard arrow in Build group | Passed: ArrowRight on Slim selected and focused Average. |
| Keyless Create | Opens Connect; Connect remains disabled while its key field is empty. No generation is submitted. |
| Cancel Connect, reopen New character | Description, skin, build, name, seed, size and direction selections from the attempted create are restored. |
| Negative seed | `-1` has no HTML minimum, reports valid, leaves Create enabled and reaches Connect without an error. The API schema requires an integer ≥0. |
| Fractional seed | `1.5` reports browser `stepMismatch`, but Create remains enabled. The sheet has no form submission or explicit seed validation that would enforce that validity. No API request was made. |
| Empty seed | Can be left empty with Create enabled. The numeric binding can become undefined; later seed arithmetic needs an explicit default/validation. This downstream risk was found in code, not exercised through a paid call. |
| Description limit | DOM confirms `maxlength="300"`. |
| Desktop 1280×720 | Sheet scrolls with its footer accessible. |
| Phone 375×812 | No horizontal overflow; full-width Create remains visible. |
| Small phone 320×568 | No horizontal overflow; Create remains visible; body scrolls. |
| Landscape 812×375 | Sheet becomes a 480 px side panel; Create remains visible with no horizontal overflow. |

Viewport testing does not simulate a real mobile software keyboard. Concurrent workspace edits triggered Vite HMR and full-page reloads during the session, explaining intermediate sheet closures; the server log confirmed those updates. A controlled portrait-to-landscape transition retained the sheet. No reproducible resize defect is claimed.

![Creation controls, eight directions and 56 px](img/create-character-review-2026-10-22.jpg)

## Findings to address

1. **Approve appearance before animation.** Currently the first opportunity to inspect the new body comes after the full idle/walk pipeline. A draw → review → animate flow would let users reject an unwanted shape or face before paying for animation. A preview would also make the meaning of size and build visible.
2. **Validate seeds before any work.** Accept a non-negative safe integer or generate a seed for an empty field. Keep the API boundary defensive as well as giving an inline explanation.
3. **Make reroll costs honest and controllable.** The shown upper bound is the base estimate plus roughly 30%, rounded to five. `renderClip` can reroll each failed clip-direction once. Using the estimator's own rates, rerolling every clip increases 35.25 to about 56.85 gens, or 57.25 to about 93.25, before additional fallback rest-joint estimates. Actual usage can differ and caching can reduce it. The displayed high value is not a cap. “Try again” on a failed creation picks a new seed for the whole character, so it can redraw and rebuild rather than only retrying the failed part.
4. **Explain 56 px headroom before drawing.** Every rest direction needs at least six transparent rows above the head. A full-height 56 px source starts at row four and fails after the paid drawing call; it must already have at least two transparent rows at its top. An offline synthetic-image check reproduced this geometry. This is conditional on generated content, not a claim that every 56 px character fails.
5. **Distinguish Build from a rig/body template.** Slim and Stocky are unquantified text hints; Average means no extra hint. There is no shape-specific quality gate. Rename Average to “From description” or define explicit instructions, explain slim as narrower and stocky as broader, and consider small silhouette examples. Avoid silently combining opposing descriptions and controls.
6. **Explain generation canvas versus output cell.** “Body size” suggests an exact body height, while the code requests a canvas and the output always uses 64×64 cells. A small grid showing body, hat headroom and floor margin would explain this better than padding coordinates.
7. **Make mirroring prominent.** Four/eight direction counts describe playable views, not independent drawings for every view. Offer independent opposite views only after the full rig/item path can preserve asymmetry and grip side.
8. **Surface remaining QA failures accurately.** After a reroll, creation keeps whichever clip has fewer failures. Remaining failures become warnings and the completion heading still says the character is ready. Missing pose measurements can also leave adherence null. This is quality triage, not a guarantee that every saved character passed every gate.

## Automated and offline verification

- `npm run check`: passed, zero Svelte errors or warnings and successful TypeScript checks.
- `npm test`: 9 suites and 88 tests passed. The first attempt could not rename Vitest cache files in the sandbox temp directory; rerunning with a workspace-local process temp directory passed. The temporary directory was removed afterward.
- Offline assertions verified 48/56 padding, the six-row headroom boundary, conflicting build words surviving prompt construction and the retry estimate arithmetic.
- Environment caveat: the available shell ran Node 25.0.0 / npm 11.16.0, rather than the required Node 24.22.1 / npm 11.19.1. These results do not certify the exact pinned runtime.
- Paid generation quality, live silhouette adherence, final generated sprites and a new completed character were **not** tested in this review. The earlier B15 report contains historical live eight-direction generation evidence; that evidence is not a fresh run.

## Suggested discussion order

1. First improve comprehension and control: body preview/approval, defined build choices, size visualization, seed validation and explicit retry spending.
2. Decide supported camera and resolution presets for actual target games, then extend the complete pipeline for those presets.
3. Decide whether independent asymmetric views or non-humanoid rigs are product priorities; both require more than additional form fields.

Implementation references: `app/src/studio/CreateSheet.svelte`, `app/src/studio/create.ts`, `app/src/studio/model.ts`, `app/src/studio/state.svelte.ts`, `app/src/lib/pixellab/routes.ts`, `app/src/lib/rig/normalize.ts`, `app/src/lib/rig/clips.ts` and `app/src/lib/rig/freeze.ts`.
