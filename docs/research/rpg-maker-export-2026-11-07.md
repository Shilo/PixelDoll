# RPG Maker export: which versions, and their exact character sprite formats

Research date: 2026-11-07. Research only: no repo edits, no PixelLab calls.

> **Implemented differently (2026-11-07, revised 2026-11-08):** the exporter (`app/src/lib/export/rpgmaker.ts`, manifest-spec
> §6.8) has one split "RPG Maker" card whose version button opens a menu: "Standard" (MZ, MV, VX Ace, VX:
> `$<character>_<outfit>.png`) or "XP" (XP, Pokémon Essentials: `<character>_<outfit>.png`), each writing only its sheets at the zip root, instead of a version choice and the §5 paths. Feet are
> anchored on the baked pivot's feet line rather than the lowest opaque pixel, so a weapon tip below the feet cannot lift the
> character; art below the feet extends the cell (a warning above 2 px). Cells are trimmed to the art, top included. Steps are
> picked by the signed lead of the left ankle along each view's facing, with managed template views taking the side view's
> phase (all 12 south, east and north bench views; the widest-spread rule of §5 got 7 of 12), instead of the foot anchors. Unite and the
> side-view battler sheet are not implemented. 2026-11-08 follow-up: WITH cannot import images; U2U is unreleased and only
> mentions MV/MZ map assets, so it is rechecked at release.
Confidence tags: **[V]** verified in engine source or an official page, **[C]** corroborated by several community sources, **[U]** unverified or single weak source.

## TL;DR

- **Support two formats and you cover five versions.**
  - **Format A, the "$ 3x4" sheet: MZ, MV, VX Ace and VX.** One PNG works unchanged in all four. All four engines slice it identically, and only the project folder differs. **[V]** (RGSS2, RGSS3, rpg_core MV and rmmz 1.1.0 source)
  - **Format B, the XP 4x4 sheet: RPG Maker XP and Pokémon Essentials.** XP is the third most-used editor on Steam today. **[V]** (RGSS1 source)
- **Do not support 2000 or 2003.** Their 24x32 cell is hard-coded, and PixelDoll's smallest output (32 px body in a 48 px frame) does not fit without downscaling. The 256-color limit is a minor issue next to that. **[V]** for the engine rule; the fit argument is my analysis.
- **Unite is possible but low priority.** It uses per-direction horizontal strips with any number of frames, so no resampling is needed. However, it was pulled from Steam, rates 3.4 on Epic, and is being replaced by U2U. **[C]**
- **No other version can take PixelDoll output.** Console and handheld versions cannot import custom images, and the 1990s PC versions are dead platforms. U2U (announced May 2026, Unity-based, no release date) is still unknown; reports say it "supports 2D assets from previous RPG Maker entries". **[U]**
- **No RPG Maker version supports 8 directions natively.** Every version uses 4 rows: down, left, right, up. **[V]**
- **Every sheet is a baked composite per outfit.** RPG Maker has no runtime layering. PixelDoll's existing `baked/<preset>` path is the input.

---

## 1. Per-version findings

Columns: whether users can import custom character sprites, the format, and how confident I am.

