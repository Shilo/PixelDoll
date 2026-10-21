# Ultima Online paperdolling: source-verified facts and corrections

Author: R4 (games research), 2026-10-20.
Verifies and extends `ultima_online_paperdolling.md` (same folder). Most facts come from reading the **ClassicUO** source (shallow
clone, commit `ee79d7e`, 2026-09-29, BSD-2-Clause), at https://github.com/ClassicUO/ClassicUO. File paths below are relative to
that repo.

Confidence tags: **[src]** read in source code, **[web]** from an online source, **[inferred]** my reasoning, not stated anywhere.

---

## 1. Corrections to `ultima_online_paperdolling.md`

| § | Existing claim | Correction |
|---|---|---|
| 2 | Paperdoll draws "body, shirt, pants, armor, cloak, hair, helmet, other". | Wrong order. The default table (T2) draws **Cloak first (behind the body)**: Cloak, Shirt, Pants, Shoes, Legs, Arms, Torso, Tunic, Ring, Bracelet, Face, Gloves, Skirt, Robe, Waist, Necklace, Hair, Beard, Earrings, Helmet, OneHanded, TwoHanded, Backpack, Talisman. See §3. **[src]** `Game/Data/PaperdollOrder.cs` |
| 7 | Layer examples are generic names ("torso", "robe", "beard"...). | The real enum has 0x19 wearable layers plus 4 virtual ones. ClassicUO names differ from the ServUO/protocol names (InnerTorso = `Torso`, MiddleTorso = `Tunic`, OuterTorso = `Robe`, OuterLegs = `Skirt`, InnerLegs = `Legs`, FacialHair = `Beard`, Helm = `Helmet`, Neck = `Necklace`). Full table in §2. **[src]** `Game/Data/Layers.cs` |
| 8 | "ClassicUO contains explicit paperdoll ordering logic." | Correct, but more specific: there are **3 base tables** (picked by the AnimID of the Arms/Torso item), then **per-AnimID reorder rules** (MoveTo/MoveAfter/swap). So the order is keyed on *which item* is worn, not just which slot. See §3. **[src]** |
| 9 | Coverage is described as clean metadata ("robe covers torso"). | Coverage exists (`Mobile.IsCovered`), but it is a **hardcoded list of item graphics/AnimIDs in C#**, not data. The ClassicUO comment says culling is needed because "oversized custom art leaks past the occluder". For example, Robe hides Torso unless the robe is in a short list of "open robe" graphics. Plate legs (`Legs` layer) hide Pants. Some pants/legs combos hide Shoes. The ordering builder itself says "No coverage masks / no hide pass". Culling is a separate step, run for both the world view and the paperdoll. **[src]** `Game/GameObjects/Views/MobileView.cs` `IsCovered`, `Game/UI/Controls/PaperDollInteractable.cs` |
| 11 | "Some opposite directions can be obtained by mirroring." | Exact rule: **8 facing directions, 5 stored, 3 mirrored.** Stored file directions 0..4 = UO directions 3 (Down), 4 (South), 5 (Left), 6 (West), 7 (Up). UO directions 2, 1, 0 are horizontal mirrors of 4, 5, 6. All equipment follows the same rule. **[src]** `ClassicUO.Renderer/Animations/Animation.cs` `GetAnimDirection` |
| 12 | Direction-dependent order is a general concept ("render order(direction)"). | In the current ClassicUO, **only the Cloak moves by direction** in the world view (`ApplyDirectionCloak`): dir 0 = cloak drawn last (on top), dir 3 = drawn first (behind), every other dir = just below the Helmet. A legacy 8×23 table `LayerOrder.UsedLayers` still exists but nothing references it any more. Its rows differ mainly in where Cloak, Helmet and TwoHanded sit. **[src]** |
| 13 | "Frame origin... body and equipment must refer to the same character-space location." | Correct, and the mechanism is now known. **Every frame of every layer stores its own `CenterX, CenterY, Width, Height`.** All layers are drawn at the same mobile anchor point: `x = anchorX − CenterX` (mirrored: `x = anchorX − (Width − CenterX)`), `y = anchorY − (Height + CenterY)`. Frames are tightly cropped, and the center is the stored offset. If an equipment animation has fewer frames than the body, the frame index is **clamped to the last frame**. **[src]** `MobileView.DrawInternal`, `AnimationsLoader.ReadSpriteData` |
| 15 | "The system can distinguish full or partial hue." | Exact rule (shader `IsometricWorld.fx`): **HUED** remaps *every* pixel by its **red channel** (5-bit, 0..31) into the hue's 32-colour ramp. **PARTIAL_HUED** remaps only pixels where `r == g == b` (pure grey); coloured pixels stay as drawn. In gump mode, near-black pixels (`r < 0.02`) are never hued. So hueable art must be authored in greys, and the grey level picks the ramp index. **[src]** |
| 18 | `Body.def / Bodyconv.def / Equipconv.def / gump.def` remap assets. | Correct. Details are in §5. `Equipconv.def` is **per body**: a body (e.g., elf or gargoyle) can map an item AnimID to a different animation + gump + hue. `tileart.uop` "appearance" can also override the paperdoll gump in newer clients. **[src]** |
| 20 | UOP replaces MUL with "similar conceptual relationships". | Specifics: `AnimationFrame1..N.uop`, one entry per (animID, group), hashed name `build/animationlegacyframe/{animID:D6}/{group:D2}.bin`, holding **all 5 directions** in one entry. `AnimationSequence.uop` remaps action groups per body. For UOP equipment, the loader assumes **at least 10 frames per direction**. **[src]** `ClassicUO.Assets/AnimationsLoader.cs` |
| 6 | Male gump = AnimID + 50000, female = AnimID + 60000. | **Verified** (`Constants.MALE_GUMP_OFFSET = 50000`, `FEMALE_GUMP_OFFSET = 60000`). Extra detail: if the gendered gump is missing, the client **falls back to the other gender's** gump. **[src]** |
| 25 | Godot "Richard Gameworks" / Unity "DirePixel Paper Doll" examples. | **Not verified by R4.** See R3/R5 for engine and tool references. |

