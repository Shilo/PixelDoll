# Bronze UI material proposals

November 8, 2026. Reviewable appearance mockups, not an implemented theme update. Production Bronze UI, PixelDoll source, dependencies and workflow behavior are unchanged by this study.

For a new agent, start with the [consolidated UI/UX review-and-fix handoff](../../handoff/bronze-ui-ux-review-and-fix.md), which connects all findings, evidence limits and the deferred implementation task.

## Recommendation and purpose

Start with **Tactile Bronze**. Keep **Bronze inlay** as an optional, stronger selection treatment to judge against it. Retain the current design if the additional material detail distracts more than it helps.

The [identity audit](../../research/bronze-ui-identity-audit-2026-11-07.md) found the strongest generic resemblance in work surfaces and common controls. The [independent research](../../research/bronze-ui-ai-design-research-2026-11-07.md) supports evaluating meaningful hierarchy and affordances, without treating unusual fonts, square corners or extra decoration as evidence of craft. These proposals therefore keep the same base palette, fonts, corner family, spacing, text and controls across each pair. No new product setting, navigation step, decorative texture, background art or dependency is proposed.

| Concrete change                                                                | Purpose                                                                                                                                              | Tradeoff and decision                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Give editable fields a recessed surface distinct from the work panel           | Identify where input happens without requiring every field to carry more border emphasis; separate the currently identical field and surface values. | Dark fields become darker; light fields become slightly deeper porcelain. Retain meaningful boundaries, labels and error text. Recommended first change.                                                                                                 |
| Add a restrained upper edge and lower lip to the primary action                | Communicate a pressable surface, with a quiet tactile response rather than a generic flat accent rectangle.                                          | Can look dated or heavy if exaggerated. The specimen uses a subtle gradient and one- to two-pixel internal edges, without moving the control or its label. Recommended for comparison, not proven superior.                                              |
| Give ordinary secondary actions a weaker raised treatment                      | Distinguish an action from an editable recess while maintaining primary-action priority.                                                             | Repeated shadows could create noise. Keep the effect small and omit it from fields, tabs, swatches and existing floating surfaces.                                                                                                                       |
| Add one upper rim to opaque work surfaces                                      | Make the work surface feel intentionally formed rather than relying entirely on a flat color.                                                        | The result is deliberately subtle, especially in Export. Do not add rims to every section or texture behind text.                                                                                                                                        |
| Preserve selected treatment during hover                                       | Keep the current choice identifiable while the pointer moves; focus remains a separate indication.                                                   | Requires checking each actual Bronze recipe before release. This mockup does not complete the existing Later card for selected-plus-hover production styling.                                                                                            |
| Add a narrow Bronze inlay to selected specimens, with a quieter selection fill | Give selection a stable positional marker and connect the material vocabulary to Bronze, while retaining the radio/check indication.                 | A stronger edge can distract from equipment artwork or resemble another generic selection stripe. Optional alternative, not a prerequisite for the material improvements. Keep it distinct from field-error treatment through context, markers and text. |

**Tactile Bronze** includes the first five changes. **Bronze inlay** adds the sixth. Neither changes source equipment pixels or uses metallic texture, glow, rivets, parchment, sound or new motion. A functional system font and the current corner family remain valid choices.

The intended feeling is a calm, tactile character tool. Whether users perceive it as more distinctive or professionally authored is still a hypothesis. The mockups cannot establish that emotional response. PixelDoll's simplicity-first policy takes priority over decorative ambition.

## Reading the comparisons

The interactive comparison starts with New character, where field separation is easiest to judge. Compare Export and Equipment too, in dark and light. The current recipes are on the left and the proposal on the right; narrow displays stack them without shrinking text.

These are **matched component specimens**, not pixel-identical copies of complete PixelDoll screens. The builder reads the installed Bronze 0.2.8 tokens and components directly, scopes them for the preview, and records their hashes. Both columns use the same simplified host geometry and content. Production Export now includes RPG Maker and additional settings; those workflows are not reconstructed or removed by this study. The real current Export was separately checked and captured as context.

