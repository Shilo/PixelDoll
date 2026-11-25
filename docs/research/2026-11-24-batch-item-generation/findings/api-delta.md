# PixelLab API delta for paperdolling and batch item generation

2026-11-24. Research only: no paid calls, no token use, no app edits.

- Repository snapshot: `docs/research/pixellab/pixellab-openapi-v2.json` (Oct 20, 102 paths, 275 component schemas).
- Live spec: `https://api.pixellab.ai/v2/openapi.json` (refetched 2026-11-24, 643,948 bytes, 140 paths, 347 component schemas; byte-identical to the cached copy at `C:\Users\shilo\AppData\Local\Temp\opencode\pl-openapi-live.json`).
- Routes PixelDoll already uses: `app/src/lib/pixellab/routes.ts`.
- Method: `node` scripts diffed path keys, HTTP methods, and component schema properties between the two files. The whole spec was never printed.

Result: **38 new paths**, **0 removed paths**, **72 new schemas**, **36 changed schemas**. There is no paperdoll, equipment-slot, wearable, overlay, or multi-character batching concept anywhere in the public spec.

---

## 1. The `objects` family

The objects family existed on Oct 20. The delta since then is mainly management and rotation-expansion endpoints, plus one new rotation input on `generate-8-rotations-v3`. Object creation itself is unchanged.

### `POST /create-1-direction-object` (existed before)

- Request schema `Create1DirectionObjectRequest` is byte-identical to Oct 20.
- `size`: square, 16 to 256 px, default 64. "The effective size also determines how many candidate objects the generator produces in one shot (≤42→64, ≤85→16, ≤170→4, else 1)."
- `item_descriptions`: "Per-object descriptions when the effective size produces multiple objects. Length must not exceed the object count derived from size. Supplying FEWER is allowed and does not shrink the grid: the remaining slots are generated from `description` instead, so they come back as extra objects in the same style rather than as variations of the items you listed."
- `view`: only `top-down` or `sidescroller`. Default `top-down`. This is not the character view vocabulary (`low top-down`, `high top-down`, `side`).
- `style_images`: 1 or more references (PNG/JPEG, max 256x256 each). "The output size is derived from the largest of these images and determines the max count: ≤85 → 8, ≤170 → 4, else → 1."
- `target_palette` is accepted.
- Price: "Object generation uses the Pro Tools and costs **10–25 generations** per call on a subscription (depending on the resulting image size)." The count of candidates does not change that quoted range.
- Output: `status: review` when more than one candidate. `Create1DirectionObjectResponse` adds `n_frames` and the object's `ObjectDetail.frame_urls` lists candidates; `POST /objects/{id}/select-frames` with `indices` turns "each index ... into its own completed 1-direction object" and deletes the pack once empty. `POST /objects/{id}/dismiss-review` deletes the pack.
- Why it could matter: this is the only public endpoint that generates several **different** items for one paid call, with per-item text. Four descriptions at 128 px (or 16 at 64 px, 64 at ≤42 px) is a genuine batch.
- Why it probably does not fit paperdolling as is: no character frame, no pose, no skeleton, view vocabulary is map-oriented, and the per-call quality of a 16- or 64-cell candidate grid is untested. Nothing ties the candidates to one body frame or pivot.
- Unknown: whether candidates are individually cut out with transparent backgrounds (see "Transparency" below), whether a 4- or 16-candidate grid keeps per-item quality, and whether the 10 to 25 generation price is per call regardless of candidate count (the text implies yes, but billing is described only by resulting image size).

### `POST /create-8-direction-object` (existed before)

- Only `size` text changed (adds the padding note below); all fields are otherwise the same as Oct 20.
- `description` (required, max 2000), `size` 24 to 168 (default 64), `view` in `low top-down` / `high top-down` / `side`, `reference_image`, `style_image`, `style_object_id`, `target_palette`.
- `reference_image`: "Reference image of the object - generates 8 rotations of this exact image. Mutually exclusive with `style_image` and `size`." This answers the brief's question: yes, an item image can be rotated into 8 directions in one paid call, with the reference kept as one of them.
- `style_object_id`: reuse an existing completed 8-direction object as the style reference; its south sprite becomes the center style reference; output size must be at least its cropped content size.
- `size` note: "The finished canvas is padded to fit the generation grid, so it can be larger than requested (34x34 for 32, 85x85 for 69); GET /objects/{id} reports the final size once completed."
- No `item_descriptions`, no candidate count and no review for the 8-direction endpoint. It is one object, eight views.
- Price: 10 to 25 generations per call.
- Why it could matter: a single item PNG at 256 max can become a consistent 8-direction set for one fixed pose. It is not per frame and has no skeleton, so it cannot follow a move.
- Unknown: whether the 7 generated rotations preserve the reference's exact pixel scale, silhouette and pivot closely enough to sit on a body frame; the spec only promises the reference is returned unchanged in its own direction.

