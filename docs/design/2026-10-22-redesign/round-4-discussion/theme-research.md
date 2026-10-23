# Theme research for the immersive character creator

**Selection recorded:** the user chose Obsidian / Porcelain Bronze. See [current-design.md](current-design.md) for the accepted design. Other palette families below remain research alternatives, not extra required app settings.

Research date: 2026-10-23. Discussion only. No imagery, prototype, application code, or paid API requests. Read round three's README and gameplay contract; this note does not claim a new visual or usability evaluation of those images.

## Recommendation

Use **Obsidian Bronze** as the default and **Porcelain Bronze** as its light counterpart. Both are the **same simulation chamber**: the same geometry, subdued ground seams, camera, negative space and interface placement. Light mode changes material values, illumination and interface colors; it does not turn the chamber into an outdoor sunrise scene. Retain information on the left and the complete equipment region on the right, becoming one lower equipment region on phones.

Ship one Dark/Light appearance choice in the overflow menu. A scene-lighting selector and a separate UI-theme selector are not justified for this first version. Paired presets are simpler to understand, easier to art-direct and require fewer combinations to verify. They must each provide reliable reading contrast and a calm area behind the character.

There is a real cost to coupling: a person may prefer bright UI while inspecting dark clothing against a darker world, or want to change the backdrop without changing their controls. That is a reason to keep the scene and UI colors separable internally, not a reason to expose another setting now. Revisit an independent backdrop/lighting option only if actual inspection or accessibility needs cannot be met by the two presets. Do not describe a single Dark/Light switch as an industry convention; the evidence below establishes different workable patterns, not their prevalence.

## What actual games establish

