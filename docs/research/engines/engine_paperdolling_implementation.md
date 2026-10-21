# Engine paperdolling implementation patterns (R3)

Research agent R3, 2026-10-20. Scope: how developers do **traditional frame-based layered sprite paperdolling** in Godot 4,
Unity 2022/6, Phaser 3/4 and generic engines, and what PixelDoll should export so it imports cleanly everywhere.

Confidence tags: **[V]** checked against the official docs/source this session, **[C]** from community posts, forums, or
third-party listings, **[K]** from prior knowledge and not re-checked here. Treat **[K]** items as things to verify in the Phase 5 tests.

---

## 1. Summary

1. **All three engines use the same pattern: one sprite node per layer, with identical frame layouts, driven by one clock.**
   This works if every layer sheet has the **same grid, cell size, pivot, frame count, and timing** as the base body.
   If it doesn't, syncing frames turns into a per-engine problem. This "rig contract" is PixelDoll's most important export guarantee.
2. **The proven fix for front/back occlusion is to split an item into sub-layers with static z-values, not to keep per-frame z tables.**
   The Universal LPC generator ships capes, tails, baskets and weapons as `fg` and `bg` (and `behind`) sheets, each with its own
   global `zPos`. A cape uses `zPos` 85 in front and 5 behind; a longsword uses 140, 9, and -1 or 150 for the oversize slash.
   Every engine can import this without custom logic. A per-direction z override table is still useful, but should be optional. **[V]**
3. **Layers PixelDoll extracts with diff are already occluded against the base body.**
   Pixels hidden by the body never make it into the diff, so any single item draws correctly *on top of* its base.
   The z-order only matters **between items**, for example a cape against shoulder armor, or hair against a helmet.
   It also means a layer extracted against body A cannot be reused on body B. (This is my inference from D2 and needs confirmation in S1.)
4. **Bake when you can, layer at runtime when you have to.** Runtime layering costs about one draw per layer per character.
   Batching usually hides this: Godot 4.4+ batches 2D in all renderers, Phaser batches across texture units, and Unity uses SpriteAtlas.
   Runtime layering keeps per-layer tint and palette swaps and allows instant equip. Baking on equip change (Godot `Image.blend_rect`,
   Phaser `RenderTexture`, Unity `RenderTexture`/`Texture2D`) produces one sprite per character and suits crowds.
   PixelDoll should export **separate layers plus optional pre-baked composites**.
5. **Use uniform, untrimmed cells for layers.** Trimming saves memory but forces every engine to restore offsets
   (Phaser does this automatically from `spriteSourceSize`, Godot needs `AtlasTexture.margin`, Unity needs per-sprite pivots).
   PixelLab canvases are small (16–256 px), so a fixed grid is cheap and removes a whole class of alignment bugs.
6. **Per-engine output to generate:** Godot gets `SpriteFrames` `.tres` files per layer, a `.tscn` rig, and a ~40-line sync script.
   Unity gets PNGs, the manifest, and an **Editor importer script** that slices, builds the Sprite Library and clips, and adds a runtime sync component.
   Hand-writing `.meta` YAML is fragile, so avoid it. Phaser gets per-layer atlas JSON (TexturePacker JSON-Hash), a loader snippet,
   and a `Container` class. Generic engines get strip PNGs with the `_stripN` suffix, the manifest, and optionally an RPG Maker sheet.

---

## 2. Cross-engine primitives

### 2.1 Coordinate and pivot conventions (where most bugs come from)

| Engine | Image origin | Pivot / origin unit | Convert from PixelDoll pivot `(px, py)` in a `w×h` cell (top-left origin, pixels) |
|---|---|---|---|
| Godot 4 | top-left, Y down | pixels (`offset`, `centered`) | `centered = false; offset = Vector2(-px, -py)` |
| Unity | **bottom-left, Y up** | normalized 0..1 of the sprite rect | `pivot = (px / w, 1 - py / h)`. Sprite `rect.y` is also measured from the **bottom** of the texture: `y_unity = texH - y_top - h` **[K]** |
| Phaser 3/4 | top-left, Y down | normalized 0..1 (`setOrigin`) | `origin = (px / w, py / h)`. Phaser applies it automatically from atlas `pivot`/`anchor` (see 2.3) **[V]** |
| Aseprite / TexturePacker JSON | top-left | pixels (Aseprite slice pivot), normalized (TP `pivot`) | Aseprite slice `pivot:{x,y}` in pixels relative to the slice bounds; TexturePacker `pivot:{x:0.5,y:0.875}` |

PixelDoll should store pivots **in pixels, top-left origin, per cell** (feet or ground contact point). Each exporter converts.

### 2.2 Aseprite JSON (the format tools already read)

