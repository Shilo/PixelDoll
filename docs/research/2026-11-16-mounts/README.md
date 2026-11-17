# Research spike: mounts, riders and pets in 2D paper dolling

Date: November 16, 2026. Status: research complete; implementation not approved by this document.

Tracking: [Research 2D mounts and paper-doll integration](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=306758583).

## Recommendation

**Try it yourself:** [Plain-language preview instructions](try-the-preview.md) explain the single test-mount toggle across Preview, Top-down and Side-scroller, without making any paid request. The earlier two-seat comparison remains research evidence, not the current UI.

**Branch experiment:** [Live trial plan](live-trial-plan.md) separates optional rider poses, external fixtures, conditional runtime additions and the bounded paid test. The real Studio prototype is implemented in an isolated worktree. [Trial results](live-results.md) record observed behavior and the remaining qualification gates; this is not a universal mounting claim.

**Interactive comparison:** [Prototype notes](prototype-notes.md) explain whole-rider layering, permanent far-leg removal and preserved rider parts, with an [adjustable schematic](mount-methods.html). This demonstrates overlap behavior, not automatic pose generation or qualified wardrobe support.

**Broader council comparison:** [Mounting architectures](architecture-comparison.md) compares authored poses, action reuse, cutouts, live rigs, depth sprites, 3D pipelines and automatic warping. It does not assume runtime leg masking is the right solution, and records corrections to the initial probe.

**Runtime masking follow-up:** [The runtime occlusion probe](runtime-occlusion.md) tests 171 stored frames and documents LPC's actual side-view crop/redraw recipe, MapleStory-compatible attachment metadata and skeleton-driven rendering precedents. Rider-only runtime partitions are worth qualifying, but the tested automatic masks do not establish universal standing-to-riding conversion.

**External-mount API follow-up:** the [API boundary and phased plan](external-mount-api.md) recommends proving host-side integration with existing rider operations before adding any new API or Mount slot. A ghost mount would be external scene artwork, not a paper-doll item. The broader selector/artwork proposals below remain possibilities, not the recommended first implementation.

**A Mount selector makes sense, but it should select a mounted presentation, not generate a garment over the standing body.** Keep the rider inside the paper-doll system; attach independent mount artwork to it. Do not implement the slot until its pose and composition contract is qualified. An entirely separate character renderer or runtime skeleton is unnecessary.

A future interface could reasonably call its selection a **Mount** slot. That selection must mean "choose a mount and its supported riding presentation," not "paint another garment over the standing body." The missing work is mounted rider art, fitting, timeline coordination and occlusion, not an extra slot name.

The strongest reusable baseline is **one shared riding pose per direction, dressed once per item, with mounts authored to fit that pose**. A mount-frame seat offset can supply the bob. This reverses the problem: fit each mount's saddle to a stable rider, rather than regenerate the rider for each mount. It targets a broad saddle-shaped family, not every arbitrary animal or vehicle.

For an already dressed character with no new art, try existing standing/action frames first on platforms or enclosing mounts. ClassicUO also demonstrates a more creative possibility: transforming horizontal sections of standing body and equipment sprites into chair sitting. That makes procedural pose reuse worth an offline comparison, but its actual riding path uses mounted animation groups. It is not evidence that a generic standing-to-horse conversion works [U1-U4].

**Pets are different.** A follower that does not change the rider is a separate scene entity with its own animation and position. A companion selector may make sense in a game's UI, but not as a layer of the character's paper doll. One creature can have companion and mount behaviors without those sharing a rendering contract.

These are recommendations, not claims that PixelDoll already generates usable mounted artwork. No generations, gameplay sessions or mounted-art quality tests were run for this spike.

## Scope and evidence quality

Research combined online search, direct reading of pinned public source/data, PixelDoll source inspection, and an independent **Claude Opus 5.5, medium effort** investigation. The coordinator checked the material behind the recommendation rather than treating the delegate's conclusions as proof.

