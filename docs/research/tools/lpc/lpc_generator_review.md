# Universal LPC Spritesheet Character Generator — review (R5, 2026-10-20)

- Repo (official, maintained): <https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator>.
  Reviewed at commit `9bf06be` (2026-10-14). Shallow clone: `C:\Programming_Files\Shilocity\PixelLab\checkouts\lpc-generator`.
- Live: <https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/>
- Lineage: makrohn's offline XCF → Gaurav0 → **sanderfrenken's fork**, which was the de-facto main repo for years → now the
  `LiberatedPixelCup` org (README §History). Use the org repo. The sanderfrenken links are legacy.
- Game-side LPC usage (sheet layout in games and engines) is R4/R3 territory. This review covers **the generator as a tool**.

## 1. Architecture (why it matters to PixelDoll)

It is a fully client-side **Vite + TypeScript + Mithril** SPA, the same deployment model PixelDoll targets (it is hosted on
Netlify/GitHub Pages, and there is no backend).

- **Source of truth = data files**: `sheet_definitions/**.json` (657 items), `palette_definitions/**.json` (22 files), and
  `spritesheets/**.png` (about 88k PNGs, 312 MB). A Vite plugin compiles these into five lazily imported metadata modules
  (`index-`, `item-`, `palette-`, `credits-`, `layers-metadata.js`). They are interned (`v`/`r`/`p` index tables) to stay
  under a CI-enforced size budget (item ≤ 500 KiB). Readiness is **staged**: the UI mounts first, and layers arrive later.
- **Render path** (`sources/canvas/renderer.ts`): for every selection it collects `layer_1..layer_9`, skips layers whose
  body type is not supported, sorts by `zPos` ascending (default 100; lower draws first, so it sits behind), loads the images
  in parallel, recolors through a **WebGL palette shader** (with a CPU fallback), and draws onto **one offscreen canvas** that
  holds the full universal sheet. The preview and exports slice that canvas.
- **State → URL hash** (`#sex=male&body=Body_Color_light&hair=...`) is the shareable document format. It is treated as a
  compatibility surface: old keys are never rewritten, and renamed assets get `aliases` on the destination definition.
- There are strict agent and contributor rules (`AGENTS.md`). For example, *"Ship a new or derived PNG without a `credits`
  entry"* is on the "Never" list.

## 2. `sheet_definitions` format

The type is `SheetDefinition` in `scripts/generateSources/items.ts`. Example (`body/lizard/tail_lizard.json`, abridged):

```json
{
  "name": "Lizard tail",
  "type_name": "tail",                       // selection slot; one selection per type_name
  "priority": 40,                            // tree sort
  "layer_1": { "zPos": 85, "male": "body/tail/lizard/adult/fg/", "female": "...", "child": "body/tail/lizard/child/fg/" },
  "layer_2": { "zPos": 5,  "male": "body/tail/lizard/adult/bg/", "...": "..." },
  "animations": ["walk", "slash", "idle", "run", "..."],   // supported rows; default = 7 classic anims
  "variants": ["..."],                       // pre-drawn color/style variants -> <path>/<anim>/<variant>.png
  "match_body_color": true,                  // follow the body's skin palette automatically
  "recolors": { "material": "body", "palettes": ["ulpc", "lpcr", "all.lpcr"] },
  "credits": [{ "file": "body/tail/lizard", "authors": ["..."], "licenses": ["OGA-BY 3.0", "CC-BY-SA 3.0", "GPL 3.0"],
               "urls": ["https://opengameart.org/..."], "notes": "..." }]
}
```

Key fields and how they behave:

