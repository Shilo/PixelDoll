# Handedness implementation scope — 2026-10-22

Read-only source investigation; no generation or source edits in this follow-up. Requested by the parent to challenge the initial conclusion that per-item generation was blocked by missing body materialization.

## Revised finding

**Body materialization is already present.** `buildRig` hashes and stores flipped body frames; creation persists those cells. `cellImg` uses an explicitly stored item direction before falling back to the rig's `mirrorOf`. Independent west equipment rows can therefore be rendered/exported on a rig whose body west row is mirrored. That part of the first assessment was overstated.

The issue is **anatomy and action semantics**, rather than a missing pixel canvas. `flipSkeleton` deliberately keeps joint labels while reflecting x. Its source comment explicitly says a mirrored `hand_r` is the flipped source `hand_r`, while handedness flips with pixels. The physical right arm in the reflected character corresponds to the original physical left arm. Reusing those labels unchanged would let QA report the reflected original-right wrist as right, even though the character now attacks with the other anatomical arm.

Offline evidence uses the saved east rest joints in `app/test/fixtures/helmet-occlusion.json`, current `ACTIONS.slash`, and `authoredPoses`; no AI images were created:

| Case | Right wrist travel | Left wrist travel |
| --- | ---: | ---: |
| Source east slash | 78.48 px | 4.56 px |
| Current flipped west body, interpreted with anatomical label swap | 4.56 px | 78.48 px |
| West right-handed authored sequence on anatomically correct west rest | 68.00 px | 3.88 px |

Travel is the sum of Euclidean wrist displacement between consecutive frames. This is an interpretation of reflected anatomy supported by the deliberate label-preserving implementation; it is not a new measured PixelLab west estimate.

Putting a sword in the physical right hand of the existing mirrored slash would attach it to the mostly passive arm. Putting it on the swinging arm preserves attack motion but switches the anatomical hand. A per-item toggle cannot promise both while leaving that body clip frozen. Idle, walk and symmetric moves can still benefit from an item-only hand choice, provided the action limitation is explicit.

## Smallest robust implementation

Create characters with independently generated views when consistent anatomy is requested. The initial allowed `create-character-v3` call already returns the original rotations needed. An independently generated four-view character has four raw-rendered directions instead of three plus a flip. The existing imported-character setup, item coverage, held-item dressing chunks, `authoredPoses` western support, pose-item-new-move flow and engine sheets already support independent directions.

1. Add a persisted direction policy to `CreateSpec`, for example `directionPolicy?: 'mirrored' | 'independent'`. Missing means mirrored, so recovery of old saved creation specs cannot silently change paid request shapes. New UI explicitly writes the chosen policy.
2. Expand `genDirsOf` and `estimate` by policy: independent four = S/E/N/W; independent eight = all eight. Estimate by actual direction count.
3. In creation, take each independent direction from the original v3 rotations. Mirror only directions that are absent from the generated set; never overwrite the original west/diagonal views.
4. Import the actual rest views and use the API's corresponding rest joints. Render each clip for every independent direction, including west. `authoredPoses` already applies western action math without swapping the requested character's anatomical labels.
5. Freeze with `buildRig(..., { mode: 'all' })` for independent views. Preserve the rig's existing direction count/order, pivots, cell hashes and provenance contract.
6. Mark body/items generated across all directions with appropriate `mirror: 'generate'` metadata. Existing saved mirrored rigs remain readable and unchanged.
7. Explain the cost/quality difference before spending: independent four adds one direction; independent eight adds three. Exact amounts remain estimates because rerolls and API failures vary.

This avoids retroactively repainting an established base and invalidating its equipment. An existing mirrored character can later gain a separately reviewed conversion flow, with explicit item invalidation and generation estimates.

## If item-only generation is retained

Use a transient direction resolver rather than rewriting the global skeleton meaning for legacy projects:

