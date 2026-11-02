# Independent review of motion and paper doll quality

November 2, 2026. Initial independent review, before the owner's external Claude response and before the coordinator's joint counter-review. No application fixes, generations, board changes, dependency changes, or commits were made by this reviewer.

**Verdict:** keep the production extraction boundary. It prevents a real class of protected-pixel leaks and survives the inspected repair paths. Do not release the experimental equipped attack or claim that natural motion for arbitrary humanoids is solved. Fix the response-body transport failure classification described below before integration: it can conceal an uncertain paid outcome behind an ordinary failure label, although I reproduced no automatic duplicate submission. Finish the broad research phase now. A clean-source experiment is a plausible conditional discriminator, not the default next task or an established solution. The highest-value immediate work is the small recovery fix and an honest disposition of the unqualified assets.

## 1. Inspection record and limits

- Checkout: `C:/Users/shilo/.codex/worktrees/motion-lab/PixelDoll`, branch `codex/motion-lab`, HEAD `14daf45f`. Product baseline `0acd88ab`; subsequent `592e3dfe` and `14daf45f` are documentation commits. `git diff --name-only 0acd88ab HEAD -- app` returned no application paths. The coordinator's concurrent change to `docs/reviews/2026-11-02-credit-consent-audit.md` was left untouched.
- Read the applicable root `AGENTS.md`, the complete `docs/handoff/2026-11-02-claude-paperdoll-quality-review.md`, the credit-consent audit, the November 2 weapon-aware report, substantial relevant sections of the November 1 reconciliation report and both compact result files, `docs/known-issues.md`, and `docs/design/skeleton-pose-lab.md`. Earlier campaign, library, converter and cost claims were assessed through those records and selected source, not freshly reexecuted in their entirety.
- Inspected production `app/src/lib/items/items.ts`, relevant portions of `items/run.ts`, `image/chroma.ts`, `image/hard-mask.ts`, `pixellab/client.ts`, `pixellab/queue.ts`, `studio/create.ts`, `studio/state.svelte.ts`, `studio/ActivitySheet.svelte`, and Lab `fixed-inpaint.ts` and budget code. Inspected the focused tests and the disarm/body-family/axis evaluator scripts where relevant.
- Personally viewed native PNGs and ordered comparison sheets: `weapon-swap-completion-fixed-body-comparison.png`, `body-star-v2-comparison.png`, `weapon-aware-full8-hatchet-raw-vs-conservative.png`, `weapon-axis-repair-comparison.png`, `weapon-axis-repair-3-provider-output.png`, `weapon-swap-completion-7-provider-output.png`, reconciliation `managed-equipment-frame1-grip-comparison.png` and `blind-B-east-large.png`, and historical source/recomposition south frame 0. These are under the dated evidence directories unless otherwise stated. Native source files, rather than GIF colors, were used for pixel calculations.
- Freshly recomputed all 16 historical armed/split comparisons and their two PNG SHA-256 values per pair from the main checkout's retained `spikes/api/out/x28/`. All values matched `armed-split-audit.json`. This was read-only access to image files; the main checkout's unrelated work was not touched.
- Freshly decoded the actual seed 737 request, mask and result from `weapon-axis-repair-evidence.json`: **82,267 protected pixels, zero RGBA changes**. Freshly isolated the two reported native pommel deletions with the production chroma functions and reproduced the mechanism on a two-pixel synthetic fragment.
- Ran pinned Node **24.22.1**, npm **11.19.1**, existing tests: `item-stencil`, `automatic-recovery`, `grid-repair`, `paid-retry`, `queue-generation-consent`, `queue-resume`, `fixed-inpaint`, `research-budget`, `held-raw-key-review`. **Nine files, 174 tests passed.** The first sandbox attempt failed before collecting tests because Vite's transform-cache rename returned Windows `EPERM`. The identical command passed outside the sandbox. No test/configuration/assertion was changed.
- Ran two read-only inline mocked reproductions of the response-body-read defect, including a reload and repeated ticks. No live HTTP request was possible in those snippets because `fetch` was replaced with a local function. No production browser submission, balance query, token access, environment-file reading, full suite, browser suite, build or strict check was performed for this documentation-only review.
- **Continuous playback with authoritative timing was not personally inspected.** The still sequences support observations about shape, contact and continuity between drawings, not a personal certification of animation timing or appeal. I did not audit private Claude transcripts or independently verify current external API support, plan prices or licenses. I have no earlier Claude workflow of my own to defend. Historical claims attributed to Claude below are the claims represented by the handoff and retained images.

