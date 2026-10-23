# Isolated prototype visual review

2026-10-23. Review only; no code or assets changed. Inspected `evidence/desktop-porcelain-side-moving.png`, `desktop-obsidian-topdown.png`, `mobile-obsidian-preview.png` and `landscape-porcelain-topdown.png`. Also read `world.js`, `config.js`, the relevant responsive styles and current toast handling, plus the lead's verification report. The lead was refining the prototype concurrently; the screenshots predate some notification fixes.

## Conclusion and blockers

**No new visual blocker in the inspected scope.** The prototype retains the approved full-screen world, distinct sharp pixel actor, left identity and consolidated equipment region. Porcelain Side-scroller now has the same open chamber identity as Preview: no pillars, ribbed enclosure, props or added actor illumination. Obsidian Top-down has useful continuous material/seam cues without introducing visible debug controls. The desktop actors remain prominent; the equipment occupies a subordinate right zone.

Portrait Preview keeps the world and character above one bottom equipment sheet. Landscape correctly adapts equipment to the right instead of consuming the shallow screen with a tall bottom panel. Its actor is smaller, but readable and clear of the controls. No horizontal overflow or actor/control collision is visible in these four images. This is not a full-device or full-screen-state audit.

The Canvas actor draw is separate from the native WebGL ground: the fragment shader addresses floor material, seams and distance fog, while `drawSprite` draws the composed actor at full opacity with smoothing disabled. Scrims sit behind the actor canvas. This supports the no-tint/no-added-shading contract. Reflection remains a subdued separate draw configured in code, with no end-user control. Visual review alone cannot prove exact RGB preservation; the lead's verification report separately records source-pixel comparisons in both appearances.

## Local observations and evidence limits

| Item | Finding / disposition |
| --- | --- |
| Obsolete toast in portrait Preview | `mobile-obsidian-preview.png` shows an Idle-missing notice while Preview is selected. That is visually distracting and semantically out of place for Walk inspection. Current source hides notices on screen/view/character changes and the lead reports the notification fix. Refresh this evidence after the fix; do not treat the older screenshot as the final behavior. |
| Obsolete coverage notice | `desktop-obsidian-topdown.png` shows Wizard hat visible after returning to compatible south coverage while the earlier north-hidden toast remains. Current source clears a gear notice when nothing is hidden. Refresh the evidence; the persistent item note should agree with the actual current coverage. No restoration toast is requested. |
| Side floor density | Porcelain Side-scroller has a denser seam convergence near the horizon than the still mockup. It still reads as continuous ground and does not challenge the approved aesthetic. If travel reveals shimmer or repetitive bands, tune seam strength/material repetition locally; do not add scene props to conceal it. |
| Portrait equipment continuation | The first portrait viewport shows modes, categories and item choices; None, palette and actions continue below. Source provides scrolling and an expandable sheet, so they are not simply deleted. The small grabber alone does not establish discoverability. Verify that a person can expand/scroll and reach every action without accidentally moving the actor. |
| Text scale | Secondary labels and directions are smaller than in the image mockups, especially in landscape. They remain readable in the supplied evidence but need actual-device/zoom checks. Do not claim target-size or contrast compliance from the PNGs. |

## Prototype limits to retain in delivery

- Generation, account, import/export, new equipment and palette editing are intentionally unconnected. The creation form demonstrates layout/input, not a payable generation flow or completed application integration.
- The bundled source fixture supplies the real body/equipment and available poses. Side-scroller does not create a new camera rig, and still fallback does not create Idle artwork. Coverage hiding must remain distinct from unequipping.
- A WebGL 2 context is required by this particular ground implementation; source currently throws a readable error if it is unavailable. No fallback renderer or cross-GPU performance result is established by this review.
- The lead's `verification.json` reports motion/camera, normalization, stop/blur, equipment restoration, touch release, source RGB and overflow checks. Those are separate automated evidence, not independently rerun by this visual review. Camera comfort, long touch sessions, reduced-motion preferences, keyboard focus/disclosure behavior and non-drag touch access still need focused usability/accessibility evaluation before production.

Keep the present world identity and actor rendering. Remaining work from this review is refreshed evidence for the corrected transient notices and focused interaction/legibility checks, not an aesthetic redesign.

## Lead follow-through

Final evidence was regenerated after the notice fixes: screen/view/character changes clear obsolete notices, and restored equipment clears its hidden-item notice. Portrait equipment now shows two choices and None in one row. Real two-finger touch verification passed, including changing equipment while moving, release and cancellation. Final Node 24.22.1 verification passes all 12 browser checks and eight resolver/motion tests. The actual-device and accessibility limitations above remain open for production evaluation.
