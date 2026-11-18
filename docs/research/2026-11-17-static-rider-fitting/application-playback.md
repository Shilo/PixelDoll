# Static-first mounted playback

Historical experiment, removed before release. Holding an already-generated animation did not save generation cost. Authored Ride animations now play normally while mounted; any future static move must be created as a single stored cell per direction.

## Scope and decision

This implements only the application playback mechanism on the research branch. With Show mount enabled, a complete stored Ride view holds the first entry in its timeline by default, not necessarily cell zero. Animate rider in the existing Mount settings popover opts into the authored sequence. The choice is session-only and defaults off. The switch remains disabled when the mount is hidden. It provides the explicitly requested animation choice without making Play/Pause mean two different things or adding automatic pose-fitting controls.

Preview still respects the selected move. Selecting Walk or another move remains animated. In Top-down and Side-scroller, mounting selects matching Ride where available and retains the existing standing fallback where it is absent. Missing Preview Ride views continue to disclose their fallback. Live missing-Ride fallback remains unchanged and is explained in the mount menu; no new toast policy is introduced in this slice.

All Preview resolution paths, including companion artwork, bounds, reach and lineup filtering, use the same mounted playback policy. A held Ride has its original sequence metadata and actual first timeline cell, so deliberately holding valid artwork does not falsely report missing Ride frames. Live clocks reset to that cell while held and restart the authored timeline on opt-in. Mount clocks and whole-pixel seat translation are unchanged. Live gait advances with travel; in Preview it follows Play/Pause. This does not add mount idle motion at rest.

Source pixels, saved timelines, hip anchors, generation, manifests, engine runtimes and exports are untouched. There is no rider rotation, stretching, new masking, automatic hand fitting or procedural reins in this application change. It does not reduce generation cost yet: the existing Ride generator still requests its existing frames. A future single-still authoring workflow must qualify actual art and item coverage first.

## Adversarial decisions

The requested OpenCode Go DeepSeek V4.1 Flash low review correctly identified four integration hazards: using cell zero instead of the first timeline entry, mislabeling intentional stills as missing artwork, leaving companion/bounds resolution animated, and rewriting saved animations to create stills. The implementation addresses all four in presentation policy without touching storage.

Coordinator counterexample: while resources load, retaining a previously held Ride originally ignored animation opt-in because retention recognized only animated sequences. A failing regression reproduced that transition. Retention now recognizes the held sequence as well and reapplies the current playback choice; toggling either way preserves the retained direction and clip while loading.

DeepSeek's implementation review found a valid companion counterexample: a partial Ride view can supply a rescue still with the same clip/kind as an intentional held Ride. The old lineup filter admitted it despite incomplete timeline coverage. A failing unit case reproduced that inclusion; the shared preview-direction policy now also matches sequence presence, separating a complete held Ride from a rescue still. It avoids rejecting otherwise valid companions solely for unrelated metadata warnings.

The equipment observation is valid in one direction: a still can wear an item completed only for its held cell, while enabling animation requires all referenced cells and may hide that item with the existing missing-coverage disclosure. A regression checks the held hat's actual pixels and animation's hidden-item result. The synthetic browser fixture now duplicates the corresponding coverage keys, not just the sheets, so it tests a dressed rider. The reverse claim, that complete animated coverage can show gear which the held cell cannot, does not follow: the held cell belongs to the same timeline. No coverage rules were weakened.

We did not adopt a new missing-Ride warning toast, generic arm/leg fitting, extra mount offsets, or a shared frame index between independent rider/mount clips. Those changes are unnecessary to establish static-first playback and could change unrelated behavior. The menu copy explains fallback instead. The animation switch supersedes the original research-only recommendation to defer every new setting; it implements the user's explicit static-default/optional-animation request, not universal fit.

## Verification boundaries

The focused regression first failed with animated Ride, then passed after implementation. It uses a timeline starting at cell 1, checks all eight facings, static clock stability, animation restart, mount-off and non-Ride behavior, rendered pixel equality, and manifest immutability. The existing missing-direction case also checks that absent Ride does not get falsely labeled as a valid Ride still.

The existing cross-mode mount browser test injects a synthetic Ride using Walk sheets, solely to prove the switch wiring, mounted/unmounted transitions, companions and live modes. It is not new demo artwork and cannot qualify anatomy. Its initial assertion that all four companions must fit was incorrect: the fitted stage can show fewer directions. The corrected assertion requires multiple visible facings, while unit tests establish all eight resolver results.

The bundled demo still has no authored Ride. Holding an arbitrary first cell does not make the existing chair-sit art astride, and reordering a timeline changes which cell is held. Frame stepping in the inspector does not change the held immersive Ride until animation is enabled or the mount is hidden. Corrected seated art, actual mount tack contacts, weapon/cape occlusion and engine mount support remain separate qualification work.

The switch expresses mounting intent. If this particular schematic mount is unavailable for an unsupported body size, Ride may still be held while the existing mount warning explains the missing mount. Disabling Show mount disables Animate rider without clearing its session preference; the preference is not a per-character art-quality approval.

## Recheck

OpenCode Go DeepSeek V4.1 Flash low independently ran all 23 presentation tests and found no concrete blockers in the final diff. It confirmed the sequence-presence companion rule, both loading-toggle transitions, equipment-coverage rebuttal, cache keys and shared Preview policy. No broad anatomical, mount compatibility or export qualification is inferred from that review.

## Final validation

- `npm run check`: passed, including zero Svelte diagnostics, TypeScript and formatting.
- `npm test`: 2,773 passed, one existing skipped test, across 197 files.
- `npm run e2e -- --all`: 366 passed in the final clean run, including the updated dressed-Ride control flow and desktop/phone mount popover bounds.
- Both offline research test files: 21 passed.
- Svelte autofixer: no issues; suggestions concern existing effects and collections outside this change. The UI detector reported no findings. `git diff --check` passed.

The original static-first, loading-transition and companion-inclusion regressions were observed failing before their fixes. An initial broad unit run also hit an unrelated saved-queue timing assertion; it passed alone and in the final full unit run without changing that test. The first full browser run overlapped implementation edits and had 62 failures in development-module helper flows. It is not used as acceptance evidence: an isolated zoom rerun passed, and a fresh full run with application files unchanged passed all 366 tests. No production bug is inferred from that invalidated run.

No manual browser session, paid generation, corrected rider artwork, new engine mount export or API change was part of this delivery. Changes remain on the research branch, not deployed.
