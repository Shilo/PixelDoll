# Mount seating and occlusion

PixelDoll Studio previews a character on a schematic mount. The same placement and draw order apply in Mount settings, Preview, the live views, and character selection. See the [Studio walkthrough](../research/2026-11-16-mounts/try-the-preview.md).

The current masking is an interim Studio preview. It handles seat adjustments and keeps separate equipment intact, with known limits in how it assigns rider pixels to each layer. Use the limits below as the starting point for future work.

## Seat position

- The mount frame supplies a ground point and a saddle point in its own pixel grid. The mount follows travel facing and plays its own gait. The rider can face an attack while seated on a mount facing elsewhere.
- The rider supplies a contact point in its displayed frame. Studio prefers the reviewed contact when it matches the art and uses the hip anchor, measured joints, or a standing-height estimate when needed. For an animated move, the contact comes from the first displayed timeline cell so the rider retains the motion of the other cells.
- **Seat position** adds a signed offset per displayed mount facing. X moves right and Y moves down. **Automatic** uses `(0, 0)`. The offset translates the rider and the marker together. The mount artwork and ground point stay fixed, and the same integer placement applies to the rider’s front and back pixels.
- The seat editor previews unsaved adjustments per facing. Save applies them, Cancel discards the draft, and the settings can be edited with the rider hidden. Saved mount offsets and reviewed rider contacts have separate [manifest fields](../manifest-spec.md#rider-seat-contact).

## Rider pixels

**Hide leg** controls which visible rider pixels may go behind the mount body. **None** leaves the rider whole. **Far leg** uses the displayed frame’s joints and rig mirroring to identify the far leg. Ambiguous overlaps stay in front. North and South have no unique far leg. **Both legs** starts with the full region below the hips so wide feet and bent legs are covered. The forearm guard and visible equipment exclusions preserve pixels in that region. A Riding State keeps its authored pose whole. Missing or invalid geometry leaves the rider whole and can produce a Studio notice.

The split uses the exact cell and available outfit that Studio composed. It respects hidden slots, depth, pivots, mirrored cells, tucking, and body cuts. Leg, footwear, and underwear slots can follow the legs, including custom slots with those behavior profiles. Visible contributions from held items, capes, belts, and other slots stay in the main rider pass. If translucent leg artwork mixes with visible protected equipment, the mixed pixel stays in front. This avoids cutting an equipment silhouette simply because it crosses the leg region.

## Mount layers

Use one pixel grid per facing and gait frame. All mount images in that frame share dimensions, origin, ground, and seat coordinates. Studio composites in this order:

1. Optional mount underlay, such as a far-side leg or a platform surface.
2. Eligible rider leg pixels at the adjusted rider position.
3. Mount body art that can cover those leg pixels.
4. Remaining rider pixels, including protected equipment.
5. Optional foreground detail, such as a pommel that passes in front of the rider.

The mount body’s alpha determines coverage at each pixel. A saddle can cover the far leg where its body overlaps. A cockpit can cover both legs with its wall in the body layer. A standing platform can put its surface in the underlay so rider legs remain visible. Transparent gaps stay open. Above and beside the mount, the leg passes remain visible, even when the seat offset is far from Automatic. The seat coordinates alone cannot establish a mount’s occlusion or the rider’s anatomical fit.

## Known limits and follow-up

- **Far leg** can leave fragments of wide or overlapping legs in front of the mount when the joints cannot distinguish the parts. **Both legs** can move artwork baked into the lower base image behind the mount because that base has no part labels.
- Non-leg equipment stays in the main rider layer. A far-side sword or cape can therefore appear in front of the mount body. A garment drawn as a single torso layer stays together even when its hem covers the legs. Reviewed rider-part masks and per-part depth are candidates for improving these cases.
- The seat offset translates the rider. Straight legs stay straight, so feet can protrude below the belly or show through gaps even at Automatic. A riding pose supplies the bend, and prepared mount layers supply the occlusion.
- Studio ships one schematic mount. The draw order was exercised with illustrative saddle, cockpit, and platform frames, and the rider checks used stored demo art with synthetic joint measurements. Arbitrary rider anatomy and production mount artwork still need qualification. Custom mount import, automatic fit, and mount masking in game exports are separate work. Game hosts can use the exported seat and contact metadata to place their own art.
