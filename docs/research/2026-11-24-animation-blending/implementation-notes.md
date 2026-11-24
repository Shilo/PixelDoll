# Moving attack implementation notes

## Offline gate

At Waist 0, bodyA Walk/Slash South, East, and North qualify, as does the manually tracked demo South diagnostic. The unmodified demo stays full-body for lack of hip geometry. The set gate requires worst ≤ 8 px and median ≤ 4 px across all reachable pairs; missing hips, an unusable split, or undrawable required equipment still cause a full-body fallback. The fit stays bounded to ±1 px from rounded hip registration on both axes, not from zero. Authored hip motion remains. The ceiling is based on the worst-frame visuals, where the remaining seam shows clothing overlap rather than torso slide. See [gate results](gate-results.md) for measurements and [original Slash 5 versus the composite](evidence/27-south-slash-source-vs-composite-8x.png) for the source-art hand check.

The [hand and gear contact sheet](evidence/24-bodyA-hands-trousers-cape.png) shows bodyA South Walk 1, Slash 1, and the layered result with synthetic trousers and a contrasting background cape. The walking hand at `(23,48)` is absent from the lower fragment; the slash hand at `(38,46)` remains in the upper fragment. The trousers span two rows above the split. Lower clothing is drawn whole, with normal z deciding which upper clothing covers its waistband.

The pixel-center anchor convention matches `mounts.ts`: `frame.x + hip[0] + 0.5 - rig.pivot.x`, with the corresponding y formula. Anchor indices reflect as `w - 1 - x` before `+0.5`; normalized joint coordinates reflect as `1 - x`. Below-waist pixels go to the nearest stored arm or leg segment, and upper seam measurements exclude arm-owned pixels. Cells without complete chains use the documented ankle-component fallback while remaining hip-bound. Small residual body fragments are cleaned up only adjacent to removed leg pixels, without removing identified arm pixels or unrelated small components.

For eligible sets, Live uses stable padding around the same world pivot at the same scene scale. Engine controllers translate independent sprites instead. Turning or stopping in Live freezes the last matching gait cell until the action ends. A newly unsupported outfit can switch the action to full exactly once; restoring support does not switch it back. Palette changes and switches do not intentionally change a latched verdict.

The current Phaser ZIP for bodyA with synthetic gear is 116,783 bytes with layering off and 130,971 bytes with it on (+14,188 bytes, about 12%). Eligible exports add two body fragment PNGs for this fixture and reference existing sheets for unchanged equipment. The checkbox is off by default regardless of Live. A synthetic eight-by-eight set measured about 5.6 ms cold / 0.08 ms per warm paint at 64 px and 11.3 ms cold / 0.55 ms warm at 128 px in Node. These are single-run compositor timings, not browser frame-rate benchmarks.

From `app/`, run `node --experimental-transform-types ../docs/research/2026-11-24-animation-blending/offline-gate.mjs` to reproduce the per-facing output.

## Independent Live views changes

Grounded attacks on foot scale travel and gait to 80% through one factor shared by destination reach and movement integration. Attack timing stays at its authored rate. Airborne characters, mounts and riding poses use their existing rates.

Mounted rendering resolves the mount from travel facing and the rider from the presented clip. The mount keeps its own gait and locomotion-facing standing height. The rider uses the attack's facing and hip contact and is placed at the seat. Preview and Mount settings pass their selected viewing angle separately from the presented rider. Live framing includes the possible combinations so an aimed attack does not reframe the scene.