| Version (year, platform) | Custom char import? | Format | Confidence |
|---|---|---|---|
| RPG Tsukuru Dante 98 (1992, PC-98) | Only through built-in editors on a dead platform with no modern file pipeline | n/a | [U] |
| Super Dante (1995, SFC/Satellaview) | No (cartridge, in-app editing only) | n/a | [C] |
| Dante 98 II (1996, PC-98) | Same as Dante 98 | n/a | [U] |
| RPG Tsukuru 2 (1996, SFC) | No | n/a | [C] |
| RPG Maker 95 (1997, Win95, JP; English only as a fan translation) | Yes. One source says BMP, 256-color shared palette, 32x32 sprites, 640x480. Wikipedia says 2 frames per direction. | Not researched further; nobody ships games in it | [U] |
| "RPG Maker 97" | **Not a real product.** Wikipedia's release list has no such title. It is probably a confusion with RPG Tsukuru 95, released in 1997. | n/a | [C] |
| RPG Tsukuru 3 / "RPG Maker" (1997, PS1) | No file import. Sprites came from the separate Anime Maker, with limits; large Anime Maker sprites did not work. | n/a | [C] (Wikipedia) |
| RPG Tsukuru 4 (2000, PS1) | No | n/a | [C] |
| RPG Maker 2000 (2000, Win) | Yes | See §2.4 | [V] |
| RPG Tsukuru 5 / RPG Maker 2 (2002, PS2) | No (3D, console) | n/a | [C] |
| RPG Maker 2003 (2002 JP / 2015 Steam EN) | Yes | Same as 2000, §2.4 | [V] |
| RPG Maker 3 (2004/2005, PS2) | No (3D, console) | n/a | [C] |
| RPG Maker XP (2004, Win) | Yes | §2.2 | [V] |
| RPG Maker VX (2007, Win) | Yes | §2.1 (same PNG as MV/MZ) | [V] |
| RPG Tsukuru DS (2010) and DS+ (2011) | No file import found. Official sprite packs were later sold for MZ and WITH. | n/a | [U] |
| RPG Maker VX Ace (2011, Win) | Yes | §2.1 | [V] |
| RPG Maker MV (2015, Win/Mac) | Yes | §2.1 | [V] |
| RPG Maker Fes (2016, 3DS) | **No.** A review says it lacks custom assets and scripting. | n/a | [C] |
| RPG Maker MV Trinity / MV console (2018-2020, PS4/Switch) | **No.** Nintendo Life says there is "no way to freely integrate your own custom music, sprites or other graphical elements". | n/a | [C] |
| RPG Maker MZ (2020, Win/Mac) | Yes | §2.1 | [V] |
| RPG Maker Unite (2023, Unity Asset Store; Epic 2024) | Yes | §2.3 | [C] |
| RPG Maker WITH (Switch 2024, PS4/PS5 2025) | **No external import.** Reviews say you cannot import art made elsewhere. Assets are shared only through the in-app Maker Plaza or bought as DLC. | n/a | [C] |
| RPG Maker U2U (announced May 2026, PC, Unity) | Unknown. No release date as of the Aug 2026 Steam page. Uses HD-2D style depth maps. Reportedly "supports 2D assets from previous RPG Maker entries". | Revisit at release | [U] |

Also out of scope: RPG Tsukuru GB, Advance and α (handheld or mobile, no import), and RPG Developer Bakin (a separate 3D product).

---

## 2. Exact formats of the viable versions

### 2.1 Format A: MZ, MV, VX Ace, VX (one PNG serves all four) [V]

All four engines slice a character sheet with exactly the same code. The MZ, MV and RGSS2/RGSS3 code below is quoted from source.

- **Folder**
  - MZ/MV: `img/characters/`
  - VX/VX Ace: `Graphics/Characters/`
- **Filename prefixes:** decided by regex on the leading characters.
  - **`$`** = one character per file. Cell = `width / 3` by `height / 4`.
    - MV/MZ: `ImageManager.isBigCharacter`, regex `/^[!$]+/` containing `$`.
    - VX/Ace: `@character_name[/^[\!\$]./]` includes `$`.
  - **No `$`** = 8 characters per file, 4 across and 2 down. Cell = `width / 12` by `height / 8`. Character `index` block = `(index % 4) * 3` columns, `floor(index / 4) * 4` rows.
  - **`!`** = "object character". It turns off the vertical shift (below) and the bush (half-transparent legs) effect.
    - In VX/Ace, `!` must be the **first** character (`@character_name[0, 1] == '!'`). In MV/MZ it can be anywhere in the leading `!$` run.
    - Use `!$name` if both are ever needed. **PixelDoll characters should use `$` only.**
- **Cell size comes from the image dimensions.** It is never fixed, so native 64, 80, 128, 160 and 256 px cells all work. Width must divide by 3 and height by 4 (or 12 and 8). Tile size is separate:
  - MV: 48 px. MZ: 48 px default; v1.5.0 added a 16/24/32/48 tile setting in System 2.
  - VX/Ace: 32 px.
- **Rows (direction):** `(direction - 2) / 2`, giving **row 0 = down (2), row 1 = left (4), row 2 = right (6), row 3 = up (8)**.
- **Columns (pattern):** 3 frames, played as **1, 2, 1, 0** and repeating.
  - `_pattern` starts at 1, `updatePattern` is `(p + 1) % 4`, and `pattern()` returns `p < 3 ? p : 1`.
  - Column 1 is the standing frame. `resetPattern` and `straighten` set it to 1, and VX/Ace `@original_pattern = 1`.
