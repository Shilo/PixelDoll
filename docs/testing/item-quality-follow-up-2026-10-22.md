# Saved item quality follow-up (2026-10-22)

Scope: inspect the remaining shield trajectories, reproduce helmet forearm occlusion and cape hem defects from saved
pixels, and validate the separately reported move source-link bug. **No PixelLab requests or generations were made.**
Work stayed in the shared primary `main` checkout; other contributors' report changes were left unstaged.

## Shield east-walk audit

The original 96 selected shield cells and requested skeleton-v3 joints remain under ignored `spikes/api/out/shields/`.
The joint audit compares actual extracted masks with their requested wrists; it does not regenerate, repaint or accept
the drafts. Original composites and extracted layers show the same placement changes.

| Transition | Requested left wrist | Shield layer centroid | Remaining hard check |
|---|---|---|---|
| 4-dir east, frame 0 → 1 | (51.45,54.36) → (51.45,53.68) | (55.09,52.96) → (41.55,52.38) | G5 CV 0.284 > 0.186 |
| 8-dir east, frame 0 → 1 | (52.08,56.83) → (51.77,54.92) | (56.48,54.64) → (45.28,53.80) | G9 turn 67.7° against forearm |

Coordinates include the existing 16 px layer padding. The 4-dir centroid moves about 13.55 px while its wrist moves
0.68 px. This supports retaining review concerns; it is not proof of a particular generation/extraction root cause.
Occlusion changes centroids, and the previous body-aware audit cannot explain all visible disagreement. Neither a
threshold relaxation nor copying a fuller shield into these frames is justified. Both drafts remain failed and
unaccepted. Local `joint-audit.json` records all east-walk frames and angles for further visual inspection.

## Helmet forearm occlusion

The saved B14 engine export provides exact extracted helmet layers, frozen body frames and requested joints. Its
original dressed reference images are unavailable locally. The regression therefore uses **exported walk frame 0**
as a reference and reconstructs composites from the frozen body plus extracted layer. It does not claim to reproduce
every original dressed-reference score or every historical flag.

Against that reference, the visually forearm-covered `slash/south/3` scores 0.485 under centroid alignment. Aligning
by the stored head move and masking only observed mannequin pixels along the forearm scores about 0.774. The selected
real hurt visor/streak cases still fail the unchanged 0.75 floor.

The new H4 path applies only to failed band-item checks with complete rest/move poses and at least six visible item
pixels. Possible occlusion must be a key-colored pixel in the output, on the frozen body, absent from the item mask,
and within the elbow-to-wrist capsule (radius 3 px at a 64 px cell, including 1 px tolerance). Both scores use the same
head-joint-aligned ±1 px search: the unmasked score must fail and the arm-masked score must pass. This produces an
explicit **occlusion review warning**, never a verified hidden shape or a clean pass. All item/new-move H4 call sites
now pass the rig; unsupported pose data retains the original check. No item pixels are changed.

The reviewer found a real flaw in the first implementation: a distant, unrelated forearm could trigger a different
alignment that tolerated an extra blade, even though the arm hid none of it. I independently reproduced the failure
with a 10×10 helmet and 30-pixel attached blade, then added the unmasked-score requirement. The regression fails before
that safeguard and passes afterward. The reviewer repeated the case, including extra parts that survive cleanup
consensus, and agrees with the fix. Real deformities, wrong-facing references, missing observed arms and non-key body
pixels retain hard failures.

## Cape hem

The saved north idle cape has 11.28% near-gray pixels; south/east controls have 0%. The existing D1 design gate already
rejects that colorful design above 5%, before posing new items. A regression now preserves that evidence. This does
not repair accepted historical art. Automatically mapping gray pixels to red could erase intentional outlines,
shading or trim, so no recoloring rule or new paid generation was introduced.

## Appended move source links

Independent decoding of the saved live-import ZIP confirmed **32 of 72 helmet `CellQa.provenance` entries** referenced
records whose `produced` lists did not contain the frame. For example, `slash/south/0` pointed to record 0 (the rest
design), while record 2 produced it. Direction-local call numbers were incorrectly treated as item-level provenance
indices; asynchronous completion order and existing item history make those different.

`mergeClip` now resolves each new QA cell through the selected provenance records' produced keys and adds the prior
item provenance length. This covers split batches and chosen grid fallback records. Existing cell references and
input objects remain unchanged. Missing source evidence throws before persistence. Tests call the actual merge and
inspect its save output with existing history, completion order different from directions, split batches, grid
fallback, subsequent grid replacement and missing source refusal. Both the item-quality reviewer and the import
owner's independent reviewer agree with the mapping.

Historical ZIPs are retained unchanged as evidence; this fixes future merges, not automatic migration. Aggregate
item QA metrics still describe the original accepted clips after adding a move, although per-cell checks and warning
status survive. That separate summary limitation remains in TODO.

## Verification

- Node 24.22.1 / npm 11.19.1; `npm run check`: zero errors/warnings.
- `npm run selftest`: 77 tests passed. The 10 new focused cases also passed independently under the reviewer.
- `npm run build`: production build and dist guard passed.
- Coordinated full managed-Chromium suite: all 14 tests passed (41.9 s), run independently by the import owner on the
  frozen source/final dist using isolated ports 5407/5307.
- `node scripts/e2e-studio.mjs`: all 13 Studio cases passed (43.3 s).
- **Codex in-app browser:** six checks passed using actual QA functions and saved pixels: covered visor becomes review;
  three deformations stay hard; no observed mannequin and wrong-facing reference stay hard; D1 detects the cape hem;
  both shield east hard flags remain. Console errors: none. Proof: local ignored
  `spikes/api/out/shields/codex-browser-item-polish.png`.

The browser harness and measurement scripts/data remain ignored beside the preserved original evidence. The compact
regression fixture contains exact relevant exported pixels/joints, omitting unrelated rig metadata. No physical-phone
test or new engine runtime/render comparison is claimed; PWA remains deferred.
