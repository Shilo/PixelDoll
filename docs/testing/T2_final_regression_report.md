# T2 final regression report: PixelDoll Studio MVP (2026-10-21)

Tester and fixer: T2. Build under test: `main` @ 32b6313 plus the T2 edits listed in §6 (not committed).
**PixelLab spend: 37.8 gens** (budget 40). Balance went from 961 to 923.

## Method

- **Playwright, fresh contexts.** Each context has its own IndexedDB and never touches a shared queue. Tested the demo with no
  key on :5173.
  - Sizes: desktop 1440×900, tablet 768×1024 @2×, phone 375×812 @2×, landscape 812×375 @2×, narrow 320×568 @2×.
  - Both dark and light themes.
- **Automatic audit** of every screen: welcome, studio, the export, create, connect and new-item sheets, and the moves and
  colors tabs.
  - Checks: horizontal overflow, controls off-screen, touch targets under 44 px on touch devices, page errors.
  - Script: `scratchpad/t2_audit.mjs`.
  - Screenshots: `img/t2_<screen>_<device>_<theme>.png`, 90 files.
- **Keyboard-only and accessibility-tree pass** (`t2_kbd.mjs`, `t2_menu.mjs`), plus a check of the sheet-to-sheet hand-offs and
  the demo copy (`t2_flows.mjs`).
- **Live run in the built-in browser on the "Ranger" rig.**
  - **Correction to the brief:** the Ranger with helmet **and** sword is in **:5175's** IndexedDB (B9's origin), not :5173's.
    :5173 only has B7's older helmet-only copy.
  - I added the launch config `app-dev-b9` (port 5175) and worked on that origin directly. No data was copied between origins.
  - I used the dev-key button; the key was never printed.
  - The Browser pane was hidden, which throttles the queue leader to about one tick per minute. I drove `__queue.tick()` from
    an in-page loop (fetch, then a 1 s timer) so the run finished in about 13 minutes.
- **Scripts re-run:** `app/scripts/e2e-studio.mjs`, `app/scripts/shoot-mvp.mjs` (156 `mvp_*` shots), `npm run check`,
  `npm run build`, `npm run selftest`.

## 1. T1 issues: regression table

Every issue that B10 marked fixed was re-tested at every size, in dark and light.

| T1 # | Issue | Result | Evidence |
|---|---|---|---|
| P0-1 | A sheet-to-sheet hand-off closed everything | **Pass**, all four paths | Create without a key → Connect (e2e). New item (demo) → Create your character → "New character". Activity → Connect → "Connect PixelLab". Make without a key (demo copy) → "Connect PixelLab" (`t2_flows`). |
| P1-1 | Demo cross punch broken, export blank north row | **Pass** | Cross punch is south only, E/N/W disabled, and the note "Wizard hat isn't made for…" appears (e2e). The Export sheet shows its notice (`t2_export_desktop_dark.png`). Manifest `directions` is per move (Ranger: `hurt:6:south/east/north/west`). |
| P1-2 | Phone and landscape had no Outfits, Random look or Redo | **Pass** | e2e phone and landscape steps. Screenshots `t2_studio_phone_*`, `t2_studio_landscape_*`. |
| P1-3 | Tablet portrait drawer covered the stage | **Pass** | Stacked layout; e2e tablet step; `t2_studio_tablet_light.png`. |
| P2-1 | Tapping a row toggled wear | **Pass** | e2e; also Enter on the row by keyboard. |
| P2-2 | Browser back left the app | **Pass** | e2e. |
| P2-3 | Focus not returned to the opener | **Pass** | e2e; Esc after Export → focus on **Export**; Esc in the menu → focus on the character button. |
| P2-4 | Touch targets under 44 px | **Pass with one exception** | T2 fixed three new findings (§6). Still open: direction S/E/N/W are **40×44** on phone, landscape and narrow. B10 chose this so the preview bar fits a 375 px stage (P3). |
| P2-5 | 320×568 Welcome buttons below the fold | **Pass** | Create bottom at y=442, demo at y=504 (viewport 568) (`t2_welcome_narrow_light.png`). |
| P2-6 | Phaser and PNG exports had no README | **Pass** | All four zips have a root `README.txt`. Plus `godot/`, `phaser/`, `unity/` and `generic/` READMEs. |
| P2-7 | CREDITS rows duplicated | **Pass** | Ranger CREDITS: 54 rows, one per PixelLab job, no duplicate jobIds. Selftest for the demo. |
| P2-8 | Export counts and names didn't match the UI | **Pass** | "2 outfits + your current look"; `baked/base-only/` (no `baked/bare/`). |
| P2-9 | Internal `s2_adventurer` name leaked | **Pass** | Not in any of the four zips. Stage label is "Adventurer, walk, facing south, wearing …". |
| P2-10 | Odd material names | **Pass** | Leather / **Outline**, Metal / Detail (`t2_studio_tablet_light.png`, Ranger inspector). |
| P2-11 | Add a move on older rigs | **Pass** | Dev rig hero48 (:5173), Moves tab: "Moves can be added to characters made from now on.", no button. |
| P2-12 | Add a move total cost unclear | **Pass, seen live** | Button "Add Hurt · 29 gens". Footer "About 10 min · body 11 + items 18 gens". "✓ Slash · added" is disabled (`t2_1_addmove_hurt_cost.jpg`). |
| P2-13 | Create estimate moved | **Pass** | "Create · 35–50 gens", footnote "(failed checks re-roll)". |
| P2-14 | Demo copy name, rename, badge | **Pass** | "Adventurer copy". Rename… is in the menu. 0 Demo badges on the copy. Stored with `origin: 'studio'`. |
| P2-15 | Item name guess | **Pass** | "a straw farmer hat" → placeholder "Straw farmer hat". |
| P2-16 | Hide chips didn't read as toggles | **Pass** | Check-when-on plus the hint line "Checked items are hidden while … is worn". |
| T1 P3 | Dev rigs listed in the character menu | **Fixed by T2** | §3. |
| T1 P3 | "Use dev key" in production | **Pass** | `dist/` has no "Use dev key" or `__dev/pixellab-key`. |

