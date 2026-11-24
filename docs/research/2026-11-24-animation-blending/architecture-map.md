# Paper-doll runtime and live-view architecture map

Read-only mapping for the 2026-11-24 upper/lower body animation blending spike. Every claim below comes from reading the named file at the named line. Inferences are labeled. No test, build, server or paid call was run.

Scope: the canonical runtime (`app/src/lib/runtime/`), the Studio live views (`app/src/studio/experience/`), the composition facades (`app/src/lib/compose/`), the four live controller exports (Phaser, GDevelop, Godot, Unity) and the synchronization/verification plumbing around them.

---

## 1. Runtime data model

The runtime's schema is generated, not hand-written: `app/scripts/sync-runtime.mjs:11-17` copies every interface and type alias out of `app/src/lib/store/manifest.ts`, `app/src/lib/rig/rig.ts` and `app/src/lib/image/png.ts` into `app/src/lib/runtime/types.d.ts`. So the shipped types are exactly the app's authoring contracts.

### Manifest and rig

`app/src/lib/runtime/types.d.ts:5-16`:

```ts
export interface Manifest {
	format: 'pixeldoll/3';
	name: string;
	exportId?: string;
	app: string;
	rig: Rig;
	materials: Material[];
	slots: Slot[]; // array order = tie-break for equal z
	items: Item[]; // includes the base (slot "body")
	presets: Preset[]; // presets[0] = default
	export?: ExportInfo;
}
```

`types.d.ts:371-389` (Rig):

```ts
export interface Rig {
	view?: 'low top-down' | 'high top-down' | 'side';
	template?: string;
	cell: { w: number; h: number };
	pivot: { x: number; y: number }; // pixel-edge coords
	directions: RigDirection[];
	animations: RigAnimation[];
	baseItem: string;
	baseHash: Sha256;
	pad?: { x: number; y: number };
	pixelsPerUnit?: number;
	artOffset?: Partial<Record<DirectionName, number>>;
	rest?: Partial<Record<DirectionName, RestView>>;
	anchors?: Partial<Record<AnchorId, AnchorTrack>>;
}
```

`types.d.ts:284-309`:

```ts
export type DirectionName =
	'south' | 'south-east' | 'east' | 'north-east' | 'north' | 'north-west' | 'west' | 'south-west';

export interface RigDirection {
	id: DirectionName;
	mirrorOf?: DirectionName;
}

export interface Keypoint {
	label: string;
	x: number;
	y: number;
	depth?: number;
	z_index?: number;
}

export interface RestView {
	image: Sha256;
	keypoints: Keypoint[];
	registrationOnly?: true;
}
```

Note `Keypoint.x/y` are normalized 0..1, not pixels. `mountLegs.ts:172-176` proves the convention: `point.x * rig.cell.w`.

`types.d.ts:340-367` (RigAnimation):

```ts
export interface RigAnimation {
	id: string;                 // internal key, never changes
	kind?: 'state' | 'move';
	name?: string;
	exportId?: string;          // game-facing ID for play()
	directions?: DirectionName[]; // export: views with base frames
	cells: number;
	loop: boolean;
	moveLoop?: boolean;
	itemDrawing?: 'anchor' | 'skeleton' | 'sheet';
	frames: { cell: number; ms: number }[];
	source?: { endpoint: string; mode?: string; template_animation_id?: string; action_description?: string };
	sources?: Partial<Record<DirectionName, ClipSource>>; // generated directions only (mirrors derive)
}
```

`types.d.ts:311-336` (ClipSource) is where per-cell skeleton data lives:

```ts
export interface ClipSource {
	route: 'skeleton-v3' | 'pixminimax' | 'v3' | 'import';
	reference: Sha256;
	referenceKeypoints?: Keypoint[];
	keypoints?: Keypoint[][]; // [cell][18]: the sequence sent to raw skeleton-v3
	motion?: string;
	measured?: Keypoint[][];   // [cell][18]: re-estimated on the frozen frames
	processing?: { ... };
	motionEcho?: { maskIoU: number };
	motionBridged?: number[];
	provenance: number[];
}
```

So `rig.animations[i].sources[direction].keypoints[cell]` and `.measured[cell]` are arrays of 18 labeled keypoints per cell, for generated (non-mirrored) directions only. There is no per-cell keypoint data for arbitrary imported moves.

`types.d.ts:369` gives the anchor tracks: `export type AnchorTrack = Record<string, Partial<Record<DirectionName, [number, number][]>>>;`, keyed by animation then direction then cell. `AnchorId` (`types.d.ts:289`) is `'head' | 'neck' | 'hand_r' | 'hand_l' | 'hip' | 'foot_r' | 'foot_l'`.

### Items and layers

`types.d.ts:225-234`:

```ts
export interface Layer {
	id: 'main' | 'fg' | 'bg';
	role: 'fg' | 'bg';
	z: number;
	cells?: Record<string, Partial<Record<DirectionName, (Sha256 | null)[]>>>; // project; null = transparent
	sheets?: Record<string, string>;   // export manifest; anim -> sheet path
	sourceSheets?: Record<string, string>;
	cell?: { w: number; h: number };   // oversize layer (held items)
	pivot?: { x: number; y: number };
}
```

`types.d.ts:76-122` (Item), the parts that matter here:

