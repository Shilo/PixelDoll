# Blind animation review

You are reviewing pixel-art character animations for a game asset tool. Each sheet shows one view (south = facing the
viewer, east = facing right) of the same bald, unclothed humanoid performing the same requested action:
**"{ACTION}"**. Rows are labeled X, Y, Z (sometimes W) at the left; each row is one candidate animation, frames left to
right, shown at 4x. Rows are shuffled per sheet; a letter means nothing across sheets. You do not know how any row was
made, and you must not guess or look for that information. Judge only what you see.

Files: the sheet PNGs listed below. Do not open any other file in the folder or elsewhere.

For every sheet, score each row 1-5 on:

1. Action read: would a player recognize "{ACTION}" from these frames alone? Clear anticipation, main movement and
   recovery?
2. Anatomy and identity: same body, proportions and face across frames; no extra, missing, stretched or melted limbs; no
   invented props, weapons or effects.
3. Facing and hand: stays facing the stated view; the striking hand is consistent.
4. Stability: no jitter, size pumping, sliding feet or sudden pose pops between neighbouring frames.

Then list **critical defects** per row (any one makes the clip unusable as shipped game art): wrong or unreadable action,
extra/missing/broken anatomy, invented object or effect, facing flip, frame that collapses or tears. Finally rank the
rows of each sheet best to worst (ties allowed only if you truly cannot separate them) and say in one sentence why the
winner wins.

Be strict and concrete: cite frame numbers (1-based, left to right). Do not soften. Output a compact table per sheet
followed by the ranking, then a short overall note about which row letters were consistently strong or weak **within each
sheet only**.
