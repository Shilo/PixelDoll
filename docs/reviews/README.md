# Preserved repair and pipeline reviews

These 2026-10-23 reports inform future work. They do not replace the approved immersive prototype or establish that the proposed repairs are implemented. Findings retain their original scope and evidence limits; repository cleanup did not re-audit their technical conclusions.

| Artifact | Purpose |
| --- | --- |
| [Frame-repair recommendation](2026-10-23-frame-repair-recommendation.md) | Proposed pixel, alignment and joint-guide workflows, tradeoffs and implementation order |
| [Pipeline audit](2026-10-23-pipeline-audit.md) | Generation, rigging, compatibility and recoverable correction concerns |
| [Skeletal-tools research](2026-10-23-skeletal-tools-research.md) | External tool patterns, model boundaries and licensing considerations |
| [Studio/docs audit](2026-10-23-studio-docs-audit.md) | Existing workflow, persistence, repair and documentation findings |
| [Redesign and Bronze UI audit](2026-10-23-claude-redesign-audit/README.md) | Independent review of the immersive prototype and Bronze UI 0.2.0: verdict, prioritized findings, [coverage matrix](2026-10-23-claude-redesign-audit/coverage-matrix.md), reproduction scripts |
| [Repair concept source](frame-repair-mockup.html) | Original offline HTML fragment with bundled demo artwork, preserved without visual changes |
| [Verification script](verify-frame-repair-mockup.mjs) and [historical result](frame-repair-mockup-verification.json) | Tests for that concept, not the production Studio or current character playground |

The HTML fragment was copied byte-for-byte from its original local visualization artifact so the concept is not lost outside Git. It expects the visualization preview wrapper's carousel and icon support. The verification script targets that wrapper's iframe, defaults to localhost port 5275, and supports `MOCKUP_URL`. It is not an independent app entry or an approved theme implementation. The source's archived visual recipes are historical research, not an exception to fixing active shared-theme styles upstream in Bronze UI.

Screenshots under `mockup-previews/` and `repair-workspace-preview.png` remain on disk and are ignored under the repository's generated-media policy. The compact JSON verification result is retained as a dated record of the existing checks; it is not a claim they were rerun during cleanup. Do not overwrite the record when starting a new review without preserving its provenance.

For the current redesign, use the [playable prototype](../design/2026-10-22-redesign/round-6-prototype/README.md) and [Claude audit handoff](../../.claude/handoffs/2026-10-23-161739-claude-redesign-and-bronze-ui-review.md).