- **Source-verified:** visible in linked code or animation data. Community clients, copied assets and decompiles are identified, not passed off as official engine source.
- **Author-documented:** a creator describes the mechanism or limitations; the downloadable implementation was not executed here.
- **Proposed:** an engineering inference or experiment for PixelDoll, not a tested capability.

This sample does not establish a universal method, identical behavior across game versions, or permission to redistribute cited artwork under PixelDoll's MIT license.

## 1. What the games actually do

### Ultima Online: an equipment mount, shared riding groups, and a separate sitting trick

**Source-verified in ClassicUO, a community implementation, not Origin's original client source.** This is the most relevant reference for independently animated clothing. The inspected code has an explicit equipment `Layer.Mount = 0x19`; `MobileView.Draw` fetches it, resolves the mount animation, draws the mount and adjusts the rider's vertical position. `Mounts` maps mount item graphics to animation bodies and vertical offsets, including horses, ostards, llamas and other shapes [U1, U3]. A mount can therefore be represented as equipment while still receiving special composition behavior. "Slot" and "separate artwork" are not alternatives.

For the inspected human MUL animation path, `MobileAnimation.GetGroupForAnimation` chooses mounted movement groups 23/24 and mounted idle 25, or 28 when holding the relevant light. The human equipment loop resolves each wearable's animation graphic and passes the rider's animation group, index and direction into `DrawInternal`. That means an outfit is assembled from corresponding animated body and equipment artwork, not repositioned solely by moving the naked body [U1, U2]. Other client formats/species have additional mappings; these numeric groups are not a universal export contract.

**The reusable unit is a riding action shared across mount types, not clothing painted onto each horse.** The inspected mapping does not choose a different rider pose family for every mount graphic. Per-mount offsets help place the reusable rider. This is strong architectural precedent for keeping paper dolling while adding riding poses. It does not prove all garment assets contain every mounted group or that arbitrary third-party mounts fit [U1-U3].

Equipment draw order is direction-specific through `LayerOrder.UsedLayers`. The mount is drawn before the rider in this path; there is no generic mount-foreground pass here. Do not infer a universal far-leg / horse / near-leg split from this implementation. Existing art, frame origins and coverage rules contribute to the final silhouette [U1, U3]. These are **world animation layers**, distinct from the static inventory paper-doll window.

**The creative reuse discovery is chair sitting, not riding.** In the separate `TryGetSittingInfo` branch, ClassicUO selects standing group/frame zero for ordinary humans and can set `charSitting`. `CalculateSitAnimation` establishes waist/knee/foot boundaries from the body, then intersects each equipment sprite with those same body-space boundaries. `Batcher2D.DrawCharacterSitted` renders up to three textured sections: the upper section shifts sideways by eight pixels, the middle section shears between the upper and lower positions, and the lower section remains on its lower alignment. Special body/direction cases also exist [U1, U4].

This is genuine procedural reuse of a dressed sprite, not just an opaque object hiding feet. However, it does not reconstruct anatomy, reveal hidden pixels, independently grip reins or separate near/far legs. A chair-like shear is not a general straddle. PixelDoll's different proportions and smaller pixel grids would require body-relative, integer-pixel treatment rather than copying UO's constants. A shared transform should use body coordinates, never independent percentages of each garment's cropped image.

**Historical limit:** these sources establish how a modern community client renders traditional UO assets. They do not establish when each technique first shipped in the official game, or that procedural sitting was present in 1997. The takeaway is the verified rendering mechanism, not an invented original-engine history.

### Graal: your memory has a real mounting counterpart

**Source-verified, with provenance limits.** Graal's historical developer documentation describes GANI animations as positioned components, including separate `BODY`, `HEAD` and `HORSE` inputs [G1]. A third-party copy of `ride.gani` selects lifting/grabbing body poses rather than walking poses, combines horse/head/hat sprites, and changes rider-component vertical offsets by two pixels between phases [G2].

This is frame reuse, not proof of skeletal bending or simply hiding a normal walk's legs. The asset has no explicit lower-body mask operation. Its list places horse before body; the original client's painter behavior and resulting pixels were not executed. The copy is not authenticated as every Graal Classic version's shipped asset.

