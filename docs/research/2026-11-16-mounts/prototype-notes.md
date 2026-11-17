# Mount comparison prototype

Prepare the riding pose, not a permanent hole shaped like one particular horse. Keep mounts separate. At runtime, attach the rider to a seat and cover only the rider pixels actually behind the mount.

Start with mount-back, rider, mount-front. Add a separate far-leg pass only where needed. Exporting prepared part masks still permits dynamic runtime composition. Preparation is not the same as baking rider and mount together.

## Interactive comparison

[Comparison](mount-methods.html) uses hand-defined schematic pixels, not generated art:

1. Whole rider over mount, then foreground neck. The far leg can sit on top.
2. Permanently omit the far leg. Changing mounts cannot restore an exposed boot.
3. Preserve far leg behind mount, torso and near leg in front, then foreground neck. The current mount silhouette hides only overlapping far-leg pixels.

Eight schematic facings, three shapes, width, sampled movement frames, standing/riding pose and ownership highlighting are adjustable. Front/back intentionally have no far-leg distinction. Standing demonstrates that ordering cannot create bent knees. Wide mounts deliberately expose pose mismatch.

This is not automatic segmentation, a wardrobe test, a production API or qualified eight-direction/isometric artwork. Ownership labels are supplied by hand. Seat bob is sampled, not a production animation scheduler. No automatic fitting, cloth draping, segmentation accuracy or engine parity is claimed.

## Limits

- A fixed pose has a particular leg spread and hand reach. Translation and masking cannot fit every saddle.
- A mount alpha mask applied blindly to the whole rider erases the near leg too. Ownership and depth remain separate requirements.
- Front/back needs suitable lap and neck overlap. Robes, capes, wings, reins and weapons may need additional passes or reviewed masks.
- Preserve pivots; translate a wrapper so equipment alignment survives.

## Evidence and next step

The [architecture comparison](architecture-comparison.md) contains source links and council objections. MapleStory community-client and OpenStarbound findings support prepared sitting art, anchors and front/back ordering. LPC uses donor-pose crops and leg interleaving with clothing limitations. The inspected third-party Graal asset uses whole short-legged action cells, not generic leg clipping. ClassicUO uses mounted groups; its chair shear is separate.

No inspected precedent proves arbitrary flat riders on arbitrary mounts automatically. The corrected synthetic radius test leaves skeleton-guided masks a candidate, not proven or disproven.

Compare foreground-only, reviewed masks and skeleton-seeded masks on identical real seated art across directions, proportions, outfits and plausible seat widths. Measure incorrect hiding, far-leg remnants, contact and human corrections. Try donor poses first. Paid generations require separate approval.

## Prototype checks

An in-memory JavaScript software-raster harness exercised 288 combinations of direction, shape, pose, width and movement frame without exceptions. It checked nonempty outputs and state updates, verified that the default side-view methods differ, and that whole-rider and split composition agree in front/back views. This is a narrow compositor check, not visual quality ground truth.

HTML previews rendered at 728 px dark and 390 px light with no reported console messages. Production app checks, native exports and paid generations were not run because production behavior is unchanged.
