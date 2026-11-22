# Cross-review

After the independent work, each lane reviewed the competing designs adversarially. They ran the PoC and wrote attack tests in their own scratch folders.

Full write-ups:
- [B-challenge.md](B-challenge.md): the Sonnet independent lead attacking the PoC design and defending its own.
- [A4-challenge.md](A4-challenge.md): the protocol researcher ranking the PoC design, its own multi-value-register design and the Sonnet lead's design.

The scratch tests they cite were not kept, except for one: the randomized 3-device test, adopted as [poc/fuzz.test.ts](../poc/fuzz.test.ts).

## Designs compared

- **X (PoC):**
  - immutable content-addressed revisions per character, forming a DAG
  - one heads file per device
  - packed artwork
  - deterministic three-way merge at sync time
  - conflicts kept as notes
- **A' (protocol researcher):**
  - per-device state files overwritten in place
  - per-key multi-value registers with version vectors
  - no history
- **Y (Sonnet lead):**
  - per-device, per-character head files with a version vector
  - a single locally stored merge base
  - conflicts forked into sibling copy items
  - one file per artwork cell, with packing deferred
  - Google Drive first

## Findings and what was done about them

| # | Finding (by whom) | Verified? | Action |
| --- | --- | --- | --- |
| 1 | X walked the whole history to find a common ancestor. A phone catching up after 150 desktop syncs made 151 sequential downloads (B). | Yes, reproduced | **Fixed in the PoC.** Revision file names carry depth and parents, so one listing yields the graph and only the merged bodies are downloaded. Test: 8 requests, 2 downloads. |
| 2 | X stores a full manifest per revision: ~126-142 KB gzipped for a large character (A4, B; lead measured 139 KB). | Yes | **Fixed in the PoC.** Items are stored as separate content-addressed objects (git trees). A one-field edit now adds 15 KB instead of 142 KB (test). Retention and pruning are still to be built (roadmap). B's earlier "2.5-3 MB per revision" was a whole-workspace figure, not per character. |
| 3 | After a wiped folder, X never repaired missing files automatically; the PoC's test re-queued uploads by hand (A4). | Yes | **Fixed in the PoC.** A device whose own heads file has vanished forgets its remote knowledge and re-uploads, first listing what exists to skip it. Provider switch uses the same step. |
| 4 | Y with a single stored base silently reverts edits with only two devices (A4, scratch test). | Reported with a reproduction, not rerun by the lead | Y rejected as specified. B conceded that its sibling-copy conflicts do not converge and adopted X's deterministic merge. |
| 5 | Per-file artwork makes a Drive restore cost ~15M quota units (everyone, from the benchmark) | Yes | Packing in v1. B and A4 both changed position to agree. |
| 6 | The PoC verifies cells by byte hash, but PixelDoll keys cells by decoded-RGBA hash, so it would reject every real cell (A4, B, A1). | Yes | Production must decode and hash pixels, or store a byte hash beside the pixel hash. In the roadmap. |
| 7 | The PoC keeps its revision cache in memory (A4) | Yes | Production stores revisions and item objects in the `pixeldoll-sync` database. |
| 8 | Mixing frames from two devices passes silently; QA, provenance, frameEdits, baseCut and dressed go stale (A4, B) | Yes | Production marks a merged clip for review and reruns the offline item checks. In D and the roadmap. |
| 9 | Renames: item ids are name slugs and outfit ids change on rename, so a rename merges as remove plus add (B) | Yes | Random, permanent item ids and rename-stable outfit ids (roadmap step 3). |
| 10 | Criss-cross merges have several common ancestors; X picks one deterministically. Neither fuzz run (B: 150 seeds, A4: 300 runs) found a loss, but that is not a proof (A4, B). | Open | Track it. If a real case shows up, use git's recursive strategy and merge the ancestors into a virtual base. |
| 11 | Repeated browser clears leave dead device files. A cold restore read 25 heads files and 4.7 MB after 10 clears; dead heads also block pruning (A4). | Yes, as a cost | Add a "Forget this device" action. Treat a heads file whose revisions are all ancestors of live heads as absorbed, and stop reading it. |
| 12 | On Drive, `get(path)` needs a name query (100 units) before the download (200) unless file ids are cached (B) | Yes | The Drive adapter caches ids from listings and keeps flat folders. Benchmark request counts assume that. |
| 13 | One pack per push; a fresh device reads one header per pack; orphaned cells in packs can't be reclaimed (B) | Yes | Compact small packs and garbage-collect with a grace period (roadmap step 7). Optionally list each new pack's index in the revision that introduced it. |

## Rankings after cross-review

- **A4:** X first. A' is the fallback only if X's revision growth proves unmanageable. Y rejected as specified.
- **B:** take X's DAG, deterministic merge, notes, device heads and packs, and keep B's provider-neutral adapter, never-auto-delete rule and retained ZIP export. **Still prefers Google Drive first**, for its 15 GB free tier against Dropbox's 2 GB. This disagreement stays open (see the README).
- **C (challenger):** independently recommended Dropbox first, packs, and immutable versions plus heads. It did not take part in the cross-review round.