- **Walk timing**
  - MV/MZ (60 fps): `animationWait = (9 - realMoveSpeed) * 3`. The counter grows by 1.5 per tick while moving. At normal speed 4 that is 15 / 1.5 = **10 ticks, about 167 ms per pattern step**, so one 4-step cycle takes about 667 ms. Dashing uses speed 5, about 133 ms.
  - VX/Ace (60 fps): threshold `18 - realMoveSpeed * 2` = 10 at speed 4, which is **7 ticks, about 117 ms per step**.
  - "Stepping" (step anime) loops the same 1, 2, 1, 0 sequence while standing still. There is **no separate idle animation**.
- **Anchor**
  - Sprite origin is **bottom-center of the cell**: MV/MZ `anchor (0.5, 1)`; VX/Ace `ox = cw / 2`, `oy = ch`.
  - That origin is placed at the tile's horizontal center and at the **tile bottom minus `shiftY`**. `shiftY` is **6 px in MV/MZ** and **4 px in VX/Ace**, and 0 for `!` objects.
  - Tall or wide cells simply grow up and outward from the feet.
- **RTP foot placement:** I measured `Actor1.png` (MZ and MV copies taken from a third-party GitHub project, so possibly not pristine RTP). Sheets are 576x384 with 48x48 cells. In all 8 characters, every frame's lowest opaque row is **row 47, the last row**: feet sit on the cell bottom. **[C]**
- **Image format:** PNG with full 8-bit alpha. MV/MZ load through the browser, and RGSS2/3 Bitmap supports PNG alpha. The MZ RTP copy was palette PNG; the MV copy was RGBA. Both work.
- **8 directions:** **not native.** `moveDiagonally` only keeps or flips to the horizontal or vertical facing. Plugins add diagonals with conflicting conventions. For example, RPG Maker Action Combat uses an `_8dir` filename suffix plus 4 extra rows and `_fN` for frame counts. Himeworks uses another layout. **[C]**
- **More than 3 frames: plugins only.** Galv's Character Frames (MV/MZ) uses a `%(N)` filename tag (for example `$hero%(8).png`). It plays frames in straight order 1..N and treats frame 2 as the idle frame. **[C]**
- **Battle sprites (optional extra, MV/MZ only): `img/sv_actors/`**
  - Grid of 9 columns by 6 rows. Cell = `width / 9` by `height / 6`, so it is also derived from the image.
  - 18 motions, 3 frames each. Motion `i` sits at column block `floor(i / 6) * 3` and row `i % 6`.
  - Motion order: walk, wait, chant, guard, damage, evade, thrust, swing, missile, skill, spell, item, escape, victory, dying, abnormal, sleep, dead.
  - Looping motions play 0, 1, 2, 1. One-shot motions play 0, 1, 2. Motion speed is 12 ticks (200 ms).
  - Battlers face **left** (west). **[V]** (rmmz_sprites `Sprite_Actor`)

### 2.2 Format B: RPG Maker XP (also Pokémon Essentials) [V]

From the RGSS1 default scripts (`Sprite_Character`, `Game_Character 1/2`):

- **Folder:** `Graphics/Characters/`. No filename prefixes: **one character per file**. An optional hue shift is set per event.
- **Cell:** `@cw = bitmap.width / 4`, `@ch = bitmap.height / 4`. The size comes from the image, so native sizes work. Tiles are 32 px. The usual RTP cell is 32x48 (128x192 sheet) **[C]**.
- **Rows:** `(direction - 2) / 2`, giving **down, left, right, up** (same as MV).
- **Columns:** **4 frames, played in order 0, 1, 2, 3.** `@pattern = (@pattern + 1) % 4`. `@original_pattern = 0`, so **column 0 is the standing frame**. The usual convention is: 0 stand, 1 step A, 2 stand or pass, 3 step B. **[C]**
- **Timing:** XP runs at 40 fps. A step happens when `@anime_count > 18 - move_speed * 2`, and the counter grows 1.5 per frame while walking. At speed 4 that is **7 frames, about 175 ms per pattern step**, so a 4-frame cycle takes about 700 ms.
- **Anchor:** `ox = cw / 2`, `oy = ch`. `screen_y` is the tile bottom with **no shift**.
- **Image format:** PNG with alpha. XP was the first RPG Maker with alpha-channel graphics **[C]**.
- **8 directions:** not native. Script-based in Essentials and other XP games **[U]**.

