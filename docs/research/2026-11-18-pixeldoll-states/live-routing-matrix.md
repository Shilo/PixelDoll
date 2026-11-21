# State routing live checks

November 21, 2026. These requests used the configured localhost PixelLab API, not the public production account. Counts are billed generations from job receipts, not estimates.

| Route                    | Input                                                                                                          | Result                                                                                      | Generations |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------: |
| `create-character-state` | Normally generated 64 px character; local source matched its three drawn views against the provider; text only | One submit; durable child receipt; all eight nonempty 64 × 64 provider rotations downloaded |          10 |
| `edit-images-v2`         | 160 px cells, five drawn facings in a 480 × 320 sheet, with reference                                          | Five views decoded at original dimensions                                                   |          25 |
| `edit-animation-v2`      | 192 px cells, five drawn facings, text only                                                                    | Batches of three and two; all five views decoded                                            |          50 |
| `transfer-outfit-v2`     | 192 px cells, five drawn facings, with reference                                                               | Batches of three and two; all five views decoded                                            |          50 |
| `edit-image-pixen`       | One 256 × 256 view, text only                                                                                  | One view decoded at original dimensions                                                     |           1 |
| `edit-image-pro-flash`   | One 256 × 256 view, text only                                                                                  | One view decoded at original dimensions                                                     |           9 |

The managed preflight did not match three other normally generated samples: each had a visible pixel mismatch. A stored character ID alone is not proof that the remote art matches the local Standing art.

During the outfit transfer check, a dev reload interrupted the harness after its first batch. The first receipt was recovered, and only the previously unsent second batch was submitted manually. This does not qualify Studio's partial-attempt recovery.

These localhost runs checked requests, receipts, geometry, and decoding. They do not establish reference-edit quality, equipment alignment, or native playback. No pixel-fit or silhouette guarantee follows from a successful request.

## On-demand joint fitting

Joint fitting belongs in Create Move, where the user actually needs the State as an animation source. It is a separate quote, not an automatic charge for every generated State. The user reviews joint placement before saving, and saving does not fit equipment.

On the same local API, an isolated copy of a 64 px Pixen State was fitted after preparing its Standing references. Four `/estimate-skeleton` calls returned 18 joints per view, passed structural review, and billed 0.4 generations for the State checks. Reopening the quote before saving cost zero and produced no additional request attempts. The saved pose resolved as a Move source in all four directions. This did not generate a Move or test gear or export playback.

The localhost eight-frame Cast check stopped before animation because the isolated fixture had no registered character rig. PixelDoll still responded on port 5199, but the local PixelLab API on port 8000 stopped accepting connections during rig setup. The setup ledger had nine canceled checks, three lost checks, and no provider job receipts. No lost request was resent.

## Production API checks

November 21, 2026. A separate production credential authenticated while the localhost provider was unavailable. The local edit cases below used PixelDoll's planner, transport builder, and decoder. USD amounts are rounded from completed job receipts; they are not the generation estimates shown in Studio.

| Route                    | Input                                                    | Decoded result                                                           | Billed usage |
| ------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------ | -----------: |
| `create-character-state` | Normally generated registered 96 px V3 parent, text only | Completed receipt recovered by GET; eight nonempty 96 × 96 rotation PNGs |      $0.1100 |
| `edit-images-v2`         | 96 px, four facings, text only                           | Four 96 × 96 views                                                       |      $0.0806 |
| `edit-images-v2`         | 96 px, eight facings with a reference, 384 × 192 sheet   | Eight 96 × 96 views                                                      |      $0.1158 |
| `edit-animation-v2`      | 192 px, five facings, text only                          | Five 192 × 192 views in batches of three and two                         |      $0.3013 |
| `transfer-outfit-v2`     | 192 px, five facings with a reference                    | Five 192 × 192 views in batches of three and two                         |      $0.3013 |
| `edit-image-pixen`       | 96 px, four facings, text only                           | Four 96 × 96 views                                                       |        1 gen |
| `edit-image-pro-flash`   | 96 px, four facings with a reference                     | Four 96 × 96 views                                                       |      $0.0332 |
| `edit-image-pro-flash`   | 256 px, one facing, text only                            | One 256 × 256 view                                                       |      $0.0451 |