**Lesson:** mounting can reuse action poses in a multipart animation. Your recollection need not have been swimming, but arbitrary PixelDoll clothes still require qualification.

### Tibia-compatible OTClient: select mounted outfit artwork

**Source-verified community client, not CipSoft's proprietary client.** `Creature::internalDrawOutfit` draws the mount, then selects the rider's second Z pattern when available. An outfit with one Z pattern uses the first instead. Outfit add-ons and tint-mask passes use the selected pattern [T1].

This supports mounted outfit artwork and mount/rider displacement adjustment. It does **not** prove every outfit has mounted art, that displacement is an animated seat track, or that Tibia uses PixelDoll's independent per-garment schema.

**Lesson:** a distinct mount and customizable mounted rider can coexist. A drawable standing fallback is not proof of acceptable art.

### Terraria / tModLoader: mount layers and rider positioning

**Source-verified extension API and example.** tModLoader exposes back/front mount textures and optional extra layers; its draw hook identifies each texture pass [R1]. The example defines animation-state frame ranges, `playerYOffsets`, `playerHeadOffset` and `bodyFrame` [R2].

These explicitly integrate rider presentation with mount animation. The example's `bodyFrame = 3` is not, alone, proof that frame 3 means "seated" for every mount. The API supports multiple passes; not every mount must supply them all.

**Lesson:** separate art, rider offsets and front/back ordering are practical sprite tools. This side-view case does not prove an eight-direction solution.

### Stardew Valley: a still riding pose can be enough

**Source-verified historical decompile, not official source or a current-version guarantee.** The inspected `Horse.cs` identifies assembly version `1.2.6400.27469`. It selects farmer frames 113/106/107 by direction, mirrors the side pose, and sets rider Y offset from the horse animation phase. Facing down with a rider, it issues an additional draw of a small horse-texture region after the base draw [S1].

A suitable rider pose plus synchronized displacement can do much of the work without a rider leg-animation cycle. The extra patch demonstrates direction-dependent drawing; its interaction with every other draw pass was not executed here.

**Lesson:** test a still seated pose before building full mounted locomotion. Historic frame indexes and bob amplitudes are not universal rules.

### Pokemon Emerald: two shortcuts in one game

**Source-verified matching-decompilation project, not an official source release.** Graphics declarations use dedicated bike and Surf character sheets [P1]. Surf helpers synchronize a separate surf-blob sprite's facing/position and copy its bob to the player, with an optional player offset [P2].

The bike PNGs provide a combined-presentation route; Surf demonstrates separate carrier/rider sprites. Neither demonstrates freely swappable clothing, so neither solves PixelDoll's garment fitting.

**Lesson:** full-presentation replacement and separate rider/carrier composition are both viable. Retaining live outfit changes determines which is useful here.

### RPG Maker MV: avoid drawing a rider

**Source-verified published core script.** `Game_Player.updateVehicleGetOn` makes the player transparent; vehicle updates synchronize it with the player [V1].

This is a counterexample, not a horse-paper-doll implementation: boats, ships or airships can communicate transport without showing a customizable body.

**Lesson:** enclosed transport can skip seated art. It does not solve visible horseback riding.

### LPC Horse Riding: the closest cut-and-splice experiment

**Author-documented asset/tool experiment, not a shipped-game claim.** bigbeargames describes reusing existing LPC frames, offsets and cutouts. The author reports incompatibility with robes, capes, skirts, dresses, wings and tails, and requires matching equipment because female riders also use male legs [L1].

This directly addresses the clever shortcut: it can work in a standardized sprite family, but its author records the clothing/body limitations PixelDoll must overcome. The archive algorithm was not executed. Search returned the author's text; direct opening was blocked.

**Lesson:** splicing is not impossible, but it is not proven arbitrary-character support.

## 2. Can drawing a mount over a standing character make it sit?