### 2.3 Unite [C/U]

- **Files:** one PNG **per direction**, named `<name>_<direction>_<frameCount>.png`. The official example is `Max_down_6.png`, and directions are listed as down, left, right, up **[C]** (official learn page). A fifth optional image covers "field damage".
- **Layout:** frames sit side by side in one horizontal strip. Each direction may have a **different frame count** **[C]**.
- **Margin:** each frame needs a **1 px transparent margin on all four sides**, which means 2 px between frames **[C]** (Automaton; a forum post quoting the manual). This matches the default walking frame of **98x146**, which is 96x144 plus the margin **[C]** (official PiXel ScaLer page).
- **File size limit:** each file must be **1024x1024 or smaller** **[C]** (Automaton). That gives `frames * (w + 2) <= 1024`. A 160 px cell fits at most 6 frames; an 80 px cell fits at most 12.
- **Setup:** each image is registered by hand in Resource Manager > Characters > Field Character, with its frame count and animation speed. The speed unit is "1/60 s" and about 50 is typical. The exact meaning is unclear, so treat the ms conversion as unverified **[U]**.
- **Not found:** pivot or anchor, and how big a sprite is drawn relative to a tile **[U]**.
- **Battlers:** SV battlers are one file per motion, 18 motions, any frame count, each file up to 4096x4096 **[C]**.

### 2.4 RPG Maker 2000 / 2003 [V for the engine, C for the file rules]

- **File:** `CharSet/`, **exactly 288x256**, 8 characters in a 4-across, 2-down grid. Each character is 72x128: 3 columns by 4 rows of **24x32** cells.
- **Cells are fixed.** EasyRPG Player's `GetCharacterRect` uses `24 * (TILE_SIZE / 16)` by `32 * ...` no matter how big the image is. Tiles are 16 px.
- **Rows:** **up, right, down, left**. In EasyRPG, `GetFacing()` indexes enum `Up=0, Right=1, Down=2, Left=3`. This order differs from every later version.
- **Columns:** `Frame_left=0`, `Frame_middle=1`, `Frame_right=2`, and `Frame_middle2=3` maps to 1. They play 1, 2, 1, 0 starting from the middle (standing) frame.
- **Anchor:** bottom-center (`SetOx(w / 2)`, `SetOy(h)`), with no shift.
- **Color:** **8-bit indexed only, at most 256 colors.** Palette **index 0 is the transparent color**; EasyRPG makes index 0 transparent. PNG or BMP (also XYZ). The original editor rejects images that are not 256-color PNGs ("Unsupported PNG Image").
- **Escape hatch:** EasyRPG Player supports `$`-prefixed sheets with any cell size (`width / 4 / 3` and so on), but **only with EasyRPG extensions enabled**. The official RPG_RT runtime and editor ignore it.
- **Maniacs Patch:** I found no evidence that it adds 32-bit charsets **[U]**.

---

## 3. Adoption today

Measured 2026-11-07. Steam concurrent players count only Steam editor sessions. They miss Japanese and other non-Steam licenses and the 2000/2003 freeware scene, so treat them as relative figures.

| Version | Steam concurrent users (now, a Saturday night snapshot) | SteamCharts average, last 30 days | Other evidence |
|---|---|---|---|
| **MZ** (1096900) | 1,225 | **1,086** | itch.io "RPG Maker MZ" tag: 1,092 games; large active plugin ecosystem (VisuStella, Galv and others) |
| **MV** (363890) | 641 | **611** | itch.io "RPG Maker MV" tag: 1,185 games; console MV cannot import |
| **XP** (235900) | 153 | **215** | Pokémon Essentials, the dominant Pokémon fan-game kit, runs on XP's format **[C]** |
| **VX Ace** (220700) | 136 | **163** | Still common in older tutorials and asset packs |
| 2003 (362870) | 27 | 34.5 | Active non-Steam scene (EasyRPG, Maniacs Patch, Yume Nikki fan games) **[C]**; itch tag `rpgmaker2003`: 57 |
| 2000 (383730) | 4 | 9.3 | |
| VX (521880) | 10 | 8.1 | Effectively replaced by VX Ace |
| Unite | not on Steam ("no longer available") | n/a | Epic rating 3.4; developer put performance first in 2023; U2U announced as its successor **[C]** |
| itch.io "made with RPG Maker" (all versions) | | | 11,292 games. Tags for older versions are fragmented, so per-version counts are unreliable. |

