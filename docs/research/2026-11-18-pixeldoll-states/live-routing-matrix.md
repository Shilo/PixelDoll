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

These are request, receipt, geometry, and decode checks. They do not qualify the production account, every size and facing combination, reference-edit quality, equipment alignment, or native playback. No pixel-fit or silhouette guarantee follows from a successful request.

## On-demand joint fitting

Joint fitting belongs in Create Move, where the user actually needs the State as an animation source. It is a separate quote, not an automatic charge for every generated State. The user reviews joint placement before saving, and saving does not fit equipment.

On the same local API, an isolated copy of a 64 px Pixen State was fitted after preparing its Standing references. Four `/estimate-skeleton` calls returned 18 joints per view, passed structural review, and billed 0.4 generations for the State checks. Reopening the quote before saving cost zero and produced no additional request attempts. The saved pose resolved as a Move source in all four directions. This did not generate a Move or test gear or export playback.

The follow-up eight-frame Cast check stopped before animation because the isolated fixture had no registered character rig. PixelDoll still responded on port 5199, but the local PixelLab API on port 8000 stopped accepting connections during rig setup. The setup ledger had nine canceled checks, three lost checks, and no provider job receipts. No lost request was resent. State-to-Move generation, gear, and playback remain unverified.
