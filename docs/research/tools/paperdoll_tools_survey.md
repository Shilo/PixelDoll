# Paperdoll / character-creator tools survey (R5, 2026-10-20)

Purpose: find functionality, data models and UX patterns that PixelDoll should copy, and the weaknesses it should avoid.
PixelDoll is a client-side Svelte+TS app that produces **frame-based** pixel-art paperdoll sets (a base plus frame-aligned
layers) with PixelLab, and exports them to Godot, Unity and Phaser.

Deep dives (read from source):

- [fralonra/fralonra_paperdoll_review.md](fralonra/fralonra_paperdoll_review.md): fralonra paperdoll, `.ppd`, PpdEditor/Viewer, bevy plugin
- [lpc/lpc_generator_review.md](lpc/lpc_generator_review.md): Universal LPC Spritesheet Character Generator (the most important prior art)

Everything else below comes from web research. Vendor claims, especially from AI tools, are marked as claims and have not
been verified hands-on.

---

## 1. Tools

### 1.1 Frame-based paperdoll generators (closest to PixelDoll)

**Universal LPC Spritesheet Character Generator**
([repo](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator)). See the deep dive. In short: a
data-driven item JSON (`type_name` slot; `layer_1..9`, each with an integer `zPos` and per-body-type paths; `animations`;
`variants`; `recolors` with palette ramps; `match_body_color`; `credits`), a fixed 64 px universal sheet, an animated preview,
license and animation filters, and four ZIP split modes plus `character.json` and credits. The shareable state lives in the
URL hash.

**LPC forks and alternatives**

