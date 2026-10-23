# Obsidian Holodeck: direction review

**Current accepted direction: [current-design.md](current-design.md).** Bronze is selected; movement continues through animation/direction fallbacks; incompatible equipment temporarily hides; prompts expand from one line; mobile uses a dynamic joystick. The discussion below is retained history, not the controlling interaction contract.

2026-10-23. **Proposed direction for discussion; not an approved implementation specification.** No new image mockups, application changes or playable prototype in this round. The user requested agreement in text before more images, followed later by a small isolated rendering proof.

**Subsequent update:** The user accepted the core direction and clarified background/UI-only themes, unlit exact source sprites and code-only optional reflection. The [decision record](decisions-2026-10-23.md) is now the controlling state. [Palette studies](palette-studies/README.md) are authorized and completed; full-screen mockups and the playable proof remain deferred. The original discussion below is preserved as history, including proposals superseded by those clarifications.

This review corrects the round-three images and workflow notes. The approved visual preference is their immersive, minimal composition and Obsidian Holodeck atmosphere. Their slogans, invented workflow steps, dual Customize/Play buttons and always-present projection selector are not requirements.

## Lead recommendation

Retain a full-screen Obsidian chamber, a large unmodified pixel character, restrained contact shadow/reflection, left-side identity, and one right-side equipment zone. On portrait phones that zone becomes a bottom sheet. Use the world's lighting and surface to create depth; avoid dressing the interface in additional decorative borders or effects.

Reduce the bright bronze horizon and rough floor around the character. The purpose of atmosphere is to support inspection and play; lighting must not overpower the silhouette, equipment edges or palette. Keep the character's pixels and colors faithful to the actual composite, rather than reproducing the image generator's embellished character.

## Screens and workflow

| Screen/state | Recommended composition and behavior | Challenge to the previous proposal |
| --- | --- | --- |
| Characters | Characters stand in the world; selected actor is prominent. Title **Characters**, selected name, **Customize [name]**, New character and Import. Search and paging remain reachable as the collection grows. | An in-world carousel alone is slow for a large library. Retain a compact searchable picker, without making a card grid the default screen. |
| Initial/return visit | Show the demo on first use. On return include the demo and saved characters, selecting the last used character when available. Label the demo explicitly. | Always selecting the demo would repeatedly interrupt returning users. Selection is the requested landing screen, not an added home or splash screen. |
| Studio — Preview | Title **Customize character**, character-name switcher, shared wardrobe at right; **Preview / Top-down / Side-scroller** at top center. Below the actor: animation selector, playback and supported directions; detailed timeline/frame controls only when requested. | Remove the redundant Customize/Play buttons. Preview is a view within the studio, not a separate editor route. |
| Studio — Top-down | Same identity and equipment layout. Held-key movement, timed animation, following camera. Hide manual playback, facing and move-authoring controls. | A tab is not proof that the character has compatible directions and complete equipment coverage. Explain unavailable coverage rather than silently faking frames or making paid calls. |
| Studio — Side-scroller | Same shell, side-view scene and compatible character artwork. Initially flat-ground left/right locomotion. | A direction preset does not repair an incompatible camera pitch. Do not imply jumping, platforms or new animations merely because the view is called Side-scroller. |
| Create character | Separate screen titled **Create character**, name in its header, existing creator controls arranged in a readable right-side form; world and honest size guide on the left. | Do not shrink the current dense three-column form into a narrow wardrobe panel. The creation form needs more width/vertical space, while retaining the full-screen world. |
| Creation progress/result | Honest operation progress; generated result, quality notes, local save status and **Start dressing up**. Preserve existing recoverable failures and paid-request safeguards. | Remove Imagine/Review/Animate steps. Current generation includes idle and walk and saves before result review. |

The character name opens the same switcher in all studio views. Switching preserves that character's equipment and pending work, but never transplants items between incompatible bases. Top-center view tabs stay separate from the equipment tabs because they change the world/interaction mode, not the current equipment task.

