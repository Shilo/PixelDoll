# Final adversarial motion follow-up

November 2, 2026. Branch `codex/motion-lab`, following `00c2a573`. The owner explicitly requested autonomous fixes, a sub-agent challenge, and a counter-review rather than another broad research cycle.

## Decision and scope

An independent read-only reviewer and the implementing agent found one remaining concrete software defect: a failed attachment render could display the previous good image under the current frame label. That defect is now reproduced, fixed and regression-tested.

After reviewing the fix and challenging the visual claims, neither reviewer identified another evidenced repair for this east-facing candidate and its inspection/export tooling. No more paid generations are justified by these findings. This closes this bounded engineering follow-up, not the original aspiration of automatically producing professionally natural motion for every humanoid. The candidate stays `qualified:false`; neither a passing pixel comparison nor an agent review establishes universal artistic quality.

## Review and counter-review

| Finding or proposed action | Challenge and resolution |
|---|---|
| A failed render leaves a stale successful grip image visible. | **Accepted and fixed.** The old render effect only set an error, and the drawing effect did nothing when no new image existed. A browser regression confirmed that invalid source grip X=-1 still left opaque old pixels. The fix clears the selected preview, source canvas and diagnostics before decoding, clears canvas pixels when no image exists, rejects disposed async results and stops playback on failure. |
| Clear the error whenever a render succeeds. | **Rejected as too broad.** That could erase a separate rejected-file error. Render failures now use their own `previewError`; a valid subsequent render recovers that error while preserving an unrelated wrong-canvas import warning. Both paths are tested. |
| A stationary toe alone proves foot planting. | **Rejected.** The earlier single-point observation was insufficient for that claim. A new offline audit checks the entire bottom support edge: every frame has y=106 and x=[72,73,74,75,76], with pixel-center centroid x=74.5. It demonstrates stationary visible support on this fixed-root clip, not hidden foot contact, heel rotation, weight transfer or engine movement. |
| Repaint the rear foot in the two merged poses so both feet can be measured. | **Rejected.** The reviewer independently inspected the foot crops and found legitimate overlap to be a plausible explanation. Unknown anatomy is not a demonstrated missing-foot defect. Inventing a new foot would alter the frozen body without evidence and could create another uncanny pose. Rear contact remains unmeasured in frames 4/5. |
| Large hand or weapon-axis changes require more frames or another generation. | **Not established.** We measured the transitions below and reviewed the intended anticipation/strike/recovery structure. Large discrete changes can be deliberate in an eight-frame attack. No universal speed, length or angle threshold was imposed. No visible wrong hand, absent head, unintended frame order or new body jump was identified in the reviewed evidence. |
| Failed painting may be swallowed by the queue and a later save may clear its generic error. | **Challenged; no separate repair demonstrated.** The concrete corrupt-mask example also fails rendering and now retains a separate visible render error with a blank preview. Neither reviewer reproduced a lost stroke with a normally decoded mask. A speculative queue redesign was not added. Saving an editable draft is not a quality acceptance. |
| Exact transport means professional naturalness. | **Rejected.** Exact source/normalized transport, mask containment, complete heads and palm-centered placement are supported. Hidden fingers, physical perspective, broader body/view transfer and professional naturalness are not certified. The import and export retain warnings. |

The independent reviewer inspected the code, source sheets, palm closeups, foot crops and timing metadata. It reviewed the final preview-error diff and found no further blocker. It did **not** independently execute the test commands; the implementing agent's execution results are listed separately below. Both agents agreed that preserving warnings and ending unproductive paid experiments is preferable to manufacturing a universal success claim.

On the final counter-review, the reviewer also independently decoded all eight retained body PNGs and reproduced the complete support-edge coordinates, centroid and crouch-row changes. It confirmed the transition calculations and final test/report distinctions without finding another actionable correction. A [local failure-state capture](figures/2026-11-02-stale-preview-cleared.png) shows the synthetic test's invalid grip, visible error and cleared canvases. The screenshot stays in the ignored `docs/reviews/figures/` folder under the repository's generated-media policy; the reproducible test and audit data are versioned. It is a UI integrity fixture, not new weapon artwork.

## Candidate-specific motion observations

