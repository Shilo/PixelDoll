# T1 UX / QA report: PixelDoll Studio (2026-10-21)

Tester: T1 (independent, did not build the app). Report only, no code changed. Build under test: `main` @ 2ef5a18 plus builder
B9's uncommitted edits, which were hot-reloading while I tested (lib/items, lib/rig, studio). Two numbers moved under me (Create
cost 45 → 35 gens, wardrobe button labels). Re-check anything marked "(moving)" after B9 lands.

Method:
- Playwright 1.64 (fresh browser context per run, so its own IndexedDB and no shared queue) at 1920×1080, 1440×900, 1024×768,
  tablet 768×1024 @2× touch, phone 375×812 @2× touch, SE 375×667, narrow 320×568, landscape 812×375. Dark and light.
- Claude Browser pane (`app-dev`, :5173, follower tab) for the stored v1.3 character "Ranger" and its Add-a-move sheet.
- Accessibility trees (`ariaSnapshot` / `read_page`), automatic checks (horizontal overflow, touch targets under 44 px,
  off-screen controls, text contrast, focus ring, tab order), and Esc, back, reload, offline (`setOffline`) and invalid key.
  For the invalid key, `*.pixellab.ai` was answered locally with a mocked 401, so no key left the machine.
- All four exports downloaded and unzipped (Godot, Phaser, Unity, PNG + JSON).
- **0 PixelLab generations spent.** I never pressed a spending button with a real key.

Screenshots: `docs/testing/img/t1_<screen>_<device>[_light].png`. Screens: welcome, studio, menu, alldirs, colours, moves, item,
wardrobe, export, exportdetails, create, newitem, connect, activity. Devices: d1920, d1440, d1024, tablet, phone, land, narrow.
There are also flow-specific shots, cited by name below.

---

## P0: blockers

### P0-1 Switching from one sheet to another closes everything. Create or Make without a key silently does nothing.

**Repro (all sizes, fresh profile, no key):**
1. Open the app and tap **Create your character** on the Welcome screen.
2. Type "a cheerful elf archer" and press **Create · 35 gens**.
3. The sheet closes. No Connect sheet appears, nothing is queued (`creating.spec = null`), and nothing explains why.

Other paths with the same result:
- **Make · 20 gens** in New item (own character, no key).
- New item (demo) → **Create your character**.
- Activity → **Connect**.

In each case the next sheet never opens.

Screenshots: `t1_welcome_create_d1440.png` → `t1_create_nokey_result_d1440.png`, `t1_create_nokey_result_phone.png`.

**Impact:** this is the first-run happy path ("Create → Connect → back to Create", D1 §5.1). A new user who has no key yet
can never create anything. The only way through is to find **Connect** in the toolbar or menu first.

**Root cause:** `studio/Sheet.svelte`.
- The `$effect` cleanup calls `dlg.close()` when the old sheet unmounts.
- `close` is dispatched asynchronously and fires the old sheet's `onclose={() => (ui.sheet = null)}`.
- That happens after `withKey()` / the button has already set `ui.sheet = 'connect'` (or `'create'`), so the new value is
  wiped out.

**Fix:** pick one:
- (a) In the cleanup, set a `closing` flag before `dlg.close()` and make the `close` handler return early when it is set.
- (b) Drop `onclose` from the native `close` event and keep it only for `cancel`, backdrop and the button.
- (c) Make `onclose` conditional, so it only nulls a sheet that is still current: `if (ui.sheet === myId) ui.sheet = null`.

Add an e2e step: Create without key → expect `dialog h2 = "Connect PixelLab"`.

---

## P1: major

### P1-1 The demo's second move (Cross punch) looks broken, and the export ships it

**Repro:** Demo → Move: **Cross punch** → face E or W, or open All directions.

