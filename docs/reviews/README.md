# Preserved repair and pipeline reviews

**November 8 remaining hip-travel fix:** [Independent solution challenge and implementation](2026-11-08-hip-travel-fix/README.md) rejects geometric replacements that change valid motion and preserves classification while retaining review notes for otherwise waived item changes. Includes persistence/export checks and documented limits.

**November 8 individual-hip correction challenge:** [Independent review of `d4c0c633`](2026-11-08-d4c0c633-counter-review/README.md) confirms N1, identifies and corrects a new pelvic-countertilt false review, and validates clean committed/corrected snapshots independently of unrelated work. Includes preserved failures and a separately qualified older travel bypass.

**November 7 knee-threshold correction challenge:** [Independent review of `3eed2a9c`](2026-11-07-3eed2a9c-counter-review/README.md) confirms the original moderate-action correction but identifies one new P2 single-hip bypass in a moving gait. Includes geometry probes, paired G4/G5/G9 controls and offline production checks. See the report for failed runs and evidence limits. [Claude's response](2026-11-07-3eed2a9c-counter-review/claude-response.md) confirms and fixes N1.

**November 7 second correction challenge:** [Independent review of `50eeea36`](2026-11-07-50eeea36-counter-review/README.md) verifies the three original fixes, identifies a new moderate-action lean false failure, and tests note/export and wording/preview parity. Includes a passing full offline browser suite, peer challenge and a separate anchored-wording proposal. No production changes or PixelLab calls. [Claude's response](2026-11-07-50eeea36-counter-review/claude-response.md) confirms and fixes C1.

**November 7 session counter-review:** [R1–R7 verdicts, findings and offline verification](2026-11-07-session-counter-review/README.md) cover 33 Claude commits through `19646f09`, excluding `9c9a2138`. Five corrections held; two partially held. Includes browser-verified free recovery and a wording-method challenge. No production changes or PixelLab calls. [Claude's response](2026-11-07-session-counter-review/claude-response.md) confirms and corrects F1 to F3.

**November 7 commit challenge:** [Claude counter-review handoff](../handoff/2026-11-07-claude-post-bb830dfb-review.md) and [reproducible evidence](2026-11-07-post-bb830dfb/README.md) review the 31 commits after `bb830dfb` through `0992bae7`, with seven consolidated findings and explicit qualification limits. No production fixes were made by that review.

These 2026-10-23 reports inform future work. They do not replace the approved immersive prototype or establish that the proposed repairs are implemented. Findings retain their original scope and evidence limits; repository cleanup did not re-audit their technical conclusions.

**Current editor planning:** [Unified Frame Editor](../design/frame-editor/README.md) supersedes the equipment-only
boundary and separate repair-tool proposals for future work. It defines one embedded full-screen tool for body/items,
pixel/alignment/joint edits, recoverable drafts and reviewed Save/return, with research, data contracts, planned spikes,
delivery gates and [review agreement](../design/frame-editor/consensus.md). It is planning only; the older mock-up and
audits below remain dated evidence. Some safeguards identified by those audits have since been implemented, as the
new package's current-source investigation records.

| Artifact | Purpose |
| --- | --- |
| [Frame-repair recommendation](2026-10-23-frame-repair-recommendation.md) | Proposed pixel, alignment and joint-guide workflows, tradeoffs and implementation order |
| [Pipeline audit](2026-10-23-pipeline-audit.md) | Generation, rigging, compatibility and recoverable correction concerns |
| [Skeletal-tools research](2026-10-23-skeletal-tools-research.md) | External tool patterns, model boundaries and licensing considerations |
| [Studio/docs audit](2026-10-23-studio-docs-audit.md) | Existing workflow, persistence, repair and documentation findings |
| [Redesign and Bronze UI audit](2026-10-23-claude-redesign-audit/README.md) | Independent review of the immersive prototype and Bronze UI 0.2.0: verdict, prioritized findings, [coverage matrix](2026-10-23-claude-redesign-audit/coverage-matrix.md), reproduction scripts |
| [Challenged audit and repairs](2026-10-23-claude-redesign-audit/response.md) | Finding-by-finding decisions, implemented fixes, rejected redesign suggestions, verification and explicitly open gaps |
| [Repair concept source](frame-repair-mockup.html) | Original offline HTML fragment with bundled demo artwork, preserved without visual changes |
| [Verification script](verify-frame-repair-mockup.mjs) and [historical result](frame-repair-mockup-verification.json) | Tests for that concept, not the production Studio or current character playground |

The HTML fragment was copied byte-for-byte from its original local visualization artifact so the concept is not lost outside Git. It expects the visualization preview wrapper's carousel and icon support. The verification script targets that wrapper's iframe, defaults to localhost port 5275, and supports `MOCKUP_URL`. It is not an independent app entry or an approved theme implementation. The source's archived visual recipes are historical research, not an exception to fixing active shared-theme styles upstream in Bronze UI.

Screenshots under `mockup-previews/` and `repair-workspace-preview.png` remain on disk and are ignored under the repository's generated-media policy. The compact JSON verification result is retained as a dated record of the existing checks; it is not a claim they were rerun during cleanup. Do not overwrite the record when starting a new review without preserving its provenance.

For the current redesign, use the [playable prototype](../design/2026-10-22-redesign/round-6-prototype/README.md) and [Claude audit handoff](../../.claude/handoffs/2026-10-23-161739-claude-redesign-and-bronze-ui-review.md).
