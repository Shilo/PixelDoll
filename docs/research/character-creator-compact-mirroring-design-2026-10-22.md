# Compact creator and mirroring revision — 2026-10-22

Status: interactive mock-up revision. Application source and paid API integration are unchanged. This revision supersedes the earlier proposal's default of independently animating every selected direction.

## Interface decisions

- Retain the Balanced workspace's three desktop columns, with a stacked mobile layout.
- Remove the introduction, creation-stage strip, Optional labels and permanent explanations.
- Use Name, Details, Kind, Build, Proportions, Skin, Body size, Frame, Facing directions, Camera, Prompt and Seed.
- Prefer Kind to Race: it covers fantasy humanoids without conflating species and human racial identity.
- All four appearance selectors start with and default to From description. These compact, consistently styled selectors replace large choice groups. Size and direction presets remain directly visible.
- Put supplementary explanations in help controls supporting hover, focus and tap. Long press is not required. Do not invent an unfamiliar optional-field icon.
- Seed itself is the disclosure summary. Closed: show the value or Random at the right. Open: show only the input value, without repeating it in the summary.
- Keep the exact composed prompt visible and copyable. Name, camera and direction/mirror configuration remain separate from its text.

## Facing presets

The order follows the user's requested priority; it is not a measured popularity ranking.

| Preset | Selected | Unique animation sources | Mirrored views |
| --- | --- | --- | --- |
| Top-down 8 — default | All eight | N, NE, E, SE, S | NW←NE, W←E, SW←SE |
| Top-down 4 | N, E, S, W | N, E, S | W←E |
| Diagonal 4 | NE, SE, SW, NW | NE, SE | NW←NE, SW←SE |
| Side-scroller 2 | E, W | E | W←E |
| 8 unique | All eight | All eight | None |

Use 8 unique instead of Full, All or Unique alone: both eight-direction presets select every direction, so the distinguishing property is independent artwork/animation. Diagonal is clearer than Directional and does not promise a complete isometric camera setup.

V3 still creates and retains all eight original base views. Mirroring changes which directions need independent animation and item fitting. Keep the original views for switching a mirrored direction back to unique.

## Three mirror interactions

1. **Pair switches — recommended:** compact source→target rows beside the desktop compass. Each row has a mirror toggle and a separate reverse-source button. On phones, rows sit below the compass with 44 px controls. This makes source relationships explicit and keeps selection separate from mirroring.
2. **Tile toggles:** each horizontal direction gets a separate mirror button below its selection button. The source is visible for derived views. Targets remain separate and touch-sized; there are no nested buttons or tiny split hit areas.
3. **Side controls:** West / None / East convenience actions, plus independent per-pair selectors. West names the mirrored target side, and each pair shows the exact source→target relationship.

Mirror pairs are NW↔NE, W↔E and SW↔SE: horizontal reflections, not opposite compass bearings. N and S have no automatic mirror relationship.

State rules:

- A pair has at most one mirror edge. Reverse atomically swaps source and target; there are no cycles or mirror chains.
- Disabling a pair keeps both selected directions and makes them unique.
- Deselecting a derived view removes its mirror edge and leaves the source selected.
- Deselecting the source promotes its selected derived partner to unique and announces the change.
- Creating a mirror relationship selects the required pair members.
- Preset matching includes the selected set and the mirror map. Any other combination is Custom.
- Keep at least one direction selected before enabling Draw.

## Enhance contract

