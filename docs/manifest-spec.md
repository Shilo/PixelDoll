# PixelDoll manifest spec — `pixeldoll/2`

Author: A1 · Date: 2026-10-20; updated 2026-10-22 · Status: format 2, retaining the v1.3.1 rig contract (per-layer cell + pivot for oversize layers, S5/B8). Pipeline and rationale: [`architecture.md`](architecture.md).

One schema serves two files:

- **`project.json`** inside the project zip (backup/share; the app's own document). Layers reference cells by hash (`cells`),
  and QA + provenance are complete.
- **`manifest.json`** inside the export zip (consumed by engines and importers). Layers reference sheets by path (`sheets`).
  `cells` is dropped, everything else is kept (provenance is the credits trail [R5]).

The API key never appears in either file.

Current projects use `pixeldoll/2`. Readers also accept `pixeldoll/1`; its original global palette constraint remains enforced. Version 2 gives every item independent materials: material IDs remain globally unique, while source RGB ramps need only be disjoint within the same owner. Two items may therefore share both original pixels and RGB values and still recolor independently. Engines must apply material swaps to the owning item, including its tucked variants.

Version 2 also permits `Material.defaultVariant`: the approved baseline when an outfit has no explicit color selection. For affected items, canonical `Layer.sheets` render that baseline for all supplied engine runtimes, while optional `Layer.sourceSheets` point to the original source-ramp PNGs under `sources/`. Palette-aware consumers must start from `sourceSheets` when present. Original material ramps remain disjoint even when two selected variants share a color. Editable `project.json` always retains original raw cells and the complete material definitions.

An accepted shared copy may carry `Item.design` lineage: the design ID/revision, immutable minimal source snapshot, palette-role mapping and target audit. Its referenced source images travel in `cells/` alongside the target frames. Library deletion therefore does not remove the copy's artwork or its portable reference. A separate equipment archive uses `pixeldoll-design/1` in `design.json`; it is not a character ZIP.

---

## 1. Conventions

- **Pixels are integers.** Origin top-left, +x right, +y down. The pivot is a point in **pixel-edge coordinates** (`0..w`,
  `0..h`): `{x: 32, y: 60}` on a 64 cell is the line between columns 31/32 at the bottom edge of row 59.
- **Directions** use PixelLab's `Direction` enum: `south, south-east, east, north-east, north, north-west, west, south-west`.
- **ids** match `^[a-z0-9][a-z0-9_-]*$`, unique within their list, stable forever (rename = new `name`, same `id`).
- **Cell key** for per-cell data: `"<anim>/<dir>/<cell>"`, e.g. `"walk/south/3"`.
- **Hashes**: `"sha256:<hex>"` of the raw RGBA bytes (row-major, w·h·4), not of the PNG file, so re-encoding does not change it.
- **Colors**: `"#rrggbb"` lower case. All exported pixels have alpha 0 or 255.

---

## 2. TypeScript types (`app/src/lib/store/manifest.ts`)

```ts
export type DirectionName =
  | 'south' | 'south-east' | 'east' | 'north-east' | 'north' | 'north-west' | 'west' | 'south-west';
export type Sha256 = `sha256:${string}`;
export type Hex = `#${string}`;
export type CellKey = `${string}/${DirectionName}/${number}`;
export type AnchorId = 'head' | 'neck' | 'hand_r' | 'hand_l' | 'hip' | 'foot_r' | 'foot_l';
/** estimate-skeleton / skeleton-v3 labels; LEFT/RIGHT = the character's side; ARM = wrist, LEG = ankle. */
export type JointLabel =
  | 'NOSE' | 'NECK' | `${'RIGHT' | 'LEFT'} ${'SHOULDER' | 'ELBOW' | 'ARM' | 'HIP' | 'KNEE' | 'LEG' | 'EYE' | 'EAR'}`;
export interface Keypoint { label: JointLabel; x: number; y: number } // normalized 0..1 of the rig cell; no z_index

export interface Manifest {
  format: 'pixeldoll/1' | 'pixeldoll/2';
  name: string;
  app: string;                    // "PixelDoll 0.1.0"
  rig: Rig;
  materials: Material[];
  slots: Slot[];                  // array order = tie-break for equal z (earlier draws first)
  items: Item[];                  // includes the base: the one item in slot "body"
  presets: Preset[];              // saved outfits; presets[0] is the default
  export?: ExportInfo;            // only in an exported manifest.json
}

// ---------- rig ----------
export interface Rig {
  cell: { w: number; h: number };        // square, 32–256 whole pixels per side
  pivot: { x: number; y: number };       // pixel-edge coords, same for every cell and layer
  directions: RigDirection[];            // order = sheet row order
  rest: Partial<Record<DirectionName, RestView>>; // original standing views; may include unselected views for reconnection
  animations: Clip[];                    // order = export order
  baseItem: string;                      // id of the item in slot "body"
  baseHash: Sha256;                      // hash over all base cell hashes (anim, dir, cell order)
  pad?: { x: number; y: number };        // translation applied at freeze (48 px base padded to 64: {x: 8, y: 12}, 4 px floor)
  anchors?: Partial<Record<AnchorId, AnchorTrack>>;
}
export interface RigDirection {
  id: DirectionName;
  mirrorOf?: DirectionName;              // generated by flipping that direction; sheets still contain baked pixels
}
/** Original rest rotation at rig.cell size. Unselected originals are retained for account reconnection;
 * only selected unique sources require keypoints and drive clips/items. Unused keypoints may be empty. */
export interface RestView {
  image: Sha256;                         // frozen PNG (padded, never rescaled)
  keypoints: Keypoint[];                 // 18 joints (managed skeletons["2d_references"][dir] or estimate-skeleton)
}
export interface Clip {
  id: string;                            // "idle", "walk", "slash", "hurt"
  cells: number;                         // stored poses per direction = sheet columns
  loop: boolean;
  frames: { cell: number; ms: number }[]; // playlist; cells may repeat (holds, ping-pong)
  sources: Partial<Record<DirectionName, ClipSource>>; // generated directions only (mirrors derive)
}
/** How one clip-direction was made. Stored, never regenerated (PixelLab is not bit-repeatable). */
export interface ClipSource {
  route: 'skeleton-v3' | 'pixminimax' | 'v3' | 'import';
  reference: Sha256;                     // first_frame sent (normally rig.rest[dir].image)
  keypoints?: Keypoint[][];              // [cell][18]: requested sequence, or measured sequence on frozen imported art
  motion?: string;                       // "managed-skeleton-v3:walking-8-frames" | "authored:slash" | "estimated"
  measured?: Keypoint[][];               // [cell][18]: re-estimated on the frozen frames (anchors, QA)
  provenance: number[];                  // indexes into the base item's provenance
}
/** points[anim][dir][cell] = [x, y] in pixel coords. Mirrored directions included. */
export type AnchorTrack = Record<string, Partial<Record<DirectionName, [number, number][]>>>;

// ---------- color ----------
export interface Material {
  id: string;                            // "skin", "hair", "sword_metal"
  label: string;
  ramp: Hex[];                           // shadow -> highlight; disjoint per owner in /2, globally in /1
  variants: Record<string, Hex[]>;       // same length as ramp; recolor = exact index swap
  linkTo?: string;                       // follow another material's selected variant (beard -> hair)
  owner: string;                         // item id that introduced it ("base" for skin/eyes/shirt/shorts)
  defaultVariant?: string;               // /2 approved baseline when the outfit has no explicit selection
}

// ---------- slots ----------
export interface Slot {
  id: string;                            // "head", "main_hand"
  z: number;                             // z of the item's main/fg layer
  bgZ?: number;                          // present = items in this slot are split into fg/bg layers
  class: 'base' | 'rigid' | 'held' | 'worn'; // QA (rigid headwear: anchor spread; held: grip side) and mask band
  anchor?: AnchorId;                     // anchor for placement/handedness QA
  required?: boolean;                    // true only for "body"
  hides?: string[];                      // default: slots whose layers are hidden while this slot has a visible item
  clips?: string[];                      // B14: slots tucked under this slot's item (head: ["hair"]); see invariant 11
  zOverrides?: ZOverride[];              // sparse exceptions
  band?: boolean;                        // project only: clip extraction to the slot's keypoint y-band (held: false)
}
export interface ZOverride {
  layer: 'fg' | 'bg';
  z: number;
  dir?: DirectionName;                   // omitted = all
  anim?: string;                         // omitted = all
  cell?: number;                         // stored cell index (a pose), omitted = all
}

// ---------- items ----------
export interface Item {
  id: string;
  name: string;
  slot: string;
  status: 'draft' | 'accepted' | 'stale';     // stale = baseHash != rig.baseHash
  mirror: 'flip' | 'generate';
  hides?: string[];                       // replaces slot.hides when present
  variantOf?: string;                     // B14, export only: this item is the baked "<variantOf>~<under>" copy of item variantOf,
  under?: string;                         //   tucked under item `under` (invariant 11)
  materials: string[];                    // recolor regions present in this item's pixels
  regions?: 'shirt-shorts';               // base only (B15): garment grays carry their region in the blue LSB (even = shirt, odd = shorts)
  prompt: string;                         // the user's item description
  layers: Layer[];                        // 1 layer ("main", role fg) or 2 ("fg" + "bg")
  baseHash: Sha256;                       // base the layers were extracted against
  route?: 'skeleton-pose' | 'inpaint-grid' | 'ea2-anchor' | 'diff'; // architecture §4; absent on the base
  key?: 'green' | 'magenta' | 'blue';     // chroma key used (all routes except diff); blue only when green and magenta collide
  dressed?: Partial<Record<DirectionName, Sha256>>; // skeleton-pose: dressed chroma keyframes; re-posed for new clips
  anchorCell?: CellKey;                   // ea2-anchor: dressed cell passed as frame 1 to later calls
  provenance: Provenance[];
  qa?: ItemQa;                            // absent on the base
  coverage?: CellKey[];                   // /2 known cells, including intentionally transparent cells
  design?: EquipmentLineage;             // /2 pinned source snapshot, palette roles and target/reference audit
}
export interface Layer {
  id: 'main' | 'fg' | 'bg';
  role: 'fg' | 'bg';
  z: number;                              // resolved static z (slot ladder or item override)
  cells?: Record<string, Partial<Record<DirectionName, (Sha256 | null)[]>>>; // project.json; null = transparent cell
  sheets?: Record<string, string>;        // manifest.json; anim id -> path of the sheet PNG
  sourceSheets?: Record<string, string>;  // /2 original source-ramp sheets when sheets render defaultVariant
  cell?: { w: number; h: number };        // v1.3.1: this layer's cell; default rig.cell. Held items: {w: 96, h: 96} [S5]
  pivot?: { x: number; y: number };       // v1.3.1: the SAME body point in this layer's cell; default rig.pivot.
                                          //   96 held layer: rig.pivot + (16, 16). manifest.json always writes both.
}

export interface Provenance {
  endpoint: string;                       // "/inpaint-image-pro-flash"
  params: Record<string, unknown>;        // request body; images -> {"sha256": "..."}, stored keypoint arrays -> a path
                                          // string such as "rig.animations[walk].sources.south"; never the key
  seed: number;
  requestHash: Sha256;                    // hash(endpoint + params + input hashes + seed): result cache key
  jobId?: string;                         // background_job_id
  usage?: { generations?: number; usd?: number };
  createdAt: string;                      // ISO 8601
  produced: CellKey[];                    // cells this call produced directly
}
/** Gates of architecture §4.5; worst value over all cells/clips of the item. */
export interface ItemQa {
  minKeyKept: number;                     // >= 0.97
  maxKeyOutside: number;                  // <= 0.03 skeleton-pose, <= 0.05 otherwise
  shiftedFrames: number;                  // frames whose best integer shift != 0; must be 0
  minAreaRatio: number;                   // cell area / clip median, >= 0.5
  maxAreaCV: number;                      // per clip, <= 0.15
  maxPaletteDist: number;                 // worst clip/call segment vs evaluation's design palette, <= 15
  clipPx: number;                         // legacy name: border-contact count for review, not pixels proven cropped
  grip?: { R: number; L: number; amb: number; none: number }; // held items (gripSide counts)
  anchorSpread?: number;                  // head items, px, <= 3 front/back
  strayPx: number;                        // removed by the largest-component filter (logged)
  rerolls: number;
  status: 'pass' | 'warn' | 'fail' | 'accepted'; // accepted = human override
  cells: Record<CellKey, CellQa>;
  clips?: Record<string, QaSummary & { hand?: 'r' | 'l' | '?' }>; // animation/direction; current replaceable checks
  legacy?: { clips: string[]; summary?: QaSummary }; // remaining older coverage; historical totals may be incomplete
}
// QaSummary contains ItemQa's scalar checks/status, excluding rerolls, cells, clips and legacy.
// New move edits reduce the current parts; recorded retry history remains cumulative. Manual acceptance overrides
// only non-clean parts. Old records are not silently reconstructed: while legacy coverage remains, status cannot pass.
// Each evaluation uses its own design palette; the paid retry gates remain per call. Optional QA fields survive export.
export interface CellQa {
  route: 'posed' | 'grid' | 'ea2' | 'diff' | 'mirrored' | 'import';
  provenance?: number;                    // index into item.provenance (source call)
  area: number;                           // layer px
  keyKept?: number;
  offset?: [number, number];              // posed cells: 1 px re-registration applied to the PixelLab output
  repaired?: boolean;                     // B9 held: item lost on a near-rest pose frame, dressed keyframe pasted at the wrist move
  snappedPct: number;                     // 0..100 of layer px within the item's ramps
}

// ---------- presets / export ----------
export interface Preset {
  id: string;
  name: string;
  items: Record<string, string | null>;   // slot id -> item id (null = empty)
  variants: Record<string, string>;       // material id -> variant name
}
export interface ExportInfo {
  exportedAt: string;
  layout: 'pixeldoll-sheets/1';
  engines: ('generic' | 'godot' | 'unity' | 'phaser' | 'gdevelop' | 'aseprite')[];
  pixelsPerUnit: number;                  // Unity; default = rig.cell.w
  baked?: string[];                       // preset ids with baked composites
  bakedCell?: { w: number; h: number };   // v1.3.1: cell of every baked sheet = union of all exported layers around the pivot
  bakedPivot?: { x: number; y: number };  //   (64 rig + 96 sword -> 96x96, pivot rig.pivot + 16); = rig cell/pivot without oversize
}
```

### 2.1 Oversize layers (v1.3.1)

Held items need room outside the body cell (8 px above it in an overhead slash, 5 px below it in a walk [S5]), so a layer may
have its own `cell` and `pivot`. Layers line up **by pivot**: a layer's cell sits at `rig.pivot − layer.pivot` in rig-cell
coordinates (the 96 sword at (−16, −16)). Grid, frame names, playlists and the clock are unchanged, so engines still sync by
frame index or name; only each layer's rect and pivot differ. Conventions:

- **Preview** (`composeCell` default) clips oversize layers to the rig cell. **Baked composites** use `export.bakedCell` /
  `bakedPivot` = the smallest frame holding every exported layer around the shared pivot, one size per export (all presets),
  so an engine reads one fixed cell for all baked sheets. Engine node positions do not change: every layer's pivot lands on the
  node origin.
- **Mirrored directions** flip the whole layer cell, so an oversize cell must be centered on the rig cell
  (`2 · (rig.pivot.x − layer.pivot.x) + layer.cell.w = rig.cell.w`; inv. 10).
- **World scale** stays the base's: Unity PPU = `export.pixelsPerUnit` (default `rig.cell.w`) for every layer, never the
  layer's width, or a 96 sword renders at 2/3 scale.
- `Slot` defaults (held 96, back 96 optional, others 64) are an item-pipeline choice; the manifest only stores the layer's.
  Since B9 the item pipeline gives every `skeleton-pose` held item (`main_hand`, `off_hand`) `cell {96, 96}` and
  `pivot = rig.pivot + (16, 16)` automatically (`lib/items` `padOf`); anchor-route held items stay on the rig cell.

---

## 3. Invariants (validated before every export; export refuses on failure)

1. Every layer of every exported item has a sheet for **every** rig animation. A cell where the item is absent is a
   **transparent cell**, never a missing one (engines desync silently otherwise [R3, R4 R-6]).
2. Sheet size **per layer** = `cells × layer.cell.w` by `directions.length × layer.cell.h` (`layer.cell` defaults to
   `rig.cell`; v1.3.1). Rows follow `rig.directions`, columns follow cell index. Sheets are untrimmed. Every cell image of a
   layer has exactly the layer's cell size; cell and pivot are integers.
3. Every `frames[].cell < cells`. Every `frames[].ms` is a positive integer.
4. `item.baseHash === rig.baseHash` for exported items (stale items are excluded with a warning).
5. Material IDs are globally unique. Ramps are pairwise disjoint within an owner in `pixeldoll/2`, and globally in `pixeldoll/1`; `variants[*].length === ramp.length`. Source and variant colors use six-digit `#RRGGBB` values.
6. Exactly one item has `slot: "body"`; it is `rig.baseItem`. Every item has either one `main` layer with role `fg`, or an `fg`/`bg` pair with matching roles. Import and export reject other layouts because native playback uses the foreground body as its clock.
7. Draw order: ascending resolved z; ties broken by `slots` order, then `role` (bg before fg), then item id. Slot, layer and override depths must be signed 32-bit integers; native consumers store integer depths.
8. Resolved z for a cell = the most specific matching `zOverride` (cell > anim > dir > none; on equal specificity the later entry
   wins), else `layer.z`.
9. A visible item hides every layer of each slot in `item.hides ?? slot.hides` (hidden layers are not drawn; their cells still exist).
10. If any direction is mirrored, every layer cell is centered on the rig cell: `2 · (rig.pivot.x − layer.pivot.x) + layer.cell.w
    = rig.cell.w` (v1.3.1; a flip of an off-center cell would move the item).
11. Tuck-under (B14): while an item of slot S is worn, the layers of every item in `slots[S].clips` drop their px at or above the
    covering item's lowest opaque row, per column (columns beside the cover use the nearest covered column); `hides` wins.
    Exports bake one item `"<item>~<cover>"` (`variantOf`, `under`) per pair; a runtime draws that item instead of `<item>`
    whenever `<cover>` is equipped (Godot `_shown`, Phaser `shown`, Unity `Shown`). Mirrored rows stay flips (tucking commutes).
    Preview/import can represent multiple covering slots, but export currently refuses combinations where two distinct,
    populated clipping slots can cover a visible target together. Per-pair baked variants cannot represent their combined mask.
    Alternative items in one covering slot, stale/empty covering slots, and covers that always hide the target do not trigger this restriction.

Export `pixelsPerUnit`, when supplied, must be positive and finite; fractional values are supported.
Godot maps manifest depths to compact native ranks because `CanvasItem.z_index` has a bounded range. Ordering and cell overrides
are preserved; use the character root's depth for positioning among scene objects rather than treating manifest depths as native indices.

---

## 4. Example `manifest.json` (exported; arrays shortened where marked)

```jsonc
{
  "format": "pixeldoll/1",
  "name": "hero",
  "app": "PixelDoll 0.1.0",
  "rig": {
    "cell": { "w": 64, "h": 64 },
    "pivot": { "x": 32, "y": 59 },
    "pad": { "x": 8, "y": 12 },
    "directions": [
      { "id": "south" }, { "id": "east" }, { "id": "north" }, { "id": "west", "mirrorOf": "east" }
    ],
    "rest": {
      "south": { "image": "sha256:a1…", "keypoints": [ {"label":"NOSE","x":0.505,"y":0.25}, {"label":"NECK","x":0.505,"y":0.353} ] }
      // shortened: 18 joints; also "east", "north"
    },
    "animations": [
      { "id": "walk", "cells": 8, "loop": true,
        "frames": [ {"cell":0,"ms":100}, {"cell":1,"ms":100}, {"cell":2,"ms":100}, {"cell":3,"ms":100},
                    {"cell":4,"ms":100}, {"cell":5,"ms":100}, {"cell":6,"ms":100}, {"cell":7,"ms":100} ],
        "sources": {
          "south": { "route": "skeleton-v3", "reference": "sha256:a1…", "motion": "managed-skeleton-v3:walking-8-frames",
                     "keypoints": [ [ {"label":"NOSE","x":0.505,"y":0.26} ] ], // shortened: [8 cells][18 joints]
                     "provenance": [1, 2] }
          // shortened: "east", "north"; west mirrors east
        } },
      { "id": "slash", "cells": 8, "loop": false,
        "frames": [ {"cell":0,"ms":80}, {"cell":1,"ms":80}, {"cell":2,"ms":60}, {"cell":3,"ms":60},
                    {"cell":4,"ms":60}, {"cell":5,"ms":80}, {"cell":6,"ms":100}, {"cell":7,"ms":120} ],
        "sources": {
          "south": { "route": "skeleton-v3", "reference": "sha256:a1…", "motion": "authored:slash",
                     "keypoints": [ [ {"label":"RIGHT ARM","x":0.36,"y":0.64} ] ], // shortened
                     "provenance": [3] }
        } }
      // shortened: "idle", "hurt"
    ],
    "baseItem": "base",
    "baseHash": "sha256:5f1c…",
    "anchors": { "head": { "walk": { "south": [[32,14],[32,13],[32,13],[32,14],[32,14],[32,13],[32,13],[32,14]] } } } // shortened
  },
  "materials": [
    { "id": "skin", "label": "Skin", "owner": "base",
      "ramp": ["#3b1f1a","#7a3e2e","#b56a4c","#d98f6b","#f2b896","#fbdcc4"],
      "variants": { "tan": ["#2e1913","#5f3121","#8e5236","#b0704f","#cf9572","#e8b99a"] } },
    // shortened: "eyes", "shirt" and "shorts" base materials
    { "id": "hair", "label": "Hair", "owner": "hair_short",
      "ramp": ["#1a1410","#3a2a1e","#5c4430","#80603f"], "variants": { "blond": ["#5a4220","#9a7535","#c9a24e","#ecd27a"] } },
    { "id": "iron", "label": "Iron", "owner": "helmet_iron",
      "ramp": ["#2b2f36","#4d535d","#7a828e","#b3bac4"], "variants": {} },
    { "id": "cape_cloth", "label": "Cape", "owner": "cape_red",
      "ramp": ["#4a0d12","#7d1820","#b02832","#d9514f"], "variants": { "blue": ["#0d1a4a","#1b2f7d","#2a48b0","#5179d9"] } }
  ],
  "slots": [
    { "id": "body",      "z": 10,  "class": "base", "required": true },
    { "id": "back",      "z": 90,  "bgZ": 4, "class": "worn",  "anchor": "neck" },
    { "id": "hair",      "z": 110, "bgZ": 3, "class": "head",  "anchor": "head" },
    { "id": "head",      "z": 130, "class": "head", "anchor": "head" },
    { "id": "main_hand", "z": 150, "bgZ": 6, "class": "held",  "anchor": "hand_r",
      "zOverrides": [ { "layer": "bg", "dir": "north", "z": 1 } ] }
    // shortened: the default ladder has 16 slots (architecture §5)
  ],
  "items": [
    { "id": "base", "name": "Base body", "slot": "body", "status": "accepted", "mirror": "flip",
      "materials": ["skin", "shirt", "shorts"],
      "prompt": "bald human character, plain gray t-shirt and plain gray shorts, barefoot, arms slightly away",
      "baseHash": "sha256:5f1c…",
      "layers": [ { "id": "main", "role": "fg", "z": 10,
        "sheets": { "idle": "layers/body/base/main/idle.png", "walk": "layers/body/base/main/walk.png" } } ],
      "provenance": [
        { "endpoint": "/create-character-v3", "seed": 4321, "jobId": "…", "requestHash": "sha256:…",
          "params": { "description": "bald human character, plain gray t-shirt…", "image_size": {"width":48,"height":48},
                      "view": "low top-down", "template_id": "mannequin", "no_background": true },
          "usage": { "generations": 2 }, "createdAt": "2026-10-21T09:05:00Z", "produced": [] },
        { "endpoint": "/create-character-v3", "seed": 0, "jobId": "…", "requestHash": "sha256:…",
          "params": { "reference_image": {"sha256": "a1…"}, "direction_images": {"east": {"sha256": "…"}, "north": {"sha256": "…"}},
                      "n_directions": 4 },
          "usage": { "generations": 0.25 }, "createdAt": "2026-10-21T09:08:00Z", "produced": [] },
        { "endpoint": "/characters/animations", "seed": 7, "jobId": "…", "requestHash": "sha256:…",
          "params": { "character_id": "…", "mode": "skeleton-v3", "template_animation_id": "walking-8-frames",
                      "directions": ["south"] },
          "usage": { "generations": 3 }, "createdAt": "2026-10-21T09:12:00Z", "produced": [] },
        { "endpoint": "/animate-with-skeleton-v3", "seed": 7, "jobId": "…", "requestHash": "sha256:…",
          "params": { "first_frame": {"sha256": "a1…"}, "first_frame_keypoints": "rig.rest.south", "keypoints": "rig.animations[walk].sources.south",
                      "description": "bald man in a plain gray t-shirt and gray shorts, empty hands, no weapon",
                      "action": "walk", "direction": "south", "view": "low top-down", "no_background": true },
          "usage": { "generations": 3 }, "createdAt": "2026-10-21T09:20:00Z", "produced": ["walk/south/0", "walk/south/7"] } // shortened
      ] },
    { "id": "helmet_iron", "name": "Iron helmet", "slot": "head", "status": "accepted", "mirror": "flip",
      "hides": ["hair"], "materials": ["iron"], "prompt": "a simple gray steel knight helmet, face visible",
      "baseHash": "sha256:5f1c…", "route": "skeleton-pose", "key": "green",
      "dressed": { "south": "sha256:d1…", "east": "sha256:d2…", "north": "sha256:d3…" },
      "layers": [ { "id": "main", "role": "fg", "z": 130,
        "sheets": { "idle": "layers/head/helmet_iron/main/idle.png", "walk": "layers/head/helmet_iron/main/walk.png" } } ],
      "provenance": [
        { "endpoint": "/edit-animation-v2", "seed": 7, "jobId": "…", "requestHash": "sha256:…",
          "params": { "description": "This pixel art character is a solid bright green mannequin… Add only a simple gray steel knight helmet…",
                      "frames": [ {"sha256": "…"}, {"sha256": "…"}, {"sha256": "…"} ], // chroma rest views S, E, N
                      "image_size": {"width":64,"height":64}, "no_background": true },
          "usage": { "generations": 10 }, "createdAt": "2026-10-21T10:40:00Z", "produced": [] },
        { "endpoint": "/animate-with-skeleton-v3", "seed": 7, "jobId": "…", "requestHash": "sha256:…",
          "params": { "first_frame": {"sha256": "d1…"}, "first_frame_keypoints": "rig.rest.south",
                      "keypoints": "rig.animations[walk].sources.south", "action": "walk", "direction": "south",
                      "view": "low top-down", "no_background": true },
          "usage": { "generations": 3 }, "createdAt": "2026-10-21T10:46:00Z",
          "produced": ["walk/south/0", "walk/south/7"] } // shortened; + one pose call per clip-direction
      ],
      "qa": { "minKeyKept": 0.986, "maxKeyOutside": 0.013, "shiftedFrames": 0, "minAreaRatio": 0.9, "maxAreaCV": 0.06,
              "maxPaletteDist": 1.3, "clipPx": 0, "anchorSpread": 0.7, "strayPx": 5, "rerolls": 0, "status": "pass",
              "cells": {
                "walk/south/3": { "route": "posed", "provenance": 1, "area": 122, "keyKept": 0.99, "snappedPct": 98 },
                "walk/west/3":  { "route": "mirrored", "provenance": 0, "area": 133, "snappedPct": 98 }
                // shortened: one entry per cell
              } } },
    { "id": "cape_red", "name": "Red cape", "slot": "back", "status": "accepted", "mirror": "flip",
      "materials": ["cape_cloth"], "prompt": "a long red cloth cape hanging from the shoulders",
      "baseHash": "sha256:5f1c…", "route": "skeleton-pose", "key": "green",
      "dressed": { "south": "sha256:c1…", "east": "sha256:c2…", "north": "sha256:c3…" },
      "layers": [
        { "id": "fg", "role": "fg", "z": 90, "sheets": { "idle": "layers/back/cape_red/fg/idle.png", "walk": "layers/back/cape_red/fg/walk.png" } },
        { "id": "bg", "role": "bg", "z": 4,  "sheets": { "idle": "layers/back/cape_red/bg/idle.png", "walk": "layers/back/cape_red/bg/walk.png" } }
      ],
      "provenance": [ /* 1 × /edit-animation-v2 dress + 12 × /animate-with-skeleton-v3 pose (shortened) */ ],
      "qa": { "minKeyKept": 0.974, "maxKeyOutside": 0.028, "shiftedFrames": 0, "minAreaRatio": 0.71, "maxAreaCV": 0.06,
              "maxPaletteDist": 1.0, "clipPx": 0, "strayPx": 33, "rerolls": 1, "status": "pass", "cells": {} } }
  ],
  "presets": [
    { "id": "default", "name": "Knight",
      "items": { "body": "base", "head": "helmet_iron", "back": "cape_red", "hair": null, "main_hand": null },
      "variants": { "skin": "tan" } }
  ],
  "export": { "exportedAt": "2026-10-20T21:00:00Z", "layout": "pixeldoll-sheets/1",
              "engines": ["generic", "godot", "phaser", "unity"], "pixelsPerUnit": 64, "baked": ["default"] }
}
```

---

## 5. Export zip layout (`pixeldoll-sheets/1`)

```
<name>.pixeldoll.zip
  manifest.json                                   # authoritative; everything below is derived from it
  README.txt                                      # what is inside + quick start per engine
  CREDITS.txt                                     # CSV text, one row per PixelLab call: job id, endpoint, seed, prompt
                                                  #   (B11: not .csv, which Godot imports as a translation table)
  layers/<slot>/<item>/<layer>/<anim>.png         # ONE untrimmed PNG per layer per animation
                                                  #   rows = rig.directions (mirrored rows baked), cols = cells
  baked/<preset>/<anim>.png                       # optional composites, same grid on export.bakedCell (RPG Maker, crowds)
  project.json, cells/<rgba-sha256>.png           # editable import copy (§7)
  godot/      <item>_<layer>.tres, library.tres, Paperdoll.tscn, paperdoll.gd, README.txt
  unity/      Editor/PixelDollImporter.cs, Runtime/Paperdoll.cs, Editor/Runtime asmdefs, README.txt
  phaser/     <length>-<item>_<length>-<layer>_<length>-<anim>.json, PaperdollContainer.js, README.txt
  gdevelop/   game.json, Paperdoll.js, images/<registered-frame>.png, README.txt
  generic/    <item>_<layer>/<anim>_<dir>_strip<N>.png, README.txt
  aseprite/   <name>.aseprite, README.txt          # B11: layered, zero-code path (§6.5)
```

Why per-animation sheets: an all-animation sheet passes 4096 px quickly (8 dirs × 12 anims × 64 px [R3]); per-animation sheets are
at most 16 × 64 = 1024 px wide and 8 × 64 = 512 px tall at the v1 limits. Frame names everywhere: **`<anim>_<dir>_<cell>`**
(e.g. `walk_south_3`). Animation keys everywhere: **`<anim>_<dir>`**.

---

## 6. Per-engine mapping

### 6.1 Pivot conversion (from `pivot {x, y}` in a `w × h` cell; per LAYER since v1.3.1: its own `cell` + `pivot`)

| Target | Value |
|---|---|
| Godot 4 | `centered = false`, `offset = Vector2(-x, -y)` |
| Unity | normalized from **bottom-left**: `pivot = (x / w, 1 − y / h)`; sprite rect `y_unity = texH − (row + 1) · h` |
| Phaser 3/4 | atlas frame `"pivot": {"x": x / w, "y": y / h}` (auto `setOrigin` [R3]) |
| Aseprite | slice `"pivot"` (pixels, relative to the slice bounds = the cell) |
| Mirrored direction | already baked into pixels; the pivot is unchanged because the cell is centered (inv. 10) |
| Oversize layer | same formulas with the layer's `w, h, x, y`; Unity PPU stays the base's |

### 6.2 Godot 4 — `SpriteFrames` `.tres` + scene + sync script

Verified [M5]: Godot 4.7.1 imports with 0 errors (relative `ext_resource` paths), stays in sync over 540 ticks incl. a per-cell
z override, and renders 0 differing px vs `baked/`.


- One `SpriteFrames` per (item, layer). Animation name `<anim>_<dir>`, `loop` from the rig, `speed = 1000 / msBase` where
  `msBase` = smallest `ms` in the playlist; each playlist entry → frame `{texture: AtlasTexture(region = cell rect), duration:
  ms / msBase}`. AtlasTexture `filter_clip = true`, region = the layer's own cell rect. No `.import` files shipped.
- `Paperdoll.tscn`: `Node2D` root with `paperdoll.gd`; one `AnimatedSprite2D` per (slot, role) named `<slot>_<role>`,
  `centered = false`, `offset = -layer.pivot` (of the equipped layer; `equip` re-sets it, so a 96 sword and a 64 item can share a
  slot), `z_index = layer z`, `texture_filter = NEAREST`. `body_fg` is the master clock. Verified with a 96 sword [B8].
- `paperdoll.gd`: master `frame_changed`/`animation_changed` → every other layer `set_frame_and_progress`;
  `equip(slot, item_id)` swaps the slot's fg/bg resources and applies `hides`; `play_anim(anim, dir)` selects a supported
  move/view and applies `zOverrides`. `set_preset(id)` and `set_variant(material_id, name)` perform exact owner-local
  source-ramp swaps, including linked/default variants. Palette refresh preserves the clock's frame, progress and playback.
- Native `library.tres` stores manifest metadata and references every equipment resource, so alternate items survive
  selected-scene game packaging. Resource IDs encode names without collapsing hyphens and underscores.
- Project settings noted in the README: default texture filter Nearest, 2D pixel snap on, import Lossless.

2026-10-23 regression: Godot 4.7.1 headless import, palette/equipment/clock checks and selected-scene PCK runtime passed.
This new test inspects native resource/image data; it does not repeat the historical GPU pixel comparison above.

### 6.3 Unity (2022.3 LTS / Unity 6) — Editor importer, no hand-written `.meta`

2026-10-23 status: generated C# compiles against installed Unity 6000.4.0f1 assemblies plus official Sprite package interface
sources and a signature-only factory shim. A deprecated `GetInstanceID` compatibility warning remains. The importer has
**not run in an activated editor** (batchmode exits 198: no valid license). Native rendering, runtime palette behavior and
asset-reference persistence remain unverified in Unity. Only `com.unity.2d.sprite` is required; 2D Animation is not referenced.
Export adds `pixeldoll_unity.json` (flattened for `JsonUtility`) and two per-character asmdefs/namespaces.


- `PixelDollImporter.cs` (`AssetPostprocessor` + a menu command reading `pixeldoll_unity.json`): for each sheet sets Sprite Mode
  Multiple, Filter Point, Compression None, PPU = `export.pixelsPerUnit`; slices via `ISpriteEditorDataProvider.SetSpriteRects`
  with names `<anim>_<dir>_<cell>`, each layer by its own cell + custom pivot (§6.1, `pixeldoll_unity.json` layer
  `cellW/cellH/pivotX/pivotY`), retaining existing Sprite IDs on reimport. Builds body `AnimationClip`s `<anim>_<dir>`
  with `ObjectReferenceKeyframe`s on `SpriteRenderer.sprite` from the playlist (cumulative ms), an Animator Controller, and a
  prefab: root with **Sorting Group** + `Paperdoll.cs`, a hidden animation clock and one visible `SpriteRenderer` per
  (slot, role). Sorting ranks preserve resolved z and slot/role ties. Clip/controller assets are updated in place.
- `Paperdoll.cs`: `Play(anim, dir)`, `Equip(slot, itemId)`, `ApplyPreset(id)`, `SetVariant(materialId, name)`.
  `LateUpdate` synchronizes visible source sprites to the hidden clock. Runtime palette swaps use original sheets,
  owner-local RGB maps and cached textures/sprites. Default material selections and linked selections are supported.
  Keep source textures readable and unpacked (no Sprite Atlas); see the generated README for project setup.
- Different characters receive distinct deterministic namespaces/assembly identities. Re-export the same character into
  its existing folder; importing duplicate copies of that character would duplicate its assemblies.

### 6.4 Phaser 3 / 4 — atlas JSON with customData

Verified [M5]: Phaser 3.80, 3.90 and 4.2.1 render 0 differing px vs `baked/`; layer frame names match the body every step.


- One TexturePacker **JSON-Hash** atlas per sheet (length-prefixed item/layer/animation identifiers → `layers/.../<anim>.png`): frames
  `<anim>_<dir>_<cell>` with `frame` rect (the layer's cell), `rotated:false`, `trimmed:false`, `sourceSize`, `pivot` (§6.1, per
  layer: sprites at the same container position line up by pivot because `setFrame` applies each frame's custom pivot [B8]). Extra top-level key
  `"pixeldoll": {"item", "layer", "slot", "role", "z", "anim"}` lands in `texture.customData` [R3].
- `PaperdollContainer.js`: loads manifest/atlases with folder-scoped keys and error reporting; creates supported body
  animations from playlists. Phaser **adds** per-frame duration to its base interval: set `frameRate = 1000 / minMs` and
  each `duration = ms - minMs`. Layers follow `animationupdate`; resolved z and stable slot/role order control drawing.
  `play(anim, dir)`, `equip(slot, itemId)`, `applyPreset(preset)` and `setVariants(selections)` preserve the frozen base,
  hides, tucked variants and owner-local source-ramp palettes. `destroy()` removes the container; palette textures remain
  cached until game teardown. Use `pixelArt: true`, `roundPixels: true`.

2026-10-23 smoke: Phaser 3.90.0 and 4.1.0, Canvas and WebGL, passed exact 80/180/100 ms timing, palette switching,
layer synchronization and oversized pivots with zero page errors. Phaser 3.80 compatibility was source-reviewed only.

### 6.5 Aseprite — layered `.aseprite` as the zero-code alternative (B11)

Verified [B11]: Aseprite 1.3.18 CLI (batch) reads the file; per-layer frames match `layers/` and the flattened frames match
`baked/<presets[0]>` with 0 differing px (S1, S2, S5 fixtures). Writer: `lib/export/aseprite.ts`, from the ase spec.

- **One file per character** (`aseprite/<name>.aseprite`, RGBA): one Aseprite layer per exported (item, layer), named
  `<slot>.<item>` (`<slot>.<item>.fg` / `.bg` for split items), stacked in draw order by static z (inv. 7 tie-breaks; bottom =
  lowest, so bg layers sit below the base). Every item is in the file; **visible** = equipped in `presets[0]` and not hidden
  (inv. 9). Pixels apply the first outfit's colors from source sheets, including default and linked material selections.
- **Timeline**: frames = every playlist entry of every move × each direction the move has (`rig.animations[].directions`), in
  rig order, each with its `ms`; one tag `<anim>_<dir>` per move-direction (forward; repeat 1 when `loop` is false). A cell that
  repeats inside a playlist is a linked cel; a transparent cell has no cel.
- **Canvas / pivot convention**: canvas = `export.bakedCell`; a layer's cel sits at `bakedPivot − layer.pivot`, so oversize
  (96) layers and 64 layers line up by pivot exactly as in `baked/`. One slice `pivot` = the whole canvas with pivot
  `bakedPivot` (frame 0, valid for all frames).
- **zOverrides** become cel z-indexes (Aseprite ≥ 1.3 draws by layer index + z-index): each cel's z-index is its position in
  that frame's resolved draw order minus its layer index, so the flattened frame equals `composeCell` on the baked frame.
  Per-layer importers (Godot Aseprite Wizard) ignore z-index; Unity's importer applies it (Order in Layer).
- Unity: Aseprite Importer → Individual Layers, Generate Model Prefab, Pivot Space Canvas. Godot: Aseprite Wizard, one
  `SpriteFrames` per layer. Not verified in those importers yet (Unity is license-blocked; the Wizard needs a plugin install).
- Native WORD/SHORT limits are checked before writing; unsupported durations/counts/coordinates and an empty timeline
  fail clearly. 2026-10-23: Aseprite 1.3.18.6 CLI matched the compositor across nine adversarial frames, including palettes.

### 6.6 Generic

- `generic/<item>_<layer>/<anim>_<dir>_strip<N>.png` (GameMaker `_stripN` auto-split; strip height = the layer's cell) plus
  `manifest.json`.
  Any engine: one sprite per layer. Advance the playlist (`frames[].cell`, held for `frames[].ms`), respecting `loop`;
  a sheet column is a source cell, not necessarily the next playback frame. Draw in resolved-z order, using
  `(worldPivot.x - layer.pivot.x, worldPivot.y - layer.pivot.y)` as each layer's top-left. Default colors are baked into
  canonical sheets; palette-aware integrations start from `sourceSheets` when provided.
- `baked/<preset>/<anim>.png`: the compositor's output on the same grid with `export.bakedCell` / `bakedPivot` (§2.1), for
  engines without layering (RPG Maker style).

### 6.7 GDevelop — editable native project and Sprite controller

- `gdevelop/game.json` is a native GDevelop project. Every equipment layer is a registered Sprite object, with individual
  untrimmed PNG resources for every source cell and direction. Native `originPoint` uses the layer pivot. All resources,
  including unequipped items, are registered so the editor's exporter retains them.
- A native JavaScript event embeds manifest data and drives a single millisecond clock per doll. It resolves playlist
  holds, non-looping endings, hides, tucked variants and per-cell z overrides, with stable slot/role ties. Equipment and
  presets are independent across doll instances. Palette textures use exact owner-local source RGB ramps and are released
  on destruction or scene unload. `Paperdoll.js` is a readable copy of the event, not an additional script to execute.
- Open the project to Preview. To integrate, copy its Sprite objects and controller event into a destination scene and
  preserve resource paths; see the generated README for the character-specific library key and API.
- Verified with GDevelop 5.6.285's released editor-core WASM importer, official HTML exporter and shipped GDJS/PIXI runtime
  in Chromium. The portable desktop executable could not launch here because of a crashpad error; desktop UI was not
  exercised. `app/scripts/verify-gdevelop-engine.mjs` reproduces the engine-core/export/runtime checks using a local release.

## 7. Editable import copy

Every new export ZIP also contains `project.json` and `cells/<rgba-sha256>.png`. Engine readers continue to consume `manifest.json` and `layers/`.

`project.json` has `format: "pixeldoll-project/1"`, the original in-memory `manifest` (including `layer.cells`, rest views and clip sources), and optional `character`, `skeletons` and `rigQa` from the local project record. Its presets include the exported current look. Cell filenames are the SHA-256 of decoded RGBA bytes, without the `sha256:` prefix; the importer verifies each referenced image hash before saving. Dressed item keyframes and rest images are included alongside animation and equipment cells. Local IDs, API keys and queue records are excluded.

Import assigns a fresh local ID, writes blobs and project in one IndexedDB transaction, and preserves independent directions, sparse clips and layer pivots. For older ZIPs without `project.json`, the importer reconstructs cells from `manifest.json` sheet rows in rig direction order; unavailable original pose metadata is removed. ZIP parsing rejects unsafe paths, unsupported compression/encryption, corrupt CRCs and oversized archives. Deletion removes local project/draft records atomically while retaining shared cell blobs for ordinary garbage collection.

Explicit rig setup measures every unique frozen body image with `estimate-skeleton`, registers all supplied rest views with `create-character-v3`, and atomically attaches the same rest/keypoint/anchor/character contract as creation. Existing artwork is not regenerated. Source camera `rig.view` and humanoid `rig.template` are retained. Imported sources use `route: "import"`, `motion: "estimated:frozen-import"` (or `"imported-rest"` for a matching one-cell rest), and actual measured keypoints. Their QA adherence is `null`; palette, feet and border checks still run. New moves use the normal skeleton-v3 render and independent adherence checks. Short item clips are padded to the API's three-frame minimum and trimmed; long clips are batched to at most fifteen poses with original cell indices preserved.


## Outfit-color export normalization (2026-10-22)

Before building engine files, PixelDoll makes an ordinary item copy for each distinct item/palette combination actually
used by an exported preset. Copy IDs are deterministic `<item>-color-<palette hash>` values (with a suffix when needed
for an existing ID); matching outfits reuse a copy. Preset item selections point to those copies and their engine-facing
`variants` maps are empty because the colors are already pixels. Original source-color items and material definitions
remain available. Tuck variants are built afterward, so colored hair and helmets preserve the same masking as Studio.

The canonical base stays the single item in slot `body` and remains every runtime's animation clock. When any outfit
recolors the body, or equipped items can clip it, every exported outfit receives a body copy (including identity-color
copies for original palettes). A body copy
uses an export-only `body_color` slot immediately after `body` (a collision gets a numbered slot suffix), the same layer
z values, geometry and overrides, and `hides: ["body"]` in addition to the base's existing hide rules. The hidden clock
continues animating; the ordinary synced layer displays its pixels. Existing body hide and clipping rules target the
visible copy as well. No engine-specific color shader is needed.

This normalization affects `manifest.json` and engine assets only. `project.json` and `cells/` preserve the original
editable items, material ramps, outfit variant selections, rig and provenance. Body dimensions of 48/56 px inside a 64 px
cell, legacy 32 px rig cells and 96 px held layers retain their geometry. Imported layer dimensions are bounded to
1–256 px and pivots use the pixel-edge convention inside their own layer cell. Import budgets include repeated logical
frame and sheet references, not just unique compressed files.


Accepted keyframe appearance exceptions use the optional `items[].designWarnings: string[]` field. These are the actual
reviewed design messages, independent of replaceable per-frame/clip `qa` summaries. They remain on the item when a move
is added or replaced, even when all old frame QA is invalidated, and survive editable ZIP export/import. Passing frame
checks remain `pass`; Studio separately labels the accepted appearance warnings. The optional field does not change
`pixeldoll/1`. Imports allow at most 100 nonempty strings of at most 2,000 characters each.


### Explicit item palette repair history

An item may contain `paletteRepairs`: local, explicit color edits under the fixed `neutral-owned-v1` policy. Each entry
records `materialId`, `anim`, authored `dir`, and changed frames (`cell`, `changedPixels`, layer `id` plus `before`/`after`
SHA-256 image references). Current cells point to corrected images. Historical hashes are audit references and do not
require obsolete blobs in the editable ZIP; later clip replacements may supersede them. Original paid provenance and
historical QA remain intact. The operation preserves alpha and pixel coordinates, changes no material definition or
variant, and matches only unclaimed neutral/cool colors to the one eligible item-owned neutral ramp within 24/255 per
channel. Ambiguous or unsupported colors stay unchanged. No PixelLab request or synthetic clean QA claim is implied.
The optional field does not change `pixeldoll/1`. Imports validate bounded history arrays, known policy version, safe
IDs, direction/frame/layer shapes, unique frame/layer entries, positive pixel counts and distinct valid hashes.
