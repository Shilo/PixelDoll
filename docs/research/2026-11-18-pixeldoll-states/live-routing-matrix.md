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

These are request, receipt, geometry, and decode checks. They do not qualify the production account, every size and facing combination, reference-edit quality, new State joint fitting, equipment alignment, or native playback. No pixel-fit or silhouette guarantee follows from a successful request.
