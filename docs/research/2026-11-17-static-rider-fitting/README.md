# Static rider fitting spike

November 17, 2026. Branch: `spike/static-rider-fitting`. The geometry probe is research only. The [playback experiment](application-playback.md) was removed: authored Ride animations play normally while mounted. Static move authoring is a separate proposal. No public API, generator, export or schema changes. No new paid requests.

Tracking: [external mount qualification](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=307653465).

## Reusable-pose follow-up

The [multi-mount prototype](universal-rider.html) compares the same local astride target on three synthetic mounts in eight directions. It includes independently moving neck endpoints, optional tack, rider-size stress tests and an explicit leg-only override. [Results, limitations and review response](universal-results.md). This extends the investigation, not the application's behavior. It does not establish a universal pose or correct the existing chair-sit artwork.

## Decision

**Worth pursuing:** one deliberately astride still per direction, upright torso, near leg down the flank, appropriate far-leg occlusion, elbows relaxed and hands forward; optional reins drawn as the mount's tack. Bent knees alone are insufficient. The rider stays rigid and follows the existing seat translation while the mount animates.

**Do not implement:** general automatic whole-rider rotation until both hands touch a horse. It does not solve arbitrary reach, moves the legs, and tips front/back sprites sideways instead of producing a forward lean. A small artist-approved side-view lean remains possible; this result does not ban every rotation effect.

**Do not add automatic pose-fitting settings.** The initial spike deferred all new settings until a seated still was qualified. The user's subsequent implementation request authorizes a narrow playback choice in the existing Mount menu, not a new pose/fitting workflow. A one-cell timeline can describe a static pose; rendering need not require a new asset type. The existing Ride action requests the same skeleton three times, but generated images can still differ. Holding the first stored timeline entry is not a claim that it is a reviewed seated pose.

## What we tested

The saved [East Ride strip](../2026-11-16-mounts/evidence/mount-live-east-raw-strip.png) contains three 64 x 64 paid frames. We used each independently as a static candidate. No live database was modified and no frame was regenerated. The original trial retained a quality warning; these are exploratory assets, not approved anatomy.

[Interactive comparison](comparison.html) compares upright Ride, a 15-degree bounded hip fit, unrestricted hip fit, and upright Ride with reins. Choose each static source, all four mount gait phases, and East or an explicitly mirrored West. It contains 96 generated images, but only 12 distinct source/method layouts: the gait phases translate together and West reflects East. These are not 96 independent visual qualifications. [Contact sheet](evidence/comparison.png) has these four columns, three source-cell rows, at gait phase zero. Source pixels are never changed. No leg-hiding mask is used, so rotation cannot conceal foot movement behind a crop.

Hip (32.5, 43.5), near grip (37.5, 39.5), far grip (44.5, 37.5), and foot samples are **manual illustrative annotations**, approximately +/-2 pixels. They are not the saved measured skeleton or reviewed fist centers. We verified the grip samples land on opaque source artwork in all three cells. Opaque does not establish semantic hand ownership. The research renderer uses pixel-center/edge coordinates consistently and nearest-neighbor inverse mapping. It is not a production compositor or RotSprite implementation.

The schematic mount uses the current application fixture at standing height 34. Neck-contact targets and the bit endpoint are manually annotated for this fixture, not new production metadata. West is a reflection of the complete East experiment, not independent western qualification or an anatomical-label swap.

## Acceptance rules, chosen before comparing candidates

- A generic fit must keep the hip seated, both grips within 1 source pixel of the chosen targets, and feet within 1 pixel of the unrotated seated pose. These are conservative research gates, not measured standards for riding.
- A static rider must not play its three source images as an animation. Mount motion may translate the entire rider at the seat.
- Reins must retain their two endpoints through gait changes, preserve mirrored geometry, and leave the rider image untouched. Endpoint mathematics is necessary but not sufficient: visible contact, depth and equipment interference require visual review.
- Front/back must not be declared qualified by reflecting East, passing geometry checks, or drawing a rope over standing artwork.