```ts
export interface Item {
	coverage?: CellKey[];   // reviewed/generated target cells, incl. intentional transparency
	pending?: CellKey[];
	id: string;
	name: string;
	exportId?: string;
	slot: string;
	status: 'draft' | 'accepted' | 'stale';
	mirror: 'flip' | 'generate';
	hides?: string[];
	variantOf?: string;     // baked "<item>~<under>" copy
	under?: string;
	underAll?: string[];
	materials: string[];
	regions?: 'shirt-shorts';
	prompt: string;
	layers: Layer[];
	baseHash: Sha256;
	route?: ...;
	key?: ...;
	dressed?: Partial<Record<DirectionName, Sha256>>;
	standing?: string;
	baseCut?: Record<string, Partial<Record<DirectionName, (number[] | null)[]>>>;
	anchorCell?: CellKey;
	provenance: Provenance[];
	...
}
```

`CellKey` is `` `${string}/${DirectionName}/${number}` `` (`types.d.ts:3`), i.e. `"walk/east/3"`. `baseCut` is the existing per-cell body-pixel mask: sorted `y * rig.cell.w + x` indices of base pixels the item hides. `types.d.ts:102-104` documents that mirrored directions flip their source and that the Studio clears cuts while an item is worn.

`types.d.ts:249-254` (Preset) is only `{ id, name, items: Record<slot, itemId|null>, variants: Record<materialId, variantName> }`.

`types.d.ts:277-282` (Project) is the compositor's input:

```ts
export interface Project {
	manifest: Manifest;
	images: Map<string, Img>;                       // full cell hash -> RGBA
	layerImages?: Map<Layer, Map<string, Img>>;     // owner-local recolors
}
```

There is no `blend`, `upper`, `lower`, `split` or `mask` field anywhere in these types. A body-half concept does not exist in the schema today.

---

## 2. Public runtime API

### `app/src/lib/runtime/paperdoll.js`

| Line | Export | Signature | Behavior |
| --- | --- | --- | --- |
| 24 | `flipH` | `(im: Img) => Img` | Horizontal mirror of pixels; used for `mirrorOf` views. |
| 37 | `rigFrame` | `(rig) => Frame` | `{...rig.cell, ...rig.pivot}`; the rig cell with its pivot. |
| 46 | `layerFrame` | `(rig, l) => Frame` | Layer cell/pivot overriding the rig's, so oversize held layers align. |
| 51 | `unionFrame` | `(fs: Frame[]) => Frame` | Bounding frame of several. |
| 65 | `bakedFrame` | `(m) => Frame` | Union of rig frame and every item layer frame; the full, un-clipped export frame. |
| 75 | `equipped` | `(m, items) => Item[]` | Items whose slot maps to their id, plus the base. |
| 83 | `resolvePreset` | `(manifest, preset) => {items, variants}` | Outfit by id or object, forces `body`, validates each slot. |
| 96 | `validEquipment` | `(manifest, slot, itemId) => boolean` | Slot exists and the item belongs to it and is not a baked variant. |
| 107 | `hidesOf` | `(m, it) => string[]` | Slot hides plus hand-target expansion. |
| 110 | `handSide` | `(m, key) => 'left'|'right'|undefined` | Which hand a held slot occupies. |
| 118 | `oppositeHands` | `(m, key) => string[]` | Slots on the other hand. |
| 131 | `handHides` | `(m, key, hides) => string[]` | Expands `main_hand`/`off_hand` hides to every slot on that hand. |
| 147 | `hiddenSlots` | `(m, items) => Set<string>` | Mutual-hide resolution, later slot wins. |
| 167 | `OTHER_HAND` | constant map | `main_hand <-> off_hand`. |
| 175 | `twoHanded` | `(m, it) => boolean` | Whether the item hides the other hand. |
| 190 | `settleHands` | `(m, items, keep?) => {items, removed?, removedItems?, by?}` | Studio hand-conflict policy. |
| 229 | `tuckers` | `(m, on, slot) => Item[]` | Worn items whose slot declares `clips: [slot]`. |
| 237 | `tuckedId` | `(item, over) => string` | `"<item>~<over>"`. |
| 243 | `variantCovers` | `(item) => string[]` | `underAll` or `[under]`. |
| 249 | `shownItems` | `(m, on) => Item[]` | Substitutes baked tucked variants for their owners. |
| 276 | `affectsBody` | `(m, item) => boolean` | Has `baseCut`, or the slot clips the body. |
| 286 | `cutAt` | `(m, item, anim, dir, cell) => number[] | null` | Stored cut for that cell, else flipped from the mirror source. |
| 299 | `cutBase` | `(im, cuts) => Img` | Clears listed pixels in a copy. |
| 312 | `cutBodyLayer` | `(im, cuts, rig, layer) => Img` | Maps rig-cell cut indices into an oversize layer's own cell. |
| 332 | `tuck` | `(im, f, covers) => Img` | Per-column brim from cover alpha; clears rows at/above it. |
| 372 | `tucked` | `(p, im, l, under, anim, dir, cell) => Img|null` | Applies `tuck` with each cover's cell image. |
| 396 | `resolveZ` | `(slot, layer, anim, dir, cell) => number` | Most specific `zOverride` (cell > anim > dir > none). |
| 419 | `compareDraws` | `(manifest) => (a, b) => number` | Total order: z, slot index, role (bg first), item id. |
| 436 | `drawList` | `(m, items, anim, dir, cell) => Draw[]` | Visible, shown, sorted draws with resolved z. |
| 457 | `cellImg` | `(p, layer, anim, dir, cell) => Img|null` | Hash lookup, mirror fallback with `flipH`. |
| 471 | `over` | `(dst, src, x, y) => void` | Straight-alpha source-over, clipping off-canvas. |
| 498 | `composeCell` | `(p, items, anim, dir, cell, frame?) => Img` | The compositor: cuts, tucks, order, pixels. |

