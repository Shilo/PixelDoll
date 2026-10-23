# Round five: approved Obsidian / Porcelain image mockups

2026-10-23. User-approved image production following [current design](../round-4-discussion/current-design.md) and the [dynamic animation resolver](../round-4-discussion/animation-resolver.md).

## Authorized scope

Full desktop and mobile raster mockups for Characters, Create character, Preview, Top-down and Side-scroller, each in the coordinated Obsidian dark and Porcelain light appearance. Exact source demo sprites are composited without character lighting, tint or generative redrawing. Environment art is generated separately. UI text and controls are rendered deterministically for fidelity to the existing workflow.

The optional reflection is code-configured only; no reflection control belongs in the interface. Mobile live-view imagery may show the dynamic joystick during an active touch. These are static states, not working gameplay or evidence of camera/fallback performance.

This round does not implement the production app or the later isolated playable proof. Unrelated in-progress edits to Studio.svelte, Toolbar.svelte and AlignDirectionsSheet.svelte are outside this design work and will not be staged or changed.

## Production record

Completed: **32 full-resolution images and four overview boards**. See the [full image index and delivery review](image-index.md). The main set covers all five screens in both appearances and both desktop/mobile layouts; supplemental images cover the complete mobile form, first visit, overflow and prompt disclosure.

Approval was committed before image production in `d70ff55`. Documentation, prompts, verification records and the offline rendering source are committed; generated media remains local under the repository's media-ignore policy. These images do not implement application behavior.