The board scope was supplied by the coordinator; this reviewer did not attempt board operations. Tracking remains the coordinator's responsibility. The external Claude review was not available when this report was written.

## 2. Claims audit

| Claim | Assessment | Fresh evidence or qualification | Confidence and consequence |
| --- | --- | --- | --- |
| Production inpaint extraction now stays inside the submitted permission after cleanup and repair | Agree for the inspected paths | `items.ts:355`, `607`, `658`; `run.ts:328`, `374`, `631`; existing focused tests passed | High. Keep the patch. This is an output containment invariant, not semantic extraction. |
| Restored inpaint can safely reconstruct its mask rather than inventing one from current joints | Agree with its actual implementation boundary | Saved blob membership, bytes hash, declared and decoded canvas, binary target-cell checks in `run.ts:328`; missing/corrupt cases passed | High for those integrity checks. It does not prove the mask was anatomically correct, or defend arbitrary simultaneous corruption of all ledger fields. |
| Extraction cache includes mask identity | Agree by source inspection | `run.ts:406` adds `o.stencilHash` to signature | High for code, lower for regression coverage. I did not find an explicit valid-mask replacement on the same cached draft in the named tests. |
| No extra paid quality retry starts automatically | Agree within inspected production and fixed-diagnostic paths | `run.ts:301`, `309`; durable queue consent and fixed receipts; focused tests | High for inspected paths. Planned multi-call operations remain planned work. No global guarantee for all future paths. |
| Every uncertain paid transport outcome is handled as unknown with the appropriate warning | Disagree | Response headers can arrive, then `Response.text()` rejects; `client.ts:86` rethrows raw error, queue marks `failed` | High, fresh reproduction below. Same-record reuse still prevented an automatic resend. |
| Armed-then-split preserved the original armed images exactly | Disagree | All 16 fresh RGBA/hash comparisons match the reported discrepancy | High for nonexactness. Counts alone do not prove visibly unacceptable motion. |
| Managed custom is better than the tested raw controls | Provisionally agree as candidate selection, not a causal renderer conclusion | Inspected managed east strip reads as overhead anticipation, descent and recovery; comparisons change motion authoring and representation too | Moderate visual judgment. Do not extrapolate to other actions, sizes or views. |
| A new authored gripping-hand body improves this family | Agree locally | Failed old-body frame 1 composite versus authored-body weapon composites; contact is visibly closer | Moderate. It is a different asset with authored skin and silhouette, not preservation or universal fitting. |
| Exact black-mask retention proves bare-body anatomy or clean item semantics | Reject | Raw disarm/completion history and existing 734 rejection; D is permission, not a body/prop label | High logical distinction. Added anatomy inside white space remains possible. |
| 737 fixes the hatchet family | Reject | Native output and replacement sheet show a broken/small distal head despite a more downward shaft | High for rejecting these assets. Reported PCA/material metrics support but do not define that judgment. |
| Thin pommel loss is a component-floor problem | Reject | Fresh `chromaMask` then `dropKeyOutline` changes both native samples from 1 to 0 before component cleanup | High. Lowering `minPx` cannot recover those pixels. |
| Fixed toe/heel samples establish planted motion, engine speed or provider pivot | Reject | No authoritative timing/root contract was inspected; exact crop geometry is a separate assertion | High. A world-contact or runtime-export claim remains unqualified. |
| A clean bare-hand source is the evidence-mandated next purchase | Disagree | It removes a plausible old-weapon cue, but does not solve missing surface, depth, grip or design information | Moderate. Only a tightly prepared final test might be justified; stopping is currently reasonable. |

## 3. Prioritized findings

### F1. P2, proven implementation bug: partial response failure loses paid-outcome uncertainty

