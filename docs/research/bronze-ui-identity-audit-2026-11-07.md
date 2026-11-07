# Research spike: Bronze UI identity and perceived AI sameness

Date: November 7, 2026. Status: research and browser review completed; visual changes remain proposals.

## Finding

The user's concern is supported at the **control and work-surface level**, especially Export. PixelDoll and the reference both combine dark neutral backing, rounded outlined controls, muted functional text, thin line icons, lightly tinted selected cards and a filled accent action. A custom CSS package does not automatically make that combination feel authored or distinctive.

PixelDoll's complete composition is substantially different: a large actual character in an open stage, display serif headings, spatial direction controls, equipment artwork and a contextual dressing rail. Its warm Bronze and cream/brown light appearance also differ from the reference's lavender app accent. Preserve those strengths while investigating whether the control layer feels sufficiently connected to them. Rounded corners, a system font and a matte finish are individually defensible; none establishes AI authorship or poor design.

**Recommended first experiment:** retain the current palette, typography, layout and radius baseline and compare a restrained, coherent material treatment for controls and overlays in Bronze UI. Evaluate scene-art cohesion separately. Do not approve either change solely because it looks less familiar.

The coworker's feedback specifically identifies palette, matte flatness, font and missing UI art. This is actionable qualitative evidence from one viewer. It does not establish what all users prefer. The [independent research and challenge](bronze-ui-ai-design-research-2026-11-07.md) explains the online evidence, its limits and why an anti-AI style blacklist would be another weak design recipe.

## Scope, method and limits

