# Creator image checklist

2026-10-23. Rechecked `CharacterForm.svelte`, `CreateSheet.svelte`, `characterConfig.ts`, `SizePreview.svelte`, `Sheet.svelte` and relevant sheet CSS. Source review only; no application edits, runtime claims or image generation. Other agents' application edits were left untouched.

## Composition contract

- Create is a **separate form**, not a Preview / Top-down / Side-scroller view. Do not show those studio mode tabs or active wardrobe controls inside it. The immersive Bronze world may remain visible as a quiet backdrop, without implying that its actor is the as-yet-ungenerated result.
- Header includes Cancel, the creator title and an editable **Name** field. Source title is “New character”; the accepted terminology may use “Create character” in the new mockup. Name is a library/export label, not prompt prose (`CreateSheet.svelte:22`, `:68–69`).
- Never place an invented generated character next to the draft. The size guide is deliberately a generic block silhouette on checkerboard, with body/frame dimensions (`SizePreview.svelte:5–22`). Existing demo sprites elsewhere stay exact and must not be relabeled as a new generated result.
- Do not apply the scene's one-line hover/tap description rule to this form. The linked exact-prompt excerpt and editable prompt remain usable form controls, without timed hiding.

## Desktop form: three complete columns

| Region | Required visible content |
| --- | --- |
| Appearance | **Appearance / Prompt** editor tabs; Help, API peek, Copy, Enhance actions; Details textarea; **Kind, Build, Proportions, Skin** labeled selects; linked exact-prompt excerpt and its own Copy action. |
| Geometry | **Body size** presets **48 / 64 / 96 / 128** and numeric value with px; **Frame** Auto toggle plus numeric value with px; schematic size guide and Body/Frame dimensions; **Camera** dropdown. |
| Directions | Five preset buttons: **Top-down 8, Top-down 4, Diagonal 4, Side-scroller 2, Unique 8**; full **NW N NE / W center E / SW S SE** compass; separate attached mirror buttons on NW/W/SW and NE/E/SE; **Seed** input, blank with Random placeholder. |
| Footer | Estimated generation range, generation API peek, primary **Create character**. The cost includes idle and walk. Reserve space for validation/status; do not hide it beneath the footer. |

Evidence: `CharacterForm.svelte:80–144`, `CreateSheet.svelte:121–122`. At desktop the existing form uses three columns; source sheet maximum width is 1000 CSS px (`CharacterForm.svelte:147`; `studio.css:326`). New art direction can change presentation while retaining this content hierarchy.

Recommended coherent filled example, matching previous creator evidence: Name **Forest scout**; Details **A calm expression, pointed ears and a few freckles**; Kind **Elf**; Build **Slender**; Proportions **Natural**; Skin **Tan**; Body **64 px**; Frame **Auto, 80 px**; Camera **Low top-down**; preset **Top-down 8**; all eight direction buttons active; only **NW, W, SW mirror toggles active**. Blank/random seed. For that configuration the displayed estimate is approximately **57–75 gens**. The estimate changes with body size and independent directions; it is not a permanent flat price (`characterConfig.ts:19–35`; `create.ts:53`; `CreateSheet.svelte:23–24`).

Important details:

- Body input accepts **32–256 in 4 px steps**. Frame uses **whole-pixel steps**, with a computed minimum and maximum 256; do not label both as 4 px steps. Body is source canvas size, not guaranteed opaque sprite height (`CharacterForm.svelte:118–119`; `characterConfig.ts:114–119`).
- Camera options are **Low top-down / High top-down / Side**. This is generation camera pitch, separate from compass facings and future playable-world tabs (`CharacterForm.svelte:121`).
- Mirror is independent of direction selection. Show a derived-view cue distinct from selected direction. Not every selected direction is mirrored. Preset buttons are not a replacement for individual controls (`CharacterForm.svelte:125–139`).
- Default trait value is **Not set**. The example's filled traits are illustrative, not forced defaults. Default body/frame are 64/80; default Top-down 8 already uses three west-side mirrors (`characterConfig.ts:34`).
- Help/API/Copy/Enhance are separate affordances. Enhance becomes **Enhancing…** and then **Undo**, rather than adding another permanent Undo toolbar (`CharacterForm.svelte:90–96`).

