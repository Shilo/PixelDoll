# Games paperdolling survey: how 2D frame-based games layer characters

Author: R4 (games research), 2026-10-20. Status: research spike for PixelDoll.

Confidence tags: **[src]** read in (open-source or reimplementation) source code, **[web]** stated by an online source,
**[mem]** widely known community knowledge that I did not re-verify this session, **[inferred]** my own reasoning.
Source code read during this research was cloned into `C:\Programming_Files\Shilocity\PixelLab\checkouts\` (ClassicUO,
OpenDiablo2, nitro-renderer sparse) or fetched with `gh api` (OTClient, roBrowser, tModLoader, ULPC, MapleWeb, rsc-client, Graal
ganis, a MZ-generator reimplementation).

---

## Summary

- **Every game surveyed uses the same core technique.** One authoritative `(action, direction, frame)` state is shared by
  all layers. Each layer is a separately authored sprite for that exact state, and layers are drawn back-to-front. Bones, IK and
  runtime deformation are absent everywhere.
- Games differ in only **four design axes**, and they are the decisions PixelDoll has to make:
  1. **Alignment.** Either a *shared canvas or pivot* (UO, LPC, Terraria, Tibia, Stardew body layers, Habbo per-asset offsets), or an
     *anchor-point graph* where parts carry named points that snap together (MapleStory `map{navel,neck,hand,brow}`,
     Ragnarok ACT anchors, Diablo 2 per-frame DCC offsets around a shared origin).
  2. **Z-order.** One of these:
     - a static slot ladder (LPC `zPos`, Terraria fixed layer list, Stardew),
     - a ladder plus per-direction overrides (UO cloak, Ragnarok shield, RuneScape Classic 8×12 table),
     - a ladder plus per-item overrides (UO PaperdollOrder rules, Terraria HeldItem 3 positions),
     - a full **per-direction, per-frame** priority table (Diablo 2 COF, Ragnarok IMF, Graal gani),
     - 3D depth sorting (Habbo).
  3. **Tinting.** One of these:
     - gray-ramp remap (UO hues, 32-color ramps; RPG Maker gradient ramps),
     - multi-channel mask multiply (Tibia 4-color template: head/body/legs/feet),
     - palette swap (Ragnarok, LPC palette JSON, Stardew color identification, Diablo 2 colormaps),
     - multiply on gray textures (Terraria clothes, Habbo),
     - separately drawn color variants (MapleStory hair/face IDs).
  4. **Directions.** Stored vs. shown directions, and how mirroring handles asymmetric items:
     - 8 shown / 5 stored (UO, Habbo, RuneScape Classic),
     - 4 stored (LPC, Tibia, Graal, RPG Maker),
     - 2 facings via flip (MapleStory, Terraria, Stardew sides),
     - all directions stored (Diablo 2).
- The **most expensive mistakes** in these games come from one cause: *full, un-occluded garment shapes stacked on a naked body*.
  That forces per-item order exceptions and coverage lists (UO has dozens hardcoded in C#), per-frame priority tables (D2), or
  fg/bg asset splits (LPC, RPG Maker). PixelDoll's planned diff-extraction pipeline produces layers that are **already occluded
  against the body** (see R3 in SHARED_NOTES). That removes most body-vs-item ordering problems, but item-vs-item ordering remains.
- **Mirroring needs a handedness swap.** Every serious 8-direction game that mirrors also swaps left/right parts or provides
  override art. Habbo swaps `rh↔lh`, `rs↔ls` on flipped directions. RuneScape Classic has optional dedicated "F" frames and
  hardcoded weapon/shield offsets for mirrored directions.

---

## 1. Ultima Online (deep dive)

Full verification with file references: [`ultima_online/ultima_online_paperdolling_verification.md`](ultima_online/ultima_online_paperdolling_verification.md).

- **Asset structure [src].** World animations are in `anim*.mul/.idx` (or `AnimationFrame*.uop`). One index entry per (body/AnimID, action,
  direction 0..4). Bodies 400+ use the "People" layout: 35 actions × 5 dirs = 175 entries. **Equipment items have their own AnimID
  in this same body-ID space**, so a robe is literally an animated body made only of robe pixels, with all 35 actions. The paperdoll UI uses
  *separate static gump art*: `AnimID + 50000` (male) / `+ 60000` (female), with a cross-gender fallback. Remapping is done by `Body.def`,
  `Bodyconv.def` (which animN file), `Equipconv.def` (per-body item art substitution) and `AnimationSequence.uop` (action
  substitution).
- **Slots [src].** 25 wearable layers (0x01 OneHanded … 0x18 Legs/InnerLegs, 0x19 Mount). Full table in the verification doc.
- **Draw order [src].** Painter's algorithm from `PaperdollOrder.cs`. There are 3 base tables chosen by the Arms/Torso item AnimID, then
  per-AnimID move rules (pants over/under shoes, surcoat over belt, quiver after robe, helmet over necklace). In the world view the
  **Cloak alone moves by direction**: on top for dir 0, behind for dir 3, otherwise just under the helmet. After ordering, `IsCovered`
  culls hidden layers using hardcoded graphic lists: robe hides torso, plate legs hide pants, some pants hide shoes.
- **Anchoring [src].** Each frame of each layer stores `CenterX/CenterY/Width/Height` (tightly cropped frames). All layers are drawn
  relative to one mobile anchor point. If an equipment animation has fewer frames than the body, the frame index is clamped to
  its last frame.
- **Tint [src].** `hues.mul` stores 32-color ramps. The pixel's red channel indexes the ramp. *Partial hue* recolors only pure-gray
  pixels, so trims and gems keep their color.
- **Directions [src].** 8 shown, 5 stored (down, down-left, left, up-left, up in screen terms). The other 3 are horizontal mirrors.
- **Frame counts [src].** Frame counts are per entry (action × direction) and read from the file. UOP equipment assumes at least 10 frames.

## 2. Diablo II (composite + COF): per-direction, per-frame layer priority

- **Asset structure [src]** (OpenDiablo2 `d2core/d2asset/composite.go`):
  - A unit has a 2-letter **token**, e.g. `AM` (Amazon).
  - Per (mode, weapon class) there is **one COF**: `{base}/{token}/COF/{token}{mode}{wclass}.COF`, e.g. `AMNUHTH.COF` (NU = neutral, HTH = hand-to-hand).
  - Each COF layer points to a DCC (or DC6) animation: `{base}/{token}/{layer}/{token}{layer}{equip}{mode}{wclass}.dcc`,
    e.g. `AMTRLITNUHTH.dcc`.
- **Slots [src]** (`d2enum/composite_type.go`): 16 composite types, `HD` head, `TR` torso, `LG` legs, `RA` right arm, `LA` left arm,
  `RH` right hand (weapon), `LH` left hand, `SH` shield, and `S1..S8` specials (shoulder pads, extra parts and effects; per unit).
  - For armour layers the "equip" code is an **armour class** `lit`/`med`/`hvy`. It comes from `armor.txt` columns `Torso`, `Legs`,
    `rArm`, `lArm`, `rSPad`, `lSPad`, so many armors share 3 visual weights.
  - For RH/LH/SH the code is the item's code.
  - Weapon class (HTH, 1HS, 2HS, BOW, ...) selects a *whole different animation set*.
- **COF binary [src]** (`d2fileformats/d2cof/cof.go`), in this order:
  1. 25-byte header: `[0]` nLayers, `[1]` framesPerDirection, `[2]` nDirections, 21 unknown bytes, `[24]` speed.
  2. 3 unknown bytes.
  3. Per layer, 9 bytes: `{type, shadow, selectable, transparent, drawEffect, weaponClass[4]}`.
  4. `framesPerDirection` bytes of **frame trigger codes** (attack, missile, sound, skill events).
  5. The **priority table**: `nDirections × framesPerDirection × nLayers` bytes, each a composite type.
- **Draw order [src].** The renderer iterates `cof.Priority[direction][frameIndex]` back-to-front and draws each listed layer: first a
  shadow pass, then a sprite pass. **So every frame of every direction has its own complete layer order.** A sword arc can pass behind
  the torso mid-swing and in front of it on the next frame, at no runtime cost. The order belongs to the *animation* (COF), not to the item.
  New items never need new ordering. The authoring cost is that someone (or a tool) must fill `dirs × frames × layers` entries.
- **Anchoring [mem].** DCC frames carry per-frame offsets relative to the unit's foot origin, the same idea as UO centers.
- **Tint [src][mem].** Items have `Transform` / `InvTrans` colormap indices (OpenDiablo2 `item_common_loader.go`). These are palette-index remap
  tables (colormaps), and per-layer `drawEffect` / `transparent` flags allow blended layers.
- **Directions [src].** The COF declares 4/8/16/32 directions (`Dir64ToCof` maps a 64-step angle). **No mirroring; every direction is drawn.**
  Per-mode direction counts for players were not verified.

## 3. Ragnarok Online (.spr/.act)

- **Asset structure [web][src].** `.spr` holds the images (palette or RGBA). `.act` holds actions, frames, and *layers per frame*: sprite index, x/y,
  mirror flag, RGBA color, scale, rotation. It also holds **anchor points per frame**, an event id, and per-action intervals (rdw-archive ACT spec).
- **Layers [web].** Shadow, Body, Head, Lower/Middle/Upper Headgear, Weapon, Weapon Slash, Shield, Garment (robe/wings).
- **Anchoring [web][src].** *Anchor-graph model.* Body, head, headgear, weapon and shield ACTs each carry anchor points. The head is placed so
  that its anchor coincides with the body's anchor **every frame**. roBrowser computes `pos = bodyAnchor − partAnchor`
  (`src/Renderer/Entity/EntityRender.js`), and headgear does the same against the head. Attached sprites are synced to the body's
  current frame.
- **Draw order [web][src].**
  - Mostly a fixed list.
  - The shield is drawn *behind* the body for directions 2..5 (roBrowser hardcode, "seems hardcoded by the client").
  - The **head-vs-body priority per action/direction/frame comes from `.imf` files**, another per-frame priority table like D2's.
  - Garment goes first or last per frame, from Lua tables (`_New_2DLayerDir_F.lub`).
- **Tint [mem].** Hair and clothing palettes are swapped from `.pal` files. ACT layers can also carry a color multiply.
- **Directions [web][src].** 8 directions, camera-relative (`(camera.dir + entity.dir) % 8`). Many directions reuse mirrored layers via the ACT
  mirror flag. The head also has 3 "look" directions (left/forward/right) while idle or sitting.

## 4. MapleStory (WZ)

- **Asset structure [src]** (MapleWeb `TypeScript-Client/src/MapleCharacter.ts`):
  - `Character.wz` holds body/head/hair/face/equip `.img` nodes as `action → frame → parts`.
  - Every part is a canvas with `origin`, a `z` name and a `map` of **named vectors** (e.g. navel, neck, hand, brow).
  - Body frames may redirect to another action/frame (`action`, `frame` nodes).
  - The face has its own expression clock.
- **Anchoring [src].** *Anchor-graph model.* A running dictionary of named points is built while parts are added (body first). Each new
  part is positioned so that its map points coincide with already-known points (averaged if several match). Its other map
  points are then *added* to the dictionary. Example chain: body defines `navel`/`neck`, head matches `neck` and adds `brow`, then
  hair/face/cap match `brow`. Finally `origin` is subtracted.
- **Draw order [src].** `Base.wz/zmap.img` is one **global ordered list of z-names**. Parts are sorted by the index of their `z`.
- **Coverage [src].** `Base.wz/smap.img` maps z-names to 2-character slot codes. Each item's `info.vslot` lists the slots it visually occupies.
  A hat whose vslot intersects a part's slots hides that part, e.g. a full helmet hides hair layers.
- **Tint [mem].** Mostly pre-drawn color variants (hair/face color is encoded in the item ID). It is not runtime tinting.
- **Directions [src].** Side view. Art faces left; facing right = horizontal flip, with origins and map x negated. Some frames carry `flip`.
- **Why it matters [inferred].** This is the most flexible model (items can be reused across body shapes and animations because they snap to
  points). But it needs **part-segmented art per frame**: body, arm and head as separate canvases. PixelLab generates whole figures, so
  this is a poor fit.

## 5. Tibia (OTClient)

- **Asset structure [src]** (`src/client/thingtype.cpp`, `creature.cpp`): an outfit is one *thing type* with a pattern grid:
  `xPattern` = direction (4), `yPattern` = addon (0 base, 1 addon 1, 2 addon 2), `zPattern` = mounted (0/1), × animation phases.
  There are 2 layers: the colored base and a **template mask**.
- **Tint [src].** The template mask uses 4 flat key colors: **yellow = head, red = body (primary), green = legs, blue = feet**. The client
  splits it into 4 masks. Each mask is drawn over the base in **multiply** mode with the chosen color, from 133 colors
  (`HSI_H_STEPS 19 × HSI_SI_VALUES 7`, `outfit.cpp getColor`). Each server-side outfit carries `lookHead/Body/Legs/Feet` (0–132) and
  an `addons` bitmask.
- **Addons [src].** These are not separate items. They are extra pre-drawn overlays inside the *same* outfit's sprite grid, drawn after the base
  (base, addon 1, addon 2), each followed by its own mask pass. They are drawn only if the addon bit is set.
- **Draw order.** Fixed: mount, base, addons. No per-direction logic.
- **Anchoring.** Shared canvas (32 px tile units, displacement per thing type).
- **Directions [src].** 4 stored (N, E, S, W). Diagonals use E/W. No mirroring.
- **Lesson [inferred].** Tibia is the cheapest "customisable" model: one outfit drawing + one 4-channel mask gives a large color space.
  It is *outfit-swapping plus tint*, not true slot paperdolling.

## 6. Stardew Valley (farmer)

- **Asset structure [web]** (official modding wiki, *Modding:Farmer sprite*):
  - `farmer_base` / `farmer_girl_base`: 16×32 frames. Columns hold head/torso/boots (6), arms (12) and pants (6).
  - Shirts are separate **8×8** sprites per facing.
  - Hairstyles, hats and accessories are in their own sheets.
- **Draw order [web].** Head/torso/boots, then pants, shirt, accessories (glasses, facial hair...), hair, hat, and **arms on top**. The arm is
  split from the body precisely so it can cover the shirt.
- **Anchoring [web].** Small layers (shirt, hair, hat) are positioned **by code per animation frame** (`FarmerRenderer.cs`, per-frame offset
  tables). PNG edits can only shift art inside its cell. So the shirt is a small sticker moved by a per-frame offset, not a full-frame layer.
- **Coverage [web].** A hat swaps the hairstyle to a hat-compatible variant (e.g., hairstyles 0, 2, 4, 8, ... → 30). This is *substitution* rather than
  hiding.
- **Tint [web].** Skin, eyes, boots, pants, arms and sleeves are recolored by identifying specific colors in the base sheet (palette swap).
- **Directions [web].** Down, up, and one side; left = mirrored right ("universally mirror images").

## 7. Terraria (tModLoader `PlayerDrawLayers`)

- **Asset structure [src][mem]:**
  - Player frames are **40×56**, stacked vertically (frame = `bodyFrame.Y / bodyFrame.Height`).
  - Armor head/body/legs sheets use the **identical frame grid**, so the same `bodyFrame` rectangle is used for every layer (tModLoader ExampleMod
    `EarringsDrawLayer.cs`).
  - Body armor since 1.4 is a "composite" sheet with separate torso, back-arm, front-arm and shoulder regions [mem].
- **Draw order [src]** (`PlayerDrawLayers.tML.cs` `FixedVanillaLayers`): about 40 fixed layers, back to front:
  - behind the body: JimsCloak, MountBack, ..., Backpacks, Tails, Wings, **HairBack**, BackAcc, **HeadBack**, BalloonAcc;
  - the body itself: Skin, Leggings / **Robe** (mutually exclusive by condition), Shoes, SkinLongCoat, ArmorLongCoat, Torso, OffhandAcc,
    WaistAcc, NeckAcc, Head, FaceAcc;
  - in front: MountFront, ..., Shield, SolarShield, **ArmOverItem**, HandOnAcc, ...
  - **HeldItem has 3 possible positions** chosen per item and use style (`BehindBackArm`, `BehindFrontArm`, `OverFrontArm`).
  - Mods insert layers with `Between(A,B)` / `AfterParent(X)` positions.
- **Anchoring [src].** Shared frame plus a **per-frame headgear offset table** (`Main.OffsetsPlayerHeadgear[frameIndex]`), so hats and hair bob with
  the walk cycle.
- **Tint [src][mem].** Clothes, skin and hair are gray textures multiplied by player-chosen colors. Armor is recolored with **dye shaders**
  per layer (`drawData.shader`).
- **Directions.** Side view only. Left = `SpriteEffects.FlipHorizontally` (`playerEffect`).

## 8. Liberated Pixel Cup / Universal LPC Spritesheet Generator (ULPC)

- **Asset structure [src][web]:**
  - **64×64 frames.** One sheet per layer with a fixed row layout. Rows are grouped per animation, each in 4 directions (up, left, down, right). Base animations:
    spellcast 7, thrust 8, walk 9, slash 6, shoot 13, hurt 6 (1 dir). ULPC added idle, run, jump, sit, climb, emote, combat and more.
  - The expanded sheet is 832 px wide (13 columns).
  - **Oversize weapons** use separate `custom_animation` sheets with bigger frames (e.g. `slash_128`).
- **Slots [src].** `sheet_definitions/` folders: body, head, hair, headwear, torso (shirts, armour, cape, backpack, waist...), arms, legs, feet,
  weapons, tools. Each item JSON has `layer_1..n`, each with its own **`zPos`** and per-body-type paths (male, female, muscular, teen, pregnant,
  child), plus `variants`, `animations`, and per-file `credits` with licenses.
- **Draw order [src].** **A static global zPos per layer; nothing is per direction or per frame.** Wrap-around items are split into fg/bg layers
  that are pre-masked per frame:
  - cape `fg zPos 85` / `bg zPos 5`,
  - arming sword `fg 140` / `bg 9`, with attack slash `fg 150` / `bg 8`,
  - body `10`, backpack `110`.
- **Anchoring.** Shared 64×64 canvas, no offsets (oversize sheets are centered on the same body).
- **Tint [src].** Historically pre-colored `variants` (one PNG per color). The newer `PALETTE_RECOLOR_GUIDE.md` adds palette JSON ramps (1–32
  colors) with tolerance-based color matching, done in WebGL.
- **Directions.** 4 stored, no mirroring.
- **License [src].** Each image is CC0 / CC-BY / CC-BY-SA / OGA-BY / GPL (often multi-licensed), with mandatory attribution via `CREDITS.csv`. The README notes
  CC-BY-SA's DRM clause concerns for Steam/iOS and suggests CC0/OGA-BY for those platforms. **PixelDoll should never mix LPC art into AI outputs
  without tracking per-asset credits [inferred].**

## 9. Habbo (Nitro renderer)

- **Asset structure [src]** (`nitro-renderer/src/nitro/avatar`):
  - Figure string `hd-180-1.hr-828-61.ch-255-66.lg-280-110.sh-305-62` = `setType-setId-colorIds`.
  - Assets are named `{scale}_{action}_{partType}_{partId}_{direction}_{frame}` (e.g. `h_std_ch_255_2_0`), each with its own x/y offset.
- **Slots [src].** Set types hd, hr, hrb, ch, lg, sh, ha, he, ea, fa, ca, wa, cc, cp... Sets contain *parts*: bd body, lh/rh hands, ls/rs sleeves,
  lc/rc coat sleeves, ri/li held items, ey eyes, fc face...
- **Draw order [src].** **3D depth sort.** `AvatarModelGeometry.getBodyPartsAtAngle` rotates each body part's 3D position around Y by the
  direction and sorts by distance to camera. Parts inside a body part are sorted the same way. The order is computed, not authored.
- **Coverage [src].** Partsets carry `hiddenLayers`. `hrb` (hair under a hat) has `removeSetType: 'hr'`.
- **Tint [src].** Per set type there is a palette, and parts with `colorLayerIndex > 0` are multiplied by the chosen palette color.
- **Directions [src].** 8 directions (0–7). **Directions 4, 5, 6 reuse the assets of 2, 1, 0** with a horizontal flip *and* a **left/right
  part-type swap** (`flippedSetType`: rh↔lh, rs↔ls, rc↔lc). Hand items and chest prints are flipped without swapping, so prints don't read
  backwards (`AvatarImageCache.ts`).

## 10. RuneScape Classic (mudclient)

- **Asset structure [src]** (`2003scape/rsc-client src/mudclient.js`):
  - 12 appearance and equipment slots per player.
  - Each worn item references an animation sprite set: 5 stored directions × 3 walk frames = 15 frames, plus combat frames.
  - An item may also include **15 extra "F" frames** (`animationHasF`), which are dedicated art for mirrored directions.
- **Draw order [src].** `npcAnimationArray[8][12]` is a **per-direction ordering of the 12 slots**. Direction 5 is used for combat.
- **Mirroring [src].** Directions 5, 6, 7 → 3, 2, 1 flipped. While mirrored:
  - items with F frames use them;
  - otherwise the weapon and shield slots (3/4) get **hardcoded x/y offsets** and a phase-shifted walk frame, to fake handedness.
- **Tint [src].** Fixed palettes: 10 hair colors, 15 top/bottom colors, 5 skin colors (`characterHairColours` etc.).

## 11. Graal Online (.gani)

- **Asset structure [src]** (example `ganis/lay.gani`, GScript.Suite). A text format:
  - `SPRITE id SLOT x y w h comment` cuts rectangles out of named image slots (`BODY`, `HEAD`, `ATTR1` = hat, `SWORD`, `SHIELD`,
    `SPRITES` = shared).
  - `DEFAULTBODY body.png` etc. set the default images.
  - The `ANI` section has, per frame, **4 lines (up, left, down, right)**. Each line lists `spriteId x y` triples **in draw order**. Then come `WAIT`,
    `PLAYSOUND`, `SETBACKTO`, `CONTINUOUS`.
- **Draw order and anchoring.** Explicit per direction and per frame, written into the animation. For example, the carried item is drawn *before* the body when facing up and after it otherwise.
  The x/y per sprite per frame make the animation file the anchor table.
- **Swapping.** Equipment swaps the *image file in a slot* (`HEAD`, `ATTR1`...). The gani never changes.
- **Tint [mem].** Body colors (skin, coat, sleeves, shoes, belt) replace fixed palette colors in `body.png`.
- **Directions.** 4 stored, no mirroring.

## 12. RPG Maker MV/MZ character generator

- **Asset structure [src]** (a third-party MZ generator reimplementation, `DocDamage/Doodads-with-a-drawer src/23_mzgen_index.js`; [mem] for
  sheet sizes):
  - Views: `Face`, `TV` (walk, 3 frames × 4 dirs), `SV` (side-view battler), `TVD` (damage), and `Variation` icons.
  - Part files `TV_Clothing2_p03.png` + mask `TV_Clothing2_p03_c.png`. The digit after the family is the **layer: 2 = behind the body, 1 = in front**.
    Families include Cloak1/2, RearHair1/2, FrontHair1/2, Wing1/2, Tail1/2 and Clothing1/2.
- **Draw order [src].** A fixed back-to-front list per view. TV example: Tail2, Wing2, Cloak2, RearHair2, FrontHair2, **Body**, Ears, FacialMark,
  Beard, Clothing1, Clothing2, Cloak1, RearHair1, FrontHair1, BeastEars, AccA, Glasses, AccB, Wing1, Tail1. This is the LPC fg/bg idea again.
- **Tint [src].** The mask's **flat key colors mark color slots**. Each slot is recolored with a ramp from gradient files (`grad_common`, `eyes`,
  `hair`, `skin`), read as 4-px bands, light to dark.
- **Directions.** 4 stored (TV), no mirroring.

## 13. Others checked

- **Moonlighter, Children of Morta [inferred].** Fixed hand-animated heroes with weapon-type animation sets. No slot paperdolling worth copying.
- **Eden Eternal.** 3D, so out of scope.

---

## Comparison table

| Game | Granularity | Slots (≈) | Z-order model | Anchor model | Tint model | Dirs stored → shown | Mirroring |
|---|---|---|---|---|---|---|---|
| Ultima Online | full-frame layers per item, all actions | 25 | 3 base tables + per-item rules + cloak-by-dir; hardcoded culling | per-frame stored center vs shared anchor | 32-color ramp by red channel; partial hue = gray only | 5 → 8 | yes (3 dirs), no handedness swap |
| Diablo II | per-body-part layers (16 types) × armor class | 16 | **per-direction × per-frame COF priority** | per-frame offsets around unit origin | colormap transforms + draw effects | 8/16/32 → same | no |
| Ragnarok Online | body/head/3 headgear/weapon/shield/garment | 9 | fixed + shield-by-dir + IMF per-frame head/body + garment Lua | **anchor points per frame** | palette swap + layer color | 8 (mirror flags) | partial (ACT mirror flag) |
| MapleStory | per-part canvases (body, arm, head, hair...) | ~15 + | global zmap name list | **named map points graph** (navel/neck/hand/brow) | pre-drawn color IDs | 1 side → 2 | yes (flip) |
| Tibia | whole outfit + 2 addons + template | outfit + 2 addons | fixed | shared tile canvas | **4-channel mask multiply (head/body/legs/feet)** | 4 → 8 (diagonals reuse E/W) | no |
| Stardew Valley | base sheet + small shirt/hair/hat stickers | 7 | fixed (arms on top) | **per-frame offset table in code** | palette color identification | 3 → 4 | yes (left = flipped right) |
| Terraria | full-frame layers on shared grid | ~40 draw layers | fixed list + conditional items (HeldItem ×3, Robe) | shared frame + per-frame headgear offsets | gray × color; dye shaders | 1 side → 2 | yes |
| LPC / ULPC | full-frame layers, fg/bg splits | ~12 categories | **static zPos per layer**, fg/bg split items | shared 64×64 canvas | variants / palette JSON ramps | 4 → 4 | no |
| Habbo | per-part assets, per-asset offsets | ~20 set types | **3D geometry depth sort per direction** | per-asset offset (registration) | palette multiply on gray | 5 → 8 | yes, **with L/R part swap** |
| RuneScape Classic | full-frame layers per slot | 12 | **8 × 12 per-direction slot table** | shared canvas | fixed palettes | 5 → 8 | yes, **F override frames / offsets** |
| Graal | image slots cut by gani | ~6 | **per-direction × per-frame list in gani** | per-frame x/y in gani | palette color replace | 4 → 4 | no |
| RPG Maker MZ gen | parts with layer 1/2 (front/back) | ~18 families | fixed list per view | shared canvas | key-color mask → gradient ramps | 4 → 4 | no |

---

## Lessons for PixelDoll (concrete design rules)

### R-1 Separate logical slots from render layers
- Logical slot (what is equipped, mutual exclusion) ≠ render layer (what gets drawn, at which z). UO, Terraria, RPG Maker and ULPC all split them.
- **One item may emit 1..n render layers.** Typical case: `fg` + `bg` for wrap-around items (cape, quiver, long hair, two-handed weapon, wings,
  tail).
- **Default slot taxonomy** (small; games use 7–25):
  `body` · `hair_back` · `hair_front` · `facial_hair` · `head` (helmet/hat) · `face_acc` (glasses/mask) · `neck` · `torso_inner`
  (shirt) · `torso_outer` (armor/robe) · `back` (cape/backpack/quiver; usually fg+bg) · `arms` (gloves/bracers) · `waist` · `legs`
  (pants) · `feet` · `main_hand` · `off_hand`.
- `body` is the rig. Everything else is optional.

### R-2 Z-order model: static ladder, then sparse overrides, never authored full tables
1. Each render layer gets a **static integer z** (ULPC-style ladder with gaps, e.g. bg layers < 10 < body < 100 < fg layers).
2. Add optional **sparse overrides** `zOverride[anim?][dir?][frame?] = z`. This covers:
   - UO's cloak-by-direction,
   - Ragnarok's shield-behind for directions 2–5,
   - RuneScape Classic's per-direction table,
   - D2/Graal per-frame weapon swings, but only where needed.
3. **Prefer an fg/bg split over per-frame overrides.** A split layer is just two layers with static z values, and every engine exporter handles that (R3).
4. Never require hand-authored `dirs × frames × layers` priority tables (D2 COF). They only work with dedicated tooling.
5. **[inferred]** PixelDoll's diff-extracted layers are pre-occluded against the body, so body-vs-item order is mostly solved by construction. Item-vs-item order (cape vs backpack, sword vs shield) remains, and that is what the ladder plus overrides is for. Two
   options: equip items in a canonical **dress order** (generate an outer item on top of base + inner items), or record per-pixel
   "which item wins" during QA. Flag this for S1/architecture.

### R-3 Anchor model: shared canvas plus pivot; optional named points, never a part graph
- **One canvas size and one pivot per rig.** All layers are exported untrimmed, or trimmed with a stored per-frame offset like UO's
  `CenterX/Y`. This matches PixelLab whole-figure output and every engine importer (R3).
- Optionally store **named anchor points per frame** (`hand_r`, `hand_l`, `head_top`, `back`). Their only use is attaching *static or
  reused* props without regeneration (Terraria headgear offsets, Stardew per-frame sticker offsets, the RO/Maple idea in light form).
- **Do not** adopt MapleStory/RO anchor graphs. They need part-segmented art (separate arm, head and body canvases), which PixelLab does not
  produce.

### R-4 Tint model: ramp remap with up to 4 regions, plus a "partial" flag
- Store a **region mask** per layer, with at most 4 regions like Tibia's head/body/legs/feet or RPG Maker's key colors. Each region gets a
  **color ramp** (UO-style 32 or LPC-style 1–32 steps). Recoloring = map the pixel's luminance/ramp index into the target ramp.
- Add a **`partial`** flag (UO partial hue): only pixels in the mask (or near-gray pixels) are recolored. Metal, gems and outlines keep their color.
- PixelLab output is full-color, so the pipeline must **quantize each region to its ramp** before export. Multiply on colored art
  muddies colors. The Tibia forum attempt at simple overlay recoloring lost outlines and shading.
- Do not generate one PixelLab variant per color unless the recolor fails QA. One generation plus a ramp swap is the efficient path.

### R-5 Directions and mirroring: mirror by default for symmetric items, with handedness swap and per-item opt-out
- Store what PixelLab generates (4 or 8 directions). Offer **"mirror east side from west"** as a cost-saver: 8 shown from 5 stored, like UO, Habbo
  and RuneScape Classic.
- When mirroring, **swap handedness slots** (`main_hand ↔ off_hand` art, left/right gloves), following Habbo's `flippedSetType`.
- Every item has `mirror: auto | swapHands | never`. `never` means the item ships its own east-side frames, like RuneScape Classic's "F" frames. Required for
  asymmetric designs: shields with emblems, side-parted hair, text or chest prints (Habbo flips these without the swap so they don't read backwards).
- Mirror the pivot too: `x' = width − x`, like UO's `width − CenterX`.