`composeCell` takes exactly one `(anim, dir, cell)` triple for every layer (`paperdoll.js:498-511`). This is the single most important constraint for blending: the compositor has no notion of two clips.

### `app/src/lib/runtime/timeline.js`

| Line | Export | Signature | Behavior |
| --- | --- | --- | --- |
| 5 | `clipKind` | `(clip) => 'state' | 'move'` | `kind` or `id === 'default' ? state : move`. |
| 10 | `playbackClips` | `(clips) => {id,key,kind,clip}[]` | Export-facing IDs; renames `default` to `standing` and displaces a colliding standing move. |
| 29 | `lastPlaybackCell` | `(clip) => number|undefined` | Terminal cell. |
| 34 | `timelineDuration` | `(frames) => number` | Sum of `ms`. |
| 39 | `sampleTimeline` | `(frames, elapsedMs, loop = true) => number` | Validates, clamps, loops or holds, returns the cell. |

`sampleTimeline` is a pure function of `(frames, elapsedMs)`. Nothing is stored between calls, so two independent clips can already be sampled at the same instant. What does not exist is a way to *render* two of them at once.

### Composition facades

`app/src/lib/compose/compose.ts:32-60` re-exports the canonical functions (`composeCell`, `drawList`, `cellImg`, `cutAt`, `cutBodyLayer`, `bakedFrame`, ...) so the app does not keep a second implementation. `compose.ts:98-199` adds `withTuckVariants`, which bakes tucked item copies and `base~cover` body variants at export time. `compose.ts:62-84` caps body-cover combinations at `MAX_BODY_CUT_VARIANTS = 256`.

### Per-engine controller API

| | Phaser | GDevelop | Godot | Unity |
| --- | --- | --- | --- | --- |
| Source file | `app/src/lib/export/phaser.ts` | `app/src/lib/export/gdevelop.ts` | `app/src/lib/export/godot.ts` | `app/src/lib/export/unity.ts` |
| Shipped artifact | `phaser/PaperdollContainer.js` (canonical JS + adapter, `phaser.ts:9,223`) | `gdevelop/game.json` + embedded event (`gdevelop.ts:191`) | `godot/paperdoll.gd` (`godot.ts:113,422`) | `unity/Runtime/Paperdoll.cs` (`unity.ts:124`) |
| Class / script | `class Paperdoll` (`phaser.ts:113`) | `createPixelDoll(scene, m, names, x, y, preset)` (`gdevelop.ts:26`) | `extends Node2D` (`godot.ts:113`) | `class Paperdoll : MonoBehaviour` (`unity.ts:124`) |
| Constructor | `new Paperdoll(scene, x, y, manifest, preset?)` (`114`) | factory; `library.create(x, y, preset)` (`gdevelop.ts:191`) | `@export var library: Resource` + `_ready` (`121-146`) | inspector `PaperdollData data` + `library`/`nodes` lists (`126-131`) |
| Play | `play(anim, dir, restart = false)` (`136-142`) | `d.play(anim, dir, restart = false)` (`34-39`) | `play_anim(a, d, restart = false) -> bool` (`150-164`) | `Play(string anim, string dir, bool restart = false)` (`141-151`) |
| Equip | `equip(slot, itemId)` (`144`) | `d.equip(slot, id)` (`40-43`) | `equip(slot, item_id) -> bool` (`168`) | `Equip(string slot, string itemId)` (`154`) |
| Preset | `applyPreset(preset)` (`149`) | `d.applyPreset(preset)` (`45-48`) | `set_preset(preset_id) -> bool` (`182`) | `ApplyPreset(string id)` (`175`) |
| Colors | `setVariants(map)` (`155`) | `d.setVariants(map)` (`44`) | `set_variant(material, name)` (`198`) | `SetVariant(string id, string variant)` (`166`) |
| Extras | `shown(slot)` `178`, `layerOf(n)` `183`, `z(slot, layer, cell)` `188`, `sync()` `193`, `texture(item, layer)` `157` | `d.sync()` `66-87`, `d.update(ms)` `88`, `d.destroy()` `89`, position/layer/z fields `31`, `library.dolls` | `signal equipment_changed` `119`, `_sync`, `_refresh`, `_hand_side`, `_hides_of` | `Body` property `138`, `Sync()` `191`, `LateUpdate()` `188`, `Pd*` serializable manifest subset `94-106` |
| Clock owner | Phaser `body` sprite animation; `sync()` reads `currentFrame` (`194-197`) | `d.elapsed` advanced by `update(ms)`, cell from `sampleTimeline` (`69`,`88`) | `body` AnimatedSprite2D; layers copy frame on `frame_changed` (`114-115`,`135`) | hidden `clock` SpriteRenderer driven by an `Animator`; layers follow the frame name (`122`,`193`) |
| Disposal | `destroy()` (`210`) | `d.destroy()` (`89-94`) | `queue_free()` | `Destroy(gameObject)` |