---

## 2. Layer enum (ClassicUO `Layers.cs`; protocol values)

| Hex | ClassicUO name | Classic/ServUO name | Hex | ClassicUO name | Classic/ServUO name |
|---|---|---|---|---|---|
| 0x01 | OneHanded | OneHanded | 0x10 | Beard | FacialHair |
| 0x02 | TwoHanded | TwoHanded | 0x11 | Tunic | MiddleTorso |
| 0x03 | Shoes | Shoes | 0x12 | Earrings | Earrings |
| 0x04 | Pants | Pants | 0x13 | Arms | Arms |
| 0x05 | Shirt | Shirt | 0x14 | Cloak | Cloak |
| 0x06 | Helmet | Helm | 0x15 | Backpack | Backpack |
| 0x07 | Gloves | Gloves | 0x16 | Robe | OuterTorso |
| 0x08 | Ring | Ring | 0x17 | Skirt | OuterLegs |
| 0x09 | Talisman | Talisman | 0x18 | Legs | InnerLegs |
| 0x0A | Necklace | Neck | 0x19 | Mount | Mount |
| 0x0B | Hair | Hair | 0x1A–0x1D | ShopBuyRestock, ShopBuy, ShopSell, Bank | (virtual containers, not drawn) |
| 0x0C | Waist | Waist | | | |
| 0x0D | Torso | InnerTorso | | | |
| 0x0E | Bracelet | Bracelet | | | |
| 0x0F | Face | Face | | | |

`Constants.USED_LAYER_COUNT = 23`, the number of drawable layers in the legacy per-direction table.

---

## 3. Draw order (painter's algorithm, later = on top)

`Game/Data/PaperdollOrder.cs` builds one order that is used for **both** the paperdoll gump and the in-world view.

1. **Pick a base table** (25 entries; a leading `Invalid` acts as a sentinel):
   - **T2 (default)**: Cloak, Shirt, Pants, Shoes, Legs, **Arms**, Torso, Tunic, Ring, Bracelet, Face, Gloves, Skirt, Robe, Waist,
     Necklace, Hair, Beard, Earrings, Helmet, OneHanded, TwoHanded, Backpack, Talisman.
   - **T1 (arms late)**: same as T2, but Arms comes after Face. Selected when the Arms AnimID ∈ {0x3CF, 0x210, 0x3B3, 0x3DD} (e.g., bone
     arms) or the Torso AnimID is 0x21A.
   - **T3 (torso first)**: Torso is moved before Shirt. Selected for female/gargoyle bodies when the Torso AnimID is in 0x399..0x39D.