Keep the equipment area geometrically stable when Moves is unavailable in live views. Wardrobe, Colours and Outfits retain their positions. Preserve every actual equipment category, including Face; the old images' short category row is not a complete inventory.

Preserve all-direction inspection, frame stepping, zoom/fit and transparent-pixel inspection in a contextual Preview inspection surface. This is access to existing output-validation functionality, not a return of world Grid/Bounds/Proof buttons. The permanent central strip stays compact.

The existing demo has south/east/north and mirrored-west walk frames, plus a south-only Cross punch; it has no idle/jump or separate side-camera set. Existing E/W profile walking can support a visual experiment, but must not be advertised as newly generated side-camera coverage. New creator output includes idle/walk; these are different data states.

## Creator controls that must survive the redesign

- Linked **Appearance / Prompt**, text input, Kind, Build, Proportions and Skin; Not set defaults and the exact assembled prompt.
- Help, API call inspection, Copy, Enhance and Undo. Enhancement remains optional and retains originals.
- Body size presets/custom entry; 4 px increments; Auto/custom frame; aligned Body/Frame schematic with px units.
- Camera and its help; five direction presets; eight individual directions and explicit reversible mirror controls; Seed last.
- Create character with a nearby muted but readable cost estimate, connection/eligibility feedback and relevant generation state.
- Result quality notes and access to the saved character. Cosmetic simplification must not remove truthful warnings or state.

For desktop, group the form into Appearance, Size/camera and Directions without inventing a paid multi-step wizard. Keep the normal flow visible; seed/help/API details can use contextual disclosure. On phones, use one scrollable form and a reachable action footer; the world/size guide may occupy a smaller region while typing. Permanent world visibility is less important than completing the form comfortably on a short screen.

The sample body must be labeled as a **Size guide** before generation. It is not a live prediction of the user's prompt. The creation direction preset named Top-down is asset-generation configuration; the studio Top-down tab is a gameplay view. These must not be conflated.

## Copy, utility actions and appearance

Use plain task labels: Characters, Create character, Customize character, New item, Import and Export. Retain the character's actual name, not an invented class. Under the name, allow one quiet line from the saved appearance description with the complete prompt in Details. Do not invent an AI summary or use a long raw prompt as permanent scenery. Omit the line if absent. Facing belongs with the facing controls; status appears only when actionable.

Keep Undo and Export reachable; move the light-mode glyph to a horizontal **More (…)** menu with Appearance, relevant settings/help and GitHub. Connection/balance belongs near paid actions or in the relevant account/settings surface, not as a permanent promotional banner.

Recommend two coordinated appearance presets: **Obsidian (dark)** and **Porcelain (light)**. Change scene, text, local backings and control colors together. Porcelain should be the same chamber in pale materials and diffuse light, rather than the prior bright sunrise exterior. Matching geometry preserves orientation and makes the pair feel like one product.

Games provide precedents for both UI themes and separately altered world rendering; this does not establish that coupled scene/UI switching is standard. The paired choice here is a product recommendation. Independent UI/world selectors would multiply settings and validation cases without a demonstrated first-version need.

| Palette family | Proposed accent, dark / light | Lead assessment |
| --- | --- | --- |
| **Obsidian / Porcelain Bronze** | `#C9A66B` / `#76562F` | Recommended: warm, restrained and closest to the preferred world. Charcoal/ivory surfaces; bronze marks selection and major actions, with much quieter bronze in the floor. |
| **Graphite / Frost** | `#9DCDDA` / `#2E697D` | Strong alternative: cooler and more clinical. Keep cyan sparse to avoid a busy science-fiction HUD. |
| **Basalt / Sage** | `#B4C8A1` / `#4A654A` | Softer alternative: welcoming, but less close to the preferred neutral Holodeck. Avoid tinting the sprite green. |