## Results

### Rigid hip rotation

With the selected neck-contact targets, the bounded least-squares solution reaches its 15-degree limit and still misses the worst hand by 11.78 pixels. Unrestricted rotation chooses about 38.14 degrees, still misses by 10.42 pixels, and moves the sampled feet up to 6.17 pixels. All four gait phases give the same local fit because this schematic's neck and seat bob together. [Measurements and provenance](evidence/measurements.json).

These hand-error numbers illustrate selected neck targets, not a general rotation-quality score. The chosen targets already mismatch hand reach and separation. They do not prove that no saddle grip could ever work. The stronger general result is geometric: rotation preserves each hip-to-hand radius and the separation between hands. A differently shaped mount can violate those invariants. In this example the near-hand radial mismatch alone is 10.29 pixels. Allowing +/-2 pixels on each coordinate of both grip and hip gives a worst-case radial uncertainty of 4sqrt(2), or 5.66 pixels. The remaining 4.63 pixels still cannot meet the 1-pixel gate. The solver minimizes the sum of squared errors, not worst-hand error; the radial bound establishes failure independently of that objective.

The bounded 15-degree candidate also moves the sampled feet by 2.46 pixels. With the sampled foot radius, the conservative 1-pixel preservation gate rejects rotations above approximately 6.1 degrees by construction. That gate protects the existing leg placement; it is not independent evidence that every larger artist-authored lean is wrong.

At North/South, an image-plane 20-degree rotation moves a head 20 pixels above its hip sideways by 6.84 pixels. Forward pitching around a horizontal body axis is not that motion. At diagonals, a flat rotation still cannot recover foreshortening or reveal the unseen side of the torso. For an unpitched true side view it can approximate a lean, but that restricted case does not establish a general eight-direction fitting method.

The nearest-neighbor comparison shows changed contours in the tilted riders; the unrestricted candidate reads as leaning down over the neck, with its feet swept backward. Palette-preserving resampling does not guarantee preservation of one-pixel features. We did not measure outline topology or compare RotSprite, since neither can repair the contact invariants or North/South projection error.

### Static Ride plus reins

The upright candidate retains the saved bent legs. Reins bridge the gap without moving the rider's head, hips or feet. This looks more plausible than forcing the hands onto the neck in this East-only schematic comparison. However, the saved art reads as a chair-sit, with thighs forward and feet high in front of the saddle, not a convincing astride pose. Reins do not correct that anatomy or supply a near leg down the flank. Both legs still use the existing unsplit rider artwork. The horse is a schematic, not a qualified real mount.

The reins are an illustrative 1-pixel rasterized curve with a fixed 2-pixel sag, not rope physics or a new setting. A straight line and the curve both pass endpoint/mirror tests. Sag is not necessary for endpoint fitting and is not selected as a production requirement. Because this fixture's bit and seat share the same bob, there is no changing local rein shape, only whole-group translation. We therefore do not claim independent head motion or natural tension was tested.

The far line is drawn behind the rider, the near line after the mount foreground. That split is illustrative for East and reflected West only. No generic depth table, weapon-hand inference, opaque-hand attachment or automatic finger placement is implemented. A weapon occupies a hand; a robe or cape can obscure the line. These remain explicit integration gates, not successful cases.

### Direction coverage

- **East:** real saved rider, three alternative static cells, four schematic gait phases, four methods. Exploratory visual review only.
- **West:** complete East comparison reflected. Mirror consistency, not independent asset correctness.
- **N, S, NE, NW, SE, SW:** analytic rotation/endpoint controls and existing requested Ride skeleton checks only. No newly generated seated artwork; no visual acceptance.

## Council challenge and coordinator response

Opus 5.5, medium, recommended rejecting generic hip rotation, reusing Ride rather than introducing a new pose type, and considering mount-owned reins only on seated art. Those recommendations agree with the offline comparison.

