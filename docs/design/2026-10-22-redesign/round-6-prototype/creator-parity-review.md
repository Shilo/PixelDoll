# Creator parity review

2026-10-23. Review only. Compared both round-five themes against the round-six creator before the lead's current parity corrections. Read `round-5-mockups/render.mjs`, prototype `main.js` and `style.css`, and checked the source-form checklist. Reopened existing prototype evidence and captured fresh isolated, keyless creator states at 1920 × 1080 and 450 × 800 in both themes. No implementation edits or paid calls. Temporary review captures are under the session visualization directory, not application assets.

## Main finding

**The desktop creator loses the approved type scale and control hierarchy.** It uses the same Segoe UI and Georgia families as the image mockup; replacing the families is not the needed correction. Most form text was reduced by about one third, while the world and title retained their size. The resulting form looks sparse and incidental against a large dramatic background. This applies to Obsidian and Porcelain because their layout/type rules are shared.

Mobile has a different problem: input values are already close to the reference's logical size, and the title is larger. Its section headings, header allocation, oversized size guide and insufficiently quiet background cause more of the mismatch than a universal font-size reduction. Do not multiply every mobile dimension by the desktop correction factor.

The lead is implementing corrections concurrently. Findings below describe the baseline and specify the desired outcome; they are not a claim that the latest parity overrides were independently verified.

## Worse: specific differences and corrections

| Element | Round-five reference | Round-six baseline | Correction |
| --- | --- | --- | --- |
| Desktop input/textarea text | About 22–23 px | 15 px | Use 20–22 px in creator inputs/selects/Details. Keep enough line height and at least roughly 48–54 px field height. |
| Desktop labels | About 19–22 px; section labels clearly visible | Labels 13 px; small section labels 12 px | Use 17–19 px labels and 20–22 px section headings. |
| Desktop Appearance/Prompt tabs | 24 px, active Appearance semibold | 15 px regular | Restore 22–24 px tabs and active weight/underline. |
| Desktop presets | 18–21 px; directions in a deliberate 2 + 3 grid | 12 px; all five directions share a row, wrapping labels into narrow stacks | Use a two-row grid: first two span half width; last three share the next row. Keep complete labels on one line at the desktop target width. Use about 18 px. Body presets remain one row. |
| Compass | Separate arrow and facing label; aligned columns, clear mirror strips | Text-only direction buttons, 12 px labels, compressed vertical rhythm | Restore arrow icons and label hierarchy. Preserve independent mirror buttons and aligned compass columns. Around 18 px labels and 88–94 px tiles suit the desktop reference. |
| Desktop exact-prompt excerpt | About 18 px, short excerpt plus Copy and continuation cue | 12 px, many short lines and no local Copy | Use 16–18 px, clear bounded excerpt/scrolling, and restore its own Copy action. Retain the full underlying exact prompt. |
| Contextual help | Trait, body/frame, camera, directions and seed cues | Only generic creator Help in baseline | Restore contextual access without requiring a person to infer all field semantics from generic help. |
| Desktop size guide | About 228 px diagram and 23 px dimensions in the 1920 image | 180 px-wide guide, 170 px diagram, 13 px text | Bring diagram to about 220–230 px and text toward 18–20 px. The schematic must remain generic, not an invented generated character. |
| Mobile section hierarchy | “Size and camera” and “Directions” around 17 logical px; labels about 14 px | No Size-and-camera heading; body/direction headings 12 px | Add a readable section heading around 16–17 px, labels around 14 px, input text 15–16 px. Source app already uses 16 px mobile inputs. |
| Mobile header/form allocation | Title starts around y50; name around y87; body begins around y170 at 450-wide logical scale | Title top70; name top116; body top211 | Recover roughly 30–40 px: title around top50, Name around top86–90, form around top175–180. Keep safe separation and usable input height. |
| Mobile size guide | About 105 px square at a 450-wide presentation | 200 px-wide guide and 170 px-high diagram | Use roughly 112–125 px width and 110–120 px diagram height, with a proportionate silhouette. The current guide consumes space needed for dimensions and Camera. |
| Mobile background behind form | Soft near-uniform surface under text; subdued floor | Generic scrim becomes transparent at 29–47% of screen height, revealing horizon/material lines directly through Details and compass | Add a creation-specific smooth scrim and/or stronger local field backing. Preserve the immersive world without a large boxed panel. Check both warm light and dark appearances. |

Reference values come from `render.mjs:50–53`, `:85–98`. Baseline prototype values are in `style.css:1–6`, especially `.creator`, `.editor-tabs`, `.presets`, `.compass`, `.size-guide`, `.mobile-guide` and mobile `.draft-*` rules; markup is in `main.js:45–46`.

The desktop title is already up to **54 px**, versus **48 px** in the reference. Mobile title is **29 px**, versus roughly **23 logical px** in the reference. These titles do not need blanket enlargement. The priority is to make their supporting form content belong to the same visual hierarchy.

## Mobile scroll states

Fresh baseline checks found the same geometry in both themes: the scrollable creator body is **484 px high** at 450 × 800; Appearance is approximately **694 px**, Geometry **639 px**, Directions **499 px**. Therefore some continuation is necessary and expected. A partial first viewport is not evidence that Skin, Camera or Seed was removed.

However, the baseline geometry-position image shows the guide diagram reaching almost to the footer before its dimensions and Camera appear. That is avoidable layout inefficiency, not a need for a new wizard. Shrink the guide and recover header space, then show Body presets/input, Frame, guide/dimensions and Camera together where the reference does. Keep one form with stable header/footer and body scrolling.

