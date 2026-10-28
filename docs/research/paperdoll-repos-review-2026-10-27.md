# Paper-doll review: two external repositories and PixelDoll itself (2026-10-27)

Owner request: check out two paper-doll repositories, challenge them and PixelDoll, and find what to improve in design,
architecture, tooling, algorithms, features and stability.

- [mor-o/comfyui-2d-character-pipeline](https://github.com/mor-o/comfyui-2d-character-pipeline): ComfyUI workflows
  that turn one character image into layered sprite sheets (pose edit, image-to-video, video inpaint for cosmetics,
  greyscale tint layers).
- [ppardalj/ultima-paperdoll-drawer-php](https://github.com/ppardalj/ultima-paperdoll-drawer-php): a PHP library that
  draws Ultima Online paperdolls from the game's client files (layers, hue tables, race and gender art). GPL-3.0+: ideas
  only, no code.

**Method.** Three review agents, then a challenge pass by the coordinating agent. Neither repository can run here (24 GB
GPU and models; proprietary UO client files), and their code was never executed. Their key algorithms were re-implemented
as small scripts and run on stored PixelLab frames (`spikes/api/out/x26`, `x28`) and the demo project, side by side with
PixelDoll's own modules. Ten probe tests reproduced PixelDoll flaws. `npm run check` was clean and `npm test` passed
(924 tests). No paid calls. The probe scripts lived in a session scratchpad and are not kept; the numbers below are their
results.

## 1. Verdict

- Neither repository has a better paper-doll pipeline for pixel art. The ComfyUI pipeline is not pixel art (soft alpha
  on 28 to 82 % of pixels, thousands of colors, no automatic QA, flicker our gates would reject). The Ultima drawer is a
  small, buggy 2017 renderer (4 confirmed bugs, including hues that never work partially and art shifted 1 px).
- Both confirm decisions PixelDoll already made: alpha instead of a transparent black (24.8 % of the demo body is black
  outline), exact ramps instead of greyscale tint or shared hue tables (tint flattens shading from 0.36 to 0.08 to 0.15),
  direction-aware z order instead of one fixed order, tucked hair instead of drawing helmets over hair (48 against
  672 stray hair pixels).
- The ComfyUI pipeline paints items onto the real base frames. Measured on our stored frames, that structure fits the
  body at 0.999 to 1.0 against 0.961 to 0.984 for today's pose route, and the misfit is shape, not offset (the best shift
  is 0 px). This is further evidence for research §18.2 concern 3.
- The most useful output is the list of PixelDoll's own flaws below, most of them small and free to fix.

## 2. PixelDoll flaws found (verified; ranked by user impact)

| # | Flaw | Evidence | Fix | Effort |
|---|---|---|---|---|
| 1 | Imported PixelLab characters are saved in the old `pixeldoll/1` format with a fixed 64 px cell. Item recolor then skips colors the body uses (speckled boots), and larger characters cannot be imported. | `lib/store/import.ts:203-205`, `:238`; probe F9 | Write the current format; size the cell from the source | Small |
| 2 | Hair and held items that extend past the bare body are drawn behind wide worn items (robe over the sword blade and long hair, front views). | `lib/compose/split.ts:5`; ladder `lib/items/items.ts:146`, `:160`, `:165-166`; probe F1 | Held: bg z = fg z in near-hand views. Hair: a better depth rule | Small / medium |
| 3 | Auto-save's shape checks have gaps: boots that collapse to a 1 x 8 stick on one frame, or a torso item during a slash, save as clean. | `dirGate` skips held, feet, legs (`items.ts:1027-1040`); `isAction` skips area checks (`:842-845`); probe F7 | Warn-only shape check against the dressed standing view for worn and feet items | Small |
| 4 | "Bring forward / Send backward" saves on the slot, so it changes every item in that slot, and a direction-only change blocks a later all-directions change. Mirrored views do not inherit it. | `studio/state.svelte.ts:534-549`; `compose.ts:150`; probe F2 | Store overrides per item; replace or merge correctly | Small / medium |
| 5 | Export bakes a tucked-hair copy for every hair and head-item pair, including head items for another body version; 5 hairs x 6 hats = 30 extra items (120 of 164 layer sheets). | `compose.ts:111` has no `baseHash` filter (the body loop at `:130` does); probes F3, F4 | Filter stale and always-hiding covers | Small |
| 6 | A hidden item still hides other slots (a great helm hides the cape, and the hidden cape still hides the hair). Engine runtimes copy the rule. | `compose.ts:29-35` (marked shortcut); `export/unity.ts:27-31` | Resolve hides from visible items only, everywhere | Small |
| 7 | Move type is guessed from the name ("sprint" and "crawl" count as actions, "rune-cast" as walking), which switches QA checks. | `items.ts:679`; probe F8 | Classify from the move's stored motion | Small |
| 8 | Opening a character reads and decodes every image one at a time (about 0.5 to 0.8 s of decoding for a 20-item character before storage latency). | `lib/store/project.ts:38-56`; probe F10 | Batch reads, decode in parallel | Small |
| 9 | No loop-seam check: the stored text-animated walk ends far from its first frame (seam 0.16 against 0.36 between neighbors; best loop end is frame 5). Skeleton moves loop by construction, so this matters for the skeleton-free route. | no loop or seam code in `app/src` | Seam score and loop-point choice in clip QA | Small |
| 10 | Rigid helmets shimmer: posed walk frames match the standing view at only 0.88 to 0.97 IoU, so 3 to 12 % of a helmet is redrawn each frame. | demo project; probe F6 | For idle and walk, shift the dressed standing view along the head track (saves about 15 of 25 gens per helmet); A/B offline first | Medium |

**Code the no-backward-compatibility rule says to remove:** reading `pixeldoll/1`, the head-slot migration
(`project.ts:37`), the ladder-override backfill (`project.ts:75`), `Item.extractor` (`manifest.ts:68`), and the
never-read `Item.mirror`. The paid cross-character fit (about 1,150 lines in `lib/equipment/`) only accepts 64 x 64
single-material headwear (`equipment/generate.ts:33-41`), so it cannot run on the default 80 px characters: freeze or
remove it until a route for 80 px exists (owner decision).

## 3. Features worth adding (ranked)

1. **Body templates.** Make one frozen body the unit of reuse: characters become looks on it (hair, skin, outfits), and
   every item is made once per body. Today N characters x M items means N x M paid item generations, because a free copy
   needs identical body frames. Medium effort, no paid generations to build.
2. **Runtime anchors and events in exports.** Hand, head and foot positions are already in `manifest.json`, but no engine
   runtime reads them. Add `get_anchor(name)` per frame and optional per-frame events (hit, footstep). Small per engine.
3. **More slots.** A cape and a quiver, or a skirt over pants, cannot be worn together (one item per slot, 16 fixed
   slots). Ultima splits cloak from backpack and inner from outer legs. Medium; new items still cost normal generations.
4. **Runtime dye.** Engines can only switch between pre-made color variants; a game cannot apply a color the player picks.
   Export the ramp generator, or an index sheet plus a palette lookup texture for a shader (the Ultima/ClassicUO model).
   Small to large depending on the route.
5. **Dye that keeps each material's lightness** as an option. `variantRamp` (`lib/dress/palette.ts:95-100`) moves every
   ramp to the picked color's lightness: one blue pick on a cape, a steel helmet and leather makes all three equally
   light (0.517) instead of keeping 0.34 / 0.59 / 0.51. Matching the pick is right for one material, so this is an
   option, not a fix. Small.
6. **A tighter inpaint fallback mask.** Use the failed layer grown 1 to 2 px instead of the slot band (`items.ts:275`):
   114 to 143 body pixels exposed to repaint instead of about 800. Helps only when the body was repainted. Medium; needs a
   paid A/B.

## 4. Do not adopt

- Greyscale x tint layers (loses hue and shading; luma merged 4 of 16 cloak colors).
- Local models (SAM3, BiRefNet, WAN, VACE): they need a backend or GPU and are outside the allowed PixelLab models.
- Lanczos downscaling with soft alpha (destroys the palette and exact index swaps).
- A static, dilated mask for moving items (clipped 8 to 49 % of a lunging cloak until 11 px of growth, which exposes
  about 810 body pixels per frame).
- Black as transparency, one fixed layer order (213 to 2,236 pixels differ per direction set), shared 32-step hue tables
  (hair 4 to 2 colors, cape 12 to 7), RGB555 storage, ID-offset conventions for body variants.
- Copying Ultima code (GPL-3.0+ against PixelDoll's MIT license).

## 5. Challenges to the review findings

- **Dye lightness (feature 5):** matching the picked color is what a user expects when recoloring one material. It is an
  option for outfit-wide dyes, not a defect.
- **Body templates (feature 1):** "most of the plumbing exists" is inferred (presets, `linkTo`, exact free copy). The cost
  problem it solves is real and measured.
- **Rigid helmet shift (flaw 10):** round 7 showed translation fails across different bodies (shape); this proposal is a
  shift on the same body along its own head track, which round 7 did not test. Needs an offline A/B on stored frames.
- **Loop seam (flaw 9):** the review's "no loop check anywhere" holds for the current code; it becomes urgent only if
  text-animated moves (§16.6) are adopted.
- **The real-frame route's better fit:** it is measured on separate test bodies and moves; the cost and design-drift
  trade-offs in §18.2 still apply.