## Mobile form: show honest scrolling, not compressed completeness

Keep the header and cost/Create footer stable while the **form body scrolls**. A full creator cannot fit in one portrait image with readable text and touch targets. The source already uses a single-column order: Appearance, Geometry, Directions (`CharacterForm.svelte:197`; `studio.css:337–345`).

Recommended image coverage for **each theme**:

1. **Base mobile creation image, top position:** header including Name; Appearance/Prompt tabs and actions; Details; the four trait rows; linked prompt excerpt if it fits. Show a natural continuation of the scrollable body. Do not shrink all controls to squeeze in geometry and compass.
2. **Creation continuation, geometry position:** include a little preceding content for continuity, Body presets and numeric input, Frame Auto/numeric input, size guide, Camera. Header/footer and draft values remain identical to image 1.
3. **Creation continuation, directions position:** all five preset buttons, full compass with separately usable mirror toggles, Seed and validation/status area. Keep the same header/footer. No fake “Next” wizard button: these are three scroll positions of one form.

This adds **four continuation PNGs** to a 20-base-image suite: two extra mobile scroll positions × two themes. A single extra lower-form image may suffice only if geometry, camera, all directions/mirrors and seed genuinely fit without reduced readability. Small-screen landscape should use a trailing/full-height form rather than forcing a desktop three-column layout (`Sheet.svelte:35`; `studio.css:331`, `:351`).

If the mobile header cannot fit title, Cancel and Name comfortably on one line, place Name in a second fixed header row. Keep the editor tools readable and touchable; wrapping the tools is preferable to illegibly shrinking them. Footer remains above the safe area and must not cover the last field or its error. These are proposed mockup refinements, not claims about current runtime behavior.

## Alternate tab and state checklist

These states must remain accounted for even if only the main form is included among the base PNGs. Do not imply that every state received a separate image or runtime test.

| State | Correct content and action |
| --- | --- |
| **Prompt tab** | One large **Exact prompt** textarea replaces Details/traits/excerpt. Geometry/directions stay present or scrollable. Toolbar actions target the exact prompt. Do not show both tab panels simultaneously. Maximum complete prompt is 2,000 characters. |
| **Invalid draft** | First validation error visible, Create disabled. Examples: body 65 rejected for 4 px steps; no direction selected; frame too small; invalid seed; empty/overlong prompt. |
| **Enhance pending / failure** | Enhancing indicator; Create disabled during enhancement. Preserve text on failure. Undo is offered after a successful unchanged enhancement. No invented generated sprite. |
| **Not connected / insufficient access** | Explicit Connect detour preserves the draft. Creating requires appropriate PixelLab access. Do not call the action free or invent an included trial generation. |
| **Generation pending** | Replace editable form with named progress: **Drawing your character → Setting up the skeleton → Animating idle and walk → Checking and saving**. Header **Hide**, footer spending range and **Keep working**. Background work can persist across tab reload. |
| **Generation failed** | Actual error explanation; **Start over** and **Try again**. Retry is explicit spending with a new seed; it is not an automatic free repair. |
| **Completed** | Named result, walking views actually produced, quality notes if present; **Saved on this device.**; **Start dressing up**; header Close. Saving already happened. No Save/Accept/Animate wizard. Never use the old demo as evidence that a new Forest scout was actually generated. |

Evidence: `CharacterForm.svelte:48–70`, `:109–114`; `characterConfig.ts:121–125`; `CreateSheet.svelte:25–29`, `:68–122`; `create.ts:37–42`; `state.svelte.ts:86–99`, `:624–647`.