Verified against the current [PixelLab OpenAPI](https://api.pixellab.ai/v2/openapi.json): V3 uses `POST /v2/enhance-character-v3-prompt`. The request requires `description` and `image_size`; it also accepts `view`, `outline` and `detail`. The documentation says the result is tailored for V3 and omits facing/background descriptions.

Production should enhance Details explicitly using the current source size and camera, preserve the original for Undo, then refresh the exact final prompt. Do not also enable automatic enhancement on Draw, which would make the approved prompt diverge or enhance twice. An in-flight response must not overwrite text edited after submission, and paid failures must not be automatically resent.

The interactive mock-ups demonstrate Enhance/Undo with clearly labeled example text and make no API call. This is not a live endpoint integration or a validation of enhancement output quality.

## Verification

- JavaScript syntax checks passed.
- Offline model checks covered every preset, source reversal, unlinking, source/target deselection and 500 further mirror-state transitions with invariant assertions.
- Codex browser checks verified all five preset counts, reversing all three pairs, promoting a dependent after source deselection, tile reversal/unlinking, side-wide changes and individual pair overrides.
- Seed summary/input behavior, Enhance/Undo, appearance-to-prompt updates and desktop help disclosure were exercised. A native-select event-order issue found during testing was corrected in the mock-ups.
- All three mobile variants were checked at 375 and 320 px browser widths, including product windows as narrow as 273 px after preview-shell padding. No child controls extended outside the product window. Direction buttons were 58 px high; pair reverse/toggle and tile-mode controls were 44 px high.
- Desktop and mobile browser logs had no warnings or errors during final checks. No generation credits were spent.

The existing sizing, skeleton, item, asymmetry/handedness and export limitations from the earlier research remain implementation work. These mock-ups do not claim that the production pipeline already supports the proposed dimensions or mirror configuration.

## Selected refinement: attached tile toggles

This revision supersedes the earlier Pair switches recommendation and the `8 unique` label. The user selected Tile toggles.

- Use **Unique 8**, consistent with the count following the name in the other presets.
- Attach NW/W/SW mirror controls to the left edge and NE/E/SE controls to the right edge. Each joined pair keeps one height. The direction grid starts at the same left edge as the presets.
- Use **Presets** above preset buttons, **Directions** above the grid, and **Mirrors** beside it as the attached-button help target. No additional mirror settings panel.
- Make the entire title a help trigger, including its text, with keyboard and tap support.
- Move Name into the title bar. Body and Frame Custom buttons shrink horizontally to reveal an adjacent input within their existing row. Seed replaces its right-hand value with an input; nothing expands vertically.
- Prefer **Use details** as the shared neutral trait choice. **Unspecified** is precise but less conversational; **Auto** is compact but may imply automatic selection; **Custom** implies an explicitly supplied value.

### Prompt editing alternatives

The recommended **Linked prompt** prototype uses Controls / Prompt tabs backed by one prompt document. Controls own recognizable complete lines such as `Build: Broad` and `Skin: Pale`. Known values are recognized case-insensitively with whitespace tolerance. Other text appears in Details. Unrecognized wording and duplicate/conflicting trait lines leave the corresponding dropdown at Use details; there is no semantic NLP inference.

Changing a trait replaces only that trait's recognized lines. Changing Details replaces only the free-text portion. Other prompt wording remains verbatim. Merely switching tabs never rewrites anything. This avoids rebuilding the entire prompt after a small edit. Body size, frame, camera, seed and directions remain separate API/post-processing settings.

The **Free prompt** alternative preserves controls as a separate draft. Editing Prompt activates the custom draft and disables the appearance controls. Use controls explicitly rebuilds from the saved controls; Undo restores the custom prompt. This is simpler internally but does not provide bidirectional synchronization, so it is the comparison rather than the recommendation.

### Refinement verification

- Desktop and mobile checks confirmed fixed row heights and unchanged downstream positions when Body Custom, Frame Custom and Seed are opened together.
- At a 320 px browser viewport, the product was 273 px wide after preview-shell padding. No controls escaped the product bounds. Attached mirror targets measured 44 × 54 px; direction targets were at least 47.5 × 54 px.
- Recognized prompt lines, free-form replacements, negated/nonmatching text, conflicting duplicate lines, case/whitespace tolerance and empty prompts were tested. Unrelated raw wording remained unchanged when a different trait was edited.
- Side-scroller defaults to E with W mirrored. Unique 8 selects eight views with zero mirrors. Reversing a mirror then removing its source promotes the remaining dependent to unique.
- These remain interactive design prototypes. Enhance is simulated; no PixelLab request or generation was made.

## Linked prompt selected; quieter layout

The user selected Linked prompt. The latest desktop/mobile prototypes remove the alternative Free prompt design, the linking status text, the Mirrors title and the Presets title. Directions now labels the complete directions section above its presets.

The guided tab provisionally reads **Design**, and the neutral option **Default**. These names remain open for feedback. Tab alternatives are Appearance, Character, Builder and Guided; neutral alternatives are Not set, Unspecified and No preference. The neutral value always means no additional trait clause, regardless of its display name.

A small muted three-line prompt preview sits below Skin with a copy button. It contains the exact prompt text; visual truncation keeps the form compact. Clicking the text opens the full Prompt editor. Copy preserves the complete prompt, including line breaks. The exact editor has Undo followed by Enhance; enhancement updates the linked fields and Undo restores the exact prior prompt. Enhancement remains a labeled local demonstration, not a live API call.

Frame controls now precede the preview. The preview image starts at the controls' left edge. Its row has a stable height and top alignment; its text uses reserved vertical slots for body size, frame size and caption. Changes to one text line cannot vertically recenter the image or the other lines.

Browser verification confirmed desktop and mobile preview coordinates remained identical across size changes, custom-frame activation and validation text changes. The summary copy matched the complete editor value. Exact-prompt Enhance/Undo preserved recognized trait values and restored the prior text. A 320 px viewport yielded a 273 px product with no overflowing controls. Final browser logs contained no warnings or errors; no credits were spent.

## Accepted names and simplified controls

The user chose **Appearance** and **Not set**. Not set adds no trait clause. Existing prototype state retains its selections while migrating previous neutral labels.

The exact-prompt header now holds Copy followed by one **Enhance → Undo** button. There are no bottom prompt actions. Undo restores the exact prompt before enhancement. Subsequent text or trait edits clear that enhancement undo state so a later click cannot discard newer wording. Enhancement remains simulated in these prototypes.

Seed is an always-visible input with Random as its empty placeholder, plus whole-title help. Camera also has whole-title help describing the side, low top-down and high top-down angles independently of facing directions.

Direction presets fill two rows: Top-down 8 and Top-down 4 each occupy half the first row; Diagonal 4, Side-scroller 2 and Unique 8 each occupy one third of the second. At 320 px browser width the product is 273 px wide, and the second-row labels may wrap while keeping equal button widths and heights within the row.

The footer contains **Create character** with a separate muted estimated cost. The V3/base-view note and the separator between the action and cost are removed.

Browser checks verified exact-prompt Enhance/Undo, clearing its snapshot after edits, Not set removing its trait clause, visible Seed input, header action order and mobile control bounds. Preset measurements confirmed the two equal-width first-row and three equal-width second-row buttons.

## Always-visible size fields

The latest user direction replaces Custom buttons entirely. Body size has four presets followed by one always-visible numeric field. Clicking a preset fills the field and selects that preset. Typing any value marks it as manual and clears the preset selection, including when the typed number happens to equal a preset.

Frame has an Auto toggle followed by an always-visible numeric field. Auto stays a text label for clarity and is exactly one body-preset column wide. When enabled, it writes the computed frame size into the field and follows body-size changes. Typing a frame value turns Auto off. Turning Auto off retains the current displayed value, focuses the frame field and selects its value for editing. Manual padding remains unchanged when body size changes; existing fit validation still applies.

Both native numeric inputs use the same inside-field `px` suffix and spacing. Browser checks verified all four preset values, automatic frame updates, manual-state transitions, focus on Auto-off, identical Auto/48 widths, and suffix bounds inside both inputs. At a 320 px viewport, both fields measured 44 px high, no controls overflowed the 273 px product, and the preview/Seed positions remained unchanged across size edits. Browser logs were clean.

## Seed scope and placement

Verified against [PixelLab's general Seed documentation](https://www.pixellab.ai/docs/options/general#seed) and the live [V3 request schema](https://api.pixellab.ai/v2/openapi.json). Seed initializes the model's random-number generator; V3 describes it as a seed for reproducible generation. It is a generation-wide variation control, not a selector for particular appearance fields. PixelLab does not publish a trait-by-trait influence map or explain its internal per-stage seed derivation. Reusing a seed with similar settings is documented to give similar output; it is not a promise of preserving identity across arbitrary prompt/model changes.

The existing application passes `spec.seed` into base creation and managed motion generation, and uses derived values such as `spec.seed + 101` for skeleton-rendered clips (`app/src/studio/create.ts`). Thus its scope in the current pipeline also includes animation generation. This investigation used documentation and code only, with no paid requests.

Camera now occupies the former Seed position below the size preview. Seed is the final control below directions in the right column, and therefore the final form control on mobile. Its help text explicitly describes generation-wide variation. Browser checks verified the swap, native field behavior, preset-driven Camera updates, and a 320 px viewport without overflowing controls or browser errors.