**An intentionally designed illusion can sometimes work. A generic mask cannot create a sitting pose.** Removing pixels cannot create bent knees, foreshortened thighs, a changed torso or a hand gripping reins. This is a composition limitation, not a PixelLab-specific claim.

| Technique                                   | What it can achieve                                            | Where it fails                                                        | Judgment for PixelDoll                               |
| ------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| One opaque mount in front                   | Hide legs/lower body                                           | Also hides near legs, boots, hands, shields or capes that should show | Deliberately enclosing designs only                  |
| Clip the composed outfit below a cutoff     | Upper body above cockpit/saddle wall                           | Artificial waist edge; side views need seated legs                    | Restricted art direction                             |
| Shaped, direction-specific mask             | More careful lower-body hiding                                 | Cannot redraw anatomy; must affect clothes too                        | Offline comparison, not automatic fallback           |
| Splice torso/legs/hands from action frames  | Build a pose without drawing every pixel                       | Needs suitable poses, part boundaries and aligned clothes             | Experimental for standardized bodies                 |
| Transform body-space horizontal sections    | Reuse the dressed standing pose, as chair sitting in ClassicUO | Sheared pixels, seams and unchanged anatomy; no independent leg depth | Worth an offline experiment, not default riding      |
| Mounted body pose with matching item layers | Correct silhouette and live outfit changes                     | New pose coverage and garment review                                  | Preferred candidate for open saddles                 |
| Bake dressed rider and mount together       | Authored occlusion and simple playback                         | Outfit changes require recomposition; combinations multiply           | Optional delivery, not replacement for source layers |

A cloud, surfboard or standing platform may correctly use standing art. A tub-shaped slime, cockpit or basket may correctly hide legs. An exposed horse/wolf saddle more strongly calls for straddling geometry. These are proposed art constraints, not claims about every game's designs.

Perspective matters: a convincing south-facing cutoff says little about east/west. Test a side view before spending on eight directions.

## 3. PixelDoll has part of the machinery, not a mounting system

Local source inspected at `fa1e9b3fb0642cdf5be841d1015a426197966763`:

| Existing contract                                                                                 | Reusable part                                                       | Missing mount behavior                                                                                             |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [`items.ts`, `SLOTS`](../../../app/src/lib/items/items.ts)                                        | Equipment selection and generation classes                          | No mounted-body production path; app classes are base/rigid/held/worn                                              |
| [`rig.ts`, `RigAnimation`, `AnchorTrack`](../../../app/src/lib/rig/rig.ts)                        | Frozen poses, directions, playlists and authoring anchors           | No first-class second actor, mount clip or runtime seat-attachment contract                                        |
| [`manifest.ts`, `Layer`, `ZOverride`](../../../app/src/lib/store/manifest.ts)                     | Oversized cells/pivots; order overrides by direction, move and cell | Static pivots are not per-frame parent/child seat constraints                                                      |
| [`paperdoll.js`, `cellImg`, `drawList`, `composeCell`](../../../app/src/lib/runtime/paperdoll.js) | Shared composition, exact palettes, masks and layer order           | Selected layers use the requested rider move/direction/cell, not independent mount/rider tracks                    |
| `baseCut`, `cutBodyLayer`                                                                         | Equipment can remove body pixels                                    | `composeCell` cuts the base/body variant, not the complete outfit; body-only cropping leaves garment pixels behind |
| `clips` / `tuck`                                                                                  | Specialized garment occlusion                                       | Helmet/hair tucking is not automatically a general saddle or lower-body mask                                       |

**The raster compositor is reusable; the ordinary item-authoring contract is insufficient.** A slot cannot produce seated base frames or repair standing boots and robes.

Skeleton keypoints are authoring inputs for generated images, not a live mesh that reposes every garment at runtime. A mounted pose can be frozen and dressed like another pose, but affected items need valid coverage. A rigid helmet might reuse art by translation; head tilt still needs review.

Before changing runtime behavior, follow the [canonical JavaScript and native-engine parity contract](../../architecture/javascript-runtime.md). A mount feature cannot remain a Studio-only effect if exported games must reproduce it.

## 4. Proposed architecture, if later approved

