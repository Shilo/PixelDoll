# fralonra/paperdoll — deep code review (R5, 2026-10-20)

Reviewer: R5 (paperdoll tools). Read from source, not only the README. Checkouts live in
`C:\Programming_Files\Shilocity\PixelLab\checkouts\` (shallow clones).

| Repo | Commit | Date | What it is |
|---|---|---|---|
| [fralonra/paperdoll](https://github.com/fralonra/paperdoll) | `70cb017` | 2023-08-19 | Core Rust crate: data model + CPU compositor (~700 LOC) |
| [fralonra/paperdoll-tar](https://github.com/fralonra/paperdoll-tar) | `5ca1ac9` | 2024-12-04 | `.ppd` container (tar) load/save |
| [fralonra/ppd-editor](https://github.com/fralonra/ppd-editor) | `55940bc` | 2024-12-11 | egui desktop **PpdEditor** + **PpdViewer** (two binaries) |
| [fralonra/bevy-paperdoll](https://github.com/fralonra/bevy-paperdoll) | `0c29d8b` | 2026-10-18 | Bevy plugin/asset loader (still being maintained) |

The user's own notes ([fralonra_paperdoll_inspiration.md](fralonra_paperdoll_inspiration.md)) ask about a grayscale base with
dynamic color modulation, and whether eyes and hair could work the same way. **fralonra has no color or tint support.** It is
covered under §6 and in the survey's color-model section.

---

## 1. Scope in one sentence

A **stationary** (no animation, no directions) 2D raster "dress-up" model. A doll has slots, a slot holds candidate image
fragments, and a fragment is snapped into the slot by matching the fragment's pivot to the slot's anchor. The README says it
plainly: *"It's stationary. Animations and transformations are not supported."*

That puts it closer to Picrew (avatar makers) than to frame-based game paperdolling. It is still useful for its **clean
three-entity model** and its **editor UX**.

## 2. Architecture

```
paperdoll (model + render)  ←  paperdoll-tar (.ppd I/O)  ←  ppd-editor (egui editor + viewer)
                                                          ←  bevy-paperdoll (game runtime)
```

- `PaperdollFactory` (`src/factory.rs`) holds three `BTreeMap<u32, _>` (dolls, slots, fragments), each with its own
  `IdFactory` (it keeps a `HashSet` of ids that are in use; a removed id can be handed out again).
- `Manifest` is the serde-serializable snapshot (`meta`, `dolls[]`, `slots[]`, `fragments[]`). Image pixels are
  `#[serde(skip)]` and are stored next to the manifest as files.
- `Paperdoll { doll: u32, slot_map: HashMap<slot_id, fragment_id> }` is the *instance* (one dressed character). The
  `PaperdollBuilder` validates it, and it **panics** on unknown ids.
- There are two render paths:
  - `analyse(doll, slot_map, only_id) -> RenderMaterial { width, height, doll: Option<RenderPiece>, slots: Vec<RenderPiece> }`.
    This is an **engine-agnostic draw list** (id + top-left position + image), for engines that draw the pieces themselves.
  - `render(...) -> ImageData` is a CPU alpha-over composite into one RGBA buffer, used by the viewer export and by bevy.
- The editor uses an **action queue** (`VecDeque<Action>`, about 70 enum variants). UI code pushes actions, and
  `handle_actions` drains them every frame. There is **no undo/redo**, although the action pattern would make it easy to add.
- "Adapters" (`DollAdapter`, `SlotAdapter`, `FragmentAdapter`) are edit buffers for the modal dialogs. Nothing is committed
  until the user clicks Confirm.

## 3. Data model (exact fields)

```rust
Meta     { name: String, version: u32 /* = 1 */ }
Doll     { id, desc, width, height, offset: Point /* bg image offset */, slots: Vec<u32> /* = z-order */, path /* bg png */ }
Slot     { id, desc, required: bool, constrainted: bool, positions: Vec<Point> /* top-left(s) */,
           width, height, anchor: Point /* relative to slot top-left */, candidates: Vec<u32> /* fragment ids */ }
Fragment { id, desc, pivot: Point /* relative to fragment top-left */, path }
Point    { x: f32, y: f32 }   // +x right, +y down
```

Semantics, as verified in `factory.rs::analyse`:

- **Z-order = order of `doll.slots`.** Index 0 is drawn first, so it sits furthest back. The doll background image is always
  drawn under every slot. There is no per-slot z number, no front/back split, and no per-frame or per-direction override.
- **Placement (non-constrained):** `draw_pos = slot.position + slot.anchor - fragment.pivot`. The fragment keeps its own size.
  This is the "mortise and tenon" idea, and it is the useful part for PixelDoll (pivot/anchor attach points).