We challenged four broader claims rather than accepting every finding:

1. **"Ride already is a static pose":** true of its requested target skeletons, false as a guarantee about generated cells or playback. The raw images vary; the comparison freezes one selected source cell. A future static implementation must explicitly store/select a still.
2. **"West swaps handedness":** not an acceptable integration rule here. Existing geometry reflection deliberately preserves anatomical labels. Reflect coordinates and explicit rein ownership together; do not add a blanket left/right-label swap. This experiment reflects the whole composite and proves no production ownership rule.
3. **"Flat rotation is exact in side view":** only under a suitable unpitched view model; PixelDoll includes pitched/oblique artwork. Do not promote that conditional example to camera-independent fitting.
4. **"No slack curve":** no physics is needed, agreed. A tiny fixed curve is cheap to compare offline, but is optional appearance, not proof of realism or a required feature.

An equitation description can inform pose direction but cannot certify stylized art. We do not use informal posture guidance, a three-point angle, or a hand point lying on opaque pixels as anatomical ground truth.

## Reproduce

From the repository root, with its existing Node 24 toolchain:

    node docs/research/2026-11-17-static-rider-fitting/spike.mts
    node --test docs/research/2026-11-17-static-rider-fitting/test.mts

The research harness has 11 passing tests: radial invariants, solvable/impossible controls, bounded fitting against independent brute-force sampling, screen-rotation arithmetic, 256 rein endpoint/mirror combinations, eight-direction requested skeletons using synthetic rest geometry, annotation uncertainty, real-art grip opacity, malformed-input rejection, decoding all 96 output images against an independent pixel-reflection oracle, and comparison control selection in a mocked DOM. An initial endpoint test caught floating-point endpoint drift in the experimental curve; returning exact copied endpoints fixes it without relaxing the assertion. The mock control test is not a real browser interaction test.

The standalone comparison rendered at 728 pixels in dark appearance and 390 pixels in light appearance without console errors. Opus's second read-only source and image review found no blocking correctness defects. We accepted its evidence-scope, hip-and-grip uncertainty, foot-gate and chair-sit corrections. We retain the narrower conclusion: this warrants one astride still plus reins experiment, not production integration or universal rejection of artist-approved leaning.

No production checks or full application suites are required for this docs-only isolated spike. None is represented as new production coverage. The current application was already green before this branch.

## Primary sources

- [MDN Canvas rotate](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/rotate): image-plane transform about an explicitly translated origin, not a 3D pose reconstruction.
- [MDN imageSmoothingEnabled](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingEnabled): smoothing control, not a topology-preservation guarantee.
- [Aseprite rotation algorithms](https://aseprite.org/docs/rotate/): distinguishes fast rotation and RotSprite. We do not claim the research renderer implements RotSprite.
- [Spine IK constraints](https://en.esotericsoftware.com/spine-ik-constraints): one/two-bone target solving acts on a skeleton. PixelDoll's composed raster is not a separable skeletal mesh.
- [Unity Two Bone IK](https://docs.unity3d.com/Packages/com.unity.animation.rigging@1.3/manual/constraints/TwoBoneIKConstraint.html): target and hint controls on a root/mid/tip chain, not proof that an arbitrary sprite can reach both targets.
- [Existing Ride targets](../../../app/src/lib/rig/poses.ts) and [Studio mount placement](../../../app/src/studio/experience/mounts.ts): actual application behavior, not new API proposals.

## Next gate, not implemented

Use one reviewed East astride Ride still in a local Studio experiment with explicit hand grips and mount-bit metadata, then test real mount head motion and occupied/free hands. Require the near leg down the flank and appropriate far-leg occlusion, not merely bent knees. Keep other directions unavailable until individually authored and reviewed. If it succeeds, qualify static seated artwork in all eight views and pose the equipment onto that move. Do not pay for all eight directions, add a generic rotation setting, or alter production mount behavior based on this exploratory mockup alone.