**Trigger:** a paid POST returns response headers, possibly after accepting a job, but the response body's stream fails before its JSON/job ID is read.

**Observed:** `client.ts:85-86` records a failed Activity call and rethrows the original error from `r.text()`. In `queue.ts:919`, a non-`ApiError` becomes kind `other`; `951-953` sets `state='failed'`. The record retains `requestStarted=true`, but its error contains only the raw stream message. `ActivitySheet.svelte:86` displays the special “unknown: may have run” text only for `lost`, so this path presents an ordinary failed result. The provider's acceptance and charge are unknown, not disproved by the client-side stream failure.

**Fresh output:** after submit, `state='failed'`, `requestStarted=true`, `attempts=1`, `jobs=[]`, `calls=1`, `error='synthetic response body connection terminated'`. After advancing time, ticking, constructing a second queue, loading saved rows, reenqueuing the identical request and ticking again: `state='failed'`, same record ID, **calls still 1**.

**Affected callers:** any REST request through the shared client; paid inpaint, animation, create and measurement requests can be uncertain this way. Free GET body-read failures also take the raw-error path instead of the normal transient retry path. This review did not reproduce a provider incident or automatic duplicate charge.

**Reusable offline reproduction:** from the repository root, pipe this module to the pinned Node executable with `--input-type=module`. It imports the existing synthetic balance fixture, never reads a credential and replaces all actual `fetch` calls.

```javascript
import { Queue } from './app/src/lib/pixellab/queue.ts';
import { api } from './app/src/lib/pixellab/client.ts';
import { accountBalance } from './app/test/unit/account-fixture.ts';

const rows = new Map();
let calls = 0, clock = 1000;
globalThis.fetch = async () => {
  calls++;
  return {
    status: 200,
    ok: true,
    text: async () => {
      throw new TypeError('synthetic response body connection terminated');
    },
  };
};
const make = () => {
  const q = new Queue({
    locks: null, online: () => true, now: () => clock,
    put: async (id, r) => rows.set(id, structuredClone(r)),
    get: async id => rows.get(id),
    all: async () => [...rows.values()].map(r => structuredClone(r)),
    api: async (key, method, path, body, ...rest) =>
      path === '/balance' ? accountBalance : api(key, method, path, body, ...rest),
  });
  q.setKey('synthetic-offline-key');
  return q;
};
const request = { method: 'POST', path: '/inpaint-v3', body: { seed: 881 } };
const meta = { tag: 'm3', playerRequested: true };
const q = make(), r = await q.enqueue(request, meta);
await q.tick();
console.log(r.state, r.requestStarted, r.attempts, r.jobs, r.error, calls);
clock += 60000;
await q.tick();
const reloaded = make();
await reloaded.load();
const restored = await reloaded.enqueue(request, meta);
await reloaded.tick();
console.log(restored.state, restored.id === r.id, calls);
```

**Recommended fix:** normalize a post-header body-read failure into an explicitly uncertain transport error handled by the shared queue. Paid POSTs should become `lost`, keep the original record, and disclose possible charge; free GETs should retain transient recovery. Do not turn the unread response into a normal parsed 429 rejection, or invent a no-job body from the status. Preserve the existing precedence of parsed accepted IDs and the narrowly parsed no-job refusal. Keep normal fully read 429/no-job rejection behavior unchanged. No new retry UI or architecture is required.

**Disproof/verification:** the exact reproduction must yield an unknown paid outcome, one POST after ticks/reload and same-record reuse. Add mocked cases for response-body failure after HTTP 200 and 429 headers, a free GET that succeeds on retry, and ordinary fetch timeout/body-read abort. Retain the existing parsed accepted-ID, clear 429 and exact no-job cases. An observed automatic resend in this reproduction would raise the severity; it was not observed here.

### F2. P2 quality limitation, proven extraction false negative: a legal thin fragment can disappear inside permission