Contract obligations for all four are in `docs/architecture/javascript-runtime.md:134-169`, notably: selecting the active move/direction preserves progress, a different one starts at 0, `restart = true` restarts, equipment and palette changes never restart animation, invalid calls leave state unchanged (`:147-161`).

The native ports do not share code. `javascript-runtime.md:59-61` states that Godot and Unity keep native-language controllers and "require native conformance checks rather than source identity", and `:132` states "changing JavaScript does not update them automatically".

---

## 3. How the live view decides direction and clip

The whole live path lives in `app/src/studio/experience/WorldStage.svelte`. `Experience.svelte` only imports `applyRiderPose` (`Experience.svelte:2`) and hosts the stage; it contains no attack, walk or direction logic.

1. **Input to velocity.** `WorldStage.svelte:1161-1176`: stick value (already `{x, y: -y}`) wins, else `keyboardVector(keys, side)`; a mouse destination is converted to a normalized step. `if (paused) velocity = {x:0,y:0}` (`1177`) where `paused = !!ui.sheet || document.hidden` (`1160`). `integrateMovement` moves position and camera at `travelSpeed` (`1180-1190`). `travel = velocity` (`1178`) is what the keyboard attack aim reads.
2. **`resolveLive`.** `WorldStage.svelte:1262-1275` calls `resolveLive(a, { velocity, clips: roles, riding, riderPose, items, previous, defaultDirection })`. `presentation.ts:441-578` does the direction work:
   - `moving = !!(velocity.x || velocity.y)` (`459`), `intended = nearestDirection(a.directions, velocity, previous?.direction, previous?.intendedDirection, saved)` (`468-475`), or the retained facing when stopped (`476`).
   - `nearestDirection` (`movement.ts:52-72`) is argmax of `dot(unit(v), b(d))` over declared directions, with tie memory in the order previous displayed, previous intended, saved, compass order.
   - Clip choice: `start` requests `walk[0]` when moving else `idle[0]` (`494`), then the loop at `552-567` walks the chain and picks the exact `intended` facing if that clip has it, else `nearestDirection` over the *available* facings restricted by `eligible` (`507-508`, `dot >= 0`, which forbids an opposite-facing gait).
   - The result carries both `intendedDirection` and `direction` (`41-58`); `intendedDirection` is the input-derived facing, `direction` is the facing actually drawn.
3. **Attack overrides walk.** After `loco` is computed, `WorldStage.svelte:1280-1296` steps `LiveActions`, resolves the aim through `resolveAttack(a, roles, request, {side, facing: loco.direction})` and starts the sequence. Then `1303-1307`:

```js
const shown = actions.attack?.sequence ?? flight;
if (shown) {
    p = resolvePreview(a, { clip: shown.clip, direction: shown.direction });
    actionCell = actions.attack ? actions.attackCell() : actions.jumpCell(shown);
}
```

So the attack *replaces the whole presentation*, not just the upper body. `resolvePreview` (`presentation.ts:427-438`) resolves the attack clip and its own direction with no fallback to locomotion; `resolveAttack` (`attack.ts:23-66`) picks the facing: top-down uses any authored facing within 90 degrees of the aim (`dot > 1e-6`, `44-49`), side view restricts to a horizontal profile (`vector.y === 0`, `46-48`) and picks Attack up/down by sector (`attackSector`, `13-16`).
4. **Aim and travel stay separate.** The aim vector never enters `resolveLive`. Keyboard aim is `const keyAim = () => travel` (`406-407`), mouse aim is `mouseAim()` computed from the cursor and the actor (`521-533`), touch aim is the release of the right-half stick (`622-624`). `resolveAttack` receives `facing: loco.direction` only as a tie-break and as the fallback for a zero aim (`attack.ts:29-31,50`). The comment at `WorldStage.svelte:1261` states the intent: "Locomotion is resolved on its own, so an attack east never replaces the remembered westward facing." This holds because `previous = loco ?? p` (`1652`), not `p`, so the attack facing never becomes the locomotion history.
5. **Clock.** `clock = advancePlayback(loco, clock, flying && !flight ? 0 : livePlaybackDelta(loco, velocity, dt, travelRate, roles.walk[0]))` (`1309-1313`). The clock is always driven from `loco`, never from the attack. `advancePlayback` (`presentation.ts:647-666`) keys on `animation:${clip}:${moving|stopped}` and preserves normalized phase across a key match. `livePlaybackDelta` (`624-645`) returns `dt` for non-walk clips and `travelDelta(velocity, dt, travelRate)` only while the requested *and* resolved clip equal the chosen walk clip. `travelDelta` (`movement.ts:12-17`) is `dt * min(1, |v|) * rate`, and `travelRate = speed / 300` (`WorldStage.svelte:1157-1158`), so the walk cycle runs 1.0x top-down, 0.5x side, 1.3x mounted.
6. **Render.** `cell = actionCell ?? clock?.cell ?? p.cell` (`1316-1320`), then `renderPresentation(a, view.items, p, cell)` (`1323`). `renderPresentation` (`presentation.ts:681-761`) filters out any worn item that is not `complete` for every cell of the presented sequence (`713-729`), picks `bakedFrame` or a fit frame (`734`), and calls `composeCell(p, filtered, clip, direction, cell, frame)` (`735-742`). Below that, each layer's `cellImg`, `tucked`, `cutBodyLayer` and `over` run in `drawList` order.