### R-6 Frame contract: identical frame counts; never clamp or skip
- Every layer has **exactly the body's frame count** per (animation, direction). Missing cells are emitted as **transparent cells**.
- UO clamps short equipment animations to their last frame, which causes visible freezes. Engines desync silently (R3).
- Frame-trigger metadata (D2 COF triggers, RO events: attack/sound frame) belongs to the **animation**, not the layer. Store it once
  per animation in the manifest.

### R-7 Coverage and variants: data-driven, never code
- An item can declare `hides: [slot | layerName]` (Habbo `hiddenLayers`, MapleStory vslot, Terraria Robe vs Leggings) and
  `swapsVariant: {slot: variantId}` (Stardew hat → hat-compatible hairstyle, Habbo `hrb` hair-under-hat).
- **What not to do:** UO's `IsCovered` and `PaperdollOrder` rules. They are dozens of hardcoded graphic IDs in C#, added one bug at a time.
- Visual weight classes (D2 `lit/med/hvy`) are a good cheap trick. Many items can share 3 generated looks plus tint, so you don't need N unique generations.

### R-8 What NOT to do (summary)
1. Numeric ID arithmetic or implicit naming (UO `AnimID + 50000`, D2 filename concatenation). Use explicit manifest references.
2. Separate hand-drawn paperdoll-UI art (UO gumps). Render the UI portrait from the world frames (e.g., the south idle frame, scaled).
3. Per-part anchor graphs with segmented art (MapleStory, RO) when the generator produces whole figures.
4. Mirroring asymmetric items without a swap or opt-out.
5. Authoring full per-frame priority tables by hand (D2 COF). Use sparse overrides plus an fg/bg split.
6. Recolor by multiplying full-color art. Use ramp quantize-and-remap.
7. Mixing third-party CC-BY-SA/GPL art (LPC) into outputs without per-asset credit tracking.

