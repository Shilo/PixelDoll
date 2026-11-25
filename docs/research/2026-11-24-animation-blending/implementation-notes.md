# Moving attack implementation notes

## Offline gate

At Waist 0, the 64 px bodyA Walk/Slash sets layer in South, East, and North at the reviewed floors (8 / 4 / 2 px). The manually tracked demo South diagnostic layers, and the stock demo falls back for lack of hip geometry. Larger cells scale the same proportions: 128 px gives 11 / 6 / 3 and 256 px gives 22 / 11 / 6. Fit searches within one pixel per axis of registered hips and prefers a shared-shift-compliant result when the seam is within 1 px of the best. See [gate results](gate-results.md) for limits and measurements.

The [historical hand and gear contact sheet](evidence/24-bodyA-hands-trousers-cape.png) shows bodyA South Walk 1, Slash 1, and a layered diagnostic with synthetic trousers and a contrasting background cape. The walking hand at `(23,48)` is absent from the lower fragment; the slash hand at `(38,46)` remains in the upper fragment. Lower clothing is drawn whole, with normal z deciding which upper clothing covers its waistband. Only lower gear that has complete attack art but incomplete walk art causes gear loss. Gear missing attack art stays hidden in both modes, and the Live notice stays visible.

The pixel-center anchor convention matches `mounts.ts`: `frame.x + hip[0] + 0.5 - rig.pivot.x`, with the corresponding y formula. Anchor indices reflect as `w - 1 - x` before `+0.5`; normalized joint coordinates reflect as `1 - x`. Below-waist pixels go to the nearest stored arm or leg segment, and upper seam measurements exclude arm-owned pixels. Cells without complete chains use the documented ankle-component fallback while remaining hip-bound. Small residual body fragments are cleaned up only adjacent to removed leg pixels, without removing identified arm pixels or unrelated small components.

An invalid tracked hip prefers measured, then requested hips that intersect the silhouette; failing those, it clamps to the nearest occupied row and pixel. A 2 px error can still land inside opaque art and pass while putting the join in the wrong anatomical place. Bonequin East and West are cardinal facings. Walk 4 now has a measurable join, but both sets still fall back because their worst seam is 13 px. South and North layer all 48 pairs with the real outfit; see [real data and Studio screenshots](REAL-DATA.md).

For eligible sets, Live uses stable padding around the same world pivot at the same scene scale. Engine controllers translate independent sprites instead. Turning or stopping in Live freezes the last matching gait cell until the action ends. A newly unsupported outfit can switch the action to full exactly once; restoring support does not switch it back. Palette changes and switches do not intentionally change a latched verdict.

On Bonequin, enabling layering increased the Phaser ZIP by 87,632 bytes (+7.9%) in review and 87,671 bytes (+7.93%) in the fixed rerun. Eligible exports add body fragment PNGs and reference existing sheets for unchanged equipment; configured attacks record omissions by facing. The checkbox is off by default regardless of Live. The final synthetic eight-by-eight sets measured about 15.8 ms cold / 0.08 ms warm at 64 px and 12.4 ms cold / 0.29 ms warm at 128 px in Node. These are single-run compositor timings, not browser frame-rate benchmarks.

From `app/`, run `node --experimental-transform-types ../docs/research/2026-11-24-animation-blending/offline-gate.mjs` to reproduce the per-facing output.

## Independent Live views changes

Grounded attacks on foot scale travel and gait to 80% through one factor shared by destination reach and movement integration. Attack timing stays at its authored rate. Airborne characters, mounts and riding poses use their existing rates.

Mounted rendering resolves the mount from travel facing and the rider from the presented clip. The mount keeps its own gait and locomotion-facing standing height. The rider uses the attack's facing and hip contact and is placed at the seat. Preview and Mount settings pass their selected viewing angle separately from the presented rider. Live framing includes the possible combinations so an aimed attack does not reframe the scene.