- **Constrained:** the fragment is meant to fill the slot rect (`slot.width × slot.height`). The editor canvas stretches it on
  the GPU, but **`render()` never resamples**. It writes `image.width = slot.width` and copies the fragment's original pixel
  buffer with the slot's stride. If the fragment size differs from the slot size, the CPU output (viewer export and bevy)
  comes out **garbled or skewed**. Bug (see §7).
- **Multiple positions:** one slot can be stamped at several positions (the example's "Eyes" slot has two positions). It is the
  same fragment, and there is no mirroring. For left/right pairs you still draw both eyes facing the same way.
- **Required:** when no selection is given, a required slot falls back to `candidates[0]`. A non-required slot may be empty
  ("bald" = empty hair slot).
- **Candidates are shared:** one fragment can be listed in many slots (the editor has an "Associated slots" matrix for this).
- **Multiple dolls per project** (the example has a "Body" doll and a "Face" doll). Dolls do not nest. There is no way to put a
  face doll inside a body doll.

### Example manifest (`ppd-editor/resources/examples/basic.ppd`, abridged)

```yaml
meta: { name: Basic Example, version: 1 }
dolls:
- { id: 0, desc: Body, width: 400, height: 500, slots: [0, 1, 2, 3], path: doll_0.png }
slots:
- id: 0
  desc: head
  positions: [{ x: 157.0, y: 46.0 }]
  width: 86
  height: 88
  anchor: { x: 43.0, y: 0.2765808 }   # float anchors from canvas drags
  candidates: [1, 0]                  # helmet, hat
- { id: 5, desc: Eyes, required: true, constrainted: true,
    positions: [{x: 116, y: 136}, {x: 225, y: 136}], width: 59, height: 38, candidates: [11, 12, 13] }
fragments:
- { id: 0, desc: hat, pivot: { x: 61.0, y: 40.0 }, path: fragment_0.png }
```

## 4. File format: `.ppd`

[paperdoll-tar](https://github.com/fralonra/paperdoll-tar) `src/lib.rs`:

- A plain **tar** archive containing `manifest.yml` (YAML via serde_yaml), `doll_{id}.{ext}` and `fragment_{id}.{ext}`.
- On save, every image is **renamed** to `doll_{id}` / `fragment_{id}` (original filenames are lost; `desc` defaults to the
  filename stem on import). WebP is converted to PNG because the `image` crate cannot encode WebP.
- On load, the archive is unpacked to a temp dir, then decoded to RGBA8.
- There is no checksum, no thumbnail, and no schema version beyond `meta.version = 1`.
- Minor bug: if the source was `.jpg`, saving an RGBA8 buffer as JPEG will error, since JPEG has no alpha.

**For PixelDoll:** the idea of a "single archive = manifest + PNGs" is right. Use **ZIP** instead (JSZip/fflate in the browser,
natively supported by every engine toolchain and OS) and **JSON**, not YAML. Keep stable ids *and* human-readable file names.

## 5. Editor UX (PpdEditor), worth studying

Layout (`editor/ui.rs`): menu bar, then a **left panel** (doll list, doll properties, slot list), a **central canvas**, a
**right panel** (fragment library), and a **status bar**. Create/edit actions open **modal windows**.

Patterns that work well:

1. **Slot list row with three inline toggles**: 👁 visibility (editor only), 🔒 lock (prevents dragging), and ▦ "align basis"
   (use this slot's rect as a snapping target). Double-click edits. Right-click opens a context menu with
   Raise/Lower/Raise-to-top/Lower-to-bottom, copy/paste/duplicate (Ctrl+C/V/D), and delete.
2. **Canvas manipulation**: drag a slot to move it, and use eight handles to resize it (Ctrl locks the aspect ratio). Drag the
   anchor point to move it (Ctrl locks the axis). While dragging a slot, Ctrl restricts movement to H/V, Shift moves *all
   positions* of a multi-position slot, and Alt disables snapping. Right-drag or scroll pans, pinch or Ctrl-scroll zooms, Ctrl+J centers, Ctrl+K fits.
3. **Snapping** (`canvas/snap.rs`): it snaps min/max/center/anchor to nine points (corners, edge midpoints, center) of the
   doll rect and of every "align basis" slot, within a 10 px tolerance, and draws red guide lines.
4. **Context-sensitive status bar hints**: the bottom bar shows the shortcuts that apply to the current canvas state (idle,
   hovering the active slot, dragging, resizing). Cheap to build, and it helps a lot with discoverability.
5. **Pivot picker widget** (`widgets/pivot_select.rs`): numeric x/y fields plus a 3×3 grid of buttons (TL, T, TR, …, C) that
   snap the pivot to a corner, edge or center. This is the standard "anchor preset" UX.
6. **Batch import**: "Add fragments from a batch of images" creates one fragment per file, with `desc` taken from the filename.
7. **Associated slots window**: for one fragment, toggle which slots list it as a candidate (with Select all / Unselect all).
8. **Candidate ordering**: candidates can be raised/lowered, and `candidates[0]` is the default for required slots.
9. **Fragment filter** by keyword (substring on `desc`) in the slot editor.
10. **Preview inside the editor**: selecting a fragment in the library while a slot is active shows that fragment in the slot
    on the canvas. It is a live "try on" without changing the saved state.
11. Recent files (last 5, eframe persistence), a bundled example project, and "Open in viewer" (it spawns the viewer binary
    with `-o <path>`).

Weak spots: no undo, no multi-select, z-order controls only in a context menu, and fragments have no thumbnail grid search
beyond keywords. Slot order in the list matches paint order, so the top of the list is the *back*. `Raise` moves an item up the
list (toward index 0), which **sends it further back visually**. That is the opposite of the Photoshop/Aseprite convention,
where the top of the layer list is in front. *Flag: verify in the GUI; the code supports this reading (`raise_in_vec` swaps
toward index 0, and the canvas and `render()` iterate from index 0).*

## 6. Viewer (PpdViewer) and color/tint

- **Viewer**: a doll dropdown, then one row per slot with **◀ label ▶** carousel buttons that cycle through candidates. Non-required
  slots include a "–" (empty) step, and required slots wrap around. **Export** writes the current composite as a PNG
  (`render_paperdoll` → `image::save_buffer`). This "carousel per slot" is the simplest possible end-user dress-up UI.
- **Color/tint: none.** `ColorType` has exactly one variant (`Rgba`). Textures are painted with `Color32::WHITE` (no
  modulation). There is no palette, no hue shift and no per-slot color. Grayscale-plus-modulate in the user's sense would be a
  new feature. Both fralonra's model and bevy's `Sprite.color` would allow a multiply tint, but multiply tint on pixel art only
  looks good on near-white or flat ramps. See the survey (§Color model) for why PixelDoll should use **palette-ramp indices**
  (LPC-style) instead of plain multiply, with grayscale→ramp as the authoring path.

## 7. CLI, runtime, bugs and limits

- **CLI:** both binaries accept only `-o/--open <file.ppd>` (clap). There is **no headless export or batch CLI**.
- **bevy-paperdoll** (`src/asset.rs`): an `AssetLoader` for `.ppd`. `create_paperdoll(doll_id)` returns an id, and
  `slot_use_next/prev/index/fragment/empty` change selections and **re-bake a single texture** via `render()`. It never uses
  per-piece sprites. That is simple, but it means a full CPU re-composite on every equipment change, and it inherits the
  constrained-slot bug.
- **Bugs/limits found:**
  1. Constrained slots: there is no resampling in `render()`, so the output is corrupt when the fragment size ≠ the slot size
     (the editor shows it correctly, so the editor and export disagree).
  2. Positions are `f32` but are truncated with `as isize` when composited, and canvas drags store sub-pixel anchors
     (`0.2765808`). That causes off-by-one placement. **PixelDoll must use integer pixel coordinates everywhere.**
  3. The builder panics on invalid ids instead of returning `Result`.
  4. JPEG export of RGBA fails.
  5. Raise/Lower semantics are inverted relative to common layer UIs (see §5).
  6. No animation, frames, directions, body types, compatibility rules, credits/licensing, or per-slot multiple layers. Hair
     behind *and* in front of the head needs two separate slots, with nothing linking them.
  7. Single-threaded CPU blend in u8 math. Fine for stills, but it would not scale to 8 directions × N animations × M frames.

## 8. What PixelDoll should copy vs. avoid

**Copy**

- The three-entity vocabulary, extended: **Doll/Base** (canvas + slots + z), **Slot** (named attach region, required flag,
  ordered candidates), **Fragment/Item layer** (image + pivot). Keep `candidates[0]` as the default for required slots.
- **Engine-agnostic draw list** (`analyse` → `RenderMaterial`) as well as a baked composite. PixelDoll's manifest should
  describe the pieces, and the importers decide whether to bake.
- **Pivot ↔ anchor attachment** for items that are *not* full-frame (weapons and held items in a hand slot, hats), with a
  **per-frame** anchor in PixelDoll's case (hand/head positions move every frame).
- Editor UX: slot rows with visibility/lock/snap toggles, a 3×3 pivot preset picker, snapping guides, batch import,
  context-sensitive hint bar, live "try on" preview, a viewer-style carousel for quick dressing, and a bundled example
  project.
- Action-queue architecture. In Svelte this maps to a command store, which gives **undo/redo** almost for free.

**Avoid**

- Float coordinates, list-position-only z-order, stretch-to-slot ("constrained") for pixel art (never resample pixel art),
  renaming assets on save, YAML+tar, and panicking APIs.
- Treating a slot as having a single z. PixelDoll needs **items with multiple layers at different z** (LPC `layer_1..9`,
  Picrew front/back hair), plus per-direction overrides.
