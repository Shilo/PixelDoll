# B cross-challenge: attacking the PoC design (immutable revision DAG + per-device heads + packs)

Evidence: ran `node --test` in poc/ (29/29 pass), `node bench.ts small`, read engine.ts, merge.ts, dataset.ts, and wrote my own scratch tests (scratchpad/research/x/attack.test.ts, importing the poc modules by file URL).

## What I verified by running

1. Fuzz: 3 devices, 150 random seeds x 30 random edit/sync steps, per-device item edits plus a contested `name` field. Result: 0 failures. All three devices converged to identical records and no per-device edit was lost. Their deterministic merge (side A picked by revId, revision id = content hash) works for ordinary concurrency. I could not break convergence.
2. History walk cost: phone makes 1 edit offline, desktop makes 150 edit+sync cycles, phone syncs. Result: 151 sequential GETs for ONE catch-up merge. `ancestors()` in engine.ts walks the full history of both heads (only `isAncestor` is depth-pruned). Cost grows with how long a device was offline times how busy the other device was, and each GET is sequential.
3. Missing/pruned base: I deleted the base revision from the remote and the phone cache, desktop had deleted item3, phone renamed the character. The merge degrades to two-way, item3 is resurrected, but 2 conflict notes were raised (status `conflict`). So it is flagged, not silent loss. Still a resurrection the user did not ask for, and every pruned-ancestor merge behaves this way. The PoC has no prune routine at all, so retention policy (what is safe to prune) is unspecified.

## Where their design breaks or costs more than mine

- Storage growth: every save writes a full manifest revision. A manifest at the benchmark's large size (76,800 cells) is roughly 75 bytes per cell reference raw; hex hashes compress only to about half, so about 2.5-3 MB per revision (my estimate, not measured). 100 saves is about 250-300 MB, which swamps a 2 GB Dropbox Basic account. Mine (one head per device, overwritten) is bounded. They need squash and retention, plus reachability GC rooted in device heads.
- Pack growth: each push creates an immutable pack. A fresh device reads a header for every pack on every session start (`loadRemoteBlobIndex`: one ranged GET per pack). After many small pushes, that is hundreds of requests unless packs are compacted, and orphaned cells inside packs can never be reclaimed without repacking. PoC has no compaction.
- Integrity check is wrong for the real app: `sha256(bytes) === hash`. PixelDoll's artwork key is the sha256 of decoded RGBA, not of PNG bytes (fact 3 from the coordinator). Verifying a downloaded cell means decoding every PNG. The PoC's cheap check does not carry over.
- Item identity: ids are name slugs unique per device, and outfit ids change on rename. merge3 keys arrays by `id`. A rename on one device looks like remove+add, while the other device edited the old id: duplicates plus a conflict note. Add-add collisions are handled (keep both with a derived id); renames are not. Needs an immutable per-item `uid` (allowed: no backward-compat rule), or merge keyed on it.
- Mixed frames and stale QA: the positional merge of `items/<id>/layers/<id>/cells/<move>/<dir>` is a real win for "frame 1 vs frame 2" and the path shape matches the real `Layer.cells` type (manifest.ts lines 243-252). But the result is an animation whose frames were reviewed separately; `qa`, `provenance`, `frameEdits`, `baseCut`, `dressed`, `standing` are atomic or independently merged and may no longer describe the frames. The only semantic guard is `validate`, which checks references. A merged item must be demoted to `status: 'stale'` (or flagged for re-review) whenever frames from both sides are combined.
- Drive path addressing: their `Provider.get(path)` is path-based. On Drive every path resolves through a name query (list = 100 units) before download (200 units), and `revs/<record>/` means a folder per character. Real adapter must cache ids from listings and use one flat folder, or the request counts in the benchmark are optimistic.
- Criss-cross: LCA is "deepest, ties by id", a single ancestor. In a true criss-cross (two merges with different parent sets) there are several best ancestors; picking one can flip which side's value is live without telling the user. Notes persist so values are not lost, but live values can differ from what a user chose. I did not reproduce a loss (fuzz passed), so this is a design risk, not a demonstrated failure.
- Many devices after repeated browser clears: each clear mints a new device id and an immortal `devices/<id>.json`. Fresh devices fetch every stale head revision once per record. Mine has the same growth (per character x device) and is worse; theirs is one file per device. Both need a "forget device" action.

## Where mine is worse (and what I concede)

- My sibling-copy resolution is non-deterministic: each device that merges creates its own sibling item. Device A and B merging the same two heads produce different merged heads, which are concurrent with each other, so they merge again and can create duplicate siblings and ping-pong. Their content-addressed deterministic merge revision (A chosen by revId, conflict stored as notes) fixes this by construction. Adopt it.
- No history: mine overwrites the device head in place. Their immutable revisions give rollback, safe retry after torn writes, and free "undo a bad merge". Provider-native versioning (Drive 30 days) is weaker and not under app control.
- Conflict as notes (live value + both stored) keeps the manifest valid and the item list clean; mine pollutes the item list with drafts users must clean up. Notes are better; but the UI to resolve them is new work.
- Packing: I deferred it. The facts disprove that: 77,000 requests vs 86 for restore; at Drive costs (download 200, list 100, edit 50 units) a per-file full restore is roughly 15M units and slow; free-tier charging for projects created on or after 2026-05-01 is announced as "planned later in 2026" (coordinator-supplied, from the Drive limits page; I verified the page's other figures but did not see that exact planned-charge sentence myself). Packing is needed in v1.

## Verdicts

- Provider first: still Google Drive, with the engine kept provider-neutral. Reasons: 15 GB free vs Dropbox 2 GB (revision growth matters now), non-sensitive `drive.file`, most reach. Accept 1 h tokens and "sign in again" state. Dropbox is the better API (CAS, refresh, longpoll) and should be second, not because the protocol needs CAS (it does not) but for token ergonomics. This is a reasoned preference, not a measured one; the token issue is the thing a prototype should test first.
- Packing in v1: yes. Per-sync packs of about 4 MB, header read once per pack, plus compaction when small packs exceed a threshold.
- History: keep their immutable revisions, but add retention (last N revisions + one per day per record; never prune a revision still named by a device head or needed as LCA of live heads) and squash-on-idle. Add an LCA shortcut: each device records the last revision it synced; walk ancestors only down to the shallower head's depth and stop at known-common revisions, to avoid the 151-GET walk.
- Merge: take their deterministic merge3. Add: immutable item `uid`; demote merged items to stale/re-review when frames from both sides combine; extend `validate` to real manifest rules (slots, presets, materials, clips, zOverrides, baseCut index sanity).

## Revised overall position

Merge the two designs: their DAG, deterministic merge, notes, device-head files and packs; my constraints: Drive first with provider-neutral adapter, a never-delete-automatically rule for remote art, ZIP export retained, local-first with no network blocking, sync only leader via Web Lock, and an explicit retention/compaction policy (which the PoC lacks and which is the main remaining risk).

## Least sure

- The 2.5-3 MB per revision estimate (not measured; hash compressibility assumed).
- Whether Drive and Dropbox honor ranged reads from a browser without preflight problems (Range header triggers CORS preflight).
- The planned Drive charging details.
- Whether the criss-cross risk can be hit in practice; my fuzz did not find it.
