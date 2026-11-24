# Moving attack implementation notes

## Offline gate

The set gate admits bodyA Walk/Slash South and North at Waist 0. East stays full. It admits only when every reachable cell pair has a finite seam of at most 4 px and all needed outfit layers can be drawn. The horizontal fit is bounded to ±5 px. Vertical correction is at most ±1 px from rounded hip registration, not from zero: authored hip movement remains. The score adds the displacements of the two horizontal pelvis edges.

| Recorded set or diagnostic | Worst / median seam by facing (px) | Pass at 4 px |
| --- | --- | --- |
| A Walk/Slash | South 4/3, East 6/3, North 3/2 | South, North |
| B Walk/Walk | South 5/4, SE 7/3, East no join/4, NE 7/4, North 5/3, NW 5/3, West no join/4, SW 8/4 | None |
| C Walk/Walk | South 3/1, East 10/2, North 3/1, West 10/1.5 | South, North (diagnostic only) |
| N Walk/Walk | South 13/11, East 24/9, North 12/8, West 22/8.5 | None |
| Demo Walk/Cross punch | South 6/3 with manual diagnostic hips | None; stock demo has no usable tracked hips |

At 2 px neither recorded attack facing would pass. In the [South montage](evidence/22-set-gate-bodyA-south.png), rows are walk cells and columns are slash cells. The 4 px worst pair is walk 1 / slash 0 (`dx=1`, `dy=1`, zero hip departure); the waist remains connected. [North](evidence/22-set-gate-bodyA-north.png) stays connected with a 3 px worst seam (`dx=-1`, `dy=1`, zero departure). [East](evidence/22-set-gate-bodyA-east.png) exceeds the limit (`dx=1`, `dy=3`, departure `+1` on its worst pair). That makes 4 px useful for this evidence, not a general claim about unseen attacks. B, C and N lack recorded attacks; their Walk/Walk entries cannot validate attack quality.

The [hand and gear contact sheet](evidence/24-bodyA-hands-trousers-cape.png) shows bodyA South walk 1, slash 1, and the layered result with synthetic trousers and a contrasting background cape. The walking hand at `(23,48)` is absent from the lower fragment; the slash hand at `(38,46)` remains in the upper fragment. The trousers span two rows above the split. The old reject-on-crop rule would exclude that item at Waist 0; the whole walking sheet keeps its waistband. A low-z cape remains behind the walking legs, unlike the old whole-stack draw order. Lower clothing is drawn whole, with normal z deciding which upper clothing covers its waistband.

The pixel-center anchor convention matches `mounts.ts`: `frame.x + hip[0] + 0.5 - rig.pivot.x`, with the corresponding y formula. Anchor indices reflect as `w - 1 - x` before `+0.5`; normalized joint coordinates reflect as `1 - x`. Below-waist pixels go to the nearest stored arm or leg segment; cells without complete chains use the documented ankle-component fallback. Small residual body fragments are cleaned up only adjacent to removed leg pixels, without removing identified arm pixels or unrelated small components.

The dressed South set uses a 74×68 buffer with pivot `(37,62)` around the original 64×64 pivot `(32,60)`. Live places the expanded buffer around the same world pivot using the same scene scale; all cells use the same padding. Engine controllers translate independent sprites instead. Turning or stopping in Live freezes the last matching gait cell until the action ends. A newly unsupported outfit can switch the action to full exactly once; restoring support does not switch it back. Palette changes and switches do not intentionally change a latched verdict.

Measured with the recorded bodyA atlas and the synthetic gear fixtures, the Phaser ZIP increased from 116,521 to 130,631 bytes with the Export checkbox enabled (+14,110 bytes, 12.1%). The two new PNGs are body fragments; unchanged equipment paths point at existing source sheets. The checkbox is off by default regardless of Live. A synthetic eight-by-eight set measured about 6.5 ms cold / 0.11 ms per warm paint at 64 px and 17.5 ms cold / 0.41 ms warm at 128 px in Node. These are single-run compositor timings, not browser frame-rate benchmarks.

From `app/`, run `node --experimental-transform-types ../docs/research/2026-11-24-animation-blending/offline-gate.mjs` to reproduce the per-facing output.

## Independent Live views changes

Grounded attacks on foot scale travel and gait to 80% through one factor shared by destination reach and movement integration. Attack timing stays at its authored rate. Airborne characters, mounts and riding poses use their existing rates.

Mounted rendering resolves the mount from travel facing and the rider from the presented clip. The mount keeps its own gait and locomotion-facing standing height. The rider uses the attack's facing and hip contact and is placed at the seat. Preview and Mount settings pass their selected viewing angle separately from the presented rider. Live framing includes the possible combinations so an aimed attack does not reframe the scene.