For a supplemental Prompt-tab image, the exact example text should be consistent with Appearance and retain the base-body instruction, not a rewritten fashion prompt:

```text
A calm expression, pointed ears and a few freckles
Kind: Elf
Build: Slender
Proportions: Natural
Skin: Tan
plain bald paperdoll base body, wearing a plain light grey t-shirt and plain dark grey shorts, barefoot, no hair, no accessories, neutral standing pose with arms slightly away from the torso
```

The final line is the current `BASE_BODY` (`model.ts:82`). Recognized complete trait lines link the tabs; free prose is not guessed into trait selections (`characterConfig.ts:43–55`). Hair, hats, weapons and costume choices belong after creation.

## Visual review of first rendered Obsidian creator set

Inspected `obsidian-desktop-creation.png`, `obsidian-mobile-creation.png`, `obsidian-mobile-creation-size.png` and `obsidian-mobile-creation-directions.png` at their rendered dimensions on 2026-10-23. These are static image checks, not interaction or accessibility testing. Findings describe the first rendered files; the lead is revising the renderer, so later exports may supersede them.

**One core layout correction:** on the mobile Directions continuation, Seed input occupies approximately raster y1378–1442 while the footer gradient starts at y1400 and the cost text baseline is y1456. The lower Seed field shares space with the footer/price row. Move Seed upward or shorten preceding compass spacing so the complete input ends above the reserved footer region, with breathing room. There is no need for a wizard step or another form screen to fix this.

The other inspected forms show no clipped core control: desktop includes all fields and five presets; mobile Appearance includes all four traits and linked-prompt access; the Size continuation includes presets, numeric input, Auto/custom frame, size guide and Camera. Camera's input ends around raster y1352, above the footer. Name, cost and Create action are consistent across all three mobile scroll positions. All eight selected directions and the three west-side active mirror controls match the chosen Top-down 8 example. No new generated actor or inappropriate studio-mode tabs are shown in Create.

Two source-contract details deserve attention without blocking visual direction:

- The source supplies per-trait, Frame and Seed help (`CharacterForm.svelte:103`, `:119`, `:141`). First-render mobile Size already shows Frame help; desktop Frame, both Seeds and the trait rows lack equivalent visible contextual help cues. Preserve access to those explanations when implementing, especially source body size versus opaque height and seed behavior. A compact shared help surface could cover them if the mockup intentionally simplifies icons.
- Mobile attached mirror controls are only 42 of the 900 raster pixels wide. If the image is displayed at 450 logical pixels, that visible strip is roughly 21 logical pixels. The eventual proof must provide appropriately usable touch targets for these independent controls. Image resolution alone does not establish target size or accessibility; enlarging the strips or providing a generous nonoverlapping hit area needs a real viewport check.

The lead separately owns the duplicate Size guide label and exact-prompt baseline correction; those were not edited during this review. The excerpt is intentionally truncated, while the Prompt tab must retain the full editable baseline string. No current image demonstrates that tab's expanded editor or the generation/review/error states; the suite should not claim those states were visually verified.

### Final candidate resolution

Reopened the revised `obsidian-mobile-creation-directions.png` and `obsidian-desktop-creation.png`. The Seed field now ends at approximately raster y1348, completely above the footer's y1400 start; the overlap is resolved. Mobile mirror strips are visibly enlarged to 88 raster px, equivalent to 44 logical px at a 450-wide presentation. Compass columns align, the full seed input remains visible, and the cost/API/Create footer has clear separation.

The revised desktop image includes trait, Frame and Seed help cues, a single Size guide label, aligned compass controls, and an ellipsis/scroll cue on the intentionally shortened prompt excerpt. It retains every checked core field, the selected preset and independent mirror state. Neither rechecked final candidate has a remaining blocking clipping or content issue. This conclusion concerns the two inspected static images; runtime focus, touch hit regions, scrolling and the unpictured alternate states remain outside this visual check.