**Ranking of where people make games now:** MZ > MV >> XP ≈ VX Ace >> 2003 > 2000 ≈ VX > Unite. Console editors are used, but their games cannot take imported sprites.

---

## 4. Which versions share a format

- **MZ = MV = VX Ace = VX.** A `$name.png` 3x4 sheet is byte-for-byte the same file for all four. Only the folder and the visible foot offset differ (6 px shift on a 48 px tile, or 4 px on a 32 px tile). The 8-per-sheet layout, `!` objects, row order and 1, 2, 1, 0 playback are the same everywhere.
- **XP is its own format:** 4x4, no prefixes, sequential frames, frame 0 is standing, no shift. Pokémon Essentials uses it too.
- **2000/2003 are their own format:** fixed 24x32 cells, indexed color, different row order.
- **Unite is its own format:** per-direction strips with 1 px margins and manual registration.

---

## 5. Challenge and recommendation

### Support (2 formats, 5 versions)

1. **"RPG Maker MZ / MV / VX Ace / VX":** one `$` sheet per outfit.
   - Zip paths: `rpgmaker/img/characters/$<name>-<preset>.png`.
   - README says: copy the file to `img/characters` (MZ/MV) or `Graphics/Characters` (VX/Ace).
2. **"RPG Maker XP":** `rpgmaker-xp/Graphics/Characters/<name>-<preset>.png`, as a 4x4 sheet.

Both formats can sit behind **one Export choice, "RPG Maker"**, that writes both folders. This keeps settings to a minimum: the user only has to pick the right folder.

### Do not support (for now)

- **2000/2003.** The blocker is the size, not the palette.
  - The cell is hard-coded to 24x32. PixelDoll's smallest body is 32 px in a 48 px auto frame (`autoFrame(32) = 48`, from `characterConfig.ts`).
  - Fitting means the union of every frame's opaque pixels must fit in 24x32. That would need cropping alone to bring a 32 px figure plus hair, hat and walk swing inside 32 px of height and 24 px of width. Weapons and headgear would almost always fail, so the result is effectively "downscale or nothing".
  - The 256-color rule is easy to meet: PixelLab art is usually under 255 colors, so it could be encoded as an exact indexed palette with index 0 transparent and no dithering.
  - The only way to keep native size is EasyRPG's `$` extension, which plays only in EasyRPG Player and not in the official editor.
  - Revisit only if PixelDoll adds bodies of 28 px or less, or if users ask for EasyRPG. If revisited, ship it as a "fits or refuse" exporter.
- **Unite.** Technically the easiest fit, because it takes any frame count: export the walk frames as-is with 1 px margins. But it has very low adoption, it was delisted from Steam, and it has a successor coming.
  - Cost would be one small module, but every image must be registered by hand, and the 1024 px width limit forces frame decimation for large cells.
  - Recommend **Later**; re-check when U2U ships, since U2U's asset format may replace it.
- **All console, handheld and 1990s versions.** They cannot import, or there is no audience.

### Mapping PixelDoll moves to the formats, without rescaling

General rules:

- Compose the outfit (baked composite).
- Bake mirrored west from east. The existing sheet path already does this.
- Select frames by **time phase**, never by changing pixels.

**Directions**

- Rows are always S (down), W (left), E (right), N (up).
- 4-direction and 8-direction rigs: use those four; the 8-direction diagonals are dropped.
- A **Diagonal-4** rig (NE/SE/SW/NW only) or **Side-scroller-2** rig (E/W only) has no S/N or no W/E. The export should **refuse with a clear message** rather than fake missing rows.
- Ship no 8-direction variant in v1. Plugin conventions conflict (`_8dir` and others), so offer one later only if users name a plugin.