- Read the complete English [Pixel Studio landing page](https://pixelstudio.riffsource.com/en/), including its workflow, six feature descriptions, local-data/credential claims, download notices, footer, appearance control and all five expanded FAQs. Visually inspected its hero, workflow, tools and trust sections in the Codex in-app browser, including light and automatic-dark presentation.
- Opened **all five distinct raster images** exposed on that page: its brush logo and all four full-size app captures. The two repeated logo instances are one image. Inspected all three user-provided crops against the full export/workspace captures.
- Did not download, install, execute or inspect a source checkout of the reference application. Reading public webpage images and saving browser evidence is the extent of reference access. External corporate, legal and release-history pages are outside this visual comparison. Safety, telemetry and credential statements are website claims, not verified behavior.
- Tested this checkout of PixelDoll on a new normal local origin, `http://127.0.0.1:5217/`, with the bundled demo and no account connection. No agent-token server, token entry or PixelLab generations were needed. Appearance changes, navigation, a local export-format selection and showcase controls were reversible test interactions.
- Read local Bronze UI tokens, component recipes, base CSS, README, style guide and historical research; checked the installed package and PixelDoll adapter/layout. Reviewed the standalone [Bronze showcase](https://shilo.github.io/bronze-ui/) in the Codex browser, including all six sections and actual sample interactions.
- Compared observed layouts and states, rather than claiming pixel-identical control metrics from compressed reference screenshots. Exact reference app font, radius, CSS implementation and hover/focus behavior are unknown. The reference captures cannot establish its accessibility or runtime quality.

The page labels its app captures **0.4.26, November 6, 2026**, while offering **0.8.0** downloads. This audit concerns the pictured interface, not a tested 0.8.0 installation. PixelDoll displayed **0.3.62-dev**. The local Bronze source, installed package and app dependency were **0.2.8**; older design documents naming 0.2.2 are historical, not the runtime used here.

## Reference image inventory

| Image inspected | What is visible | Comparison implication |
| --- | --- | --- |
| [Workspace capture](https://pixelstudio.riffsource.com/images/5452c11564935c08dcfbfed4.webp), 1920 x 1259 | Persistent left navigation; central generation form; right checkerboard preview and asset tray; top Import/Export; connected status at lower left | Strongest evidence for outlined icon-label actions and anonymous utility-control rhythm. Its multi-column workbench is different from PixelDoll's open stage. |
| [Inspection capture](https://pixelstudio.riffsource.com/images/022e2fa0b8ea7ff1d6c31c88.webp), 1920 x 1253 | Before/after comparison, enlarged source pixels, comparison slider, retained sidebar | Both products need precise pixel inspection. A checkerboard and enlarged pixel art are task conventions worth retaining where useful. |
| [Project-style capture](https://pixelstudio.riffsource.com/images/c8f73fb0d48e580382c621bd.webp), 1920 x 1253 | Rounded bounded groups, dense fields, palette hex text, style references, lavender save action | Dense charcoal forms are closer in mood to PixelDoll's creator than either full-screen composition is. |
| [Export capture](https://pixelstudio.riffsource.com/images/736295a73f444966459b0978.webp), 1920 x 1253 | Opaque modal, stacked radio cards, lavender selection fill/border, description area, lower-right primary action | Closest match to user crop 1 and PixelDoll's Export vocabulary. Similar interaction grammar; different grouping, content and layout. |
| [Brush logo](https://pixelstudio.riffsource.com/images/592cd058d7c84f86d599e3fc.webp), 1254 x 1254 | Purple/gold faceted brush and pixel marks on a softly modeled app tile | More illustrative branding than its functional app controls. Does not imply PixelDoll needs a brush identity or matching icon style. |

The marketing site and captured app have distinct visual languages. The site uses pixel display lettering, numbered editorial sections, a dotted backdrop, green/lavender contrast and a block-like offset CTA edge. The pictured app is predominantly a restrained charcoal/lavender workbench. Do not attribute the site's expressive display font or CTA treatment to its app controls.

## Similarities and differences

| Dimension | Similarity actually observed | Difference and design judgment |
| --- | --- | --- |
| Dark palette | Near-black canvas, charcoal surfaces, warm-white text and muted gray secondary text | PixelDoll uses warm gold/Bronze; reference app uses lavender. Similar value structure can feel related despite different hues. A hue swap alone would leave that structure unchanged. |
| Light palette | Only the reference website's light mode was available for live review | PixelDoll uses porcelain/cream with brown Bronze. No reference light-app capture was present; do not infer one from its website switch. |
| Button silhouette | Soft rounded rectangles, thin outlines, line icon followed by text, filled primary actions | Useful familiar action grammar. PixelDoll also has open text actions and underline navigation. An exact shared radius was not established. |
| Selection | Accent tint plus accent border; neutral unselected controls | PixelDoll equipment uses actual item art and a check; Export uses engine logos and radios. These specific meanings are stronger than a generic tinted rectangle. |
| Typography | Dense functional labels are restrained sans-serif, with muted supporting text | Bronze declares Segoe UI/system UI for function and Georgia for display. The reference landing page has pixel display text; its app's exact font is unknown. PixelDoll is not using Inter in the reviewed theme. |
| Materials | Most work surfaces read as opaque, matte and low in tonal variation | PixelDoll has open scenery and a bounded floating playback bar. Its distinction is less obvious inside dense forms and modal work surfaces. |
| Layout | Tools surround an artwork preview; secondary actions and advanced content are contextual | Reference has permanent navigation and a multi-pane asset tool. PixelDoll prioritizes the dressed actor with equipment on the right or below. It is not a dashboard-card composition. |
| Art | Both use crisp authored/generated pixel content and small line-icon controls | PixelDoll's large sprite stands in a smooth HD chamber. That can feel like two art languages. It is a cohesion hypothesis, separate from the reported control styling problem. |
| Density and rhythm | Forms repeat equal-height bordered fields, compact descriptions and choice groups | PixelDoll has a spatial compass with joined mirror controls and a body/frame diagram. These are meaningful custom UI, even though their surrounding recipes are familiar. |
| Feedback | A neutral status treatment can resemble a small bordered row | User crop 3 is the reference's connection status, not a toggle. PixelDoll's production connection action is contextual in More; its notices distinguish severity using text/icons and an edge marker. Similar dots or icons do not establish identical workflows. |

### The three supplied crops

1. **Original file choice:** the resemblance is the complete selected-card recipe: rounded boundary, translucent accent tint, radio marker, strong label and smaller supporting copy. PixelDoll's engine choices reuse that grammar. This supports quick comparison and a large activation area. Retain those benefits; test whether material, spacing or selection emphasis can better express Bronze without changing the radio interaction.
2. **Import / Export:** the outlined secondary and filled primary actions, download icon and moderate corner softness are close. Those communicate hierarchy and familiar actions. Differentiation should come from the coherent system around them and its interaction finish, not an unfamiliar download symbol or hard-to-recognize button.
3. **PixelLab connected:** small muted text, a state dot, an outline and a settings icon feel like the same utility vocabulary. This is weaker evidence for a shared product identity than the export choices. Do not copy an always-visible account widget into PixelDoll just to restyle it.

## Bronze's intent and the mechanism behind the matte impression

The accepted [theme study](../design/2026-10-22-redesign/round-4-discussion/theme-research.md) selected warm Bronze continuity with the chamber, sparse accents and strong source-sprite visibility. The [theme foundation](../design/2026-10-22-redesign/round-6-prototype/theme-foundation.md) and [production contract](../design/production-experience.md) distinguish open scene, floating controls and readable work surfaces. Minimal setup and contextual controls follow the [usability principles](../usability-principles.md). This is a coherent direction worth refining, not evidence that every token was empirically optimized.

Source observations from `C:/Programming_Files/Shilocity/bronze-ui` and this app:

| Source | Current mechanism | Interpretation |
| --- | --- | --- |
| `styles/tokens.css` | Dark canvas `#111317`, surface **and field** `#202329`; text `#f2eee6`, muted `#b8b5ad`, accent `#c9a66b` | Field and container differences rely heavily on border and spacing rather than tone. Explains low material differentiation without proving poor readability. |
| Same tokens, light | Canvas `#eeeae2`, surface **and field** `#faf7f0`; text `#25282d`, muted `#5e625f`, accent `#76562f` | A deliberate complete warm pair. It should be evaluated on its own merits, not described as the purple/white AI stereotype. |
| Same tokens | Controls/panels/dialogs use 8/12/16 px radii; system UI plus Georgia display; compact shared spacing scale | Consistent grouping and restrained hierarchy. Values are a baseline, not proof of ideal geometry or a signal of who authored them. |
| Same tokens and `styles/components.css` | Floating material has 92% surface backing, 12 px blur, rim and elevation; work surfaces are opaque | Readability is intentional. At this opacity the material difference can be visually subtle. Test the distinction at actual size; stronger transparency is not automatically better. |
| `app/src/studio/experience/theme.css` | `--bg-side` and `--bg-raised` both alias the shared surface; `--shadow-1:none` | Several legacy host roles collapse to one appearance. A source-level explanation for flatness, not authorization for local overrides or new token proliferation. |
| `styles/components.css` | Primary accent fill; outlines/fields; selected tint/border; 2 px focus outline; circular switch/thumb and swatches; underline tabs | More purposeful variation than an all-pill system. Preserve clear state grammar and circular forms where their function benefits. |
| `app/src/studio/experience/layout.css` | Scene reading gradients, large display headings, separate open equipment area, responsive lower rail and centered playback | Product identity is strongest in composition and source artwork. A component gallery's specimen cards are not the production layout. |

Shared appearance belongs in Bronze UI. Task composition, reading-gradient placement, geometry, sprite presentation and world/domain artwork belong in PixelDoll. If a later material proof is accepted, release Bronze first and update PixelDoll's pinned dependency and lockfile. No node_modules patches, copied theme palette or per-screen appearance overrides.

## What to retain, investigate and reject

| Decision | User purpose | Proposed disposition and confidence |
| --- | --- | --- |
| Open stage and prominent actual character | Evaluate the whole outfit immediately; evoke a place without navigation chores | Retain. High confidence in fit to the product brief; user-study outcomes are still unmeasured. |
| Warm Bronze and porcelain pair | Quiet frame for colorful equipment; continuity between interaction accents and the scene | Retain as baseline. Medium confidence in emotional fit after coworker feedback; compare material before replacing the palette. |
| Functional system font and limited serif display | Fast label/numeral reading and a distinct name/heading voice without extra font loading | Retain as baseline. Compare weight, hierarchy and spacing before adding a font. A serif or unusual font does not itself supply craft. |
| 8/12/16 corner family | Soften controls and express containment consistently | Retain pending evidence. A bounded alternative can be tested for visual weight/grouping; no evidence here establishes an optimal numeric radius. |
| Opaque dense forms | Stable reading behind costs, validation and detailed choices | Retain. Explore clearer material hierarchy around them, not decorative noise through text. |
| Flat, nearly identical fields and work surfaces | Quietness and minimal distraction | Investigate first. Highest-confidence mechanism for the reported matte sameness; only medium confidence that a proposed change improves experience. |
| Equipment art, size guide and direction/mirror composite | Make dressing, framing and facing understandable through domain-specific visuals | Preserve and refine only for a demonstrated issue. These are the best places for product-specific UI art. |
| Smooth chamber beside pixel actors | Immersive neutral inspection space | Investigate separately with the existing [pixel-art world reference](../design/pixel-art-worlds-reference.html). A scenery replacement cannot settle the control-material concern. |
| Tactile feedback and selection clarity | Make activation, selection and focus confident | Investigate in real states. The existing Later card **Keep selected buttons clear on hover in Bronze UI** already tracks that specific issue; this spike does not implement or duplicate it. |
| Parchment, rivets, exaggerated bevels, noise or glow everywhere | No specific unmet task established | Reject as a blanket response. A restrained edge or material cue could be tested where it clarifies elevation/activation; decoration is not automatically wrong, but needs a coherent purpose. |
| Global pixel font, square corners, eccentric icons or extra theme settings | Novelty alone | Reject as the default response. These can impair readability, recognition or simplicity while creating another predictable game preset. |

## Later proof, with decisions that can be challenged

This is an evaluation proposal, not approval to redesign or spend on art. Keep the baseline as a candidate that can win.

1. **Control/material proof in Bronze:** compare baseline with one restrained treatment connecting primary actions, selected specimens and overlay elevation. Keep layout, words, artwork, palette, type and corner values fixed. A candidate might use a carefully controlled edge/value change to express a pressed or raised surface; avoid texture behind reading content. Reject it if controls become louder than the actor or state becomes ambiguous.
2. **Typography proof only if still needed:** compare actual labels, character names, direction letters, costs, errors and long descriptions at current sizes. Change hierarchy/weight/spacing before testing a new licensed font. Record readability, tone, fallback and loading costs. Do not assume a downloaded display face is more human.
3. **Artwork cohesion proof separately:** compare existing chamber with one already documented pixel-art direction, holding controls, actor, scale and content fixed. Evaluate silhouette, palette neutrality and suitability for non-fantasy characters. Do not select a biome or commission/generate art without its own approval.

Use the actual creator, Wardrobe, a small popover and Export in dark/light and desktop/portrait/landscape. Include selected with pointer over it, keyboard focus on a different item, disabled actions, empty/search results, long labels and error/recovery. Compare an overlay both in the scene and on a quiet backing so the backdrop cannot carry the entire identity.

Ask newcomers to select a head item, identify what is worn versus selected, change facing, find export and identify a paid cost before activation. Record completion, wrong clicks, missed state/cost and explanations of what feels coherent or impersonal. Ask aesthetic questions without labeling a candidate AI-made. Rotate candidate order. A small formative sample can expose problems; it cannot establish population-level superiority. Automated checks and reviewer taste cannot replace those observations.

For a substantial choice, record the observed problem, intended task/feeling, candidate, best alternative including no change, tradeoff, evidence and confidence in the existing plan/review. Keep small fixes proportionate. Every changed choice needs a reason, not a separate essay or a score pretending to detect AI.

## Browser review and test record

These are **manual Codex-browser observations**, not an automated regression or accessibility certification. Saved evidence is local and ignored under `app/test-results/bronze-identity-audit/`.

| Surface or action | Actual observation |
| --- | --- |
| PixelDoll desktop, 1280 x 720 | Opened Characters, New character, Preview, Top-down and Side-scroller in dark; Preview and Export in light. Actor, source equipment art, serif identity and stage/rail relationship remained visible. Live modes intentionally reported the demo's missing idle. |
| Production Export | Opened Export and Settings; changed Godot to Unity on the phone and observed selected radio and matching description. Also used ArrowRight from Godot on desktop and observed Unity selection/focus, then restored Godot. No ZIP was downloaded. Dark/light and phone/landscape presentations retained reachable close/footer actions in the captured views. Local preparation completed to a download action when allowed to finish; initial Preparing captures are transitional states. |
| PixelDoll 390 x 844 | Reviewed Characters/Preview/Export in light and Preview/New character in dark. Real creator focus ring, scrollable work content and persistent cost/action were visible. The bottom equipment panel gives far more screen area to neutral material than the desktop, increasing the importance of the material study. |
| PixelDoll 844 x 390 | Reviewed dark Preview and side-docked Export. The actor fits but is much smaller; heavy framing would consume scarce space. Document width matched viewport. |
| PixelDoll 320 x 568 | Reviewed dark Preview; document width matched 320 px. Equipment details require scrolling/expansion. This is a deliberate density constraint, not evidence for shrinking type or hit targets. |
| Bronze showcase | Visited Scene, Controls, Creator, Library, Feedback and Overlays in dark; Scene/Controls/Creator in light, including a 390 px layout. Reviewed disabled, selected, progress, warning/error and empty-state specimens. |
| Bronze interaction samples | Opened/closed Export; validated the default size, entered 1 px and saw inline error plus review feedback, restored 48 px and saw valid feedback; switched Transparent background off and observed off-state thumb/fill; focus remained visible after activation. No paid APIs exist in these samples. |
| Reference | All five distinct images inspected at full-image URLs; all FAQ content expanded/read. Live website dark/light was inspected separately from the captured dark app. No reference app interaction was claimed. |

Testing limitation: the viewport capability initially resized the showcase rather than the intended PixelDoll tab. The review detected this through `innerWidth`/`innerHeight`, used a separate PixelDoll tab, verified 390/844/320 widths and replaced mislabeled evidence. Do not infer responsive coverage from an attempted resize alone. Reset was requested and all temporary review tabs were closed at completion. The desktop PixelDoll tab's captured error-log query returned zero console error entries; this is not a full runtime error audit.

No implementation tests were changed or weakened. `npm run check`, unit tests and Playwright suites are intentionally skipped for this docs-only delivery under repository scope. Physical devices, touch gestures, screen readers, forced colors, reduced preferences, contrast over every moving scene, production deployment parity, all modal variants and paid-generation states were not comprehensively tested. Existing test reports remain history, not fresh proof.

## Independent challenge and disposition

The requested sub-agent researched online, authored the companion evidence note and the concise AGENTS.md rules. It challenged the lead's early emphasis on HD/pixel mismatch because the coworker explicitly named palette/material/type. Accepted: the report treats control material and world cohesion as separate experiments. It also challenged an automatic radius/font replacement and a claim that AI inevitably reduces creative diversity. Accepted: the baseline remains eligible and the research records conflicting results from different tasks.

The coordinating reviewer read the AGENTS.md diff against `docs/agent-instructions.md`: two scoped Theme rules, one deeper-document pointer, no palette/font ban, no extra instruction file, and existing theme ownership preserved. Wording was tightened so only changed choices need justification and substantial visual changes require the fuller comparison. The linked audit is part of the same delivery.

No theme implementation, dependency update, paid generation, background replacement or additional user setting is part of this spike.