At the baseline Directions section's top, the full preset row, compass, mirrored summary and Seed can be exposed through scrolling. The old saved `mobile-porcelain-create-directions.png` instead starts near the bottom: its preset row is clipped at the top because of its selected scroll position. Refresh evidence at the section heading, not only `scrollTop = scrollHeight`, to compare with the approved Directions continuation. Do not “fix” an arbitrary scroll crop by changing the form into steps.

The attached mobile mirror controls are already **44 CSS px wide**, an improvement worth preserving. Restoring arrows and stronger headings must not shrink them. Footer space remains reserved; recheck the final Seed field against it after changing type or spacing.

## Better and intentional differences

- **Better:** native input/select/textarea controls, real focus outlines and actual scrolling make the draft testable. The form is separate, has an editable name, keeps all four traits, preserves the five direction presets and individual mirror controls, and shows no fictitious generated character.
- **Better:** the prototype's full exact-prompt editor exposes and preserves the actual base-body instruction. The older mobile evidence happens to show the Prompt tab and an edited name, so it should not be mistaken for a like-for-like Appearance reference. Fresh comparisons started from the same Forest scout example.
- **Intentional prototype scope:** Enhance and Create are disabled because generation is disconnected. No paid actions should be enabled merely to make a brighter screenshot. Their dim appearance is a known scope difference from the approved ready-to-submit form, rather than evidence of a new palette direction.
- **Intentional prototype disclosure:** the footer says generation is not connected instead of quoting a live price. This is truthful scope information. For strict visual comparison, retain a visually coherent generation-estimate slot or clearly distinguish the reference's ~57–75 gens from the prototype disclaimer; never present a disconnected estimate as a verified account quote.
- **Intentional responsive behavior:** larger native touch fields may require more scrolling than the reference bitmap. Preserve usable targets and avoid compressing all fields to fit one image. The geometry guide's excessive scale and wasted fixed header space can be corrected independently.

## Form fidelity limits beyond typography

These are present in baseline `main.js:46`, `:71–75`, `:88`. They are not solved by CSS and should not be reported as validated production creator behavior:

- The hand-copied dropdown options differ from `CharacterForm`/`characterConfig.ts`: Undead, Muscular, Rounded and the exact skin choices are missing, while Average/Heroic/Fair are introduced. Reuse the source contract rather than designing alternative character options.
- Auto frame uses `ceil(body × 1.25)`, which yields 48 → 60 and 96 → 120, versus source Auto 48 → 64 and 96 → 128. The guide's proportions are also static rather than driven by body/frame geometry.
- Direction presets do not update Camera, and only the default Top-down 8 preset can show selected styling. Mirror toggles do not enforce the source pair/source-selection rules. This matters when reviewing interactive states, even though the initial example looks coherent.
- The toolbar Copy always copies the prompt, whereas the real Appearance toolbar targets Details and the excerpt has a separate exact-prompt Copy. Exact-prompt parsing/round-tripping is simplified and should not overwrite user edits on a mere editor-tab selection.

No API integration or full production workflow is requested by this review. The correction target is the approved visual hierarchy plus honest preservation of the existing form's visible contract, not a new creator feature set.

## Required recheck after the lead's corrections

Compare both themes at 1920 × 1080 and 450 × 800 using the same initial draft. Inspect Appearance, exact Prompt, geometry at its section top, and directions at its section top. Confirm readable labels/values, two-row direction presets, compass arrows, 44 px mobile mirror hit regions, full Camera access, and Seed clear of the footer. Confirm no content is lost behind a newly enlarged title, and that the quiet scrim works in both themes. Record remaining prototype limitations separately from visual parity findings.

## Review of the parity-after candidates

Reopened both desktop creator images and all six mobile creator/size/directions images in `evidence/parity-after/`. **The principal typography and atmosphere regression is corrected.** Desktop input text, tabs, labels and presets now form a readable hierarchy in both themes; the deliberate two-row direction presets and compass arrows are restored. Mobile has a quieter background, stronger tabs/labels, a smaller guide and usable mirror strips. The title was sensibly normalized rather than globally enlarged.

Two small layout corrections remain before calling the mobile section-position images a close match to the approved reference:

1. **Geometry:** Camera's label appears above the sticky footer, but its select is below that viewport. Recover roughly 60–65 CSS px within this section. A focused starting correction is: presets `margin:8px 0 12px`; frame row `margin:6px 0 10px`; mobile guide `margin:12px auto; width:112px`; guide diagram `height:104px`; geometry labels `margin-bottom:12px`. These tighten excess gaps and diagram space rather than shrinking the readable text or input targets. Recheck that Body/Frame dimension text remains clear.
2. **Directions:** Seed's label and only the top of its field appear before the sticky footer in both themes. Recover roughly 35–40 CSS px: compass facing height around 75 px, compass `gap:8px; margin:12px 0`, and seed `margin-top:16px`. Keep the independent mirror width at 44 CSS px. Recheck the complete Seed field with breathing room above the footer.

These controls remain reachable by further body scrolling; the finding is **section-view completeness**, not that Camera or Seed has been removed or made permanently inaccessible. The initial Appearance viewport may likewise continue below the fold. It should remain an honest scrollable form, not compressed into a wizard or reduced to undersized controls.

Contextual Help and local excerpt Copy remain documented prototype omissions and are not grounds for a new nonvisual implementation task in this review. Paid controls should remain disconnected. No other genuinely required visual correction was found in the eight inspected after-images. The exact Prompt editor and functional production-form semantics were not revalidated as part of this image pass.


## Lead final verification

Subsequent spacing-only refinements and regenerated captures show the complete Camera select in the mobile Size view and the complete Seed input in Directions, in both themes. The lead inspected the full-resolution final files. Text and 44 px mirror widths were preserved; geometry gaps/guide and compass spacing were reduced. All 15 browser checks passed after this final CSS change.