2. **Per-item reorder rules**, keyed on equipped AnimIDs:
   - Specific pants (0x398, 0x1EB/0x1FA/0x200, 0x513/0x514, 0x3E4) move Pants relative to Shirt or Shoes, so they go over or under boots.
   - Tunic 0x238 (a surcoat) moves after Waist. With some robes, the Robe also moves to Necklace's slot.
   - Cloak 0x380/0x5F3 (**quiver**) moves after Robe (the "quiver fix").
   - Helmet 0x201/0x1A9 combined with certain neck items moves Necklace after Helmet. Helmets 0x5E9/0x5EA combined with robes 0x5E2..0x5E5 move Robe to Helmet's slot.
3. **World view only**: Mount and Backpack are dropped. Cloak is then repositioned by facing direction (§1, row 12).
4. **Culling** (`IsCovered`): hidden layers are skipped (§1, row 9). Dead mobiles skip Hair and Beard.

Takeaway **[inferred]**: UO needs per-item order exceptions because every garment is drawn as a *full, un-occluded* shape on the
naked body. Each new item can then collide with others in ways no fixed slot order can solve.

---

## 4. Animation file formats

### anim.idx / anim.mul (legacy MUL) **[src]**
- `anim.idx` holds 12-byte entries `AnimIdxBlock { uint Position; uint Size; uint Extra }`. There is one entry per (body, action, direction), with directions 0..4.
- Index offset by body ID (`AnimationsLoader.Calculate*GroupOffset`):

  | Body range (anim.mul) | Group | Entries per body | Formula |
  |---|---|---|---|
  | 0–199 | High (monsters) | 110 = 22 actions × 5 dirs | `body * 110` |
  | 200–399 | Low (animals) | 65 = 13 actions × 5 dirs | `(body − 200) * 65 + 22000` |
  | 400+ | People (humans **and equipment**) | 175 = 35 actions × 5 dirs | `(body − 400) * 175 + 35000` |

  `anim2..anim5.mul` use other splits. `mobtypes.txt` and `bodyconv.def` decide the group type and the file.
- **Equipment uses the People layout.** An item's AnimID *is* a body ID in the 400+ range, with all 35 actions × 5 directions.
- Frame block layout: a 256-entry `ushort` palette (512 bytes, ARGB1555), then `uint frameCount`, then `uint frameOffset[frameCount]`. Each
  frame is `short CenterX, CenterY, Width, Height` followed by RLE runs. Each run has a 32-bit header: x offset in 10 bits (signed), y offset in 10 bits (signed), and run length in 12 bits. Palette-index bytes follow. The list ends with `0x7FFF7FFF`.
- Frame count is **per entry** (body × action × direction) and is read from the data. It is not a global constant.

### People action groups (35) **[src]** `PeopleAnimationGroup`
WalkUnarmed, WalkArmed, RunUnarmed, RunArmed, Stand, Fidget1, Fidget2, StandOnehandedAttack, StandTwohandedAttack,
AttackOnehanded, AttackUnarmed1, AttackUnarmed2, AttackTwohandedDown, AttackTwohandedWide, AttackTwohandedJab, WalkWarmode,
CastDirected, CastArea, AttackBow, AttackCrossbow, GetHit, Die1, Die2, OnmountRideSlow, OnmountRideFast, OnmountStand,
OnmountAttack, OnmountAttackBow, OnmountAttackCrossbow, OnmountSlapHorse, Turn, AttackUnarmedAndWalk, EmoteBow, EmoteSalute,
Fidget3.

The High group has 22 actions (Walk, Stand, Die1/2, Attack1–3, Misc, Cast, GetHit, Fidget, Fly, Land...). The Low group has 13.