### `POST /objects/{object_id}/expand-rotations` (new since Oct 20)

- Body: `existing_direction` (required, one of the 8), optional `description` ("Defaults to the object's own description").
- "Draws the 7 missing directions of one of your 1-direction objects from its image, keeping the same object (its id, tags and animations). Costs **10-25 generations** on a subscription, by the padded canvas (up to 168x168; larger objects are refused)."
- Status flow: `expanding`, then `review-expansion`. `ObjectDetail.expansion_review` returns `existing_direction`, all 8 `rotation_urls`, and the resulting width/height. `POST /objects/{id}/select-frames` with **no** `indices` keeps all 8 and makes the object 8-direction; `POST /objects/{id}/dismiss-review` discards.
- `SelectObjectFramesRequest.indices` is now nullable specifically for this case (Oct 20 it was a required array).
- Why it could matter: a clean, reversible route from one item image to eight directions that keeps the object identity and its animations. Free import plus paid expansion could turn existing PixelDoll item art into objects without regenerating the base view.
- Unknown: same alignment/scale question as `create-8-direction-object`; also whether the 10 to 25 generation range is acceptable for a per-item step.

### `POST /objects/import` (new since Oct 20)

- `image` (required, PNG, at most 256x256), optional `name` (max 120). "Stored exactly as sent. JPEG is refused: its compression artifacts ruin pixel art." **Free.**
- Returns `object_id`, `group_id`, `size`, `image_url`.
- Why it could matter: the cheapest way to put a PixelDoll-extracted layer into PixelLab's object store, then `expand-rotations`, `states`, `animations`, `spritesheet`, `gif`, `zip` or `aseprite`.
- Unknown: whether imported transparency and pivot survive the later 8-direction expansion; the spec only says the stored PNG is exact.

### `POST /objects/{object_id}/states` (existed before)

- Body: `edit_description` (required, max 1000), `state_name` (max 100), optional `seed`, optional `target_palette`.
- "applies a text edit to an existing object's image(s) and saves the result as a new object grouped with the source via group_id." One state per call; the edit applies across all of the object's rotations.
- Why it could matter: one call can restyle every direction of an item (damaged, gold trim, snowy), but it is one item and one state, not a batch of items.
- Unknown: price (not stated in the spec) and whether states preserve canvas and pivot.

### `POST /objects/{object_id}/animations` (existed before)

- Modes `pro`, `v3`, `pixminimax`; no skeleton mode. `POST /create-object-pro-flash` says explicitly: "Objects have no skeleton."
- New since Oct 20: `direction_prompts` (see section 3), `pixminimax` support, and interpolation support on pixminimax.
- `direction_prompts` for objects: "A description per direction, for an 8-direction object (`mode='v3'` or `'pixminimax'`): an object with exactly all eight keys ..., 1-1000 characters each. Each direction is animated from its own text, so a sword swing can read left-to-right in east and right-to-left in west." Not for 1-direction objects, not with `enhance_prompt`; stored with the animation and reused when adding directions.
- `directions`: "Do not pass `directions` for 1-direction objects" (400); for 8-direction objects omit to animate all 8, or to fill the missing ones when extending `animation_group_id`.
- `custom_start_frame` / `end_frame` require exactly one direction; `end_frame` enables interpolation; dimensions must match the start frame.
- Price warning: `pro` is 10 to 25 generations per direction (80 to 200 for 8); `v3` is the default; pixminimax is priced by canvas and frames per direction (64x64 at 4/8/16/40 frames = 1/1/2/6 generations).
- Why it could matter: an item stored as an object can be animated on v3/pixminimax from its own frame, with per-direction text. It still cannot be posed onto the body skeleton, so it cannot follow a move frame by frame.
- Unknown: whether object animation keeps a fixed canvas and pivot relative to a character frame (the export text says the pivot is the cell center, which is at least stable), and whether `direction_prompts` materially improves layer consistency.