**Format A walk (3 columns, played 1, 2, 1, 0)**

- **Column 1 (standing and passing frame):** the `default` standing move for that direction (`DEFAULT_MOVE`). It shares the rig pivot. If it is missing, use the walk frame at the passing phase.
- **Columns 0 and 2 (two contact poses, half a cycle apart):** pick the walk cell with the **largest foot separation**, using the stored `rig.anchors.foot_l` / `foot_r` tracks (offline, no API). Then pick the cell nearest **t + T/2** in the frame playlist (`frames[].ms`, T = sum of ms) for the other foot.
  - If there are no anchors, use the cells at playlist phase 0 and 0.5.
  - Check that the opposite foot leads. The 1, 2, 1, 0 order is symmetric, so which contact goes in column 0 does not matter.
- The source walk's own speed is lost. The engine sets it (about 167 ms per step in MV/MZ, about 117 ms in VX/Ace).

**XP walk (4 columns, played 0, 1, 2, 3)**

- Column 0 = standing (`default`).
- Columns 1, 2, 3 = walk at phases 0 (contact A), 0.25 (passing) and 0.5 (contact B).
- Alternatively, repeat standing in column 2 as the RTP does **[C]**. I recommend the passing frame, because it uses the real walk.

**Walk frame counts other than 3 or 4**

- Always pick frames by phase as above.
- Never blend or interpolate frames, which would create new pixels.
- Never cycle frames out of order.

**Idle**

- No version has an idle loop.
- The standing column is the idle frame.
- A breathing idle move would play with step-anime as 1, 2, 1, 0, which distorts it. Skip idle in v1, or offer it as an extra `$<name>-<preset>-idle.png` sheet sampled at 3 phases.

**Actions (slash and others)**

- No version has map action sprites. Those come from events or plugins.
- Option 1 (recommended for later): MV/MZ **SV battler sheet** in `img/sv_actors/`.
  - Use the **west** row (battlers face left).
  - Map: wait ← `default`/idle, walk ← walk, swing ← slash, thrust ← thrust-like moves, other motions ← wait.
  - Pick 3 frames per motion by phase (start, impact, end).
  - Cells are derived from the image (`width / 9`, `height / 6`), so the size stays native.
  - This is the one place RPG Maker shows attacks natively, so it has a real purpose. Mark it optional, because it needs a reasonable set of moves.
- Option 2: an extra `$`-sheet per action, for event-driven "Change Image" use. Its value is low because 1, 2, 1, 0 playback mangles one-shot actions.
- Galv-style `%(N)` full-frame sheets: only if users ask, since they are plugin-dependent.

### Geometry rules for the exporter (crop or pad only, never scale)

1. **Horizontal centering.** RPG Maker anchors at `cellW / 2`, so the pivot x must be exactly the cell center.
   - Rig cells are centered (manifest invariant 10), but `bakedFrame`/`bakedPivot` may not be.
   - Pad with transparent pixels so width = `2 * max(left, right)` around the pivot.
   - Keep the width even, because RGSS uses integer `cw / 2`.
2. **Feet on the bottom row,** to match RTP. Measured RTP `Actor1`: every frame's lowest opaque row is the cell bottom.
   - Crop transparent rows below the **lowest opaque pixel of the union of all exported cells** of that sheet.
   - If something hangs below the feet (a weapon tip in walk), the feet sit higher by that amount. Report it in the export warnings instead of clipping art.
   - Optionally crop the shared transparent top as well.
3. **One cell size per sheet.** All 12 (or 16) cells use the union frame. Sheet = 3w x 4h (Format A) or 4w x 4h (XP).
4. **Size advice, not limits.** Cells are derived from the image, so any PixelDoll size works. Warn when the character height is far from the target tile size (for example, an 80 px frame on a VX Ace 32 px tile).
   - Natural matches:
     - Body 48 (64 frame): MV/MZ 48 px tiles.
     - Body 32 (48 frame): VX/Ace and XP 32 px tiles.
     - Larger bodies: MZ projects with big sprites, or plugins.
5. **PNG:** RGBA with 0/255 alpha, as PixelDoll already exports. No indexed conversion is needed for Formats A or B.
6. **Filenames:** ASCII, no spaces, stable case. MV/MZ web and mobile deployments are case-sensitive **[C]**.

