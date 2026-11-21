# State routing live checks

November 21, 2026. These requests used the configured localhost PixelLab API, not the public production account. Counts are billed generations from job receipts, not estimates.

| Route | Input | Result | Generations |
| --- | --- | --- | ---: |
| `create-character-state` | Normally generated 64 px character; local source matched its three drawn views against the provider; text only | One submit; durable child receipt; all eight nonempty 64 × 64 provider rotations downloaded | 10 |
| `edit-images-v2` | 160 px cells, five drawn facings in a 480 × 320 sheet, with reference | Five views decoded at original dimensions | 25 |
| `edit-animation-v2` | 192 px cells, five drawn facings, text only | Batches of three and two; all five views decoded | 50 |
| `transfer-outfit-v2` | 192 px cells, five drawn facings, with reference | Batches of three and two; all five views decoded | 50 |
| `edit-image-pixen` | One 256 × 256 view, text only | One view decoded at original dimensions | 1 |
| `edit-image-pro-flash` | One 256 × 256 view, text only | One view decoded at original dimensions | 9 |

The managed preflight did not match three other normally generated samples: each had a visible pixel mismatch. A stored character ID alone is not proof that the remote art matches the local Standing art.

During the outfit transfer check, a dev reload interrupted the harness after its first batch. The first receipt was recovered, and only the previously unsent second batch was submitted manually. This does not qualify Studio's partial-attempt recovery.

These localhost runs checked requests, receipts, geometry, and decoding. They do not establish reference-edit quality, equipment alignment, or native playback. No pixel-fit or silhouette guarantee follows from a successful request.

## On-demand joint fitting

Joint fitting belongs in Create Move, where the user actually needs the State as an animation source. It is a separate quote, not an automatic charge for every generated State. The user reviews joint placement before saving, and saving does not fit equipment.

On the same local API, an isolated copy of a 64 px Pixen State was fitted after preparing its Standing references. Four `/estimate-skeleton` calls returned 18 joints per view, passed structural review, and billed 0.4 generations for the State checks. Reopening the quote before saving cost zero and produced no additional request attempts. The saved pose resolved as a Move source in all four directions. This did not generate a Move or test gear or export playback.

The localhost eight-frame Cast check stopped before animation because the isolated fixture had no registered character rig. PixelDoll still responded on port 5199, but the local PixelLab API on port 8000 stopped accepting connections during rig setup. The setup ledger had nine canceled checks, three lost checks, and no provider job receipts. No lost request was resent.

## Production API checks

November 21, 2026. A separate production credential authenticated while the localhost provider was unavailable. The local edit cases below used PixelDoll's planner, transport builder, and decoder. USD amounts are rounded from completed job receipts; they are not the generation estimates shown in Studio.

| Route | Input | Decoded result | Billed usage |
| --- | --- | --- | ---: |
| `create-character-state` | Normally generated registered 96 px V3 parent, text only | Child receipt; eight nonempty 96 × 96 rotation PNGs | Not recorded |
| `edit-images-v2` | 96 px, four facings, text only | Four 96 × 96 views | $0.0806 |
| `edit-images-v2` | 96 px, eight facings with a reference, 384 × 192 sheet | Eight 96 × 96 views | $0.1158 |
| `edit-animation-v2` | 192 px, five facings, text only | Five 192 × 192 views in batches of three and two | $0.3013 |
| `transfer-outfit-v2` | 192 px, five facings with a reference | Five 192 × 192 views in batches of three and two | $0.3013 |
| `edit-image-pixen` | 96 px, four facings, text only | Four 96 × 96 views | 1 gen |
| `edit-image-pro-flash` | 96 px, four facings with a reference | Four 96 × 96 views | $0.0332 |
| `edit-image-pro-flash` | 256 px, one facing, text only | One 256 × 256 view | $0.0451 |

Production Pro Flash reported object-shaped sizes, custom canvases from 32 to 256 px in increments of four, and text or single-reference editing. The quoted estimates at 64, 96, 128, and 256 px were 5, 5, 6, and 9 gens for the tested requests. A subsequent GET-only check fetched all eight managed child rotations without redirects. Their response headers allowed both the local agent origin and the published app origin. In a browser on the agent origin, all eight fetched and decoded as nonempty 96 × 96 images using the app's decoder and rotation fetch options. This did not exercise Studio's pending-attempt reload.

A direct `animate-with-skeleton-v3` Cast request used the managed child's south-facing art and its 18 measured joints. It returned eight nonempty 96 × 96 frames. The character remained recognizable, but the potion disappeared in some frames. This verifies production transport for one facing, not consistent props, Studio save and playback, or native export.

Separately, the mocked Studio reload test verified that saving uses the child's pixels rather than the parent's, with no additional POST after reload. Production Studio recovery and the full State-to-Move review, save, reload, and playback flow are still open, as are partial-batch continuation, broader live size and price coverage, equipment alignment, and native playback.
