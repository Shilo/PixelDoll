# B16: Held items on 8-direction rigs (chunked dress) + Ranger cape hurt N regrid

Date: 2026-10-21. Builder: B16. Dev servers `app-dev-b15` (:5177, 8-direction rig) and `app-dev-b9` (:5175, Ranger).
Not committed.

**Spend: 63 gens** (cap 70). The balance went 591.96 → 528.96 = exactly 63.

| What | Gens |
|---|---|
| Steel sword on the 8-direction rig: 2 dress chunks (10 + 10) + 10 pose calls (idle 5 × 3, walk 5 × 3) | 50 |
| One automatic re-roll: walk SE, `G5 area CV 0.16 > 0.15` (passed on the re-roll) | 3 |
| Ranger red cape `regridClip(hurt, north)` (inpaint-v3 grid, seed 4243) | 10 |

## Summary

| Task | Result |
|---|---|
| Split the held-item dress into calls that respect the frame cap | Done, and it works for any call with a frame cap. `editFrameCap(px)` = 16 / 9 / 4 for ≤ 64 / 65–80 / 81–256 px. `planItem` chunks the dress with `anchorChunks`. A later chunk gets the first chunk's dressed cell 0 as an anchor frame, and that frame's output is thrown away. 8-direction held = **4 + (1 anchor + 1)** frames at 96 px. |
| Correct cost in the New item sheet | "12 PixelLab calls · 65 frames … **Make · 50 gens**" (it was 40 for a call PixelLab would refuse). ![](https://github.com/Shilo/PixelDoll/raw/1f950291f90d43f5c6f27572445664f757f5716e/docs/testing/img/b16_new_item_sword8_cost.jpg) |
| Fake-API self-test | `items/run` self-test (node). It checks that each dress call sends no more than `editFrameCap(image_size)` frames and at least 2, that all 5 directions come back with their own keyframe (the anchor output is dropped), the cost of 50, and that re-rolling chunk 2 redoes only the north poses. Mutation check: with the old single dress call, all 4 asserts fail. |
| Live: sword on rig-08110217d1a0, idle + walk × 8 directions | **Clean** on the first pass (1 automatic pose re-roll). Grip R 51 / L 0 / amb 9 / none 0, 0 border px, 0 shifted frames, key outside ≤ 0.012, palette distance to the design ≤ 6.6. Layers are 96×96, pivot (48, 75) = rig pivot (32, 59) + 16. |
| Godot 4.7.1 | Import 0 errors (1 stale `.uid` cache warning from re-exporting into the same folder). Sync **1,440 ticks, 2,880 oversize layer-ticks, 0 failures** ([log](b8_engine_tests/b16_eight_sword_sync.log)). Render **0 of 1,769,472 px** differ ([log](b8_engine_tests/b16_eight_sword_render.log)). |
| Ranger cape hurt N (B14 open item) | Saved. Frames 1–3 no longer balloon: area 832 / 795 / 773 → 653 / 668 / 657 (the keyframe is 656). |
| check / build / selftest / e2e | `npm run check` 0 errors / 0 warnings (220 files). Build ok (336.8 kB JS). Selftest all passed. `node app/scripts/e2e-studio.mjs` (:5173) all passed. |

## 1. Chunked dress (code)

**`routes.ts`**

- `editFrameCap(px)`: the OpenAPI limits for edit-animation-v2. Frames are packed into one grid, so the cap is 16, 9 or 4
  depending on the size. Self-test included.

**`items.ts`**

- `planItem(rig, spec & { slot? })`. The cap comes from the call's canvas: rig cell + 2 × `padOf(slot, method)`. Held items
  are at 96, so the cap is 4.
- `anchorChunks(cells, cap)`: the first chunk takes `cap` cells; each later chunk takes `cap − 1` cells plus the anchor.
- `anchored(k, kind)`: an edit or dress call after call 1 leads with the anchor cell.
- `planCalls` (anchor route) also uses `editFrameCap(rig cell)` instead of the fixed `maxFrames: 16`, which is removed.

**`run.ts`**

- `submit`: dress chunks reuse the existing anchor path. Frame 1 is call 1's dressed cell 0 (the south keyframe), and the
  prompt says "Frame 1 already wears …: copy exactly that design".
- `dressedOf(calls)`: the dressed keyframe per rest cell over every dress chunk. Pose submit, grid refs and `acceptItem`
  (`item.dressed`) use it instead of `calls[0]`.
- `evaluateItem` drops the anchor output for dress chunks too (`cellOuts`). Without that, the N keyframe would have been
  read from the anchor's output.
- `runItem` runs call 1 first, then the other dress chunks (they need call 1's output), then gates **every** dress chunk,
  then the poses.
- `rerollCall` on a later dress chunk drops only the pose and grid calls of that chunk's directions. Call 1 still drops
  everything.
- `keepBestRoll` skips every dress chunk, not just call 1.
- Add a move (`poseItemClip`) needs no change: it poses `item.dressed`.

**Docs:** architecture §4.1 gets a "Dress frame cap [B16]" bullet.

## 2. Live verification: steel sword, 8-direction rig

The sword was made through the Studio: Hands → New item → "steel sword" → Make (50 gens shown).

**Dress chunks** ([sheet](https://github.com/Shilo/PixelDoll/blob/1f950291f90d43f5c6f27572445664f757f5716e/docs/testing/img/b16_dress_chunks.png): top row = inputs, bottom row = outputs. Call 1 = S, SE, E, NE.
Call 2 = anchor (call 1's dressed S) + N.)

![](https://github.com/Shilo/PixelDoll/raw/1f950291f90d43f5c6f27572445664f757f5716e/docs/testing/img/b16_dress_chunks.png)

- Call 1 sent 4 frames at 96 px and call 2 sent 2. Both passed the dress gates on the first roll (G2, G3, presence, D1).
- **Consistent across chunks:** the N keyframe from chunk 2 has the same gray blade, dark crossguard and hilt as the chunk 1
  views. The sword points down and slightly outward in the right hand in all 5 views, and the arms are unchanged.
- PixelLab redrew the anchor cell a little in its output (not pixel-identical to the input); that output is dropped.

**Baked sheets** (body + sword, rows S, SE, E, NE, N, NW, W, SW):

- [walk](https://github.com/Shilo/PixelDoll/blob/1f950291f90d43f5c6f27572445664f757f5716e/docs/testing/img/b16_sword8_walk.png): ![](https://github.com/Shilo/PixelDoll/raw/1f950291f90d43f5c6f27572445664f757f5716e/docs/testing/img/b16_sword8_walk.png)
- [idle](https://github.com/Shilo/PixelDoll/blob/1f950291f90d43f5c6f27572445664f757f5716e/docs/testing/img/b16_sword8_idle.png)
- The design is the same in every direction and frame, with no flips and no lost frames.
- SE walk f5–6 hold the arm wide. That is B15's known skeleton-v3 template pose, and the sword follows the hand.
- The mirrored rows (NW, W, SW) put the sword in the left hand. This is the known mirror hand swap (O13, out of scope).

**Studio:**

- The review card reads **Clean**: "Every frame passed the checks". ![](https://github.com/Shilo/PixelDoll/raw/1f950291f90d43f5c6f27572445664f757f5716e/docs/testing/img/b16_review_clean.jpg)
- All-directions grid (4 × 2 layout at this pane width): [b16_stage_8dirs_sword.png](https://github.com/Shilo/PixelDoll/blob/1f950291f90d43f5c6f27572445664f757f5716e/docs/testing/img/b16_stage_8dirs_sword.png).

**Stored item:**

- 2 layers (fg, bg), each with `cell 96×96` and `pivot (48, 75)`.
- Cells for idle and walk × S, SE, E, NE, N.
- `dressed` has all 5 directions, and there are 12 provenance entries.
- QA `pass`, 0 repaired frames.
- z: `main_hand_bg` 5 in S/SE/E (held bg over the cape, B15 diagonals included).

## 3. Engines

- Export: generic, Godot, Phaser, Unity and Aseprite, baked; 0 errors and 0 warnings.
- Presets: `sword` (body + sword, first, so the Godot doll starts with it) and `default` (body only). Both have no material
  variants: the Godot runtime does not apply variants (B15).
- Godot output: `checkouts/engine-tests/godot/pixeldoll/b16_eight_sword`.

| Test | Result |
|---|---|
| `--headless --import` | exit 0, 0 errors |
| `test_sync_oversize.gd -- b16_eight_sword` | 1,440 ticks, **2,880 oversize layer-ticks**, 0 failures. Offsets: body (−32, −59), sword (−48, −75) |
| `test_render_oversize.gd -- b16_eight_sword` (768×96, Vulkan, RTX 3070 Ti) | sword/idle, sword/walk, default/idle, default/walk: **0 px** each, 0 of 1,769,472 total |

Godot's own render of sword/walk: ![](https://github.com/Shilo/PixelDoll/raw/1f950291f90d43f5c6f27572445664f757f5716e/docs/testing/img/b16_godot_sword8_walk.png)

## 4. Ranger cape hurt north (`regridClip`)

- Before ([sheet](https://github.com/Shilo/PixelDoll/blob/1f950291f90d43f5c6f27572445664f757f5716e/docs/testing/img/b16_cape_hurt_north_before.png)): f1–3 balloon (areas 832 / 795 / 773 vs 656).
  ![](https://github.com/Shilo/PixelDoll/raw/1f950291f90d43f5c6f27572445664f757f5716e/docs/testing/img/b16_cape_hurt_north_before.png)
- After: `regridClip(cape, 'hurt', 'north', 4243)`, one inpaint-v3 grid, 10 gens.
  - **0 failed checks, saved.** Areas 649 / 653 / 668 / 657 / 647 / 647.
  - QA `warn`: one H4 warning on f2 (own 0.46), where the hem swings out to one side during the hit. It reads as cloth motion,
    not a balloon.
  - Top row = body + cape; bottom row = the full outfit: ![](https://github.com/Shilo/PixelDoll/raw/1f950291f90d43f5c6f27572445664f757f5716e/docs/testing/img/b16_cape_hurt_north_after.png)
- The grid redrew all 6 frames. The gray hem smudges that came from the T3 dress are also gone in this clip, so hurt N is
  now slightly cleaner than walk/idle N.

## 5. Notes and open items

- **Dev pitfall (live).** After HMR, the long-running :5175 tab loads its modules as `…/queue.ts?t=<n>`. A console
  `import('/src/lib/…/queue.ts')` then gets a **second, unconnected queue instance**. My first `regridClip` call went through
  that instance and its job only sat in the ledger as `queued`.
  - The tab's real queue (the leader) had no key, so the job waited too.
  - Fix: import the exact module URLs from `performance.getEntriesByType('resource')` and give the key to the leader queue.
    The retry with the same seed found the same request in the ledger, so it was charged once (10 gens).
- PixelLab was slow during the run (queue position 8, the dress took about 8 min).
- Not live-tested: a re-roll of a later dress chunk (covered by the self-test only), and 8-direction held items on the
  anchor route (it never uses the 96 canvas).
