# Brief: shared-body batch generation and deterministic layer extraction

2026-11-24. Branch `research/batch-item-extraction`, worktree `C:\Users\shilo\.local\share\opencode\worktree\ecf412\batch-item-spike`. Research only: no paid PixelLab calls, no token use, no app code changes.

Read first: [`../2026-11-24-batch-item-generation/README.md`](../2026-11-24-batch-item-generation/README.md) and its findings. That spike established that PixelLab has no public multi-item layer call, that PixelDoll's default per-item skeleton route costs 9 generations per item per move, and that a shared-body call costs about 19 generations for any number of items but returns one composite.

## The question

The owner wants a batch mode where several items are drawn on one body in one paid call, with three safeguards:

1. The user chooses separate versus batch generation.
2. The app shows every generated image, so the user can see what overlaps.
3. Auto-batching only groups items that are in different slots and do not overlap, warns that animation can introduce overlap later, and tells the user which items were grouped.

The extra complication the owner raised: after a shared-body generation, PixelDoll has to recover each item's layer with a deterministic script. PixelLab may have its own internal extraction model, but PixelDoll cannot use it. Can deterministic extraction work, especially across animation frames where shape, silhouette and palette change, and where items may overlap?

Answer three questions:

1. **Is deterministic per-item extraction from a shared composite viable at all?** Measure the ceiling on accepted art, then add realistic drift. Cover disjoint items (the auto-batch-safe case) and items that overlap only in some frames or directions.
2. **Can the app predict which items are safe to batch before paying?** Build and validate a detector using only the standing layers, slots and keypoints, against known move frames. Report false-safe and false-unsafe rates.
3. **If viable, what is the safest product design and fallback?** Show grouped items, previews, overlap warnings, per-item verification, and what happens when extraction or QA fails.

## Data and tools

- Fixture: `app/public/fixtures/s2/` (64 px, 3 stored directions, walk 8 frames, cross-punch 6 frames). Sheets are horizontal: 8 or 6 columns per direction, 3 rows (south, east, north), 64 px cells. Items: body base, hair, helmet, wizard hat (walk only), vest, cape, sword.
- Manifest: `app/public/fixtures/s2/fixture.json` has slots, layers, animations and draw order. The slot ladder is `app/src/lib/items/slots.ts`.
- Python 3.14 with Pillow 13 is available. Node 24 is available but this worktree has no `node_modules`; do not run `npm install`. Use Python for measurements, or pure Node with built-in modules only.
- Keep scripts, outputs and notes under `docs/research/2026-11-24-batch-extraction/`. Do not write into `app/`.
- Public sources only for external claims. Do not speculate about PixelLab's private internals.

## Rules

- No paid calls. No credentials.
- Prefer measurements on stored art over opinion. Mark every inferred number.
- The deliverable is evidence and a recommendation, not app code.
- American English, no em dashes.