In native `weapon-swap-completion-7-provider-output.png`, padded `(67,79)` is `[149,90,42,255]`, `(67,80)` is `[107,56,23,255]`. The corresponding frozen-base values are `[3,68,4,255]` and `[0,60,0,255]`. Fresh `chromaMask` retains both; fresh `dropKeyOutline` removes both. The mechanism is `image/chroma.ts:90-109`: rim/dark-base candidates with key neighbors are removed unless anchored to a noncandidate item pixel. Both samples can be candidates together.

A minimal counterexample uses an 8 by 8 image, a key-green base rectangle `x=2..5,y=1..6`, and two brown output pixels at `(2,3)` and `(2,4)`. They represent a tiny legitimate material fragment separated from the main weapon by the hand. `chromaMask` has area 2; `dropKeyOutline` returns area 0. This establishes the heuristic's false-negative mechanism, not that every isolated brown pixel is semantically a pommel. The actual sample is visually plausible material; its definitive semantic classification still requires art judgment.

**Consequence:** the stencil is an upper bound. It correctly prevents outside leaks but cannot require recovery of all legal material. Neither `minPx:1` nor copying a broader edit permission fixes the earlier deletion. This behavior predates the containment patch and is not evidence that the patch should be reverted.

**Recommendation:** retain the raw candidate and conservative output separately in research; do not globally disable outline suppression, treat D as a prop matte, or add every removed brown pixel. If this candidate is later qualified, its two pixels need a reviewed material decision. A shared heuristic change needs paired controls: the legitimate occluded fragment and the protected low-green/body-rim false positive that the rule prevents. A semantic high-confidence item matte could justify an exception only where genuinely supplied; production currently supplies edit permission instead. Do not introduce a per-frame casual-user painting workflow to rescue this experiment.

**Falsifier:** evidence that the two native samples are anatomy/spill defeats the specific pommel judgment, but not the synthetic false negative. A narrow proposed rule must retain the intended fragment while continuing to remove independent body-rim controls and honoring stencil/cut containment. No threshold change is recommended from this one sample.

### F3. Release blocker for presets, not a new app bug: hand correction does not qualify the eight-frame weapon action

The full-eight native hatchet composites show an abrupt orientation transition around frames 2 to 3 and a substantial apparent shaft/reach change around 4 to 5. In the earlier poses the axe points up/forward while the source sword points down/forward; 737 changes that direction but produces a small damaged-looking distal object. Those observations independently support rejecting the proposed replacements and withholding a preset release. Source sword direction is not anatomical ground truth: an animator could choose a different axe wrist action, so angle discrepancy alone is not a failure criterion. The absence of a stable, deliberately specified axe action and design is the relevant gap.

Frames 2 and 6 have partly hidden hand/grip structure. Black preservation and connected material cannot prove which fingers are in front, wrist pronation or hidden handle continuity. A good green provider image is insufficient: the old frozen-body frame 1 composite visibly has the weapon above the old fist. The new body makes that contact more convincing, but is an authored change in geometry and skin, not a repair to an interchangeable item on the old asset.

**Expected:** a supported preset has a consistent prop design, credible hand contact, intentional motion/timing, declared occlusion and common export coordinates throughout the supported clip. **Current:** these conditions are not all demonstrated. Keep `qualified=false`, original failed controls and Studio defaults. Disproof requires reviewing the actual whole clip with intentional timing and the original frozen-body/item composition, not accepting a still, successful mask count or an area ratio.

### F4. Low priority test/evidence gap: mask-hash cache invalidation is clearer in code than in the cited regression evidence

`run.ts:406` correctly includes the mask hash. The inspected restored-mask tests exercise missing pointer/input/blob, hash corruption, declared canvas, target mask format and raw registration. I did not find an explicit same-draft, same-output-record test that replaces one valid submitted mask with a second valid mask and reevaluates after the first extraction is cached. This is a coverage gap, not a reproduced cache bug. The handoff's “changed mask cache identity” wording is stronger than the named tests visibly establish.

If touching this integration, add that discriminating test without mutating the original caller-owned stencil or weakening existing restoration cases. Also repeat evaluation and compare cuts/areas so shallow copied optional arrays cannot silently introduce cache statefulness. I found no actual cut escape in the current sequence: extraction clips the cut first, and the inspected later processing does not grow it.

## 4. Production extraction, restoration and consent assessment

