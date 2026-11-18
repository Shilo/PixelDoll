# Static move authoring: feasibility decision

Create a pose, not a playback override. A **Static pose** stores one body cell and one fitted cell per item per authored direction. Existing animations keep their timelines. Qualify Ride first; Sitting needs its own pose recipe. Keep canonical Walk animated so Studio and RPG Maker do not treat a stride still as a gait.

## What holds up

- **Storage and exports:** The existing timeline can reference one cell. The dressed Default fixture exercises that shape through export builders, but does not prove dressed Ride or native engine playback. No new public schema is proposed. Publish the chosen image, joints and fitted layers together as cell zero. Record the selected raw frame in the generation job so recovery uses the same candidate without another paid request.
- **Equipment blocker:** `reusesStanding` lets an item with a standing design reuse it on a one-cell clip. Cell count cannot distinguish a bent pose from the standing reference. Audit the one-cell shortcuts and prove reuse requires the actual standing reference before enabling new static poses.
- **Current cost:** The standard skeleton route sends at least three frames. For Ride, trimming to one cell does not cut the 2-generation render charge. Measuring only the retained body candidate could save an estimated 0.2 generations per independently generated direction. This is not a lower item-render price or a guarantee after repairs.
- **Unproven alternative:** PixelLab's [live OpenAPI](https://api.pixellab.ai/v2/openapi.json) documents one target frame when `animate-with-skeleton-v3` receives a custom `rig`. The hierarchy can map joints to existing humanoid labels. The checked-in API contract does not cover this option, and the live spec does not quote a one-frame price. Qualify it separately before claiming any savings.

## Go/no-go trial

1. **Offline first:** Use a non-standing one-cell fixture to prove separately fitted gear with decoded pixels, mirror and replacement integrity, no paid resend on recovery, and a held mounted pose while the mount moves. Keep animated Ride as the control. Check both in native engines before claiming engine parity.
2. **One East body, then one existing item if it passes:** Correct the target skeleton first. Require an upright torso, near leg down the flank and appropriate far-leg occlusion, not a chair-sit. Confirm a posable standing reference, a suitable mount reference, the request count and the approved spend before submitting. Compare actual usage and dressed quality with the current route. No retries, paid fallback or broader batch without approval.
3. **Expand only if justified:** A lower bill per accepted, dressed pose is the cost gate. One side view cannot qualify front, back or diagonals, other mount shapes or occupied hands. If the cost is unchanged but the still solves an authoring need, consider it without advertising savings.

Sol medium and OpenCode Go DeepSeek Flash low reviewed the existing pipeline. The focused export and presentation tests passed (60 tests). No paid trial or native engine run was performed for this decision. Animate rider was removed; see the [historical playback experiment](application-playback.md).
