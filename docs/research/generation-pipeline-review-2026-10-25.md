# Generation pipeline review and plan (2026-10-25)

Status: **proposal, nothing implemented in the app; experiments spent 94.1 generations (§13) plus 937 in rounds 8–9 (§15–§16). Skeleton-v3 is deferred by the owner (§15); the skeleton-free route is §16.6.** The owner's concerns are recorded with verdicts in §1
(round 1), §8 (round 2), §9 (round 3), §10 (round 4, the bottleneck), §11 (round 5, the approach decision), §12 (round 6, a friend's PixelLab vs Godot comparison), §13 (round 7, experiment results), §15 (round 8, mocap move library; skeleton-v3 deferred) and §16 (round 9, the skeleton-free route); the plan is §4–§7 as revised by §10.5 and §11.4, superseded for moves and items by §16.6. Branch `claude/peaceful-robinson-0f1148` (rounds 1–7 started on `claude/paper-doll-system-optimization-c411d9`, uncommitted there).
Sources: a code trace of `app/src` (file:line refs below), the live PixelLab OpenAPI and docs (same 102 paths as
[pixellab-openapi-v2.json](pixellab/pixellab-openapi-v2.json)), and our own measurements (S1–S5, the 2026-10-25 campaign
rounds, T3, B16).

## 1. The owner's concerns, checked one by one

| # | Concern | Verdict | Evidence |
|---|---|---|---|
| 1 | "Too many endpoint calls" | **True for characters, mostly false for items.** A default character makes **117 paid POSTs**; 100 of them are `estimate-skeleton`. A default worn item makes 6 calls. | `studio/create.ts:303-428`, `items/run.ts:263` |
| 2 | "Use create-character + create-character-state as the only endpoints" | **Not possible.** `create-character-state` edits only the 4 or 8 **rotations**, the standing views. Animating a state redraws the whole body: 815–891 px per frame differed from the base walk, so the item no longer lines up. | OpenAPI `/create-character-state`; S1 E4 |
| 3 | "edit-animation-v2 is limited to 3 frames and small sizes" | **False.** It takes 16, 9 or 4 frames per call at ≤64, 65–80 or 81–256 px. We send 3–5 frames because we dress only the standing views. Its size limit is 256, the same as every character and animation endpoint. | OpenAPI; `routes.ts:65` |
| 4 | "Edit image (Pro) for small characters, state for big ones" | **Not supported by the evidence.** `edit-images-v2` shifted **32/32 frames** and lost the key (kept 0.53–0.67). It only goes past 256 px at 1 frame per call, and characters cannot exceed 256 anyway. | S4 Q3 |
| 5 | "We don't need estimate-skeleton, PixelLab already makes the skeleton" | **Half true.** PixelLab returns keypoints for the **rotations** (`skeletons["2d_references"]`), but no REST field exposes **animation** keypoints. 60 of our 100 estimates are avoidable now; the other 40 go if walk is authored. | `create.ts:343`, `:222`, `:266` |
| 6 | "Drop our own rig; let PixelLab draw items by eye" | **False.** The stored keypoints are what keep items aligned. Letting PixelLab animate a dressed character measured IoU 0.65–0.84 with pixminimax/v3 and 3–6 % outside with managed skeleton-v3, against 0.977–0.988 IoU for our raw posing. | S3 K6; S4 |
| 7 | "Weapons are put on a hand joint and moved/rotated by our code" | **Mostly false.** PixelLab draws every weapon frame. Our code (a) shifts each frame by up to ±1 px to register it, (b) fills a ≤2 px grip gap, and (c) on near-rest frames where the weapon vanished, pastes the dressed standing view, moved by the wrist delta and never rotated. (c) can hit **every idle frame**, because idle moves at most 1 px. | `items.ts:530`, `:499`, `:634` |
| 8 | "Items are made from the static rest pose so they don't animate" | **Half true.** The *design* is drawn on the standing views. Every animation frame is then **redrawn by PixelLab** (`animate-with-skeleton-v3`) with the move's keypoints, so the item does move. Weak spots: posed bodies sit 1–3 px off at the hands and legs, and capes vanish on north slash. | `run.ts:172`, arch §4.1 |
| 9 | "Hair sometimes static, sometimes moving" | **Explained; the main cause is by design.** Idle moves the upper body by 0–1 px (`poses.ts:68`), so everything is almost still in idle. Idle item frames are also posed with the **"walking"** wording (bug, `items.ts:137`). In walk, hair moves with the head, since there are no hair joints. Small loose strands are deleted (`sizeFloor`, `items.ts:568`). Mirrored west views are flips. | see refs |
| 10 | "Size is capped very small" | **False.** The body is 32–256 px (presets 48/64/96/128), the frame is up to 256, and auto frame allows a body up to about 224. PixelLab's maximum is **256 on every character and animation endpoint**; nothing allows 512, on any tier. Real limits at large sizes: held items must fit a 256 px padded canvas; dressing takes 4 frames per call above 80 px at 15–25 gens; the inpaint fallback does not fit above body 96. | `characterConfig.ts:4,33,119`; OpenAPI |
| 11 | "Size limits depend on the tier" | **Only for inpaint and Pro image edit above 256** (Tier 2+). Character size has no documented tier rule. | PixelLab docs; `plans.ts:37` |
| 12 | "It takes far too long" | **True.** Creation runs four slow steps in a row: draw → register → managed walk (3–5 min) → 40 estimates → raw walk re-render (3–5 min) → 40 estimates. That is about 12–19 min. The **managed walk exists only to extract keypoints**; it is drawn and then discarded. | `create.ts:352-369`; B7 ~19 min |
| 13 | "Stream results live" | **Mostly feasible, with one hard limit:** the 8 rotations arrive together from one job and cannot appear one at a time. Moves and items stream per direction, because each is its own job. | OpenAPI `/background-jobs`; `queue.ts:943` |

## 2. What happens today (default: body 64 in an 80 px frame, Top-down 8 = 5 drawn views S/SE/E/NE/N + 3 mirrored)

### 2.1 Create a character (57 gens expected, 117 POSTs, ~12–19 min)

```
1  POST /create-character-v3        text → 8 rotations                  2 gens    ~3–5 min
2  POST /create-character-v3        re-import the 8 padded views          0.25      (to get a managed character on the 80 px canvas)
3  GET  /characters/{id}            rest keypoints (2d_references)       free
   ── then for each of 5 directions, all in parallel ──
4  POST /animate-with-skeleton-v3   idle, 4 authored poses              3 ×5
5  POST /estimate-skeleton          every idle frame (QA only)          0.1 ×20
6  POST /characters/animations      walk, managed skeleton-v3 template  ~3 ×5    ← drawn only to read its poses
7  POST /estimate-skeleton          every managed walk frame            0.1 ×40
8  POST /animate-with-skeleton-v3   walk re-rendered on the rest view   3 ×5
9  POST /estimate-skeleton          every raw walk frame (QA only)      0.1 ×40
```

Example requests (base64 abbreviated):

```jsonc
// 1  draw
{"description":"Kind: Elf\nplain bald paperdoll base body, with plain bare skin everywhere, nothing worn, barefoot, no hair, …",
 "image_size":{"width":64,"height":64},"view":"low top-down","template_id":"mannequin","seed":918273645,"no_background":true}
// 2  register
{"description":"Kind: Elf, bald, …","reference_image":"<png 80x80>","direction_images":{"south-east":"<png>","…":"…"},
 "n_directions":8,"view":"low top-down","template_id":"mannequin","no_background":true,"seed":918273645}
// 6  managed walk (one direction per call)
{"character_id":"<id from 2>","mode":"skeleton-v3","template_animation_id":"walking-8-frames","animation_name":"walk","directions":["south"]}
// 4 / 8  raw pose
{"description":"<looks>","action":"walking","direction":"south","view":"low top-down","first_frame":"<png 80x80 rest>",
 "first_frame_keypoints":"<18 kps>","keypoints":["<18 kps> ×8"],"seed":918273746,"no_background":true}
// 5 / 7 / 9
{"image":"<png 128x128, frame padded>"}
```

### 2.2 Add an item (worn: 25 gens, 6 calls; held: 50 gens, 12 calls)

```
worn / head / hair / cape:
1  local   recolor the 5 standing views to a chroma key (green, magenta, blue or azure)
2  POST /edit-animation-v2           dress all 5 views in one call       10 gens   ~1.5–3 min
3  POST /animate-with-skeleton-v3    per direction: idle 4 + walk 8 in ONE call (12 frames)   3 ×5   ~2–5 min
4  local   key out the mannequin, clean up, QA gates; failures re-roll ≤2×, then a 1-call inpaint-v3 grid
held (sword, bow, shield): 112 px padded canvas → cap 4 frames, so 2 dress calls in a row (the 2nd dresses only N plus an
anchor whose output is discarded); idle and walk posed separately → 10 pose calls.
```

```jsonc
// dress
{"description":"This pixel art character is a solid green mannequin. … Add only brown leather vest … Cells in order: … Keep every other pixel …",
 "frames":[{"image":"<png 80x80 chroma>","size":{"width":80,"height":80}}, "…×5"],"image_size":{"width":80,"height":80},"no_background":true,"seed":1234567}
// pose
{"description":"solid green mannequin (chroma key color) wearing brown leather vest, empty hands, no weapon",
 "action":"walking, empty hands, no weapon, no effects","direction":"south","view":"low top-down",
 "first_frame":"<png 80x80 dressed view>","first_frame_keypoints":"<18 kps>","keypoints":["<18 kps> ×12"],"no_background":true}
```

The item route is already cheap. The base route is where the waste is.

## 3. Endpoint facts that drive the design

| Endpoint | Gives | Frames/call | Max px | Gens | Time | Item use |
|---|---|---|---|---|---|---|
| create-character-v3 | 4/8 rotations + rotation keypoints | – | 256 | 1 + ceil(s²·8/65536) | 3–5 min | base |
| create-character-state | edited **rotations only**, new character | – | 256 (`override_frame_size`) | 10–25 | ~2 min (1 sample) | possible **dresser** (untested) |
| edit-animation-v2 (Pro) | edited frames you send, same order | 16/9/4 | 256 | 10/15/25 | 1.5–3 min | dresser today; possible per-move editor |
| transfer-outfit-v2 (Pro) | outfit from a reference image | 15/8/3 | 256 | 10/15/25 | 1.3–3 min | concept images; drifted (sword CV 0.27–0.39) |
| edit-images-v2 (Pro) | edited images | 16/9/4/**1** | 512 | 10–25 | ~1–1.5 min | **rejected**: shifts every frame |
| inpaint-v3 (Pro) | one masked image | 1 grid | 256 (Tier 1), 512 (Tier 2+) | 10/15/25 | 1–2 min | fallback grid |
| animate-with-skeleton-v3 | exactly `len(keypoints)` frames | 3–15 | 256 | 2/3/4 | **3–5 min** | poses base and items, aligned |
| /characters/animations | managed move, one job per direction | template | 256 | 2–4 | 2–5 min | motion source only |
| estimate-skeleton | 18 keypoints, synchronous | 1 | 256 | 0.1 | seconds | QA |

Streaming: every endpoint returns only when finished, and there are no partial frames. A character's rotations come from
one job; moves and item poses come as one job per direction.

## 4. Recommendation

Keep the parts that the measurements back: the chroma key, raw posing on stored keypoints, and the local cleanup. Remove
the parts that only cost time.

### 4.1 Character: Default first, moves on demand

1. **Create = 1 call (about 2 gens, 3–5 min).** Draw with `create-character-v3`. Read the rest keypoints from
   `GET /characters/{id}` and shift them by our padding offset; normalization only pads, never scales. *Experiment E0
   must confirm that these keypoints match the re-import's within 0.25 px.* If they match, the re-import (call 2) and the
   fallback estimates go away. Custom-art import keeps its own path.
2. **New "Default" move.** One frame per direction: the standing views. It is ready as soon as the draw finishes, and all
   8 views appear together (the API limit). Use the id `default` with the existing `imported-rest` single-frame path; not
   `rest`, which collides with internal keys (`items.ts:128`).
3. **Idle and walk are added from Moves**, with a one-tap "Add idle + walk".
4. **Walk without the managed render.** Author walk keypoints from the rest pose, as idle already is, or retarget one
   stored PixelLab walk sequence to each body. That gives one raw call per direction (3 gens) instead of managed + raw +
   40 estimates (about 7.6 gens), and halves the wait. *Experiment E2 decides whether the authored or retargeted walk looks
   as good as today's.*
5. **Stop the QA-only estimates** (60 per character). Use the keypoints we sent as the measured joints, and estimate only
   on demand when a check needs it.

Effect: about 117 → 1 call at creation. Idle + walk later: 117 → about 10 calls and 57 → about 30 gens. The wait for
something usable drops from 12–19 min to 3–5 min.

### 4.2 Items: two steps, dress then pose

**Round 3:** §9.5 supersedes this section. It describes approach 1 only; approaches 2 and 3 edit the real move frames instead.

Every route has the same two steps:

1. **Dress:** draw the item once on the standing views of the chroma body.
2. **Pose:** redraw it for each move-direction with `animate-with-skeleton-v3` on the stored keypoints. This is 3–15
   frames per call, up to 256 px, and it is the only measured way to stay aligned with the body.

The open choice is the **dresser**. The owner's rule: **all drawn views in ONE call**, because splitting the dress across
calls changes the design. Splitting with an anchor cell holds it better than separate calls (palette distance 8.6–10 anchored vs 29–34
for transfer-outfit with a reference; S2 X4. Edits without an anchor: 3–11 between directions, S4), but it is still a weaker lock.

| Dresser | Biggest view with all **8** views in one call | With the **5** drawn views (default mirrored) | Cleanup evidence on a chroma body | Tier |
|---|---|---|---|---|
| `edit-animation-v2` | 80 (cap 9) | 80 (above 80 the cap is 4) | **best measured**: key kept 0.98–1.00, ≤ 1.3 % outside | none documented |
| `edit-images-v2`, our own sheet as 1 image | 170 (3×3 of 512); 85 on Tier 1 (256) | 170 (3×2) | **worst measured**, per frame: 32/32 shifted, key kept 0.53–0.67. Never tried as one sheet or with re-registration | > 256 needs Tier 2 |
| `inpaint-v3`, our own sheet | 170 (512); 85 on Tier 1 | 170 / 85 | **cleanest pixels**: key kept ≥ 0.99, outside ≤ 0.003, exact outside the mask. Our current fallback | > 256 needs Tier 2 |
| `create-character-state` | **256** (+ `override_frame_size` for weapons) | 256 | **never tested on chroma**. On a skin body: silhouette kept, 0 shift, 74 % of body px recolored | none documented |

Reading of the table:

- State is the only dresser with no frame or size problem, so it is the **lead candidate above 80 px**, as the owner
  proposed. What decides it is **whether the green body survives the edit**. If PixelLab "humanizes" the key (recolors
  green toward skin), chroma extraction fails and the state route is out. E3 measures exactly this.
- Up to 80 px, `edit-animation-v2` already does all views in one call with the best measured cleanup. State replaces it
  there only if E3 shows state is at least as clean, which would mean one route for every size.
- The `inpaint-v3` sheet is the fallback if state fails: 170 px on Tier 2, 85 px on Tier 1.
- `edit-images-v2` gets one cheap sheet test, because its measured record is the worst.

Other item work, whatever dresser wins:

- **Start each direction's pose when its dressed view exists**, not after every dress chunk and every QA pass.
- **Fix** the idle pose wording, and pack held items' idle and walk into one call (−15 gens per held item).
- **Drop the held second dress call** by using a single-call dresser.
- *Lower priority:* edit the real walk frames with `edit-animation-v2`, which draws the item on the exact body frames. It
  costs 10 gens per direction instead of 3, and needs 3 calls above 80 px.

### 4.2.1 Storing generations on PixelLab's server

What PixelLab keeps permanently:

- characters: `create-character-v3`, imports and states;
- managed animations: `/characters/animations`.

Raw jobs (`edit-animation-v2`, `animate-with-skeleton-v3`, `inpaint-v3`, `edit-images-v2`) are only background-job results,
and their retention is undocumented.

So with the state route, the server would hold:

- the base;
- a **green** mannequin;
- one green mannequin per item, wearing the item, standing views only.

It would not hold the item layers or any posed animation frame, since posing is a raw job. Each item would also add a
library entry.

Putting the whole pipeline on the server means animating each state with managed `/characters/animations`. That was
measured: IoU 0.93–0.95, 3–6 % outside, and the sword lost on 3–4 of 6 frames, against 0.98 for raw posing (S3 K6).

**Conclusion:** server storage is a small extra (the standing views survive on pixellab.ai), not a reason to choose a
route. We already store every frame in IndexedDB and in the project ZIP. Cross-device backup would be its own feature.
Optional E6 re-tests managed posing on a state for the record.

### 4.3 Streaming and optional review

The approach is a **read-only overlay**: show what has arrived as a view built from the saved job results, and keep
publishing each move and each item atomically. The rig-version guards and `baseHash` stay intact.

- Per (move, direction) and per (item, direction) **loading markers** in Preview, Top-down and Side-scroller. They reuse the
  resolver's `loading` state and `coverage`. Missing cells must show as *loading*, not as transparent; today
  `buildItem` writes `null`.
- **The item preview appears after the dress call** (Default pose, about 2 min). Then each direction's walk/idle fills in
  as its job lands. Re-evaluate after every finished call, not only at the two checkpoints (`run.ts:278,285`).
- **Equip a draft while it loads.** The slot holds the draft id, which `acceptItem` keeps, and the slot is cleared on
  discard.
- **Optional review** (changes D7). An item auto-saves when it is structurally complete. Failed or warned checks show a
  badge; Review / Regenerate / Keep stay available at any time.

## 5. Experiments (live; asking before spending)

They reuse one body and test the south and east directions with walk only. Agent dev server (`npm run dev:agent`), driven
in Claude Browser. Every request, image and timing is saved. Results are judged side by side, without route labels.

| # | Test | Pass | Est. gens |
|---|---|---|---|
| E0 | GET the drawn character's skeletons; compare padded `2d_references` with the re-import's | ≤ 0.25 px on every joint, 5 views | 2.5 |
| E1 | Base timing: draw + register | record wall time | (in E0) |
| E2 | Walk S+E: today's managed→raw route vs authored vs retargeted raw | IoU, foot slide, a human look at the frames, wall time | ~25 |
| E3 | 3 items (long hair, cape, sword), 1 seed. Dressers: A `edit-animation-v2` (today), B **state** on the imported chroma body (`use_color_palette_from_reference: false`), D `inpaint-v3` sheet, E `edit-images-v2` sheet (one sheet each). Pose S+E walk for A and B, and for D or E only if they pass the dress gates | Dress: key kept ≥ 0.97, outside ≤ 0.05, shift 0, one design across views. Posed: same + palette distance, motion, time | ~180 |
| E4 | Second seed on E3's close calls | same | ~70 |
| E5 | The best dresser at body 128 / frame 160 and at body ~200 / frame 256, with a held canvas near 256 | same + gens and time per item | ~90 |
| E6 | Optional: managed walk of the base and of its chroma state, S+E (the server-only route) | IoU ≥ 0.98 vs the base | ~12 |
| | **Total** | | **~380 of 1,000** |

E3 B order: import the chroma views as a PixelLab character (0.25), then `create-character-state`
`{character_id, edit_description: "wearing <item>; the body stays the exact same solid green …", no_background: true,
use_color_palette_from_reference: false}`. Read all 8 rotations back and run the existing dress gates on our 5 drawn views.

Stop rules: no automatic paid resends; abort a route after 2 hard failures; report spend after each experiment.

## 6. Bugs found on the way (not fixed)

1. On Tier 1, a default worn item's inpaint fallback grid (320×400) is held waiting for Tier 2 (`plans.ts:39`,
   `queue.ts:765`). It should skip or shrink the grid instead.
2. Idle item frames are posed with the "walking" action (`callAnim`, `items.ts:137`).
3. `repairDropped` can replace idle weapon frames with a pasted standing view (`items.ts:530`). It is allowed by S5, but
   the user sees it as a static weapon.
4. `docs/architecture.md` is out of date in 14 places (sizes 64→80, 3→5 dress frames, 46→25 gens, the 96→112 held canvas,
   transfer-outfit only on 64 px rigs, …). Update it with the implementation.

## 7. Implementation phases (after the experiments)

1. **Cheap wins, no UX change:** bugs 1–2, QA estimates from the sent keypoints, earlier per-direction poses, packed held
   idle+walk. Tests: unit, `studio`, `characters`, `character-creator`.
2. **Default move + moves on demand** (+ E0 import removal, + the E2 walk route). Tests: `character-creator`, `characters`,
   `creator-request-matrix`, `api-peek`, `experience-parity`, unit `create-flow`, `api-plans`, … Full e2e (studio state).
3. **Streaming overlay + equip-while-loading + optional review** (D7 change). Full e2e.
4. **Dresser switch** only if E3/E5 show a better route.
5. Later: switch the animation model (custom v3 / pixminimax). This is deferred, as the owner said.

## 8. Owner follow-up (round 2), checked

| Claim | Verdict |
|---|---|
| "create-character-state is used to create the character" | **No.** No route uses state today. The second call is `create-character-v3` in *import* mode. It re-registers the padded views so the managed walk has a PixelLab character on our canvas. §4.1 removes it. |
| "edit-animation-v2 is limited to 64 px" | **Half true.** It goes to 256, but 16 / 9 / 4 frames at ≤ 64 / ≤ 80 / ≤ 256. **8 views in one call → ≤ 80 px.** Correct, and a real limit. |
| "Splitting the dress over calls changes the design" | **True.** With an anchor cell, palette distance is 8.6–10, against 29–34 for transfer-outfit with a reference (S2 X4; corrected in round 4): better, but still a weaker lock than a single call. That is why §4.2 requires one call. |
| "Pack a sprite sheet before editing" | **Agreed for `edit-images-v2` and `inpaint-v3`:** it beats their 1-frame limit above 128 px, giving 170 px per view on Tier 2 and 85 on Tier 1. Our inpaint fallback already does this. `edit-animation-v2` packs frames itself. Whether state packs internally is not documented. |
| "edit-images max 170 px for 8 views" | **True only with our own 512 sheet on Tier 2**, and its measured record is the worst (shifts, key loss). |
| "State works for all 8 views up to 256" | **True by spec:** one call, all 4 or 8 rotations, canvas up to 256 (`override_frame_size`, multiples of 4, not smaller than the source). Its size is the character's size. Price is documented as 10–25 gens; above 168 px it is unknown. |
| "State has worse cleanup than edit images" | **Unknown.** It has never been tried on a chroma body. On skin it kept the silhouette with 0 shift but recolored 74 %. edit-images measured worse (shifts). |
| "Use edit images for small, state for large" | **Revised:** `edit-animation-v2` for ≤ 80 px; state above, if E3 passes. See §4.2. |
| "Server storage outweighs cleanup caveats" | **Disagree:** the server keeps only green standing views, not layers or animations. See §4.2.1. |

## 9. Round 3: why the duplicate calls exist, and the item approaches

### 9.1 The duplicate calls, explained

| Duplicate | Why it exists today | Can it go? |
|---|---|---|
| A second `create-character-v3` (import of the padded views) | (a) The managed walk needs a PixelLab character whose rotations are **our padded 80 px views**, so its frames start from our exact rest images. (b) It also gives rest keypoints on that canvas. | **Yes.** Keypoints: take the first character's `2d_references` and shift them by the padding offset (E0). The managed walk can render from the original character and be re-centered, as S3 already does. |
| Updating images on PixelLab instead of re-importing | No such endpoint exists. `/characters/{id}` has only GET and DELETE, plus PATCH for tags; there is no rotation upload. | **Not today.** Request it from PixelLab (§9.4). |
| Walk drawn twice (managed, then raw) | Managed skeleton-v3 makes PixelLab's good template motion, but REST does not return its keypoints. So we estimate them (40 calls) and redraw the walk raw, which lets items be posed with **the same** keypoints. | **Yes** with approach 2 below: items are edited onto the managed frames themselves, so there is no redraw and no estimate. With approach 1 it can go if E0b finds the keypoints in the ZIP. |
| "PixelLab already estimates animation skeletons" | The PixelLab owner says it does. `GET /characters/{id}` documents animation skeletons as "stored in character_animations table" with no REST field. `GET /characters/{id}/zip` claims `metadata.json` has "keypoints for all frames". | **E0b (free):** download a ZIP of a character with a skeleton-v3 walk and look for per-frame keypoints. If they're missing, report it to PixelLab as a bug. |

### 9.2 create-character-state: what it can and cannot do

- **It can:** dress all 4 or 8 **rotations** of a character in one call, on a canvas up to 256 (`override_frame_size`,
  multiples of 4, not smaller than the source), for 10–25 gens (the price above 168 px is unknown). One edit is applied
  consistently to every direction.
- **It cannot:** touch animations. A state has no animations, and animating it redraws the body, which no longer lines
  up (815–891 px per frame differ; S1). **So state is only for the Default (standing) item, never for moves.**
- **It needs a character id.** For chroma extraction, the green body must exist on PixelLab. The only way is an import:
  `create-character-v3` with `reference_image` plus all `direction_images` (0.25 gens, pixel-exact, one more library entry
  per character). Padding is local; there is no padding option on create, but `override_frame_size` pads the state's
  output.
- **Untested:** whether the green survives (state recolored 74 % of a skin body); its cost and time at 80–256 px.

### 9.3 Dressers: one call, every view (the table the owner asked for)

**Largest view** = biggest frame at which all views of a move or of the Default fit in **one** call. Tier rule: sheets
above 256 px need Tier 2+ (`edit-images-v2`, `inpaint-v3`).

| Tool | Default: 8 views / 5 views | One move, 8 frames + 1 anchor | One move, 15 frames + 1 anchor | Measured on the color-keyed body | Cost / time |
|---|---|---|---|---|---|
| `create-character-state` | **256 / 256** | – (rotations only) | – | never tested | 10–25 gens; ~1–5 min |
| `edit-animation-v2` | 80 / 80 | 80 | 64 | key kept 0.976–0.999, ≤ 1.3 % outside (17 calls, S2); 3-view dress 0.99–1.00 (S4); anchor palette distance 8.6–10 | 10/15/25 gens; 1.5–3 min |
| `edit-images-v2` per frame | 80 / 80 | 80 | 64 | 32/32 frames shifted, key kept 0.53–0.67, ghost outlines (S4). **Shift never corrected:** with a green body, re-registration is a free local fix | 10–25; 1–1.5 min |
| `edit-images-v2` one sheet image (512 Tier 2 / 256 Tier 1) | 170 / 170 (Tier 1: 85) | 170 (3×3); Tier 1: 85 | **128** (4×4); Tier 1: 64 | **never tested** | 10–25 (by canvas); ~1–1.5 min |
| `transfer-outfit-v2` (reference = dressed Default view) | – | 80 (cap 8) | 64 | sword area CV 0.27–0.39 vs 0.04 anchored edit; key kept 0.912 once (S2 X4); round 2: tie | 10/15/25; 1.3–3 min |
| `inpaint-v3` sheet (512 Tier 2 / 256 Tier 1) | 170 / 170 (85) | 170 (85) | 128 (64) | cleanest pixels: key kept ≥ 0.99, outside ≤ 0.003; design flickers per cell; owner: weaker at drawing new equipment | 10/15/25; 1–2 min |

Unknown and assumed by no one: whether `edit-animation-v2`, `edit-images-v2` and state share a model. Only tests can say.

### 9.4 Requests to PixelLab (to send after the owner approves)

1. An endpoint to **replace a character's rotation images** (and canvas) without creating a new character.
2. `create-character-state` **from images** (or a `rotation_images` override), so no extra green character lands in
   the library.
3. Animation **keypoints in REST** (`AnimationDirection`), or confirmation that the ZIP has them for skeleton-v3/v3.
4. A **padding / canvas** option on `create-character-v3`.

### 9.5 The core trade-off and the approaches

Every frame of every move must be **drawn by PixelLab on that exact frame's body**, and the item must look the same in
every direction and move. Today's route gets the design right everywhere but redraws the body (1–3 px drift, rigid
skeleton motion). Editing the real frames gets the motion right, but every separate call can redraw the design.

| | **1. Dress once, pose** (today, upgraded) | **2. Default master + edit each move** (recommended) | **3. Big sheets** (2, with many directions per call) |
|---|---|---|---|
| Default item | state, all views, 1 call | state, all views, 1 call | state, all views, 1 call |
| Moves | `animate-with-skeleton-v3` on the dressed view with the body's keypoints | per move-direction: edit the body's **real** frames, with the dressed Default view as an anchor cell (tool picked by the bake-off) | per move: one `edit-images-v2` sheet with **several directions'** frames + anchors |
| Aligned to the body | ~0.98 IoU, 1–3 px drift at hands/feet | exact by construction (edit of our frames; shifts are corrected locally) | same as 2 |
| Item follows the motion | yes, but stiff (skeleton-v3) | yes, drawn on the real pose, from any animation model | same as 2 |
| Same design everywhere | **strongest** (one design, then posed) | anchor in every call; drift between calls possible (measured 8.6–10 palette distance) | **best for moves**: one call spans directions |
| Needs skeleton / estimates | yes | **no** (moves can come from any model; skeleton can be dropped later) | no |
| Max size | 256 | edit-animation 80; sheet 128–170 on Tier 2, 64–85 on Tier 1 | 64–80 (36–64 cells per sheet), Tier 2 |
| Item cost, default (5 dirs, idle + walk) | ~25–40 gens | ~60–110 gens | ~50–75 gens |
| Wall time per move | 3–5 min (pose) | 1–3 min (edit) | 1–2 min |
| Biggest risk | stiff motion, weapon grips | design drift between directions | untested model behavior on many-cell sheets |

**Recommendation (round 3, superseded by §10):** approach 2, with approach 1 as the route above the size the edit tools
allow. **Before the owner chooses, run a bake-off (~150 gens):** one body, S+E walk, sword + cape + hair; approaches 1,
2 (with edit-animation-v2, edit-images-v2 sheet and transfer-outfit-v2 as candidate tools) and 3. Judge the images
without route labels.

## 10. Round 4: the "PixelLab bottleneck"

The owner's framing, from a chat with the PixelLab owner:

- (A) Today's system "paperdolls the standing 8-dir frames, then places the equipment dynamically by skeleton joints".
  Pro: consistent. Con: rigid, doesn't rotate or bend.
- (B) Edit each direction's frames. Pro: motion. Con: each direction becomes a different item.
- Reference images and transfer-outfit don't solve it and have frame limits.

Four subagents researched, measured and red-teamed this. 0 generations were spent.

### 10.1 What today's route actually does (measured)

The description of (A) is not what the code does. The item is **dressed** once on the standing views. Then, for every
move-direction, **PixelLab redraws body + item on every frame** (`animate-with-skeleton-v3`, using the base move's own
keypoints). Our code never places a sprite at a joint. It only:

- re-registers ±1 px;
- fills grip gaps of 2 px or less;
- on near-rest frames that lost a held item, pastes the dressed view shifted by the wrist delta (`repairDropped`).

Offline measurement of the stored spike frames (commit 1f95029). For each frame, the dressed standing view was fitted
rigidly (translation, then translation + rotation) onto the posed item. IoU 1.0 would mean a moved copy.

| Item (route A) | Walk S / E / N | Slash S / E / N | Reading |
|---|---|---|---|
| Sword (96 px) | 0.86 / 0.60 / 0.72 | 0.47 / 0.65 / 0.39 (rotation fit 0.75–0.78) | **Redrawn.** The blade turns 82–89° through a slash; 13–17 % stays unexplained even with rotation (foreshortening, smears). |
| Cape | 0.74 / 0.51 / 0.81 | 0.68 / 0.68 / 0.89 | **Billows** in walk E. Vanishes on north slash (known). |
| Chest | 0.97 / 0.72 / 0.90 | 0.91 / 0.53 / 0.94 | Deforms with the torso. |
| Helmet | 0.94 / 0.99 / 0.98 | 0.89 / 0.91 / 0.99 | Moved copy: correct, a head is rigid. |
| Hair | 0.97 / 1.00 / 1.00 | 0.96 / 0.92 / 1.00 | **Moved copy** in 37/48 frames: PixelLab draws hair rigidly with the head. |

Contact sheets and GIFs (local, not committed):
`…\scratchpad\rigidity\out\sheet_sword96_slash.png`, `sheet_cape_walk.png`, `sheet_hair_walk.png`,
`fixture_sword_crosspunch.png`, `*.gif`.

**The rigid sword the owner sees is the demo fixture, and it was made by route (B).** `app/public/fixtures/s2/` (the
shipped demo) is from S2. Its provenance: `edit-animation-v2` anchor edits of the *real* template frames, plus
`transfer-outfit-v2`. Its sword keeps a fixed angle (walk S 135–137°, cross-punch 42–44°) while the body punches. S2 X4
already recorded that the anchor edit "keeps the sword rigid". S4 Q3e found the real-frame edit made the east slash blade
"thin and faint", while posing "swings with the arm". **Editing the real frames is the measured cause of rigid weapons;
posing is what makes them swing.**

### 10.2 Why route A still looks stiff (and what is fixable)

| Cause | Ref | Fixable inside A? |
|---|---|---|
| Authored idle moves the upper body by only 0–1 px, so everything on it is still | `rig/poses.ts:68` | **Yes:** author a 6–8-frame idle with 2–3 px chest rise and arm sway. Same 3 gens/call. Needs re-rendering the body idle. |
| Idle item frames are posed with the "walking" caption (packed idle+walk call) | `items.ts:137` | **Yes:** neutral caption (0 gens) or a separate idle call (+3 gens/direction). |
| `repairDropped` can paste a static weapon on every idle frame (idle is ≤ 1 px from rest) | `items.ts:526-530` | **Yes:** a real idle stops it triggering; re-roll first, keep the paste only as a flagged last resort. |
| Loose hair strands are deleted (parts under 15 % of the largest) | `items.ts:568-579` | **Yes:** keep parts within 2 px of the main shape for hair (offline check first). |
| Hair has no joints; PixelLab carries it with the head | OpenAPI | **Maybe:** a "hair sways with each step" caption. Untested. |
| Posed body sits 1–3 px off the real body at hands and feet | S3, B4 | No (inherent to re-rendering). |
| skeleton-v3 motion itself is small (joints move 2–4 px per clip at 48 px) | S3 | No; it is animation quality, and (B) inherits it because (B) edits the same body frames. |

### 10.3 The hard limits (documented)

1. **No endpoint returns item layers.** Every edit returns a dressed body; we key out the body.
2. **No endpoint edits a whole character** (all directions × all moves). The largest single-call unit:
   `create-character-state` (8 standing views, no animations), `edit-animation-v2` (16/9/4 frames by size),
   `transfer-outfit-v2` (15/8/3), `inpaint-v3` / `edit-images-v2` (one image, ≤ 512 on Tier 2, ≤ 256 on Tier 1; the
   inpaint tool page says "Maximum size: 256x256", but round 5 found that line describes the editor plugin, not the model, so 512 sheets are not known to be resampled).
3. **So any route that edits real frames needs one call per move-direction (or per few), and every separate call can
   redraw the design.** Measured palette distance: 8.6–10 with an anchor cell, 29–34 for transfer-outfit with a
   reference. Long hair on the anchor route: 22.1 after 2 re-rolls (M3). The posing route measured 0.4–1.3.
4. **Posing re-renders the body**, so items sit within ~1–3 px (IoU ~0.98), not pixel-exact.
5. **Generation is not deterministic** (same request + seed: 6–10 % different px). Seeds are not a lock.
6. **`target_palette`** snaps every px of every frame, key included. It cannot fix shape drift, and it risks pinholes in
   the key. S1: 26–34 % exact body px.
7. **No REST field returns animation keypoints**, and there is no endpoint to replace a character's images.
8. **Policy:** `edit-images-v2` is banned for layers (it shifts frames). `create-character-state` is **not on the allowed
   list** in AGENTS.md; using it needs the owner's yes.

So the trade-off is real: **one consistent design comes from one render that is then posed; real-frame editing trades
consistency for an exact fit.** But the measurements show posing already delivers per-frame motion for weapons, capes
and armor. The stiff parts are idle, hair and the old demo.

### 10.4 Candidate pipelines and the red-team verdict

| | Pipeline | Verdict |
|---|---|---|
| P1 | **A+**: today's dress + pose, with a real idle, a neutral idle caption, no idle paste, hair strands kept, a "sway" caption | **Survives for every item class.** It fixes most of what is measured. Cost unchanged (~25 worn, ~50 held; ~+10–15 if idle gets its own call). |
| P2 | Pose, then refine on the real frames with an edit or masked inpaint | **Drop.** Edits keep ~75–85 % of pre-placed item px (S2 X2), so it either keeps the misfit or redraws the design, at +10 gens/call. Inpaint has no documented "init from pixels under the mask". |
| P3 | Default master + own-direction-anchor edits of the real frames | **Opt-in only, for capes/long hair, gated on a test.** It is the same `anchor` route already in the code (`run.ts:42-50`), which produced the rigid demo sword and 22.1 hair drift. Edited cells also skip `baseCut` (skin pokes through hoods) and held items lose their oversize canvas. Drop `target_palette` and the 64 px crop (the crop squashed tall items in S2). |
| P4 | One 512 px inpaint sheet for all directions + master reference cells | **Park.** It needs Tier 2, has never been tested above 16 cells, the model may work at 256, and inpaint varies per call (palette distance 4–10). |
| P5 | Change the body animation source (managed pixminimax), then edit items | **Later.** Without keypoints, items can't be posed, so everything falls back to the edit route that produced the rigid sword. It also invents props. |

Mixed routes in one outfit are safe for export (z-order, tuck and the fg/bg split work on composed pixels). The gaps are
`baseCut` and cleanup on edited cells.

### 10.5 Recommendation

1. **Keep "dress once, then pose" for every item.** It is the only measured route that gives one design and per-frame
   motion together. Fix the stiffness at its source (§10.2).
2. **Regenerate the demo fixture** with the current route. The shipped demo is the old edit route and is what looks rigid
   (~230 gens, product work after the decision).
3. **Keep the Default-first creation, streaming and duplicate-call removals** from §4 and §9.1; they are independent of
   this choice.
4. **The Default (standing) item stays on `edit-animation-v2`** (all 5 views in one call ≤ 80 px). Use state above 80 px
   only if the owner allows it (policy) and E3 shows the green body survives.
5. **P3 (real-frame edits) is an opt-in "follow real motion" mode** for capes and long hair, only if E2 below wins blind.

Requests to PixelLab (add to §9.4): multi-direction/multi-move edit calls with one shared design (or a design-reference
lock stronger than an anchor cell); item-only (layer) output; animation keypoints in REST.

### 10.6 Experiments that decide it (~100 gens, one seed, blind side by side)

| # | Test | Gens |
|---|---|---|
| E0 | Offline, on stored frames: how often `repairDropped` fires on idle; strands rescued vs specks by a lower floor; check a neutral caption | 0 |
| E1 | P1 on one stored agent character; long hair, cape, sword; S+E. New 2–3 px idle (body), idle posed on its own with an idle caption, walk with a "sway" caption; control = today's packed call | ~35 |
| E2 | P3 soft items: hair and cape, S+E walk, 80 px, own-direction master anchor + 8 frames (one call each). Pass: master palette distance ≤ 3, same hair length/parting S vs E, a blind win over E1 | ~40 |
| E3 | Tier 2 only: one 512 inpaint sheet. Native pixel scale? Design held across cells? | ~25 |

E0/E0b (keypoints from the first character, ZIP keypoints) and the Default-first work need no item decision.

## 11. Round 5: approach decision (skeleton-first, but feed it real motion)

The owner leaned toward keeping "dress once, then pose", but also called every animation "very rigid, arms going behind
the back, the body not moving, uncanny, robotic", and asked whether the skeleton itself is the hindrance. Four
subagents (animation diagnosis, standing-view dresser, shared equipment, devil's advocate) answered with 0 gens spent.

### 11.1 How an item is made today (hair + idle, exact steps)

1. **Local:** recolor the 5 drawn standing views to a solid green ramp (the chroma body).
2. **`POST /edit-animation-v2`:** all 5 green views in one call, "add only long brown hair …". Output: green body + hair,
   5 views. This works like a "state" of the standing pose.
3. **`POST /animate-with-skeleton-v3`, once per direction:** `first_frame` = that direction's green body + hair;
   `first_frame_keypoints` = the rest pose; `keypoints` = the same idle (and walk) poses the bare body's idle was
   rendered from. Output: green body + hair in every pose.
4. **Local:** key out the green, drop specks, re-register ±1 px, QA. The hair layer is drawn over the base's **own** idle
   frames.

**Why 1–3 px:** the base idle and the hair idle are two separate skeleton-v3 renders of the same poses, and two renders
agree to about ±1–3 px at the hands and feet. **The item is not drawn on the base's frames.** The base and the items are
siblings rendered from one pose list.

**Skeleton-v3 is used for every item** (hair, chest, cape, weapons). "Stiff" means the **body motion**; items inherit
exactly that motion. Hair is stiffer still, because it has no joints.

### 11.2 The cause of the robotic look (measured): our authored keypoints, not the renderer

Largest joint movement from rest, in px at 64 (requested keypoints, S3 request files):

| Clip | Wrists | Shoulders | Hips | Knees | Ankles |
|---|---|---|---|---|---|
| Our authored slash S / N | 27.8 / 27.5 | 1.0 | **0.0** | **0.0** | **0.0** |
| Our authored cast S | 27.2 | 1.0 | 0.0 | 0.0 | 0.0 |
| Our authored hurt S / E | 12.0 / 13.6 | 3.5 / 5.4 | 0.0 | 0.0 | 0.0 |
| PixelLab template cross-punch S | 14.6 | 6.2 | 4.0 | 4.1 | 3.7 |
| PixelLab template walk E | 6.3 | 4.4 | 4.2 | 5.4 | 8.2 |

- **Our authored moves (idle, slash, cast, hurt, death) move only the arms.** Hips, knees and ankles move exactly 0 px,
  and there is no torso twist (shoulder width and angle change 0.0). Wrists move about 28× more than the torso; in
  PixelLab's punch it is about 2.4×. Idle moves the upper body 0–1 px (`rig/poses.ts:43-68`).
- **Skeleton-v3 reproduces what it is given:** a raw re-render of the template walk and punch matched their motion
  (legs change 0.33/0.67 and 0.41, vs 0.30/0.67 and 0.29 managed). **The stiffness is the motion source.** Walk, the
  only move taken from PixelLab's own motion, is the least robotic.
- **"Arms behind the back":**
  - We send x/y only (`toApi`, `poses.ts:15-17`). The API also takes `z_index` (integer draw order) and `depth`
    (0–255, "higher is nearer"); without them, depth is taken from the standing pose in every frame. Neither has ever
    been tested.
  - Our authored side poses also put the east wrist 2–3.7 px behind the hips at rest, and 11.3 px behind on the slash
    wind-up. `visible-side-v1` fixes only slash E.
  - Hurt's `lean` rotates in the screen plane, so a "recoil back" seen from the front tilts sideways.
- **What skeleton-v3 cannot do:** no spine joint (the torso only leans rigidly), no hand/weapon/hair/cloth joints, one
  depth scalar per joint, 3–15 frames, motion stays inside the cell, ~±1 px pose adherence.
- **PixelLab's managed template library** (live MCP docs) includes breathing-idle, fight-stance-idle-8-frames,
  cross-punch, lead-jab, fireball, taking-punch, falling-back-death, throw-object, running-4/6/8, jumping, kicks, and
  more. **There is no sword-slash template.**

### 11.3 Approaches, practical pros and cons

| | Approach | What the user sees | Cost (item, default) | Max size | Same item in every direction | Shares equipment |
|---|---|---|---|---|---|---|
| **1** | **Skeleton-first, with real motion** (dress once, pose every move; moves come from PixelLab templates or text animations, retargeted, instead of our arm-only tables; plus depth) | Natural body motion, items move with it; hair still follows the head as one piece | ~25 worn / ~50 held | 256 | **Yes** (palette distance 0.4–1.3) | Exact per body type; refit per body shape |
| 2 | Natural animation, items edited onto the real frames | Best body motion, but each direction's item can differ; weapons edited this way came out rigid (the old demo) | ~60–110 | 80 | No (8.6–10; hair 22.1) | No: every character is re-edited |
| 3 | Standard body types (option on top of 1) | Characters share a body shape; only colors, hair and items vary | 0 for a character's body; items once per body type | 256 | Yes | **Free and exact** |
| 4 | User in the loop (on top of 1) | Joint editor (drag a wrist, set in front/behind, re-pose for 3 gens); integer nudge per direction/frame; pick-best-of-N for text motion | +3 gens per re-pose | – | – | Nudge works for rigid items only (helmet, hair) |

Rejected or parked: re-editing posed items on the real frames (it keeps the misfit or redraws the design); the
512 px all-direction sheet (Tier 2, untested); `edit-images-v2` (it lost the key on a 3-view one-call dress:
0.01–1.00 key kept).

### 11.4 Recommendation

1. **Approach 1.** The skeleton stays as the alignment contract for every item. Replace the motion we feed it:
   - **idle, hurt, cast, death:** PixelLab templates (fight-stance-idle or breathing-idle, taking-punch, fireball,
     falling-back-death), retargeted as **per-frame changes from the template's own frame 0** onto our rest pose. That
     removes the B7 hunch. Same route as walk: managed render → estimate → raw re-render.
   - **slash and other weapon moves (no template):** a pixminimax "unarmed overhead chop" as the motion source, keeping
     the facing gate; or rewritten authored tables with hip shift, knee bend, a step, twist and anticipation.
   - **depth:** pass integer `z_index` and per-joint `depth` for wrists and elbows that cross the torso (2-gen spike
     first).
   - **idle:** at least 6–8 frames with 2–3 px chest rise, arm sway and a hip shift. This also stops the static weapon
     paste.
2. **Standing-view dresser:**
   - ≤ 80 px: `edit-animation-v2` (measured, one call).
   - 81–256 px: `create-character-state` if it wins a test **and** the owner allows it (policy). Caveat: its price
     bands (≤ 84/112/168 px) suggest a 3×3 grid, so 8 views above 168 px may not fit one render. Test 4 vs 8 directions
     there.
   - `edit-images-v2`: only if re-registering the stored one-call dress (free) brings the key back to ≥ 0.97.
3. **Shared equipment:** offer body types (approach 3) for exact, free sharing. Across body shapes, refit once per design
   and body type (re-dress + re-pose, ~25 gens), with review. Auto-align and manual integer nudges are cleanup for rigid
   items, not a way to fit different bodies.
4. Keep everything else from §4 (Default-first creation, streaming, fewer duplicate calls).

### 11.5 Experiments (~100 gens, S+E only, blind side by side)

| # | Test | Gens |
|---|---|---|
| X0 | Free: re-register the stored `dress_eiv2_*` frames (±4 px) and recompute key kept; translate a stored helmet across two bodies by the head-anchor delta and compare with its paid fit | 0 |
| X1 | Depth spike: slash S frames 3–5 and cast S thrust, with and without wrist/elbow `depth` ≈ 170 and `z_index` | ~4 |
| X2 | Motion: template idle, taking-punch and fireball (change-retargeted), a pixminimax chop, and one CC0 mocap slash projected to keypoints with depth (§12.3), vs our authored idle, hurt, cast and slash | ~50 |
| X3 | Dresser: one cape on a stored 80 px body, `create-character-state` (imported green, palette snap off) vs `edit-animation-v2` | ~21 |
| X4 | Hair, cape and sword posed on the winning X2 moves | ~25 |

## 12. Round 6: a friend's comparison, "PixelLab route vs Godot + free assets" (2026-10-26)

The source is a 3-page PDF from Lexingel's project. Their earlier material was reviewed in
[lexingel-paperdoll-findings-round5](lexingel-paperdoll-findings-round5-2026-10-25.md). This one compares the PixelLab
route they ran with a Godot route. The Godot route renders CC0 Quaternius 3D parts on one 65-joint skeleton, then
downsizes the renders to pixel art. Their recommendation is a hybrid: Godot for the body, armor, weapons and every
animation; PixelLab only for faces, special items, VFX and portraits.

### 12.1 Their PixelLab route is not ours

| Their step | What failed for them | Our route |
|---|---|---|
| `create_character_state` per item, then a **pixel diff** against the base | The state redraws the whole body, so every layer needed clipping and drift repair, and was ragged | We dress a **green** body and key it out. A diff on redrawn skin is what we rejected in S1/S2 (11–38 pinholes, skin slivers). |
| Walk: skeleton-v3 walk on the base **and a separate one** on the dressed state, then a diff | "Not a diff pair": 2 of 8 frames passed | We pose the dressed body with the **same keypoints** the base was rendered from (raw `animate-with-skeleton-v3`), so items line up at IoU ~0.98. This is the problem our route was built to solve. |
| Attacks: Pro Flash key poses + `animate_image` in-betweens; arm and hand chosen by the model | Hand switches, a second sword, white blobs, overhead sweeps; ~150 gens and NW unresolved | Our attack keypoints are authored, so the hand is fixed. The cost is the robotic motion (§11.2). |
| Dress a finished clip per frame with the dressed still as reference | 48 gens per dressed slash | 3 gens per item-direction pose. |

So most of their PixelLab failures come from steps we don't use. Their numbers do not apply to our route.

### 12.2 What they found that applies to us

- **Only `create-character-state` kept all 8 directions consistent; cheap per-direction edits did not.** This supports
  state (or any one-call dresser) for the standing views (§11.4.2).
- **Size changes the style.** Their 256 and 128 px bases came out as realistic adults, and shrinking to 64 lost the face.
  So the dynamic size up to 256 px is a different look, not just a sharper one. The UI should say so.
- **Hidden pixels don't exist.** A layer can't contain what is behind the body (far arm, hair behind the head). This is
  true for us too: layers are pre-occluded against their own body. Swapping layer order can't reveal hidden parts, and
  PixelLab has no fix for it. The 3D route is the only one with true hidden parts.
- **Handedness:** the model picks the arm in front, and mirroring flips the hand. That matches our known issues;
  authored keypoints and per-character mirroring are our controls.
- **East/west and diagonals merge the far hand into the hip.** Same weakness as ours; it sets a floor on grip quality in
  side views.
- **Loops hop:** generated settle frames stood 2–3 px taller than the ready pose.

### 12.3 The new idea it gives us: 3D animation as the skeleton's motion source

The Godot route's strength is **motion data**: a shared 3D skeleton, natural animations, true depth, and any weapon bound
to the hand bone. Its weakness is **art style**: a blocky 3D-render look and 2–3 % wrong-layer pixels.
`animate-with-skeleton-v3` takes exactly what that motion data provides: 18 joints per frame with x, y, `depth`
(0–255) and `z_index`. §11.2 measured that skeleton-v3 reproduces the motion it is given.

**Proposal:**

1. Take CC0 humanoid animations (e.g. Quaternius' libraries; check each pack's license and whether it has sword moves).
2. Offline, project each animation's joints for our 8 directions in the "low top-down" camera.
3. Map them to PixelLab's 18 labels; nose, eyes and ears are head-bone offsets.
4. Retarget them as per-frame changes onto each character's rest pose, as in §11.4.1.
5. Ship the result as static JSON keypoint tables (client-only, 0 generations).

The body and every item are then rendered by PixelLab as today: PixelLab art style, mocap motion, real depth, and slash,
cast and other moves that PixelLab templates lack.

- **Pros:**
  - Natural motion with hips, knees, torso and depth.
  - No managed render or estimate calls (the body move is one 3-gen pose call per direction).
  - The same motion for every character, which helps shared equipment.
  - It fits the "every pixel from PixelLab" rule, because only motion data is borrowed.
- **Cons and unknowns:**
  - Skeleton-v3's own limits remain: no spine bend, no hair or cloth joints, ~±1 px pose adherence.
  - Whether `depth` is honored is untested (X1).
  - Retargeting must handle different proportions (chibi vs adult).
  - Asset licensing must be checked per pack.
  - It is a one-time tooling job.

## 13. Round 7: experiment results (X0–X4, 2026-10-26)

**Spend:** 94.1 generations, confirmed by the free balance check (4,697.8 → 4,603.7). One call was refused by the content
policy and not billed. The runs were single-seed, south and east only, on round 5's fully bare default body (`c27man`:
64 px in an 80 px frame).

**Files:**
- Harness: `spikes/api/x26/` (`lib.mts`, `a_submit.mts`, `b_motion.mts`, `b_items.mts`, `b_mocap2.mts`, `gallery.mts`, `gif.py`,
  `peek.mts`, `zipcheck.mts`).
- Outputs, git-ignored: `spikes/api/out/x26/`, including the ledger and `gallery/index.html`, a blind GIF page served by the
  `x26-gallery` launch config.
- Mocap tool: `spikes/api/mocap/` (committed in round 8, §15). It parses Quaternius UAL1.glb (CC0) and projects it at a
  measured camera elevation and east turn (9.9° / 24.7° on c26man; 8.9° / 20.1° on c27man).

### 13.1 Results

| # | Test | Result |
|---|---|---|
| X0a | Can re-registering rescue the stored `edit-images-v2` 3-view dress? | **Not within ±4 px** (4/18 views pass). **Within ±10 px, 16/18 pass**: the whole figure is shifted 5–10 px, with a different shift per item and view. The designs themselves are good. It stays usable only with a per-view registration search. `edit-animation-v2` needs no shift (17/18 pass). |
| X0b | Share a helmet across two bodies by translation | **No.** IoU vs the paid fit is 0.67–0.80 on S/E/W, and 6–14 px of scalp/cheek stays bare. North works. The gap is shape, not position. |
| E0b | Does the PixelLab ZIP carry animation keypoints? | **No**, despite the docs ("keypoints for all frames"): `metadata.json` has paths only. Report this to PixelLab. |
| X1 | Authored slash S with vs without wrist/elbow `depth` = 185 and `z_index` = 2 | **No visible difference.** The arm already drew in front of the body in both. The depth fields are accepted, but they are not a lever for our authored poses. |
| X2 | Motion sources, slash (S, E), idle (S, E) | **CC0 mocap slash, bone-rotation retarget: by far the most natural.** The whole body leans, twists, steps and counterbalances, versus our arm-only slash. Flaws: some frames distort the anatomy (thin, twisted torso), the model drew small gray prop specks despite "no props", and the east strike reaches the cell edge. The earlier per-joint-delta retarget was worse (crumpled body). **PixelLab text chop (pixminimax), re-rendered:** the south chop is moderate and natural; east turned to a back view (facing drift), so it was not re-rendered. **Idle:** the PixelLab breathing-idle template re-rendered on our skeleton is about as static as our authored idle. Neither solves "idle feels dead"; the mocap `Idle_Loop` also moves ≤ 1.5 px. |
| X3 | Cloak dress: `create-character-state` (imported green body, palette snap off) vs `edit-animation-v2` | **State works on a green body.** Key kept 1.000 and outside 0.000 in S/E/N (ea2: 1.000, ≤ 0.004). One consistent design in all 4 rotations, including a real west view. 10 gens at 80 px, 75 s, plus 0.25 for the green import. Cleanup is equal, and state has no 80 px / 4-frame limit. |
| X4 | Items posed on the new moves | **The cloak billows and trails through the mocap lunge; the sword swings overhead and strikes; one design throughout, S and E.** Gates: cloak E and hair S/E pass. Sword S fails G2 on 2 frames (key kept 0.944–0.955) and G4 on one frame (the blade mostly lost); sword E fails G2 on 2 frames, and the blade is cut at the cell edge in the strike. Cloak S fails G2 on 1 frame (0.967). In production these are re-rolls, so faster motion means more re-rolls. Hair on the template idle is static, because the idle is static. |
| — | Content policy | "long wavy … hair … loose strands" on the bare body was refused (code 5000, not billed); "shoulder-length dark brown hair" passed. Hair prompts on bare bodies need a wording guard. |

### 13.2 What this decides

1. **The stiffness was the motion source, and mocap fixes most of it.** It is the first motion that reads as a body moving,
   not an arm. Items posed on it move with it and keep their design. Keep the dress-once-then-pose route, and feed it
   retargeted CC0 mocap (bone rotation) for actions.
2. **Depth/z_index is not worth plumbing for now** (X1: no effect).
3. **Idle still needs a lively source.** Next candidates: mocap `Idle_Talking_Loop` / `Sword_Idle`, or the
   `fight-stance-idle-8-frames` template, or authored breathing with a 2–3 px chest rise and arm sway.
4. **`create-character-state` is a viable dresser for every size up to 256** (pending a large-size test and the owner's
   policy yes). Below 80 px it ties with `edit-animation-v2`.
5. **The mocap pipeline needs guards:** keep the strike inside the cell (or give held items a larger canvas), and an
   anatomy check on extreme frames. Expect more G2 re-rolls on fast moves.

## 14. Questions for the owner

Owner answers (round 3): Default pose only at creation; walk/idle added by the user; streaming everywhere possible;
mirroring follows the character's own setting; the static hair was on the "off" character (not rechecked yet).
Failed checks: PixelLab jobs return no partial images, but our failed-check items do have complete images. They stay
visible, equippable drafts with a badge; only clean items auto-save.

1. Which approach in §9.5, after the bake-off? (§5 is superseded by the bake-off plus E0/E0b/E2.)
5. Which PixelLab tier will most users have? On Tier 1, the sheet routes stop at 85 px per view, so state becomes the only
   large-size option.
2. Optional review: should items with **failed** checks auto-save too (with a badge), or only clean ones?
3. Default Top-down 8 mirrors west, so a right-hand sword shows in the **left** hand facing west. Keep that, or default to
   independent west views (+3 drawn views, about +60 % item cost)?
4. Static hair: was it in idle, or in walk? A character/item name lets me check the stored frames for free.

Round 9 questions (§16):

6. Adopt the skeleton-free pipeline (§16.6): text-animated moves, items edited onto the real frames, tracked paste for
   hair and helmets, armed-then-split weapon attacks?
7. Natural motion costs about 2–3× more per worn item (≈ 70 vs 25 gens for idle + walk in 3 directions), while the body
   gets ~5–10× cheaper. Accept, or spend ~100 gens first on the untested 512 px inpaint sheets (≈ 6 gens per
   move-direction)?
8. Best-of-N for body moves (1 gen each): pick automatically by the clip checks, or show the user 2–3 takes?
9. Inpaint sheets above 256 px need Tier 2+. Keep edit-animation-v2 as the Tier 1 route?

## 15. Round 8: mocap move library on skeleton-v3, then skeleton-v3 deferred (2026-10-26)

**Owner request:** test the popular mocap moves (idle, walk, attack, hurt, die and more), keep fixing the uncanny attack,
and challenge the 3D-to-2D joint conversion. **Owner decision during the round:** skeleton-v3 is deferred until PixelLab
improves it ("not good enough for production, none of it is natural"); find a route without skeleton. This section
records what the round proved so the decision can be revisited.

**Spend:** 186 generations, 62 calls (`spikes/api/out/x27/ledger.jsonl`), 3 gens per clip of up to 12 frames.
**Files:** `spikes/api/mocap/` (`glb.mts`, `mocap.mts` = first retarget with knobs, `retarget2.mts` = 2D cut-out retarget,
`list.mts`) and `spikes/api/x27/` (`moves.mts` catalog, `render.mts`, `items.mts`, `qa.mts`, `gallery.mts`/`.py`,
`speed.mts`). The GIF page is served by the `x27-gallery` launch config (port 5232). Outputs are git-ignored in
`spikes/api/out/x27/`.

### 15.1 What the clips showed (bare c27man body, S and E, one seed)

| Move (UAL1 clip) | Result |
|---|---|
| Walk (`Walk_Loop`) | **First retarget:** the east stride is natural, but the south walk **lurches**. **Cut-out retarget:** steady, but the south legs barely move. |
| Run (`Jog_Fwd_Loop`) | **Cut-out retarget: the best clip of the round** (east reads as a real run). First retarget: the legs cross and the hips wander. |
| Idle (`Idle_Loop` at ×1 and ×3 gain, `Sword_Idle`, `Idle_Tired_Loop`) | Still near-static. `Idle_Loop` moves ≤ 1.4 px. At ×3 gain it moves 3–4 px and still renders static. `Idle_Tired_Loop` (5–6 px) shows a head bob. `Sword_Idle` is a crouched stance, not an idle. |
| Sword attack (`Sword_Attack`, key-pose timing, 5 variants) | Still uncanny in every variant: the off-arm flails, the body drops into a deep 25 cm squat, and the wind-up becomes a T-pose when the facing is locked. "sword slash" in the action text **draws a sword into the body** (8–9 of 12 east frames). |
| Punch, kick, cast | The punch and the south kick read well. The east kick turns to a back view mid-move. The cast is readable but bland. |
| Hurt (`Hit_Chest`, `Hit_Head`) | Readable, mostly as a head throw. |
| Die (`Death01`) | **East:** a believable fall. **South:** the backward fall is seen end-on (15 px tall, broken frames). Watching the mocap from the side (`az: 90`) fixes this: the body falls across the screen. **The last frame dissolves into scattered pixels in every die clip:** with "dying" or neutral wording, and even when the last 3 frames had identical keypoints. |
| Jump | The arms go out to the sides and read as a T-pose. The mocap does not lift the root (the game moves the sprite). |

### 15.2 Why the conversion looked drunk and floppy (subagent review, measured)

1. **Support-foot root pinning.** The root jumps whenever the support foot switches, because the body's wide drawn
   stance does not match the mocap's narrow gait. The walk's hip center wanders 9.8 px (S) and 12.2 px (E); PixelLab's
   own walk moves 0.7 and 1.1 px.
2. **Reference pose.** `Idle_Loop` at 0 is a staggered stance: feet 0.36 m apart, one 0.27 m back. Every move
   inherited that limp.
3. **Facing from hips + chest.** A jog's ±40° chest twist turned the legs and head ±20° per stride. The head angle
   jumps up to 32° per frame in the run and 46° in the slash.
4. **IK clamp.** Unreachable foot targets straightened the support leg, leaving a 3–7° knee bend: "stiff legs".
5. **World rotation deltas on bones that point differently from the mocap's.** Bone twist became sideways swing.
   Limbs shrank to 0.1–0.2× in the east slash, and the die head swung 73° in one frame.

`retarget2.mts` fixes these with 2D cut-out animation. Each drawn bone keeps its length and turns by the change in the
mocap bone's angle on screen. Foreshortening is softened and clamped to 0.4–1.2×. It also uses:
- a neutral reference pose;
- facing from the hips only;
- a head that rides the neck;
- pelvis travel for the root.

On skeletons, the walk's hip wander fell to 1.0 px, which matches PixelLab's walk.

### 15.3 What it means

- **Even with clean keypoints, skeleton-v3 redraws the body every frame:**
  - proportions shift (head, chest);
  - the last frame of a lying pose dissolves;
  - the model adds props;
  - fast moves come out as flails.

  The conversion fixes made the motion correct, but not natural enough. This supports the owner's decision.
- **Lessons that hold for any route:**
  - Action text must never name a weapon on a body layer. "overhead arm strike, empty hands, no weapon, no props, no
    effects" gave 0 of 12 leaked frames.
  - Hold a pose with frame timing, not repeated frames.
  - Choreograph for the camera: a fall toward or away from the camera is unreadable in south.
  - An idle needs 4+ px of motion to read at 64 px.
- **If skeleton-v3 is revisited:** start from `retarget2.mts` (cut-out) with `Jog_Fwd_Loop`, `Walk_Loop` and `Death01`
  (east). Drop the generic sword clip: it needs authored key poses.

## 16. Round 9: a skeleton-free route (2026-10-26)

**Goal (owner):** skeleton-v3 is deferred, so find a route without it, test it, and document it. The owner's cap for
rounds 8 and 9 together is **1,000 generations**. **Spend:** 937 in total, confirmed by the balance (4,603.7 → 3,666.7):
186 in round 8 and 751 in round 9. The round 9 ledger shows 776, because it also counts one rejected request (400,
not billed) at its 25-gen estimate. The body is the bare default (c27man, 64 px in 80 px, S/E/N drawn), seed 7 unless
noted.

**Files:** `spikes/api/x28/`:
- `body.mts`: text-animated moves.
- `qa.mts` and `motion.py`: clip checks.
- `dress.mts`: four dressing tools on the real frames.
- `paste.mts`: zero-cost head items.
- `disarm.mts`: the armed-attack split.
- `share.mts`: the second body.
- `table.mjs`, `gallery.mts`.

The GIF page is served by the `x28-gallery` launch config (port 5233); the round 8 page uses `x27-gallery` (port 5232).
Outputs are git-ignored in `spikes/api/out/x28/`.

### 16.1 The skeleton-free endpoints and their limits

| Step | Endpoint | Limits (80 px cell) | Cost and time measured |
|---|---|---|---|
| Body move | `/animate-pixminimax` (text, with `direction`, `view`, `subject_description`, `initial_pose`) | 4–40 frames (multiples of 4), ≤ 256 px; frame 0 echoes the input | 1 gen per 8 frames, ~60 s |
| Body move | `/animate-with-text-v3` (text, optional `last_frame`) | 4–16 frames (even); w·h·frames ≤ 524,288 | 1 gen per 8 frames, ~150 s |
| Item on real frames | `/edit-animation-v2` (anchor + frames) | 9 frames at ≤ 80 px (anchor + 8); **4 at 81–256 px** | 10 gens per call, ~90 s |
| Item on real frames | `/transfer-outfit-v2` (anchor as reference) | 8 frames at ≤ 80 px; 3 above | 10 gens, ~90 s |
| Item, sheet | `/inpaint-v3` (one sheet image, item area masked) | ≤ 512 × 512 per side (Tier 2+; 640 px was rejected with a 400) | 25 gens per sheet (16 frames tested), ~2 min |
| Item, sheet | `/edit-images-v2` (one sheet image) | ≤ 512, 1 image per call above 128 px | 25 gens; **rejected** (16.4) |
| Rigid head item | none: tracked paste (local code) | translation only | **0 gens** |

### 16.2 Body moves from text (no skeleton)

| Move | pixminimax | v3 |
|---|---|---|
| Walk | **Best:** natural strides in S, E and N | South drifts into a profile (facing drift); dark leg artifacts |
| Run | Natural; **east is the liveliest clip of all rounds** | Natural, calmer |
| Idle | Subtle (400–600 px change per frame vs 120–300 for skeleton idles); "combat-ready stance" wording is the liveliest | Subtle; one take added floating FX in east |
| Unarmed attack | **Turns the body sideways mid-strike** in every seed and wording (S, E, N) | **Keeps the facing** when it must end on the rest frame (`last_frame`) |
| Hurt | Good recoil in south; a black streak FX in east | South: a big glowing aura FX |
| Die | Readable falls in S, E and N (south falls spread-eagle) | Good south and east; **north turned into a muscle-flex pose** |

**Neither model picks the hand.** Every unarmed south attack (12 takes) raised the same hand, the character's left,
whatever the text said ("right arm", "the hand on the LEFT side of the image"). Since it is 1 gen per clip, best-of-N
with the clip checks (props, facing, area) is affordable.

### 16.3 Weapon attacks: animate armed, then split (the attack fix)

Animating the body **holding the dressed sword** (its keyed-out layer pasted on the rest view) solves the hand problem.
The weapon decides the hand, and both models produced the most natural attacks of the study. Each has a wind-up, a
diagonal or overhead strike, and a recovery; pixminimax adds a swoosh trail. The split:

1. `edit-animation-v2` with [bare rest view + 8 armed frames] and "remove the sword … the hand stays a closed empty fist"
   (10 gens). The result is clean bare frames in the same gripping pose, with 0–3 non-body-colored px per frame.
2. The weapon layer is the set of armed px that changed **and** are either non-body-colored or match the sword's own
   palette within 3 px of the blade (that catches the gold hilt).
3. Bare + weapon recomposes into the armed animation (gallery "Weapon attack"). A few specks by the fist need the usual
   small-component cleanup.

The inpaint-v3 alternative (mask = non-body-colored px) leaves the hilt in the body, because hilt colors sit within
skin tolerance. Rejected.

Other held weapons (axe, spear, bow) can be dressed onto the bare attack frames, or animated armed per weapon class.
**Untested.**

### 16.4 Items dressed onto the real frames (cloak, hair, sword × walk, attack × S, E)

Means over the 4–5 clips per row. "Kept" = body key left as key (low when the item legitimately covers the body, as
the cloak does in north); "outside" = key px outside the body; "pal" = mean color distance to the anchor's item colors.

| Tool | Cloak kept / outside / pal | Hair | Sword | Verdict |
|---|---|---|---|---|
| `edit-animation-v2` + anchor | 0.93 / 0.08 / 8.0 | 0.79 / 0.27 / 6.1 | 0.92 / 0.10 / 9.6 | **Use for worn items** (cloak sways with the stride, keeps its design); 10 gens / 8 frames |
| `transfer-outfit-v2` | 0.96 / 0.07 / 10.0 | 0.77 / 0.27 / 5.2 | 0.91 / 0.09 / 8.4 | Ties with edit-animation-v2 |
| `inpaint-v3` sheet (S+E, one call) | 0.90 / 0.26 / **2.5** | 0.80 / 0.25 / 5.1 | 0.87 / 0.12 / 10.1 | **Most consistent design across directions**; one sword frame lost (attack S); 25 gens / 16 frames |
| `edit-images-v2` sheet | 0.23 / 0.83 / 6.9 | 0.51 / 0.50 / 6.8 | 0.28 / 0.75 / 9.0 | **Rejected:** redraws and moves the bodies (registration hit the ±12 px search limit) |
| Tracked paste (hair) | – | face kept, design identical | – | **Use for hair and helmets:** 0 gens; an occlusion rule keeps a crossing arm in front |

**Findings:**
- **Every AI editor paints over part of the face for hair** (key kept ≈ 0.79). The paste avoids that.
- **Dressing a sword onto an unarmed attack fails:** the body attacks with the wrong hand, so edit-animation-v2 adds
  a second sword and transfer-outfit leaves it at the hip. Hence 16.3.
- **North works:** the cloak on the pixminimax north walk folds and sways.
- **80 px cell limit for held items:** a raised blade reaches the cell edge. Bigger cells cut edit-animation-v2 to 4
  frames per call.

### 16.5 Shared equipment without skeleton (a second body)

A single `edit-animation-v2` call (10 gens) did it. The frames were [man's dressed S, E, N | woman's green S, E, N],
with "dress each in exactly the same design as the reference frame of the same facing". It dressed `c27woman` in the
same hooded red cloak and the same longsword:
- palette distance to the man's design: 6.6–8.2 (cloak) and 9.9–10.0 (sword);
- areas within 2–14 %.

Her own pixminimax walk (S, E, N) was then dressed with her anchors, like his (pal 10.8–18.2 vs his anchor). The design
reads as the same item on both bodies (gallery "Shared equipment"). This is a **refit per character, not pixel-exact
sharing**: each new character costs one anchor call per item plus its moves.

### 16.6 The recommended skeleton-free pipeline

1. **Character:** `create-character-v3` as today (rotations). Moves are **text-animated per direction:**
   - pixminimax for walk, run, idle and die;
   - v3 with `last_frame` for attacks;
   - 1 gen each, best-of-N with the clip checks.

   **The default character (idle + walk, 3 drawn directions) drops from 57 gens / 117 POSTs to about 6–12 gens and
   6–12 calls.** There are no skeleton or estimate calls.
2. **Weapon attacks:** animate armed with a class placeholder (16.3), split with one `edit-animation-v2` call per
   direction (+10 gens).
3. **Item design:** one dressed anchor per item and character (`edit-animation-v2` with references, or
   `create-character-state`), 10 gens. Sharing across characters = use another character's anchor as the reference.
4. **Item frames:**
   - Worn items (clothing, capes): `edit-animation-v2` + anchor on each move-direction, 10 gens per 8 frames; or an
     inpaint-v3 sheet when cross-direction consistency matters most.
   - Hair and helmets: tracked paste, 0 gens.
   - Weapons: the armed split.
5. **Equip while loading:** every step is one job per move-direction, so items stream in per direction exactly as today.

**Cost compared with today** (default: idle + walk, 3 drawn directions):

| Item | Today | Skeleton-free |
|---|---|---|
| Worn item | 25 gens | ≈ 10 + 6 × 10 = **70 gens** (≈ 45 with sheets, untested at that size) |
| Hair / helmet | 25 gens | **10** (anchor only) |
| Weapon | 50 gens | idle/walk via edit-animation-v2 ≈ 70; each attack +10 per direction |

**Natural motion costs about 2–3× more per worn item.** The body becomes ~5–10× cheaper and much faster: no 12–19 min
skeleton chain.

### 16.7 Not tested (budget), next if wanted

- 512 px inpaint sheets with 4+ move-directions per call: about 6 gens per move-direction, and the cross-direction
  consistency seen in 16.4.
- Sizes above 80 px:
  - edit-animation-v2 drops to 4 frames per call at 25 gens;
  - held items need a bigger cell;
  - a 128 px body probably needs inpaint sheets.
- Other weapon classes on bare attack frames.
- A best-of-N selector run end-to-end.
- Diagonal views: this body has only S, E and N drawn.
- Idle liveliness: text idles move more than skeleton idles, but still subtly.
- `create-character-state` as the anchor dresser for every view in one call (X3 showed it works on a green import).

## 17. Round 10: implementation (2026-10-26, branch `claude/generation-pipeline-overhaul`)

**Owner scope:** do not change the `animate-with-skeleton-v3` system yet. The core animation workflow stays exactly as is:
- the draw;
- the re-import and `GET /characters/{id}` rest keypoints;
- authored idle;
- managed walk → estimates → raw render;
- dress once → pose per direction.

Improve everything around it. Code maps (three read-only explorers) showed:
- **The estimates are not QA-only.** Rendered-frame estimates feed item cuts and bands, held-item grid masks and anchors,
  so they stay.
- **Default-first creation is mostly existing plumbing:**
  - the `imported-rest` single-cell clip;
  - "Add a move" already runs the creation building blocks for idle and walk (`addMove` → `addBodyClip`);
  - item posing already skips single-cell clips.

  So a Default-only character makes **zero** animation and estimate calls at creation.

| Work package | What | Files (main) |
|---|---|---|
| **A. Default-first creation** | Creation = draw + normalize + re-import + rest keypoints → a `default` move (one standing frame per direction, `imported-rest` style) → publish. The rotations show in the creator as soon as the draw lands. "Add idle + walk" is one tap (creator result and Moves), with moves queued and run one at a time through the existing `addMove`. Plans and estimates are updated. Size presets and notes: show what changes above 80/128 px. | `studio/create.ts`, `CreateSheet.svelte`, `MoveSheet.svelte`, `Moves.svelte`, `state.svelte.ts` (moves), `apiPlans.ts`, `characterConfig.ts`, `CharacterForm.svelte` |
| **B. Item streaming, equip while loading, optional review** | Pose a direction as soon as its dressed keyframe passes. Re-evaluate and publish the preview after every landed call (same request bodies, so ledger reuse is unchanged). A worn draft renders its landed cells, with per-(item, direction) loading markers in Preview / Top-down / Side-scroller. A slot may hold a draft id, which is never persisted or exported and is cleared on discard. Clean items auto-save; warned or failed items stay as drafts with a badge, and Review / Try again / Keep stay available at any time (changes D7). | `lib/items/run.ts`, `items.ts` (preview coverage), `state.svelte.ts` (gens, wear, accept), `GenCard.svelte`, `PhonePanel.svelte`, `experience/presentation.ts`, `WorldStage.svelte` |
| **C. Pipeline bugs** | (1) Tier 1 never queues a Tier 2 inpaint grid (skip the fallback instead of waiting forever). (2) `repairDropped` pastes become a visible review warning. (3) Missing cells are reported as loading/missing, not authored transparency. Prompt wording (the idle "walking" caption) is **not** changed: D19 rejected unmeasured rewordings, and it would invalidate ledger reuse. | `run.ts`, `items.ts`, `plans.ts`/`queue.ts` |
| **D. Docs** | `architecture.md` (14 stale places), user guide, PLAN decision (D7 → optional review, Default-first), known issues. | docs |

Tests per package: unit and selftests, `npm run check`, and the e2e specs that cover the change. The full e2e suite runs
after integration (studio state, queue and shared components are touched). A live check follows: one small character
(Top-down 4, mirrored west) plus one item, ≤ 100 gens.
