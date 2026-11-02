# Custom Skeleton v3: current documentation check

Checked November 1, 2026. Documentation and code inspection only: no account generation calls, no credits spent, no application behavior changed. This supplements the [October qualification results](2026-10-28-motion-targeted-authoring.md).

## Decision

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
