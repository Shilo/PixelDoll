# GlassKit evaluation — 2026-10-23

## Decision and evidence

Adopt **restrained GlassKit surfaces in the isolated prototype**. Keep Obsidian / Porcelain Bronze, the HD world, unlit demo artwork, open equipment rail, serif identity headings, readable system UI text and underlined navigation. The user's new request authorizes this experiment despite the earlier no-GlassKit rule. Production Studio has not been migrated or given a dependency.

[Open the screenshot comparison gallery](http://127.0.0.1:5202/glass-review.html). Each variant has 34 captures: all five screens in dark/light and desktop/phone, plus menus, dialogs, real coverage toasts and mobile creator directions. Both alternatives have 34 equal-resolution before/after pairs. Desktop: 1920 × 1080. Phone: 450 × 800. Device scale: 1. Baseline images were captured from `091f4bd` before integration. Gameplay toast captures can differ slightly in actor position because movement is real. PNGs stay local/ignored; scripts and documentation are tracked.

| Option | Controls / panels / dialogs | Navigation | Assessment |
| --- | --- | --- | --- |
| Before | 5 / 8 / 10 px | Open underline | Quiet composition; basic temporary surfaces and unresolved border/focus aliases |
| **Restrained — recommended** | **8 / 12 / 16 px** | **Open underline** | Modestly softer geometry, consistent readable fields, bounded glass surfaces; preserves character focus |
| Rounded — comparison only | 16 / 24 / 24 px | Grouped glass selector | Larger capsules feel approachable, but desktop choices contract and phone navigation crowds the prompt; no inspection benefit |

The geometry change is intentional, not pixel-identical. The rounded version uses our palette and typography rather than the entire stock theme. It demonstrates the relevant tradeoff without importing unrelated background effects.

## Research and challenges

Apple calls its material **Liquid Glass**. GlassKit is an independent CSS interpretation, not an Apple framework. Apple's guidance favors sparse controls/navigation materials, discourages stacked glass, and makes legibility central. Native materials adapt to their surroundings; CSS GlassKit does not reproduce that adaptive contrast or lensing. We therefore provide explicit fills, local gradients and semantic colors. [Apple materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Meet Liquid Glass, principles](https://developer.apple.com/videos/play/wwdc2025/219/?time=631).

Selective glass complements this project when it separates a transient control from the moving world. It conflicts when every heading, equipment item and section becomes a shiny card. The recommendation has one persistent filtered surface in Preview (playback), none in gameplay until an overlay appears, and no filter on individual fields. No full-screen blur, actor lighting, aurora background or droplet JavaScript was added.

Reviewed the pinned README, docs, component reference, theme override template, current changelog and actual selectors for tokens, buttons, forms, segmented controls, modal, popover, toast, surface presets, focus and motion. Unrelated calendar/table/date-strip components were not introduced. Cached pages disagreed on version; fresh GitHub and npm queries agreed on **1.30.0**. [GlassKit docs](https://glasskit.jungherz.com/docs.html), [pinned README](https://github.com/JUNGHERZ/GlassKit/blob/9be4ef3a801331cfdf0ec6de0c7fb964db6febc6/README.md), [pinned CSS](https://github.com/JUNGHERZ/GlassKit/blob/9be4ef3a801331cfdf0ec6de0c7fb964db6febc6/glasskit.css).

Key findings:

- CSS-only components do not supply a complete interaction system. Keep native buttons/selects/dialog, existing handlers and live regions. Our dialog follows the documented native overlay/panel pattern with an accessible name and focus return.
- There is **no tooltip component** in the reviewed catalog. Native title hints, accessible labels and explicit Help dialogs remain; inventing hover-only tooltips would add unnecessary behavior and accessibility work.
- Upstream source explicitly identifies its default white-on-orange primary gradient as below normal-text AA contrast. Keep solid bronze with our existing on-accent ink; do not assume library defaults are accessible.
- Upstream fields blur individually, override typography and remove outlines. A named cascade layer keeps local type/layout authoritative. The adapter removes per-field filters and restores visible focus.
- Derived tokens resolve where they are declared. Existing colors were on body while border/focus aliases were on root, leaving aliases invalid. Moving active-design colors to root repairs this. Stronger form boundaries are partly a pre-existing theme fix, not evidence that glass alone improved the UI. Accidental boxed equipment borders were rejected.
- The actual annotated CSS is **150,788 bytes / 31,530 gzip bytes**, larger than the README's stale marketing size. It is pinned locally with MIT attribution, no CDN or additional JavaScript framework. [Source/hash/license/update contract](vendor/glasskit/README.md).

## Screen decisions

| Screen | Changes | Preserved |
| --- | --- | --- |
| Selection | Search-field edge and modestly softer action/row geometry | Cast in the world, south-frame thumbnails, paging/search |
| Creation | Shared quiet fields, stronger boundaries, reliable focus | 15 px phone / 20 px reference-desktop field text, native selects, full scroll access; no glass section cards |
| Preview | Playback rim, soft shadow and 12 px blur | Open navigation, unchanged character/reflection, independent facing/playback, equipment placement |
| Top-down | Shared equipment and transient materials | Continuous movement/camera; no persistent glass navigation container in recommended variant |
| Side-scroller | Same shared surfaces as Top-down | Camera-appropriate ground, same world palette, no extra scenery or lighting |
| Menus/dialogs/toasts | GlassKit surface components, shared corners and bounded opacity | Existing anchors/placement, functional copy, native modality and notification behavior |

## Shared implementation

`theme.mjs` is still the color source. Root `data-theme=dark|light` serves GlassKit; body `data-theme=obsidian|porcelain` identifies the environment. The same function sets both. Review-only baseline preserves the original token scope for comparison.

`glass-theme.css` imports unchanged vendor CSS in the lower-priority `glasskit` cascade layer, maps semantic tokens, and contains intentional adaptations. Responsive layout/type stay in `styles.css`. `material.mjs` applies one shared selector/component map after rendering; no observer, extra preference, framework or repeated per-screen implementation. `?material=baseline|restrained|rounded` is review-only. The ordinary URL defaults to restrained.

Fields use a 92% surface fill and dedicated stronger border without blur. Overlay rims remain quieter. Solid bronze primary actions retain full-width placement where appropriate. Native dialog wraps the GlassKit panel; its overlay does not filter, because even blur(0px) creates another backdrop boundary. Close restores the triggering action after render.

## Verification and limits

Text/secondary/accent tokens over a 92% surface were bounded against worst-case black/white backdrops. The minimum is **4.85:1** for Porcelain secondary text. Primary buttons: **8.10:1 dark**, **6.68:1 light**. Field borders exceed 3:1 against the intended homogeneous theme surface; this is not a universal assertion over arbitrary replacement worlds. These panel calculations are not a full-app accessibility certification. [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Reduced transparency, increased contrast and forced-colors use opaque fills and actual `backdrop-filter:none`. Reduced motion disables transitions. A support fallback provides opaque surfaces if backdrop filtering is unavailable. Preference support is not universal, so the normal fill is readable without it. [MDN reduced transparency](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency), [MDN backdrop filter](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter).

Validation includes Codex browser DOM/screenshots, 18 existing interaction checks (including original sprite RGB), 16 theme/material/viewport combinations, mobile-font regression checks, modal focus return, contrast/preference tests and 12 motion unit tests. Tested viewports: 1920 × 1080, 450 × 800, 390 × 844, 844 × 390. WebKit 27.2 on Windows passed four additional dark/light desktop/phone smoke cases covering creation, all studio views, movement and dialogs. This is not physical iOS testing. [Material report](glass-verification.json), [interaction report](verification.json), [WebKit report](glass-webkit-verification.json).

Frame sampling exercises actual glass: animated Preview and continuous movement with a missing-equipment toast. The recorded local headless pass had median intervals around 16.7 ms in Preview and 33.4 ms in the moving world for all variants, with variable tail timings. This is smoke evidence, not proof of no GPU/battery cost. Physical mobile-device validation remains necessary before integration.

## Independent challenge and resolution

GPT-6.1 Sol High challenged hierarchy, geometry, mobile fonts, field contrast, focus lifecycle, source pinning and performance coverage. We agreed to keep open navigation and reject rounded navigation as the default. Its real findings—smaller phone text, weak initial field borders, lost dialog focus return—were fixed and independently rechecked. We accepted stronger field borders but rejected heavier edges around every item. Performance checks were expanded from an unfiltered gameplay view to actual glass surfaces. Final verdict: no blocker within the isolated prototype. [Full review history](glasskit-review.md).

Reproduce under Node 24.22.1 with `capture-glass.mjs restrained`, `capture-glass.mjs rounded`, `verify.mjs`, `verify-glass.mjs`, and `node --test motion.test.mjs`. Use `verify-glass.mjs --no-report` to repeat validation without replacing the recorded timing samples. Original before captures are retained.
