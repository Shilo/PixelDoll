# Live external-mount experiment

Date: November 16, 2026. Status: Studio baseline implemented on the isolated experiment branch. See [trial results](live-results.md) for observed behavior, spending and open gates. Not a production API commitment.

Tracking: [Qualify external mounting in Studio and engine exports](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=307653465).

## Decision in plain language

Let users place any existing move on an external mount. Offer a riding move as an optional improvement, not a prerequisite. Keep the mount outside the wardrobe. Start with seat placement and ordinary front/back overlap; add separate rider parts only when real art proves necessary.

Different mount families must be allowed as assets, not restricted to a horse-specific schema. That does not promise that one pose fits every saddle, body size, creature, projection or clothing item. Flying/swimming movement belongs to the host; wings, necks and saddles still affect overlap. A support matrix will record tested combinations rather than declaring all mounts compatible.

## Branch and isolation

The original branch reference was `experiment/runtime-mounts`. Implementation now runs in an isolated T3 worktree on `experiment/runtime-mounts-live`, based on local commit `5a57f419`. Only this task's research was copied from the original checkout; unrelated design changes were left there. The user subsequently authorized a local commit after council review and testing. No push is authorized.

## Three responsibilities

| Component                            | Proposed responsibility                                                                                                                                                                          | Not its responsibility                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Paper-doll runtime                   | Existing outfit composition, move/direction/frame sampling; reuse it for every rider preview. Add reviewed contact lookup or rider passes only if a demonstrated gap requires them.              | Generating or owning mount art, locomotion, collision, mount inventory, guessing saddle shape. |
| PixelLab authoring through PixelDoll | Optionally generate a riding move, then fit existing equipment with the existing pipeline. Review the result before it becomes usable art.                                                       | Runtime pose synthesis, automatic part labels or guaranteed fitting of arbitrary mounts.       |
| PixelDoll Studio                     | Select external fixture, select any existing move, position the rider at the fixture's seat, preview motion/occlusion and offer Show hidden parts. Use the same shared rider runtime as exports. | A second paper-doll compositor or a mount pretending to be a garment.                          |

Host-level seat translation and mount back/front rendering may need no new core API. Studio can be the host. Dogfooding means reusing canonical rider composition, not forcing fixture rendering into the exported library. If a reusable contact resolver becomes necessary, keep it experimental until the export parity gate. Existing hip anchors are candidates, not reviewed saddle-contact truth. Preserve layer pivots; translate the rider wrapper.

## Smallest useful Studio experience

- A contextual Mount preview action in Preview, not a wardrobe slot and not a new mandatory workflow. Label/location are provisional until the existing Preview controls are inspected.
- Choose a fixture; keep the current move. Every existing animation remains selectable. Missing mount views or missing clip data are shown explicitly, not filled with an unrelated facing.
- Offer Add riding move nearby with paid consequences disclosed. It must not silently create art, switch moves, or classify an arbitrary user move as unsuitable merely from its name.
- One Show hidden parts toggle reveals covered rider pixels. Default is the normal opaque result. A ghost rendering changes only the diagnostic view, never the underlying masks or pass order. Keep a clear Solid/Ghost distinction; diagnostic captures are allowed but labeled. Exported art and thumbnails do not inherit diagnostic opacity.
- Built-in fixtures and useful defaults avoid manual setup for the first test. Detailed anchor/mask editing is not a required ordinary-user workflow. Human correction burden is measured before deciding whether such tools belong in the product.

The ghost is a fitting aid, not evidence of correct occlusion: making a mount transparent can make a broken result appear acceptable. Always review the solid result too. A hidden-pixel highlight reports covered pixels; without reviewed ownership, it cannot automatically declare them correct or incorrect.

## Input contract to test, not freeze

External fixture data provides compatible projection and covered directions, a seat track sampled on its own timeline, and back/front images where needed. Its frame count need not match the rider's. The wrapper follows the seat while the rider's chosen move is sampled independently; a static seated frame need not acquire a second animated gait. Only add synchronized phase control if a real animated rider clip requires it.

Ordinary mount alpha already hides a far-leg pass drawn underneath it. Mount-specific holes should not be cut permanently into rider images. Prepared per-cell ownership masks are potentially reusable across compatible mounts; however their correctness on generated clothes is unproven. Runtime skeleton inference remains a comparison candidate, not the default. A mount silhouette alone cannot distinguish its front wing from its rear wing, or the rider's near leg from its far leg.

