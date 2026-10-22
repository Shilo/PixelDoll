# Shared equipment implementation and verification

Date: 2026-10-22. User authorized implementation, live PixelLab generations, independent adversarial review and commits on main. This report describes the supported implementation; the broader [research plan](../research/shared-equipment-fitted-copies-plan.md) is not a claim that every fitting class is qualified.

## Delivered behavior

- Accepted wardrobe items save an immutable, local design with the selected colourway. New item → Saved designs provides compatibility assessment, enlarged frame review and portable `.pixeldoll-design.zip` import/export.
- Exact frozen body pixels, layer geometry and slot semantics permit free copies, including unambiguous repeated poses and partial coverage. Different body pixels or ambiguous source equipment cannot silently reuse an item.
- Copies own independent material IDs, colours, outfit selections and pinned source assets. Source/library deletion does not invalidate kept copies. Character ZIPs retain their references.
- Paid fitting has a separately approved rest stage and animation stage. Results stay outside the wardrobe until reviewed and atomically kept. Budgets, seeds and request IDs persist; reload and leader takeover check existing submissions without resending them. Failed quality checks require an explicit, separately priced retry.
- New moves prepare an explicit missing-frame review for shared equipment. Existing raw standing references are reused when their complete contract still matches. Known and transparent cells stay intact; exact missing poses are copied for free, and only the remaining cells are generated.
- Reused pixels do not claim new API body-preservation measurements. Their conservative warning and incomplete-measurement label survive later merges.

The paid trial supports one-material, foreground headwear on known 64 px low top-down mannequin rigs with complete references. Other slots, multiple material roles, oversize/custom layouts and unsupported camera/template profiles can use compatible free copies; cross-body paid fitting for those cases remains disabled. No automatic paid fallback route was added.

## Real Codex browser and PixelLab evidence

The source was the iron helmet from the earlier real PixelLab Ragnarok import. The target was an independently imported Ranger with four cardinal directions, idle (4 cells) and walk (8 cells). Its pose setup measured actual imported frozen frames and persisted the registration profile.

| Operation | Observed result | Actual generations |
|---|---|---:|
| Developer-only route qualification | One source helmet transferred onto four target standing directions; body/key preservation and extraction checks passed, with visual review. | 10 |
| Ranger rig setup | 48 unique frame measurements and character registration completed. | 5.05 |
| Library design → Ranger standing fit | All four directions passed checks and visual review before animation approval. | 10 |
| Approved fit → idle and walk | Eight real pose calls, 48 final cells. Reload during processing resumed retained submissions. All clip checks passed; enlarged frame review completed before Keep and wear. | 24 |

The qualification rest job was local `cfdaf69f-827b-49b3-a0af-74a5eec928ae`, remote `f6c44071-68e4-4f01-aa4e-f0c683d87eba`. The kept fit's eight pose calls were 3 gens each. The initial four-view fit used no fitting reroll or alternate paid route. Global account balance is shared and is not used as a per-test cost ledger.

The fitted helmet was recoloured azure independently. Its real browser Godot download was 523,907 bytes, with 340 entries and 317 decoded images. All referenced PNG RGBA hashes, 146 pinned source images, palette-role mappings and measured-cell producer indices were verified. The imported rig remains ready for moves.

Offline export of that actual artifact to Godot, Unity, Phaser, generic PNG/JSON and Aseprite produced 389 files / 623,401 bytes and successfully round-tripped the immutable design revision. This verifies generated artifacts, not a new execution inside every game engine.

Against the older Ranger source archive, 44 of 48 body cells are byte-identical. The other four differ only in ten blue-channel values by 1/255, consistent with the existing shirt/shorts region encoding after rig setup; alpha, silhouettes, other channels and all standing cells match. This comparison must not be described as a completely byte-identical pre-setup body. Fitting's preservation checks use the actual current target body.

All 48 fitted cells were also inspected in a contact sheet generated from the downloaded archive. Live evidence files remain ignored under `spikes/api/out/shared-fit/`; they contain artwork and request identifiers, not credentials.

The actual downloaded ZIP was reimported through the normal, keyless Studio on port 5198 as **Shared equipment — verified four views**. Its blue helmet, original source snapshot, wardrobe, four direction previews and ready rig survived without the source library being present on that origin.

### Live new move and rejection behavior

To bound further spending, a validated one-direction clone of the real four-direction export was imported through the UI. Existing south body/equipment cells, actual standing references, palette IDs and selected azure colourway were retained. A new six-frame Hurt body move completed in one request plus six measurements. The body request billed $0.040; measurements were billed in dollars as well, rather than generations.

Its first missing-equipment pose call reused approved standing references at zero transfer cost, with a displayed 3-generation request estimate. Actual usage was $0.020. Two visibly deformed helmet cells failed H4 (own similarity 0.67 / 0.57); Keep was correctly disabled. Independent screenshot review agreed these were real geometry defects, not harmless numerical flags. A single separately priced batch retry billed $0.022 and still failed those cells (0.67 / 0.60). The cumulative $0.042 charge survived reload and appeared in the review and Activity. Both rejected attempts remain separate from wardrobe pixels; thresholds were not relaxed. This Hurt helmet result is **not delivered or accepted**.