The patch addresses the shared cause rather than filtering only one experimental output. `extractCell` takes an optional binary permission, suppresses registration only when that permission is supplied (`items.ts:662`), clips both layer and cut, then copies the supplied array (`697`). `clipToStencil` validates type, length and 0/1 values, updates area through `setMask`, clears RGBA and cuts outside permission (`355-359`). `postProcess` clips before and after morphology, attachment and keyframe repair (`607-611`). Thus a repair can still create a flagged local approximation inside permission, but cannot escape it. `repairDropped` remains an approximation, not recovered prop geometry.

The raw result is read, not rewritten. There is a terminology nuance: `CellOut.out` is the unregistered provider cell on the stencil route; on the legacy registration route it can be the translated image, while the input `o.out` is not mutated. Raw-body observations are computed before registration. Do not simplify that into a claim that every `CellOut.out` in every route is always raw.

Restored draft evaluation recovers the mask from `r.params`, requires its `$blob` to occur in `r.inputs`, verifies SHA-256 and dimensions, and validates each extracted target cell. It fails visibly with G1 instead of extracting unbounded. The implementation intentionally excludes reference and unused-tail cells from item permissions. It does not validate their hard-mask semantics as though they were target cells. Current request construction makes reference masks black. That division is sensible; references are not equipment output.

Accepted-item/new-move repair derives stencils from the exact request before enqueue (`run.ts:637`) and applies them to returned raw coordinates. Queue reuse is based on request identity, including the mask; the fresh request is therefore a reasonable source of permissions on this path. It would be wrong to rebuild a restored draft's mask from today's joints instead, and that path does not do so. I found no demonstrated restoration or repair bypass.

Production held masks are still broad 34-pixel neighborhoods around measured hand positions (`run.ts:164-169`), unlike the research's reviewed W/K/U/H masks. The containment patch does not transplant the research's finger protection into Studio. It permits genuine front-of-body equipment, but also permits redraws of body/hand pixels inside that disk. Chroma extraction can remove the provider's new hand and expose a mismatch on the frozen body. This is an existing semantic limit, not an unimplemented promise of this patch.

No automatic quality-triggered generation was found. Structural/quality failure stops and retains results. Existing retry consent rechecks reviewed rig/draft/input/price (`state.svelte.ts:708-729`, `885`) and the inspected item-move path rechecks artwork and estimate before work. Queue load blocks old unsent generation records without the player-requested marker, and submitting records are not automatically reissued. Fixed Lab dispatch uses a reservation, receipt and one-shot key before enqueue; loading/importing evidence is not a submission. Parsed accepted-job IDs override retry classifications. The response-body failure in F1 is the concrete exception to the audit's broad uncertainty handling/disclosure claim, not a refutation of the no-extra-quality-call finding.

## 5. Visual, motion, pivot and user-labor assessment

**Anatomy and hand:** the authored hand is a legitimate different asset choice. Old and new grip landmarks differ enough that automatically clamping to the old hand would remove the successful change. But an 8-pixel union envelope is an authoring allowance, not a finger segmentation or proof of forearm anatomy. Source-K preservation is an RGBA constraint, not a guarantee that the preserved pixels were correct anatomy. The recorded posterior corrections make that distinction material.

**Occlusion:** a weapon can cross in front of the thigh while the fingers remain in front of the handle. A single broad permission cannot encode both roles. Adopting new skin inside each weapon would break recoloring and family independence. Freezing a reviewed hand once avoids repeated body adoption but does not recover hidden handle or finger surfaces. Hidden samples should remain “unobserved,” not be counted as positive grip evidence. Occlusion by itself also should not permanently prohibit useful research; it limits the scope of the conclusion.

**Design and material:** the final comparison shows more than a color/area issue. The object's silhouette and distal shape change. Neutral-component area and PCA angle are useful diagnostics only if the material classifier and intended pose remain valid; metal need not be exactly neutral, and perspective can change projected area. The visual rejection of 737 survives those limitations because the final object visibly fails the supplied design intent. Exact preservation of its background cannot rescue that.