### Object exports

| Method and path                 | Status  | What it gives                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /objects/{id}/spritesheet` | existed | ZIP with `<name>.png` and `<name>.json`. Row 0 rotations, then one row per animation direction, columns in playback order. "Every cell has the same size (the largest frame on the sheet); frames are centred in their cell and never rescaled, so the object's pivot is always the cell centre. Unused cells are transparent." |
| `GET /objects/{id}/zip`         | new     | Every completed state as one ZIP, rotation and animation PNGs plus a top-level `metadata.json`; read the paths rather than assuming folders.                                                                                                                                                                                    |
| `GET /objects/{id}/gif`         | new     | Rotations as a turning GIF (200 ms each), or one animation direction with `animation_group_id` + `direction`. "Pixels are kept exact: binary transparency, never rescaled."                                                                                                                                                     |
| `GET /objects/{id}/aseprite`    | new     | One `.aseprite` file, single layer, every image as a frame, a `rotations` tag and one tag per animation direction (`walk-south`). Missing groups are named in `X-Skipped-Tags`.                                                                                                                                                 |

### Transparency and cut-out status

- No object create request has a `no_background` field, unlike character and edit endpoints. The spec does not state that objects are cut out; the tags call them "Props, items and scenery", and exports promise "binary transparency" and transparent unused cells.
- `POST /map-objects` is explicit: "Creates a pixel art object with transparent background for game maps." It is a one-off prop: no rotations, no animation, auto-deletes 8h after creation, 32 to 400 px (max 400x400 area, 192x192 with inpainting), and it accepts `init_image`, `background_image` and mask/oval/rect inpainting. That is a different, cheaper, non-persistent route to a transparent prop.
- Unknown and untested: whether object generation returns the generated prop on transparency (not a flat backdrop). This needs a paid probe, and it is the single most important fact for using objects as item layers.

---

## 2. Rotations, canvas, duplicate/ungroup, mirror, rename, save-to-asset, tags

### `POST /generate-8-rotations-v3` (path existed; request changed)

- New fields: `first_frame_direction` (default `south`), `direction_images` (map of up to 6 directions), `view`.
- `direction_images`: "Sprites you already drew for other directions (not `first_frame_direction`). The rotation sees all of them, so the directions it draws match your sprites, and your sprites come back exactly as sent. Up to 6 (leave at least one direction to generate). Every sprite must have `first_frame`'s canvas size: pad them to one canvas so they line up. Requires `view`. Same price as a rotation from `first_frame` alone."
- Output is `last_response.images`, 8 frames clockwise from `first_frame_direction`: south, south-east, east, north-east, north, north-west, west, south-west, wrapping.
- Max 256x256; 30 to 180 seconds.
- Why it could matter: it is the cheapest documented way to complete or repair a **direction set** from artwork the user already has, and it explicitly preserves supplied sprites pixel-exact. For paperdolling it is still one static pose per direction, not a move, and there is no frame alignment guarantee.
- Unknown: whether it can take an item PNG with transparency and keep alpha; the spec does not mention alpha for the reference or the generated frames.

### `POST /characters/{character_id}/canvas` (new, free)

- Body `image_size` (`CharacterCanvasSize`: 8 to 256, multiples of 4, both sides).
- "adding or removing transparent margin around every rotation, centred on the pivot. The artwork is never scaled or cropped: a size smaller than the rotations' own bounds is refused with those bounds. Animations keep the canvas they were made on. Free."
- Object equivalent `POST /objects/{id}/canvas`: same semantics, 8 to 400, "Animations keep the canvas they were made on", map placements follow.
- Why it could matter: if layers live in PixelLab, this is free, pivot-centered canvas normalization. It does not touch local PixelDoll layers.
- Unknown: what pivot means for a character versus a layer object, and whether animations made before and after a canvas change can be composited.

### `POST /characters/{id}/duplicate` and `/ungroup` (new, free)

- Duplicate: copies rotations, tags and project links into a new state of the same character; animations are not copied; named `Idle (copy)`, `Idle (copy 2)`.
- Ungroup: splits a state into a character of its own; the new character takes the old name with the next copy number; a single-state character returns 400.
- Object equivalents exist with the same "Free" text.
- Why it could matter: free branching of a layer or body variant without regenerating. Marginal for layers, because PixelDoll treats layers as its own data, not characters.

### `POST /characters/{id}/animations/{animation_group_id}/mirror` (new, free)

- Body `source_direction`, enum `east`, `west`, `south-east`, `south-west`, `north-east`, `north-west`. "It becomes its mirror image ... South and north face the camera and cannot be mirrored." The new direction joins the same group; refused if the target already exists; diagonals need an 8-direction character.
- Object equivalent exists.
- Why it could matter: a free way to halve animation generation for side directions. For PixelDoll's own layer pipeline it only helps if the item frames are produced through PixelLab animations, which they are not.

### `PATCH /characters/{id}`, `PATCH /objects/{id}`, `PATCH /characters/{id}/animations/{group}`, `PATCH /objects/{id}/animations/{group}` (new methods)

- Rename character/object `name` (shared by states), `state_name` (this state only), and character `prompt`; animation `display_name` applies to every direction. All free.
- Why it could matter: cheap bookkeeping if PixelLab stores one object per item layer or state.
- Unknown: nothing significant.

### `POST /save-to-asset` (new, free)

- `target`: `character:<id>:<direction>`, `object:<id>[:<direction>]`, either with `:<group id>` for one animation direction, `gallery:<id>`, `gallery:new`, or `tileset:<id>`.
- `image` (one PNG or an animated GIF) or `frames` (1 to 128 PNGs, same size), not both. "The image must match what it replaces: the same canvas size and the same number of frames (pad or crop with transparent pixels, never rescale)." Save each direction with its own call. Returns `previous_frames`; saving them to the same target is the undo.
- Why it could matter: a free write-back path for externally edited layers, with undo. It is per direction per call, not a batch.
- Unknown: whether it accepts alpha beyond "transparent pixels" in the padding note; the spec implies yes but does not say.

### Tags

- `PATCH /objects/{id}/tags` and `PATCH /characters/{id}/tags` existed before. Replace-all semantics, max 20 tags, max 50 characters each. No change.

---

## 3. Animation inputs that changed

### `POST /characters/animations` (`CreateCharacterAnimationRequest`)

New fields since Oct 20:

- `direction_prompts` (object equivalent also new): a prompt for **all eight** directions, "the same motion described as seen from each side. Each direction is generated from its own prompt; `action_description` still names the animation. Kept with the animation, so directions added later with `animation_group_id` reuse the set when left out. Not with `enhance_prompt`." Only `mode='v3'` or `'pixminimax'`.
- `template_action`: one of `walking`, `running`, `full sprinting`, `idle breathing`, `punch`, `left punch`, `high kick`, `swoop kick`, `two punch combo`, `uppercut`. Runs on pixminimax (default here) or v3; leave `action_description` out; the action fixes the frame count; works on every character, four-legged included.
- `motion_adjustments` (`MotionSliders`): `arm_swing` 0 to 1.5, `stride` 0 to 1.5, `posture` 0 to 1, `leg_extension` 0 to 1. Only `mode='skeleton-v3'` with `template_animation_id`; a direction added later reuses the group's sliders and different values are refused.

Changed fields:

- `frame_count` minimum lowered from 4 to 3, and skeleton-v3 with `action_description` now documents 3 to 15.
- `directions` now has an explicit enum of the 8 direction names.
- `target_palette` coverage: now "(modes pro, v3, pixminimax and skeleton-v3 ...)" for both the color list and the cap. Oct 20 said only "pro, v3 and pixminimax". This means a skeleton-v3 item pass can be recolored to a palette in the same paid call, which PixelDoll currently does in local post-processing.
- `animation_group_id`: now documents 409 for a direction the group already has, and 409 for a v3/pixminimax direction requested with a different mode; other `frame_count` / `keep_first_frame` values are allowed and the response `note` says the directions differ in length. `CreateCharacterAnimationResponse` gained `note`.
- `mode` text now spells out skeleton-v3 pricing (2 to 4 generations, about 2 to 3 minutes per direction, beta) and the template-mode batching at large canvases.

### Interpolation mode

- `custom_start_frame` and `end_frame` now apply to `mode='v3'` **and** `'pixminimax'` (Oct 20: v3 only). Providing either requires exactly one direction; for 8-direction objects pass that one direction in `directions`. `end_frame` dimensions must match the start frame. Default start is the object's idle frame for that direction.
- Why it could matter: a single item could be carried from one posed frame to another without a skeleton. It still requires the body pose at both ends and gives no guarantee for the intermediate frames relative to the body.
- Unknown: whether this interpolation is stable enough to use per move instead of skeleton keypoints. It is a candidate for a cheap probe only.

### Skeleton v3 and custom rigs

- `POST /estimate-custom-skeleton` (new): `images` 1 to 16 PNGs, all the same size, max 256x256; optional `description`, `action`, `direction`, `view`; optional `rig` + `reference`. Returns a rig (2 to 64 joints, parents first, one root; each joint has `name`, `parent`, `side` in near/mid/far, and `estimate` linking it to one of the 18 humanoid joints) and one skeleton per image. Beta, usually about a minute.
- `POST /animate-with-skeleton-v3` now takes `rig` and `write_motion_frames` (3 to 15) instead of `keypoints`; `keypoints` is nullable; limits "3-15 frames (1-15 with a `rig`, so a single frame can be redrawn)". `first_frame_keypoints` accepts "every joint of your `rig`"; `template_id` is used only for missing depth. The written motion returns `last_response.keypoints` and `last_response.motion_label`.
- Why it could matter: a cape, tail, wing or weapon can get its own joints and be animated with the same endpoint PixelDoll already uses, on its own layer image. That is a quality/control feature, not a batching feature, and it does not batch items.
- Unknown: whether a rig built on an item-only image (transparent background) estimates correctly, and whether item and body rigs can share a motion (they would need separate calls and identical keypoint coordinates).

### `template_id: custom`

- `CreateCharacterV3Request.template_id` now documents `custom`: "skips the skeleton, for bodies no template fits; such a character can't use skeleton-based animations." Not useful for items.

### `view` values

- `CreateCharacterWith8DirectionsRequest.view` is now an enum (`low top-down`, `high top-down`, `side`, `oblique`) and documents that `oblique` is 4-directions only. `CharacterDetail.view` enum now includes `oblique`. PixelDoll uses v3/pro/pro-flash, which keep their three views, so no action.

---

## 4. Anything that accepts multiple items, descriptions, characters or images in one request

Everything the live spec accepts as a batch, with the request schema field:

| Endpoint                                          | Field and limits                                                                                                                          | Semantics                                                                                             | Status                           |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------- |
| `POST /create-1-direction-object`                 | `item_descriptions` array, no maxItems, must not exceed the size-derived candidate count (1 to 64); `size` drives the count               | Several different objects in one paid call; per-slot text; review then select                         | existed                          |
| `POST /edit-images-v2`                            | `edit_images` 1 to 16; grid limits by `image_size`: 32-64 px 16, 65-80 px 9, 81-128 px 4, 129-512 px 1 (one fewer with `reference_image`) | One edit description applied to every image; "Edit multiple images consistently"                      | existed                          |
| `POST /edit-animation-v2`                         | `frames` 2 to 16; 16-64 px 16, 65-80 px 9, 81-256 px 4                                                                                    | One edit description across all frames, temporal coherence                                            | existed                          |
| `POST /transfer-outfit-v2`                        | `frames` 2 to 16, same tiering, one fewer with the reference image                                                                        | One outfit/reference applied to a whole animation                                                     | existed                          |
| `POST /objects/{id}/states`                       | one `edit_description` applies to all rotations of that object                                                                            | One item, all directions, one state                                                                   | existed                          |
| `POST /objects/{id}/animations`                   | `directions` array plus one `direction_prompts` map                                                                                       | One object, many directions; one job per direction                                                    | existed, `direction_prompts` new |
| `POST /characters/animations`                     | `directions` array plus `direction_prompts` (all 8 keys)                                                                                  | One character, many directions; `background_job_ids` one per direction                                | existed, `direction_prompts` new |
| `POST /characters/{id}/animations` (POST)         | one animation group, many directions                                                                                                      | One character, additions to one animation                                                             | existed                          |
| `POST /ui-assets/states`                          | `element_ids` 1 to 64, `states` 1 to 16                                                                                                   | One generation draws every element in every state on one labelled grid                                | new                              |
| `POST /estimate-custom-skeleton`                  | `images` 1 to 16                                                                                                                          | One skeleton estimate across frames                                                                   | new                              |
| `POST /reduce-colors`                             | `images` array, 512x512 total pixels                                                                                                      | "quantized together, so an animation or a character's eight directions come back sharing ONE palette" | existed                          |
| `POST /correct-pixelart`                          | `images` array, max 1024x1024                                                                                                             | Each frame corrected separately; transparency preserved                                               | existed                          |
| `POST /save-to-asset`                             | `frames` 1 to 128                                                                                                                         | Write an animation into one stored asset                                                              | new                              |
| `POST /tilesets/import`, `POST /tiles-pro/import` | `frames` 1 to 32                                                                                                                          | Tile import only                                                                                      | new                              |

What is **not** there:

- No field anywhere takes multiple characters, multiple characters plus items, or a list of item descriptions for a character.
- No animation or edit endpoint returns a layer; they return full frames or the edited full image.
- `save-to-asset` is the only write-back, and it is one direction per call.

### Changes-only and layer output

- `POST /inpaint-image-pro-flash` (path existed before Oct 20; request schema unchanged) is the only request in the spec with `output_method`:
  - enum: `New layer with changes`, `Modify current layer, only changes`, `Modify current layer` (default).
  - "Replace only white mask pixels, preserving unmasked RGBA exactly. ... Changes-only outputs are transparent outside the mask; Modify current layer returns the full composite."
  - Other fields: `image`, `mask_image` (identical native dimensions, pure black/white RGB; alpha does not change mask meaning; empty masks rejected), `description`, optional `context_image` and `bounding_box` ("The native source rectangle within the additional context image"), `no_background`, `background_removal_task`, `crop_to_mask` (const true, default true), `seed`, `project_id`.
- `POST /inpaint-v3` (what PixelDoll uses) has **no** `output_method`; it has `crop_to_mask`, `context_image` (deprecated) and `bounding_box` (deprecated) and returns the composite. `InpaintV3Request` fields: `description`, `inpainting_image`, `mask_image`, `context_image`, `bounding_box`, `seed`, `no_background`, `crop_to_mask`.
- `POST /remove-background` (existed) produces a transparent PNG, max 400x400, with `remove_simple_background` or `remove_complex_background`, optional foreground description.
- Why this matters: `inpaint-image-pro-flash` with `Modify current layer, only changes` is the closest public equivalent to "give me only the pixels that changed" and therefore to a transparent item layer without chroma keying. It is per image, not per batch, and it is a different model from `inpaint-v3`.
- Unknown: the price (the spec does not list one; `/pro-flash/cost` only covers Pro Flash create/rotation units), whether "only changes" is pixel-exact outside the mask (it claims exact preservation), and whether it handles a 256x256 canvas with a 1-gen-class charge. This is worth a cheap probe.

---

## 5. `ui-assets/states` element batching, and whether it generalizes

- `POST /ui-assets/{ui_asset_id}/split` (new, free) cuts a generated UI template into elements using `boxes` (up to 64, template pixels) or the template's own split preview.
- `POST /ui-assets/states` (new) body: `element_ids` (1 to 64, from the split's `elements`), `states` (1 to 16 `UIStateSpec` with `name` and `description`), optional `target_palette`.
- "All of them in one generation: the states match across them." "One generation draws every element in every state on one labelled grid, so a set stays consistent. Priced by that grid's side (each element plus an 18 px margin, a 24 px label per state): 10 generations up to 256 px, 15 up to 341, 25 above." Charged when the states are saved.
- Is this a general batching mechanism for characters or items? No. The IDs are UI assets from a UI template; there is no element concept for characters, objects, or layers, and no generic "grid of things in one generation" endpoint. It is evidence of PixelLab's internal pattern (grid plus labels, one paid generation, sliced afterward) and of how they price it, not a capability PixelDoll can call for items.

---

## Other new endpoints, judged out of scope

`/vfx` and `/vfx/effects` (animated effects, can surround a supplied sprite), `/music` family, `/sound-effects` family, `/create-room`, `/rooms` family including `cut-out-furniture` and `kit.zip`, `/tilesets/import`, `/tiles-pro/import`, `/ui-assets/{id}/zip`, `/characters/{id}/vocal-animation/{mood}` delete, and `/animations` PATCH/DELETE additions. None touch layer separation, item creation, or per-move alignment. `rooms/cut-out-furniture` is a room-level furniture cutout, not a character layer.

---

## Spec-level negatives (answers to brief questions 1 and 2)

- The public spec contains no paperdoll, equipment slot, wearable, overlay, inventory (only UI copy), or composite-layer system for characters. Word search: `paperdoll` 0, `equipment` 1 (a use case in transfer-outfit-v2 text), `inventory` 2 (UI copy), `overlay` 0, `worn` 0.
- No public endpoint generates multiple equipment items for one animation in one call. The closest three are, in order: `create-1-direction-object` with `item_descriptions` (several different items, one call, no body), `edit-animation-v2` (one edit across up to 16 frames of one animation), and `ui-assets/states` (several elements times several states, UI only).
- `llms.txt` (live, 2026-11-24) lists every endpoint and its one-line summary; it also has no paperdoll or equipment section. It confirms the object endpoints and the new library endpoints above.

---

## Ranked shortlist

### Most likely to change our paperdoll plan

1. **`POST /inpaint-image-pro-flash` with `output_method: "Modify current layer, only changes"`** (existed before, unused by PixelDoll). A changes-only transparent output is exactly the layer-extraction step PixelDoll currently approximates with a chroma key and despill. Verify price and alpha exactness on one stored frame before anything else.
2. **`POST /create-1-direction-object` with `item_descriptions`** (existed before). The only true multi-item paid call: one generation, 1 to 64 candidate objects, per-item text. Blocked by map-oriented views, no pose/body reference, and unproven per-candidate quality and transparency.
3. **`POST /generate-8-rotations-v3` with `direction_images`** (new). Completes an item's direction set from user-supplied sprites at the single-rotation price and returns supplied sprites unchanged. This could repair or extend existing item direction art cheaply, as long as static-pose rotation is acceptable.
4. **`POST /objects/import` (free) + `POST /objects/{id}/expand-rotations` (10 to 25 generations)** (both new). Reversible route from one extracted item PNG to eight directions that keeps object identity and animations.
5. **`POST /characters/{id}/animations/{group}/mirror` (free)** and **`POST /objects/{id}/animations/{group}/mirror` (free)**. Free opposite side direction for any animation PixelLab holds, if we ever move item animation to PixelLab.

### Worth a cheap probe

1. `create-1-direction-object` at 128 px with 4 real item descriptions (4 candidates, 10 to 25 generations): do the four items come back cut out, at consistent scale, and usable at all?
2. `inpaint-image-pro-flash` changes-only on one dressed frame with a hand mask: is the result a clean transparent item layer, and what did it cost? Check `/balance` before and after only.
3. `generate-8-rotations-v3` with one item frame plus one or two hand-drawn directions: does it preserve the supplied sprites and keep alpha, and does it accept a transparent item image?
4. `objects/import` + `expand-rotations` on one extracted layer: does the pivot/silhouette stay usable, and what does the review actually show?
5. `map-objects` with `init_image` plus inpainting, if a transparent single prop is needed; props are non-persistent (8 h) and not rotatable.

### Irrelevant

`/ui-assets/states` batching as a general mechanism (UI only), `/rooms` and `cut-out-furniture`, `/vfx`, `/music`, `/sound-effects`, `/tilesets/import`, `/tiles-pro/import`, `/vocal-animation`, `/talking-gif`, `/lip-sync`, `/generate-font-pro`, `/normal-map`, `/resize`, `/unzoom` (though `unzoom` remains a useful pre-step for references), `/correct-pixelart`, `/reduce-colors` (already useful, unchanged), and the `oblique` character view (4-direction only, not usable through PixelDoll's v3/pro paths).

---

## Could not verify

- Whether object creation and object rotation produce transparent RGBA by default. The spec never says so for `/create-1-direction-object` or `/create-8-direction-object`; only exports and map objects use the word transparency.
- Whether the 1-direction candidate pack is a single grid image or separate files per candidate; `frame_urls` and `select-frames` imply separate images, but the spec does not show the pack layout.
- Actual billed cost of `create-1-direction-object` as a function of candidate count, and the price of `inpaint-image-pro-flash`, object states and object animations (only character/object animation "pro" and pixminimax prices are stated).
- Whether object rotations from a reference item preserve scale, pivot, palette and alpha tightly enough to overlay on a body frame.
- Whether `direction_prompts` or `target_palette` on skeleton-v3 changes layer consistency in practice.
- Whether `generate-8-rotations-v3` accepts (and preserves) alpha in `first_frame` and `direction_images`.
- Whether a custom rig can be estimated on a transparent item-only image and reused for a body-aligned item pass.
- No paid call or token use was made, so none of the above was observed empirically; all statements are from the public spec and `llms.txt` only.