A browser export while that retry was running independently verified the publication boundary: the new Hurt body exists, while the helmet still has only its original 12 approved south cells. The export explicitly warns about missing Hurt equipment. Original helmet/material IDs and the azure selection are retained.

### Successful Cast extension and round trip

A separate one-direction clone tested a new eight-frame Cast move without changing the blocked Hurt evidence. The ordinary body pipeline made its one allowed reroll after pose checks. Body calls reported $0.020 and $0.018; completed joint measurements reported dollar usage. Three measurement submissions ended with unknown outcomes and were retained without resending. Their final billing is not inferred from the shared account balance.

The original automatically prepared equipment draft survived Studio normalization and a reload. Its standing review correctly displayed the existing blue colourway. One explicitly approved pose call generated the eight missing Cast equipment cells for an actual $0.040, with zero rest-fitting charge and no equipment retry. All hard checks passed. A forearm-occlusion warning on stored cell 3 remained visible; root inspected all eight frames, and the independent reviewer confirmed that the flagged frame retained the rounded helmet design while the arms rose beside it. The warning was retained when keeping the extension.

The actual browser Godot export was 427,279 bytes. Independent artifact verification confirmed:

- The existing equipment item and all 12 old raw equipment cells are unchanged.
- Material IDs, complete material definitions and the selected azure colourway are unchanged.
- Eight new Cast equipment cells are present; coverage is now 20 cells.
- All 206 decoded RGBA hashes, 20 measured-cell producer links across 19 provenance entries, 146 pinned source images and the immutable design revision are valid.
- The restored character remains rig-ready. Azure changes all eight new helmet cells and no body cells.

The final ZIP was reimported through the normal keyless Studio as **Shared equipment — Cast export verified**, preserving the three moves and the fitted copy. Its Add a move form opens directly with Cast marked added, without another setup step or a paid request. The old imported shield has no dressed references or Cast cells; its existing frames remain intact and export explicitly reports that missing coverage. It was not silently animated or billed. It was taken off only in the final demonstration copy's current look.

The verified character remains open in the normal app. Temporary documentation/agent tabs and the owned localhost agent server were closed after all live work finished; the human development server was left running.

## Automated verification

- Exact pinned toolchain: Node 24.22.1, npm 11.19.1, committed dependencies/lockfile.
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 131 tests in 15 files passed after the final core and move-normalization changes.
- `npm run e2e`: all 23 integrated tests passed, including character import/setup/moves, shared designs, desktop/phone/landscape/tablet controls, persistence, exports and browser self-tests.
- After the final currency changes, the six shared-equipment browser tests passed again. A strong assertion first caught Svelte removing the space before `+ $0.040`; the production text was corrected, not the expected value.
- Production build and distribution credential guard passed after the final UI change.
- Independent reviewer: clean type check, 40 equipment tests at the main review checkpoint, then all 13 lifecycle tests after preview/billing follow-ups. The one-shot free-save failure was also reproduced and verified independently with zero paid/evaluator calls after recovery.

Offline browser tests block paid requests. These results do not claim physical-device testing or new execution inside Unity/Godot/Phaser/Aseprite.

## Adversarial review

The implementer and independent reviewer challenged each other's evidence; root reviewed the implementation and accepted only reproducible issues. Regressions cover stale outfit references, stale dressed snapshots, target edits before spending/keeping, sparse/transparent coverage, selected-cell cost batching, actual API producers, partial quality summaries, independent palettes/default colourways, archive limits and source/blob lifecycle.

Final review additionally found and corrected:

- A free-only extension could become stuck after a one-shot local result-save failure. Continue now rebuilds that review locally with zero POSTs.
- An approved-rest extension unnecessarily preflighted the transfer endpoint's minimum target count, blocking a one-direction move even though no transfer was required. Only the private approved-rest extension path skips that irrelevant preflight; new fits remain strict.
- An extension's review could show its raw palette instead of the target's selected colourway. Preview mappings now use saved target selections while paid references and original raw cells stay unchanged.
- Free or mixed copied frames could expose aggregate numeric API measurements. Such summaries now explicitly carry incomplete-measurement metadata and suppress those misleading numbers in the inspector.
- Real API calls can report dollar usage instead of generations. Fit summaries now retain and show both currencies through failures, recovery and retries; the UI explains dollar billing before paid actions and labels the allowance as a generation estimate rather than a dollar cap.
- Preparing equipment reviews before the Studio's body palette normalization could immediately stale both captured fit stamps. Add move now persists the existing normalization before direct item poses and shared fit preparation, including resumed raw clips. A real resumed-clip regression and independent probe verify blue-channel normalization, zero further changes on reopen, stable stamps, preserved equipment/azure choices and zero API calls.

Global Activity rows also identify their target character, so multiple fits of the same design can be distinguished before opening a review.

Independent review found no free-source pinning gap: draft references are scanned by blob garbage collection, and generated/mirrored raster assets are persisted before review publication. Speculative changes without a failing case were not added.