| Primary source | Documented behavior | Useful implication and evidence limit |
| --- | --- | --- |
| [Final Fantasy XIV UI Guide: theme settings](https://na.finalfantasyxiv.com/uiguide/faq/faq-other/setting_theme.html) | The official comparison shows Dark, Light, Classic FF and several Clear themes. Some UI elements are unaffected; changing theme requires logging in again. | UI appearance is a deliberate user preference in this game. This page does not establish a corresponding day/night world-lighting change. Its large MMO interface is not a layout model for PixelDoll. |
| [Naughty Dog: The Last of Us Part II accessibility features](https://www.naughtydog.com/blog/the_last_of_us_part_ii_accessibility_features_detailed) | HUD background darkness, HUD colors and scale are adjustable; High Contrast Display separately changes world rendering and entity visibility. | Interface readability and world visibility can be treated independently. This supports distinguishing the two concerns conceptually, not importing all these controls into a small creator. |
| [Blizzard: Diablo IV accessibility](https://news.blizzard.com/en-gb/article/23954932/combatting-demons-with-accessibility-in-diablo-iv) | Subtitle background opacity and font color/scale are configurable; menu text has three size choices. | An atmospheric game can preserve adjustable reading support. Subtitle options do not establish that all of Diablo's HUD has adjustable opacity or a light theme. |
| [Nintendo Support: Splatoon game options](https://en-americas-support.nintendo.com/app/answers/detail/a_id/14795/p/50) | The original Splatoon offers Color Lock to constrain ink-color combinations for players who have difficulty distinguishing colors. | Game color can be functionally meaningful. PixelDoll should distinguish equipment selection and warnings with marks/text as well as hue. This is evidence about the original game, not a claim about every later title. |

These examples do **not** show that games generally offer light mode, that games generally lack it, or that scene lighting normally follows UI appearance. No representative industry survey was performed. PixelDoll's paired presets are a scoped design recommendation grounded in its particular composition and minimalism goal.

## Concrete palette directions

All values below are proposed design tokens, not colors extracted from a game or an existing mockup. The surface colors describe opaque control/menu backing; world materials can vary within each family. Accent is for selected state and a restrained primary action, not every border and icon.

| Direction | Dark: world / surface / text / secondary / accent | Light: world / surface / text / secondary / accent | Assessment |
| --- | --- | --- | --- |
| **Obsidian / Porcelain Bronze — recommended** | `#111317` / `#202329` / `#F2EEE6` / `#B8B5AD` / `#C9A66B` | `#EEEAE2` / `#FAF7F0` / `#25282D` / `#5E625F` / `#76562F` | Warm, restrained chamber identity; continuity with the bronze seams already proposed. Keep bronze sparse so clothing remains the source of strong color. |
| **Graphite / Frost** | `#11171C` / `#202A31` / `#EDF3F4` / `#AEBCC0` / `#9DCDDA` | `#E8EEF0` / `#F7FBFC` / `#202A31` / `#52636B` / `#2E697D` | Cooler simulation-lab mood. Clearest alternative if bronze feels too fantasy-oriented; too much cyan would make it resemble a sci-fi HUD. |
| **Basalt / Sage** | `#131A18` / `#222E29` / `#EFF3E9` / `#B5C2B4` / `#B4C8A1` | `#E9EEE4` / `#F7FAF3` / `#26332C` / `#57695B` / `#4A654A` | Softer, more natural mood. Green scenery tint should remain local to the world, without casting a green wash onto sprite palettes. |
| **Ink / Lavender** | `#18151D` / `#2A2431` / `#F3EDF7` / `#C3B6CD` / `#C7ACDF` | `#EEE9F3` / `#FAF7FD` / `#302739` / `#6A5978` / `#76558F` | More magical and expressive. Higher risk of competing with purple equipment and reading as another generic purple creative app. |

Computed with the WCAG sRGB relative-luminance formula on the **opaque** surfaces above: primary text ranges from 12.51:1 to 14.03:1; secondary text from 5.57:1 to 7.81:1. Those figures do not certify translucent versions, selected thumbnail outlines, actual fonts, or the rendered world.

For a filled primary button, dark appearances use the light accent with dark text (`#17140E`, `#102A31`, `#182319`, `#21182A` respectively); light appearances use the dark accent with white text. Proposed text/fill contrast is 6.06:1–9.06:1. For the recommended bronze pair it is 8.01:1 dark and 6.68:1 light. Do not place white text on the dark theme's pale bronze fill.

## Professional color and shape system

[Material's color-role guidance](https://m3.material.io/m3/pages/color-roles?s=m3) distinguishes surface, accent, outline and paired foreground colors; [Google's official theming codelab](https://developer.android.com/codelabs/m3-design-theming?hl=en) treats color and shape as coordinated systems. Borrow that discipline without adding Material components or a new dependency: a small, named set of surface/text/accent/state roles is enough for existing custom CSS.

Recommended shape rules are a PixelDoll design judgment, not a measured preference or game convention:

- Use one restrained rounded-rectangle family: approximately 8 px corners for controls and equipment cells, 12 px for menus/dialogs. A larger sheet can use a slightly larger outer radius. This softens the HD interface without imitating the sprite's pixels.
- Reserve circles for palette swatches and truly circular icon affordances. The proposed **Preview / Top-down / Side-scroller** top tabs share one consistent treatment and a clear selected indicator. Avoid turning every tab, item and action into a separate floating pill.
- Give the main action a filled accent surface. Secondary actions use text or a quiet neutral fill. Selected equipment uses an outline plus a check; keyboard focus has its own visible ring. Hover alone never communicates selection.
- Keep the same shape, spacing and type hierarchy across both appearances. A light theme is a complete value system, not a hue inversion or a white overlay over the dark design.

[Apple's Dark Mode guidance](https://developer.apple.com/design/human-interface-guidelines/dark-mode) supports testing both appearances and notes the importance of increased contrast and reduced transparency. It also recommends respecting system appearance in native apps. PixelDoll's explicit dark default and light switch are established product choices; that native-platform recommendation is not a requirement to introduce more modes here.

## Subtle transparency that remains usable

“Floating” should describe composition, not require every reading surface to be nearly invisible. Keep the center world open; place stable, local backing behind the left information and right equipment controls. A soft gradient can fade the **edge** of the equipment zone into the world while the area directly under labels, icons and selection marks retains a dependable value. Menus, search, long forms and cost confirmations need stronger backing than an idle wardrobe label.

Blur is optional atmosphere, not the mechanism guaranteeing contrast. Floor seams, bright horizons and passing sprite colors remain variable even after blur. Avoid automatic light/dark text swapping frame by frame: moving behind a bright object should not make the UI flicker between appearances. Choose stable surface/foreground pairs and test the least favorable background under each control.

[WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) requires 4.5:1 for normal text and 3:1 for qualifying large text. [Non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) requires 3:1 for visual information needed to identify controls and states against adjacent colors. A decorative seam or optional container edge need not be treated as the sole control boundary if readable content already identifies the action. Thin low-opacity selection outlines, however, cannot be dismissed as decoration.

[Xbox Accessibility Guideline 102](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/102) explicitly addresses changing game backgrounds: measure against the lowest-contrast background region and provide stronger/solid text backing or configurable support where necessary. For PixelDoll, verify both paired presets at bright/dark ground regions, both projections, and camera positions used during movement. Add an independent setting only if dependable default backing and existing accessibility preferences cannot meet the need. These are future implementation checks; the images and calculated palette pairs are not an accessibility certification.

The character needs a separate visibility check from UI text. A dark cape against Obsidian and white hair against Porcelain should both retain an understandable silhouette. Quiet broad material values and restrained scene contrast help. Do not fix visibility by permanently changing sprite pixels, adding baked lighting to exported layers, or placing a bright horizon behind the head. Any future outline aid belongs to display rendering and needs an explicit design decision.

## State, overflow and mobile implications

[WCAG Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) requires another visible cue when color communicates meaning. Equip states therefore need a check/selection mark; warnings need an icon and explanatory text; color swatches need accessible color names and selected marks. Different outfit ramps are the content and may remain full color, while the control state must not rely solely on those ramps.

One visible ellipsis is a reasonable home for **Appearance → Dark / Light** and **GitHub ↗**, with labeled menu rows and a programmatic “More options” name. This is a proposed placement, not a claim that ellipses are self-explanatory. Keep character switching on the character name, equipment directly available, and **Preview / Top-down / Side-scroller** in the top tabs; making core interaction contingent on overflow would undermine the requested game-like immediacy. There are no separate Play or Customize buttons in this discussion proposal.

On phones, the same palette and hierarchy should become one stable bottom equipment region with sufficient backing; squeezing several low-opacity floating panels around the hero would reduce both usable world area and reading reliability. Keep small icon artwork inside generous targets. [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) sets a 24 CSS px target/spacing minimum with exceptions; aim for roughly 44 px controls here as a comfort recommendation, not as the AA minimum. No hover-only names or actions.

Touch locomotion remains a separate unresolved interaction in the existing contract. A future drag gesture needs a non-drag pointer alternative unless an applicable essential exception is established; [WCAG 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) does not make a hardware keyboard alone the substitute for every pointer operation. This research neither introduces a joystick nor claims touch locomotion is solved. Gestures must not cross-activate equipment, page scrolling or paid actions.

## Decision before the next image round

Agree the palette family, the paired appearance behavior, and the restrained shape/selection system in text first. The recommended next visual comparison would use the **same Obsidian chamber composition** in dark and porcelain values. No new images are authorized by this research note itself.

## User clarification and next comparison

The user's subsequent instruction authorizes **small paired palette mockups before full-screen designs**. Compare Bronze, Frost and Sage with one dark and one light treatment each; Lavender remains a lower-priority research alternative. This updates the preceding text-first gate for that limited comparison.

**A palette applies only to background artwork and UI colors/gradients.** Switching appearance swaps those assets/styles. It never applies a shader, shading, illumination, tint, color grading or another effect to the character. Earlier references in this note to scene illumination describe the appearance of background art, not runtime lighting or a character-rendering feature. The real demo character composite must remain the same pixels across every comparison, rendered deterministically over the empty environment studies.

The only possible exception is a reflection implemented in code, if included by the lead. Reflection is optional, is not an end-user appearance control, and does not authorize changing the source character or adding a general effects system. No runtime illumination is implied by the dark/light pairing.

Palette-specific critique for the limited comparison:

- **Bronze:** strongest continuity with Obsidian's quiet material seams. Bronze marks should identify selection or the main action, while neutral text carries ordinary information. Do not let decorative bronze seams resemble focus/selection indicators or let the light study become a golden sunrise. Pale bronze fills require dark labels in the dark appearance.
- **Frost:** strongest cooler alternative. Cyan should remain a limited UI accent; a wide luminous cyan horizon, neon outlines or blue haze could dominate the real sprite and shift the chamber toward a sci-fi control room. Light Frost needs enough separation between white UI backing and the pale background to retain grouping.
- **Sage:** useful softer alternative. Keep the background's green subdued so the study does not imply green light falling on the character. Green selection accents must include a check/outline and must remain distinct from success status through text/icons. Avoid making every available equipment state look affirmative merely because the accent is green.

Across all three, compare the same character size, pose, framing, UI content and backing strength. A palette cannot establish superiority if it is also given a quieter horizon, clearer labels or a larger character than the alternatives. The existing opaque-pair contrast calculations remain useful starting evidence; generated artwork and composited gradients need their own visual/contrast review. These mini-mockups do not establish runtime behavior or certify accessibility.