### Where the slide and the freeze come from

- **Slide.** During an attack or a jump with art, `p` is the action presentation and `actionCell` is the action frame, but position and camera keep integrating `velocity` at full speed (`1180-1190`) and the mount gait keeps advancing (`1369-1375`, `travelDelta(velocity, ...)`). The drawn legs belong to the attack pose while the actor translates. That is a literal slide, and it is a direct consequence of the single-presentation compositor: there is no lower-body walk layer to keep stepping.
- **Freeze.** `livePlaybackDelta` returns `dt` for any clip that is not the chosen walk (`presentation.ts:637-643`), and `WorldStage.svelte:1312` passes `0` when airborne without Jump art. In the airborne case the locomotion clock is frozen, so the body holds a mid-walk pose in the air (intended, per `docs/design/live-view-controls-plan.md:48`). In the attack case the locomotion clock keeps running but is invisible; when the attack ends, the walk resumes at whatever phase it reached, with no re-sync to the attack's exit pose. The walk-phase discontinuity is therefore not a freeze but a hidden advance.
- **Item pop.** `renderPresentation` nulls any item whose attack frames are incomplete (`713-729`), so an item that has walk frames but no attack frames disappears for the whole attack. This is existing behavior and is the most likely user-visible cost of any attack-while-moving feature.

---

## 4. Frame and cell timeline mechanics

- **Per-frame durations.** `RigAnimation.frames` is `{cell, ms}[]`, ordered, and may repeat a cell (`types.d.ts:359`). `timelineDuration` sums `ms` (`timeline.js:34-36`). `sampleTimeline` (`39-55`) rejects empty, non-finite, non-positive or any non-positive per-frame `ms`; clamps negative or non-finite elapsed to 0; loops with `%` when `loop` is true; otherwise clamps to `duration` and returns the last cell. A repeated cell is honored because no dedupe happens.
- **Live preview always loops.** `BodySequence` (`presentation.ts:35-40`) carries `{clip, direction, frames, duration}` and no `loop` flag, and `advancePlayback` calls `sampleTimeline(sequence.frames, elapsedMs)` with the default `loop = true` (`664`). The authored `loop` flag only reaches Phaser (`phaser.ts:102`) and the other engines' own timelines. `javascript-runtime.md:46-49` documents this as deliberate.
- **Phase across direction changes.** `advancePlayback` computes `key = animation:${clip}:${moving ? 'moving' : 'stopped'}` (`653-655`). Direction is deliberately absent, so a same-clip facing change maps normalized phase: `(previous.elapsedMs / previous.duration) * sequence.duration + dt` (`658-662`). This is exactly the behavior `docs/design/2026-10-22-redesign/round-4-discussion/animation-resolver.md:95` requires. Because `moving` is in the key, a stop and restart resets to 0 even within the same clip, and a fallback clip switch (walk to idle) resets.
- **Independent sampling.** `sampleTimeline` is stateless, and the live scene already keeps three independent clocks: the locomotion `clock` (`1309`), `LiveActions.attack.elapsed` (`liveActions.ts:59-61`, sampled by `attackCell` at `78-86`), and `mountElapsed` (`WorldStage.svelte:1369-1375`, sampled by `sampleMountFrame`, `mounts.ts:323-328`). Two clips can be *sampled* independently today. They cannot be *composed* together, because `composeCell` takes one triple.

---

## 5. Layers and z-order

- Ordering is total and canonical. `drawList` (`paperdoll.js:436-448`) builds `Draw {item, layer, slot, z, under}` for every layer of every shown, non-hidden item, resolves per-cell z through `resolveZ`, and sorts by `compareDraws` (`419-427`): `z`, then slot index in `manifest.slots`, then role (`bg` first), then item id. `javascript-runtime.md:67-73` requires every adapter to use this order rather than a second depth sort. Phaser does (`phaser.ts:199-207` via a `pdOrder` and `container.sort`), GDevelop assigns `node.setZOrder(d.z + i)` from the loop index (`gdevelop.ts:85-86`), Godot preserves tree order and raw depths (`godot.ts:299` region), Unity follows the node list.
- Each `Draw` is one whole layer image. `composeCell` copies it with `over(out, im, frame.x - f.x, frame.y - f.y)` (`509`). There is no per-row or per-half rendering, so **no layer can be z-clipped or horizontally split today**. The only per-pixel removals in the runtime are `baseCut` on the base item (`cutAt`/`cutBodyLayer`, `286-325`), `tuck`'s per-column brim cut on a tucked item (`332-361`), and explicit `null` cells.
- **Items are baked per pose.** An item's pixels for `(anim, dir, cell)` are a distinct content hash (`Layer.cells[anim][dir][cell]`, `types.d.ts:229`), produced by posing the item on that body frame. Nothing at runtime re-poses an item from joints. So an item cell drawn on an attack pose cannot be reused on a walk pose: the limb positions, silhouette and any occlusion are different pixels. `presentation.ts:130,236-264` treats a missing `(clip, dir, cell)` as incomplete coverage, and `javascript-runtime.md:97-98` records the decision that "No Walk frame is assumed to align to rest merely because it is frame zero."
- Consequence for blending (inference): a composite "upper from attack, lower from walk" cannot be produced by choosing two existing item cells. It needs either (a) new art authored per hybrid, or (b) a pixel-level mask that keeps the upper part of one composed frame and the lower part of another, which the compositor does not support but which is mechanically close to `tuck`/`baseCut`.