### Keep the rider a paper doll; make the mount an attached asset

Separate responsibilities without creating a second paper-doll engine:

- **Rider:** a mounted pose family, such as an upright straddle, plus normal item layers and palettes.
- **Mount:** independent art/timing, a ground origin, a rider-seat location and optional foreground pieces.
- **Mounted presentation:** selects compatible rider poses and coordinates the assets. A single Mount selector can hide this internal separation.

An upright saddle, motorcycle lean and chair seat should not be declared interchangeable. Start with one family. Do not build a generic family registry before a second real need proves necessary.

### Start with a still rider and animated mount

**Minimal dynamic contract:** fit mounts to a shared rider, rather than generate a new rider for every mount. The reusable part is one upright riding pose per direction, with valid body and garment layers. Each compatible mount supplies its own ground origin, frame timing, seat coordinates and optional foreground art. A stationary seat needs only a repeated coordinate. Mount creation can start with one seat placement and optional bob; ordinary users should not need to edit a timeline.

The same character keeps its identity, wardrobe, palettes and equipment selection. Standing-only garments need riding coverage once, not again for every compatible horse or wolf. That is the main cost reduction. It is not zero-cost conversion of arbitrary existing clothing.

For no-new-art mounting, deliberately support standing platforms or enclosing mounts using an existing reviewed still/action pose. Do not keep playing a walk cycle. A basket or cockpit can hide the lower body if it also handles garment occlusion; an exposed saddle still needs believable legs. ClassicUO's chair shear is worth comparing offline, not shipping as a generic straddle fallback.

A future interaction can be **choose a mount, preview the outfit, ride**. Mount authors handle fitting. Missing ride poses should offer explicit preparation or disable the combination, never silently crop boots, replace clothing or trigger paid generation. The Mount selector can live beside equipment without routing through ordinary garment generation.

Start with horse-like upright saddles. Wolves and birds are candidates only when their authored seat width and posture fit. Motorcycles, very broad creatures, side-saddle seats, multiple riders and acrobatic/combat poses are outside the initial promise. No sample here establishes a measured percentage of supported mounts. The honest promise is compatible mounts, not any arbitrary creature image.

The simple sandwich below may fail when the mount must cross between rider limbs, or a cape belongs behind the mount while a boot belongs in front. Use existing split layers where sufficient or reject that asset initially; do not introduce a generic body-part renderer before the need is demonstrated.

For one direction and mount phase:

```text
world position = mount's ground origin
rider translation = mount seat position - rider seat position

back to front, for a deliberately simple saddle:
  mount rear/body
  seated rider with its normal paper-doll layers
  mount foreground patch, only where needed
```

Use integer-pixel attachments at the same art scale. Translate the entire dressed rider, not only its body. Drive attachment from the mount's sampled phase, not unrelated wall clocks.

This three-pass picture is a starting constraint, not universal ordering. A near leg might cover the flank while reins cover a hand; a cape may pass behind the rider and over the saddle. Author more interleaving pieces or exclude the combination. One foreground sprite cannot represent every crossing.

Direction changes must select matching art, order and seat placement together. Missing reviewed rider/garment coverage should fail clearly or disable the combination, not silently show a standing walk or hide clothing.

### Choose the smallest delivery contract that works

**First proof: prealigned frames on one common timeline.** Repeat or translate the seated rider into mount frames offline; align art to a common ground pivot; encode rear/front pieces with existing layers where sufficient. This demonstrates art without immediately introducing a second-clock runtime, attachment API or schema.

That is economical for one mount or mounts sharing a normalized seat path. With different seat paths, today's contract cannot change rider translation merely by selecting another mount layer. It needs mount-specific prealigned clips, standardized attachment motion, or new composition metadata. Disclose this instead of silently duplicating arbitrary data.

**Later, only if needed:** a small mounted-presentation descriptor could reference separate mount clips, rider poses, seat tracks and draw-pass placement. Resolve it through shared engine-neutral rules and native parity. This avoids rider-sheet duplication per mount but is a real runtime/export feature that must justify its complexity.