**No regressions.** Overflow was 0 px in every screen, size and theme. There were 0 page errors. Nothing is off-screen except
the slot-chip scroller, which scrolls by design.

## 2. Live: Add a move on Ranger (:5175)

| Step | Result |
|---|---|
| Sheet before spending | Moves: Slash · added (disabled), Cast, Hurt, Death. Items: Iron Knight Helmet 9 gens, Steel Sword 9 gens. **Hurt: 29 gens** (body 11 + items 18; 6 frames × 3 directions, west mirrored). Cast and Death: 30 gens. Hurt was picked as the cheapest. |
| Run | Body: 3 raw skeleton-v3 calls (3 gens each) + 18 estimates (0.1 each). Items: helmet 3 + 2 re-rolls (east, south); sword 3 + 1 re-roll (east). All 30 jobs done, 0 failed. About 13 min wall time with the manual pump. |
| **Cost** | **37.8 gens actual vs 29 shown.** The 8.8 extra is 3 automatic re-rolls × 3 gens (and rounding). The sheet says "failed checks re-roll once", but the button does not show a range. |
| Body QA (freeze gate) | hurt S/E/N: adherence 0.63 / 0.98 / 0.49 px, feet drift 0, border 0, palette fit 1.00, stray 0, 0 fails. `baseHash` updated, and both items moved to it. |
| Items re-posed | Helmet and sword now have hurt S/E/N cells. West is mirrored at compose time. The sword stays a 96×96 oversize layer with pivot 48,75. Sword north f0 and f5 were `repaired` (the S5 dropped-item repair). |
| QA status (UI) | Both items show **"Needs a look"**. Helmet: H4 / stray px (B9's known south-slash occlusion). Sword: "Some body pixels were changed" (key outside 0.029 > 0.02) and "changes size between frames" (area CV 0.173). These are B9's own aggregate numbers, but B9 reported the sword as "Clean"; see known issue K3. |
| Visual check (all directions) | `t2_3_ranger_hurt_alldirs.png` (6 frames × S/E/N/W) and `t2_5_studio_hurt_alldirs.jpg` (Studio grid). Helmet stays seated in every frame. The sword stays in the right hand and follows the flinch. West mirrors correctly. **Defect:** south f3 keeps a small detached gray blade smear under the sword (`t2_4_hurt_south_detail.png`). |

### Export from the Studio

Godot and Phaser. The zips were captured in-page from the Export button's blob, so no file was downloaded.

| Check | Godot `ranger-godot.pixeldoll.zip` (224 KB, 34 files) | Phaser `ranger-phaser.pixeldoll.zip` (228 KB, 45 files) |
|---|---|---|
| README | Root `README.txt`: quick start, folder map, "Moves: idle (4), walk (8), slash (8), hurt (6)", nearest-neighbor note. Plus `godot/README.txt` (Nearest, snap, `*.json` export filter). | Root README plus `phaser/README.txt` (pixelArt/roundPixels, `loadPaperdoll`, http not file://) |
| Directions per move | `rig.animations[].directions`: idle, walk, slash and hurt all list `south/east/north/west` | same |
| Oversize sword | `steel_sword.fg` and `.bg`: `cell 96×96`, `pivot 48,75`. Sheet `hurt.png` is 576×384 (6×96 by 4×96). Body is 384×256 (64 px). `export.bakedCell` 96×96, `bakedPivot` 48,75. | Atlas `steel_sword_fg_hurt.json`: 24 frames of 96×96, pivot (0.5, 0.78125) = 75/96 |
| Hurt files | layers for body, helmet, sword fg and sword bg, plus `baked/current` and `baked/default` | the same, plus 4 `phaser/*_hurt.json` |
| Credits | `CREDITS.csv`: 54 rows (base 23, helmet 18, sword 13). Each has its endpoint, jobId, seed and prompt, and lists hurt among its sheets. The new hurt calls are included. | same |
| Export sheet | "Includes 4 directions · 4 moves · 2 items · 1 outfit + your current look". No warnings, which is correct because every move has all 4 views. | same |

## 3. Developer rigs hidden (task 3)

- `StoredProject.origin?: 'studio' | 'dev'`:
  - `createCharacter` and `saveCopy` write `'studio'`.
  - `addMove`, `saveItem` and rename re-read the record, so the marker survives them.
- **Migration on read:** `originOf(rec)` in `lib/store/project.ts`. Records without `origin` count as Studio when they have
  `character` (v1.3 Studio create) or an empty `rigQa.pivotFrom` (demo copy). Anything else (M2 freezes) counts as dev.
  - Nothing is rewritten.
  - A selftest covers the four cases.
- **Character menu:** shows the demo plus Studio rigs. Dev rigs sit in a collapsed "Developer rigs (N)" disclosure below
  "Developer pages". It renders only when there are any, so normal users never see it.
- **On :5173:** the list shows "Adventurer (demo), Ranger". hero48, s4skel, hero48f, s1-e2 and base are under Developer rigs,
  and opening hero48 from there works.
- **e2e:** a seeded dev record is not in the list and is hidden in the closed group.
- **Ceiling:** a pre-v1.3 character made in the Studio before this change has the same record shape as an M2 freeze, so it
  moves to Developer rigs. This affects only B6's "Sturdy young" on :5174.

## 4. Accessibility spot-check

| Check | Result |
|---|---|
| Welcome tab order | theme → Create your character → Try the demo → PixelLab link. All show a 2 px ring: #4DA3FF in dark, #0071E3 in light. |
| Studio tab order (desktop) | Wardrobe toggle → character → Connect → theme → Export → Inspector → Random look → New head item → items (row, then wear check) … → outfits → Play → move picker → S/E/N/W → All directions → zoom → background → Item/Colors/Moves. The order is logical, and every stop has a visible ring. |
| Enter / Space | Enter on a wardrobe row wears the item. Enter on Export opens the sheet. |
| Esc | Closes every sheet and the character menu, and focus returns to the opener. |
| **Arrow keys in segmented controls** | **Failed before T2: there was no arrow handling.** Fixed (§6). ArrowRight on S selects and focuses E, and End goes to W. Inspector tabs, Export engines, the Create skin and build controls, the phone and landscape tab bars, and the slot chips all move with arrows plus Home/End. Selection follows focus. |
| Character menu (`role=menu`) | Opening it now focuses the current character, ArrowUp/ArrowDown/Home/End move between rows, and Esc returns to the button. Before T2 focus stayed on the button and arrows did nothing. |
| Accessibility tree | 0 unnamed buttons, links, checkboxes, radios, tabs, comboboxes or textboxes. There are landmarks: banner, complementary "Wardrobe" > navigation > regions per slot with h3. Toolbar buttons are named ("Undo Wear Wizard hat", "Switch to light mode", "Inspector" [pressed]). The stage has an image label. |
| Focus visible | Dark and light: `t2_a11y_focus_seg_dark.png`, `t2_a11y_focus_seg_light.png`, `t2_a11y_focus_row_dark.png`, `t2_a11y_focus_export_dark.png`. |
| Minor | The Export sheet's initial focus is **Cancel**, because there is no text field. Apple would focus the default action (P3). |

## 5. Checks

| Check | Result |
|---|---|
| `node app/scripts/e2e-studio.mjs` | **all passed**: 18 steps, including two new T2 steps (arrow keys; dev rigs hidden) |
| `node app/scripts/shoot-mvp.mjs` | 156 shots. The only failures are the 2 expected `alldirs_narrow`, where the toggle is hidden at 320 px by design. |
| `npm run check` | 0 errors, 0 warnings (216 files) |
| `npm run selftest` | all passed (new `originOf` asserts in `studio/model`) |
| `npm run build` | ok, 424 KB JS / 146 KB gz. No dev key in `dist/`. |

## 6. T2 changes (uncommitted)

| File | Change |
|---|---|
| `lib/store/project.ts` | `origin` field + `originOf()` migration-on-read |
| `studio/create.ts` | `origin: 'studio'` on create and demo copy. The Add-a-move item progress is clamped: re-rolls pushed it to "8/6". |
| `studio/state.svelte.ts` | `ProjectRef.dev` from `originOf` |
| `studio/Toolbar.svelte` | Main list without dev rigs, plus the collapsed "Developer rigs" group. The menu focuses the current character on open. |
| `studio/Studio.svelte` | One window-level handler: arrow keys and Home/End in `tablist`, `radiogroup` and `.seg[role=group]` (select) and in `role=menu` (focus only) |
| `studio/PhonePanel.svelte` | The selected slot chip scrolls into view. On a 375 px phone, "Body" was half under the Random button (`t2_6_phone_selected_chip_in_view.png`). |
| `studio/studio.css` | Touch: Details summaries were 29 → 44 px. Connect "Get a key" was 18 → 44 px. The Welcome "PixelLab" link was 40 → 44 px. Plus the dev-rigs disclosure styles. |
| `studio/model.ts` | `originOf` selftest |
| `app/scripts/e2e-studio.mjs` | The two T2 steps |
| `.claude/launch.json` | `app-dev-b9` (:5175 = the origin holding the full Ranger) |

## 7. Remaining known issues (prioritized)

| # | Pri | Issue | Suggested fix |
|---|---|---|---|
| K1 | **P1** | **A backgrounded tab stalls generation.** After about 5 min hidden, Chrome's intensive throttling cuts the queue leader's `setInterval` to about 1 tick per minute. That is exactly when a user follows "You can keep working" and switches tabs during a 10-minute create or move. It was seen live here; the hidden pane gave about 0.5 ticks per second only with a manual pump. | Run polling from a dedicated Worker, where timers are not intensively throttled. Alternatively re-tick on `visibilitychange`, and say "Keep this tab open" on long runs. |
| K2 | P2 | **Spend exceeds the shown price without saying so.** The move showed 29 and cost 37.8 (+30 %). Item re-rolls are automatic. | Show a range like Create does ("29–38 gens"). The Done step should show the actual spend. |
| K3 | P2 | **The sword reads "Needs a look"** (key outside 0.029 > 0.02, area CV 0.173), although B9 reported it "Clean" with the same numbers. Either the status was recomputed with stricter thresholds when the hurt cells merged, or B9's verdict used other limits. | Pick one held-item threshold set (area CV is naturally high for a rotating blade) and recompute the status once per accept or move. |
| K4 | P2 | **Hurt south f3: a detached gray blade smear** stays under the sword (`t2_4`). The held cleanup keeps components within 3 px of the wrist or the main component. | Drop components that are under about 10 % of the main blade's area and not attached to the grip. Or re-roll that direction when stray px > N. |
| K5 | P3 | Direction segments are 40×44 on phones (HIG minimum 44×44). | Let the move picker shrink further, or show icons only below 400 px. |
| K6 | P3 | On a short phone viewport (465×690) with a 96 px oversize character, the all-directions grid's bottom labels sit under the floating preview bar (seen in the Browser pane on Ranger). 375×812 is fine. | Pad the stage bottom by the bar height when `ui.all`. |
| K7 | P3 | Export opens with focus on Cancel. The Add-a-move Done screen has no summary: spend, QA, "View hurt". | Focus the Download button. Add "Spent 37.8 gens · 2 items need a look". |
| K8 | P3 | Pre-v1.3 Studio characters are classified as dev rigs (§3 ceiling). | If needed, a one-off "Show in my characters" action under Developer rigs. |
| K9 | P3 | Carried over: no offline banner, triple balance call on Connect, `off_hand` held route untested (B9). | — |

## 8. Apple-likeness and intuitiveness

**8.5 / 10. T1 scored 6 / 10 and predicted 8.5 after the P0/P1 fixes.**

- **Primary path:** it now just works. Create or Make without a key hands over to Connect and back.
- **One app at every size:** Outfits, Random look and Redo are on phones, and tablet portrait stacks cleanly.
- **The demo no longer shows broken layering.** Every spending button names its price. Keyboard users can now drive
  segmented controls and the menu the way macOS and iOS users expect.
- **Add a move feels first-party.** You pick a chip, see "body 11 + items 18", tap once and keep working. Your helmet and sword
  follow the new move in every direction.
- **What keeps it from 9+:**
  - K1: a long job silently slows down when you switch tabs.
  - K2: the final cost can be about 30 % above the price on the button.
  - QA verdicts ("Needs a look") on items that look fine, which erodes trust in the badge.