**Timing and feet:** neither ordered strips nor 100 ms GIFs certify anticipation, impact and recovery timing. Managed frame timing was not verified; transferring raw-control durations to managed drawings is an authored playback choice. Stable native toe/heel samples rebut a claim of obvious measured drift in those samples, but do not establish both feet, in-between held-frame contact, weight transfer, world-root displacement or a locomotion speed. I make no new “extra leg in 736” claim; that earlier suspicion was withdrawn and the inspected current strips do not establish one.

**Pivot and bounds:** the declared body crop `(32,32),80`, pivot `(40,75)` and held crop `(16,16),112`, pivot `(56,91)` resolve to the same source point `(72,107)` by arithmetic. This is an internally coherent authored contract. It is not independent verification of provider coordinates or a runtime engine result. Qualification should compose/export/reimport the body and item at that common pivot without per-frame alignment and include bounds for the entire clip. Dynamic held padding is already present; a universal 96-pixel exporter defect was not found.

**Labor and cost:** the recorded six-call weapon-aware sequence cost 110 units; the additional phase totals 153.25 actual and 196 conservative held. These are retained reported receipts, not an independent accounting-system audit or a production price quote. More consequential than the remaining allowance is the expert labor: source selection, W/K/U labels, old/new hand envelopes, 144 source correction entries, 50 actual-body-to-V2 edits, a separate 18-pixel source contour correction, skin mapping and full-clip review. Those numbers are operations in separate stages, not a sum of unique defective pixels. No reliable artist-hours measurement exists. It is not credible to promise that casual users will get this result from one prompt without that work. A curated preset can absorb some one-time family labor; new items, body proportions and views still need a demonstrated amortization/repeatability case.

## 6. Experimental-design challenge and prior-workflow reconciliation

The fresh 16-pair result is decisive against **exact preservation**: south changed-visible counts are 737 to 1,064; east 532 to 706. Alpha-presence mismatches are 0 to 43 and 7 to 28. Opaque RGB changes above 32 are 24 to 55 and 8 to 33. All match the retained audit, including hashes. The original and recomposed south frame 0 look broadly similar at native display size. Therefore both statements can be true: the route may preserve a useful visual action, and its exact-reconstruction claim is false. A large count of small palette changes must not be mislabeled wholesale anatomy damage.

Older real-frame edits without identical frozen-body inputs do not isolate body retention. The later exact-frame hard-mask control improves that experiment: it proves the black region, not every white pixel or the recomposed clip. Residual copying can trivially reconstruct an armed source if body pixels are allowed into the item. Pure-W versus W+U and independent body labels are necessary counterchecks; retaining the 22 uncertain source-boundary errors is more honest than relabeling them to pass. Conversely, uncertainty is not proof that all 22 samples are visible defects.

The managed/raw comparison changes source action authoring, pose expansion and output representation, with no equivalent exposed managed seed. It supports choosing the stronger observed candidate; it cannot establish that the renderer alone, rather than its internal choreography, is responsible. The static native-depth control is a more restricted comparison but cannot reveal the managed dynamic rig. The old converter bugs are logically independent of whether this particular managed action looks better. I did not remeasure the old 0.856-pixel support discontinuity or the broad 54/84-profile campaigns.

The B-star recipe is explicitly post-selection authoring. It is evidence of a possible family, not a repeatability rate. Stage allocations shifted away from replication; no remaining budget can substitute for the omitted independent control. Every current quality statement should preserve that selection context.

737's failure provides evidence against this specific source-plus-mask request. It does **not** prove that old sword contamination caused the head failure. Both failed frames' off-guide pixels being in old-W is suggestive because only that extra region was editable, but many generators can fail size/shape under several other constraints. The mask may allow a correctly sized head while the source pose, target guide, prompt or reference placement remain incompatible. Removing the old sword is a credible intervention, not a proven mechanism. A new bare-source experiment should not also change several design references, mask widths, guide scale and prompt semantics and then claim a causal result.

## 7. Options compared within the actual product constraints

No current external licensing or protocol claims were freshly verified in this review. The repository's pinned license/source records are prerequisites, not a blanket permission inherited from an MIT runtime.