---

## 6. Mounting machinery that already splits the body

`app/src/studio/experience/mountLegs.ts` is **editor-only**. `mounts.ts:1-3` states outright: "Nothing here is exported, saved, or part of the paper-doll runtime." So this is a prototype for a body split, not a shipped capability.

### `hideMountedLegs` (`mountLegs.ts:91-302`)

Signature: `(image: Img, frame: {x,y}, rig: Rig, clip: string, direction: DirectionName, cell: number, mode: 'none'|'far'|'both', geometry?: {resolvedSource?, baseImage?}) => {image, issue, source?}`.

Steps:
1. `mode === 'none'` returns the image unchanged (`102`); `'far'` is refused for north/south (`104-105`, `143-144`).
2. Validates image, cell and pivot geometry are safe integers (`108-116`) and that the clip/cell exists (`117-125`).
3. Resolves the direction through `mirrorOf` to a drawn source, tracking parity (`126-142`).
4. Picks keypoints in priority order (`145-162`): `animation.sources[resolved].measured[cell]`, else `.keypoints[cell]` (the *requested* skeleton), else, only for `default` cell 0 with `matchesStanding`, `rig.rest[resolved].keypoints`. Otherwise it returns "No per-cell mounted-leg geometry" and does nothing. The `source` field reports `measured | requested | rest`.
5. `jointPoint(label)` (`163-177`) requires exactly one point with that label, normalized 0..1, and converts to image pixel coordinates through `offsetX/offsetY` and a mirror flip.
6. Consumes six labels per mode: `LEFT HIP`, `LEFT KNEE`, `LEFT LEG` and the same for `RIGHT` (`179-184`); in `both` mode also `LEFT ELBOW`, `LEFT ARM`, `RIGHT ELBOW`, `RIGHT ARM` (`186-194`). `LEG` is the ankle end (`skeleton.ts:31-32`).
7. `hipY = (leftHip.y + rightHip.y) / 2` (`203`), `radius = max(min(cell.w, cell.h) * 0.04, hipDistance * 0.4)` (`204-207`), `far` is the right leg when the resolved direction ends in `west` (`208`).
8. For `far`, every opaque pixel within `radius` of the far leg's hip-knee-ankle polyline, strictly closer to it than to the near leg, is cleared (`236-254`), restricted to `y > hipY` (`222-226`). For `both`, everything below the hip line except pixels near the elbow-wrist segments is cleared (`246-249`), i.e. a full lower-body removal.
9. Fragment cleanup (`255-300`) removes disconnected leftovers that stay below the hip and off the kept leg.

### Available per-cell geometry

- `rig.animations[].sources[dir].measured[cell]` and `.keypoints[cell]`: arrays of 18 normalized keypoints per cell, generated directions only (`types.d.ts:316-318`, `366`).
- `rig.rest[dir].keypoints`: the original standing view's keypoints, no cell dimension (`types.d.ts:305-309`). Used only for the standing/default cell 0 case.
- `rig.anchors.hip[anim][dir][cell]`: a per-cell hip point in pixel coords, produced at freeze by patch tracking on the actual frozen frames (`app/src/lib/rig/freeze.ts:190-248`), with mirrored directions derived by flipping x (`242-247`). `SOURCES.hip = ['LEFT HIP','RIGHT HIP']` (`skeleton.ts:25-33`) means it is the midpoint of the two hips.

So for arbitrary moves: raw `measured`/`keypoints` exist only when the move was generated per direction from a skeleton. Imported or pixminimax moves may still get anchor tracks, because `anchorTracks` iterates every animation that has cell 0 art (`freeze.ts:210-211`), but it needs a skeleton for the key frame (`203-205`) and it skips any animation lacking cell 0. `rig.anchors.hip` is therefore the most complete per-cell hip source, and it is present for any move with measured art at freeze time.

**Assessment.** A per-cell hip line can be derived from existing data with no new generation: `rig.anchors.hip[clip][dir][cell]` gives one y per cell, and `sources[dir].measured[cell]` gives both hips and the full leg chain when available. A mask could also be derived from `baseCut`'s existing pixel-index format, which is already a per-cell body mask. What does not exist is (a) any of this in the shipped runtime modules, (b) any guarantee that the data exists for imported moves, and (c) any per-cell mask stored as *upper/lower* semantics rather than "pixels this item hides". A robust feature would need a defined fallback (rig pivot row, or `ESTIMATED_HIP = 0.45`, `mounts.ts:336`) and an explicit coverage report for moves without geometry, because the current code chooses to report and do nothing rather than guess (`mountLegs.ts:162`).