Production Pro Flash reported object-shaped sizes, custom canvases from 32 to 256 px in increments of four, and text or single-reference editing. The quoted estimates at 64, 96, 128, and 256 px were 5, 5, 6, and 9 gens for the tested requests. A subsequent GET-only check fetched all eight managed child rotations without redirects. Their response headers allowed both the local agent origin and the published app origin. In a browser on the agent origin, all eight fetched and decoded as nonempty 96 × 96 images using the app's decoder and rotation fetch options. This did not exercise Studio's pending-attempt reload.

A direct `animate-with-skeleton-v3` Cast request used the managed child's south-facing art and its 18 measured joints. It returned eight nonempty 96 × 96 frames. The character remained recognizable, but the potion disappeared in some frames. This verifies production transport for one facing, not consistent props, Studio save and playback, or native export.

Separately, the mocked Studio reload test verified that saving uses the child's pixels rather than the parent's, with no additional POST after reload.

## Production Studio: managed State to saved Move

On a registered 64 px character with three drawn facings and mirrored west, the ordinary Studio Standing art differed from the provider in 53, 19, and 28 visible pixels. Studio correctly proposed a local edit. To exercise the managed route without weakening that check, a disposable copy used the provider's exact Standing pixels with the existing matching silhouette and rig.

- Studio submitted one managed State ($0.0750), reloaded before Save, recovered the child into review, and saved it without a second submit.
- The saved State's joint fit quoted 0.3 generations and used one measurement per drawn facing. The three returned overlays each contained all 18 joints; the dots were on the sprite silhouettes. Saved joints did not change the State artwork.
- An authored Skeleton V3 Cast quoted 12 generations and returned eight frames per drawn facing ($0.0542 total in the three receipts). The submitted first-frame pixel hash and all 18 joints matched the fitted State for each direction. Studio reached review, saved the Move, reloaded it, and advanced through all eight playback cells. The State remained a separate single-cell clip.

This is one production character and one Move, not a visual quality guarantee for every pose, prop, size, or pricing band. The first production run did not include equipment.

### Follow-up equipment fit

Studio dressed a new red cloth cape on this character's Standing ($0.0804). The model changed some body pixels in the dressed reference; the appearance warning was accepted for this trial only. The cape then offered separate on-demand fits for Ready stance and Cast. The saved item covers three Standing cells, three Ready stance cells, and 24 Cast cells across south, east, and north. West remains mirrored.

- Ready stance: three Skeleton V3 item requests at $0.0312 total. All three fitted views passed the stored item checks with no reported shifted frames, clipping, or stray pixels.
- Cast: three Skeleton V3 item requests at $0.0432 total. All 24 drawn cells saved. The east item fit warned for four clipped and 27 stray pixels; south had 67 stray pixels without an item warning. Studio also surfaced the existing north body arm-joint difference of 2.2 px. No paid retry started.
- For both clips, the six ledger inputs matched the per-facing dressed Standing PNG bytes and the Standing reference joints. The submitted target joints matched the saved State or Move joints after the request builder's pose padding. A successful fit here establishes transport and coverage, not an appearance pass across all facings.

### Additional pricing and recovery checks