| Option | Expected quality and missing information | Labor and repeatability | Client-only, cost and disruption |
| --- | --- | --- | --- |
| Current raw skeleton route | Preserves current workflow; joints constrain gross pose but omit fingers, feet and independent prop transforms | Low ordinary interaction; generated contact/identity remains variable | Existing browser architecture. Paid calls already planned. Keep as bounded existing functionality, not a universal-quality claim. |
| Managed custom body, then frozen-frame equipment | Stronger observed overhead body candidate; actual body frames constrain equipment location more than standing-image posing | One-time clip/grip authoring still substantial; new prop design/occlusion remains unsolved | Browser prototype exists, but production protocol/plan support and timing need verification. More integration risk than a local extraction patch. |
| Deliberately prop-aware family | Makes hand and prop choreography mutually deliberate before body freezes | Best evidence for this narrow grip; amortization only within compatible hand/action/prop classes; hidden surfaces and new body sizes need new work | Compatible in principle with client-only sprites. Research already consumed several edits; no proven one-call casual workflow. |
| Prepared cutout/mesh or reviewed per-frame artwork | Artist controls silhouettes, depth order and timing; needs hidden surfaces/segmented parts supplied | High initial art preparation; deterministic reuse afterward within its rig; pixel deformation/rotation can still look poor | Can run locally or offline, with engine/runtime license verified separately. A distinct authoring/import workflow and product decision. |
| Fitted 3D body/equipment proxy rendered to sprites | Explicit geometry, camera, grip and depth ordering; cannot automatically infer a faithful textured model from one sprite | High modeling/rigging/material effort per style/body; repeatable rendering after setup | Browser rendering is possible, but fitting/export/tool choice is unqualified here. Asset and tool licenses separate. Major product disruption. |
| Curated fixed sprite families with explicit support envelope | Highest predictable quality if hand-authored and reviewed | High internal authoring, minimal casual-user labor; less arbitrary-body freedom | Fits present sprite/export concept. Narrower product promise is the tradeoff; it may be cheaper than further universal-fitting research. |

Do not add a cutout engine or 3D dependency as an incidental motion fix. A prepared-art route can be a rational future product choice without being an accepted implementation task. No option shown recovers all hidden anatomy for free.

## 8. Minimal next plan, ranked and bounded

1. **Reconcile and fix F1 locally, then validate the extraction patch for integration.** Zero generations. Preserve consent/request identity and parsed rejection behavior. Run the focused new transport tests plus existing paid-retry/resume/consent tests. The repository's broader required checks apply if production code changes. Stop if any path reissues the uncertain POST. This is engineering work, not a new product decision.
2. **Close the experimental preset as unqualified for this release and preserve its evidence.** Zero generations. Record visible versus unobserved grips, authored body identity, uncertain boundaries, intentional timing/root/export gaps and the lack of repeatability. Keep the existing Studio motion default. A useful offline follow-up, if needed for the owner's decision, is to place a reviewed hatchet reference deterministically on the two contested poses using the proposed axis, depth order and pivot. This tests whether the *desired result itself* is anatomically and artistically coherent before asking a generator to reach it. It is a narrow diagnostic control, not a return to universal rigid attachment advice.
3. **Only if the joint review supplies a credible distinct hypothesis, consider one clean-source two-frame diagnostic.** Maximum conservative generation hold **25 units**, one accepted or uncertain request, no quality reroll. Freeze exact B-star inputs and actual design references; remove old sword pixels from the target source; state whether the desired head dimensions/axis are unchanged; submit an independent desired-prop permission with reviewed finger/foreground roles. Offline reject on impossible hand contact, lost foreground support, clipping, unsupported guide scale or wrong hand. Predeclare visible design/contact criteria and an uncropped raw-candidate audit. Fail or ambiguity rejects the candidate for this completion phase. A success permits a discussion of later qualification, not an immediate wider purchase or release.

Action 3 is conditional, not my recommendation to spend now. The present pilot has **196 of 200 units held and all 175 equipment units held**; it cannot reserve another 25 under those rules. The remaining 1,000-unit allowance is not exhausted, but any bounded stage/pilot amendment must be made explicitly without resetting previous holds or failed gates. This is not a request to obtain the same overall budget again. Default to ending this research phase if an offline desired-pose control is not convincing or if a new test would mostly repeat 737.