## Staged experiment and stop gates

1. **Free baseline in the real Studio.** Start with two local fixtures: a narrow saddle and a broad shell/perch. Use the same character and existing moves, including one poor standing baseline and a promising donor pose. Test E and SE first. Unsupported views remain explicit. A baseline need not fail: if existing art looks good, retain it.
2. **Optional paid rider trial.** If donor poses fail, generate one small riding clip for one stored base, first E, then SE only after E passes. Use the allowed skeleton-v3 pipeline and its legal frame range. Review anatomy, direction, saddle contact and frame consistency before spending on equipment.
3. **Paid equipment trial.** Fit two existing items to passing rider clips: boots plus a robe or cape. Keep current chroma keys. No new mount generations are needed to test rider composition.
4. **Free overlap comparison.** On the same stored output, compare mount back/rider/front against reviewed rider-part masks on the same fixtures. Measure incorrectly hidden near pixels, visible far-leg remnants, contact gaps, temporal changes and manually corrected cells/pixels. Add no splitter if the simple composition passes.
5. **Expand only after a pass.** Add N/S and remaining facings, another body proportion, asymmetric weapon and another mount silhouette with different foreground geometry. Explicitly cover winged and water-mount examples before claiming them. Isometric needs matching isometric art, not merely eight direction labels.
6. **Runtime/export gate.** If the trial needs new runtime behavior, implement it canonically and follow javascript-runtime.md synchronization and native parity checks. A Studio-only debug view is fine; a Studio-only rider-rendering advantage is not.

Stop if the rider base fails before equipment, if equipment fails before expansion, if seat movement alone cannot make the selected pose fit both fixtures, or if a request fails/has an uncertain outcome. Preserve results. Narrow supported pose/seat families rather than hide the failure or rescale pixel art automatically.

### Paid-request boundary

The user authorized actual live generations for this experiment. No paid calls are made during this planning step. Before execution, record the exact request plan, current balance and available cost estimate. The initial batch is limited to one base and two existing items in E and SE, no new characters or mounts. Budget at most six generation submissions for those target clips, excluding free polling and balance reads; verify the real pipeline request count before launch. If that route needs more submissions, or requests fail or need a different fallback, stop and report the revised scope before spending more. No automatic resend, retry or paid fallback. Existing stored rigs/references must be inspected first; any additional paid prerequisite is outside that batch.

The submission bound is not a monetary estimate. If the service cannot provide a reliable cost estimate, disclose that uncertainty before the paid stage. Use only the localhost agent server and existing agent-token contract. Never expose credentials. Keep the task within the models allowed by AGENTS.md and verify endpoint payloads against the local OpenAPI snapshot before use.

## Council objections resolved

Both reviewers favored optional moves, separate fixtures, no unconditional runtime splitter and a staged live art test. One proposed excluding ghosts from all screenshots; rejected because labeled diagnostic captures are useful evidence, while exports must stay clean. One claimed mount generation is disallowed; rejected as too broad: the local create-character-v3 schema includes a horse template. We defer separate mount generation because it is unnecessary for this rider trial, not because external creature creation is categorically prohibited.

A reviewer suggested requiring the standing baseline to fail; rejected. Positive baseline results can eliminate unnecessary paid generation. Automatic retry suggestions are also rejected under the repository's no-resend rule.

Council reviews: [Optional poses and preview](t3-thread://v2/4bd92ed5-5417-4d87-8dfb-d5737c6cb02d/thread:delegated-task:command%3Amcp%3Ad5e4689e-13bc-4dd2-a74b-88fec60e4580%3Adelegate-task%3Ac14ce935-655a-4f66-a48c-b6b5150ac1b3), [Minimum runtime contract](t3-thread://v2/4bd92ed5-5417-4d87-8dfb-d5737c6cb02d/thread:delegated-task:command%3Amcp%3Ad5e4689e-13bc-4dd2-a74b-88fec60e4580%3Adelegate-task%3A00b43e53-bf6c-4e8a-91de-48105dff6d83).

Prior evidence and limitations: [architecture comparison](architecture-comparison.md), [prototype notes](prototype-notes.md), [runtime contract](../../architecture/javascript-runtime.md).