---

## Sources

- ClassicUO: https://github.com/ClassicUO/ClassicUO (see the verification doc for file list).
- OpenDiablo2: https://github.com/OpenDiablo2/OpenDiablo2, `d2common/d2fileformats/d2cof/{cof.go,cof_layer.go,cof_dir_lookup.go}`,
  `d2common/d2enum/composite_type.go`, `d2core/d2asset/composite.go`, `d2core/d2map/d2mapentity/factory.go`,
  `d2core/d2records/item_common_loader.go`, `d2common/d2enum/item_armor_class.go`.
- MergeDCC (Paul Siramy), on D2 per-direction, per-frame layer order: https://www.allegro.cc/depot/MergeDCC
- Ragnarok ACT spec: https://github.com/rdw-archive/RagnarokFileFormats (ACT.MD). roBrowser
  `src/Renderer/Entity/EntityRender.js`: https://github.com/vthibault/roBrowser. rAthena wiki "Acts":
  https://github-wiki-see.page/m/Jeybla/rathena/wiki/Acts
- MapleStory: MapleWeb `TypeScript-Client/src/MapleCharacter.ts`, https://github.com/Jeck-Sparrow-5/MapleWeb. maplestory.io character
  system: https://deepwiki.com/crrio/maplestory.io/3-character-system (search summary only; fetch was rate-limited).