### Self-challenge

- **"MZ only is enough."** No. XP's Steam usage is higher than VX Ace's and it backs the Pokémon fan-game scene. VX/Ace cost nothing extra.
- **"Selecting 3 of 8 frames is lossy."** Yes, but that is the native contract, and the standing frame comes from real art. Plugin full-frame sheets can come later.
- **"The 6 px shift plus feet-at-bottom might look different from RTP."** It matches what I measured, but that `Actor1.png` came from a third-party repo. Confirm against a fresh MZ project's RTP and do one in-editor visual check before shipping.
- **Not verified:** Unite anchor, speed unit and display scale; U2U format; RPG Maker 95 specifics; DS/DS+ import; whether Maniacs adds 32-bit charsets; Pokémon Essentials' exact cell size (community reports 128x192 sheets).

---

## Sources

- MZ core v1.1.0 (`rmmz_sprites.js`, `rmmz_objects.js`, `rmmz_managers.js`): https://github.com/stak/rmmz-corescript
- MV corescript: https://github.com/rpgtkoolmv/corescript (`Sprite_Character.js`, `Game_CharacterBase.js`, `ImageManager.js`)
- XP RGSS1 default scripts: https://github.com/cstrahan/open-rpg-maker/tree/master/bin/scripts
- VX Ace RGSS3 default scripts: https://github.com/RMEx/buildozer (Sample_project_1/Scripts)
- VX RGSS2 default scripts: https://github.com/Archeia/RMVXA-Script-Repository/tree/master/IceDragon2000/lib/vx_base
- EasyRPG Player (2000/2003 behavior): https://github.com/EasyRPG/Player/tree/master/src (`sprite_character.cpp`, `game_character.h`, `image_png.cpp`)
- 2000/2003 charset rules: https://steamcommunity.com/app/362870/discussions/0/358415206089452224 , https://rpgmaker.net/forums/topics/12828
- MZ 1.5.0 tile size: https://www.rpgmakerweb.com/blog/rpg-maker-mz-1-5-0-update
- Release list: https://en.wikipedia.org/wiki/RPG_Maker
- Unite: https://rpgmakerunite.com/en/learn/002_eng.html , https://ggg.rpgmakerofficial.com/en/pixel-scaler , https://automaton-media.com/articles/newsjp/20220527-204213/ , https://rpgmakerunite.com/en/post/18419764119065/ , https://store.steampowered.com/app/1650950 , https://store.epicgames.com/en-US/p/rpgunite-819421
- U2U: https://gematsu.com/2026/05/rpg-maker-u2u-announced-for-pc , https://80.lv/articles/rpg-maker-u2u-introduces-hd-2d-inspired-visual-system , https://rpgamer.com/2026/08/rpg-maker-u2u-steam-page-released/
- WITH: https://www.cubed3.com/games/reviews/nintendo-switch/rpg-maker-with , https://www.digitallydownloaded.net/2024/10/review-rpg-maker-with-nintendo-switch.html
- Console MV: https://www.nintendolife.com/reviews/nintendo-switch/rpg_maker_mv ; Fes: https://nintendowire.com/?p=54829
- Plugins: https://galvs-scripts.com/2020/08/31/mz-character-frames/ , https://rpgmakeractioncombatmanual.blogspot.com/2025/05/player-8-directions-movement.html , https://himeworks.com/?p=3951
- Adoption: Steam Web API GetNumberOfCurrentPlayers; https://steamcharts.com/app/1096900 (and /363890, /235900, /220700, /362870, /383730, /521880); https://itch.io/games/tag-rpg-maker-mz , https://itch.io/games/tag-rpg-maker-mv , https://itch.io/games/made-with-rpg-maker
- RTP measurement input: https://github.com/TheWhiteCanvas/SaintSeiya_RMMZ (img/characters/Actor1.png, via Git LFS), measured offline with PIL
- PixelDoll context: `app/src/studio/characterConfig.ts` (`autoFrame`, sizes 32-256), `app/src/lib/rig/rig.ts` (`RigAnimation.frames`, `anchors`, `DEFAULT_MOVE`), `docs/manifest-spec.md` §2.1 / §6.6 (`baked/<preset>`, `bakedFrame`)
