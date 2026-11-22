# A4 cross-challenge: my design A' vs Design X (revision DAG PoC) vs Design Y (per-device head files)

Date: 2026-11-22. No repo files were changed. What I ran:
- `node --test` in `docs/research/2026-11-22-storage-sync/poc/`: 30 of 30 pass.
- Three scratch tests in this folder:
  - `x-fuzz.test.ts`: 300 random seeds, 3 devices, random edits and syncs, lagging listings.
  - `x-growth.test.ts`: storage growth and dead device ids.
  - `y-base.mts`: Design Y's merge with one stored base vs one base per peer.

Names: **A'** = my design (one state file per device per character, multi-value registers plus a version vector). **X** = the PoC. **Y** = per-device head files with a locally stored base.

## Measured results

1. **X fuzz (300 seeds, 3 devices, lagging listings):**
   - All devices converged on every seed.
   - **0 lost writes.** "Lost" here means a value no device had overwritten that is missing from both the body and the conflict notes.
   - On average 7.1 conflict notes per run stay open, from about 33 edits over 6 fields. I did not measure how many of those are spurious.
2. **X storage growth:**
   - One revision for a 3,456-cell character (12 items x 6 moves x 8 directions x 6 frames) is about 126 KB gzipped, because the hash strings barely compress.
   - **50 one-field edits added 6.4 MB of revisions, against 2.9 MB of artwork in packs.**
   - Scaling linearly, a 76,800-cell character is about 2.8 MB per synced revision, kept until pruned. The PoC has no pruning.
3. **X with dead device ids:**
   - After 10 browser clears (11 heads files), an idle sync is still 1 request, thanks to the ETag cache.
   - A cold restore made 25 gets and downloaded 4.7 MB: every dead device's head revision is fetched, and each is a full manifest.
4. **Y with a single stored base silently loses edits, even with only 2 devices.**
   - Sequence: A sets f=1, B concurrently sets g=1, A merges then sets f=2, B (still unaware of A) sets g=2.
   - The merge on A gives `{f:0, g:2}` with **0 conflicts**. Both of A's edits to f are silently reverted.
   - Using the last-seen copy of B's file as the base instead gives the correct `{f:2, g:2}`.
   - Cause: three-way merge is only correct against a real common ancestor. One stored base per record is not that ancestor.

## Topic by topic

| Topic | X | A' (mine) | Y |
|---|---|---|---|
| **Simplest to get correct** | It already exists, passes 30 tests and survived my fuzz. Generic `merge3` about 100 lines, engine about 440 | Not built. Needs a codec from manifest to keys and back, version stamps per key, edit-wins resurrection, and its own tests | Looks simplest, but is **wrong as specified** (result 4) |
| **Save-path changes** | None. It diffs against the stored base at sync time | **None needed.** My first report said to assign version stamps inside the save transaction; that was unnecessary. Diffing the last-synced state at sync time works, as X does | None |
| **Many dead device ids** | Idle sync stays cheap. Cold restore downloads one full-manifest revision per dead head, and dead heads stop history from being pruned. Fix: delete any heads file whose heads are all ancestors of a live head (any device may do this safely) | One full state file per dead device per character, plus a version-vector entry forever. Fix: delete any device file whose version vector is dominated by a live one | Same as A', but it needs per-peer bases, so local storage holds one base copy per dead peer |
| **Storage growth** | **Worst.** A full manifest per sync, kept until pruned (result 2). Fix: store each item as its own content-addressed object, git-tree style, so a one-field edit uploads about one item instead of the whole character | Bounded: each file is overwritten. Each sync still uploads the full state, and stamps per key add roughly 15% | Bounded: overwritten |
| **Criss-cross merges** | Picks a single common ancestor (deepest, ties broken by id), not git's recursive merge. The fuzz found no loss or divergence, but there is no proof, and the open notes may include repeat conflicts | **Cannot happen.** The merge is a lattice join with no ancestor lookup | No history graph. Per-peer bases cause spurious conflicts with 3 or more devices |
| **Deleted or corrupted remote file** | Hash checks mean corrupt files are never applied. But there is **no automatic repair**: test T8 needs a manual "back up everything again" that assumes every revision is still in local storage. A deleted heads file is not rewritten until the heads change, because push compares against its cache. Revisions are in memory in the PoC; **the real app must store them in IndexedDB** or re-download ancestors on every reload to find common ancestors | Self-healing for live devices: the owner rewrites its file from local state on every sync. A corrupt dead-device file loses only what nobody else already merged | Like A' |
| **History and restore** | **Yes**, until pruned. Pruning an ancestor turns later merges into two-way merges, which means many conflict notes but no silent loss | **No.** That is where mine loses. It would need separate snapshots | No |
| **Frame-mix check** | Frame lists merge by position **silently**: T3 treats a mixed clip as success. Needs about 10 lines in `merge3` to report lists where both sides changed different frames | Detectable from per-cell stamps, but I had not built the flag either | Depends on its merge granularity, which is unspecified |
| **Slug item ids that collide** | **Handled and tested**: two items added under one id are both kept, the second under a derived id | **Missing from my design.** Two different "Helmet" items would blend cell by cell, with no conflict wherever their cells do not overlap. That is a silent quality bug | "Sibling copy" only covers same-field conflicts, not two creations under one id |
| **Outfit ids that change on rename** | A concurrent rename and edit leaves two outfits. No loss, but a duplicate | Same | Same |
| **Deterministic winner** | Yes (higher revision id wins) | Yes (wall time, then device id) | **No.** "Keep ours plus a sibling copy" makes each device keep a different main value forever, and the copies multiply: it never converges |
| **Artwork transfer** | Packs: 86 requests per restore | **I proposed one file per blob, which loses here.** Using the Drive cost figure from another agent: 77,000 downloads x 200 quota units = about 15.4 million units per full restore, so about 26 restores per day for the whole project's 400 million unit allowance. Mine should adopt packs | One file per blob: the same problem |

## Where my design honestly loses
- It has no history or "restore previous version".
- It is not built, and X is built and fuzz-clean.
- It needs a per-key schema codec and stamp metadata.
- It missed slug-id collisions, which would blend two items silently.
- It used one file per blob, which is unaffordable on Drive's quota.
- My first report's "assign stamps in the save transaction" was an unnecessary save-path change.

Its real advantages:
- No history graph is needed to merge, so there is no common-ancestor lookup, no criss-cross case, no revision cache to keep in IndexedDB, and no history growth.
- Concurrency is exact with any number of devices.

## Ranked verdict
1. **X, with fixes.** It is the simplest *correct* option because it exists and holds up under adversarial testing. Required before shipping:
   - (a) verify blobs by decoding to RGBA and hashing. PixelDoll keys blobs by the hash of decoded RGBA pixels, but the PoC hashes PNG bytes, so `ensureBlobs` would reject every real cell;
   - (b) store the revision cache in IndexedDB;
   - (c) store items as content-addressed sub-objects to stop the 126 KB to 2.8 MB growth per sync;
   - (d) a pruning policy, plus deletion of heads files that are ancestors of live heads;
   - (e) flag mixed clips in `merge3` and re-run the offline item checks;
   - (f) an automatic repair pass that re-uploads missing or corrupt revisions and packs, and rewrites a missing heads file.
2. **A' (mine).** The cleanest merge semantics, but more new code, no history, and it needs both of X's packing and collision rules added. Only worth choosing if X's revision cache and growth prove unmanageable.
3. **Y as specified: reject.** It silently loses edits with a single base, never converges with "keep ours", and costs about 77,000 requests per restore. Fixing it (per-peer bases, a deterministic winner, packs) turns it into a weaker A'.