- [Vitruvian Studio](https://lpc.opengameart.org/node/159745) ([site](https://vitruvianstudio.github.io/)) reduced all ULPC
  sprites to **at most 6 shades per material, up to 4 materials per sprite**, so recoloring is instant. It exports PNGs per
  animation, either merged or **one per layer**, and saves and loads JSON settings. Its weakness is that saved settings live
  in localStorage only.
- [pflat LPC Character Generator](https://pflat.itch.io/lpc-character-generator) is a desktop alternative.
- [LPCharacterStudio](https://pocdev.itch.io/lpcharacterstudio) is a Godot tool in alpha with a palette system and randomize.
- [RapidLPC](https://etamity.itch.io/rapidlpc) is a paid Godot tool that exports a compact sheet or split animation sheets.
- [lpctools](https://github.com/bluecarrot16/lpctools) is a CLI that `distribute`s a static asset to every frame using
  per-frame head **reference points** and masks, recolors with palettes, and arranges or separates layouts.

**RPG Maker MZ Character Generator**
([MZ product page](https://store.rpgmakerofficial.com/products/rpg-maker-mz),
[MZ preview #3](https://rpgmakerweb.com/blog/rpg-maker-mz-preview-3-character-generator-plugin-manager-event-plugin-command))

- Built-in parts categories: front/rear hair, face, eyes, eyebrows, mouth, clothing, accessories, body and so on
  ([male generator add-on](https://store.rpgmakerofficial.com/products/male-character-generator-mz)).
- Each part is recolored with **gradient rows** in a gradients PNG. Adding a row adds a color option, and MZ removed the cap
  on the number of rows.
- MZ added an **offset nudge** per part (e.g. glasses on the nose, a hat over a hairstyle).
- One selection produces the **face**, **walking (TV/TVD)** and **side-view battler (SV)** outputs together. Part folders are
  Face, SV, TV, TVD and Variation ([organizer tool](https://patriot-programmer.itch.io/character-generator-file-organizer)).
- Weaknesses: you cannot add new part tabs ([forum request](https://guild.rpgmakerofficial.com/t/topic/2357?tl=en)),
  part filenames collide across packs, and MV→MZ parts need manual fixes
  ([blog](https://www.rpgmakerweb.com/blog/can-we-use-mv-generator-parts-in-mz)).
- In-game layered equipment needs plugins such as
  [CharacterEquipmentLayers](https://mroco.itch.io/characterequipmentlayers), which composites
  `img/CustomEquipment/!$Var_Value.png` layers with an order set by variables.
- *Not verified:* the exact grayscale/mask file convention of the generator parts (search did not confirm it).

**Unity asset-store creators**

- [Character Creator 2D](https://discussions.unity.com/t/character-creator-2d-editor-runtime-character-customization/692716):
  body sliders, colorable equipment, runtime UI, and save-as-prefab.
- [Character Creator Modern 2D](https://marketplace.unity.com/packages/2d/characters/character-creator-modern-2d-315269):
  swap gear live, per-part colors, animation preview, and **8-direction spritesheet export for 20+ animations**.
- [Pixel Character Creator 2D](https://gamebetweenthelines.itch.io/pixel-character-creator-2d): automates slicing, animation
  creation and prefab setup, and is explicitly editor-only (not usable in-game).

### 1.2 Stationary dress-up makers (UX reference)

**fralonra paperdoll / PpdEditor** ([repo](https://github.com/fralonra/paperdoll)). See the deep dive.

- Data model: Doll → Slots (positions, anchor, required, ordered candidates) → Fragments (image + pivot).
- Z-order is the slot list order. There is no color, no animation, and the editor has no undo.
- Very good editor micro-UX: visibility/lock/snap toggles per slot row, snapping guides, a 3×3 pivot picker, batch import,
  and a context-sensitive hint bar.

**Picrew** ([basics](https://support.picrew.me/en/create_imagemaker/create_first),
[step-by-step](https://support.picrew.me/en/?p=1640),
[color link](https://support.picrew.me/en/creator_functions/color_link_settings),
[Wikipedia](https://en.wikipedia.org/wiki/Picrew))

- Hierarchy: **Part** (e.g. hair) → **Items** (long, short, ponytail) → **Layers**. One item can span several layers, for
  example front hair over the body and back hair behind it. Wikipedia gives a limit of about 50 parts and layers per maker.
- **Colors are pre-rendered**: the number of images is items × layers × colors.
- A **Color Link** palette sets several parts at once (front and back hair always match).
- **Item rules** forbid combinations (a hair bun with a hat).
- A **left-right pair** part type handles eye spacing.
- **Controller** bounds let the end user move, scale or rotate within creator-set limits.
- Panels (item, color, controller) appear only when the selected part supports them. There is a randomize button.
- Weakness: no animation, and pre-rendered colors multiply the asset count.

### 1.3 Skeletal / cutout tools with skins (for the data-model vocabulary)

**Spine skins** ([skins](https://en.esotericsoftware.com/spine-skins),
[mix-and-match example](https://en.esotericsoftware.com/spine-examples-mix-and-match),
[spine-unity mix and match](https://en.esotericsoftware.com/spine-unity-mix-and-match),
[skin constraints](https://en.esotericsoftware.com/blog/Skin-constraints-for-different-proportions))

- Animations key **skin placeholders**, which are named after the *role* (`head`, `bag-strap-back`) and not after the item.
- A skin supplies at most one attachment per placeholder.
- Complex projects use **one skin per item** and combine the visible skins at runtime (Skin API ≥ 3.8).
- Skins can carry **their own bones and constraints**, so a dress can have extra rig that only activates with that skin, and
  proportions can change per skin.
- Animations can key draw order.
- Lesson: name slots by role, and let items carry extra data (e.g. extra frames or anchors).

**DragonBones** ([Cocos docs](https://docs.cocos.com/creator/3.5/en/editor/components/dragonbones.html))

- Swaps equipment by replacing a slot's display (`replaceSlotDisplay`) or cycling `displayIndex`.
- A known pitfall is misalignment when the replacement has a different pivot
  ([forum](https://forum.cocos.org/t/dragonbones/46508)). Lesson: be strict about pivots.

**Spriter Pro character maps** ([Construct listing](https://www.construct.net/game-assets/tools/spriter-344))

- Maps image → replacement image, or image → hidden, on top of the same animation. Maps can be stacked and swapped at
  runtime.
- Community tip: give every swap image the same handle point. This is essentially a **paperdoll for cutout animation**.

**Unity 2D Animation Sprite Library / Sprite Resolver**
([Sprite Library Asset](https://docs.unity3d.com/Packages/com.unity.2d.animation@9.0/manual/SLAsset.html),
[setup](https://docs.unity3d.com/Packages/com.unity.2d.animation@9.1/manual/SpriteSwapSetup.html))

- **Category + Label** addressing. Animation clips key labels using constant tangents. Library assets can be merged (labels
  in the same category are merged).
- This is the natural **Unity export target**: category = slot/animation, label = item/frame (R3 covers the details).

### 1.4 Pixel editors and layer workflows

**Aseprite**

- Layers act as slots or items, and tags act as animations.
- CLI: `--split-layers`, `{layer}`/`{tag}`/`{group}` filename tokens, `--sheet`/`--data` JSON
  ([split layers with groups](https://community.aseprite.org/t/cli-option-for-combining-layer-groups-when-exporting-split-layers/309),
  [sheet per layer](https://community.aseprite.org/t/create-spritesheet-for-each-layer/23985)).
- Pitfalls: groups export both the children and the group itself, and Lua `ExportSpriteSheet` with layer filters has had bugs.
- The community **modular export script** outputs `LayerGroup/TagL1/TagL2/…/Variant.png`, e.g.
  `Weapon/Run/Staff/Loop/Wooden.png`
  ([thread](https://community.aseprite.org/t/script-export-modular-spritesheets-with-nested-tags-in-aseprite-for-2d-character-customization/25831)).
- [Prismap](https://catkintales.itch.io/prismap) applies gradient maps by brightness (up to 8 stops, includes skintone sets).
- Lesson: offer an **`.aseprite`-compatible layout** (one layer per item, one tag per animation) as an interchange export.
  The format is documented. This is a stretch goal.

**Pyxel Edit** is a tile and animation editor with no paperdoll-specific features. It is low relevance and was not
researched further.

**Lospec** is the de-facto palette library: community palette JSON/hex, the
[lospec-cli](https://github.com/jmg-duarte/lospec-cli), and the
[Aseprite importer](https://sudo-whoami.itch.io/lospec-palette-importer). Its palette-list endpoint is undocumented and found
by the community, so treat it as unstable. Useful as an optional "project palette" source for PixelLab's forced palette.

### 1.5 AI sprite tools (how they handle layers and consistency)

| Tool | What it does | Layers/equipment? |
|---|---|---|
| [Retro Diffusion](https://replicate.com/blog/retro-diffusions-pixel-art-models-are-now-on-replicate) ([Scenario essentials](https://help.scenario.com/en/articles/retro-diffusion-models-the-essentials/), [MCP](https://mcpservers.org/servers/retro-diffusion/retro-diffusion-mcp)) | Pixel-art models, fixed animation styles (4-dir walk, idle), `return_spritesheet`, **palette image upload**, up to 9 reference images for consistency | No layer output |
| [Ludo.ai Sprite Generator](https://ludo.ai/docs/sprite-generator) ([2026 update](https://www.gamedeveloper.com/press-release/ludo-ai-upgrades-sprite-generator-with-pose-generator-sequence-and-transition-tools-and-updated-export-options)) | Image/prompt → animation via presets, text or **reference video**; pose generator, rotate, Sequence/Transition chaining; grid PNG/frames/GIF; API + MCP | No layer output |
| [Scenario](https://help.scenario.com/en/articles/create-spritesheets-with-scenario) | Base image → video model → extracted frames; consistency through **custom-trained models** | No layer output; weak pixel tooling per competitors |
| [AutoSprite](https://autosprite.itch.io/autosprite) ([gamedev.net](https://gamedev.net/projects/7258-autosprite/)) | Single image/prompt → 20+ preset animations, 8-dir, **atlas metadata (frame rects, durations, loop)**, FPS/loop-point preview, engine exports, API/MCP (claims) | No layer output |
| God Mode AI ([maker post](https://www.producthunt.com/@gavin_li2)) | Upload a design → ~100 actions/views, side or 8-dir isometric (claims) | Not documented |
| [Sprite-AI](https://www.sprite-ai.art/ai-pixel-art-generator) | Prompt → exact-grid pixel art (32–400 px), **palette lock 16/24 colors**, animate the same character, built-in pixel editor | No layer output |
| [Layer.ai](https://www.layer.ai/use-cases/sprite-generation), Pixa, etc. | Multi-direction sets with "consistent proportions" (marketing) | No |
| PixelLab (R2 covers) | Rotations, animation, skeleton, edit/inpaint, `color_image` forced palette on most create/animate endpoints (per the saved OpenAPI spec) | Inpaint `output_method` "changes only" (S1 testing) |

**Finding:** none of the surveyed AI tools outputs frame-aligned **equipment layers**. They all output a single composited
character. Their consistency levers are reference images, palette locking, custom models and fixed animation templates. A
paperdoll layer pipeline (canonical base → per-item edit → layer extraction → QA → z-composition) is an **unoccupied niche**,
and that niche is PixelDoll.

---

## 2. Comparison table

| Tool | Frame-based anim | Slot/layer model | Z-order model | Color model | Export | Standout UX | Main weakness |
|---|---|---|---|---|---|---|---|
| **ULPC generator** | Yes (64 px, 4 dir, ~15 anims + oversize) | `type_name` slot → item → `layer_1..9` | Global int `zPos`; fg/bg split layers | Indexed ramp swap (GPU), multi-region, linked to body | PNG sheet, 4 ZIP splits, JSON v2, credits CSV/TXT | Filters (license, anim), animated preview, palette modal, URL hash | Fixed layout, no per-dir z data, selector only |
| Vitruvian Studio | Yes (LPC) | LPC | LPC | ≤6 shades × ≤4 materials, instant | PNG per anim, merged or per layer; JSON | Instant recolor | localStorage only, PoC |
| RPG Maker MZ gen | Yes (walk 3×4, SV) | Fixed part tabs | Fixed per part type | Gradient rows | Face + walk + SV battler | Offset nudge, one selection → 3 outputs | Can't add tabs, collisions |
| Unity CC2D / Modern 2D | Yes (8-dir, 20+ anims) | Parts on a rig | Fixed | Per-part tint | Spritesheets, prefabs | Live swap + preview | Unity-only, fixed art set |
| fralonra paperdoll | **No** (stationary) | Doll → Slot → Fragment | Slot list order | None | `.ppd` (tar+YAML), PNG | Snap guides, pivot 3×3, hint bar | No anim, float coords, render bug |
| Picrew | No | Part → Item → Layers | Layer list; front/back per item | Pre-rendered colors + Color Link | PNG | Rules, color link, controller bounds | No anim; asset explosion |
| Spine skins | Skeletal | Slot + placeholder + skin | Draw order (animatable) | Tint per slot | Runtime JSON/atlas | Skin per item, skin bones | Not frame-based |
| Spriter char maps | Cutout | Image remap/hide | Z keyed in anim | — | SCML | Stackable maps | Pro-only, aging |
| Unity Sprite Library | Frame or bone | Category/Label | Renderer order | — | Unity assets | Label keying | Unity-only |
| Aseprite | Yes | Layers + tags | Layer stack | Indexed mode, gradient-map ext | `--split-layers`, JSON | Universal pixel editor | Group/tag export quirks |
| AI tools (RD, Ludo, Scenario, AutoSprite, …) | Yes | **None (single composite)** | — | Palette lock | Sheets + atlas JSON | Presets, motion transfer | No layers, drift |

---

## 3. UX patterns worth copying

1. **Three-pane builder**:
   - Left: a category/slot tree with search and filters.
   - Center: a large **animated preview** with an animation and direction picker and a play/pause/scrub frame strip.
   - Right or bottom: the full sheet or the layers.
   - LPC and PpdEditor both converge on this layout.
2. **Compatibility filters as first-class toggles**: show only items that support the chosen base, animations and directions.
   LPC filters by license and animation, and PixelDoll should filter by *coverage*, e.g. "item covers 8/8 dirs, 5/6 anims".
   Show **coverage badges** on item cards, and give missing frames a one-click "generate missing".
3. **Item cards with real thumbnails** taken from a chosen representative frame (LPC `preview_row/column`).
4. **Palette modal**: material tabs (skin, hair, eyes, cloth, metal), swatch tiles with live mini-previews, and remembered
   recent colors (LPC `item-with-recolors` "remembered-color").
5. **Linked colors**: "match body color", and one hair palette driving front hair, back hair and eyebrows (LPC
   `match_body_color`, Picrew Color Link).
6. **Combination rules**: "hat hides hair-top", "bun incompatible with hat" (Picrew item rules). Store them as declarative
   `hides`/`excludes`/`requires` tags, and actually enforce them (LPC declares tags but does not enforce them).
7. **Per-layer row toggles**: visibility, lock and solo (PpdEditor eye/lock/snap). Add **onion-skin** of the base under an item
   layer.
8. **Randomize** (Picrew, LPCharacterStudio) with per-slot lock, which helps both QA and fun.
9. **Shareable state**: a URL hash or JSON with `version` and `aliases` (LPC). For PixelDoll the project JSON is the
   document, and the URL can carry a small "outfit" selection.
10. **Undo/redo through a command queue** (fralonra's action enum, plus history).
11. **Context-sensitive hint bar** and keyboard shortcuts (PpdEditor).
12. **Advanced escape hatch**: upload your own PNG layer and choose its z (LPC custom overlay). For PixelDoll this means a
    manually drawn or fixed layer that enters the same pipeline.
13. **Export dialog with split modes** (LPC): full sheet; per animation; per item; per item × animation; per frame. Every
    export always includes a manifest and provenance.

## 4. Lessons for PixelDoll

### 4.1 Features to copy

- An item-definition JSON modelled on LPC's `SheetDefinition`, but **generated**, not hand-written (see §4.3).
- **Multiple z-layers per item** (behind/front), plus PixelDoll's addition: **per-direction (optionally per-frame) z
  override**, which LPC lacks and works around by splitting.
- **Playback `cycle` arrays**, separate from stored frames. Holds and ping-pong cost no extra generations.
- **Derived layouts** that reference canonical base frames (LPC oversize `"thrust-n,2"`). Engine-specific sheet layouts become
  *views* of one canonical frame store.
- **Per-frame anchors / reference points** (head, hands, feet), computed from the base once. They are used to (a) place
  static accessories across all frames the way lpctools `distribute` does, which needs no AI call for rigid items such as
  hats, glasses or held weapons; (b) QA-check item drift; and (c) export attach points for engines.
- **Provenance pipeline** like LPC credits: every layer records the endpoint/model, prompt, seed, input hashes, date and
  PixelLab job id. The build or export fails if any of it is missing (LPC's "never ship without credits").
- **Four ZIP split modes** + `manifest.json` + a per-engine importer (R3).

### 4.2 UX flows

1. **Create base** (text or reference) → pick directions and animations → generate → review the grid (direction × animation)
   → lock the base as the "rig contract" (canvas, frame count, pivot, anchors).
2. **Add item to slot**: choose the slot (role name, e.g. `head`, `torso`, `hand_r`) → prompt → PixelLab edits the base frames
   → layer extraction → **QA view** (diff heatmap, body-drift warnings, behind/front classifier, temporal jitter) → accept or
   retry per frame.
3. **Dress-up**: a slot carousel (fralonra viewer), a palette modal and randomize, all with a live animated preview.
4. **Export**: pick an engine preset → split mode → ZIP.

### 4.3 Data-model ideas (input for the manifest spec)

```jsonc
{
  "version": 1,
  "rig": { "cell": [64, 64], "pivot": [32, 56], "directions": ["s","se","e","ne","n","nw","w","sw"],
           "animations": { "walk": { "frames": 8, "cycle": [0,1,2,3,4,5,6,7], "fps": 10 } },
           "anchors": { "head": { "walk": { "s": [[32,14],[32,13], "..."] } } } },     // per-frame reference points
  "materials": { "skin": { "source": ["#271920","#99423c","#cc8665","#e4a47c","#f9d5ba","#faece7"] },
                 "hair": { "source": ["..."] }, "eyes": { "source": ["#293d4b","#5187b3","#50d4ec"] } },
  "slots": [ { "id": "hair", "required": false, "default": null } ],
  "items": [ {
    "id": "hair_long", "slot": "hair", "tags": ["hair"], "hides": [], "excludes": ["hat_tall"],
    "layers": [ { "id": "back",  "z": 5,   "zByDir": { "n": 110 } },                     // per-direction override
                { "id": "front", "z": 120 } ],
    "materials": ["hair"], "linkMaterial": { "hair": "@character.hair" },
    "coverage": { "walk": ["s","e","n","w"] },
    "frames": "items/hair_long/{layer}/{anim}/{dir}/{i}.png",
    "provenance": [ { "endpoint": "/edit-animation-v2", "prompt": "...", "seed": 123, "jobId": "...", "date": "..." } ]
  } ]
}
```

Rules learned the hard way by others:

- **Integer pixel coordinates only.** fralonra's float anchors caused off-by-one placement.
- **Never resample pixel art.** fralonra's "constrained" stretch mode does.
- **Stable ids plus aliases.** LPC forwards old URL-hash keys to renamed assets instead of breaking links.
- **Name slots by role, not by item** (the Spine placeholder convention).
- **Pivot discipline across all frames and items** (the DragonBones misalignment pitfall).

### 4.4 Color / tint model (answers the user's "grayscale + dynamic color, also eyes and hair?")

There are three options, from best fit to worst for pixel art:

1. **Indexed material ramps (recommended; LPC/Vitruvian proven)**
   - Each material (skin, hair, eyes, cloth_1, cloth_2, metal, leather…) has a canonical **source ramp** of 3–6 colors,
     ordered shadow → highlight, with colors that are *unique across materials*.
   - Recolor is an exact-match lookup into a target ramp (a GPU shader with a CPU fallback, like LPC), so several materials can
     live in one layer with no masks (LPC pigtails: hair + hair tie).
   - Eyes (a 3-color ramp in LPC) and hair (6 colors) work exactly this way, so **yes, eyes and hair are the canonical use**.
   - **How to get AI output into exact ramps:** pass the combined source ramps as PixelLab's **forced palette `color_image`**,
     which most create/animate endpoints accept per the saved OpenAPI spec. Then run a local **ramp-snap** (nearest color in
     OKLab, restricted to the region's material ramp) to clean up stray colors. S1/R2 should verify how strictly PixelLab
     honours the forced palette.
2. **Grayscale → gradient map (the user's idea; a good *authoring* path and fallback)**
   - Convert a colored PixelLab layer to luminance, quantize to N bands per region, and map the bands to a ramp. This
     *produces* the indexed form in (1) from arbitrary generated colors: "turn colored char to grayscale, then set the color on
     it immediately", as in the inspiration note.
   - Caveats:
     - Two materials of similar brightness in one layer collide, so it needs a region mask, e.g. from a PixelLab
       inpaint/segmentation step or a quick user brush.
     - Pure luminance loses hue-shifted shading. Mitigate by letting the target ramps themselves be hue-shifted
       ([ramp advice](https://www.wayline.io/color-ramp-generator)).
     - Bands must be evenly spaced and the counts must match
       ([Godot remap shader](https://godotshaders.com/shader/color-remap-shader-palette-swapper/),
       [gradient shift shader](https://github.com/KoBeWi/Godot-Gradient-Shift-Shader)).
   - The RO base the user linked ([moonfaeriestudio](https://www.deviantart.com/moonfaeriestudio/art/RO-Model-Female-Base-large-chest-for-RPGM-VX-Ace-458902870))
     follows the same "neutral base, recolor later" philosophy.
3. **Multiply tint (`modulate`)** is the easiest engine path (Godot `modulate`, Unity `SpriteRenderer.color`, Phaser
   `setTint`). It only looks right on near-white or flat items, so offer it as an export *option*, not the core model.

**Export:** either (a) baked color variants (Picrew-style; simple but an asset explosion), or (b) source-ramp PNG +
`palettes.json` + a tiny per-engine palette-swap shader. Ship both, and default to (b) for skin, hair and eyes.

---

## 5. Sources

Primary code:

- <https://github.com/fralonra/paperdoll>, <https://github.com/fralonra/paperdoll-tar>, <https://github.com/fralonra/ppd-editor>,
  <https://github.com/fralonra/bevy-paperdoll>
- <https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator>, <https://github.com/bluecarrot16/lpctools>

Other sources are cited inline above. Notable ones:

- Spine: <https://en.esotericsoftware.com/spine-skins>
- Picrew: <https://support.picrew.me/en/creator_functions/color_link_settings>
- RPG Maker: <https://rpgmakerweb.com/blog/rpg-maker-mz-preview-3-character-generator-plugin-manager-event-plugin-command>
- Unity: <https://docs.unity3d.com/Packages/com.unity.2d.animation@9.0/manual/SLAsset.html>
- Aseprite: <https://community.aseprite.org/t/script-export-modular-spritesheets-with-nested-tags-in-aseprite-for-2d-character-customization/25831>
- Ludo: <https://ludo.ai/docs/sprite-generator>
- AutoSprite: <https://autosprite.itch.io/autosprite>
- Vitruvian: <https://lpc.opengameart.org/node/159745>
- Godot shaders: <https://godotshaders.com/shader/color-remap-shader-palette-swapper/>