- Tibia: OTClient `src/client/{outfit.cpp,outfit.h,thingtype.cpp,creature.cpp}`, https://github.com/edubart/otclient. OTLand
  "the 4 colors": https://otland.net/threads/the-4-colors.121662/
- Stardew Valley: https://wiki.stardewvalley.net/Modding:Farmer_sprite. Forum on FarmerRenderer:
  https://forums.stardewvalley.net/threads/alter-hair-following-body-animations-through-coding.30271
- Terraria: tModLoader `patches/tModLoader/Terraria/DataStructures/PlayerDrawLayers.tML.cs`,
  `ExampleMod/Common/CustomVisualEquipType/EarringsDrawLayer.cs`, https://github.com/tModLoader/tModLoader. Wiki talk:
  https://terraria.wiki.gg/wiki/Talk:Character_styles
- ULPC: https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator (`README.md`,
  `PALETTE_RECOLOR_GUIDE.md`, `sheet_definitions/body/body.json`, `torso/cape/cape_solid.json`,
  `torso/backpack/backpack.json`, `weapons/sword/weapon_sword_arming.json`). OGA refactor note:
  https://opengameart.org/comment/92915
- Habbo: nitro-renderer `src/nitro/avatar/{AvatarStructure.ts,geometry/AvatarModelGeometry.ts,cache/AvatarImageCache.ts,
  data/HabboAvatarPartSets.ts}`, https://github.com/billsonnn/nitro-renderer. Avatara: https://github.com/quackster/avatara
- RuneScape Classic: `src/mudclient.js`, https://github.com/2003scape/rsc-client
- Graal: `ganis/lay.gani`, https://github.com/MorenoLand/GScript.Suite. Other gani parsers: https://github.com/xtjoeytx/2dadventureclient,
  https://github.com/Guthius/OpenGraal.Client
- RPG Maker MZ generator (third-party reimplementation): `src/23_mzgen_index.js`,
  https://github.com/DocDamage/Doodads-with-a-drawer. Steam thread on MV vs MZ naming:
  https://steamcommunity.com/app/1096900/discussions/0/3117025249783577999