What happens:
- East and west show a bald, undressed body. The vest, cape, hair and helmet vanish, and only the sword stays.
- **North is an empty cell** with no explanation. The Moves tab says "3 directions", but N stays clickable.
- The baked export has a **blank north row** and a **doubled sword blade** (frame 5 E/W).
- The wizard hat also has no `walk/north` frames, so it disappears when the character faces north (item Details: "No frames for
  walk/north, cross-punch/south, cross-punch/east").

Screenshots: `t1_punch_alldirs_d1440.png`, `t1_export_baked_crosspunch_x3.png`, `t1_tablet_drawer_after_tap.png` (hat N empty),
`t1_item_details_d1440.png`.

**Impact:** the demo is the product's first impression and the first thing a dev imports. It suggests the layering does not
work.

**Fix:**
- Drop Cross punch from the bundled demo, or re-make the demo items for it.
- In the UI, disable or annotate directions a move doesn't have ("No north view for this move · West is mirrored").
- In the inspector, mark items that have no frames for the current move ("Not made for Cross punch yet · Make it · N gens").
- In the manifest, give each animation its own `directions`. Make exporters skip or flag empty rows, and add a warning in the
  Export sheet.

### P1-2 Phone and phone landscape lose features: no Outfits, no Random look, no Redo

**Repro:** at 375×812 or 812×375, look for outfits.

- **Outfits:** the wardrobe has only the 8 slot chips, so you can neither save nor apply an outfit (0 matches for "Outfit").
- **Random look:** not on the Wardrobe tab.
- **Redo:** the header shows Undo only.

Screenshots: `t1_studio_phone.png`, `t1_studio_land.png`.

**Fix:**
- Add an **Outfits** chip at the end of the slot chips, or an Outfits row on the Wardrobe tab, with Save current look.
- Put Random (shuffle icon) next to the chips.
- Add Redo next to Undo. There is room once the theme switch moves into the menu on compact sizes.

### P1-3 Tablet portrait (768×1024) hides the wardrobe by default, and opening it covers the preview

**Repro:**
1. At tablet size, notice that no items are visible: only the inspector for "Leather vest" and an empty stage with the sprite at
   the bottom (`t1_studio_tablet.png`).
2. Tap the sidebar icon. The drawer opens over the stage.
3. Tap Wizard hat. It is worn, but the drawer stays open and the dim covers the character, so you can't see the result
   (`t1_tablet_drawer_after_tap.png`).

The stage also has about 450 px of dead space above the sprite.

**Fix:** pick one:
- Use the phone layout for medium portrait: stage on top, chips and tiles below, inspector as a sheet.
- Make the drawer push the stage instead of covering it, and auto-close it after a tap on touch.

At minimum, center the sprite vertically and drop the inspector into a bottom panel when `height > width`.

---

## P2: minor

| # | Issue | Repro / evidence | Suggested fix |
|---|---|---|---|
| P2-1 | **Tapping a wardrobe row toggles wear.** Clicking a worn item to look at its colors takes it off. Selecting and wearing are the same action. | Desktop: click "Steel helmet" while it is worn → helmet off, inspector shows **Wear** (`t1_flow_hide_hair.png`) | Row click = select (and wear only if not worn). Keep the trailing check as the wear/take-off toggle. Phone tiles can keep tap-to-wear because "None" exists there. |
| P2-2 | **Browser back or the Android back gesture leaves the app** while a sheet is open (sheets don't push history). | Open Export → back → `about:blank` | `history.pushState` when a sheet opens; `popstate` closes it. |
| P2-3 | **Focus is not returned** to the button that opened a sheet; it lands on `<body>`. Initial focus is on **Cancel**, not the first field (Create, New item). | Keyboard: Export → Esc → `document.activeElement = body` | Remember the opener and `.focus()` it on close. Put `autofocus` on the textarea in Create and New item (desktop only). |
| P2-4 | **Touch targets under 44 px:** direction S/E/N/W 36×40, color swatches 48×32, color picker 36×32, slot chips 40 high, landscape segmented tabs 36 high, layer-order checkbox 16×16, "PixelLab" link 45×16. | `audit` log, phone/tablet/land | `pointer: coarse` → min 44×44 (swatches 48×44, chips 44). |
| P2-5 | **320×568: the Welcome CTAs are below the fold** (Create at y=591). The hero art takes 60 % of the height. 375×667 just fits. | `t1_welcome_narrow.png` | Cap the hero at about 35 vh on short screens, or put the CTAs above the description. |
| P2-6 | **Phaser and PNG + JSON exports have no README.** Godot and Unity have one. The Phaser usage is only in the JS header comment. | unzip `adventurer-phaser.pixeldoll.zip` | Add `phaser/README.txt` (copy folder, `pixelArt: true, roundPixels: true`, `loadPaperdoll(scene, 'assets/hero/')`, ES-module note) and a root `README.txt` naming the folders. |
| P2-7 | **CREDITS.csv lists every item twice** (identical rows, e.g. `vest_leather` ×2, `cape_red` with two endpoints). | `CREDITS.csv` | Dedupe by (item, endpoint, seed), or one row per provenance step with a step column. |
| P2-8 | **Export counts and names don't match the UI:** "3 outfits" where the UI lists 2 (adds `current`). The UI's "Base only" exports as `baked/bare/`. | Export sheet + zip | Say "2 outfits + your current look". Use the outfit's display name as a slug (`base-only`). |
| P2-9 | **Internal fixture name leaks:** `s2_adventurer` in the stage's screen-reader label ("s2_adventurer, walk, facing south…"), `manifest.name`, the Godot root node and Phaser texture keys. The zip is called `adventurer-…`. | aria snapshot, `manifest.json` | Use the display name ("Adventurer") everywhere user- or dev-visible. |
| P2-10 | **Material names don't match what you see:** Leather vest → "Leather", "**Metal**" (actually the dark outline ramp); Red cape → "Cloth", "**Yellow**"; Wizard hat → "Cloth", "**Yellow**", "**Grey**". Single-step ramps render as flat swatches next to gradient ones. | `t1_colours_d1440_light.png`, `t1_item_tablet.png` | Hide outline/near-black ramps from casual recolor, or call them "Trim" / "Outline". Fall back to "Detail 1/2" rather than hue words. |
| P2-11 | **"Add a move" on older rigs** shows jargon ("made before skeleton rigs (v1.3)") and an empty footer bar, yet the button is offered. | `t1_addmove_d1440.png`, `t1_addmove_phone.png` | Hide or disable the button with a plain line: "Moves can be added to characters made from now on." |
| P2-12 | **Add a move doesn't show the total cost:** footer "**Add Cast · 21 gens**", plus a checked "Iron Knight Helmet · 9 gens" row. Is the total 21 or 30? Slash is offered again although the character already has it. | `t1_addmove_ranger_pane.jpg` | The button shows the total including checked items. Mark existing moves as "Added" and disable them. |
| P2-13 | **Cost estimate moved and may under-promise:** Create showed 45 gens, then 35 later the same session (moving). B7 measured **45.45** for a real create. | `t1_create_d1440.png` (45) vs `t1_create_phone.png` (35) | Base the estimate on the ledger median of real creates, and show a range ("≈ 35–50 gens"). |
| P2-14 | **A copy of the demo is also called "Adventurer"**, next to "Adventurer (demo)". It can't be renamed and its items still carry the **Demo** badge. | `t1_menu_two_chars_d1440.png` | Name it "Adventurer copy". Add Rename to the character menu. Drop the Demo badge on copies. |
| P2-15 | **The New item name guess is wrong:** "a straw farmer hat" → placeholder "**A Straw Farmer**". Items made in the Studio are Title Case ("Iron Knight Helmet"); the demo uses sentence case ("Steel helmet"). | `t1_newitem_own_filled_d1440.png` | Keep the head noun ("Straw farmer hat") in sentence case. |
| P2-16 | **Hide chips don't read as toggles:** "When worn, hide: Back · Hair · Head · Main hand". It isn't clear which ones are on until one is pressed, and nothing says what the setting does. | `t1_item_d1440.png` | Use a checkmark plus filled state for on, a one-line hint ("Hide these when this item is worn"), or switches. |

## P3: polish

- The Create button's accessible name is "Create ·35 gens" (missing space). New item says "Make ·20 gens". Visually fine.
- Wardrobe button names repeat or vary: "Steel helmet Steel helmet" (img alt + text) here, "Wear Iron Knight Helmet" in the
  other tab (moving). Fix: `alt=""` on the thumbnail, and use one pattern.
- Add a move: in the pane accessibility tree the item checkbox reads as "on". Verify that the `<label>` wraps the input
  correctly.
- Export: the sheet stays open after the download with no confirmation. Show "Downloaded ✓ · Show files" or close after
  download.
- Phone Item sheet puts **Done** on the leading side. HIG puts Done on the trailing side; the others use Cancel leading.
  Activity uses "Close".
- Jargon reachable without Details:
  - toolbar "Running in another tab" / "Key rejected";
  - Activity "Some animation jobs report dollars; your balance shows the real total";
  - Create "on a 64 × 64 grid".

  Behind Details (acceptable, but could be friendlier): "chroma mannequin + skeleton-posed keyframe / edit-animation-v2",
  "Parallel calls", the Endpoint table, "pivot 32,59".
- Reduced motion: the stage sprite still autoplays under `prefers-reduced-motion: reduce`. Consider starting paused, with
  Play visible.
- No offline banner: offline after load, Export still works (good), but nothing tells you. Not tested while generating.
- Connect makes 3 `GET /v2/balance` calls per attempt.
- The color picker field always shows `#808080`, whatever color is in use.
- The character menu lists dev rigs ("hero48", "s4skel", "s1-e2", "base") in an origin that has used the M2 pages. Hide
  projects without Studio data, or group them under "Developer".
- 1920×1080: the stage auto-fits to 14×, which is huge. Cap fit at about 10× or 70 % of the stage height.
- Narrow 320 px: the move picker loses its chevron and touches the S/E/N/W group (`t1_studio_narrow.png`).
- "Use dev key" sits next to Connect. It is DEV-only, so make sure it is stripped in the production build.

---

## Export from a game dev's point of view

| Check | Godot | Phaser | Unity | PNG + JSON |
|---|---|---|---|---|
| Folder layout | `manifest.json`, `CREDITS.csv`, `layers/<slot>/<item>/<role>/<anim>.png`, `baked/<outfit>/<anim>.png`, `godot/` | same + `phaser/*.json` + `PaperdollContainer.js` | same + `unity/Runtime`, `unity/Editor` (asmdefs) | `generic/<item_layer>/<anim>_<dir>_stripN.png` (108 files) |
| Instructions | `godot/README.txt` (4 lines: instance `Paperdoll.tscn`, `play_anim`, `equip`, Nearest + snap, add `*.json` to the export filter): good | **none** (header comment only) | `unity/README.txt` | **none** |
| Paths | relative `ext_resource` paths, so the folder can be dropped anywhere: good | `loadPaperdoll(scene, base)` fetches `base + 'manifest.json'`: good | n/a (compile-only per MVP) | n/a |
| `manifest.json` | 917 lines, pretty-printed, readable. Keys: format, name, app, rig (cell, pivot, directions, animations, baseItem, baseHash), materials, slots, items, presets, export | same | same | same |
| Problems | `name: "s2_adventurer"`; animations don't say which directions exist (cross-punch north is an empty row); `presets[0]` is `current` | Atlas JSON is standard TexturePacker hash; `pivot {0.5, 1}` matches rig pivot (32, 64): good | — | empty `cross-punch_north_strip6.png` files |

Sizes:
- Godot 158 KB / 41 files.
- Phaser 161 KB / 49.
- Unity 152 KB / 34.
- PNG 217 KB / 108.

The sizes on the buttons are accurate.

---

## What's great

- **Look A is well executed.** System font, quiet monochrome chrome, one blue primary (Export), consistent Lucide icons
  everywhere, color only in the art. Dark (default) and light are both clean, and the text contrast checks found nothing
  under 4.5:1 in either theme.
- **The sprite is the hero.** Integer device-pixel zoom stays crisp. The checker or plain background toggle and the
  All-directions grid ("West (mirrored)") are nice touches for both audiences.
- **Undo labels are real HIG.** "Undo Wear Wizard hat (Ctrl+Z)", "Redo Take off Wizard hat". Undo/redo is correct across
  wear, take-off and color.
- **Costs are honest.** Every spending button names its price, the Welcome screen says the demo needs no account, and Export
  says "Free · runs on this device".
- **Sheets fit each size.** Centered on desktop, bottom sheet with a grabber on phones, trailing 60 % panel in landscape with
  the character still visible. Esc closes every sheet, and nothing overflows horizontally at any size tested.
- **Removing an item asks first** ("Remove for good / Keep"). An invalid key gives a plain message ("PixelLab didn't accept
  this key.") and a "Key rejected" state in the toolbar.
- **Copy the demo body** is a clever bridge from "just looking" to "making things", and it costs nothing.
- **The exports are dev-friendly.** Relative paths, readable manifest, a Godot README that knows the real gotchas (Nearest,
  snap, JSON export filter), and Phaser 3/4 notes.

## Overall score

**Apple-likeness / intuitiveness: 6 / 10 today, about 8.5 once the P0 and P1 issues are fixed.**

- **Why it isn't higher now.** Visually this is close to a first-party Apple utility: hierarchy, restraint, iconography,
  sheets, undo wording and cost transparency are all right. But Apple's first rule is that the primary path just works.
  Today, a new user's first real action (Create → no key → Connect) silently does nothing (P0-1). The demo's second move shows
  the layering failing (P1-1).
- **Size-class gaps.** Phone users can't reach Outfits or Redo, and tablet users don't see the wardrobe. That breaks "one
  app, every size".
- **Smaller frictions.** Tap-to-select also toggles wear, jargon leaks (material "Yellow", "skeleton rigs (v1.3)",
  "Running in another tab"), and several touch targets are under 44 px.
- **What brings it up.** None of these are structural. They are a one-line Sheet fix, a demo-data cleanup plus a
  per-direction guard, and layout parity work.
