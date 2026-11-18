# Research spike: Saavy paper-doll workflow

November 17, 2026. **Decision: keep PixelDoll's equipment workflow.** Saavy's masked repainting protects untouched body
pixels and offers ideas for targeted repairs. It does not make a better default for swappable equipment. Two checks we
tried on PixelDoll output, hand overlap and disappearing colors, produced false alarms rather than actionable defects.

## Where the workflows differ

Saavy paints equipment onto each body frame inside a mask. The mask can use pose landmarks to exclude predicted hands
and forearms. Pixels outside the mask stay unchanged, and the painter sees the actual body pose. This works well when
the goal is to dress one particular character within a known region.

PixelDoll designs an item on standing views, uses the character's rig to pose it for each move, and extracts it as a
transparent layer over the unchanged body. It can also use masked repainting to repair selected frames, with the
standing design for the same direction as a reference.

The tradeoff is **preserving the body outside a mask versus separating the item inside it**. Extracting the painted
region can bring body pixels along with the equipment, even when the composite looks right. That limits layering and
reuse. Tight default masks also need adjustment for equipment that extends beyond the silhouette. Wider custom masks
can address the coverage problem, but they do not by themselves separate the item from the body. The trial runs used
different bodies, directions, and clips, so they do not establish which approach is cheaper or faster for the same job.

## What the checks found

**Hand overlap.** We inspected two trouser designs on one PixelDoll character: standing, idle, and walk in three
independently drawn directions, for 78 cells total. A probe flagged candidate pixels using wrist landmarks and skin
color. A visual check found no covered visible hand. The largest flagged patch, six pixels in a side-view walk frame,
was thigh skin misidentified as a hand; the near hand stayed visible. The sample does not establish a failure rate and
did not cover other skin tones, gloves, or crossed hands. Keep automatic hand cutouts off: a landmark alone cannot tell
whether loose fabric should cover the far hand. Revisit with a saved example of an actual paint-over.

**Disappearing colors.** We tried flagging colors that were present in most frames of a clip but missing from one. The
per-layer check raised four flags across 72 layer-clips, all on swords whose blades moved between front and back layers.
Checking the combined item instead yielded zero flags across 45 item-clips. The check did catch deliberately removed
colors, but it found no real defect in that sample. PixelDoll already checks for missing detail colors against the
standing design for the same direction. Don't add a second warning until a saved example shows it catches something
the existing check misses.

## Ideas to revisit only with a concrete failure

| Idea | Decision |
| --- | --- |
| Use an approved motion frame as a repair reference | Try it if the standing design repeatedly fails to repair a pose-specific detail, such as a fold visible only when a limb bends. Compare both references on the same saved failure. |
| Repaint only newly exposed pixels after a mask change | Defer. PixelDoll already repairs selected frames. A smaller edit region is worth testing only if the current repair changes nearby pixels that should stay untouched. |
| Stop later paid standing-design calls after an empty first call | Keep the current behavior for now. When standing directions span several calls, the later batches use the first result as a style reference, but they may still produce usable views even if it came back empty. The spike did not observe an empty first `edit-animation-v2` design from PixelDoll. Revisit after a real case is captured. |

For the paid-call idea, the narrowest change to test offline is stopping only when **every** view from the first call is
empty, not when one view is legitimately hidden or another quality warning appears. Keep the paid result, show what was
skipped, and let the user retry explicitly. Also test the opposite case: one usable view should let the remaining calls
continue. Neither change was implemented in this spike.