### UOP **[src]**
- `AnimationFrame{1..N}.uop`: entry name `build/animationlegacyframe/{animID:D6}/{group:D2}.bin`, possibly zlib-compressed. One entry holds all
  directions' frames. The loader recovers frames per direction as `round(totalFrames / 5)`, with a minimum of 10 for equipment.
- `AnimationSequence.uop`: per animID, a table that **replaces action groups** (e.g., a body without "run" uses "walk").

---

## 5. Body and equipment remapping **[src]**
- **Body.def**: body → replacement body + hue (used when art is missing).
- **Bodyconv.def**: `bodyID  anim2ID  anim3ID  anim4ID  anim5ID`. It says which `animN.mul` file holds the body's art. Columns 1–2 are gated by
  client feature flags (`BodyConvFlags.Anim1/Anim2`). Some entries also apply a hardcoded mounted-height offset (e.g., −9 / +9 / +3 px).
- **Equipconv.def**: per *body*, item AnimID → `{Graphic, Gump, Color}`. This lets elves or gargoyles wear the same item ID with different art.
- **Paperdoll gump** = equip AnimID + 50000 (male) / + 60000 (female), with a cross-gender fallback, and can be overridden by
  `Equipconv.def` or the `tileart.uop` appearance.
- `tiledata.mul` item flags supply `AnimID`, `Layer`, `IsPartialHue`, `IsWearable`. These are verified as used fields (`item.ItemData.AnimID`,
  `ItemData.IsPartialHue`).

---

## 6. Hue system **[src]**
- `hues.mul` = N groups of `{ uint Header; HuesBlock Entries[8] }`, with `HuesBlock = { ushort ColorTable[32]; ushort TableStart; ushort TableEnd;
  char Name[20] }`. Hue ID = group × 8 + entry, so every hue is a **32-colour ramp** (dark → light).
- The renderer uploads every ramp into a hue texture (16 columns × 32 px wide). The pixel's **red channel** (0..1 → 0..31) indexes into the ramp.
- Modes: `HUED` (all pixels), `PARTIAL_HUED` (only grey pixels, `r == g == b`), `GUMP` (paperdoll; near-black pixels are never hued), plus
  spectral, shadow and light modes.
- Partial hue lets one item keep fixed-colour details (gems, metal trim) while its grey cloth takes the hue.

---

## 7. How layers stay aligned (summary)
1. One authoritative state: `(body graphic, action group, direction 0..7, frame index)`.
2. Direction → stored direction 0..4 plus a mirror flag, shared by every layer.
3. Each layer looks up its own animation (AnimID, via Equipconv), **same group, same direction, same frame index**. The frame count is clamped
   per layer.
4. Each layer frame is positioned by its **own stored center** relative to the shared mobile anchor. Body and equipment art agree only
   because artists authored them against the same body animation. No runtime anchors or bones exist.
5. Order = PaperdollOrder (base table + per-item rules + cloak-by-direction), then `IsCovered` culling, then hue per layer.

Sitting is a special case. A per-chair-graphic `SittingInfoData` table (ClassicUO `AnimationsLoader`) overrides the
direction and the offset for the seated pose. This supports §14 of the original doc.

---

## 8. Sources
- ClassicUO source, https://github.com/ClassicUO/ClassicUO (files: `src/ClassicUO.Client/Game/Data/Layers.cs`,
  `LayerOrder.cs`, `PaperdollOrder.cs`, `Constants.cs`; `src/ClassicUO.Client/Game/GameObjects/Views/MobileView.cs`;
  `src/ClassicUO.Client/Game/UI/Controls/PaperDollInteractable.cs`; `src/ClassicUO.Renderer/Animations/Animation.cs`;
  `src/ClassicUO.Renderer/shaders/IsometricWorld.fx`; `src/ClassicUO.Assets/AnimationsLoader.cs`, `HuesLoader.cs`).
- Index-slot counts (110/65/175 per body) are also reported by the UOX3 modding forum, https://www.forums.uox3.org/viewtopic.php?p=8735,
  and the ServUO custom-animation guide, https://www.servuo.dev/threads/how-to-add-custom-animations-to-uo.310/.
- UO Stratics file-format page (https://uo.stratics.com/heptazane/fileformats.shtml) returned HTTP 403 and was not used.
