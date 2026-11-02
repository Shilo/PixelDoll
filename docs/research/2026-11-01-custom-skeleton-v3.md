# Custom Skeleton v3: current documentation check

Checked November 1, 2026. Documentation and code inspection only: no account generation calls, no credits spent, no application behavior changed. This supplements the [October qualification results](2026-10-28-motion-targeted-authoring.md).

## Decision

Custom Skeleton v3 is documented for the API. The uncertainty concerns parity with the richer pose-authoring controls documented for MCP, not whether any custom V3 API workflow exists.

Yes, this is worth one bounded comparison before more work on our mocap conversion. The current documentation describes a managed custom Skeleton v3 workflow that this branch has not tested. It may improve pose authoring and agreement across directions, but has not demonstrated better rendered grip, occlusion or foot contact on our sprites.

## Three different workflows

| Workflow | Meaning | Current project usage |
| --- | --- | --- |
| Managed Skeleton v3 with an animation template | PixelLab supplies an existing motion, such as its eight-frame walk | The Studio uses this as a walking-motion source, then renders with stored keypoints |
| Raw Skeleton v3 | We supply a reference sprite, its joints and each frame's joint coordinates | The Studio's final body/item posing and the Motion Lab's converted 3D motion use this |
| Managed custom Skeleton v3 | A reusable motion is authored for a managed character and shared across directions, without an animation-template ID | Not implemented or qualified in this branch |

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

No PixelLab MCP tools are connected in this session, so the free instruction call and its returned pose format were not executed. Reading the public MCP guide does not prove deployed tool behavior or justify spending credits.

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

The previous total remains 992 of the approved 1,000 generations. Only eight remain. The MCP guide describes 2-4 generations per direction; verify a two-direction ceiling before submission and allow no unexpected setup/import charges. No paid comparison was performed in this check.

Tracking: the existing motion-quality card remains the matching scope. Its reference update could not be synchronized because the saved GitHub credential lacks project-read permission. No login, scope expansion or uncertain board mutation was attempted. File documentation proceeded under the user's existing research authorization.

## Continued implementation and live preflight

The user's continuation authorizes the bounded comparison within the original 1,000-generation allowance. Preparation now includes a development-only, read-only MCP inspection panel in Motion Lab. It can initialize a direct browser MCP session, inspect the relevant tool schemas, search existing benchmark characters and read one character. It cannot call an animation or creation tool. No new dependency, account connection or backend was added. Plugin discovery returned no PixelLab connector, so this is an inspection adapter using the existing agent connection, not a claim that a host MCP integration was installed.

The client accepts JSON and SSE replies with matching request IDs, keeps the bearer credential and MCP session header in memory, redacts a reflected credential, exports only inspected results and makes no automatic retry. Repeated inspection is a user action; generation is not exposed through this panel. Actual browser CORS and deployed MCP schemas remain unverified until authentication works.

The live localhost agent session reached PixelLab's free `GET /balance` check and received HTTP 401 with an invalid-token response. No live MCP tool call, character-specific instruction request or animation submission followed. This is a credential blocker, not evidence that custom V3 is unavailable. The original research total remains **992 generations**, with **zero new paid requests** in this continuation.

This also exposed a readiness defect: the lab published its credential to the queue before validating it, allowing a rejected connection to appear usable. It now publishes the credential only after a successful balance response. The rejected live session was verified to leave the MCP inspection button disabled.

The credential-free local preflight record is `spikes/api/out/motion-custom-v3-2026-11-01/preflight.json` in the ignored evidence directory. The implementation and research remain on `codex/motion-lab`; no production integration or new animation-quality pass is claimed.

Verification: strict checking passes with zero errors/warnings; all 110 unit files pass, with 1,033 passed tests and one existing skip; all eight tests in `selftests.spec.ts` pass. The new unit and browser checks use synthetic credentials and mocked MCP replies to verify request matching, read-only tool calls, session privacy and credential-free exports. They do not claim live MCP or animation quality validation. Production build and dist guard pass. The full production end-to-end suite was not run for these isolated development-lab changes.

The next required input is a valid `PIXELLAB_API_KEY_AGENT_DEV` in this worktree's ignored `.env`, updated locally by the owner. No credential was printed, copied into code, saved in evidence or requested in chat. After the owner confirms readiness, retry the free balance/schema checks, retrieve the custom authoring instructions, and only then determine whether the two-direction paid comparison fits the remaining eight generations. Board synchronization is still pending because project access remains unavailable; no board mutation was made.
