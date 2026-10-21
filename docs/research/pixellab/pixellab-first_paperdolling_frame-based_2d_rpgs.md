# Research Spike: PixelLab-First Paperdolling for Frame-Based 2D RPGs

**Research date:** October 20, 2026  
**Status:** Research and architecture assessment  
**Focus:** Traditional and AI-generated frame-based pixel-art animation, with PixelLab as the primary image-generation system.

---

## 1. Executive Summary

The objective is to integrate traditional **paperdolling** into a **PixelLab-first asset-generation workflow** for 2D pixel-art RPGs.

Paperdolling allows characters to share animations while dynamically changing visual components such as clothing, armor, hair, weapons, accessories, and effects.

Traditional implementations use transparent equipment layers aligned to an underlying character animation.

PixelLab introduces AI generation, directional rotation, animation generation, inpainting, and outfit transfer. These tools can potentially automate substantial portions of paperdoll asset production.

However, there is an important distinction:

**Generating a character wearing equipment is not equivalent to generating a reusable equipment layer.**

PixelLab's public API primarily generates or edits composite images. These images may be suitable as finished sprites but are not automatically interchangeable paperdoll assets.

The central technical challenge is converting PixelLab-generated character and equipment combinations into reliable, independently reusable layers.

### Primary recommendation

Develop a **PixelLab-backed paperdoll generation pipeline** that combines:

1. PixelLab-generated base characters and animations.
2. PixelLab-generated equipment modifications.
3. Character-anchored editing and masks.
4. Extraction of equipment into transparent layers.
5. Traditional frame alignment, slot conventions, and draw ordering.
6. Automated consistency validation.
7. Export for dynamic or pre-rendered character composition.

The recommended architecture separates **AI image generation** from **deterministic asset assembly**.

PixelLab creates the visual content. The surrounding system manages compatibility, transparency, layer extraction, metadata, and runtime composition.

This preserves PixelLab as the main creator while allowing traditional paperdolling to provide the reusable structure.

---

## 2. Research Objectives

The investigation addresses the following questions:

- How do traditional frame-based paperdoll systems work?
- Which techniques are most appropriate for pixel-art RPGs?
- Which PixelLab tools directly support character customization and reusable equipment?
- Can PixelLab generate isolated, transparent paperdoll layers?
- How can equipment be propagated across directions and animation frames?
- Can parts be extracted from AI-generated composite images?
- Which approaches offer the best automation, quality, and scalability?
- What should a production-ready workflow export?
- Which technical risks need experimental validation?

### Scope

Included:

- Frame-based sprite animation.
- Layered equipment and appearance customization.
- Directional character sprites.
- Animated clothing and weapons.
- PixelLab AI generation and editing.
- Layer extraction and compositing.
- Asset metadata, validation, and export.
- Relevant skeletal techniques for comparison.

Excluded from the primary architecture:

- Real-time AI image generation inside the shipped game.
- Full skeletal animation as a required runtime system.
- Hand-drawing every equipment variant as the default production method.
- Dependence on undocumented PixelLab endpoints.

---

## 3. Traditional Paperdolling

### 3.1 Fundamental technique

A traditional paperdoll system displays multiple transparent sprite layers over the same character.

For example:

**Character appearance = Base Body + Clothing + Hair + Weapon**

Each component corresponds to the same animation frame.

For a four-frame walking animation:

| Frame | Body   | Armor   | Weapon   |
| ----- | ------ | ------- | -------- |
| 0     | Body 0 | Armor 0 | Weapon 0 |
| 1     | Body 1 | Armor 1 | Weapon 1 |
| 2     | Body 2 | Armor 2 | Weapon 2 |
| 3     | Body 3 | Armor 3 | Weapon 3 |

All three layers advance together.

The equipment therefore appears to move naturally with the character.

### 3.2 Traditional production workflow

The classic method:

1. Draw or obtain the base character animation.
2. Create a transparent layer above the character.
3. Draw equipment directly over the appropriate body regions.
4. Repeat for every required animation frame and direction.
5. Hide the base body.
6. Export only the transparent equipment overlay.
7. Render that overlay above the base character in the game.

