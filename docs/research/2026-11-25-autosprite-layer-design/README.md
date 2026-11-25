# AutoSprite layer-design study (2026-11-25)

Study of [autosprite.io](https://www.autosprite.io/) as a possible model for PixelDoll's paper-doll layers. Read on
2026-11-25 from its public documentation, pricing, API reference, free CC0 asset library, app client bundle, and the two
first-party engine importers it publishes. No account was created, nothing was uploaded, and no paid step was taken.

Evidence labels used below:

- **Documented**: stated on autosprite.io docs, pricing or API pages.
- **Client**: read from the public, minified app bundle at `/_next/static/chunks/app/app/page-f4da5bc59fc4ce43.js`
  (deployment hash `dpl_2Mycp6fx5uUHcEsE8EJdco8HwuDh`). Names below are the readable function or string names in that file;
  they can change without notice.
- **Source**: read from the public GitHub importers, commits
  [`9944d55`](https://github.com/autospriteio/autosprite-unity/tree/9944d55572ff9772bbb61feb3821a4e1a4738722) (Unity) and
  [`7053e33`](https://github.com/autospriteio/autosprite-godot/tree/7053e330838931537adf0227eec3b9c9aff3de50) (Godot).
- **Measured**: computed here on a downloaded free AutoSprite pack or on PixelDoll's stored S2 fixture. Script in
  [`scripts/autosprite-contract-probe.py`](scripts/autosprite-contract-probe.py).
- **Inferred**: a consequence that was reasoned from the above, not observed running the service.

Prior work this does not repeat: the [2026-11-06 Wardrobe review](../tool-spikes-2026-11-06-generation.md) covered the
Wardrobe video and already found no documented layer output. This study adds the current documented contract, the
first-party importer source, the current in-app gear picker, measured output, and the free-tier stopping point.

## The short answer

AutoSprite is an AI spritesheet generator: one character image goes through a video model and comes out as one
composited spritesheet plus an atlas. It does not export equipment layers, has no per-item z order, no per-layer cell or
pivot, and no user-facing masking or layer-split step. Its **Wardrobe** and **Equipment** features are design-time ways
to produce a new dressed character image; the exported animation still bakes every worn item into every frame.

So the board card's premise, that AutoSprite "turns generated art into layered, frame-aligned sprite assets", holds only
for whole sheets. The frame alignment is between whole-sheet cells and clips, not between equipment layers and a base.
What is genuinely close to PixelDoll is its **slot vocabulary and preview anchors** (head, chest, legs, feet, back, right
hand, left hand), not a layer pipeline.

## What it actually does

### Character to animation

- Upload one image or generate one from a prompt; detect the silhouette and humanoid type
  ([Create a Character](https://www.autosprite.io/docs/guide-create-character)).
- Choose preset moves (idle, walk, run, jump, attack, about 30 side-view presets) or a custom prompt
  ([Animation Types](https://www.autosprite.io/docs/reference-animation-types)).
- The service renders a short video at 24 fps, samples an evenly spaced subset into a spritesheet, removes the
  background, and exports a PNG plus a JSON atlas ([Export Formats](https://www.autosprite.io/docs/reference-export-formats)).
- A cloud pipeline can also build a rigged GLB, 3D animation clips and cutscenes. Those are adjacent products, not
  sprite layers, and were not evaluated.

### Directions

- **Sidescroller**: one right-facing animation; the game flips it for left. One render, one price.
- **Isometric 8-direction pack**: one render produces eight sheets, all eight views really rendered, 15 credits per
  action. Sheet names name the direction, for example `iso_walk_up` and `iso_walk_left`.
- **Individual isometric directions**: only five kinds exist (`up`, `northeast`, `right`, `southeast`, `down`); left,
  northwest and southwest are mirrored from their east-side pair in the game. Each direction is billed separately.
- **RPG Maker export** requires actual Down, Left, Right and Up sheets from one pack generation, three poses per
  direction.

PixelDoll already models the same two axes explicitly: `RigDirection.mirrorOf` is data, Top-down 8 mirrors the west views
by default, and Unique 8 renders independent views. AutoSprite's default 8-direction pack is closer to Unique 8, but only
as a paid whole-pack render, not as a per-direction option.

### Frames and timing

- Source video is 24 fps. The **Frames** setting selects 16, 25, 49, 64, or MAX, where MAX is every extracted frame
  capped at 144. Packs cap at 56 frames (39 for jump). 16 and 25 are free; the rest need a paid plan.
- Idle, walk and run loop automatically: the clip ends on its first pose, the sheet drops the repeated end pose, and the
  atlas marks the loop. Jump and attack play once.
- The atlas carries frame rectangles, durations, `meta.fps`, and `meta.pivot`. Individual frame durations are relative
  units (the generator often emits 1 for every frame), not milliseconds.
- Attack moves are a separate contract: each move's cell is **twice** `frameSize`, while the character keeps its pixel
  size and stands bottom-centre. The docs tell the user to draw the move at half scale or anchor it bottom-centre so it
  lines up with idle and walk.

PixelDoll instead stores an explicit cell count and a playlist of `{cell, ms}` entries per clip, including holds,
ping-pong and intentional play-once moves. It never resamples a video. AutoSprite's model cannot express a hold or a
nonuniform playlist except through per-frame durations; its RPG Maker export additionally forces three poses per
direction, dropping the rest.

### Geometry: one pivot per sheet, inferred from content

Documented atlas metadata:

```json
"meta": { "pivot": { "x": 0.494, "y": 0.977 } }
```

The docs define `meta.pivot` as "where frame 0's feet stand, as fractions of the cell (0 to 1 from the top left)" and
tell consumers to anchor sprites there so animations with different cell sizes line up
([Spritesheets API](https://www.autosprite.io/docs/api-spritesheets)). The pivot is therefore **derived from frame 0's
pixels and supplied per sheet**, not stored once per character rig.

The free CC0 Knight pack lets this be measured without an account. Its `idle`, `walk` and `run` sheets are 25 frames of
384 x 384 in a 5 x 5 grid, and its atlas has no `meta.pivot` at all (only `app`, `frame_size` and `size`). Measured on
those sheets:

| Sheet | Frame-0 feet row (of 384) | Feet range across frames |
|---|---:|---:|
| idle | 289 | 289 |
| walk | 293 | 292 to 301 |
| run | 284 | 283 to 296 |

The frame-0 feet differ by 9 px between idle and run, and all-frame feet range over 18 px. At a 64 px cell that is about
1.5 px and 3 px. A consumer that anchors each sheet at its own frame-0 feet follows the ground; a consumer that centers
the cell, or uses one pivot for all sheets, gets a visible vertical step when the animation changes. The first-party
importers do the latter, see below.

AutoSprite's fix for limbs that exceed the frame is **padding the whole character**: `POST /characters/{id}/pad` with
`characterSize` from 20 to 100, 1 credit, free at 100 ([Characters API](https://www.autosprite.io/docs/api-characters)).
That shrinks the character inside every future sheet, including its other moves and directions. PixelDoll instead pads
only a held-item layer (`padOf`), keeps the body cell and the world scale, and shares the body pivot.

### Equipment: picker, paint, bake

This is the part closest to a paper doll and the part most easily misread.

The current app has an **Equipment** switch and seven gear slots: `head`, `chest`, `legs`, `feet`, `back`, `right`,
`left` (client strings and `sA` in the bundle). A gear library ships pieces such as `head-knight`, `chest-plate`,
`back-cape` and `sword-standard`, and users can upload their own. The preview places slot icons on a diagram of the
uploaded character. The anchors are computed from the character image's alpha: the first and last non-empty rows, fixed
fractions of that span for head, chest, legs and feet, and left/right arm extents for the hands (`sZ`, `sV`). Picking the
same piece in both hands is prevented (`pick` clears the opposite hand when the `rowId` matches).

Those anchors are **preview furniture**, not exported geometry:

- The user presses **Suit up**, which calls a paint job with a `slot:rowId,...` list (`paintDressedPicture`) and returns
  one result URL after polling (`getCustomFrameJob`). The anchor coordinates are not part of that request; only the slot
  and item ids are.
- The result is a **single dressed picture**, fetched by `getDressedPicture` and used as the character's appearance.
- The Equipment switch's own text says "Gear on: Turbo animations use it. Turn it off to animate the plain character
  (it stays saved)." The gear is therefore an input to the Turbo animation, not a layer in the export.
- The public contract has no mask, no background/key extraction, no automatic split, no per-frame registration, no z
  field, no fg/bg split and no layer file. Occlusion is decided by the paint model (inferred from the single painted
  result; the server internals are not public).
- Swapping afterwards means choosing other gear and suiting up again, or editing/regenerating the animation. There is no
  post-export equipment swap.

The gear PNGs themselves are 512 x 512, single-view, 3D-ish renders with soft edges (for example
[`/gear/head-knight.png`](https://www.autosprite.io/gear/head-knight.png) and
[`/weapon-looks/sword-standard.png`](https://www.autosprite.io/weapon-looks/sword-standard.png)). They are concept
pieces to be repainted onto a character, not pixel-aligned layers.

The **Wardrobe** (documented in the earlier Wardrobe review) is the other design-time path: generate four outfit
candidates from a prompt or theme, optionally paired with a saved pose, then use the chosen image as the animation
reference. It also produces whole dressed images, not layers.

### Naming, packing, export

- One sheet per animation, or per direction for an isometric pack. Sheet kind names are `idle`, `walk`, `run`,
  `iso_walk_up`, `iso_attack_southeast`, custom names as typed.
- Atlas frames are numeric keys or `<anim>_<dir>_<n>` in the documented example. The atlas has frame rectangles, an
  animation list, `meta.framerate` or `meta.fps`, `meta.size`, `meta.frame_size` and, on newer sheets, `meta.pivot`.
- A ZIP can include each animation's sheet, atlas and individual frames. Other formats: GIF (watermarked on free
  accounts), RPG Maker native PNGs, Stream Avatars, and a full-character ZIP.
- No layer directory, no equipment manifest, no per-item material or palette data.

PixelDoll's export is the opposite shape: `layers/<slot>/<item>/<layer>/<anim>.png`, a manifest with per-layer cells and
pivots, z, hides, fg/bg, materials and playlists, plus per-engine files. The manifest is the authority, and every layer
has a transparent cell for every target cell.

### First-party engine importers

AutoSprite's strongest documented differentiator is integration. Both official importers auto-slice a sheet and build
engine assets:

- **Unity**: `SpriteSheetImporter.ImportSpritesheetFromAtlas` converts the atlas and calls `BuildSpriteRects`, then
  builds `AnimationClip`s and an `AnimatorController` with a prefab
  ([`SpriteSheetImporter.cs`](https://github.com/autospriteio/autosprite-unity/blob/9944d55572ff9772bbb61feb3821a4e1a4738722/Assets/AutoSprite/Editor/SpriteSheetImporter.cs#L326-L428),
  [`AnimationBuilder.cs`](https://github.com/autospriteio/autosprite-unity/blob/9944d55572ff9772bbb61feb3821a4e1a4738722/Assets/AutoSprite/Editor/AnimationBuilder.cs#L12-L67)).
- **Godot**: `import_sheet` builds one `SpriteFrames` per character, adds one animation per sheet, and writes an
  `AnimatedSprite2D` scene ([`importer.gd`](https://github.com/autospriteio/autosprite-godot/blob/7053e330838931537adf0227eec3b9c9aff3de50/addons/autosprite/importer.gd#L13-L98)).

Three source-level behaviors matter for the comparison:

1. **The documented pivot is not used.** For the atlas the extension actually downloads, Unity's conversion sets every
   frame pivot to `(0.5, 0.5)` (`SpriteSheetImporter.cs` lines 382 and 420 to 424) and never reads `meta.pivot`. (The
   importer can read a per-frame `pivot` from its own `SpriteSheetMeta` JSON, but the AutoSprite download path passes
   the atlas through `ConvertAtlasToMeta`, which fills 0.5.) Godot uses `AtlasTexture` regions and the default
   `AnimatedSprite2D` centered origin; it never reads `meta.pivot` either (`importer.gd` lines 66 to 80 and 135 to 143).
   Neither importer applies an offset. Any cross-clip feet difference has to be corrected by hand, and the 9 px sample
   above becomes visible drift.
2. **Cell width becomes world scale.** Unity sets `pixelsPerUnit` to the atlas frame width (line 421), so the 2x attack
   cell imports at half world scale relative to a 1x idle cell unless the user edits it. The docs warn about the 2x cell
   but the importer does not compensate. PixelDoll's manifest makes the base `pixelsPerUnit` authoritative for every
   layer and states that a layer's width must never set world scale.
3. **Loop is forced.** Godot sets every imported animation to loop (`importer.gd` line 63); Unity's atlas conversion
   defaults `loop = true` (`SpriteSheetImporter.cs` line 411). Jump and attack are documented as play-once, so the user
   must edit them after import. PixelDoll stores `loop` per clip and exports it.

These are not guesses about hidden internals: they are the shipped public source of the importers AutoSprite recommends.
They also show why "pivots and baselines match for seamless swaps" on the marketing page is a claim about the art, not a
guarantee of the toolchain. The art can share a ground line; the importers do not preserve it.

## Free tier and where the tool stops

Documented free plan ([Credits and Pricing](https://www.autosprite.io/docs/reference-credits)):

- 15 credits per month, enough for about three spritesheets.
- 3 bonus credits per daily login; 10 one-time Discord bonus.
- 2 spritesheet exports per month.
- Turbo video tier only (2 s, 5 credits).
- 16 or 25 frames; 128 or 256 px; default background removal only, not Ultra.
- GIF export carries a watermark. RPG Maker export needs all four directions from one pack generation; a free account
  can unlock them with one unlock per pack generation.
- Paid plans start at Starter, $12/month, 500 credits, all tiers, 49/64/MAX frames, 512/MAX resolution, unlimited exports.

The live app is **sign-in only**. `/app` renders "Sign in to continue" with Google or an email link; there is no guest
mode, demo upload or anonymous generation, and the REST API and MCP server both require an API key. Because the brief
forbids creating an account, the actual flow stops at the sign-in page. No upload, no gear pick, no Wardrobe batch, no
generation and no export were performed.

This is a finding, not a failed experiment: the free tier is free credits, not a free anonymous tool. The public CC0
library is the only way to inspect real output without an account.

## Reproduction on stored PixelDoll frames

Two offline probes were run. Both use the script in `scripts/autosprite-contract-probe.py`; it reads PNGs with Pillow
and writes only to a scratch folder. No app code changed and no output was added under `app/`.

### Probe 1: a real AutoSprite export

Downloaded the CC0 Knight pack (`idle`, `walk`, `run`; 25 frames of 384 px each) from
[the free library](https://www.autosprite.io/free-sprite-sheets/knight). Findings:

- 17.2 to 19.0 percent of visible pixels have partial alpha (idle 17.18, walk 17.93, run 18.96). The output is soft-edged,
  not binary alpha. PixelDoll's contract is alpha 0 or 255; a layer with 17 percent partial alpha would introduce
  blended colors that the exact-ramp recolor model does not cover, and would complicate the "every pixel comes from
  PixelLab, then is keyed" cleanup.
- The atlas has no `meta.pivot`, no `animations` list and no `fps`; it is an older library export than the current docs
  describe. So the free pack proves the grid/alpha shape, not the newest metadata.
- Frame-0 feet are at rows 289 (idle), 293 (walk) and 284 (run); a consumer with one pivot or a centered origin gets a
  9 px vertical step between idle and run. The first-party importers are exactly such consumers.

### Probe 2: project the S2 fixture into the AutoSprite contract

The stored fixture `app/public/fixtures/s2/` has one 64 px cell, pivot `(32, 64)`, four directions with mirrored west,
two clips (walk 8 cells, cross-punch 6 cells), a base and five accepted items. The probe composes the first preset by z
into one flat strip per clip and authored direction, writes an AutoSprite-style atlas with numeric frames and
`meta.pivot = frame 0 feet`, and measures what the flat contract loses:

| Item | Opaque px in authored frames | Share outside the body silhouette |
|---|---:|---:|
| vest_leather | 3,863 | 4.6% |
| cape_red | 11,687 | 63.1% |
| hair_brown | 3,658 | 53.0% |
| helmet_steel | 3,934 | 46.8% |
| sword_steel | 2,759 | 95.3% |

The sword is almost entirely outside the body, and the cape, hair and helmet are half outside. A flat sheet has to bake
all of that into the body frame; a separate layer is what lets the sword sit above the arm, the cape split behind the
torso, and the helmet hide the ears.

Swapping `helmet_steel` for `hat_wizard` changes 26.2 percent of the dressed pixels in walk south cell 0, 27.8 percent in
east cell 0, 15.8 percent in north cell 0, and similar shares at the last cell. In the flat contract that is a per-frame
repaint or a new generation for every frame of every clip and direction. In PixelDoll it is one item in one slot, reused
by every outfit.

The same arithmetic explains the combinatorial gap. Five independent optional items need 6 item sheets per animation in
PixelDoll (base plus five, each reused in every combination). AutoSprite would need one full sheet per combination for
the same independent-slot coverage, so 2^5 = 32 full outfit sets and a generation per set per animation. The probe writes
the flat prototype to a scratch folder rather than the repo, because it is a data-model demonstration, not artwork from
AutoSprite.

The fixture's frame-0 feet are all at row 64 (the rig pivot) in the frames that exist, so its own pivot inference is
trivial. The partial cross-punch coverage (south only) makes the east and north prototypes empty; that is a fixture
limitation, not an AutoSprite behavior.

## Comparison

| Concern | AutoSprite | PixelDoll |
|---|---|---|
| Unit of output | One composited character per sheet; one sheet per animation or direction | Base plus independent fg/bg item layers, one sheet per layer and animation |
| Directions | 8 real renders in a pack, or 5 + mirrored west in individual mode; 1 + flip side view | Explicit `DirectionName` with `mirrorOf`; 2, 4 or 8 views; Unique 8 independent |
| Frames | Video at 24 fps sampled to 16/25/49/64/MAX; loop reuses first frame; RPG Maker forces 3 poses | Explicit cell count and `{cell, ms}` playlist; holds, ping-pong and play-once are data |
| Geometry | One cell per sheet; frame-0 feet pivot; whole-character padding; 2x attack cell at bottom-centre | One rig pivot; per-layer cell + pivot; held-item pad shares the body pivot; one world scale |
| Equipment | Gear picker with 7 slots and preview anchors, then a paid painted picture; no mask, split or z | Chroma-dressed keyframe, skeleton pose per move, extraction, fg/bg split, z ladder, hides, tuck-under |
| Item swap | Re-pick gear and repaint, or regenerate; whole-sheet swap in the game | Equip, hide and recolor at runtime; per-preset outfit data |
| Naming and pack | `idle`, `iso_walk_up`, numeric or `<anim>_<dir>_<n>` frames; sheet + atlas | `layers/<slot>/<item>/<layer>/<anim>.png`; manifest with cells, pivots, z, materials |
| Validation | Browser preview, FPS/loop, frame strip editor, RPG Maker pose preview; no documented alignment gate | Alignment, key, area, design, grip, shape and stray-pixel gates; optional human review |
| Engine import | First-party Unity/Godot importers; they ignore `meta.pivot`, use cell width as PPU and force loop | Manifest plus native controllers; pivot, base PPU and per-clip loop are part of the contract |
| Free tier | 15 credits/month, 3/day, Turbo only, 2 exports, 16/25 frames; account required | Free client; the user pays PixelLab directly with their own token |

## What is genuinely new here

- The 2026-11-06 Wardrobe review was video-only and found "no documented layer output". This study confirms that from
  the current docs, API, client and first-party importers, and adds the current **gear picker** with its seven slots,
  alpha-derived preview anchors, right/left exclusivity and paid paint job. The picker is a stronger paper-doll
  vocabulary than the video showed, but it still bakes.
- The importer behavior (ignored pivot, per-sheet PPU, forced loop) is source-level and new. It turns the marketing
  claim about pivots and seamless swaps into a concrete toolchain drift.
- The measured soft-alpha share, cross-clip feet spread and flat-sheet loss on PixelDoll frames are new evidence. The
  2026-11-10 external-layer review studied base subtraction and palette cleaning, a different question, so none of this
  repeats it.

## Adopt

1. **Keep the layer-first pipeline and treat whole-character generation as out of scope.** AutoSprite's own equipment
   flow cannot swap an item without repainting the base and regenerating the moves. Consequence: reject any proposal to
   replace layers with a per-outfit video or image generation route; the layer count and reuse are the advantage.
2. **Keep the explicit rig pivot and base world scale non-negotiable in every export.** AutoSprite's content-derived
   per-sheet pivot and per-sheet PPU are exactly the drift PixelDoll's manifest prevents. Consequence: any new exporter
   must write `rig.pivot` (or the layer pivot) and `export.pixelsPerUnit`, never a sheet-width-derived scale, including
   for a double-size held layer.
3. **Keep binary alpha and explicit z.** The free AutoSprite output is 17 to 19 percent soft alpha, and its paint model
   decides occlusion. Consequence: do not accept external soft-alpha sheets into a PixelDoll project without a
   binarize-or-warn step; keep `alpha 0 or 255` in the export invariants.
4. **Keep per-clip loop and playlist data.** Their own importers force loop on every animation, including jumps and
   attacks. Consequence: every engine exporter must read `loop` and the playlist; no global "loop everything" default.
5. **Use the gear slot vocabulary only as UX language, not as a data model.** Head, chest, legs, feet, back, right and
   left are familiar to players. Consequence: if a future starter library or preset picker needs those words, reuse the
   existing slot catalog and labels; do not add a second anchor or paint step.

## Avoid

1. **Do not infer a pivot from frame 0's alpha.** It is content-dependent and the toolchain that ships with it ignores it.
   Consequence: no auto-pivot in any import or creation path; an imported sheet that lacks a pivot should ask for one or
   align to the rig, not guess.
2. **Do not derive world scale from a sheet's cell width.** The 2x attack cell is the proof: the same character becomes
   half-size in Unity unless the user edits PPU by hand. Consequence: per-layer cells are allowed, per-layer world scale
   is not.
3. **Do not use whole-character padding as the oversize fix.** It shrinks the character in every move. Consequence: keep
   `padOf` per held layer, and never add a `characterSize`-style global pad.
4. **Do not make 5-direction mirrored views the default for asymmetric equipment.** The pack's 8 real renders are
   better for a sword hand, but they cost a whole pack; PixelDoll already exposes Unique 8. Consequence: keep mirroring
   explicit and per direction, and do not promise a mirrored west is equivalent for held items.
5. **Do not truncate a walk to three poses without gait selection.** AutoSprite's RPG Maker export does that and asks the
   user to adjust. PixelDoll already selects standing, stride A, passing and stride B from keypoints or foot phase.
   Consequence: keep the existing RPG Maker selection; do not simplify it to "first, middle, last".
6. **Do not market whole-sheet swaps as item swaps.** Consequence: describe exports as layered equipment, and describe
   any whole-character variant as a separate costume or baked sheet.

## Open questions

1. **Would a curated starter gear library help onboarding?** AutoSprite's gear picker is fast to understand, but its
   pieces are concept renders, not layers. Consequence: test a small library of existing PixelDoll items before building
   any picker; no new pipeline until users ask for it.
2. **Should PixelDoll publish first-party Godot/Unity importers?** AutoSprite's editors are its best feature and also the
   source of its pivot, scale and loop drift. Consequence: only consider an importer that consumes the manifest and
   reuses the existing runtime contract; measure maintenance before promising it.
3. **Is per-frame trim metadata useful to any PixelDoll consumer?** AutoSprite exports optional `trim` rectangles, but
   its own importers ignore them and use whole cells. Consequence: keep untrimmed cells; revisit only with a named engine
   that cannot use whole cells.
4. **Does a four-candidate outfit batch fit PixelDoll's consent rules?** It multiplies a paid request four times and
   hides which candidate will be accepted. Consequence: do not copy it without a priced, explicit review flow; the
   current single standing design is cheaper and clearer.
5. **How much of AutoSprite's motion quality comes from the video model rather than the sheet contract?** The free pack
   cannot answer this, and no generation was run. Consequence: do not infer that video-sampled frames are better than
   skeleton-posed frames from the marketing examples alone.

## What could not be verified

- No account, upload, gear paint, Wardrobe batch, generation or export. The live tool stops at sign-in; the free-tier
  quotas and the "Suit up" price were read, not exercised.
- The absence of a layer export is a documented and source-level absence, not proof that no unlisted internal feature
  exists. The public REST API, export docs and both importers expose only whole sheets; the MCP tool list was not fully
  enumerated.
- The free CC0 pack is older than the current docs: its atlas has no pivot, animation list or fps, so its measurements
  demonstrate the grid and alpha shape, not the newest metadata. Newer app exports may add `meta.pivot` and `trim`.
- The Unity and Godot importers were read, not run in an editor. The pivot, PPU and loop findings are static source
  behavior; an engine run could reveal additional handling outside these files.
- The gear picker's server-side paint behavior is inferred from client calls (`paintDressedPicture`,
  `getDressedPicture`, `getCustomFrameJob`) and UI strings. Whether the painted picture is passed as a reference image or
  baked before animation was not observed, and the public docs do not describe it.
- No quality comparison of motion, item fit or direction consistency was possible without generations.

## Sources

- [AutoSprite home](https://www.autosprite.io/), [introduction](https://www.autosprite.io/docs/introduction),
  [how to use](https://www.autosprite.io/docs/how-to-use), [FAQ](https://www.autosprite.io/docs/faq)
- [Animation types](https://www.autosprite.io/docs/reference-animation-types),
  [export formats](https://www.autosprite.io/docs/reference-export-formats),
  [credits and pricing](https://www.autosprite.io/docs/reference-credits), [pricing](https://www.autosprite.io/pricing)
- [Spritesheets API](https://www.autosprite.io/docs/api-spritesheets),
  [characters API](https://www.autosprite.io/docs/api-characters),
  [assets API](https://www.autosprite.io/docs/api-assets)
- Public app bundle: `https://www.autosprite.io/_next/static/chunks/app/app/page-f4da5bc59fc4ce43.js` (gear slots,
  `paintDressedPicture`, `getDressedPicture`, `getHeldItems`; read 2026-11-25)
- Free CC0 pack: [Knight](https://www.autosprite.io/free-sprite-sheets/knight), files under
  `https://pub-63ab27389d044634a73e89c1a0c6d4a6.r2.dev/free-library/sprite-sheets/knight/`
- [AutoSprite Unity extension](https://github.com/autospriteio/autosprite-unity) at `9944d55`,
  [Godot extension](https://github.com/autospriteio/autosprite-godot) at `7053e33`
- PixelDoll: `app/public/fixtures/s2/`, [architecture.md](../../architecture.md),
  [manifest-spec.md](../../manifest-spec.md), [javascript-runtime.md](../../architecture/javascript-runtime.md)