The preview's selectors control the comparison only. They do not propose settings for PixelDoll. Engine/item/facing choices and palette selection synchronize between columns. Checkboxes and switches synchronize too. Actions report that they are appearance previews; they never download, generate, connect an account or change a project.

The baseline imports the actual shared recipes, rather than hand-copying a claimed current palette. Candidate styles exist only in this isolated study. Work-surface dimensions, control bounds, font recipes and radii remain equal within each pair. CSS gradients express shallow material value changes, not new accent hues.

## Verification and limits

- Built the self-contained comparison and provenance record from installed Bronze 0.2.8. JavaScript syntax checks and placeholder/size checks passed. Embedded engine marks use the app's existing SVG assets; equipment uses unmodified thumbnails from the Bronze showcase's MIT PixelDoll demo manifest. No generated art, downloads or new dependencies were needed.
- Codex-browser checks covered both candidates, both appearances and all three contexts: **12 matched cases**. Each had identical current/proposed control geometry, typography and radii, loaded images and no horizontal overflow. The comparison was inspected at 1024 px wide.
- Checked all three contexts at 390 and 320 px: **six narrow cases**, with no root or control overflow. Inspected a shallow 844 x 390 landscape comparison as well. The mockup page scrolls naturally; this does not certify production mobile dialogs or virtual-keyboard behavior.
- Verified inline error visibility and associated unique error IDs in both columns, disabled primary actions in both columns, synchronized switch changes and synchronized item selection. Reviewed selected-plus-hover samples in dark and light. These samples simulate the known visual state; they are not proof of every production recipe's hover behavior.
- The iframe keyboard attempt did not produce a reliable focus-visible result. Keyboard-focus behavior is **unverified** in this preview; the existing Bronze focus recipe has not been changed. Check native production focus and selection independently before any release.
- Candidate high-contrast/forced-color and reduced-motion fallbacks are included, but OS preference behavior, physical devices, screen readers and full contrast across every state are not runtime-certified. Newcomer preference and task testing remain outstanding.
- Prototype console inspection returned no error entries. Earlier launcher/path errors were corrected before these checks. App type checking, unit tests and end-to-end suites were skipped because this delivery only adds isolated design documentation and mockup source.

Local browser evidence is ignored under `evidence/`: matched captures, the current-app Export capture, `browser-checks.json` and `narrow-checks.json`. Generated media is not committed. Do not treat these prototype checks as production-theme verification.

Calculated sRGB contrast for the proposed solid roles is below. These checks exclude shadow edges and OS rendering, and do not replace a full state/context audit.

| Pair                                              |    Dark |   Light |
| ------------------------------------------------- | ------: | ------: |
| Main text / recessed field                        | 15.44:1 | 12.76:1 |
| Secondary text / recessed field                   |  8.72:1 |  5.35:1 |
| Field border / recessed field                     |  6.18:1 |  3.46:1 |
| Primary label / lowest-contrast gradient endpoint |  8.10:1 |  6.68:1 |
| Inlay / selected surface                          |  6.18:1 |  5.75:1 |

## Reproduce and ownership

From the repository root, using the existing installed app dependency and the owner's sibling Bronze checkout:

```text
node docs/design/2026-11-08-bronze-materials/build.mjs <absolute-output-path>/bronze-material-comparison.html
```

The output is an inline comparison fragment with embedded assets and baseline CSS. `bronze-study-provenance.json` beside it records the exact source hashes. Codex's visualization runtime supplies the surrounding controls and Lucide icons; the fragment includes native comparison controls as a fallback. The source template retains placeholders until built.

If a proposal is selected later, implement shared material roles and component states in Bronze UI, validate the actual showcase and host integration, release a new version, then update PixelDoll's dependency and lockfile. Keep material changes separate from app layout, world-art or typeface experiments. No implementation approval is inferred from reviewing these proposals.