**Optional baked export:** flatten the selected mounted outfit for PNG-only playback while retaining editable source layers. Baking every wardrobe combination would undermine live paper dolling and multiply exported assets.

PixelDoll should supply art and rendering semantics. Pathfinding, ownership, speed bonuses, collision, jumping, combat, networking and pet AI remain the host game's responsibilities unless separately requested.

## 5. Generation and cost implications

The [checked-in PixelLab API snapshot](../pixellab/pixellab-openapi-v2.json) describes `animate-with-skeleton-v3` as raster generation from a reference and 18 humanoid joints, with 3-15 output frames. It does not establish a quadruped rig, two-actor attachment or separate horse/rider output layers. Its minimum batch also means a one-frame art target does not imply one-frame paid requests.

Allowed `edit-animation-v2`, `transfer-outfit-v2` and `inpaint-v3` could be dressing/repair candidates. None was exercised here for mounted art. Do not generate a combined horse/person and assume chroma extraction can recover both independently, including hidden pixels.

Proposed boundary: obtain separate mount art and rider poses, dress the rider separately, then compose them. Preserve current chroma/extraction policy. This research does not authorize changed colors, legacy endpoints or new generation routes. The snapshot is an inspected contract, not a promise of current provider prices or success rates.

Art-work accounting, **not a billing estimate**:

- For `D` directions, `K` mounted poses and `I` single-layer equipment items, the rider needs `D × K × (1 + I)` body/item pose cells before reuse. Split foreground/background items increase the layer count. A still rider has `K = 1` even when the mount has many gait frames.
- Mount art adds direction-by-gait coverage. Optional empty foreground pieces need not become paid calls.
- Compatible skins may share rider poses. A new posture may require new body and item fitting, not just another mount PNG.
- Eight authored views increase art/review relative to four. Mirroring saves work only when asymmetry, grips and attachments remain correct.
- Rigid-art reuse or accepted cutouts might save generation work; that is a measured optimization, not guaranteed free conversion.

No credit or dollar estimate is quoted without a qualified recipe and measured success rate.

## 6. Next experiment and decision gates

**Proposal only, not authorization or a new implementation task.** Complete an offline art/composition experiment before new paid frames or production changes.

1. Use stored PixelDoll frames and a locally drawn mount placeholder, or separately approved licensed art. Start south/east. Do not redistribute game assets from these sources.
2. Compare standing/action rider behind foreground art, shaped clipping of the whole outfit, a body-space whole-pixel sitting transform, and a manually authored ride-pose reference. Include an open saddle and an enclosing/platform design so a successful cutoff is not mistaken for a universal solution. Use identical geometry within each comparison and native-resolution review.
3. Include trousers/boots and a robe/cape. Reject garment remnants, cut waist edges, straight exposed legs and incorrect hand/seat contact. If usable splicing frames do not exist, record that instead of generating them automatically.
4. Fit a second, differently shaped saddle mount to the same reference rider without editing the rider or wardrobe again. Animate only the mount and integer-pixel seat path. Inspect start/stop, loop boundary and direction changes. Check asymmetric held equipment before accepting mirroring.
5. Export prealigned frames through existing layers first. If a new runtime is needed, define an independent pixel/timeline oracle and follow JavaScript/native parity verification.

Acceptance criteria for a later bounded prototype:

- Rider posture reads correctly and contact never drifts in the tested cycle.
- Masking/ordering works for the whole outfit, not just the naked body.
- Every supported direction/outfit is reviewed; unsupported combinations are disclosed, not silently degraded.
- Unmounted art remains untouched, with a clear mount/dismount presentation switch.
- Studio and export agree on ground origin, clipping, timing and visible result.
- Two mounts share a pose family before promising interchangeability. One mount proves composition, not a reusable system.

Only after a convincing offline result should a separately approved, bounded paid experiment test allowed PixelLab routes for anatomy, clothes, hands and mount art. No automatic retries. If quality cannot reliably beat the authored reference, defer the feature.