## 9. Precise implementation recommendations

- **Fix before integration:** normalize shared client body-stream failures in `app/src/lib/pixellab/client.ts`; preserve uncertainty in `pixellab/queue.ts` without a new automatic POST retry. Test in existing client/paid-retry files and check Activity's unknown label. Do not merely change the visible text for all failed jobs: some are known rejections.
- **Keep:** optional stencil ownership, raw-coordinate behavior and pre/post clipping in `items/items.ts`; saved-mask recovery and signature in `items/run.ts`; binary validation in `image/hard-mask.ts`; original failed outputs; informational raw-body observations; durable paid-consent and fixed-diagnostic receipts.
- **Add if editing this path:** same-draft valid-mask cache replacement and repeated cut/area evaluation test. No data migration or new persistent abstraction is warranted.
- **Defer:** thin-fragment heuristic changes until paired material/body-rim controls justify a local rule. No global threshold reduction, unconditional D-mask retention or automatic shape repair follows from the sample.
- **Do not implement from this evidence:** production managed-MCP adoption, a default preset replacement, automatic bare-body reauthoring per item, skin patches in equipment, universal rigid placement, automatic quality regeneration, a new cutout engine or 3D fitting workflow.

The expected production change remains small: extraction respects its actual permission, and a failed response stream honestly reports a possibly charged operation. None of those changes should force ordinary users to label fingers or review a new warning for every otherwise clean held item.

## 10. Decisions, unknowns and falsifiers

Engineering can resolve F1, cache test specificity and exact stencil/cut invariants without asking the owner for a new product direction. The owner must decide whether narrower curated body/action/grip support satisfies the product, whether internal artist authoring is acceptable, and whether a distinct prepared-art workflow is worth future scope. Those decisions cannot be derived from unspent credits.

Unresolved evidence includes authoritative managed timing and pivot, intended foot/world-root behavior, hidden hand depth order, independent native west/diagonals, other proportions/sizes, other prop classes, repeated-seed reliability and sustainable human authoring time. Unknown is not a fail in every art category, but cannot become a claimed universal pass.

Evidence that would materially change my recommendation:

- A clean-source result that preserves body/fingers and the full desired hatchet design in both contested frames, with uncropped candidates and no hidden body adoption, would make the old-source cue hypothesis more credible. It still would not qualify the entire clip or another family.
- A convincing offline target composite failing only at a particular automated cleanup stage would justify a precise extraction change. An unattractive target even before generation would argue for changing choreography, not another render.
- A complete intentionally timed export/reimport test, with native contact landmarks and a declared root path, could qualify timing/pivot/contact within its narrow envelope. GIF timing cannot do so.
- One successful independent compatible weapon/body/view control and recorded authoring labor would improve the case for amortized curated families. It would not establish arbitrary-humanoid support.
- A transport regression showing a second paid call after the unread response would change F1 from misleading uncertainty to actual duplicate-spend risk. The current fresh reproduction instead confirms request-identity containment.

## 11. Final disposition for the coordinator

**Accept/keep:** production mask containment, restored-mask validation, exact-coordinate extraction, current consent/one-shot protections and offline authoring tools within their stated limits.

**Fix before integration:** F1's partial-response classification/disclosure. Treat F4 as a targeted coverage improvement if editing the mask path, not a proven production fault. Counter-review this report against external Claude's findings before selecting fixes.

**Reject for release:** the proposed 737 substitutions and any claim that the equipped attack, managed route, or arbitrary humanoid motion is professionally qualified. **Defer** semantic thin-fragment changes and new workflow integration. The conditional clean-source experiment is optional and must earn its cost with a materially distinct hypothesis and an offline coherent target.

The application patch and the experimental presets have different readiness. The extraction patch is supported by code and the focused tests, subject to the coordinator's normal integration checks and joint review. The preset is not ready. This initial independent report does not close the owner's required dual-review reconciliation or mark the broad animation goal complete.
