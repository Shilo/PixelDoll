# South-first riding pose trial

A complete South rider generated on transparency is a useful starting point. In this trial, V3 supplied recognizable facings but changed the pose enough to make East and West stand. The direct East and wider South joint guides both read as seated on the same mount.

[Mounted comparison](mounted-comparison.png) · [Eight views from a complete South rider](clean-rotation-check.png) · [Eight views from the older hand cutout](hand-cut-rotation-check.png)

The follow-up used saved joints to generate the rider separately in every direction. See the [preset trials](preset/README.md) and the [live Studio turn and layered export](full-turn/README.md).

## What was tested

- **Rotate an extracted South rider.** V3 got the eight facings. The previous cutout had gaps where the mount had hidden the rider. The new views carried those gaps into other angles and added shadow-like shapes. The test input contained the cutout only.
- **Generate the South rider alone, then rotate it.** Skeleton V3 received Body C's standing South image, original joints, and three identical seated joint targets. The three returned frames are identical in their visible pixels. The complete transparent first frame went directly to V3 as its sole directional reference. V3 kept the visible pixels of the South input exactly. The East and West outputs stood with much straighter legs. East's topmost visible pixel also rose eight rows relative to the unrotated East standing reference in the same 80-pixel cell.
- **Generate East and widen South directly.** East's rider-only joint render bent the visible leg and placed the foot near the stirrup. The first South pose had mostly hidden lower legs on this mount. Moving the knees and feet outward in the joint target let both feet show. At the same rider offset, 153 of 345 opaque pixels below row 59 cleared the mount's face foreground, up from 15 of 237. This count is specific to the pictured pose and foreground. Both direct renders used only the character and joint positions.

The comparison uses unedited generated rider sprites. The game-side composition applies translation only, with the existing mount behind the rider and the separate face layer in front for South. The offsets were chosen for this visual check. It does not qualify automatic anchor fitting, usual wardrobe items, an eight-view riding animation, or mounting on a second saddle.

## Recommendation

Use a South chair or saddle image to preview the pose and help choose joint positions. Start with South for the user if that is the simplest view to mark. Generate the rider alone, then confirm a side view directly using joints. Treat V3's additional facings as drafts if a user wants that option. Keep the side pose and other critical views under per-facing review.

Five PixelLab jobs billed **9 generations**. The pilot total is now **123 of 300 authorized generations**. [Paid requests](requests.json)

Run `python docs/research/2026-11-25-owl-mount-pilot/rider-rotation/compare.py` from the repository root to recreate the mounted comparison and visibility counts. This uses Pillow and the saved frames and incurs no PixelLab charges.
