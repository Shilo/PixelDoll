# Intersect Engine paper-doll architecture (2026-11-25)

Source-level review of [Intersect Engine](https://github.com/AscensionGameDev/Intersect-Engine), an open-source 2D ORPG with
layered equipment paperdolls. Read at commit
[`c40aa54`](https://github.com/AscensionGameDev/Intersect-Engine/tree/c40aa5447ff48f37ae499a39408ddf715e1ea97b)
(2023-12-15, the checkout on this machine), plus the shipped `0.7.2-beta.60` client and editor assets. Code paths and line
numbers below are from that commit. All 355 shipped paperdoll PNGs and 112 entity sheets were measured with
System.Drawing; no client or editor was launched, no PixelLab credits were spent and no PixelDoll code changed.

The question was what a hand-authored, server-driven paperdoll system proves or warns about for PixelDoll's generated,
frame-aligned layers.

## How Intersect models it

### Slots are positional names in server config

`Equipment.Slots` is a list of strings, by default `Helmet, Armor, Weapon, Shield, Boots`
([EquipmentOptions.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect%20%28Core%29/Config/EquipmentOptions.cs#L10-L31)).
The body is not a slot; it is the literal token `Player` inside each direction's paperdoll order
([PaperdollOptions.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect%20%28Core%29/Config/PaperdollOptions.cs#L15-L63)).

Slot identity is the list position, not a stable key: `ItemBase.EquipmentSlot` is an `int`
([ItemBase.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect%20%28Core%29/GameObjects/ItemBase.cs#L142)),
`WeaponSlot`/`ShieldSlot` are indices, and each player's `Equipment` is an `int[]` of inventory slots sized and indexed by
`Options.EquipmentSlots`
([Player.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Server.Core/Entities/Player.cs#L87-L92)).
Reordering or removing a configured slot therefore reinterprets saved equipment. There is no editor UI for the slot list or
the paperdoll order; both live only in the server `config.json`.

The only built-in slot interaction is two-handed gear: equipping a two-handed weapon unequips the shield, and equipping a
shield unequips a two-handed weapon
([Player.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Server.Core/Entities/Player.cs#L5603-L5622)).
There is no general hide or tuck relation.

### Draw order is one list per direction

`Equipment.Paperdoll` has four lists, keyed by the `Direction` enum (`Up, Down, Left, Right`). The default is the same for
every direction: `Player, Armor, Helmet, Weapon, Shield, Boots`. Duplicates are removed and validation requires `Player` plus
only known slot names, but it does not require every slot to appear in every direction
([PaperdollOptions.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect%20%28Core%29/Config/PaperdollOptions.cs#L75-L114)).
A slot omitted from a direction's list is simply never drawn there.

The client walks that list and draws the body when it reaches `Player`, then each slot's paperdoll texture
([Entity.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Client/Entities/Entity.cs#L1162-L1206)).
List index is the entire z model. There is no numeric depth per item, no front/back split of one item, and no per-cell or
per-animation override. A cloak can be behind the body by putting `Back` before `Player`, but only for the whole direction
and only with every one of its pixels behind.

The server sends its full config JSON to every client at connect through `ConfigPacket`
([PacketSender.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Server.Core/Networking/PacketSender.cs#L59-L63),
[Options.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect%20%28Core%29/Config/Options.cs#L279-L282)),
so clients render the order the server configured instead of keeping their own copy. The editor also loads that config, though
its item preview does not compose layers.

### The paperdoll sheet contract is implicit in the PNG

One texture per item per gender holds all frames and directions:

- width = animation frame count × cell width;
- height = 4 × cell height;
- rows are fixed by `PickSpriteRow`: row 0 down, row 1 left, row 2 right, row 3 up
  ([Entity.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Client/Entities/Entity.cs#L1240-L1265)).
  Diagonals reuse the last cardinal direction's row, so there is no diagonal art.
- the cell size is never declared. The client derives `width / frameCount` and `height / 4` from the texture itself
  ([Entity.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Client/Entities/Entity.cs#L1385-L1403)).

Body and equipment are both anchored bottom-center on the character's origin: the body's destination is
`Origin - (frameWidth/2, frameHeight)`, and the equipment rectangle resolves to the same formula because
`Center = Origin - frameHeight/2` and `GameTexture.Center = Dimensions / 2`
([Entity.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Client/Entities/Entity.cs#L1137-L1158),
[Entity.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Client/Entities/Entity.cs#L271-L273),
[GameTexture.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Client.Framework/Graphics/GameTexture.cs#L26)).
That identity only holds when the gear cell and the body cell have the same height. There is no pivot, offset or per-direction
anchor to correct a mismatch.

Measured evidence for the fixed grid:

| Asset group                                 | Dimensions                                                                   | Cell                                                        | Files      |
| ------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------- |
| All shipped `resources/paperdolls/*.png`    | 128 × 192                                                                    | 32 × 48                                                     | 355 of 355 |
| Shipped body sheets in `resources/entities` | 128 × 192 (most), also 128 × 128, 128 × 188, 128 × 208, 192 × 192, 256 × 256 | 32 × 48 (most), 32 × 47, 32 × 52, 32 × 32, 48 × 48, 64 × 64 | 112        |

So the default gear only fits the default 32 × 48 body. A server using the larger body sheets needs separately authored gear
at that cell; nothing scales it.

Gear in the shipped set is drawn per direction and per frame, not mirrored. On `Armor_1 Black.png` the west row's frame 0
occupies x 8-29 while the east row's frame 0 occupies x 2-23. The editor offers no alignment aid either: its paperdoll preview
crops only row 0 (down), frame 0, with no body underneath
([frmItem.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Editor/Forms/Editors/frmItem.cs#L1134-L1188)).
Alignment has to be checked outside that preview, in the client or another tool.

A gear item may ship optional per-animation sheets named `{paperdoll}_{animation}`; otherwise the normal sheet is reused with
`NormalFrames`. The suffix is the animation enum name (`Idle`, `Attack`, and so on), or the part of an attack, cast or weapon
animation texture's name after its first underscore
([Entity.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Client/Entities/Entity.cs#L1334-L1383)).
The shipped content uses none: every default paperdoll is a single walk sheet, and its "variants" are separate color files
such as `Armor_1 Black.png` and `Armor_1 Blue.png`.

### Composition, missing art and color

Each visible slot draws its own texture with the body's current frame index, so a gear sheet must match the body's frame count
for the playing animation. Frame counts and durations are global per animation type (4 normal, 4 idle, 4 attack, 200 ms), not
per move ([SpriteOptions.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect%20%28Core%29/Config/SpriteOptions.cs)).

Missing gear is silent at every layer:

- an unknown item id in `EquipmentPacket` fails `ItemBase.TryGet` and nothing is drawn;
- an empty or unknown paperdoll filename returns no texture and `DrawEquipment` returns;
- a sheet whose dimensions do not match the cell grid is sliced arithmetically with no check or warning;
- a slot absent from a direction's order, a transformed entity, or a map with equipment hidden simply draws no gear.

There is no coverage metadata, placeholder, log line or validation pass. A wrong frame count advances the gear through a
different number of frames than the body; a wrong cell size draws the gear at its own size and offset.

Recoloring is either a separate baked PNG per color or the item's ARGB `Color` multiplied over the texture at draw time
([Entity.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Client/Entities/Entity.cs#L1195-L1202)).

### How assets reach the server

They do not. The server stores names and ids only:

- the item definition holds `MalePaperdoll` and `FemalePaperdoll` strings, selected by gender
  ([ItemBase.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect%20%28Core%29/GameObjects/ItemBase.cs#L177-L185),
  [ItemBase.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect%20%28Core%29/GameObjects/ItemBase.cs#L440-L444));
- `GameDataPacket` ships those item descriptors to clients at login;
- `EquipmentPacket` ships item GUIDs per slot for other players and inventory indices for the wearer
  ([EquipmentPacket.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect%20%28Core%29/Network/Packets/Server/EquipmentPacket.cs#L14-L30));
- `ConfigPacket` ships the slot list and per-direction order.

The server's `resources` folder contains no paperdoll art. Both client and editor load `resources/paperdolls` from their own
install, and the editor's item form lists only files present there
([ContentManager.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Editor/Content/ContentManager.cs#L153-L167),
[frmItem.cs](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Editor/Forms/Editors/frmItem.cs#L149-L160)).
Consequently a client that lacks the named file draws the item as nothing, and new art must be distributed with the client,
not with the character's equipment data. We did not trace the updater or pack system.

## Comparison with PixelDoll

| Dimension      | Intersect                                                                                        | PixelDoll                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Slot identity  | Positional indices in one server list; 5 default names plus `Player`                             | Stable string ids with 17 built-in profiles plus custom categories (`slots.ts`, `manifest-spec` §2)                              |
| Z              | One slot-name list per direction; index is the whole z                                           | Numeric ladder with per-item fg/bg, `zOverrides` by direction/animation/cell, hides and tuck-under (`slots.ts`, architecture §5) |
| Front and back | One slot is entirely before or after `Player` for a direction                                    | One item splits into fg and bg layers with separate z (`architecture.md` §4.6)                                                   |
| Art grid       | Frame count per animation (default 4) × 4 direction rows, cell implied by the PNG                | Cells and directions declared in the rig; per-layer cell and pivot for oversize held items (`manifest-spec` §2.1)                |
| Alignment      | Bottom-center only; identical cell required; no pivot or offset                                  | One body point stored as a pivot per layer in pixel-edge coordinates; automated registration gate                                |
| Directions     | 4 rows; diagonals reuse a cardinal row                                                           | Up to 8 authored or mirrored directions (`rig.directions`)                                                                       |
| Timing         | Global frame counts and durations per animation type (default 4)                                 | Per-clip frame playlists with per-cell `ms`                                                                                      |
| Art source     | Hand-authored per direction and frame, no editor body overlay                                    | Generated, posed, chroma-extracted, QA-gated per clip-direction                                                                  |
| Color          | Baked per-color PNGs or an item RGB multiply                                                     | Exact owner-local palette ramps, variants and baked swaps                                                                        |
| Missing art    | Silent no-op, no coverage or warning                                                             | Mandatory transparent cells, `coverage`, export invariants and warnings                                                          |
| Transport      | Server sends item GUIDs, inventory indices and art filename strings; images ship with the client | Self-contained manifest plus PNG sheets in the export zip; game loads it directly                                                |
| Two hands      | Server unequips the shield for a two-handed weapon                                               | `hides`, hand anchors and mutual-hide rules (invariant 9)                                                                        |

PixelDoll's chroma extraction, pose-per-move pipeline and QA gates have no counterpart in Intersect; every piece of gear there
is drawn by a person, and the engine's only checks are config validation.

## Verdict

Intersect is a useful negative control, not a format to copy. Its model works because a human draws every frame inside one
fixed cell and the game ships one art set per body size. It confirms the parts of PixelDoll's design that exist precisely to
avoid that work: explicit cell and pivot, fg/bg split, per-cell overrides, coverage and exact palettes. Nothing in the source
justifies changing PixelDoll's slot ladder, manifest or exports.

## Adopt

1. **Keep the body as an ordinary entry in the ordered draw list.** Intersect draws `Player` where its list says, which makes
   behind-body gear explainable without a special case. PixelDoll already models the body as slot `body` at z 10; do not
   introduce a separate body compositing path for engine consumers.
2. **Keep validating ordering data against known slots.** Intersect rejects unknown names and deduplicates its lists at load.
   Our export validators already reject unknown slots, wrong-slot references and missing sheets; that strictness is the reason
   missing-art failures surface in the app instead of in a game.
3. **If an Intersect export target is ever requested, treat it as a reduced bake, not a new format.** The target contract is
   small and fully known from this review: 4 rows in down/left/right/up order, one fixed cell per body size, bottom-center
   placement, 4 frames per animation, optional per-animation sheet names, and one art name per gender. Producing it from
   existing layers would mean choosing 4 of 8 views, one cell per move, and a fixed cell, then flattening colors to separate
   PNGs or tint. It would lose diagonals and per-move frame counts. That is a deliberate compatibility target, not a change to
   `pixeldoll/3`; it is not recommended now.
4. **Consider one runtime diagnostic for broken exports.** Intersect's silent skip is the cost of no coverage data. PixelDoll
   has coverage, so a one-time warning when a covered cell's image is absent would turn a hand-edited or truncated export into
   a visible message instead of a bare arm. Not implemented; see open questions.

## Avoid

1. **Implicit cell and pivot.** A 32 × 48 paperdoll only fits a 32 × 48 body, and a mismatch silently misaligns. Do not drop
   the explicit `cell`/`pivot`, and do not collapse held oversize layers into the rig cell.
2. **One global draw order with no fg/bg split.** It cannot draw a cape in front of the torso and behind it in the same view
   with one item. Keep per-item layers and `zOverrides`.
3. **Silent missing art.** Keep mandatory transparent cells for every animation, `Item.coverage`, and export refusal or
   warning. Intersect's "draw nothing" is a defect we already pay to avoid.
4. **Positional slot identity.** An `int` slot and arrays indexed by list position silently reassign saved equipment when the
   config list changes. Keep stable slot ids and `SlotProfile` behavior.
5. **Free-text art names with no check at use.** The editor prevents typos by listing local files, but nothing validates a
   name when the client draws it. Keep referencing sheets through validated manifest paths.
6. **Hand alignment without a body overlay.** The editor preview shows one gear cell on black. Keep pivot-based placement and
   the registration, key, area, grip and frame-consistency gates instead of eyeballing.
7. **Fixed 4 directions and global frame counts.** Do not let a consumer contract force our 8 directions or per-move playlists
   down to that grid silently; expose a reduced bake only when asked.
8. **Baked color variants as separate sheets plus a multiply tint.** It duplicates art and cannot guarantee exact palette
   swaps. Keep owner-local ramps and source sheets.

## Open questions for our architecture

1. **Runtime missing-cell warning.** Would `drawList`/`cellImg` know that a cell is intentionally transparent rather than
   missing? `Item.coverage` can answer it, but the preview and live drafts also render partial items, so the warning needs to
   be limited to exported projects or to items whose coverage includes the cell. Not tested.
2. **Would an Intersect adapter ever be worth it?** It is mechanically feasible from existing sheets, but the visible loss is
   large (diagonals, per-move art, dynamic frame counts, exact palettes). A decision needs a real consumer, not a format
   exercise.
3. **Is a per-animation gear fallback useful to third-party consumers?** Intersect's single walk sheet keeps art sets small.
   PixelDoll's invariant is the opposite: every layer has every animation. A fallback would need a frame-count rule and would
   weaken the "transparent cell" guarantee, so it is probably a no.
4. **How would a server operator ship new gear art?** We did not trace the client updater or pack system, so we cannot say how
   Intersect distributes updated paperdolls. This does not affect PixelDoll's self-contained export, but it matters if an
   adapter is built.

## What was verified, and what was not

Verified by reading the exact files and measuring the shipped PNGs:

- slot list, positional identity, two-handed rule, per-direction orders and their validation;
- the draw loop, body position in the order, bottom-center anchor arithmetic, row order and diagonal reuse;
- the implicit cell size, fixed 128 × 192 paperdolls, varying body cells, per-direction authored gear and the one-cell editor
  preview;
- per-animation sheet lookup and its fallback;
- silent missing-art paths and the multiply tint;
- config, game-data and equipment packets, and the absence of paperdoll art on the server.

Not verified: neither binary was run, so no in-client rendering, animation or misalignment test was performed; the mismatched
cell and frame-count behavior is derived from the arithmetic, not observed; no updater or pack distribution was traced; the
sample `gamedata.db` contains no items, so no real stored paperdoll value was inspected; no paid PixelLab work was done.

## Source map

All paths are relative to the Intersect Engine repository at `c40aa54`.

- Slots, weapon/shield indices, validation:
  [`Intersect (Core)/Config/EquipmentOptions.cs`](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect%20%28Core%29/Config/EquipmentOptions.cs)
- Per-direction draw order, defaults and validation:
  [`Intersect (Core)/Config/PaperdollOptions.cs`](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect%20%28Core%29/Config/PaperdollOptions.cs)
- Frame counts, durations, 4 directions:
  [`Intersect (Core)/Config/SpriteOptions.cs`](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect%20%28Core%29/Config/SpriteOptions.cs)
- Item fields and gender art name:
  [`Intersect (Core)/GameObjects/ItemBase.cs`](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect%20%28Core%29/GameObjects/ItemBase.cs)
- Client draw loop, row picking, equipment draw and alignment:
  [`Intersect.Client/Entities/Entity.cs`](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Client/Entities/Entity.cs)
- Texture center and lookup:
  [`Intersect.Client.Framework/Graphics/GameTexture.cs`](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Client.Framework/Graphics/GameTexture.cs),
  [`Intersect.Client.Framework/File Management/GameContentManager.cs`](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Client.Framework/File%20Management/GameContentManager.cs)
- Editor file list and one-cell preview:
  [`Intersect.Editor/Forms/Editors/frmItem.cs`](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Editor/Forms/Editors/frmItem.cs),
  [`Intersect.Editor/Content/ContentManager.cs`](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Editor/Content/ContentManager.cs)
- Config, game data and equipment packets:
  [`PacketSender.cs`](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Server.Core/Networking/PacketSender.cs),
  [`EquipmentPacket.cs`](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect%20%28Core%29/Network/Packets/Server/EquipmentPacket.cs)
- Two-handed unequip:
  [`Intersect.Server.Core/Entities/Player.cs`](https://github.com/AscensionGameDev/Intersect-Engine/blob/c40aa5447ff48f37ae499a39408ddf715e1ea97b/Intersect.Server.Core/Entities/Player.cs)

PixelDoll references: [`app/src/lib/items/slots.ts`](../../../app/src/lib/items/slots.ts),
[`app/src/lib/items/items.ts`](../../../app/src/lib/items/items.ts),
[`docs/architecture.md`](../../architecture.md) §4 and §5, [`docs/manifest-spec.md`](../../manifest-spec.md),
[`docs/architecture/javascript-runtime.md`](../../architecture/javascript-runtime.md).