This method is documented by the [Ascension GameDev Paperdoll Tutorial](https://www.ascensiongamedev.com/topic/1041-paperdoll-tutorial/).

Its main strength is reliable placement: equipment is created directly against the body it will be attached to.

Its weakness is production cost. Every new item may require many matching frames.

### 3.3 Essential compatibility rules

Every reusable paperdoll layer must share a stable asset contract:

| Property          | Requirement                               |
| ----------------- | ----------------------------------------- |
| Canvas dimensions | Identical to the base animation           |
| Direction         | Matches the base character                |
| Animation         | Uses the corresponding animation          |
| Frame ID          | Synchronized with the base                |
| Pivot / origin    | Same coordinate reference                 |
| Transparency      | No unwanted background or duplicated body |
| Draw order        | Defined relative to other layers          |
| Palette           | Compatible with the project               |
| Body type         | Explicit compatibility                    |

These rules are the foundation of the entire system.

They must remain valid regardless of whether assets were drawn manually or generated by AI.

---

## 4. Traditional Implementation Approaches

### 4.1 Layered frame-by-frame sprites

Every appearance component has a matching transparent animation.

**Advantages**

- Native pixel-art animation quality.
- Precise per-frame control.
- Straightforward equipment swapping.
- Independent of skeletal animation.
- Compatible with most 2D engines.

**Disadvantages**

- Large number of asset frames.
- Requires strict synchronization.
- Different body types may need different equipment versions.

**Assessment:** Best traditional foundation for this project.

### 4.2 Fully pre-rendered character combinations

The character, clothing, weapon, and other parts are combined before runtime.

**Advantages**

- Simple rendering.
- Good batching potential.
- Minimal runtime layer coordination.
- Predictable visual output.

**Disadvantages**

- Equipment combinations multiply rapidly.
- Higher storage and packaging costs.
- Updating one item may require rebuilding many combinations.

**Assessment:** Useful for fixed NPCs, enemies, bosses, and frequently used combinations.

### 4.3 Dynamic runtime layering

The engine draws each component individually.

**Advantages**

- Large number of possible appearances.
- Immediate equipment changes.
- Little duplication of base-character images.
- Useful for multiplayer avatars.

**Disadvantages**

- More rendered sprites.
- More draw-order cases.
- Additional animation synchronization.
- Increased testing requirements.

Actual performance depends on renderer batching, atlas usage, materials, and character counts; each layer does not necessarily require a separate GPU draw call.

**Assessment:** Preferred for customizable player characters.

### 4.4 Hybrid composition

A hybrid combines both approaches.

Examples:

- Pre-render the body and common armor combinations.
- Dynamically layer hair, accessories, and weapons.
- Use palette swaps for colors.
- Bake visually complicated attacks or effects.

**Assessment:** Strongest general-purpose runtime choice.

### 4.5 Skeletal modular animation

Tools such as Spine and Spriter use interchangeable attachments animated through reusable motion structures.

Advantages include animation reuse, skins, attachment switching, and animation blending.

However, strict pixel art can suffer from interpolated transforms, deformation, and subpixel movement.

**Assessment:** Useful as an alternative or reference architecture, but not required for the intended frame-based pipeline.

### 4.6 Palette-based customization

A character's existing colors are remapped without generating new silhouettes.

This can produce many inexpensive variations for skin, clothing, armor, and effects.

Palette classes should be explicitly defined, such as:

`skin`, `cloth_primary`, `cloth_secondary`, `leather`, `metal`, and `effects`.

**Assessment:** Recommended as a complementary customization mechanism.

---

## 5. PixelLab Capabilities

The following features were identified in PixelLab's official documentation and public developer API.

These are documented capabilities, not proof that every feature produces production-ready paperdoll assets.

| Feature                     | Documented behavior                                      | Paperdoll relevance                        |
| --------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| Character generation        | Creates reusable characters, including directional views | Base character creation                    |
| Rotate                      | Generates additional directions                          | Directional equipment and body references  |
| Create 8-directional sprite | Generates eight views in one operation                   | Multi-direction characters                 |
| Animate with skeleton       | Uses skeleton/pose guidance to generate frames           | Base animation generation                  |
| Animation with text         | Creates animation frames using image conditioning        | Additional motion generation               |
| Animation to animation      | Uses existing animation information                      | Motion reuse and variation                 |
| Edit Image                  | Changes an existing image                                | Single-frame equipment additions           |
| Edit Animation Pro          | Changes multiple frames with an instruction              | Animated equipment propagation             |
| Transfer Outfit Pro         | Transfers an outfit reference across animation frames    | Clothing and armor generation              |
| Try On                      | Applies a garment/item to a character image              | Single-frame outfit previews               |
| Inpainting                  | Modifies selected image regions                          | Fitted equipment and localized corrections |
| Color controls              | Palette guidance and forced-color options                | Palette consistency                        |
| Character states            | Creates variations of managed characters                 | Dressed or armed composite variants        |
| API / MCP                   | Programmatic access to supported generation tools        | Workflow automation                        |

### 5.1 Direction generation

PixelLab supports character rotation and multi-direction generation.

Two approaches are documented:

**Single-reference rotation:** Generate other directions from the original reference image.

**Incremental rotation:** Generate each subsequent direction from a nearby orientation.

The second approach may make small rotations easier, but errors can accumulate.

PixelLab's official rotation tutorial demonstrates this tradeoff and recommends inpainting or corrections where generated directions contain mistakes.

For paperdolling, direction generation should happen before equipment generation whenever possible.

**Reference:** [Rotating a Character](https://www.pixellab.ai/docs/guides/rotating-a-character)

### 5.2 Skeleton-guided animation

PixelLab recommends skeleton-based generation for characters.

The skeleton tool supports reference images, editable poses, reusable motion templates, and inpainting-guided corrections.

It can also estimate a skeleton from an existing character.

This is useful because the skeleton can provide:

- Animation pose guidance.
- Approximate hand locations.
- Head and torso positioning.
- Body-part regions.
- Potential hardpoint metadata.

Importantly, PixelLab's skeleton workflow generates raster animation frames. It does not automatically provide runtime paperdoll attachment layers.

**Reference:** [Animate with Skeleton](https://www.pixellab.ai/docs/tools/animate-with-skeleton)

### 5.3 Outfit transfer

Transfer Outfit Pro applies a reference outfit across an existing animation sequence.

This is particularly relevant for:

- Armor.
- Uniforms.
- Shirts.
- Pants.
- Robes.
- Full clothing sets.

Documented editor limits depend on image size. At 32–64 pixels, up to 15 frames are supported in one operation; larger images have lower per-operation frame limits.

The documentation identifies Aseprite and Pixelorama extensions as the supported editor interfaces, while the public API separately documents `transfer-outfit-v2`.

**Limitation:** Returned dressed frames are not guaranteed to contain separately reusable equipment layers.

**Reference:** [Transfer Outfit Pro](https://www.pixellab.ai/docs/tools/transfer-outfit-pro)

### 5.4 Edit Animation Pro

Edit Animation Pro can apply changes such as adding a sword or hat across multiple animation frames.

The documented editor tool supports 2–16 frames, with the maximum depending on resolution.

This is especially useful for equipment that needs to follow animated movement.

**Reference:** [Edit Animation Pro](https://www.pixellab.ai/docs/tools/edit-animation-pro)

### 5.5 Inpainting

Inpainting modifies selected regions while preserving other image regions.

Relevant applications include:

- Adding weapons to hands.
- Replacing boots.
- Modifying armor.
- Adjusting hair beneath a helmet.
- Repairing broken equipment silhouettes.
- Correcting inconsistent animation frames.

This is particularly useful for paperdolling because a base character can remain the primary reference while the target region is modified.

**Reference:** [PixelLab Inpainting](https://www.pixellab.ai/docs/options/inpainting)

### 5.6 Palette controls

PixelLab documents several color-management options:

- Limit colors to a supplied palette.
- Use the current image palette.
- Force target palette colors.
- Reduce colors to a specified count.
- Quantize to a selected palette.

These should be used during generation where supported, followed by deterministic palette auditing.

**Reference:** [PixelLab Color Options](https://www.pixellab.ai/docs/options/color)

---

## 6. Critical Problem: Composite Images Versus Reusable Layers

This is the most important unresolved technical issue.

### 6.1 The problem

Suppose PixelLab receives a base character and produces the same character wearing armor.

The output may contain:

- New armor pixels.
- Changed body shading.
- Altered outlines.
- Slightly moved limbs.
- Changed colors.
- Modified face or hair details.

Although the result may look correct, the armor is not necessarily available as an isolated transparent image.

A proper paperdoll system needs the armor to be independently reusable without reproducing the body.

### 6.2 Approach A: Editor changes-only layers

PixelLab documents an output method named **New layer with changes** for editor workflows.

This is promising because it provides a layer-oriented editing surface.

The existing PixelLab Pip research found an Aseprite extension workflow that can place generated changes on a dedicated editor layer.

However:

- This behavior is editor-specific.
- Public REST/MCP documentation does not expose equivalent native layer creation.
- A changes-only layer is not necessarily semantically separated equipment.
- The result must be inspected before being called reusable.

**Assessment:** Best manual/editor experiment.

**Reference:** [PixelLab Output Methods](https://www.pixellab.ai/docs/options/general)

### 6.3 Approach B: Composite difference extraction

This is the strongest proposed portable solution.

Workflow:

1. Keep the original base frame unchanged.
2. Ask PixelLab to add one item to the base frame.
3. Save the edited composite.
4. Compare the original and edited images.
5. Identify the newly changed pixels.
6. Copy acceptable changed pixels to a transparent image.
7. Verify the extracted layer against the base.

Conceptually:

**Base + Extracted Layer ≈ PixelLab Composite**

This resembles traditional paperdoll creation, except AI produces the clothing or equipment and deterministic image processing attempts to isolate it.

### Extraction limitations

Simple image subtraction cannot reliably handle every case.

It can fail when:

- PixelLab redraws unrelated body pixels.
- Equipment changes existing outlines or shadows.
- The character moves between images.
- Equipment occupies the same colors as the body.
- Semi-transparent shading complicates alpha recovery.
- Important equipment pixels are hidden behind the character.
- Equipment requires separate foreground/background pieces.

Therefore, extraction should be treated as a **candidate generation process**, not a guaranteed conversion.

**Assessment:** Recommended automation research priority.

### 6.4 Approach C: AI removes the character after generating equipment

Alternative workflow:

1. Generate a character wearing equipment.
2. Send the composite back to PixelLab.
3. Ask it to remove the original body.
4. Preserve the equipment.
5. Validate the result.

This may recover some equipment pixels that difference extraction cannot isolate.

However, the additional generation can introduce hallucinations, missing sections, altered shapes, and inconsistent alignment.

It also increases generation cost.

**Assessment:** Experimental fallback, not the default.

### 6.5 Approach D: Generate equipment separately

PixelLab can generate isolated objects such as weapons, hats, or other props.

This works when the desired result is a standalone asset.

It is less reliable for fitted equipment because the model lacks exact body geometry and animation pose.

For example, independently generating boots does not ensure they match a character's animated feet.

**Assessment:** Useful for standalone props and references; generally inferior to character-anchored editing for fitted equipment.

---

## 7. Recommended PixelLab-First Workflow

### Phase 1: Generate the canonical character

Use PixelLab to create the base character.

Establish:

- Body type.
- Canvas dimensions.
- Character scale.
- Camera perspective.
- Direction set.
- Palette.
- Transparent background.
- Global pivot.

Avoid attaching equipment before the reusable body standard is established.

### Phase 2: Generate directions

Use PixelLab's directional generation tools to create the required character views.

Check consistency of:

- Silhouette.
- Head position.
- Body proportions.
- Feet position.
- Camera perspective.
- Clothing-free base appearance.

Do not automatically assume that generated directions share identical proportions.

### Phase 3: Generate canonical animations

Use PixelLab's skeleton or image-guided animation tools.

Generate and approve the necessary animation set, such as:

- Idle.
- Walk.
- Run.
- Attack.
- Hurt.
- Death.

Lock animation frame identifiers and ordering after approval.

Equipment must target these exact frames.

### Phase 4: Generate equipment

Choose the PixelLab route based on equipment type.

| Item type                | Preferred generation route             |
| ------------------------ | -------------------------------------- |
| Torso armor / outfits    | Transfer Outfit                        |
| Weapons                  | Edit Animation or masked editing       |
| Boots / gloves           | Localized edit or inpainting           |
| Hair / hats              | Character-anchored edit                |
| Cape / cloak             | Outfit transfer with front/back review |
| Complete dressed variant | Character state or outfit transfer     |
| Standalone item icon     | Object/image generation                |

Each equipment item should be generated against the canonical character, not an unrelated newly generated character.

For independent items, reuse the unchanged base as the input rather than repeatedly editing the previous outfitted result. This reduces accumulated drift.

### Phase 5: Produce reusable layers

Prefer one of two outputs:

**Editor workflow:** PixelLab editor changes-only generation, followed by inspection and export.

**Automated workflow:** PixelLab composite generation, followed by difference extraction and validation.

If extraction fails, retry with a smaller region, mask, or better reference.

If valid reusable layers cannot be produced, preserve the result as a **baked composite** instead of mislabeling it.

### Phase 6: Assemble and export

Store:

- Original base frames.
- PixelLab-generated composite frames.
- Accepted transparent equipment frames.
- Composite previews.
- Layer and animation metadata.
- Validation results.
- Generation provenance.

These assets form a reusable paperdoll package.

---

## 8. Paperdoll Slots and Equipment Bundles

### 8.1 Traditional slots

A practical slot hierarchy might include:

| Slot           | Purpose                  |
| -------------- | ------------------------ |
| `body`         | Base character           |
| `hair_back`    | Hair behind head         |
| `cape_back`    | Cape behind torso        |
| `weapon_back`  | Weapon behind body       |
| `legs`         | Pants/leg coverings      |
| `feet`         | Boots                    |
| `torso`        | Armor and clothing       |
| `arms`         | Gloves and arm coverings |
| `head`         | Face/head additions      |
| `hair_front`   | Foreground hair          |
| `headwear`     | Hats and helmets         |
| `weapon_front` | Foreground weapon        |
| `cape_front`   | Foreground cape          |
| `fx_front`     | Visual effects           |

These are semantic slots. Their actual draw order may change by direction or animation state.

### 8.2 Slot bundles

AI generation sometimes works more naturally on coordinated groups of components rather than completely independent parts.

Examples:

- Helmet + hair hiding rules.
- Chest armor + sleeves.
- Hood + neck fabric + hair suppression.
- Cape front + cape back.
- Weapon front + weapon back.

These can be represented as **equipment bundles**.

A bundle may contain multiple layer images and configuration rules while remaining one selectable equipment item.

This should not force all clothing into large combined outfits.

The goal is to preserve modular combinations while allowing complex items to control several related layers.

### 8.3 Compatibility metadata

An equipment item may need rules such as:

- Hide selected hair layers.
- Replace an existing slot.
- Use a different layer order when facing north.
- Restrict compatibility to certain body types.
- Require an oversized frame for an attack.
- Disable conflicting accessories.

These rules must be explicit rather than inferred at runtime.

---

## 9. Animation and Alignment Model

### 9.1 Canonical frame IDs

Every frame should have a stable identifier.

Examples:

`walk_s_000`  
`walk_s_001`  
`walk_n_000`  
`attack_e_003`

Each compatible equipment layer must resolve to the corresponding frame.

### 9.2 Anchors

Use a global character origin, typically near the feet.

Additional local anchors may include:

- Head center.
- Main-hand grip.
- Off-hand grip.
- Weapon tip.
- Torso center.
- Shield center.

The global pivot keeps the entire character aligned.

Local anchors help position equipment and validate that it follows the expected body region.

### 9.3 Dynamic draw order

Not every item should remain permanently above the body.

For example:

- A shield may be behind the torso when facing north.
- A sword may appear in front during part of an attack.
- Hair may need back and front sections.
- A cape may wrap around the character.

Possible solutions:

1. Split the asset into front/back layers.
2. Use per-direction draw-order rules.
3. Use per-frame draw-order overrides when necessary.
4. Bake particularly complicated animation states.

Automatic front/back extraction from one flattened image should not be assumed reliable.

---

## 10. Proposed Data and File Structure

A paperdoll package should be independent of a specific engine.

Suggested structure:

- `base/` — Approved body frames.
- `generated/` — Original PixelLab composites.
- `layers/` — Verified transparent components.
- `previews/` — Composite contact sheets and animation previews.
- `qa/` — Masks, difference images, validation results.
- `paperdoll.json` — Runtime metadata.
- `provenance.json` — Generation settings and asset history.

### Illustrative manifest

```json
{
    "schema": "paperdoll.v1",
    "character": "human_base",
    "canvas": [64, 64],
    "origin": [32, 56],
    "directions": ["n", "s", "e", "w"],
    "animations": {
        "walk": {
            "frames": 4,
            "fps": 8
        }
    },
    "slots": {
        "body": 100,
        "torso": 300,
        "headwear": 500,
        "weapon_front": 700
    },
    "equipment": {
        "iron_sword": {
            "slot": "weapon_front",
            "source": "PixelLab",
            "output_type": "client_extracted",
            "qa_status": "passed"
        }
    }
}
```

This is a proposed schema, not a PixelLab API response.

Production implementations should additionally define per-frame image references, coordinate conventions, compatibility rules, draw-order overrides, hardpoints, and provenance identifiers.

---

## 11. Image Extraction and Validation

### 11.1 Proposed extraction algorithm

Inputs:

- Base frame.
- PixelLab-edited composite.
- Optional target region or mask.

Processing:

1. Confirm matching canvas dimensions.
2. Convert both images to RGBA.
3. Ignore meaningless RGB values in fully transparent pixels.
4. Detect shifts or unrelated body changes.
5. Identify confident pixel differences.
6. Expand the candidate mask conservatively to preserve outlines.
7. Remove unrelated noise when safe.
8. Copy accepted composite pixels into a transparent layer.
9. Recombine the extracted layer with the base.
10. Compare the reconstructed result to the PixelLab composite.

For animated assets, repeat for every frame and test temporal consistency.

### 11.2 Validation criteria

| Test                 | Failure condition                                   |
| -------------------- | --------------------------------------------------- |
| Frame compatibility  | Dimensions or frame order differ                    |
| Base preservation    | Unrelated body regions are altered                  |
| Transparency         | Background or full body remains in the layer        |
| Region validity      | Equipment appears outside expected position         |
| Layer plausibility   | Missing components or duplicated body parts         |
| Reconstruction       | Recombined image does not reproduce intended result |
| Temporal consistency | Equipment flickers, jumps, or disappears            |
| Palette consistency  | Unexpected colors or shading drift                  |
| Draw order           | Equipment clips incorrectly against the body        |

Validation should reject bad assets rather than silently attempting to fix them.

### 11.3 Important technical limitation

Difference extraction cannot reconstruct arbitrary hidden geometry.

For example, an opaque body can completely hide the rear half of a sword.

A flattened image does not contain enough information to recover that hidden portion.

This may require a separate PixelLab generation, an explicit front/back equipment representation, or manual/editor intervention.

Likewise, semi-transparent equipment and lighting cannot always be isolated uniquely from one flattened image.

---

## 12. Runtime and Rendering Design

The generation pipeline should not force one rendering strategy.

Support three output types:

| Output                 | Description                                        |
| ---------------------- | -------------------------------------------------- |
| Reusable layers        | Separate synchronized sprite layers                |
| Pre-rendered composite | One baked appearance                               |
| Hybrid                 | Selected baked layers combined with dynamic layers |

### Recommended default

For customizable RPG characters:

**Dynamic equipment layers with optional pre-rendered combinations.**

For fixed enemies and NPCs:

**Pre-rendered composites.**

For simple recolors:

**Palette remapping.**

### Atlas packaging

Recommended practices include:

- Shared or compatible atlases.
- Original-size metadata after trimming.
- Stable pivots.
- Padding and extrusion.
- Unsupported atlas rotation disabled.
- Consistent texture filtering.
- Performance profiling with many characters.

Initial atlas settings can use approximately 2 pixels of spacing and 1 pixel of extrusion, but they must be validated against the target renderer.

Aseprite and TexturePacker both provide relevant export tooling.

---

## 13. PixelLab Integration Options

### Option A: PixelLab inside Pixelorama

PixelLab provides an integrated Pixelorama editor in the browser.

Advantages:

- AI generation and editing in one workspace.
- Standard pixel-editor layers and frames.
- Immediate manual inspection.
- Useful for interactive experimentation.

Limitation:

Editor behavior does not automatically translate into a portable API or headless build workflow.

**Best for:** Interactive asset authoring and experimental paperdoll layer creation.

### Option B: PixelLab Aseprite extension

Advantages:

- Native pixel-art editor workflow.
- Existing layers, frame tags, and export tools.
- Documented changes-only output mode.
- Strong path for manual verification.

Limitations:

- Requires Aseprite.
- Editor-specific features may not exist in REST/MCP.
- Automated pipelines should not depend on private extension operations.

**Best for:** Testing layer-oriented generation and generating verified authoring assets.

### Option C: PixelLab REST API / MCP

Advantages:

- Programmatic generation.
- Custom asset pipelines.
- Batch processing.
- Automated validation and packaging.
- Integration with higher-level developer tooling.

Limitation:

Public generation/edit routes generally produce images or animation frames, not semantic equipment layers.

**Best for:** The long-term automated paperdoll system.

### Recommended architecture

Use an API-backed core that operates on transparent PNGs, manifests, and validated outputs.

Treat the editor integrations as optional authoring and verification surfaces rather than mandatory dependencies.

---

## 14. PixelLab Pip Integration

The existing PixelLab Pip project already contains related research and operational guidance.

Relevant documents:

- [Paperdolling agent reference](https://github.com/Shilo/pixellab-pip/blob/main/skills/pixellab-pip/references/paperdolling.md)
- [Paperdolling research spike](https://github.com/Shilo/pixellab-pip/blob/main/docs/pixellab/pixellab-paperdolling-research-spike.md)
- [Paperdolling implementation plan](https://github.com/Shilo/pixellab-pip/blob/main/docs/pixellab/pixellab-paperdolling-system-plan.md)

Those documents already identify the public API layer boundary and propose a PixelLab-generated composite followed by local extraction and QA.

This session's research supports that direction.

### Proposed higher-level operations

The interface could eventually expose:

- `create_base_character`
- `generate_directions`
- `generate_base_animation`
- `create_equipment_preview`
- `create_paperdoll_layer`
- `create_equipment_bundle`
- `propagate_equipment_animation`
- `validate_paperdoll`
- `export_paperdoll_package`

These are conceptual workflow operations, not claims that PixelLab currently exposes these exact methods.

The important distinction is that `create_paperdoll_layer` would orchestrate multiple steps:

**PixelLab generation → extraction → verification → packaging**

It would not be a simple alias for an existing PixelLab endpoint.

### Design constraint

Visible artwork should originate from PixelLab or approved user-provided sources.

Local automation can:

- Compare images.
- Extract pixels.
- Generate masks.
- Align existing pixels.
- Composite layers.
- Validate outputs.
- Export metadata.

It should not silently invent missing artwork or repaint PixelLab outputs while claiming the result is entirely PixelLab-generated.

---

## 15. Research Experiments

The proposed workflow requires practical tests before adopting it as a production standard.

### Experiment 1: Single-frame equipment extraction

**Objective:** Determine whether one PixelLab edit can produce a reusable weapon layer through image differencing.

Procedure:

1. Generate a transparent base character.
2. Use PixelLab to add a sword.
3. Extract changed pixels.
4. Recombine the sword layer with the original character.
5. Inspect alignment, transparency, and body preservation.

**Pass condition:** A reusable transparent sword layer reconstructs the intended result without unrelated body pixels.

### Experiment 2: Masked versus unmasked editing

**Objective:** Determine whether localized inpainting reduces unwanted character changes.

Generate the same equipment with and without a constrained edit region.

Measure:

- Unrelated changed pixels.
- Extraction quality.
- Required retries.
- Visual consistency.

### Experiment 3: Animated weapon propagation

**Objective:** Determine whether PixelLab can add consistent equipment across an existing walk animation.

Use Edit Animation Pro and verify:

- Same sword identity.
- Same frame count.
- Proper hand attachment.
- No unexplained jitter.
- No unrelated body redraw.

### Experiment 4: Outfit transfer and isolation

**Objective:** Determine whether Transfer Outfit can produce reusable clothing layers.

Generate armor across several frames, then attempt extraction.

Compare against single-frame and masked approaches.

### Experiment 5: Multi-direction compatibility

**Objective:** Test whether equipment can be reused across the character's directional animations.

Evaluate:

- Perspective accuracy.
- Relative equipment dimensions.
- Silhouette consistency.
- Pivot alignment.
- Front/back layering.

### Experiment 6: Editor changes-only output

**Objective:** Determine how reliably PixelLab's editor changes-only workflow can produce reusable equipment layers.

Test with:

- Hats.
- Hair.
- Armor.
- Weapons.
- Capes.

Export each layer separately and verify the content.

### Experiment 7: Extraction failure cases

Test known difficult conditions:

- Equipment behind the character.
- Identically colored body and armor.
- Semi-transparent effects.
- Large silhouette changes.
- Clothing that replaces body outlines.

Determine which require explicit masks, alternate layer generation, or composite-only output.

### Experiment 8: Performance comparison

Compare:

- Fully dynamic layering.
- Pre-rendered composites.
- Hybrid rendering.

Measure real renderer performance using representative character counts, animation activity, atlas sizes, and equipment combinations.

### Experiment reporting

For each test, record:

- PixelLab tool and model.
- Input dimensions and references.
- Prompt, settings, and seed where available.
- Generation cost.
- Number of retries.
- Whether extraction succeeded.
- Required manual corrections.
- Objective QA results.
- Final visual quality.

No end-to-end PixelLab generation or extraction experiments were executed during this research session. These remain proposals.

---

## 16. Main Risks and Mitigations

| Risk                             | Impact                        | Proposed mitigation                                             |
| -------------------------------- | ----------------------------- | --------------------------------------------------------------- |
| AI redraws the base              | Invalid equipment extraction  | Masked edits and preservation checks                            |
| Equipment changes between frames | Animation flicker             | Multi-frame edits and temporal QA                               |
| Missing hidden equipment pixels  | Incorrect front/back layers   | Separate generation or editor correction                        |
| Directional inconsistency        | Incompatible equipment sheets | Canonical direction references                                  |
| Varying body proportions         | Gear does not fit             | Body-type compatibility rules                                   |
| Palette drift                    | Visual inconsistency          | Forced palette and deterministic audit                          |
| Too many slot dependencies       | Complex combinations          | Slot bundles and compatibility metadata                         |
| Excessive API calls              | Increased production cost     | Reuse references, batch appropriately, stop failed routes early |
| Editor-only capabilities         | Difficult automation          | Public API-backed portable pipeline                             |
| Weak validation                  | Broken assets reach runtime   | Mandatory QA and explicit output classifications                |

### AI-specific legal considerations

Maintain a provenance record for generated assets and reference images.

Review model terms, dataset rights, and intended distribution requirements.

The U.S. Copyright Office's January 2025 report distinguishes human-authored expressive contributions from prompt-only outputs. Steam has also established disclosure requirements for AI-assisted content.

These are legal and platform-policy considerations, not technical blockers to the paperdoll architecture.

---

## 17. Research Conclusions

### Confirmed findings

1. Traditional frame-based paperdolling requires synchronized transparent overlays.
2. PixelLab can generate characters, directions, animations, and edited variants.
3. PixelLab provides tools suited to applying clothing and equipment to existing animation frames.
4. Public PixelLab REST/MCP documentation does not currently establish a guaranteed semantic equipment-layer output.
5. PixelLab's editor workflows offer a changes-only layer-oriented option.
6. Layer extraction and independent validation remain necessary for a portable automated paperdoll pipeline.
7. Aseprite, Pixelorama, and conventional atlas tools provide compatible authoring/export concepts.

### Strong recommendations

1. Use PixelLab as the main visual asset generator.
2. Generate and stabilize the base character animation first.
3. Generate equipment as character-anchored edits.
4. Prefer isolated reusable equipment assets over repeated full-character regeneration when customization is required.
5. Test changes-only editor outputs and composite difference extraction.
6. Preserve strict frame, pivot, and slot compatibility.
7. Use hybrid runtime composition.
8. Keep failed extraction results explicitly classified as composites or candidates.

### Unproven assumptions

- That most clothing types can be reliably extracted automatically.
- That PixelLab will consistently preserve all unchanged body pixels.
- That front/back equipment separation can be broadly automated.
- That generated gear will maintain sufficient temporal consistency across many directions and actions.
- That one generalized extraction algorithm can handle armor, hair, weapons, capes, and transparent effects equally well.

These assumptions should be validated rather than built into the architecture as guarantees.

---

# 18. Tutorials and Reference Library

The following resources were gathered throughout the session. They are grouped by the technique they help explain.

Official tool documentation and research references were cross-checked during this revision. Several supplemental video links originate from the earlier resource survey; their current availability and precise coverage were not all independently reverified.

## A. Traditional paperdolling

### Written

| Resource                                                                                                                                                                   | Relevance                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [Ascension — Paperdoll Tutorial](https://www.ascensiongamedev.com/topic/1041-paperdoll-tutorial/)                                                                          | Classic frame-by-frame equipment overlay creation |
| [Ascension — How to Paperdoll?](https://www.ascensiongamedev.com/topic/932-how-to-paperdoll/)                                                                              | Short practical explanation                       |
| [Godot Forum — Layered Character Sprites](https://forum.godotengine.org/t/how-to-layer-sprites-dress-up-a-character-in-2d/11898)                                           | Runtime layering versus baked composite rendering |
| [Unity2D — Paper Dolling Discussion](https://www.reddit.com/r/Unity2D/comments/xn78eb/paper_dolling/)                                                                      | Aseprite layer exports and Unity rendering        |
| [GameDev.net — Paper Doll Equipment](https://gamedev.net/forums/topic/622607-2d-action-game-sprites-paper-doll-equipment-or-custom-characters-with-unchanging-appearance/) | Traditional architecture tradeoffs                |
| [RPG Maker — Visual Equipment System](https://forums.rpgmakerweb.com/threads/trying-to-implement-a-paper-doll-composite-sprite-visual-equipment-system.182351/)            | Practical implementation complexity               |

### Videos

| Resource                                                                                                 | Relevance                         |
| -------------------------------------------------------------------------------------------------------- | --------------------------------- |
| [Godot — 2D Character Customization with Composite Sprites](https://www.youtube.com/watch?v=AkKywZDJNeE) | Dynamic composite sprites         |
| [Adding Swappable Gear to My Indie Game](https://www.youtube.com/watch?v=ne9vICJuTd4)                    | Practical equipment customization |
| [Equipment System — Sprite Swap](https://www.youtube.com/watch?v=jujesQ_2u8Q)                            | Sprite swapping                   |
| [Unity — Character Customization Using Sprite Sheets](https://www.youtube.com/watch?v=t2UUHI4eudI)       | Sheet-based customization         |
| [Unity — 2D Character Customization](https://www.youtube.com/watch?v=kAPIWJJ6NQI)                        | Character appearance systems      |
| [Unity — Paper Doll Character Customizer](https://www.youtube.com/watch?v=B6gFcrBzhUE)                   | Modular character presentation    |

## B. Frame-based animation and export

### Written

| Resource                                                                                                            | Relevance                                                        |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [Aseprite — Sprite Sheets](https://www.aseprite.org/docs/sprite-sheet/)                                             | Frame/layer sheet exports                                        |
| [Aseprite — CLI](https://www.aseprite.org/docs/cli/)                                                                | Automated export and splitting                                   |
| [Aseprite — Slices](https://www.aseprite.org/docs/slices/)                                                          | Pivots and metadata                                              |
| [Aseprite — Export Sprite Sheet API](https://www.aseprite.org/api/command/ExportSpriteSheet)                        | Scripted export                                                  |
| [Universal LPC Character Generator](https://sanderfrenken.github.io/Universal-LPC-Spritesheet-Character-Generator/) | Reference implementation of modular frame-based character assets |
| [Universal LPC Source](https://github.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator)          | Frame and equipment conventions                                  |
| [TexturePacker Settings](https://www.codeandweb.com/texturepacker/documentation/texture-settings)                   | Padding, extrusion, trimming, atlas packaging                    |

### Videos

| Resource                                                                                      | Relevance              |
| --------------------------------------------------------------------------------------------- | ---------------------- |
| [Aseprite — Layers Simplify Pixel Art Animation](https://www.youtube.com/watch?v=LcUEDfke27Q) | Layer-based authoring  |
| [Aseprite — Top-Down Character Animation](https://www.youtube.com/watch?v=ty-RxDy9_SQ)        | Directional animation  |
| [Aseprite — Advanced Sprite Sheet Export](https://www.youtube.com/watch?v=Pa9m8U6umDc)        | Export workflows       |
| [Aseprite — Export Animations by Tags](https://www.youtube.com/watch?v=KzgugqLahik)           | Animation segmentation |

## C. Skeletal and modular attachment systems

### Written

| Resource                                                                                   | Relevance                                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------------ |
| [Spine — Skins](https://esotericsoftware.com/spine-skins)                                  | Equipment attachments and reusable skins   |
| [Spine — Mix and Match](https://esotericsoftware.com/spine-unity-mix-and-match)            | Runtime equipment combinations             |
| [Spine — Mix and Match Example](https://esotericsoftware.com/spine-examples-mix-and-match) | Complete modular character implementation  |
| [Spriter — User Manual](https://brashmonkey.com/spriter_manual/Spriter_Manual.pdf)         | Character maps, attachments, and animation |

### Videos

| Resource                                                                           | Relevance                      |
| ---------------------------------------------------------------------------------- | ------------------------------ |
| [Spine — Skins Basics](https://www.youtube.com/watch?v=Jkd7Q5nkzX8)                | Skin authoring                 |
| [Spine — 3 Skins and 6 Directions](https://www.youtube.com/watch?v=-fRRAQDOMBU)    | Directional modular characters |
| [Spine — Different Proportions Skins](https://www.youtube.com/watch?v=GDljddkK3R0) | Body compatibility             |
| [Spriter — Character Maps](https://www.youtube.com/watch?v=NufHCAHrEdw)            | Reusable modular equipment     |
| [Spriter — Weapon Swapping](https://www.youtube.com/watch?v=5Bq3r6j-XIk)           | Equipment changes              |

These are primarily architectural references rather than direct instructions for the proposed frame-based PixelLab runtime.

## D. PixelLab official tutorials and documentation

### Written

| Resource                                                                                     | Relevance                        |
| -------------------------------------------------------------------------------------------- | -------------------------------- |
| [Ways to Use PixelLab](https://www.pixellab.ai/docs/ways-to-use-pixellab)                    | Supported environments           |
| [PixelLab + Pixelorama](https://www.pixellab.ai/docs/introduction-pixelorama)                | AI generation within an editor   |
| [Aseprite Extension Installation](https://www.pixellab.ai/docs/installation)                 | Local editor integration         |
| [Rotating a Character](https://www.pixellab.ai/docs/guides/rotating-a-character)             | Direction generation             |
| [Create 8-Directional Sprite Pro](https://www.pixellab.ai/docs/tools/create-8-rotations-pro) | Multi-direction generation       |
| [Animate with Skeleton](https://www.pixellab.ai/docs/tools/animate-with-skeleton)            | Pose-controlled animation        |
| [Animation with Text](https://www.pixellab.ai/docs/tools/animation)                          | Reference-based frame generation |
| [Animation to Animation](https://www.pixellab.ai/docs/tools/animation-to-animation)          | Motion reuse                     |
| [Transfer Outfit Pro](https://www.pixellab.ai/docs/tools/transfer-outfit-pro)                | Multi-frame clothing transfer    |
| [Edit Animation Pro](https://www.pixellab.ai/docs/tools/edit-animation-pro)                  | Multi-frame equipment editing    |
| [Edit Image Pro](https://www.pixellab.ai/docs/tools/edit-image-pro)                          | Character-anchored editing       |
| [Try On](https://www.pixellab.ai/docs/tools/try-on)                                          | Garment preview                  |
| [Inpainting](https://www.pixellab.ai/docs/options/inpainting)                                | Localized changes                |
| [Output Methods](https://www.pixellab.ai/docs/options/general)                               | Layer-oriented editor output     |
| [Color Controls](https://www.pixellab.ai/docs/options/color)                                 | Palette discipline               |
| [PixelLab API v2](https://api.pixellab.ai/v2/docs)                                           | Public programmatic interface    |
| [PixelLab JS SDK](https://github.com/pixellab-code/pixellab-js)                              | API integration                  |
| [PixelLab MCP](https://github.com/pixellab-code/pixellab-mcp)                                | Agent integration                |

### Videos

| Resource                                                                                                    | Relevance                                                                     |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [PixelLab — Animate, Rotate, and Inpaint Your Character](https://www.youtube.com/watch?v=hOZzbQBjKPc)       | Full workflow; equipment inpainting begins around 13:11                       |
| [PixelLab — Creating Characters with Rotations and Animations](https://www.youtube.com/watch?v=RISPOYqeEGo) | Character and animation generation                                            |
| [PixelLab — Generating Characters and Animations](https://www.youtube.com/watch?v=ptWw9gkgorQ)              | General character workflow                                                    |
| [PixelLab — Generate Character Rotations](https://www.youtube.com/watch?v=ufQ72nGORC0)                      | Multi-direction sprites                                                       |
| [PixelLab — Rotate Your Character](https://www.youtube.com/watch?v=bNtMm0SeJ74)                             | Rotation iteration                                                            |
| [Pixelorama + PixelLab Workflow](https://www.youtube.com/watch?v=9KUAQqzaxsU)                               | Integrated editing                                                            |
| [Building Modular Clothes with PixelLab](https://www.youtube.com/shorts/1EDq2xHQcJ8)                        | Clothing-overlay concept; previously identified, not independently reverified |
| [Changing Character Outfits with PixelLab](https://www.youtube.com/shorts/XF3VEbLnWCw)                      | Outfit changes; previously identified, not independently reverified           |
| [PixelLab Tutorial Playlist](https://www.youtube.com/playlist?list=PLqxDfnv9FagPWIQo4Jia8SX5CkFX9iuZ2)      | Additional animation and creation tutorials                                   |

The most directly useful starting video is PixelLab's **Animate, Rotate, and Inpaint Your Character**, because it includes equipment creation using inpainting.

## E. AI sprite-generation and extraction research

These resources support future technical investigation. They do not establish that the methods are available as native PixelLab features.

| Research                                                                              | Relevance                                |
| ------------------------------------------------------------------------------------- | ---------------------------------------- |
| [Sprite Sheet Diffusion](https://arxiv.org/abs/2412.03685)                            | Generating character animation sheets    |
| [Missing Data Imputation GAN](https://arxiv.org/abs/2409.10721)                       | Generating missing sprite poses          |
| [Generating Pixel Art Character Sprites Using GANs](https://arxiv.org/abs/2208.06413) | Direction and pose translation           |
| [APES — Articulated Part Extraction](https://arxiv.org/abs/2206.02015)                | Extracting articulated parts from sheets |
| [Fast Sprite Decomposition from Animated Graphics](https://arxiv.org/abs/2408.03923)  | Layer and object decomposition           |
| [SketchBetween](https://arxiv.org/abs/2209.00185)                                     | Animation in-between generation          |

Additional approaches previously surveyed include img2img, ControlNet, IP-Adapter, LoRA, DreamBooth, and deterministic pixelization.

Their main value is structure preservation, reference consistency, style specialization, or local editing.

For this project, PixelLab-native workflows should be tested before introducing a separate AI-model stack.

---

## 19. Open Questions

The research leaves the following questions unresolved:

1. Can PixelLab's changes-only editor output consistently isolate fitted equipment without unwanted body pixels?
2. Does masked editing preserve enough body pixels for reliable automated extraction?
3. Can Transfer Outfit generate clothing consistent enough across large animation sets?
4. How should equipment hidden behind the character be generated?
5. When should an item become a front/back bundle rather than one layer?
6. Can skeleton keypoints improve equipment positioning enough to justify the added complexity?
7. How much automated cleanup is acceptable before user review becomes necessary?
8. Which body types and animation types require separate equipment libraries?
9. What is the practical quality/cost advantage of single-frame editing versus multi-frame generation?
10. How frequently should the system fall back to baked composites instead of reusable layers?

These are the appropriate subjects for the next experimental stage.

---

## 20. Recommended Research Outcome

The strongest architecture identified is a **PixelLab-first, character-anchored, frame-based paperdoll pipeline**.

PixelLab should generate the characters, animations, and equipment visuals.

The surrounding system should turn those outputs into reusable, synchronized paperdoll assets through extraction, masks, metadata, and validation.

The first implementation priority should be **proving reliable transparent equipment-layer extraction from PixelLab edits**.

If that succeeds, animated equipment, directional variants, runtime composition, and automated exports become substantially more achievable.

If it fails for certain asset classes, retain explicit alternatives:

- Editor-created layers.
- Separate generated equipment parts.
- Two-pass AI extraction.
- Pre-rendered composites.

The architecture should support these routes without falsely presenting every AI output as a reusable paperdoll layer.

**Final recommendation:** Continue the existing PixelLab Pip paperdolling research and implementation plan, prioritizing practical extraction tests, temporal validation, and a portable paperdoll package format before building a large automated generation interface.

---

**Research status:** Documentation complete; proposed generation and extraction techniques remain unvalidated until tested with actual PixelLab outputs.