## 7. Independent Opus challenge and reconciliation

The requested Opus 5.5 medium investigation independently recommended a mounted presentation around the existing rider, a small seated pose set, a seat track and optional foreground art. It found the GANI copy and historical Stardew horse code, strengthening the evidence beyond gameplay screenshots.

The coordinator retained the challenges and narrowed several claims:

- Graal reuses **action** poses, not proof of arbitrary standing-pose reuse. No generic lower-body masking system was verified.
- OTClient's fallback means it supports mounted outfit art, not that every outfit contains it. A common pattern index does not prove all mounts have compatible geometry.
- tModLoader supports front/back textures, not mandatory use of every pass. The example's body-frame number does not independently establish its seated meaning.
- A still seated rider is a credible starting point, not a universal answer for jumps, combat, violent gaits or every garment.
- Eight-direction feasibility, generated-art quality and generation costs remain unqualified.
- Separate authoring/composition responsibilities do not require a new runtime immediately. Try common-timeline prealignment before a general attachment system.

The focused Opus 5.5 medium follow-up independently challenged ClassicUO's procedural chair-sitting path. It changes the framing: a Mount equipment selection is reasonable, and a shared rider contract can avoid per-mount wardrobe generation. It does not remove the need for valid rider/item poses. The coordinator verified the separate mounted and sitting branches, shared garment coordinates and textured-section renderer. The front-facing human sitting case uses authored mounted-stand group 25 instead of the shear [U1]. Exact texture-sampling artifacts and resulting visual quality were not rendered, so they are not asserted as measured results. The procedural approach is a comparison candidate, not a recommended general mount mechanism.

This is a source-backed recommendation, not production feature acceptance.

## 8. Sources and reproducibility

Accessed November 16, 2026. Repository links pin inspected revisions. Function names are included because raw web extraction can alter displayed line numbers. No third-party code or artwork was copied into the project.

