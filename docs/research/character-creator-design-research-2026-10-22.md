# Character creator design research — 2026-10-22

Status: research and design proposal, prepared for desktop/mobile mock-ups. No application implementation, paid PixelLab generation, token access or model-output validation was performed for this research. Proposed behaviors below are not existing product capabilities.

## Recommendation

Use a visible creation workspace with Appearance, Body size, Frame size and Facing directions. Pair it with a size diagram and the exact composed prompt. Keep reproducibility details such as seed secondary. Draw the base with `create-character-v3`, retain all eight independent source/rest views, and animate/export the chosen nonempty subset without forcing mirrored opposite views.

The key distinction is between appearance intent, requested generation canvas, final output frame and selected gameplay views. Combining these under one unexplained size or direction count creates false expectations.

## Evidence from comparable tools

| Comparator | Verified behavior | Design implication — our inference |
| --- | --- | --- |
| [Universal LPC Spritesheet Generator](https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/?match_body-color=compact) | Visible Body Type choices include Male, Female, Teen, Child, Muscular and Pregnant. Parts have named categories; current selections and an animation preview are available. | Keep body appearance visible and use understandable categories with examples. Avoid copying its body-type vocabulary directly: it combines age, sex and shape in one category. |
| [RPG Maker MZ Character Generator](https://rpgmakerofficial.com/product/MZ_help-en/01_05.html) | Male/Female/Kid tabs; variation, color and offset choices per feature; a preview reflects selections. Exports distinguish face, walking character, damaged character and battler. Settings can be saved and reloaded. | Show understandable appearance choices next to feedback. Separate appearance from output configuration. |
| [Character Creator 2D by mochakingup](https://mochakingup.itch.io/cc2d) | Adjustable body sliders, expressions, colorable equipment, included animations and PNG/sequence export. The Unity version supports runtime equipment and color changes. | Separate proportions, expression and equipment. Do not copy precise-looking rig sliders into a probabilistic prompt interface. |
| [Kenney Avatar Mixer](https://kenney.itch.io/avatar-mixer) / [Creature Mixer](https://kenney.itch.io/creature-mixer) | Category tabs select parts; separate palette tabs choose colors; arrows reposition parts. Creature Mixer lets users pause and step through animation by clicking the character. | Use a small number of visible, direct controls and a preview. Keep appearance controls distinct from navigation and output settings. |
| [SmallScaleInt Fantasy Character Creator](https://smallscaleint.itch.io/character-creator-2d-fantasy) | Modular body/gear selection, Human/Undead/Spirit body types, eight-direction animation, live previews, chosen animations, and 64×64 or 128×128 exports. Its [Modern version](https://smallscaleint.itch.io/character-creator-2d-modern) also exposes output resolution, outlines and frame-count choices. | Make game-facing output decisions explicit. Let users see selected directions/animations before spending or exporting. |

These are primarily deterministic part-based creators. Their instant previews are evidence for the value of visual feedback, not proof that equivalent AI prompt controls will produce exact shapes or colors.

The LPC repository describes its original [64×64 format and later oversized equipment frames](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator). SmallScaleInt documents 64×64/128×128 output frames. These are frame conventions, not proven universal opaque-body-height standards.

## Essential controls should remain visible

Apple recommends keeping frequently used controls visible while disclosing detail when relevant. Its [disclosure-control guidance](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls) supports retaining size and directions in the primary hierarchy and reserving disclosure for infrequent details. Its [layout guidance](https://developer.apple.com/design/human-interface-guidelines/layout) also favours grouping related settings and giving essential content sufficient space.

Recommended visible sequence:

1. **Character name** and a short description.
2. **Appearance** hints, with optional choices and clear defaults.
3. **Body height** presets and Custom.
4. **Frame size**, showing Auto and the resulting dimensions, with an adjacent Custom action.
5. **Facing directions** presets and the complete eight-arrow selector.
6. **Prompt sent to PixelLab**, readable and copyable, plus a separate settings summary.
7. A clear generation action with current cost scope and validation feedback.

An illustration before generation must say **Size guide**, **Example**, or equivalent. It must not masquerade as the user's generated character or a reliable preview of prompt adherence.

## Appearance controls and naming

Proposed high-value hints are character kind, body shape, proportions and skin tone. Keep a free-text field for defining details. Hair, clothing and equipment remain later swappable items in PixelDoll's established workflow.

- **Character kind:** examples such as Human, Elf, Dwarf and Orc, plus From description/Custom. These are text hints within a humanoid rig, not new skeleton-template support.
- **Body shape:** optional Slender, Broad, Muscular or Rounded choices, supported by silhouettes and short descriptions. Default to From description. Avoid calling an empty hint Average.
- **Proportions:** Natural, Heroic or Chibi is a separate concept from shape, height in pixels and camera angle. Add it only if examples make the distinction understandable.
- **Skin tone:** use swatches with text labels. State that they guide generation; they do not guarantee exact pixel colors. Exact palette editing remains a separate operation.

Do not imply numerical precision through body-width or muscle sliders unless their output is deterministic. Avoid a permanent grid of tiny facial controls whose effects will be unreadable at low resolutions. Prompt hints need model-output evaluation before claiming consistent results.

Rename Name to **Character name**, with helper: **For your character library and exported files. Does not change the artwork.** In current code, `CreateSheet.svelte` keeps `name` separate from `description`; `ExportSheet.svelte` uses the project name for ZIP naming, and engine exporters also use the manifest name. This is local code evidence, not a competitor feature claim.

## Exact prompt and structured settings

Show a read-only **Prompt sent to PixelLab** that updates immediately from the same serializer used by submission. Include all appended body/base-clothing/pose instructions, not merely the user's description or a paraphrase. Offer Copy. Retain a single source of truth; an editable second prompt would otherwise drift from the controls.

Display model, view, requested generation canvas, final frame and selected directions separately. They are structured API/application settings, not necessarily words in the prompt. Name and seed are not appearance instructions.

If a chosen hint contradicts free text, do not secretly remove or rewrite text. Expose the resulting prompt and offer a clear way to reset that hint to From description. Automated semantic conflict detection is not required for an initial design.

Disable automatic server prompt enhancement for an exact-prompt contract, or explicitly display and approve its expanded text first. Otherwise the visible text would not fully describe what the generator receives.

## Facing directions are separate from camera

The [PixelLab camera documentation](https://www.pixellab.ai/docs/options/camera) separates camera height/view from character facing: side is a side-scroller view, low/high top-down guide camera elevation, while south faces the camera, north faces away, and east/west face right/left. Guidance is approximate.

Unity's [isometric tilemap manual](https://docs.unity3d.com/6000.0/Documentation/Manual/tilemaps/work-with-tilemaps/isometric-tilemaps/create-isometric-tilemap.html) describes isometric grids, projection-related proportions and sprite pivots. Selecting four diagonal sprite views alone does not establish a complete isometric projection or game setup. **Diagonal · 4**, with helper **For isometric-style games**, is therefore clearer than promising an Isometric mode solely from a direction mask.

| Preset label | Chosen directions | View suggestion |
| --- | --- | --- |
| Side-scroller · 2 | East, West | Side |
| Top-down · 4 | North, East, South, West | Low top-down |
| Top-down · 8 | All eight | Low top-down |
| Diagonal · 4 | North-east, South-east, South-west, North-west | Low top-down; user can adjust |

Keep the view control explicit even when a preset supplies a sensible initial value. Avoid silently resetting it whenever a direction is toggled. Manual direction changes mark the preset Custom while retaining the selected view.

Arrange eight outward arrows around a noninteractive center, with selected states, accessible names and a visible count. Label the group **Facing directions** and explain **Views to animate and export**. Allow any nonempty subset, including one direction and asymmetric subsets. Prevent an empty selection with inline feedback rather than allowing a later paid failure.

The current [v3 API schema](https://api.pixellab.ai/v2/openapi.json) makes eight views from scratch; four-direction selection applies to reference mode. Preserve all eight real source/rest views behind the scenes and limit animation/export to the chosen subset. Do not silently replace independent views with flips. State that selecting fewer views reduces downstream animation work, not the initial eight-view drawing step.

Retained rest/source views and selected playable clip directions need distinct storage semantics. Adding directions later should reuse the stored artwork, and disclose any animation/item work still required. Retention is a design requirement, not implemented support in the current 4/8 pipeline.

## Body size, generation canvas and output frame

Offer proposed target-height presets **48, 64, 96 and 128 px**, plus **Custom**. These are deliberately spaced design choices; this research does not establish them as the four most popular body heights. Label the height as a target/approximation and report measured artwork dimensions after drawing.

The [v3 API schema](https://api.pixellab.ai/v2/openapi.json) documents 32–256 px from-scratch generation canvases. A requested canvas dimension is not a guarantee that the opaque figure occupies precisely that height. Do not present exact body-height promises without a measured-fit strategy and quality gate.

Keep three values distinct: **target body height B**, the **source generation canvas** sent to v3, and the **final frame C** used for alignment and export. The source-canvas strategy and its relation to measured opaque height require validation; increasing final transparent padding does not increase art detail or rescale the body.

Candidate Auto rule, explicitly an **unvalidated design hypothesis**:

`m = min(16, max(8, ceil(B / 8)))`

`C = 16 * ceil((B + 2m) / 16)`

| Target B | Nominal margin m | Candidate square frame C |
| --- | --- | --- |
| 48 | 8 | 64×64 |
| 64 | 8 | 80×80 |
| 96 | 12 | 128×128 |
| 128 | 16 | 160×160 |

The formula reserves nominal room around the target. It does not prove enough room for broad bodies, poses, capes, long hats, weapons or all eight source silhouettes. Measure the union across directions and validate motion before freezing one consistent frame/pivot. Do not fit each frame independently, which would introduce visible size/position jitter.

Proposed Custom target range is **32–224 px**, leaving nominal margin within a 256 px source/model boundary. This is a tentative product limit, not an API guarantee or validated supported range. Custom final frames initially remain square, can only grow from the safe Auto value, and must pass downstream caps. Increasing padding must preserve pixel scale and pivot.

At the large end, the current additional weapon margin may exceed 256 even when the body frame itself fits. That requires an explicit supported policy, a smaller safe range, or a different processing strategy; the interface must not promise compatibility first and fail after spending.

Show the automatic dimensions and an inline Custom option, not a hidden advanced dropdown. A size diagram should make empty space and the body bounds distinct. [Aseprite](https://www.aseprite.org/docs/cli/#--inner-padding) distinguishes padding inside a frame from separation between frames and the sheet border; use **Frame size / room for gear** to avoid that atlas-spacing ambiguity.

## Challenges and implementation boundaries

Current `validateRig` in `app/src/lib/rig/rig.ts` accepts only square 32 or 64 cells. Creation also uses a fixed 64 cell and the UI/types assume 4/8 directions. Supporting new choices requires coordinated rig, normalization, quality-check, item, storage, compositing and export work; adding radio buttons is insufficient.

The [current edit API](https://api.pixellab.ai/v2/openapi.json) supports up to 16 edited frames at sizes through 64 px, nine at 65–80, and four at 81–256. Larger final cells and eight independent directions therefore require more equipment batches, higher costs and cross-batch design consistency. Recompute estimates from the actual request plan rather than scaling a small-rig price blindly.

Independent opposite views increase animation work relative to today's mirrored pipeline and must preserve left/right hand semantics, asymmetrical markings and equipment fit. The user should understand this benefit and cost. Keep body and equipment creation on the allowed models; this proposal uses only the v3 character creation endpoint and does not add a model chooser.

## Three mock-up directions

| Layout | Desktop arrangement | Mobile arrangement | Main tradeoff |
| --- | --- | --- | --- |
| Balanced workspace | Three adjacent columns for appearance, size and facing; exact prompt below | One clear vertical sequence with all groups expanded | Strong default: visible essentials with manageable density |
| Preview first | Larger size/shape illustration and prompt at left, appearance and facing at right | Guide and prompt first, then appearance and facing | Strongest visual orientation, but more scrolling before facing choices |
| Quick studio | Compact top geometry controls, direction compass and appearance brief nearby | Size and directions precede the longer description/prompt | Fast for repeat users; needs care to avoid a dense control wall |

These alternatives should share semantics and validation so the comparison evaluates layout rather than three incompatible feature sets. None should hide size or directions under More options.

The actual mock-ups are interactive design proposals in the chat. Their size illustration responds to body shape and Chibi proportions, and is explicitly labeled as an illustration. The generation action demonstrates the proposed draw/review/animate sequence without calling any API. Only Seed options uses disclosure. The primary action quotes the eight-view body drawing stage, not the later animation/equipment cost.

## Mock-up verification

Codex in-app browser checks exercised all three desktop layouts and their mobile versions. At 375 px and 320 px browser widths, all three mobile designs fit without child controls extending outside the product window; the compass has eight 44×44 px targets. The inline preview shell adds its own padding, so these checks also covered product widths narrower than the nominal browser viewport.

The four preset mappings (48→64, 64→80, 96→128, 128→160) updated correctly. A custom 88 px target produced a 112 px Auto recommendation; a 64 px custom frame was blocked, and a larger 160 px frame retained the body target. Choosing side-scroller and then adding north changed the preset to Custom and preserved the Side camera. Clearing all facings and entering a negative seed each disabled the draw action. Broad and Chibi changed the exact prompt; changing the character name did not insert it into that prompt. The prototype produced no browser console errors during inspection.

These are UI/simulation checks, not live model-quality or production pipeline verification. No application source was changed and no generation credits were spent. Auto margins, shape-hint reliability, custom dimensions, motion reserve and large weapon compatibility still require implementation and benchmark validation.

## Acceptance criteria for a later implementation

- Every preset and every valid custom height shows its resulting frame before generation; Auto and custom frame choices preserve body pixel scale.
- All eight source views are real v3 outputs, retained with provenance. Any nonempty chosen direction subset is supported without implicit mirroring or dropped views.
- Presets select exactly the documented directions; the diagonal preset does not claim to configure a complete isometric projection.
- Camera remains independently visible and consistent across base creation, skeleton reconstruction, motion and item generation.
- Name helper, exact composed prompt, structured request summary and copy action agree with the submitted specification. Editing the name leaves the prompt unchanged.
- Shape and skin choices clearly describe intent and can revert to From description; no numerical proportion guarantee is implied.
- The cost plan includes larger-cell edit batches, selected independent directions and optional retries. No automatic paid resend is introduced.
- All directions, cell geometry, pivots, oversize layers, hand side, recolors, storage reloads and engine exports receive offline coverage before paid validation.
- Desktop, narrow mobile portrait and short landscape have reachable controls, readable prompt text, clear selected states and no horizontal overflow. Test keyboard focus, arrow selection and real mobile keyboard behavior.
- Base appearance and measured fit can be reviewed before the expensive animation stage; remaining QA failures are presented accurately.