- Resolve the frozen mirrored body/rest image from stored cells or `flipH`.
- For anatomical semantics, reflect normalized x and swap every LEFT/RIGHT limb, eye and ear label; swap hand/foot anchor sources too. Do not change existing `flipSkeleton`, whose legacy behavior is relied upon throughout old rigs.
- Resolve clip keypoints for QA, cleanup, grip, frame-zero repair and G9 from the same policy-specific data. Mixing relabeled poses with old hand tracks would silently reopen the defect.
- Dress all requested rest directions, generate explicit item rows, persist dressed west references and `mirror: 'generate'`, and include those rows when adding future moves.
- Preserve the item's policy through ZIP/editable roundtrip and source provenance. Sparse imported clips remain sparse.
- State that an asymmetric mirrored attack can animate the opposite arm. Do not advertise consistent attack handedness until the base action is independently rendered.

The item-only path is viable for attachment consistency, but it is broader and easier to misrepresent than the independent-character path.

## Required verification

- Offline four/eight direction plans, estimates, no accidental overwrite of original western rest views, all18 finite joint labels, western authored action uses the requested anatomical arm.
- A pending legacy creation resumes with the same request hashes after the feature update; new policies have deliberate distinct hashes.
- Independent four/eight held items across idle/walk/slash, both hand slots, real occlusion review, oversize pivot alignment and frame-zero handling.
- Future move addition, replacement invalidation, save/reload and editable ZIP roundtrip keep the policy and generated western rows.
- Pixel comparisons for generic, Godot, Phaser, Unity and Aseprite exports, including recolored outfits and cape overlap. Explicit rows must override mirror fallback.
- Visual acceptance checks weapon and shield placement on front/side/back views and attack-arm motion; ambiguous side grips remain reviewable.

Primary context: [PixelLab API schema](https://api.pixellab.ai/v2/openapi.json), [official rotation guidance](https://www.pixellab.ai/docs/guides/rotating-a-character), and the project's stored S3/S5 motion/held-item evidence. Official rotation guidance limits simple flipping advice to symmetric subjects; the anatomical/action tradeoff above is the audit's inference from source and deterministic trajectory evidence.

## Implementation follow-up in the shared audit worktree

After the legacy live flow settled successfully, the parent authorized the bounded new-character implementation. `CreateSpec.directionPolicy` now accepts `independent` or `mirrored`; omitted policies retain legacy mirrored behavior and initial request shapes. New blank forms explicitly choose independent views, while an existing form draft without the field keeps its original mirrored intent. A disclosed cheaper mirroring checkbox remains available. Saved projects retain their pixels and actual `rig.directions[].mirrorOf` policy; no conversion of existing characters occurs.

Creation now retains provider western rotation originals under the independent policy and renders every requested direction. Its initial text-only v3 request remains eight-direction capable without `n_directions: 4`; a matching previous completed drawing can be reused by the ordinary request ledger. Independent freezing uses the existing `all` mode and additionally asserts the exact requested four/eight direction set and expected mirror links before publication, guarding against `buildRig`'s intersection behavior. New body/item mirror metadata reflects the resulting rig rather than always saying flip.

The estimator uses actual generated directions and existing shared retry bounds: independent four =46.25 baseline/75.45 configured upper estimate; independent eight =90.25/148.65. Time estimates scale the previous estimates to16/29 minutes before variable queue delays; these are extrapolations, not provider SLAs. Eight independently dressed held views need three96px dress batches (4+3+1 item references, including subsequent anchor overhead), followed by16 idle/walk pose calls, for78 generation units before retries. Existing dynamic item planning accounts for that batching automatically.

Offline tests cover omitted legacy policy, both independent direction sets/costs, preservation of distinct provider western pixels, missing/duplicate/wrong-mirror freeze rejection, unchanged initial text-only requests across policies, anatomical right-arm travel for W/SW/NW slash, held eight-direction caps/costs, and truthful mirror metadata. The data/export lane independently tests four policy/count combinations through editable ZIP plus recolored/tucked generic/Godot/Phaser/Unity/Aseprite outputs. The policy/queue/generation/selftest subset passed74tests and strict Svelte/TypeScript checks passed. Paid independent-character/weapon/slash visual acceptance is still required; these offline checks do not prove generative anatomy or artwork quality.