- **[U1]** [ClassicUO `MobileView.cs`](https://github.com/ClassicUO/ClassicUO/blob/ee79d7ebc1cc0e53ff84fe6cae17d389e2737f93/src/ClassicUO.Client/Game/GameObjects/Views/MobileView.cs), `Draw`, equipment loop, `DrawInternal`, `CalculateSitAnimation`: mount composition versus chair sitting, shared garment animation and body-space section boundaries. Community client, not original proprietary source.
- **[U2]** [ClassicUO `MobileAnimation.cs`](https://github.com/ClassicUO/ClassicUO/blob/ee79d7ebc1cc0e53ff84fe6cae17d389e2737f93/src/ClassicUO.Client/Game/GameObjects/MobileAnimation.cs), `GetGroupForAnimation` human movement/idle branches: mounted groups 23/24/25 and held-light variation.
- **[U3]** ClassicUO [equipment layers](https://github.com/ClassicUO/ClassicUO/blob/ee79d7ebc1cc0e53ff84fe6cae17d389e2737f93/src/ClassicUO.Client/Game/Data/Layers.cs), [mount graphic/offset table](https://github.com/ClassicUO/ClassicUO/blob/ee79d7ebc1cc0e53ff84fe6cae17d389e2737f93/src/ClassicUO.Client/Game/Data/Mounts.cs), and [directional equipment ordering](https://github.com/ClassicUO/ClassicUO/blob/ee79d7ebc1cc0e53ff84fe6cae17d389e2737f93/src/ClassicUO.Client/Game/Data/LayerOrder.cs). Mount-table labels are not proof of visual quality for every asset.
- **[U4]** [ClassicUO `Batcher2D.cs`](https://github.com/ClassicUO/ClassicUO/blob/ee79d7ebc1cc0e53ff84fe6cae17d389e2737f93/src/ClassicUO.Renderer/Batcher2D.cs), `DrawCharacterSitted`, `DrawSittedSection`: shifted/sheared textured sections, not an anatomical rig or mount-specific animation generator.

- **[G1]** [Graal historical release documentation](https://graal.tech/Creation/Dev/Releases/Client/NewFeatures2001), GANI sprite definitions, player image inputs and four-direction component positions; [GraalShop guide](https://graal.tech/Creation/Dev/Gani), positions/layers. Historical platform documentation, not a modern client source audit.
- **[G2]** [GScript.Suite `ride.gani`](https://github.com/MorenoLand/GScript.Suite/blob/170a457220b5894b7a9b9148d381669481474e56/ganis/ride.gani), `SPRITE` definitions and `ANI` block; [companion `horse.gani`](https://github.com/MorenoLand/GScript.Suite/blob/170a457220b5894b7a9b9148d381669481474e56/ganis/horse.gani). Third-party copies. The delegate's initial `/main/` link returned 404; these pinned paths were retrieved successfully.
- **[T1]** [OTClient `creature.cpp`](https://github.com/edubart/otclient/blob/dab86e610991092fe8b2471f7de55a7c986b3cd2/src/client/creature.cpp), `Creature::internalDrawOutfit`: mount draw, displacement, Z patterns, add-ons and tint masks. Community implementation, not official Tibia client source.
- **[R1]** [tModLoader `ModMount` API](https://docs.tmodloader.net/docs/stable/class_mod_mount.html), `Draw` and `UpdateFrame`; [pinned `Mount.cs.patch`](https://github.com/tModLoader/tModLoader/blob/4f072c7a2aaad0c35ef7455f5195c526f2a9066a/patches/tModLoader/Terraria/Mount.cs.patch), front/back texture documentation. Maintainer-published extension documentation/source.
- **[R2]** [tModLoader `ExampleMount.cs`](https://github.com/tModLoader/tModLoader/blob/4f072c7a2aaad0c35ef7455f5195c526f2a9066a/ExampleMod/Content/Mounts/ExampleMount.cs), `SetStaticDefaults`, frame data and player offsets. Example, not proof of every vanilla mount's artwork.
- **[S1]** [Historical Stardew Valley `Horse.cs` decompile](https://github.com/E-riCA0/StawdewValley/blob/31967c9ec25ff89f426b585d52cf59aa3faf9d31/Characters/Horse.cs), assembly header, `update` riding branch and `draw`. Unofficial reconstruction of version 1.2-era behavior; current versions were not audited.
- **[P1]** [pokeemerald graphics declarations](https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/src/data/object_events/object_event_graphics.h), bike and Surf sheets; [bike sheet](https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/graphics/object_events/pics/people/brendan/mach_bike.png). Matching-decompilation project/data, not official source.
- **[P2]** [pokeemerald `field_effect_helpers.c`](https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/src/field_effect_helpers.c), `SynchronizeSurfAnim`, `SynchronizeSurfPosition`, `UpdateBobbingEffect`.
- **[V1]** [RPG Maker MV `Game_Player.js`](https://github.com/rpgtkoolmv/corescript/blob/182e31449707ba7e406db0485c44c2a9d11e2dcd/js/rpg_objects/Game_Player.js), `updateVehicle` and `updateVehicleGetOn`. Published built-in vehicle behavior, not a visible-rider plugin.
- **[L1]** [bigbeargames, LPC Horse Riding UPDATED 0.9.1](https://opengameart.org/content/lpc-horse-riding), author description/comments, August 2018. Primary author testimony on cutouts, pose reuse and limits. Search-index text was readable; direct fetch was blocked, and archives/previews were not executed.

### Verification and exclusions

- Retrieved and inspected pinned code/data, cross-checked independent findings, and inspected local slot, rig, layer, compositor and runtime contracts.
- Checked the local PixelLab OpenAPI snapshot without calling PixelLab. No credentials were read or exposed.
- Documentation-only checks passed: Prettier on both changed Markdown files, local-link existence/punctuation validation for the spike, and `git diff --check` for tracked changes. A separate whitespace scan covers the new, initially untracked spike. App checks, unit tests, E2E, builds and browser checks are intentionally skipped under the docs-only policy.
- No production code, schema, slot, export, paid generation, implementation task, commit or deployment is part of this spike.
