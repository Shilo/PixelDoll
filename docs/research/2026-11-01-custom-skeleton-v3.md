# Custom Skeleton v3: documentation and live qualification

Checked November 1, 2026 local time, including live completion on November 2 UTC. The initial documentation-only check was followed by free MCP preflight and a six-generation two-direction experiment. This supplements the [October qualification results](2026-10-28-motion-targeted-authoring.md). Machine-readable results: [custom V3 results](2026-11-01-custom-skeleton-v3-results.json).

## Decision

Custom Skeleton v3 works through live browser MCP, including procedural moves and pose overrides. Public REST documentation describes a custom workflow but does not declare all of MCP's authoring fields; REST parity remains unverified.

The bounded comparison is complete. It is useful for authoring recognizable shared body motion, but does not yet solve professional equipped animation. Keep it experimental and prioritize curated frozen clips, explicit weapon anchors/occlusion and visible sole review. Campaign spending is now **998/1,000**. Historical checkpoints and the complete experiment follow below.

## Three different workflows

| Workflow | Meaning | Current project usage |
| --- | --- | --- |
| Managed Skeleton v3 with an animation template | PixelLab supplies an existing motion, such as its eight-frame walk | The Studio uses this as a walking-motion source, then renders with stored keypoints |
| Raw Skeleton v3 | We supply a reference sprite, its joints and each frame's joint coordinates | The Studio's final body/item posing and the Motion Lab's converted 3D motion use this |
| Managed custom Skeleton v3 | A reusable motion is authored for a managed character and shared across directions, without an animation-template ID | Tested in the dev-only lab; not integrated or production qualified |

The branch therefore already uses custom coordinates through the raw endpoint. That is different from the newly documented managed custom authoring workflow. Here, custom refers to the animation, not an arbitrary user-defined bone hierarchy or a guarantee for every sprite shape.

## What the current MCP guide adds