| Field | Meaning | PixelDoll analogue |
|---|---|---|
| `type_name` | Slot. Selecting a new item replaces the old one for that type | `slot` |
| `layer_N` (1–9) | One item can have **several z-layers**, e.g. `fg`/`bg` tail, a flail's `behind` layer (z 9, under the body) plus its front layer (z 140) | item → `layers[]` |
| `zPos` | One **global integer z space** shared by all items (`scripts/zPositioning/z_positions.csv` can be bulk-edited and written back) | `z` |
| per-body-type keys | `male/female/teen/child/muscular/pregnant` → path. Which keys are present = **body-type compatibility** (`getRequiredSexes`) | `bases[]` compat |
| `custom_animation` | A layer is drawn on an **oversize** sheet (128/192 px cells) instead of the 64 px grid | oversize frames |
| `animations` | Animation-filter compatibility | `animations[]` |
| `variants` | Pre-drawn variants (files per variant) | baked variants |
| `recolors` | Palette-swap regions (`color_1..color_9`, each with `material`, optional `source` ramp, `label`, `type_name`, `palettes`) | material regions |
| `match_body_color` | Inherit the body palette (heads, ears, tails, faces) | link to the skin material |
| `replace_in_path` | Path templating from other selections: `"head/faces/${head}/anger/"` with a map `Human_Male_Small → male` | dependent assets |
| `tags` / `required_tags` / `excluded_tags` | Declared compatibility (e.g. faces require `human`). In 42 definitions; in this commit they only appear in the generator metadata, not in the runtime filters | compat rules |
| `aliases` | Forward old hash keys to renamed assets | stable ids |
| `preview_row/column/x/y_offset` | Which frame represents the item in the tree thumbnail | thumbnail frame |
| `credits[]` | Per-file authors/licenses/URLs/notes → aggregated `CREDITS.csv` | provenance |

Stats from this commit: 489 single-layer items, 138 with two layers, 30 with 3–8 layers. 434 items use palette recolor, 40 of
them with multiple regions. 79 have `match_body_color`.

### Per-direction z is solved by splitting, not by data

LPC has **no per-direction or per-frame z override**. Instead, an item is split into a **behind** PNG (low z) and a **front**
PNG (high z), and each pixel is painted in whichever layer is correct for that frame and direction. For example, the flail's
`behind/` layer only has pixels in the frames where the weapon goes behind the body. **This is a major lesson for PixelDoll's
diff-extraction route.** A diff only yields the *visible* item pixels. To make them correct over *other* outfits, each pixel
(or each frame/direction) must be classified as behind or in front of the body. That classification is a QA/editor step
PixelDoll will need. See the survey, §Lessons.

## 3. Frame contract

From `sources/state/constants.ts`:

- `FRAME_SIZE = 64`, 13 columns, `DIRECTIONS = [up, left, down, right]` (4 rows per animation; hurt and climb have 1 row).
- `ANIMATION_OFFSETS` gives the row band per animation (spellcast 0, thrust 4, walk 8, slash 12, shoot 16, hurt 20, climb 21,
  idle 22, jump 26, sit 30, emote 34, run 38, combat_idle 42, backslash 46, halfslash 50).
- `ANIMATION_CONFIGS[anim] = { row, num, cycle }`. **`cycle` is the playback order** (e.g. idle `[0,0,1]`, sit
  `[0×5,1×5,2×5]`). Frames are stored once, and the timing comes from repeated indices. PixelDoll should keep "stored frames"
  separate from the "playback sequence".
- **Custom/oversize animations** (`sources/custom-animations.ts`): `{ frameSize: 128|192, frames: string[][] }` where each cell
  is `"thrust-n,2"`, a *reference* to a base frame that is re-centered into the bigger cell. Used for weapons that extend past
  64 px. This is a good model for "base frames are canonical; derived sheets are layouts that reference them".