The research also considers Ink/Lavender; the lead does not recommend prioritizing it because it moves farther from the preferred world and competes with equipment colors. These are candidate tokens, not a claim that the unrendered world/UI combination passes contrast checks. Semantic warning/error/success roles stay distinct and include text/icons. A warning cannot look like an equipped-item highlight merely because both use warm hues.

Preserve a small set of consistent shapes: gently rounded rectangular item/action targets, circular color swatches, thin tab underlines, a check plus outline for selected items. Avoid relying on color alone or using decorative gold for every actionable element. Keep visible controls light while giving them generous hit areas. Local gradients/scrims must guarantee readability over every supplied scene; average image brightness is not a contrast test.

## HD 2.5D and modular scenes

Keep the art direction. Static selection and Preview can use the same retained high-resolution background. Continuous live movement needs world-relative ground and appropriate view-specific atmosphere; scrolling the rendered mockup as a single picture would expose the illusion. A fixed-camera 2D renderer with layered HD art is the first approach to test; a real ground plane is justified only if the visual proof shows the perspective requires it. No rotatable 3D character, engine conversion or full lighting simulation is implied.

Reflections should reuse the complete current character composite and frame, including equipped layers. Start with a restrained faded ground reflection and contact shadow. This is an artistic approximation, not a physically correct reflection reconstructed from RGBA pixels. Configure reflection per scene/view; test Preview first, keep it off by default in steep top-down view, and evaluate side view separately. Effects never change the exported asset pixels.

Use a small scene configuration for Selection, Preview, Top-down and Side-scroller, with separate dark/light assets and per-view reflection settings. Selection and Preview point to the same asset by default, but may be assigned different assets. Retain a persistent background layer and cached decoded assets when the resolved asset identity is unchanged; comparing paths alone does not prevent remount flashes. Load replacement art before switching and retain a fallback. Replacement backgrounds also need declared ground/character anchors and readable UI zones; an arbitrary image cannot automatically work as a playable world.

Start with configurable assets, not a scene editor. Artist/developer replacement satisfies modularity without adding a new end-user editing workflow. Runtime live-scene assets may be layers or ground textures rather than a single background image.

## Mobile and later proof

Use the same view names and equipment hierarchy on phones. An expandable bottom equipment sheet preserves the actor when compact and usable controls when expanded. Keep view tabs near the top where possible; do not scatter categories along another edge. Minimum visualism is not a reason to shrink target areas.

Touch gameplay remains unresolved: keyboard WASD/arrows alone does not make a phone playable. A direct drag gesture in the world is a candidate to test, with release-to-stop and protection against equipment taps; it must not be silently assumed usable or introduced as an approved joystick. Camera/animation motion should respect reduced-motion needs without breaking responsive locomotion.

After text agreement, make image comparisons with the same composition and real character reference so palette differences are assessable. Cover desktop/mobile selection, creation and studio, plus both live views. Include form, result and overflow states sufficiently to verify the real workflow, rather than generating more background-only variants.

After image review, build a small isolated visual proof using existing local assets: selection-to-studio transition; Preview/Top-down/Side-scroller; continuous held input, authored frame timing and camera follow; one equipment swap; paired appearance; configurable reflection. Test shared-image transitions, feet/ground alignment, dark and light outfit readability, phone framing and scrolling. No paid generation, full library integration, combat, platforms or production migration is needed to answer these rendering questions.

## Evidence

- [Current workflow review](current-workflow-review.md): source and screenshot verification.
- [Game themes and color research](theme-research.md): official examples, palette candidates and contrast limits.
- [World feasibility](world-feasibility.md): renderer/compositor evidence and implementation boundaries.

Three GPT-6.1 Sol / High researchers reviewed the current workflow, official game/theme guidance and renderer feasibility. The lead reviewed their findings against the actual creator screenshot and preferred world images, rejected unnecessary independent theme controls, corrected an outdated fixed-size assumption, and removed residual Play-button recommendations. Final decisions here remain proposals for user discussion.

These are research and design judgments, not runtime acceptance tests. Existing untracked creator verification reports and screenshots are separate work and were not changed.