The [public MCP guide](https://api.pixellab.ai/mcp/docs), read on November 21, 2026, says the provider squares the artwork extent, adds 20% padding and uses a minimum of 32 px. One managed State costs 10 generations through 84 px of padded extent, 15 through 112 px, and 25 above that, regardless of direction count. Without a size override, the artwork cannot exceed the frame: a frame up to 70 px fits the 10-generation band, and a frame up to 93 px cannot exceed 15 generations. Above 93 px, Studio shows 10 to 25 rather than assuming how much of the frame the art fills. The completed 96 px job-status GET reported `usage.usd: 0.11` and no generation count, so it does not establish a generation band.

About 1 hour and 45 minutes after the original rotation downloads, GETs for the completed job and child detail still succeeded. All eight rotation PNGs matched their original downloads by SHA-256. An alternate free-tier credential received HTTP 403 for the child detail. This verifies read access for these two credentials against this one child, not generation entitlement, cancellation, or a general snapshot-retention guarantee.

GET-only production Pro Flash edit quotes for one image returned 5 gens at 32 × 32, 36 × 36, and 64 × 96; 6 at 96 × 192 and 160 × 160; and 9 at 192 × 256 and 252 × 256. The quote endpoint rejected 65 × 64, 28 × 32, and 260 × 256 with HTTP 422. These sample the size boundaries and price bands without generating images. They do not establish managed billing across all parent sizes.

The mocked Studio regression and a live production-provider test at 128 px both interrupted after the first Pro Flash POST. In the live run, the 18-generation quote covered two sheets. Reload resumed polling the first job without another POST. The new quote covered only the four remaining views (9 generations), and quoting itself sent no POST. Explicit approval sent exactly one further request. Save kept all eight views and cleared the attempt. The two receipts reported $0.0414321 and $0.0416729. This verifies request scope and recovery, not artwork quality. A batch reserved before its queue record is written cannot be retried when the outcome is uncertain.

A managed 128 px State on an existing eight-direction parent completed after one POST and returned eight 128 px rotations. Its job-status GET reported $0.145, with no generation count. The trial account could generate a State on its own 48 px parent. An immediate DELETE reported cancellation, and a later job-status GET still showed failed with $0 usage. The child nevertheless completed with eight views, and the account balance fell from 23 to 13 generations. This does not prove a refund, zero cost, or paid-tier cancellation behavior. No request was resent.

The southeast 128 px managed State yielded 18 measured joints and eight nonempty Cast frames from the exact State artwork. The direct API gear probe ran outside Studio using its request builder and chroma extractor. The dressed southeast Standing keyframe and Standing joints served as the reference for separate State and Cast fits. The State fit returned three frames ($0.01461; one reviewed), and the Cast fit returned eight ($0.02561). The cape followed the shoulders and did not touch the canvas edge, but residual pixels remained around the legs and raised hands. Chroma extraction left 196 pixels outside the largest connected component in the reviewed State and 24–115 per Cast frame; these counts include any legitimate disconnected cloth and are not Studio's quality-gate numbers. Visual review failed for clean alignment. No rerolls were sent.

An offline replay on the saved southeast receipts exercised the item extractor, slot cleanup, and core quality gates. Cleanup removed 34 pixels from the reviewed State and 385 across Cast. The State passed those automated checks; Cast did not. This replay used the measured State joints and requested Cast joints, not a full Studio publication, and an automated pass does not replace the visual review.

### Export evidence

The Godot 4.7.2, Unity 6000.4.0f1 Editor, and Phaser 3.80.1, 3.90.0, and 4.1.0 harnesses selected `ready-stance` from a running Move, held its single cell with marked artwork, and restarted the Move. Godot checked the mirrored facing; Phaser tested south in Canvas and WebGL and caught both looping and restart regressions with negative controls. The Phaser and Unity export fixtures opted into Play once; normal Studio exports still use the global playback preference. Installed Aseprite rendered the State's marked cells in three facings with the expected 150 ms durations, and the file has one repeat per State tag.

The GDevelop 5.6.285 editor core imported the project and its official web exporter produced a game that ran in the shipped GDJS/PIXI runtime. The south State showed its distinct body pixel, retained progress before 150 ms, restarted when selected again after completion, refused the unavailable east view, and switched back to the first Walk frame. This does not cover the desktop editor or desktop packaging.

Those harnesses use synthetic marked cells. A separate offline check rebuilt a body-only fixture from the retained production 96 px parent and child rotations and the direct south Cast. Generic, Aseprite, Phaser, GDevelop, Godot and Unity exports kept the State and Move distinct, matched every source State and Cast pixel in their shared layer sheets, and round-tripped the original cell hashes through the editable ZIP. Godot also played the exported Cast, switched to the State, held its cell, selected the southeast pose and restarted Cast. Aseprite rendered all eight State facings and eight Cast frames with the expected visible pixels, alpha and durations.

The exact dressed 64 px Ranger was later recovered from browser storage and saved as an editable workspace ZIP. The ZIP and native evidence are in the local `pixeldoll-states-dressed-live-2026-11-21` temporary directory, not the repository. Generic, Aseprite, Phaser, GDevelop, Godot and Unity preserved the body and cape cell maps and hashes when round-tripping that single character. Native Godot played both layers through Cast, switched to Ready stance, held, faced east and restarted Cast. Native Aseprite matched all 36 State and Cast frames across all four displayed facings. Phaser passed on the three versions above in Canvas and WebGL; Unity passed in Editor Play Mode and GPU verification, not a standalone Player. The shipped GDevelop web runtime advanced both layers in sync, held and replayed the State, faced east and restarted Cast. This export check preserves the artwork, including its original fit warnings; it does not certify the cape's appearance.

RPG Maker ignores walk-like States and diagonal-only gaits for both layouts. When multiple eligible gaits exist, the export picker lets the user choose one. The browser regression verifies that the downloaded notes name the unselected gait; the unit tests check the exported step pixels.
