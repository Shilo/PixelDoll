# Research spike: Saavy paper-doll workflow

November 17, 2026. **Decision: keep PixelDoll's current equipment workflow.**

This spike compared painting equipment directly onto each body frame with PixelDoll's approach: design the item in a
standing pose, pose it for each move, and export it as a separate transparent layer. With direct painting, a mask keeps
pixels outside the selected region unchanged. The tradeoff is that extracting the painted region can carry body pixels
into the item layer, and equipment that extends beyond the body needs a wider mask. For swappable, layered equipment,
keeping the item separate is the better fit for PixelDoll.

We also checked whether PixelDoll should automatically protect visible hands when generating trousers. Neither of two
trouser designs covered a visible hand across 78 standing, idle, and walk frames on one character. That's a limited
sample, but it doesn't justify automatic hand cutouts, which could remove fabric where it correctly hides a hand. Revisit
if a future example shows a real overlap.
