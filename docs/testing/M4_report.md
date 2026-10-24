# M4 dress-up: test report (B5)

Date: 2026-10-21. Builder: B5. Route: `#/m4`. Tested live in the Claude built-in browser (dev server `app-dev`, Vite at :5173),
at 1400×1000 and on the 375×812 mobile preset. `npm run check` (0 errors, 0 warnings), `npm run build` and `npm run selftest`
(node, plus the same suite in the browser) all pass.

## What was built

| File | Contents |
|---|---|
| `app/src/lib/dress/palette.ts` | OKLab conversion; `colorCounts`; `deriveRamps` (weighted k-means in an OKLab hue space; near-neutral darks and claimed colors left out) and `autoRamps` (largest k ≤ 4 whose ramps stay ≥ 0.15 apart); `variantRamp` (hue of the pick, source lightness steps shifted to the pick's mean, chroma scaled, gamut-clipped by chroma); `tintRamp` (grayscale × multiply, for comparison); `indexImg`/`applyIndex` (precomputed per-image color index, then a table write); `hueName`. `selfTest()`. |
| `app/src/lib/dress/dress.ts` | `deriveMaterials` (per item, base first, ramps disjoint across materials), `variantOf` (follows `linkTo`), `variantRampOf` (stored ramp, swatch name, `#rrggbb` or `tint:<…>`), `storeVariants`, `recolor(project, variants)` (same cell hashes, so `compose` is unchanged), `randomOutfit`, `coverageGaps`, `edges`. `selfTest()`. |
| `app/src/lib/dress/project.ts` | Sources = fixtures + every IndexedDB `projects` record that holds a `pixeldoll/1` manifest (M2 rigs; M3 items when B4 saves them; loaded with B4's `store/project.ts` `loadProject`). Saving writes `materials`, `presets`, slot `zOverrides`, item `hides` and the current outfit back into the record (re-read right before the write so concurrent M3 item writes survive). Fixtures get a side record `projects/dress-fixture:<name>`. |
| `app/src/ui/M4.svelte` | Slot list with ‹ › carousel + picker, badges (hidden / stale / missing cells), editable `hides`; one large preview (direction buttons, animation select, play/pause/step, integer zoom 1–10×, pixelated) plus all directions at 2× on the **same clock**; draw-order table for the current cell with z inputs that write a sparse override (scope: all / this dir / dir + anim / this cell) and a list of overrides; "layer outlines" debug overlay; per-material swatches (12 presets + source + color picker), `linkTo`, editable labels, per-item k (auto / 1–4); "grayscale × tint" toggle; presets (save / load / delete); randomize; export zip. Autosaves (debounced) after each edit, not on open. |
| `app/scripts/build-fixture-s2.ts` → `app/public/fixtures/s2/` (92 KB) | S2 chroma fixture, see below. |
| Shared edits | `App.svelte` (route), `lib/selftests.ts` (2 entries), `lib/export/generic.ts` (baked sheets use `recolor(p, preset.variants)`). |

## Fixture `s2` (real PixelLab output only)

- Base: S2's `b48` clothed character, **48 → 64 padded** (x+8, y+16, never rescaled; the build script checks the padding is
  byte-identical to the cells S2 sent to PixelLab). Walk (8) S/E/N + cross-punch (6) S/E; west mirrors east. Pivot (32, 64).
- Items (green chroma key, `edit-animation-v2`, 16 cells per call; second calls anchor-cell `edit-animation-v2` or
  `transfer-outfit-v2` for walk N + punch S): steel helmet (hides hair), wizard hat (`hides: []`), red cape, steel longsword
  (plus punch E), from S2's `s2_x4` runs.
- **New generations (40 gens, B5):** S2 had no hair and no chest/boots on the b48 base (those were on the S1 base), so I ran the
  S2 script for `b5_hair48_A/Ba` (short messy brown hair) and `b5_chest48_A/Ba` (leather vest): 4 calls × 10 gens, all clean
  (0 specks, 0 pinholes, key kept 0.985–0.998, palette distance to the design call 10.7–12.8). One parallel attempt got
  HTTP 500 twice right away; sequential calls worked. Added `hair` to `WHAT` in `spikes/api/lib/chroma.mjs`.
- Coverage gaps are real data and the UI shows them: cross-punch east exists only for the sword; the wizard hat has walk S/E only.
- Colors that an item shares with an earlier item are nudged by ±1 in blue so ramps can stay disjoint (1 color, helmet).

## Tests and results

| Test | Result |
|---|---|
| Load fixture s2 / s1 / M2 IndexedDB rigs | All load. s2: 7 items, materials derived in 6 ms. M2 rigs `rig-af339…` (hero48), `rig-403…`, `rig-edc…` open (base only, no M3 items in IndexedDB yet). Opening writes nothing; a recolor writes `materials` + `dress` into the rig record and keeps its cells and skeletons. |
| Equip combinations, carousel, randomize | OK. ![](https://github.com/Shilo/PixelDoll/raw/v0.1.0/docs/testing/img/m4_adventurer.png) ![](https://github.com/Shilo/PixelDoll/raw/v0.1.0/docs/testing/img/m4_random.png) |
| All directions in sync | One `frame` state drives the large view and the four small views (same playlist cell in every view by construction). |
| Hides | Helmet hides hair (default). Unticking `hair` on the helmet shows the hair poking out under it (![](https://github.com/Shilo/PixelDoll/raw/v0.1.0/docs/testing/img/m4_hides_off.png)); the wizard hat (`hides: []`) shows the hair under the brim, and its missing north cells show bare hair in north (![](https://github.com/Shilo/PixelDoll/raw/v0.1.0/docs/testing/img/m4_wizard_hair.png)). |
| **z overrides: cape vs sword** | **Finding:** the fg/bg silhouette split puts the blade (outside the body) into `main_hand.bg` z 1, *under* `back.bg` z 4, so the cape hides 44–60 blade px in every south walk cell (3–8 px east/west). In north, sword fg never overlaps the cape (0–1 px per cell); the cape already covers the sword correctly, so the architecture's example override (`main_hand` fg z 85 on north) changes 0 px here. Fix: sparse override `main_hand.bg` z 5 for south, east, west (north keeps z 1). Set through the UI: 57 px changed in the tested south cell (![before](https://github.com/Shilo/PixelDoll/raw/v0.1.0/docs/testing/img/m4_south_before.png) ![after](https://github.com/Shilo/PixelDoll/raw/v0.1.0/docs/testing/img/m4_south_override.png)). The fixture now ships these three overrides. |
| Recolor (ramp swap) | Cape azure, vest moss (its olive outline material `linkTo` the vest), hair gold, shirt+shorts teal, skin `#8d5524` from the picker, wizard hat `linkTo` cape: ![](https://github.com/Shilo/PixelDoll/raw/v0.1.0/docs/testing/img/m4_recolour.png). Exact: in node over every cell of the fixture, 0 colors outside source ∪ variant ramps (3 runs). Recolor 2–4 ms + 1–3 ms state snapshot per change in a visible tab; 2 ms in node. |
| Grayscale × tint (compare) | Same picks as multiply: ![](https://github.com/Shilo/PixelDoll/raw/v0.1.0/docs/testing/img/m4_tint.png). Darker and flatter; gold on dark-brown hair stays dark brown (multiply cannot lighten), skin goes muddy. Ramp swap wins for pixel art; tint stays an engine option. |
| Base materials (skin vs t-shirt vs shorts) | Auto finds 2 base materials: skin and **one gray ramp for shirt + shorts** (same neutral hue). k = 3 splits skin into shade/highlight; k = 4 separates shirt from shorts only partly and also splits skin (![](https://github.com/Shilo/PixelDoll/raw/v0.1.0/docs/testing/img/m4_base_k4.png)). Exact-color materials cannot separate regions that share colors. |
| Layer outlines toggle | Edge pixels of every drawn layer in its slot color: ![](https://github.com/Shilo/PixelDoll/raw/v0.1.0/docs/testing/img/m4_outlines.png) |
| Reload persistence | After reload: same project, outfit, variants, `linkTo`s, overrides and presets; the large preview at the same cell is **pixel-identical**. |
| Presets | Save "Teal ranger", load, delete: OK; stored in the project (fixture side record or rig record). |
| Export with variants | In-page `exportFiles` with presets = current + saved: 150 files, 0 errors, 0 warnings. `manifest.json` has the materials with their variant ramps and `linkTo`, and every preset's `variants`; layer sheets keep the source ramp; `baked/current/walk.png` holds the azure cape ramp and no source cape color; `baked/adventurer/walk.png` keeps the source ramp. |
| Mobile 375 px | Panels stack; no horizontal page scroll (only the zoomed canvas scrolls inside its box). ![](https://github.com/Shilo/PixelDoll/raw/v0.1.0/docs/testing/img/m4_mobile.jpg) |

## Bugs found and fixed while testing

1. Coverage gaps listed `cross-punch/north`, which the rig has no base cells for → gaps now count only where the base has cells.
2. Recolor/compose over the deep `$state` manifest proxy took 0.8–7.5 s per change → `recolor` now runs on a
   `$state.snapshot` (≈ 3 ms). The multi-second numbers were measured while another agent's tab hid this pane; visible-tab
   timings are the ones above.
3. Tinted dark outlines (red cape outline, C 0.04–0.1) were left out as "outline" and stayed red around a recolored blue cape →
   only near-neutral darks (L < 0.25 and C < 0.035) are left out now.
4. Randomize gave gray/ink skin → base materials with a red/orange hue draw from 6 skin tones.
5. The "grayscale × tint" checkbox did not reflect saved `tint:` variants after reload → initialized from the variants.
6. The autosave fired on open and would have written into M2's rig record without an edit → skipped until the first change.

## Gaps and open points

- **Shirt vs shorts (base materials).** The b48 base draws both in the same gray ramp, so no exact-color swap can tell them apart.
  This needs distinct ramps at generation (`target_palette` per region on the base call) or a spatial region mask; noted for A1 (§6).
- Materials are clustered by **hue** (lightness at 0.3 weight), not "by OKLab lightness" as architecture v1.2 §6 says; lightness
  clustering split shading ramps into separate materials. Layer pixels are not snapped to ramps here (M3's job); a material is
  exactly the set of colors present.
- Engines: the Godot/Phaser/Unity glue does not apply `materials`/`variants` at runtime (no swap shader yet); baked sheets are the
  only colored output. Variants generated in tint mode stay in `material.variants` once used (harmless clutter).
- Hides are still taken from hidden items too (compose `ponytail:`); not hit by this fixture.
- Data gaps: no idle in the b48 base; cross-punch east only for the sword; the wizard hat lacks north and punch cells. The punch
  sword switches hands between clips (S2 finding), visible in the punch preview.
- Not tested: an M3-made project with items (B4 had not saved items to IndexedDB yet); the export zip download itself (the
  in-page export result was checked instead, so no file was downloaded).