Aseprite's JSON format is not formally documented, but it is a de facto standard close to TexturePacker's
([community thread](https://community.aseprite.org/t/what-exactly-does-the-data-in-exported-json-represent/28435),
[typings](https://app.unpkg.com/aseprite-atlas@3.0.0/files/dist/types/Aseprite.d.ts)). The CLI documents the export flags:
`--sheet`, `--data`, `--format json-hash|json-array`, `--sheet-type rows|columns|packed`, `--split-layers`, `--list-tags`,
`--list-layers`, `--list-slices`, `--filename-format "{layer} {tag} {frame} {tagframe}"`, `--trim`, `--ignore-empty`,
`--merge-duplicates`, `--extrude`, `--shape-padding` ([Aseprite CLI](https://www.aseprite.org/docs/cli/)). **[V]**

```json
{ "frames": { "body walk_s 0": { "frame": {"x":0,"y":0,"w":64,"h":64}, "rotated": false, "trimmed": false,
    "spriteSourceSize": {"x":0,"y":0,"w":64,"h":64}, "sourceSize": {"w":64,"h":64}, "duration": 100 } },
  "meta": { "size": {"w":512,"h":256}, "scale": "1",
    "frameTags": [ {"name":"walk_s","from":0,"to":7,"direction":"forward"} ],
    "layers":    [ {"name":"body","opacity":255,"blendMode":"normal"} ],
    "slices":    [ {"name":"pivot","keys":[{"frame":0,"bounds":{"x":0,"y":0,"w":64,"h":64},"pivot":{"x":32,"y":56}}]} ] } }
```

Tags are inclusive `from`/`to` frame indices, and `duration` is in milliseconds per frame. The `.ase` binary format **is** fully documented
(layers 0x2004, cels 0x2005 zlib, tags 0x2018, palette 0x2019, user data 0x2020, slices 0x2022)
([ase-file-specs](https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md)) **[V]**. A browser app could therefore
**write a layered `.aseprite` file**. Unity's Aseprite Importer turns that into a prefab with one SpriteRenderer per layer and clips
per tag, and Godot's Aseprite Wizard imports it too (see §3 and §4). This is a strong interchange option, and artists can touch up the file in Aseprite.

### 2.3 TexturePacker JSON-Hash and Phaser's parser

Phaser's `JSONHash` parser reads `frame`, `rotated`, `trimmed` + `spriteSourceSize`/`sourceSize`, and `anchor || pivot`.
When a frame has a custom pivot, `setFrame()` calls `setOrigin(pivotX, pivotY)` automatically. Extra keys are kept in `frame.customData`,
and extra top-level JSON keys go into `texture.customData`
([JSONHash.js](https://github.com/phaserjs/phaser/blob/master/src/textures/parsers/JSONHash.js),
[Texture.js component](https://github.com/phaserjs/phaser/blob/master/src/gameobjects/components/Texture.js)) **[V]**.
**The PixelDoll manifest can therefore be embedded in the Phaser atlas JSON, and Phaser will keep it.**

The TexturePacker trim modes are None, Trim (keeps apparent size and anchor), CropKeepPos, and Crop (flush, which loses the position).
Use **at least 2 px shape padding** for GL and **extrude** to prevent bleeding
([TexturePacker settings](https://www.codeandweb.com/texturepacker/documentation/texture-settings)) **[V]**.

### 2.4 LPC conventions (the largest existing paperdoll dataset)

From the Universal LPC generator source ([repo](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator)): **[V]**

- `FRAME_SIZE = 64`, with 13 frames per row on the standard sheet. Direction row order is **`up, left, down, right`** (n, w, s, e).
  Animations are row blocks: `spellcast` 0, `thrust` 4, `walk` 8, `slash` 12, `shoot` 16, `hurt` 20 (1 direction), `climb` 21,
  `idle` 22, `jump` 26, `sit` 30, `emote` 34, `run` 38, `combat_idle` 42, `backslash` 46, `halfslash` 50. Each animation has a playback
  `cycle`. Walk plays frames `[1..8]`, so frame 0 is a standing pose that the cycle skips, and idle plays `[0,0,1]`
  ([constants.ts](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/blob/master/sources/state/constants.ts)).
  Frames can repeat, so **an animation is a playlist of cell indices, not necessarily a contiguous range.** PixelDoll should model it the same way.
- Oversize animations use separate layouts with 128 or 192 px frames (`custom_animation: "slash_oversize"`), defined as lists of
  `"slash-n,3"`-style source references
  ([custom-animations.ts](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/blob/master/sources/custom-animations.ts)).
  This is how LPC handles weapons that swing outside the 64 px cell. **The pivot stays fixed, and only the canvas grows.**
- An item definition lists `layer_1..n`, each with `zPos`, per-body-type paths, optional `custom_animation`, an `animations` coverage list,
  `match_body_color`, `recolors` (material and palettes), `credits[]`, and `type_name`, which is effectively the slot
  ([cape_solid.json](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/blob/master/sheet_definitions/torso/cape/cape_solid.json),
  [weapon_sword_longsword.json](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/blob/master/sheet_definitions/weapons/sword/weapon_sword_longsword.json)).
  A global table of every z-value is generated as [z_positions.csv](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/blob/master/scripts/zPositioning/z_positions.csv).
  Examples: arm armour 60, belts 70, backpack 110, beard 110/111, basket fg 130 / bg 5.
- Palette recolor works by keeping a `source` ramp ordered shadow to highlight, with 1–32 colors, plus named variants that give replacement
  colors per index. Pixels match within ±1 per channel. The work runs in a WebGL shader with a CPU fallback
  ([PALETTE_RECOLOR_GUIDE.md](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/blob/master/PALETTE_RECOLOR_GUIDE.md)).
- The generator keeps per-file license and credit metadata (`CREDITS.csv`, credits export). PixelDoll should record its own provenance
  (PixelLab job IDs and prompts) in the same spirit.

---

## 3. Godot 4 (current docs: 4.7)

### Data structures
- **`SpriteFrames`** is a resource holding named animations. Each animation has `speed` (FPS), `loop`, and `frames[]` of `{texture, duration}`,
  where `duration` is a **relative** weight (seconds = `duration / (fps * speed)`)
  ([SpriteFrames](https://docs.godotengine.org/en/stable/classes/class_spriteframes.html)). **[V]**
- **`AnimatedSprite2D`** has the properties `frame`, `frame_progress`, `speed_scale`, and `animation`. The method
  `set_frame_and_progress(frame, progress)` sets both values without resetting progress. It emits the signals
  `frame_changed`, `animation_changed`, `animation_finished`, and `animation_looped`
  ([AnimatedSprite2D](https://docs.godotengine.org/en/stable/classes/class_animatedsprite2d.html)). **[V]**
- **`Sprite2D` + `hframes`/`vframes` + `frame`/`frame_coords`**, driven by an **`AnimationPlayer`** with discrete tracks. One AnimationPlayer
  can key `Body:frame`, `Hair:frame`, `Weapon:frame`, **and `Weapon:z_index` or `Cape:visible` per frame**, which makes it the natural Godot
  home for per-frame occlusion. **[K]**
- **`CanvasGroup`** merges its children into one draw, so overlapping translucent layers don't double up. Use `self_modulate` on the group
  for whole-character tint, hit flash, fade, or outline shader. Keep `fit_margin` and `clear_margin` small. `clip_children` does not work inside it
  ([CanvasGroup](https://docs.godotengine.org/en/stable/classes/class_canvasgroup.html)). **[V]**

### `.tres` SpriteFrames text format (what PixelDoll can write directly) **[K]**
```ini
[gd_resource type="SpriteFrames" format=3]

[ext_resource type="Texture2D" path="res://paperdoll/hero/layers/hair/ponytail/walk.png" id="1"]

[sub_resource type="AtlasTexture" id="w_s_0"]
atlas = ExtResource("1")
region = Rect2(0, 128, 64, 64)
filter_clip = true

[resource]
animations = [{
"frames": [{ "duration": 1.0, "texture": SubResource("w_s_0") }],
"loop": true,
"name": &"walk_south",
"speed": 10.0
}]
```
Notes: `load_steps` and `uid=` are optional, and Godot regenerates them. `AtlasTexture.margin` restores trimmed frames.
Don't ship `.import` files, because Godot creates them on first scan.

### Existing tooling
- **Aseprite Wizard** (Godot 4, MIT) imports `.aseprite` files to `SpriteFrames`, `AnimatedSprite2D`, or `AnimationPlayer`. It can output **one
  SpriteFrames per layer** and exclude layers by regex. Tags become animations. It requires the Aseprite binary
  ([asset lib](https://godotengine.org/asset-library/asset/1572)). **[C]**
- **Layered Sprites** (CookieCherith, MIT, Godot 4.6) provides a `LayeredSprite2D` node with a `LayerList` resource and a "Template Sprite Frames"
  resource. **Every layer texture must share the same layout**, which matches PixelDoll's grid contract, and it supports variants and per-layer
  colors ([Codeberg](https://codeberg.org/cookie_cherith/godot-layered-sprites), [asset lib](https://www.godotengine.org/asset-library/asset/edit/23086)). **[C]**
- **DrJamgo LPC Spritesheet Gen** (Godot 3.5, MIT) is the reference architecture. A master `AnimatedSprite` holds the SpriteFrames blueprint.
  Child `Sprite` layers use `region_enabled`, and on `frame_changed` they **copy the master's current AtlasTexture `region`** onto their own
  texture. One clock means layers cannot drift. The offset is `(-32, -60)` with `centered = false`, so the pivot is at the feet
  ([repo](https://github.com/DrJamgo/Godot_LPC_Spritesheet_Gen),
  [lpc_sprite_layer.gd](https://github.com/DrJamgo/Godot_LPC_Spritesheet_Gen/blob/main/addons/lpc_spritesheet_gen/lpc_sprite_layer.gd)). **[V]**
- LPCAnimatedSprite2D (Godot 4.2) generates animations from LPC sheets but does not layer them
  ([asset lib](https://godotengine.org/asset-library/asset/edit/13001)). Mixed Texture 2D (4.7) bakes a `Texture2D` from blended layers
  ([store](https://store.godotengine.org/asset/ultipuk/mixed-texture-2d/)). **[C]**
- Forum consensus: both real-time stacking and baking on equip change are viable. Real-time stacking keeps per-layer shaders
  ([forum](https://forum.godotengine.org/t/how-to-layer-sprites-dress-up-a-character-in-2d/11898)). **[C]**

### Recommended runtime setup (what PixelDoll generates)
```
Paperdoll (Node2D, paperdoll.gd)        # owns direction, animation, equip()
├─ Body   (AnimatedSprite2D)            # master clock
├─ Cape_bg, Hair, Armor, Weapon … (AnimatedSprite2D, same anim names, z_index from manifest)
```
```gdscript
# paperdoll.gd (ponytail: master-clock copy; switch to an AnimationPlayer if per-frame z keys are needed)
extends Node2D
@onready var body: AnimatedSprite2D = $Body
func _ready() -> void:
    body.frame_changed.connect(_sync)
    body.animation_changed.connect(_sync)
func _sync() -> void:
    for l in get_children():
        if l != body and l is AnimatedSprite2D and l.sprite_frames:
            if l.animation != body.animation: l.animation = body.animation
            l.set_frame_and_progress(body.frame, body.frame_progress)
func equip(slot: String, frames: SpriteFrames) -> void:
    var l := get_node(slot) as AnimatedSprite2D
    l.sprite_frames = frames; _sync()
func set_dir(dir: String, z_table: Dictionary) -> void:   # z_table from manifest.zOrder[dir]
    for slot in z_table: get_node(slot).z_index = z_table[slot]
```

### Palette swap / tint
- Simple tint: per-layer `modulate` (multiplies). This works best when the item art is generated light or neutral.
- Ramp swap: shader with a `sampler2D palette : filter_nearest` that is either indexed (red channel = index) or color-matched against a source ramp.
  Sample at **cell centers** (`(i + 0.5) / n`) to avoid edge errors. Prefer indexed lookup over a per-pixel linear search, which is slow
  ([Palette Swap 2 textures](https://godotshaders.com/shader/palette-swap-using-two-textures),
  [Advanced Palette Godot 4](https://godotshaders.com/shader/advanced-palette-godot-4/),
  [forum perf note](https://forum.godotengine.org/t/i-wrote-a-shader-to-replace-the-palette-of-a-sprite-with-another-palette-is-this-the-best-way-any-way-to-optimize/24537)). **[C]**
```glsl
shader_type canvas_item;
uniform sampler2D src_ramp : filter_nearest;  // 1×N source colors
uniform sampler2D dst_ramp : filter_nearest;  // 1×N variant colors
uniform int n = 8;
void fragment() {
    vec4 c = texture(TEXTURE, UV);
    for (int i = 0; i < n; i++) {             // ponytail: linear match, N ≤ 32; precompute index maps if hot
        vec2 uv = vec2((float(i) + 0.5) / float(n), 0.5);
        if (distance(c.rgb, texture(src_ramp, uv).rgb) < 0.004) { c.rgb = texture(dst_ramp, uv).rgb; break; }
    }
    COLOR = c;
}
```

### Gotchas
- For pixel art, set the project default `rendering/textures/canvas_textures/default_texture_filter = Nearest` and turn snapping on
  (`rendering/2d/snap/snap_2d_transforms_to_pixel`). Import textures **Lossless**. **[K]**
- Separate `AnimatedSprite2D`s started on the same frame can still drift if the speeds differ, or one is paused, or a layer lacks that animation.
  Drive them from one master (the snippet above) or from one `AnimationPlayer`.
- A layer missing an animation is a silent failure. The exporter must emit **every animation for every layer**, using empty frames where the item isn't visible.
- 2D batching for the Forward+ and Mobile renderers arrived in 4.4 (GH-92797), and Compatibility already had it. Batching needs a shared texture and material,
  so a per-layer `ShaderMaterial` breaks batches ([Godot 4.4 dev snapshot](https://www.mexc.com/news/239261)). **[C]**

---

## 4. Unity (2022.3 LTS / Unity 6)

### Data structures (2D Animation package)
- **Sprite Library Asset** organizes Sprites by **Category → Label**. A *Main Library* or *Variant* inherits categories and labels and
  overrides entries, which suits one base library with an item variant per equipment piece
  ([SL-Asset](https://docs.unity3d.com/Packages/com.unity.2d.animation@10.1/manual/SL-Asset.html)). **[V]**
- **Sprite Library** component sets which asset a hierarchy uses. **Sprite Resolver** picks a Category and Label for its SpriteRenderer
  ([SL-Resolver](https://docs.unity3d.com/Packages/com.unity.2d.animation@10.1/manual/SL-Resolver.html),
  [SL-component](https://docs.unity3d.com/Packages/com.unity.2d.animation@10.1/manual/SL-component.html)).
  Its API is `SetCategoryAndLabel(cat, label)`, `GetCategory()`, `GetLabel()`, and `ResolveSpriteToSpriteRenderer()`
  ([SpriteResolver API](https://docs.unity3d.com/Packages/com.unity.2d.animation@10.1/api/UnityEngine.U2D.Animation.SpriteResolver.html)).
  `SpriteLibraryAsset.AddCategoryLabel(sprite, cat, label)` and `GetSprite(cat, label)` allow building libraries from script
  ([SpriteLibraryAsset API](https://docs.unity3d.com/Packages/com.unity.2d.animation@10.1/api/UnityEngine.U2D.Animation.SpriteLibraryAsset.html)). **[V]**
- **Frame-by-frame with Sprite Resolver**: put each frame under a category with a unique label, then keyframe the resolver in an Animation clip.
  Older manuals (3.x–7.x) warn that keys must use **Constant** tangents or the hash interpolates and fails to resolve
  ([FFanimation 8.0](https://docs.unity3d.com/Packages/com.unity.2d.animation@8.0/manual/FFanimation.html)). **[V]**
- One Animator Controller cannot mix clips that animate `SpriteRenderer.sprite` with clips that animate the Sprite Resolver hash. Pick one approach per controller
  ([Sprite Swap intro](https://docs.unity3d.com/Packages/com.unity.2d.animation@10.1/manual/SpriteSwapIntro.html)). **[V]**
- **Sorting Group** on the root makes the character sort as one unit against the world while children sort by `sortingOrder` inside it. **[K]**
  **SpriteAtlas** packs per-layer sheets to cut draw calls. **[K]**

### Paperdoll mapping that works with any equipment
Give every layer the same category and label names: **Category = `walk_south`, Label = `0..N-1`**. Then *one* clip containing resolver keys for
`Body`, `Hair`, `Weapon`… drives any equipment. Equipping an item means swapping that child's `SpriteLibrary.spriteLibraryAsset`
to the item's library. The clips never change. **[K, follows from the [V] API]**

The alternative, which ships in real games and needs no package, is to **swap sprites in `LateUpdate`**. The Animator writes the body sprite,
then each layer looks up the same-named sprite (`walk_south_3`) in a cached `Dictionary<string, Sprite>`. Avoid per-frame
`Resources.LoadAll` and linear searches ([discussion](https://discussions.unity.com/t/unity-2d-can-you-change-a-2d-animation-clips-sprites-at-runtime/100933),
Animancer [SpriteRendererTextureSwap](https://kybernetik.com.au/animancer/api/Animancer/SpriteRendererTextureSwap)). **[C]**

```csharp
// PaperdollLayer.cs. ponytail: name-match sync, no 2D Animation dependency.
public class PaperdollLayer : MonoBehaviour {
    public SpriteRenderer master; public Sprite[] sheet;           // sliced sprites of this layer
    SpriteRenderer sr; Dictionary<string, Sprite> map; Sprite last;
    void Awake() { sr = GetComponent<SpriteRenderer>(); Equip(sheet); }
    public void Equip(Sprite[] s) { sheet = s; map = s?.ToDictionary(x => x.name); last = null; } // every layer slices to "walk_south_3"
    void LateUpdate() {
        if (master.sprite == last) return; last = master.sprite;
        sr.sprite = map != null && last && map.TryGetValue(last.name, out var s) ? s : null;
    }
}
```

### Import format and slicing
- `TextureImporter.spritesheet` is **removed**. Slice with `ISpriteEditorDataProvider` in an Editor script: `SpriteDataProviderFactories`
  → `GetSpriteEditorDataProviderFromObject(importer)` → `InitSpriteEditorDataProvider()` → `SetSpriteRects(...)` (each new `SpriteRect` gets a
  `GUID.Generate()` spriteID) → `Apply()` → reimport ([Sprite data provider API](https://docs.unity3d.com/Manual/Sprite-data-provider-api.html),
  [TextureImporter.spritesheet](https://docs.unity3d.com/ScriptReference/TextureImporter-spritesheet.html)). **[V]**
- Hand-writing `.meta` YAML (`spriteMode: 2`, `sprites:` with `rect`, `alignment: 9`, `pivot`, `spriteID`, `internalID`, `nameFileIdTable`)
  is possible, but it depends on the Unity version and needs unique GUIDs and fileIDs. **Don't. Ship an Editor script instead.** **[K]**
- **Aseprite Importer** (`com.unity.2d.aseprite`, Unity 2021.3.15+ and all Unity 6). Layer Import Mode **Individual Layers** creates one sprite per layer per
  frame. *Generate Model Prefab* creates one GameObject and SpriteRenderer per layer, with `Order in Layer` = layer index + cel z-index, under a
  **Sorting Group**. Tags become looping clips (Repeat = 1 makes them non-looping). Pivot Space **Canvas** keeps pivots consistent for swapping.
  Cel user data `event:Name` creates animation events. *Export Animation Assets* produces editable copies
  ([features](https://docs.unity3d.com/Packages/com.unity.2d.aseprite@1.1/manual/ImporterFeatures.html),
  [FAQ](https://docs.unity3d.com/Packages/com.unity.2d.aseprite@1.1/manual/ImporterFAQ.html),
  [versions](https://docs.unity3d.com/Packages/com.unity.2d.aseprite@1.2/manual/index.html)). **[V]**
  → **A layered `.aseprite` export from PixelDoll gives Unity users a working layered prefab with zero scripts.**

### Palette / tint
`SpriteRenderer.color` multiplies. For ramp swaps, use a grayscale or indexed sprite plus a ramp texture set to Point, Clamp, no mips, uncompressed
([forum](https://forum.unity3d.com/threads/color-replacement-shader.83582/), [Tuts+](https://code.tutsplus.com/how-to-use-a-shader-to-dynamically-swap-a-sprites-colors--cms-25129t),
[LutLight2D](https://github.com/unitycoder/LutLight2D)). Shader Graph in URP 2D handles this. **[C]**

### Gotchas
Set Filter Mode **Point**, Compression **None**, a consistent **Pixels Per Unit** (= cell height or the tile size), and use the Pixel Perfect Camera **[K]**.
Unity's sprite rect Y is measured from the bottom and the pivot is normalized from the bottom-left, so convert from the top-left manifest.
Keep the Sprite Resolver keys constant. Don't mix sprite-curve clips and resolver clips in one controller.

---

## 5. Phaser 3 / Phaser 4

### Data structures
- **Texture** + **Frames** come from `load.spritesheet(key, url, {frameWidth, frameHeight})` for uniform grids, from `load.atlas(key, png, json)`
  for JSON-Hash or JSON-Array, or from `load.aseprite`. Atlas `pivot`/`anchor` → origin, and extra JSON is kept in `customData` (§2.3) **[V]**.
- **Animations** live in a global `AnimationManager` and are created with `anims.create({key, frames, frameRate, repeat})`. A frame's `duration` (ms)
  **replaces** `msPerFrame` for that frame ([Animation.js getNextTick](https://github.com/phaserjs/phaser/blob/master/src/animations/Animation.js)) **[V]**.
  `anims.createFromAseprite(key, tags?)` builds animations from Aseprite tags. **Tag names are global**: two layer atlases with the same
  tag (`Idle`) collide, so prefix animation keys per layer ([issue #6434](https://github.com/phaserjs/phaser/issues/6434),
  [docs](https://newdocs.phaser.io/docs/3.80.0/focus/Phaser.Animations.AnimationManager-createFromAseprite)) **[V]**.
- **Container** holds one Sprite per layer. Inside a Container, render order is the child list order, not `depth`, so reorder with
  `container.sort('depth')` or `moveTo` when the direction changes **[K]**.
- **Sync:** play the same animation key with the same timing on every layer, or better, listen for `animationupdate` on the body and `setFrame`
  the matching layer frame (`AnimationState.setCurrentFrame` emits `ANIMATION_UPDATE`) **[V source]**. Community threads confirm that the sync is manual
  ([forum](https://phaser.discourse.group/t/sprite-character-builder-layers-anims/11727),
  [html5gamedevs](https://www.html5gamedevs.com/topic/15163-phaser-and-custom-clothingweapons/)) **[C]**.

```js
// Phaser loader + rig. ponytail: body is the clock, layers mirror frame names.
preload() { for (const l of manifest.layers) this.load.atlas(l.id, `${l.id}.png`, `${l.id}.json`); }
create() {
  for (const a of manifest.animations) for (const d of manifest.directions)
    this.anims.create({ key: `body:${a.id}_${d}`, repeat: a.loop ? -1 : 0,
      frames: a.frames.map(f => ({ key: 'base/body', frame: `${a.id}_${d}_${f.cell}`, duration: f.ms })) });
  const kids = manifest.layers.map(l => this.add.sprite(0, 0, l.id).setName(l.slot));
  const doll = this.add.container(400, 300, kids);
  const body = doll.getByName('body');
  body.on('animationupdate', (_a, fr) => kids.forEach(s => s !== body && s.setFrame(fr.textureFrame)));
  body.play('body:walk_south');
}
setDir(doll, dir) { doll.list.forEach(s => s.depth = manifest.zOrder[dir][s.name] ?? 0); doll.sort('depth'); }
```

### Phaser 4 differences that matter ([migration guide](https://raw.githubusercontent.com/phaserjs/phaser/HEAD/changelog/v4/4.0/MIGRATION-GUIDE.md), [news](https://phaser.io/news/2026/04/migrating-from-phaser-3-to-phaser-4-what-you-need-to-know)) **[V]**
- `setTintFill()` and `tintFill` are removed. Use `setTint(c).setTintMode(Phaser.TintModes.FILL)` for hit flash. Tint modes are MULTIPLY, FILL, ADD, SCREEN,
  OVERLAY, and HARD_LIGHT.
- RenderTexture and DynamicTexture draw commands are buffered and **only run on `render()`**, so pre-bake code written for v3 must call `rt.render()`.
- `roundPixels` defaults to `false`. Set `pixelArt: true` / `roundPixels: true` or per-object `vertexRoundMode` for crisp pixels.
- FX and masks are replaced by Filters, and ColorMatrix moved to `.colorMatrix`. Texture Y=0 is at the bottom for *compressed* textures only. PNG atlases are unaffected.

### Baking
Phaser 3: `rt = this.add.renderTexture(0,0,W,H).setVisible(false); rt.draw(layerSprite, x, y); rt.saveTexture('hero_baked')`,
then add frames with `texture.add(name, 0, x, y, w, h)`. In v4, call `rt.render()` before saving. Alternatively, PixelDoll can **bake in the
browser before export** (Canvas2D `drawImage` per layer in z-order), which has the same result and needs no engine code **[K]**.

### Existing examples
[ivopc/phaser-lpc-character](https://github.com/ivopc/phaser-lpc-character) (TypeScript, Sprite, Arcade, and Matter prefabs from ULPC sheets). Its
loader and animator components are stubs, so it is of limited reference value **[V]**.

---

## 6. Generic engines

| Engine | Cleanest input | Notes |
|---|---|---|
| GameMaker | `name_stripN.png` per layer per anim+dir | The `_stripN` suffix auto-splits N frames on import, and `sprite_add()` works at runtime ([manual](https://manual.gamemaker.io/lts/en/The_Asset_Editors/Sprite_Properties/Sprite_Strips.htm)). Draw layers in order in the Draw event with the same `image_index`. **[V]** |
| Defold | atlas with animation groups, or a tilesource grid | Grid sheets map directly to a tilesource. Layers are separate sprite components on one game object, played with the same animation id ([atlas manual](https://defold.com/manuals/atlas/)). **[K]** |
| LÖVE | PNG grid + JSON | `love.graphics.newQuad` per cell, or the `anim8` grid library. Draw layers in z order. **[K]** |
| Construct 3 | strip or grid import into a Sprite object per layer | Sync with `Set animation frame` from the body each tick, or pin layers to the body. **[K]** |
| RPG Maker MV/MZ | `img/characters/$Name.png`, 3 cols × 4 rows (down, left, right, up), 48 px cells | Only 3 walk frames per direction without plugins. Paperdoll means **pre-baked** composites ([Galv frames plugin](https://galvs-scripts.com/2020/08/31/mz-character-frames)). **[C]** |
| Aseprite users / anything | layered `.aseprite` + json-hash | See §2.2. |

---

## 7. Cross-engine comparison

| Concern | Godot 4 | Unity 2022/6 | Phaser 3/4 | Generic |
|---|---|---|---|---|
| Layer node | `AnimatedSprite2D`, or `Sprite2D` + hframes | child `SpriteRenderer` (+ `SpriteResolver`) | `Sprite` in a `Container` | sprite object per layer |
| Animation data | `SpriteFrames` (.tres) / `AnimationPlayer` | `AnimationClip` + Animator | global `AnimationManager` keys | strips + JSON |
| Sync mechanism | master `frame_changed` → `set_frame_and_progress` | one clip keys all resolvers, or `LateUpdate` name-match | `animationupdate` → `setFrame` | same frame index per tick |
| Equip swap | replace `sprite_frames` | swap `SpriteLibraryAsset` or the sprite dictionary | `setTexture(layerKey)` | change sheet |
| Z per direction | `z_index` / `move_child`; AnimationPlayer can key z per frame | `sortingOrder` inside a Sorting Group | `depth` + `container.sort` | draw order |
| Whole-char tint/FX | `CanvasGroup` + `self_modulate` | Sorting Group + material | container tint per child; Filters (v4) | — |
| Palette swap | canvas_item shader + ramp texture | Shader Graph ramp/LUT | custom shader / pre-recolor | pre-recolored PNGs |
| Pivot unit | px offset, top-left | normalized, **bottom-left** | normalized, top-left (auto from atlas pivot) | px |
| Native Aseprite | Aseprite Wizard (needs the CLI) | Aseprite Importer (built in) | JSON only (`load.aseprite`) | — |
| Batching caveat | per-layer ShaderMaterial breaks batches | SpriteAtlas required | ~16 textures per batch on typical GPUs | — |
| PixelDoll output | `.tres` + `.tscn` + `paperdoll.gd` | PNG + manifest + `PixelDollImporter.cs` + `PaperdollLayer.cs` (or `.aseprite`) | atlas JSON + `PaperdollContainer.js` | `_stripN` PNGs + manifest |

---

## 8. Proposed PixelDoll export format

### 8.1 Rig contract (non-negotiable)
Every layer sheet of a character uses **identical** `cell` size, `pivot`, animation list, direction list, frame count per animation, and grid
placement. Frames where an item isn't visible are **transparent cells**, never missing cells. Directions use the PixelLab enum names
(`north, north-east, east, south-east, south, south-west, west, north-west`, from `docs/research/pixellab/pixellab-openapi-v2.json` `Direction`).

### 8.2 Folder layout
```
hero.pixeldoll/                          # zip root
  manifest.json                          # authoritative; everything else is derived
  layers/<slot>/<item>[.<part>]/<anim>.png  # rows = directions (manifest order), cols = cells; untrimmed
  palettes/<item>.json                   # LPC-style {source:[...], variants:{name:[...]}}
  baked/<preset>/<anim>.png              # optional pre-composited sheets (same grid)
  engines/godot/   *.tres, Paperdoll.tscn, paperdoll.gd
  engines/unity/   Editor/PixelDollImporter.cs, Runtime/PaperdollLayer.cs   (+ optional hero.aseprite)
  engines/phaser/  <layer>.json (JSON-Hash atlas incl. manifest subset), PaperdollContainer.js
  engines/generic/ <layer>_<anim>_<dir>_strip<N>.png
  provenance.json                        # PixelLab job ids, prompts, seeds, model, timestamps
```
I chose **one PNG per layer per animation** for these reasons. One sheet with every animation hits the 4096 px limit quickly: 8 dirs × 12 anims × 64 px = 6144 px tall,
which breaks on WebGL and mobile. Per-animation sheets also lazy-load, they match how the LPC repo stores sheets, and they keep a direction-row grid that every
engine slices trivially. A packed `atlas` mode is an optional later step (add it when draw calls measurably matter).

`<part>` carries LPC-style split sub-layers: `cape.front`, `cape.back`, `sword.behind`.

### 8.3 `manifest.json` (draft for `docs/manifest-spec.md`)
```jsonc
{
  "format": "pixeldoll/1",
  "name": "hero",
  "cell": { "w": 64, "h": 64 },
  "pivot": { "x": 32, "y": 56 },
  "pixelsPerUnit": 64,
  "directions": ["south", "west", "east", "north"],
  "mirror": {},
  "animations": [
    { "id": "walk", "loop": true, "fps": 10,
      "cells": 8,
      "frames": [ {"cell":0,"ms":100}, {"cell":1,"ms":100}, {"cell":2,"ms":150} ],   // truncated: one entry per played frame
      "events": [ {"frame": 2, "name": "footstep"} ] }
  ],
  "slots": [
    { "id": "cape_back", "z": 5 },  { "id": "body", "z": 10 }, { "id": "legs", "z": 20 },
    { "id": "torso", "z": 30 },     { "id": "hair", "z": 40 }, { "id": "head", "z": 50 },
    { "id": "cape_front", "z": 85 },{ "id": "weapon", "z": 140 }
  ],
  "zOverrides": {
    "north": { "weapon": 8 },
    "frames": [ { "anim": "slash", "dir": "east", "frame": 3, "slot": "weapon", "z": 150 } ]
  },
  "layers": [
    { "id": "base/body", "slot": "body", "item": "base", "tintable": false,
      "sheets": { "walk": "layers/body/base/walk.png" } },
    { "id": "hair/ponytail", "slot": "hair", "item": "ponytail",
      "palette": "palettes/ponytail.json", "tint": "#ffffff",
      "sheets": { "walk": "layers/hair/ponytail/walk.png" },
      "coverage": { "walk": "all" } }
  ],
  "anchors": { "hand_r": { "walk": { "south": [[40,38],[41,37]] } } },
  "presets": { "default": { "hair": "hair/ponytail", "body": "base/body" } },
  "baseHash": "sha256:…"
}
```
Field notes:
- `frames[].cell` lets playback reuse cells (LPC `cycle` semantics, e.g. idle `[0,0,1]`). `ms` maps to Godot `duration = ms * fps / 1000`,
  to Unity key times (cumulative), to Phaser frame `duration`, and to Aseprite `duration`.
- `slots[].z` is the static global ladder (LPC-proven). `zOverrides` adds per-direction and per-frame exceptions. Exporters turn these into
  Godot AnimationPlayer `z_index` keys, Unity `sortingOrder` keys, and Phaser `depth` on `animationupdate`. **Most content should never need `frames` overrides.
  Split into `.front`/`.back` parts instead.**
- `mirror` records whether a direction was produced by flipping (`"west": "east"`). Engines can then use `flip_h`/`flipX`/`setFlipX` instead of shipping the sheet.
  Mirroring asymmetric items (a sword in the right hand) is wrong, so PixelDoll should default to **shipping real sheets** and only mark mirrors explicitly.
- `anchors` (hardpoints) are optional per-frame points for attaching non-paperdoll FX (muzzle flash, held-item sprites). They're cheap to emit if PixelDoll detects them, and if not, skip them.
- `palette` uses the LPC recolor model: an ordered `source` ramp plus `variants`. Engines either run a ramp shader at runtime or use pre-recolored PNGs that PixelDoll bakes.
- `baseHash` ties every layer to the exact base frames it was diff-extracted from (layers are pre-occluded against that base; see §1.3).

### 8.4 What PixelDoll should generate per engine

| Engine | Files | Generator effort |
|---|---|---|
| **Godot 4** | one `SpriteFrames` `.tres` per layer (animation names `walk_south`; AtlasTexture regions on the per-anim PNG); `Paperdoll.tscn` with one `AnimatedSprite2D` per slot, `z_index` from `slots`, `centered=false`, `offset=-pivot`; `paperdoll.gd` (master-clock sync, `equip()`, `set_dir()` applying `zOverrides`) | Low. These are plain-text formats (`[gd_resource]`/`[gd_scene]`) |
| **Unity** | PNGs + `manifest.json` + `Editor/PixelDollImporter.cs` (`AssetPostprocessor`: slice via `ISpriteEditorDataProvider` with names `walk_south_3`, Point/None/PPU settings, build one `SpriteLibraryAsset` per layer with Category=`anim_dir` and Label=`frame`, build clips + controller, build a prefab with a Sorting Group); `Runtime/PaperdollLayer.cs` (LateUpdate fallback). **Optional:** a layered `hero.aseprite` for the zero-code Aseprite Importer path | Medium. C# must compile on 2022.3 and Unity 6; test both |
| **Phaser 3/4** | per-layer TexturePacker JSON-Hash (`frame` names `walk_south_3`, `pivot` normalized, `sourceSize`), with the manifest subset as an extra top-level key (preserved in `texture.customData`); `PaperdollContainer.js` (loader, anim creation, `animationupdate` sync, `setDir` sort, v3/v4 tint helper) | Low |
| **Generic** | `_stripN` PNG strips per layer/anim/dir; baked composites; RPG Maker `$name.png` 3×4 when the rig is 4-dir and 3 frames | Low |
| **Preview/QA** | the same compositor that runs in the PixelDoll browser preview (Canvas2D, z ladder + overrides) produces `baked/` | Shared with the app |

### 8.5 Open questions for synthesis (Phase 3)
1. Diff-extracted layers depend on the base. Do we need a body-shape axis (LPC has male/female/teen/child paths per layer), or one base per project?
2. Can PixelDoll split an item into `.front`/`.back` automatically? Pixels that occlude the body go front. Pixels outside the body silhouette that a later
   item would cover are ambiguous. S1 should measure this on capes, shields, and long hair.
3. Oversize weapon swings: grow the cell (LPC 128/192 px with a fixed pivot) or emit a separate oversize sheet for that animation only?

---

## Sources (selected)
- Godot: [AnimatedSprite2D](https://docs.godotengine.org/en/stable/classes/class_animatedsprite2d.html), [SpriteFrames](https://docs.godotengine.org/en/stable/classes/class_spriteframes.html), [CanvasGroup](https://docs.godotengine.org/en/stable/classes/class_canvasgroup.html), [forum: layering sprites](https://forum.godotengine.org/t/how-to-layer-sprites-dress-up-a-character-in-2d/11898), [Aseprite Wizard](https://godotengine.org/asset-library/asset/1572), [Layered Sprites](https://codeberg.org/cookie_cherith/godot-layered-sprites), [DrJamgo LPC gen](https://github.com/DrJamgo/Godot_LPC_Spritesheet_Gen), [godotshaders palette swap](https://godotshaders.com/shader/palette-swap-using-two-textures)
- Unity: [Sprite Swap](https://docs.unity3d.com/Packages/com.unity.2d.animation@10.1/manual/SpriteSwapIntro.html), [Sprite Library Asset](https://docs.unity3d.com/Packages/com.unity.2d.animation@10.1/manual/SL-Asset.html), [SpriteResolver API](https://docs.unity3d.com/Packages/com.unity.2d.animation@10.1/api/UnityEngine.U2D.Animation.SpriteResolver.html), [SpriteLibraryAsset API](https://docs.unity3d.com/Packages/com.unity.2d.animation@10.1/api/UnityEngine.U2D.Animation.SpriteLibraryAsset.html), [FF animation](https://docs.unity3d.com/Packages/com.unity.2d.animation@8.0/manual/FFanimation.html), [Sprite data provider API](https://docs.unity3d.com/Manual/Sprite-data-provider-api.html), [Aseprite Importer features](https://docs.unity3d.com/Packages/com.unity.2d.aseprite@1.1/manual/ImporterFeatures.html)
- Phaser: [JSONHash parser](https://github.com/phaserjs/phaser/blob/master/src/textures/parsers/JSONHash.js), [createFromAseprite](https://newdocs.phaser.io/docs/3.80.0/focus/Phaser.Animations.AnimationManager-createFromAseprite), [issue #6434](https://github.com/phaserjs/phaser/issues/6434), [v4 migration guide](https://raw.githubusercontent.com/phaserjs/phaser/HEAD/changelog/v4/4.0/MIGRATION-GUIDE.md), [phaser-lpc-character](https://github.com/ivopc/phaser-lpc-character)
- Formats: [Aseprite CLI](https://www.aseprite.org/docs/cli/), [ase file spec](https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md), [TexturePacker settings](https://www.codeandweb.com/texturepacker/documentation/texture-settings), [ULPC generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator), [GameMaker strips](https://manual.gamemaker.io/lts/en/The_Asset_Editors/Sprite_Properties/Sprite_Strips.htm)