The retained clip is a manually timed, discrete eight-frame attack. It does not interpolate body or weapon frames. Full measurements, including every visible support edge and transition, are in [the audit data](2026-11-02-final-motion-review-results.json). The source and engine ZIP hashes remain those in the [Studio integration report](../research/2026-11-02-studio-axe-integration.md).

| Transition, zero-based | Authored interval | Palm displacement | Shortest axis change | Interpretation and limit |
|---|---:|---:|---:|---|
| 0 to 1 | 120 ms | 42.43 px | 179.68 degrees | Rapid lift into the raised pose. A large sample jump, not proof of an axis reversal. |
| 1 to 2 | 120 ms | 0 px | -1.76 degrees | Raised anticipation continues; frames 1 and 2 are held for 200 ms total before the strike. |
| 2 to 3 | 80 ms | 40.22 px | 113.15 degrees | Fast strike into the forward pose. Intended discrete movement, not measured physical angular velocity. |
| 5 to 6 | 120 ms | 18.11 px | 2.39 degrees | Slower arm recovery with a similar blade direction. |
| 7 to 0 | 220 ms | 0 px | 1.00 degrees | Preview repeat only. The authored/exported attack is nonlooping; game-specific return-to-idle behavior is not certified here. |

Source sheets show the complete axe head and palm-crossing handle in all eight authored samples. The heel/ankle silhouette changes during the crouch, while the bottom support edge stays fixed. In rows 104/105 the silhouette narrows by one pixel in frames 4/5; that is not by itself sliding or a missing foot. No body pixels, weapon placement, durations or preset defaults were changed during this final review.

Normal/half-speed source playback and actual Studio import/play/export were exercised in the preceding follow-ups. This review adds deterministic transition/support checks and the editor failure/recovery check. A fresh manual browser connection attempt failed with the computer-use API reporting `browser.user is unavailable`; no live visual playback is claimed from that failed attempt. Browser automation still exercised the actual editor and captured its cleared-error state.

## Verification and failures

- Before the fix, the new canvas-alpha regression failed: a rendering error was visible but the old preview still contained opaque pixels. This is the reproduced defect, not a relaxed quality threshold.
- After the fix, that same regression passed. It checks a nonempty valid image, invalid grip, zero opaque preview pixels, restored grip/image and cleared render error. It also verifies a successful render does not erase a separate rejected native-file import warning. Existing exact frame import/export, source guides and persistence checks remain intact.
- Strict Svelte/TypeScript checks: zero errors and warnings. Full unit suite: 1,439 passed, one existing skip across 127 files.
- Relevant `selftests` browser suite: all 11 passed, with build and dist guard clean. The amended editor case passed in 3.3 seconds in the final run.
- An intermediate relevant-suite run had 10 passes and one boot failure before the Lab mounted. Its trace records `/src/ui/motion-lab/main.ts` failing with `net::ERR_NO_BUFFER_SPACE`. The unchanged relevant suite subsequently passed all 11. Timeouts, worker configuration and assertions were not weakened.
- The full 168-test Studio/browser run passed on the preceding integration commit. It was not repeated for this isolated dev-only editor correction; no production Studio state, storage, queue, shared component or test configuration changed here.
- Packaging/support audit reran offline, preserved the pinned editable and engine ZIP hashes and rejected any changed reviewed support edge. No game-engine runtime or additional native direction was tested in this follow-up.

Current generation spend: **zero**. The latest 500-unit allowance remains at 15 spent, 485 unused. No paid transport, automatic retry, token access, dependency, backend or new generator route was added.

## Final disposition

The stale-preview defect is fixed. The axe-head restoration, palm-centered track, exact source binding, body-only occlusion, native per-frame override path, Studio frame stepping and project/export validation remain delivered. The reviewer found no further concrete software blocker after the counter-review and checks.

The general-purpose animation goal remains a product/art limitation, not something this clip can prove complete. Additional native directions, other bodies/weapons, hidden anatomy and a production-quality preset family would require separately accepted artwork and qualification. They are not silently marked solved, and this report does not initiate more broad research or paid trials.

Active and archived board reads were retried outside the sandbox and again failed for missing project scopes. No permission expansion or board mutation was made. Tracking synchronization is pending; all authorized file work remains in this worktree and branch.
