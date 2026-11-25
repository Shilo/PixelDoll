# External mount art pilot

The East pilot shows that one generated riderless mount can carry two differently proportioned characters and a swappable boot layer at the same native pixel scale. It took a reviewed seated pose and a manual cutout for each body. The game supplied the mount frames and saddle positions. PixelDoll supplied the rider art, layers and pivot.

[Godot screenshot](godot-export-mount.png) · [Animated East comparison](east-pilot.gif) · [East rider swaps](rider-swap-review.png) · [South masked edits](south-rider-review.png) · [V3 turnaround](rotation-review.png) · [Current board card](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=307653465)

## What the art trials showed

- **East riderless and combined stills.** Inpaint V3 turned a loose pixel guide into an original lavender mount with an empty saddle. Masked editing on the actual saddle gave Rider A a bent knee and a foot at the stirrup. It preserved the previously saved side-facing head. The first broad-rider edit added armor. Locking the upper body and asking for a bare near leg kept its clothes and fixed the seated silhouette. That broader rider's foot still lands forward of the stirrup. Treat the pair as a placement success and a tack-fit warning.
- **East animation.** PixMiniMax returned the input plus eight new frames for both riderless and baked starts. The two echoed frames match all visible pixels of their respective inputs and were omitted from playback. Both sequences retained East and binary alpha. The riderless seat track moved from x=63 to 65 and y=63 to 66 on a 128-pixel cell. The lowest painted row varied by two pixels while the host ground origin stayed fixed. Track positions come from a color match to the visible saddle patch. They are candidate contact points for this clip, with no automatic anatomical guarantees.
- **East reuse.** The independent composites use the identical riderless mount frames. A hand-authored rider matte excludes visible saddle and flank pixels, and a separate boot layer changes the outfit. The baked control reads as one coordinated animal and rider. The independent route comes close in this view and retains the ability to swap riders and outfits. Neither route establishes how a generated cape, weapon or stirrup should behave for another body.
- **South overlap.** The generated riderless front view retained the animal's recognizable color, ears and tack. The tight edit kept the rough block shapes of the legs. Starting with a clean mount and opening the mask across the hips and flanks produced two visible legs, with the animal's face covering the rider's pelvis. For the Godot test, the South rider was hand-traced from that edit. The game draws the mount body, the exported rider, and then the original riderless mount face as foreground. All four inspected rider edits preserved visible pixels outside the submitted masks.

The masked directional probes failed on North and southeast. The rear view kept rough guide geometry, while southeast remained almost a profile. One Create Character V3 reference rotation, using the supplied South and East views, returned eight distinct facings for 2 generations. It preserved visible pixels in both supplied views. The six new views are readable, but the front and rear quarter views change how much saddle is exposed and need authored contacts, overlap and in-motion review. The lowest painted row across the eight stills varied by 2 pixels before any additional registration. [Masked turnaround](turn-review.png) · [V3 turnaround](rotation-review.png)

The V3 North art accepted a seated rear view with both legs down the sides. The southeast edit shows a visible near leg and hides the far one, but the boot and stirrup merge and the rider needs separation from the tack. These are baked stills. The southeast trial uses a different bench body because the wider East/South/North body has no stored southeast raster in that sheet. The art checks therefore cover those views individually and leave matched body continuity through turns open. [Rear and southeast rider edits](rear-and-diagonal-review.png)
The rider inputs were the existing Pro Flash East probe and bodies C and B from PixelDoll's bench fixtures. Guides and masks were drawn for this experiment. The supplied owl GIF was used as a quality reference and was never submitted as an input.

## Runtime checks

- The research driver ran the generated Phaser export's JavaScript core and the Studio placement implementation on 24 East combinations. It verified the 120 ms frame boundaries, loop wrap, shared mount pixels outside the rider region, and a fixed-seat negative control. The existing JavaScript manifest export retained the authored rider hip anchors.
- Godot 4.7.2 headless instantiated two real files emitted by PixelDoll's export pipeline. The host script sampled fixed mount frames, aligned both exported rider nodes to the same seat track and changed the exported boot in every phase. It checked placement, visibility and animation state. A separate Godot OpenGL run captured the actual viewport with the two East riders, the boot swap, and Rider B facing South. A pixel check on that final panel confirmed the mount foreground covers the rider. Hiding the foreground changed the checked pixel. South is a still pose for Rider B.
- Existing tests passed: 15 mount-preview unit cases, 16 Phaser export unit cases and four mount-related Studio end-to-end cases. The Studio end-to-end cases used the checked-in schematic. The generated mount remains a research fixture outside Studio's built-in mount picker.

No application or public API change is required for the East example. The host aligns the rider pivot to the sampled mount seat minus the rider contact relative to that pivot. The atlas anchor uses a pixel index, so the Godot host adds half a pixel on each axis before doing the pivot calculation. Ground contact remains fixed for world sorting. The useful next Studio improvement is to review a rider against real mount artwork and optionally save reviewed contact data per facing with the riding pose. Existing export anchors are sufficient for this experiment. A dedicated API lookup becomes worthwhile if repeated integrations show ambiguity or duplication in retrieving contact. Continue to let the host own mount frames, ground, saddle, foreground and tack. For South, a foreground part can preserve the creature's face independently of the rider.

## Reproduce the free checks

From the repository root, with Python and Pillow available:

```text
python docs/research/2026-11-25-owl-mount-pilot/prepare_review.py
node --experimental-transform-types docs/research/2026-11-25-owl-mount-pilot/validate_host.mjs
```

Pass an empty output directory as the optional argument to `validate_host.mjs` to write the Godot project. Run the Godot console executable with `--headless --path <directory> --editor --import --quit`, then with `--headless --path <directory> --quit-after 120 --script verify.gd`. The expected marker is `GODOT_EXTERNAL_MOUNT_PASS`. For the screenshot and overlap check, run with a display using `--path <directory> --quit-after 180 --script capture.gd`. The expected marker is `GODOT_MOUNT_CAPTURE_PASS` and the resulting `godot-export-mount.png` is written into that project directory.

The export and capture follow-up used the existing artwork and incurred no additional PixelLab charges. The next quality gate is a reviewed turn with mount and rider facings that actually match, plus fittings for ordinary wardrobe art beyond the authored boot. For buying or commissioning a production fixture, request transparent source cells, consistent camera and scale, a frame-by-frame seat, one fixed ground origin, a separate foreground where the seat is occluded, and explicit redistribution rights.

## Spend and promotion gate

PixelLab receipts total **114 of 300 authorized generations** across 14 completed jobs. The first inpaint submission returned HTTP 422 before acceptance because the trial payload used the wrong size shape. Its corrected submission cost 10 generations. All other paid requests were distinct reviewed experiments. [Request parameters and usage](requests.json)

The East proof qualifies separate placement and one authored outfit swap. For a production fixture, finish the per-facing foreground and seat data, fit ordinary wardrobe items to the riding pose, and verify loop transitions with one consistent character across the turnaround. The evidence supports generating the base art and commissioning the remaining pixel cleanup and separation.
