# Mount-owned reins and tack

Status: proposed, not a public API. [Tracking card](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=309427127).

## Decision

Use **reins** for the lines a rider holds. Use **tack** for the broader set of riding equipment, such as a bridle, harness or handlebars. The mount owns its tack; the rider supplies reviewed grips where the pose supports them. A standing rider does not become a convincing mounted rider by drawing a line to its wrist or rotating its torso.

Start with three choices for each mount asset: no tack, tack drawn into the mount artwork, or optional dynamic reins. No tack is the default. Reins are not required on non-horse mounts. A harness or bridle can work where anatomically appropriate; a machine can have drawn handlebars; a creature without suitable grips or attachment points needs no procedural line. Keep one upright astride rider pose across compatible mounts. Allow an alternative pose later where seat fit fails. Do not rotate, stretch, scale or hide rider limbs to make a line meet a target.

## Authoring and development workflow

1. **Mount artist:** Author each usable facing and gait frame with a seat, artwork behind/in front of the rider, and, for dynamic reins, one or two reviewed bit or harness attachment points. Store those points in the mount asset's frame-local coordinates. Mark the intended draw pass for each line. Consider a separate stowed-tack layer if wanted when hands are occupied.
2. **Rider artist:** Review a seated grip for each supported facing and rider cell. Use the rig's hand anchors as a starting point, not proof of a fist center. Approve only points on the intended grip pixels, and verify near/far ownership, including mirrors. Do not claim poses without reviewed grips support hand-held reins.
3. **Game developer:** Sample the mount and rider independently. Position the rider by aligning its contact point with the current mount seat; apply that same transform to rider grips. Transform mount attachment points using the current mount frame's origin. Draw each active line between the resulting stage points on its authored pass. Sample current endpoints even when the rider holds one cell; the mount's head may move independently of the seat. Use integer pixel placement and a thin straight line first. No rope simulation.
4. **Studio user:** Prototype this with an explicitly tack-enabled test mount and a qualified Ride pose. Do not add a global reins toggle or require tack metadata for mounting. If an attachment, matching facing, or usable grip is missing, render the mount and rider without the dynamic line.

## Proposed contract, not implemented

| Owner | Minimum input | Failure behavior |
| --- | --- | --- |
| Mount | Current frame, seat, back/front artwork, named optional tack anchors, line draw pass | No line if the anchor or draw pass is absent |
| Rider | Current published clip, direction and cell, reviewed grip in the same coordinate space as the seated rider, hand state (free, gripping or occupied) | Require gripping and suppress that grip when equipped gear occupies it; do not swap hands or route around weapons automatically |
| Host | World transform for both sprites, pixel-space draw and occlusion order | Keep authored tack or no tack when interleaving is unsupported |

Treat a rein as a pair of endpoints with a named role, not as a new wardrobe slot. For a qualified two-line side view, the far line can sit behind the rider or neck while the near line can sit in front of them. The exact pass depends on the artwork. Axial and diagonal views need separate review; a mirror must reverse pixel coordinates and apply an explicit near/far mapping rather than renaming the character's left and right hands implicitly. If only one line remains usable, draw it only when the asset explicitly qualifies that one-handed composition. Otherwise suppress the dynamic reins or show the optional authored stowed layer.

Dynamic line drawing costs no PixelLab generations. New astride art and fitted items are separate costs. The export continues to ship rider pixels and playback data, not mount art, tack physics or a ride controller. Start with a host integration recipe and explicit local data. If repeated implementations uncover a missing rider operation, specify a small read-only grip/contact lookup and prove parity before exposing it publicly. See [the existing external mount contract](external-mount-api.md) and [runtime parity requirements](../../architecture/javascript-runtime.md).

## Qualification and stop conditions

- Start with one reviewed East astride still and one real mount whose head moves relative to its seat. Confirm the line lands on visible grip and tack pixels and holds contact throughout the gait, without crossing the face or torso. Use the [schematic probe](../2026-11-17-static-rider-fitting/universal-results.md) for geometry only.
- Add a compact mount, a tall or long-necked mount, and a non-horse mount with no reins. Verify missing attachment data does not borrow points or arms from another facing. Refuse unsuitable seat fit; do not hide it behind a line.
- Check mirrored West, independent West, then axial and diagonal occlusion. Compare empty hands, a weapon, a cape and a long garment. A glitch in hand ownership, visibility or overlap fails that asset/facing rather than falling back to loose procedural guesses.
- Verify identical endpoint placement and layer intent in the Studio probe and a real engine integration before suggesting a public API. If dynamic lines do not read better than authored tack at native sprite size, keep authored tack and stop.

The original visual comparison favored upright Ride plus reins over rotation. Its source rider was chair-seated and its mount schematic, so that result justifies a bounded prototype, not broad release or anatomy qualification.