- Tooling ([lpctools](https://github.com/bluecarrot16/lpctools), `tools/`): **`masks/reference_points.png`** stores per-frame
  head reference points, so a *static* hat or hair drawing can be **distributed across all frames** automatically
  (`lpctools arrange distribute --offsets ... --mask ...`). `masks_*_head.png` and `cutouts/` handle occlusion (arms in front of
  the torso, and so on).

## 4. Recolor / palette system (answers the user's grayscale question)

- **Palette swap by exact color match**, not tint. A palette file (`palette_definitions/<material>/<material>_<version>.json`)
  maps `variantName → [hex…]` (1–32 colors, all the same length, ordered shadow → highlight). `meta_<material>.json` gives the
  label, default version and `base` variant. Body = 6 colors, eyes = 3 (the `face_angry` `color_2` source is
  `#293d4b, #5187b3, #50d4ec`), hair and cloth = 6.
- The source art is drawn **in the base ramp** (e.g. skin "light", hair "orange"). The shader replaces each source color
  (±1 per channel tolerance) with the same index in the target ramp. WebGL is used when available, with a CPU fallback and an
  LRU cache (`PALETTE_RECOLOR_GUIDE.md`; the doc is partly stale: it still shows `{base, palette}` while the current data uses
  `{material, palettes}`).
- **Multiple regions per item** use *distinct source ramps*. Pigtails: `color_1` = hair material, `color_2` = "Hair Tie" cloth
  ramp with an explicit `source` array. Because the ramps never share colors, **no mask is needed**.
- **Linked colors**: `match_body_color` (and per-region `type_name`) make a region follow another selection's palette
  (skin → ears, face, tail; hair → eyebrows, presumably).
- Implication for the "grayscale + modulate" idea: LPC deliberately does **not** use luminance and multiply. It uses
  *indexed ramps*, which keep hue-shifted shading and allow several materials in one PNG. Vitruvian Studio (an LPC fork) went
  further and reduced every sprite to at most 6 shades per material, up to 4 materials
  ([OGA post](https://lpc.opengameart.org/node/159745)).

## 5. UI / UX

- **Left**: body-type selector, search, **license filter** (CC0 / CC-BY-SA / CC-BY / OGA-BY / GPL), **animation filter**
  (hides items that don't support the chosen animations), a recursive **category tree** (from the folder path), item rows with
  variant thumbnails rendered from `preview_row/column`, a **palette modal** (material and version tabs, swatch tiles with live
  previews), "Current selections" chips with remove buttons, and **Reset all**.
- **Right**: an **animated preview** (pick the animation; the frame cycle is shown next to it; pinch-to-zoom; transparency
  grid toggle) and a **full spritesheet preview**.
- **Advanced**: upload a custom PNG overlay and set its zPos (a user-supplied layer slotted into the z stack).
- Collapsed tree branches build no models, so performance work is a first-class concern (CLS budgets, profiling scripts).

## 6. Export & credits

`sources/components/download/Download.ts` and `sources/state/zip.ts`:

- **Spritesheet (PNG)**: the full composited universal sheet.
- **ZIP: split by animation** (slices of the composite), **ZIP: split by item** (each item × layer re-rendered alone, so slower),
  **ZIP: split by animation and item**, and **ZIP: split by animation and frame** (`standard/<anim>/<direction>/…`,
  `custom/<anim>/…`).
- Every ZIP includes `character.json` and `credits/` (`metadata.json`, CSV, TXT).
- **JSON export/import** (also via clipboard), version 2:
  `{version, bodyType, selections, selectedAnimation, enabledLicenses, enabledAnimations, url, layers[{itemId, name, variant, recolors, zPos, layerNum, yPos, needsRecolor, source{kind, spritePath}, supportedAnimations[]}], credits}`.
  v1 (`{url}` only) is still importable.
- **Credits (TXT/CSV)** for exactly the selected assets. The repo-wide `CREDITS.csv` (`filename, notes, authors, licenses, urls`)
  is regenerated in CI, so a missing credit fails the build.

## 7. Verdict for PixelDoll

**Copy:** the data-driven item definition (slot + multi-layer z + per-base paths + animation compatibility + recolor regions +
provenance); global integer zPos with behind/front split layers; the `cycle` playback arrays; oversize layouts that reference
canonical base frames; per-frame reference points used to place static items; indexed palette ramps with exact-match recolor
(GPU, with a CPU fallback); linked materials (`match_body_color`); URL/JSON state with version and aliases; the four ZIP split
modes plus a machine-readable layer manifest; license and animation filters; a per-asset credits pipeline (for PixelDoll:
generation provenance).

**Limits to improve on:** one fixed frame size and sheet layout (PixelDoll must make the layout configurable per engine);
4 directions only; no per-direction z data; tags are declared but not enforced; recolor needs art pre-drawn in an exact
ramp, which is hard to get from AI output (PixelDoll needs ramp-snapping/quantize, see the survey); no editing — it is a
*selector*, not an authoring tool; 312 MB of static PNGs (PixelDoll generates on demand instead).