The official [MCP tool guide](https://api.pixellab.ai/mcp/docs), under `animate_character`, describes:

- Skeleton v3 without an animation template, using an initial call that returns authoring instructions and character-specific measurements. The guide labels that instruction call free.
- A subsequent call with per-frame poses controlling pelvis, hips, chest, lean, head, hands, elbows and feet.
- A `move` option for code-laid-out motions such as running or a slash, including sequences of moves. Pose authoring can add details on top of those motions.
- An optional size track and reuse of an animation group's existing motion when adding directions.

These features are relevant to our source-to-target conversion, limb proportions, body facing and agreement across directions. Those are potential benefits inferred from the documented controls, not measured improvements. The guide does not establish that the rendered fingers, equipment layers or sole pixels will meet our quality bar.

## REST and MCP are not yet an identical documented contract

The live [public OpenAPI schema](https://api.pixellab.ai/v2/openapi.json) documents custom Skeleton v3 through the existing managed character-animation endpoints, using an action description without a template ID. Its description says the directions share one 3D motion and retain it when a later direction is added.

However, the managed REST request schema does not declare the MCP guide's `poses`, `move` or `scale` fields, and disallows undeclared properties. Its description also presents the motion-generation step differently from MCP's two-call instruction/pose workflow. Do not assume the MCP parameters work when copied into a REST request. The exact authoring path and public REST availability need live verification before shipping this in our client-only app.

Compared with the repository's saved OpenAPI snapshot, the managed mode/frame-count descriptions have changed to cover custom Skeleton v3. The raw Skeleton v3 request schema is unchanged. I found no separate public path named custom skeleton; the distinction is within the managed workflow.

At the documentation-only checkpoint, no host PixelLab MCP connector was configured and the free instruction call had not been executed. The later direct browser MCP experiment below verifies deployed behavior without adding a host connector.

## Code evidence

- `app/src/studio/create.ts`: walking uses a managed Skeleton v3 template as a motion source. Other sources include authored poses and PixMiniMax. Final rendering uses raw keypoints.
- `app/src/lib/pixellab/routes.ts`: the Skeleton v3 base-animation helper supplies a template ID. Its managed request type has no custom pose/move/size tracks.
- `app/src/lib/rig/clips.ts`: raw rendering sends the reference and ordered joint coordinates to `/animate-with-skeleton-v3`.
- `app/src/ui/motion-lab/run.ts`: the lab sends our converted/authored pose sequence through that raw renderer, rather than the managed custom workflow.

## Exact next experiment and stop rule

1. Use an existing managed benchmark character. Retrieve the documented free custom-authoring instructions through MCP and inspect the returned measurement, pose and motion contract. Verify costs and REST parity before any app integration.
2. Author one planted-foot weapon attack using the managed custom controls, preferably its supplied move layout with explicit hand/foot adjustments. Render the same motion in south and east, and compare it against the stored baseline. An eight-frame result is sufficient for this first comparison.
3. Check visible grip, unwanted body turning, sampled sole displacement, identity and agreement across views. Retain raw inputs and outputs. A shared motion alone is not a pass.
4. Continue only if the comparison visibly improves those failure modes. Otherwise, stop broad skeleton tuning and keep the curated frozen-body, explicit attachment and masked-edit approach as the stronger current evidence.

At the documentation-only checkpoint, spending was 992 of the approved 1,000 generations, leaving eight. The proposed two-direction ceiling was then verified and the experiment completed as recorded below.

Tracking: the existing motion-quality card remains the matching scope. Its reference update could not be synchronized because the saved GitHub credential lacks project-read permission. No login, scope expansion or uncertain board mutation was attempted. File documentation proceeded under the user's existing research authorization.

## Historical checkpoint: initial implementation and rejected credential

The user's continuation authorizes the bounded comparison within the original 1,000-generation allowance. Preparation now includes a development-only, read-only MCP inspection panel in Motion Lab. It can initialize a direct browser MCP session, inspect the relevant tool schemas, search existing benchmark characters and read one character. It cannot call an animation or creation tool. No new dependency, account connection or backend was added. Plugin discovery returned no PixelLab connector, so this is an inspection adapter using the existing agent connection, not a claim that a host MCP integration was installed.

The client accepts JSON and SSE replies with matching request IDs, keeps the bearer credential and MCP session header in memory, redacts a reflected credential, exports only inspected results and makes no automatic retry. Repeated inspection is a user action; generation is not exposed through this panel. Actual browser CORS and deployed MCP schemas remain unverified until authentication works.

The live localhost agent session reached PixelLab's free `GET /balance` check and received HTTP 401 with an invalid-token response. No live MCP tool call, character-specific instruction request or animation submission followed. This is a credential blocker, not evidence that custom V3 is unavailable. The original research total remains **992 generations**, with **zero new paid requests** in this continuation.

This also exposed a readiness defect: the lab published its credential to the queue before validating it, allowing a rejected connection to appear usable. It now publishes the credential only after a successful balance response. The rejected live session was verified to leave the MCP inspection button disabled.

The credential-free local preflight record is `spikes/api/out/motion-custom-v3-2026-11-01/preflight.json` in the ignored evidence directory. The implementation and research remain on `codex/motion-lab`; no production integration or new animation-quality pass is claimed.

Verification: strict checking passes with zero errors/warnings; all 110 unit files pass, with 1,033 passed tests and one existing skip; all eight tests in `selftests.spec.ts` pass. The new unit and browser checks use synthetic credentials and mocked MCP replies to verify request matching, read-only tool calls, session privacy and credential-free exports. They do not claim live MCP or animation quality validation. Production build and dist guard pass. The full production end-to-end suite was not run for these isolated development-lab changes.

At this checkpoint, the next required input was a valid `PIXELLAB_API_KEY_AGENT_DEV` in this worktree's ignored `.env`, updated locally by the owner. No credential was printed, copied into code, saved in evidence or requested in chat. Board synchronization was still pending because project access remained unavailable; no board mutation was made.

## Live continuation after the owner updated the credential

The free balance check now succeeds. Direct browser MCP initialization and schema inspection also succeed. The deployed `animate_character` schema actually includes `poses`, `move`, and `scale`; this is now verified behavior, rather than a public-document inference. The free authoring call returned character-specific measurements and explicitly reported that no motion was queued or charged. Its reference overlay and complete instructions are preserved in the ignored `live-inspection.json` evidence file.

The existing managed adult benchmark is `f69d3f89-043e-4e04-b904-dd97871c5d06`, a 64 px humanoid with eight views. It initially had no managed animations. This is a bare-body motion test; no sword is present in the reference, so it cannot qualify an equipped weapon grip or equipment occlusion. The action description asks for an overhead strike with a closed right fist to test an attachment-ready hand without inventing a sword.

The instructions describe figure-relative 3D coordinates, automatic limb solving, bounded chest/hip rotation and adjustments to body position for hand reach. Feet are offsets from their rest positions; explicit zero offsets on every frame request planted feet. A held object has no independent joint or orientation track: the renderer follows the hand and forearm. This helps author body motion but does not establish stable weapon attachment or finger masking. The guide prefers its procedural moves over hand-written poses for common motions.

One initial submission included an unsupported REST-style `seed` field. The tool returned a Pydantic keyword validation error before queuing any animation; a subsequent character read still showed no animations or pending jobs. The refused request is retained in `validation-refusal.json`. The request builder now omits seed and checks all top-level comparison fields against the inspected live schema. A corrected submission required a new explicit UI action. There is no automatic retry; only that exact pre-dispatch seed refusal can be corrected while retaining the original reservation and receipt history. Unknown transport outcomes remain blocked.

The accepted comparison uses the supplied `chop` move at energy 0.8, eight frames, and both feet explicitly fixed at their rest offsets on all frames. One submission requests south and east from the shared motion. The tool receipt quotes **three generations per direction, six total**. Group: `8ab6d6e1-3e3c-46a1-bd99-ca6182c84b7f`; south job: `5a19b0b3-b34f-4e08-ae53-63ff51301263`; east job: `7f43322a-2e84-410d-ab7c-a3a579aa7c4f`. The full request, accepted receipt and previous validation refusal are preserved in `accepted-comparison.json`.

The new comparison has a separate persistent Web Locks reservation for all eight remaining authorized generations, made before submission. Historical reservations are unchanged. Its control remains disabled after acceptance and after reload. The six-generation quote would bring the campaign to 998 if billed as quoted; retain the eight-generation reservation until the outcome and charge are reconciled. No additional paid experiment is authorized by a free balance check.

## Completed qualification and recommendation

Both jobs completed. Free REST reads of their background-job records confirm **3 generations each, 6 total**, matching the submission quote. The campaign is now **998 of 1,000 generations**, with two unused. The eight-generation reservation remains retained as conservative history; no additional comparison can be submitted through this tool. These free job reads export only status and usage, not credentials. The settled records are in `settled-billing.json`; completed frame URLs are in `completed-character.txt`.

| Check | Observed result | Implication |
| --- | --- | --- |
| Output | Eight frames in each of south and east; one shared motion group | Managed custom V3 is usable through direct browser MCP |
| Canvas | Both clips are 96 by 96 despite the 64 px source | A managed clip is not a drop-in replacement for the existing 80 px body sheet; placement and pivot must be established |
| Basic pixel gates | Zero border pixels and zero detached pixels in all 16 frames | Clean silhouettes, not a professional-animation pass |
| Body motion | Recognizable anticipation, downward strike/crouch and recovery in both views | More coherent authoring behavior is promising; visual comparison is subjective |
| Strike readability | First three frames hold a similar hand-near-head wind-up; the tested strike has limited above-head extension | Do not describe this energy-0.8 variant as a finished realistic sword preset |
| Fixed-foot request | South lower-outline range: left 1 px, right 0, bottom 0; east: left 3 px, right 2, bottom 1 | Drawn foot outlines still vary. These are extrema in the bottom two occupied rows, not tracked anatomical heel/toe measurements or proof of sliding |
| Grip and occlusion | No weapon in the reference; no weapon joint in the authoring contract | Neither equipped grip nor equipment/body overlap is qualified by this test |
| Reference match | Managed silhouette 27 by 60, 963 opaque pixels; old frozen reference 31 by 62, 1,009 opaque pixels; trimmed RGBA hashes differ | Related adult benchmarks, not a controlled A/B with identical reference pixels |
| Export contract | Download contains rotations, frames and metadata, but no frame durations, explicit pivot or expanded per-frame skeleton track | The existing layer pipeline still needs these alignment/rig contracts before any managed workflow integration |

The offline analyzer is `spikes/api/mocap/qualify-custom-v3.mts`. It reads the preserved downloads and stored baseline, makes contact sheets, compares reference pixels, reports pixel gates and foot-outline proxies, and creates a local playback review at `http://localhost:5199/test-results-motion-custom-v3-review/index.html`. The review embeds its images and makes no PixelLab requests. It uses original baseline timings and an explicitly illustrative 150 ms per frame for managed output; playback is not a timing-matched experiment. The full eight-frame strips were visually inspected in both views. Original PNGs are retained unchanged. `review-proof.png` records the browser comparison, and `review-pack.zip` contains the local evidence.

**Recommendation:** keep custom V3 as an experimental authoring option, not a replacement for the production rig/layer pipeline. It is real and relevant, but this test does not demonstrate a professional-quality solution to the original problem. Prioritize a small, manually approved preset library for supported body families, frozen base frames, explicit per-frame weapon anchors and rotation, hand/body occlusion masks, and visible sole checks. Those controls remain necessary even when the motion source improves. Do not promise automatic realistic retargeting for arbitrary humanoid silhouettes.

Before a production integration, a future controlled test must use identical source artwork, retrieve or explicitly author the resulting frame rig/pivot, and qualify actual equipped output with tracked visible soles across all intended views. Repeated seeds, body types, west and diagonals remain unqualified here. The remaining two generations do not cover another eight-frame direction at the verified three-generation price, so no further paid work was performed.

Implementation changes in this continuation: a fixed free-instruction helper, one bounded two-direction comparison, persistent pre-dispatch reservation and refusal history, schema-field validation, free settled-billing reads, and an offline comparison analyzer/viewer. Existing raw-motion spending is now labeled historical so it is not mistaken for the combined campaign total. The Studio's production creation and layer pipeline remain unchanged.

Board synchronization remains pending because project-read access is unavailable. No board status or scope was changed, and no new account permission was requested.

Final verification: strict checks pass with zero errors/warnings; 110 unit files pass, with 1,036 passed tests and one existing skip; all eight browser selftests pass, including mock-only inspection, generation gating, persistent reservation and reload protection. Build and dist guard pass; the custom tool and benchmark IDs are absent from the production bundle. The offline analyzer ran successfully and both complete frame strips and playback were reviewed. Full production end-to-end tests were not run because production behavior is unchanged. No check failed in the final run. The documented live seed-field refusal was a pre-dispatch experiment failure, not a passed generation.