---

## 7. Export pipeline and parity obligations

- **Generation.** Each adapter emits its controller from `app/src/lib/export/*.ts`. Phaser concatenates `runtimeSources` plus the adapter template (`phaser.ts:43` onward, `PAPERDOLL_JS`). GDevelop splices the same canonical sources into its factory and strips only `export ` (`gdevelop.ts:26-29`). Godot and Unity are independent native implementations (`godot.ts:113`, `unity.ts:124`) and embed a manifest subset: Godot via `library.tres` metadata JSON (`godot.ts:417-418`), Unity via `Pd*` classes (`unity.ts:94-114`) that keep only `id, loop, cells, frames, directions`.
- **`npm run runtime:sync`** runs `node scripts/sync-runtime.mjs` (`app/package.json` scripts). It (1) extracts every interface/type alias from the three app sources into `runtime/types.d.ts`, substituting `CURRENT_FORMAT`/`EXPORT_ENGINES` values (`sync-runtime.mjs:11-24`), (2) reads every `*.js` in `app/src/lib/runtime/` into `runtimeSources` and writes `runtime/sources.ts` (`25-33,44-47`), and (3) calls `assertEmbeddable` first. `npm run prebuild` runs the same script with `--check` and throws on any byte difference (`34-43`).
- **Rules a new canonical runtime module must follow** (`app/scripts/runtime-modules.mjs:30-68`, documented at `javascript-runtime.md:214-236`):
  1. No `import` declarations, no `export { ... }` lists, no `export default`, no `export =`.
  2. Every export must be a named declaration with the `export ` prefix at the start of a line; the count and offsets of `^export ` matches must equal the export modifiers.
  3. Every module-scope binding must be unique across all canonical modules, because they are concatenated into one scope.
  4. JSDoc must reference `./types.d.ts` (the generated schema), and type changes require resync and consumer type-checking.
  5. Add behavior to the canonical modules, not the TypeScript facades or an adapter (`javascript-runtime.md:63-65`).
- **Verification.** `app/scripts/verify-phaser-export.mjs`, `app/scripts/verify-gdevelop-engine.mjs`, `app/scripts/verify-unity-export.mjs`, `app/scripts/unity-review/NativePlayback.cs`, and the opt-in `GODOT_BIN` test in `app/test/unit/godot-export.test.ts:154-160` are the native conformance checks. `javascript-runtime.md:202-212` maps scenarios to them.

### What would have to change per platform for a new blend operation

Inference throughout, based on the code above.

- **Canonical JS (`paperdoll.js` / new module).** A blend would need a new exported compositor entry (for example a cell pair plus a cut row) rather than a change to `composeCell`'s signature, to keep existing callers intact. `drawList`/`compareDraws` stay correct only if a split keeps one layer per draw; if an item must be split, the natural extension is a per-layer row mask applied inside `composeCell`, modeled on `tuck`.
- **Phaser.** `sync()` reads the body's current frame name to get one cell (`phaser.ts:194-197`) and sets one texture per `(slot, role)` node (`125-129`, `205`). Upper/lower blending needs either a second body node with a mask or a per-node texture swap plus a mask, and `sync()` must derive the lower cell from a second clip's clock rather than the body's frame. `play()` would need a parallel "play lower" op.
- **GDevelop.** `sync()` already samples its own clock (`gdevelop.ts:69`) and one cell drives all nodes (`72-84`). A blend needs `d.elapsedLower` plus `d.lower` clip fields, two `sampleTimeline` calls, and per-sprite masks or a pre-split body. GDevelop has no per-sprite mask in the current node model; the simplest port is two body nodes with clipping, which GDevelop Sprite objects do not expose directly, so pre-baked hybrid cells are the safer route.
- **Godot.** The body AnimatedSprite2D is the clock and every layer copies its frame on `frame_changed` (`godot.ts:114-115,135`). A blend needs a second AnimatedSprite2D for the lower body, a separate `play_anim_lower`, and a y-split via `clip_children` or a shader; the `_sync` that copies frame indices would have to copy from two clocks.
- **Unity.** Same shape: the hidden `clock` Animator drives all renderers by frame name (`unity.ts:122,193-196`). A blend needs a second Animator or a second clock sprite, and per-renderer `SpriteRenderer` masking is not built in, so a second set of nodes with a `RectMask2D` or a two-camera split would be required. The `PdAnim` data class (`unity.ts:95`) would also need whatever geometry the split uses, which it does not carry today.
- **Aseprite / RPG Maker / generic.** `javascript-runtime.md:171-173,249-252` classify these as integration formats, not live APIs. Blending could only be expressed by baking hybrid frames into sheets, which multiplies frames by every upper/lower pair and would need an explicit cap like `MAX_BODY_CUT_VARIANTS` (`compose.ts:63`).

---

## 8. Docs and tests that would need updating

Directly affected by any new runtime API or controller operation:

- `docs/architecture/javascript-runtime.md` (API use `:79-125`, cross-engine contract table `:134-169`, maintenance workflow `:175-212`, source identity `:214-241`).
- `app/test/unit/runtime.test.ts` (byte-for-byte shipped-source identity `:175`, embeddability `:237`, stale-guard recovery `:257`, ordering `:295-336`, delivered-API type check `:337`, geometry/timeline goldens `:369-445`).
- `app/test/unit/runtime-sync.test.ts` (top-level binding collision `:19`).
- `app/test/unit/runtime-preset.test.ts`, `export-phaser.test.ts`, `gdevelop-export.test.ts`, `godot-export.test.ts`, `unity-export.test.ts`, `export-portability.test.ts`, `export-validation.test.ts`.
- `app/scripts/verify-phaser-export.mjs`, `verify-gdevelop-engine.mjs`, `verify-unity-export.mjs`, `app/scripts/unity-review/NativePlayback.cs`.
- For the live view: `app/test/unit/experience-presentation.test.ts`, `experience-movement.test.ts`, `live-actions.test.ts`, `live-roles.test.ts`, `mount-legs.test.ts`, `mount-preview.test.ts`, and the E2E specs `experience-parity.spec.ts`, `scene-zoom.spec.ts` and `studio.spec.ts` (`AGENTS.md` "Testing" mapping).
- Design docs that state current behavior: `docs/design/live-view-controls-plan.md:41-42` (separate travel, aim and facing; attack replaces the displayed action), `docs/design/2026-10-22-redesign/round-4-discussion/animation-resolver.md:9,90-99` (one resolved presentation and clock; no crossfade).

---

## 9. Prior art in this repository

Searched the tree (excluding `node_modules`, `app/dist`, generated JSON schemas and lockfiles) for `blend`, `upper body`, `lower body`, `strafe`, `attack while`, `backpedal`, `reverse walk`, `hip`.

What exists:

1. **`docs/design/2026-10-22-redesign/round-4-discussion/animation-resolver.md:9`** is the closest prior art. It names Godot's `BLEND_MODE_DISCRETE` / `BLEND_MODE_DISCRETE_CARRY` and Unity directional blend trees, cites them, and then explicitly decides against blending: "PixelDoll selects one frame-aligned sprite presentation: no crossfade between character images, sprite rotation or shader blending." Line 90-99 requires one resolved presentation and one clock. Any blending feature contradicts this document and must amend it.
2. **`docs/design/live-view-controls-plan.md:41-42`** requires separate travel/aim/facing and says an attack "capture[s] that direction, and play[s] the whole outfit and body once. Continue moving at the normal speed, then return to the current locomotion". That is the design acceptance of the current slide. Line 50 keeps mount and rider aligned to the selected presentation facing.
3. **`docs/research/2026-11-16-mounts/`** is the only body-splitting prior art. `external-mount-api.md:108` says "Do not synthesize a diagonal by rotating pixel sprites or blending neighboring images". `live-results.md:41` notes that a front wall concealing the lower body reads as a seat, an early observation about lower-body occlusion.
4. **`docs/design/2026-11-16-slot-system/plan.md:77`** mentions a hip/pelvis anchor for the Underwear slot and warns the anchor "does not confine Underwear to the lower body".
5. **`app/src/lib/rig/motion.ts:436-453`** uses "blend" only for foot-contact IK weighting, not animation blending.
6. **`docs/research/generation-pipeline-review-2026-10-25.md:25,387,494`** records that authored idle moves the upper body 0-1 px, so an upper/lower split would have almost nothing to show in idle.
7. **`docs/research/2026-11-07-paperdoll-cycle/`** treats `strafe` and `march` as action names in move classification (`review-move-classification.md:44,77,81`, `audit-held.md:95`), not as a runtime feature. `review-move-classification.md:44` notes rotating the upper body about the hips flips side-view walks at 40-45 degrees of lean.
8. **No occurrence** of "attack while moving", "backpedal" or "reverse walk" as a feature. The nearest is the resolver's "reverse-facing gait exception" (`animation-resolver.md:67-75`), which forbids playing an opposite-facing walk while moving and is already implemented as the `eligible` dot-product filter (`presentation.ts:507-508`) and the attack's 90-degree filter (`attack.ts:44-49`).

---

## 10. Summary of what a blend feature must confront

1. `composeCell` is single-clip by construction (`paperdoll.js:498`). Any blend needs a new canonical entry point and a per-layer row mask, which does not exist.
2. Item art is per pose, per cell (`types.d.ts:229`). A hybrid pose has no item pixels; either the upper and lower halves are drawn from two different composed frames (acceptable for loose clothing, wrong for a held weapon crossing the seam), or new art must be generated.
3. The clip, direction and clock all live in one `Presentation` (`presentation.ts:41-58`), and `advancePlayback` keys on that one clip (`647-666`). Two clocks exist but only one is rendered.
4. The hip and leg data a split needs already exists per cell for generated moves (`sources[].measured`, `rig.anchors.hip`), and `hideMountedLegs` proves a geometric lower-body cut works, but it is editor-only (`mounts.ts:1-3`).
5. Three of the four engines own their clock in a different way (Phaser body animation, GDevelop `elapsed`, Godot `frame_changed`, Unity Animator), so a "play upper X, lower Y" operation is a genuinely new operation in each controller and must be verified natively, not by source identity.
6. `docs/design/2026-10-22-redesign/round-4-discussion/animation-resolver.md:9` explicitly rejected blending. Reversing that is a design decision the spike must state and justify, together with the item-coverage and per-engine masking costs above.
