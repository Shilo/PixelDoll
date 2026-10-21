# PixelDoll — Architecture (A1)

Author: A1 (architect) · Date: 2026-10-21 · Status: **v1.2**, updated with S1 ([`spikes/S1_api_feasibility.md`](spikes/S1_api_feasibility.md))
and S2 ([`spikes/S2_clean_layers.md`](spikes/S2_clean_layers.md)). Built so far: M1, M2, M5
([`testing/`](testing/)). Data model and export format: [`manifest-spec.md`](manifest-spec.md).

Evidence tags: **[S1]**/**[S2]** measured live, **[M1]**/**[M2]**/**[M5]** mockup test reports, **[R1]–[R5]** research reports,
**[A1]** decision taken here.

---

## 1. Goals and non-goals

**Goals**

1. Produce **traditional frame-based paperdoll assets**: one frozen base body (directions × animations × frames on one fixed
   cell + pivot) plus any number of **frame-aligned, separately exportable item layers**. Every layer sheet has exactly the
   base's grid. Transparent cells are emitted, never omitted.
2. **Every pixel comes from PixelLab.** PixelDoll only recolours the base to a key colour, crops/pads, keys, translates and
   composes. It never draws or resamples.
3. **Minimal human work**: one prompt per item. Key choice, calls, extraction, QA and re-rolls run automatically; the human
   accepts or re-rolls.
4. **Correct output for Godot 4, Unity, Phaser 3/4 and generic engines** (Godot 4.7 and Phaser 3.80/3.90/4.2 render
   pixel-identical to PixelDoll's compositor [M5]).
5. **Fully client-side** on GitHub Pages; the browser calls `https://api.pixellab.ai/v2` with the user's key (CORS verified [R2]).

**Non-goals (v1)**

- Layers from **character states** (same poses, not pixel-aligned [S1]); states are previews only.
- Body-shape axis (one base per project; items bound to it by `baseHash`). Full-body base swaps. Oversize cells.
- Bones, IK, anchor graphs [R4]. Semi-transparent VFX. Backend, accounts, packed atlases.

---

## 2. The rig contract

The rig is frozen once per project. Every item call targets the **frozen base animation cells** (recoloured to a key), never a
previous composite and never the rotation images.

| Property | Decision | Evidence |
|---|---|---|
| Cell | **64×64** square (32×32 allowed). | Batch routes fit 16 frames at ≤64 px, 4 above 80 px; 8 or 16 frames cost the same 10 gens [S1]. |
| Base generation size | `create-character-v3` and template animations at **48 px**, every frame **padded to 64 (x+8, y+16), never rescaled** → 16–20 px headroom. Option: 64 px base (6–7 px headroom) when no tall headgear is planned. | Prompting "small character" does not shrink animation frames; a tall wizard hat was squashed on the 64 base and fits on the padded 48 base [S2]. The 48 body looks smaller in the cell: product call (§15 O14). |
| Base look | Bald, barefoot, **plain grey t-shirt + plain grey shorts**, arms slightly away from the body. Prompts never say "body"/"skin". | Shirtless base hit a policy block; the clothed base passed every template and edit, no refusal in S2 [S1, S2]. |
| Directions | **4**: `south, east, north` generated, `west.mirrorOf = east`. Option 8: 5 generated + 3 mirrored. | West = exact pixel flip of east [M2]. North chroma items work [S2]. |
| Mirroring | Flip of the source direction's cells (pixels `x' = w−1−x`, pivot `px' = w − px`). Item `mirror: "flip"` (default) or `"generate"`. Exported sheets contain real pixels for every direction. | Handedness flips with `flip`; accepted. |
| Animations | Default **`idle`** (`breathing-idle`, 4 cells) + **`walk`** (`walking-8-frames`, 8 cells). Optional action clip **`cross-punch`** (6 cells). Template ids are **data** from S2's live humanoid list; **there is no `attack`/slash template for humanoids** [S2]. | 12 cells per direction (18 with the punch). |
| Cells come from animations | Templates re-render the whole body every frame and frame 0 ≠ the rotation image [S1]. The canonical rig = the returned animation frames. | |
| Frame count / playback | As returned, frozen, identical across directions. Playlist `frames[{cell, ms}]`; defaults walk 100 ms, idle 150 ms. | [M2] |
| Pivot | Integer, top-left origin, pixel-edge coords: `x = w/2`, `y` = bottom edge of the lowest opaque row of `idle/south/0`. Walk feet land 2–4 px lower on stride frames → warning only. | [M2] |
| Headroom | ≥ 6 px above the head in every cell (freeze warning); ≥ 12 px recommended for tall headgear. | [S2, M2] |
| Frozen base | Binary alpha (PixelLab output already is [M2]), SHA-256 of RGBA per cell, `baseHash` over all cells in (anim, dir, cell) order. New base = new rig; items with another `baseHash` are **stale**. | [M2] |
| Skeleton | `estimate-skeleton` per generated cell, **0.1 gen per call** (3.6 gens for 36 cells), run at concurrency 3 (8 concurrent → ~27 s each + a 429). Used for **anchors** (head, neck, hands, hip, feet; refined by patch tracking, ≤1 px vs silhouette [M2]) and **QA** (placement, handedness). Slot bands from keypoints are optional; chroma extraction does not need them. | [M2] corrects S1's "~0" |

---

## 3. Pipeline

```
 A. Base     create-character-v3 (48) ─▶ /characters/animations (templates, 48) ─▶ download frames immediately
 B. Freeze   pad to 64 ─▶ binary alpha ─▶ pivot + headroom check ─▶ skeleton per cell ─▶ anchors ─▶ hash ─▶ RIG FROZEN
 C. Item     choose key (green | magenta) ─▶ recolour base cells to the key ramp ─▶ edit-animation-v2 ≤16 cells/call
             (later calls carry one dressed anchor cell) 
 D. Extract  opaque ∧ key score < 35 ─▶ rim guard ─▶ drop specks ─▶ despill ─▶ layer drawn over the REAL base cell
 E. QA       key kept, mannequin unmoved, area, design lock, clip, handedness ─▶ re-roll the whole call (2×, then other key)
 F. Split    wrap items: fg = layer ∩ base alpha, bg = rest
 G. Compose  z ladder + sparse overrides + hides ─▶ preview (same code bakes composites)
 H. Export   per-layer per-animation sheets + manifest.json + engine glue ─▶ zip
```

### 3.1 Chroma mannequin (C) — primary item route [S2]

1. **Key**: `green` by default; `magenta` when the item prompt matches
   `/green|emerald|lime|olive|jade|teal|mint|forest/`. Never grey (failed on steel). Magenta fails on red items. After two QA
   failures, re-roll with the other key.
2. **Recolour** each frozen base cell (`toChroma`): luminance over opaque pixels, normalised per cell to `t ∈ [0,1]`; green
   `(110t², 60+195t, 110t²)`, magenta `(70+185t, 110t², 70+185t)`; alpha unchanged, so silhouette and outline stay exact.
3. **Design call**: `POST /edit-animation-v2`, ≤16 key cells (most important first: walk south + walk east), `image_size {64,64}`,
   `no_background: true`, fixed seed, prompt `chromaPrompt` (S2 verbatim template: key is intentional and must stay, add only
   the item in its natural colours, no key colour on the item, identical design in all frames, cell order/facing listed, keep
   pose/outline/background). 10 gens, ~100–160 s.
4. **Further calls for the same item**: `frames = [design output cell 0, ≤15 new key cells]`, prompt adds "Frame 1 already wears
   the {item}: copy exactly that design…", **discard output 0**. This anchor-cell call locks the design better than
   `transfer-outfit-v2` (palette distance 9–10 vs 34 on the helmet; sword area CV 0.04 vs 0.27–0.39) [S2]. Not pixel-identical,
   so pack an item's cells into as few calls as possible.
5. Items are always generated against the **bare** base (independent, combinable).

Packing for the default rig (3 generated dirs × 12 cells = 36): 3 calls = **30 gens per item** (+2 calls with the punch clip).

### 3.2 Extraction (D) — `chromaLayer` [S2]

Per output cell `C` with base cell `B` (port of `spikes/api/lib/chroma.mjs`):

1. **Key score** (ratio, not absolute: the returned dark outline is (9,39,7)): green `ex = G − max(R,B)`,
   `score = ex < 12 ? 0 : 100·ex/max(G,1)`; magenta `ex = min(R,B) − G`, `score = ex < 12 ? 0 : 100·ex/max(R,B,1)`.
2. **Mask** = `alpha ≥ 128 ∧ score < 35` (the histogram is bimodal: items ~0, mannequin 50–100). Optional y-bands from keypoints
   (head `y < NECK.y+3`, torso, feet, back); held items use the whole cell.
3. **Rim guard** (`dropKeyOutline`): drop a mask pixel if `B` is opaque there, it is on the silhouette ring or the base pixel is
   dark (mean < 60), and ≥ 2 of its base-opaque 4-neighbours are key in `C`.
4. Drop 8-connected components < 2 px.
5. **Despill**: pixels with tint > 10 snap to the core colour of nearest luminance (|Δlum| ≤ 0.08), else remove the key excess.
6. Layer = `C` under the mask, drawn over the **real** base cell. It is pre-occluded against `B` (an arm swinging in front cuts
   the vest).

Result: helmet, chest, boots, cape, sword on green/magenta: 0 specks, 0 pinholes, no face/skin/arm pixels (S1 diff: 11–38
pinholes, skin slivers, baked face) [S2].

**Fallback** (item collides with both keys, or face context needed — §15 O11): S1 diff on the real-skin base: `auto`
(`slot_novel2_grow1`, per-item fallback to `novel_cc` when > 25 % area is lost) + skin-only rejection (Δ ≤ 10) + pinhole fill;
≈ 9–12 false body px per cell remain [S1, S2]. Marked `extractor: "diff"` in the manifest and always human-reviewed.

### 3.3 QA (E) — per cell, aggregated per clip and item [S2]

| Gate | Pass |
|---|---|
| G1 Shape | frame count, order, canvas equal |
| G2 Key kept | share of base-opaque, non-item pixels still key-coloured ≥ 0.97 (catches the olive-outline failure: 0.91) |
| G3 Mannequin unmoved | key pixels outside base alpha ≤ 0.02 |
| G4 Presence | layer area ≥ 50 % of the clip median |
| G5 Stability | area CV per clip ≤ 0.15 |
| G6 Design lock | palette distance to the design call ≤ 15 (warn above) |
| G7 Clip | no layer pixel on y = 0 / cell border → re-roll or the rig needs headroom |
| G8 Handedness (held) | item centroid nearer the expected hand anchor in every clip (weapons switched hands in the punch clip [S2]) |
| — | spill rate, out-of-band pixels: report only |

A failure **re-rolls the whole call** (new seed); never patch one cell with another route. Two re-rolls, then the other key,
then the user decides. Metrics land in `item.qa` (manifest-spec §2).

### 3.4 fg/bg split (F)

Slots with `bgZ` (back, hair, held): `fg = layer ∩ baseOpaque`, `bg = layer − fg`. bg → base → fg reproduces base+layer
exactly [S1]; Godot/Phaser renders match the compositor pixel for pixel [M5]. Chroma north cells already give the full cape
back [S2]. **Two-pass "remove the character"** (`edit-animation-v2` on the dressed composites, 2× cost) only when hidden back
pixels are needed in south/east views: it returns un-occluded full objects (helmet face opening filled black, vest over arms),
so it is never a general route [S2].

### 3.5 Compose (G) and export (H)

Draw list per (animation, direction, playlist frame): visible layers (hides applied), sorted by resolved z (layer z, then most
specific `zOverride`: cell > anim > dir), ties by slot order, bg before fg, item id. Canvas2D/pure-`Img` compose shared by
preview, `baked/` and node export [M5]. Export details: manifest-spec §5–§6.

---

## 4. Slots, z ladder, hides

A slot is what can be equipped (one item per slot); an item emits `main`, or `fg` + `bg`, layers.

| Slot | Class | Anchor | fg z | bg z | Default hides |
|---|---|---|---|---|---|
| `body` | base | — | 10 | — | — |
| `feet` | worn | foot | 20 | — | — |
| `legs` | worn | hip | 30 | — | — |
| `torso_inner` | worn | neck | 40 | — | — |
| `waist` | worn | hip | 50 | — | — |
| `torso_outer` | worn | neck | 60 | — | — |
| `shoulders` | worn | neck | 65 | — | — |
| `arms` | worn | hand | 70 | — | — |
| `neck` | rigid | neck | 80 | — | — |
| `back` | worn | neck | 90 | 4 | — |
| `facial_hair` | rigid | head | 100 | — | — |
| `hair` | rigid | head | 110 | 3 | — |
| `face_acc` | rigid | head | 120 | — | — |
| `head` | rigid | head | 130 | — | `hair` (per item) |
| `off_hand` | held | hand_l | 140 | 2 | — |
| `main_hand` | held | hand_r | 150 | 1 | — |

- Class only matters for QA (G8 for held) and the optional rigid propagation (§5). Every class uses the chroma route.
- **Sparse overrides** `{layer, z, dir?, anim?, cell?}`, e.g. `main_hand` fg z 85 on `north` so the cape covers the weapon arm.
  Per-cell z is honoured by the Godot and Phaser glue [M5]. Prefer the fg/bg split.
- **Hides as data** (`slot.hides`, `item.hides` override). Semantic overlaps (hair+helmet 94 px, cape+sword 64) need hides/z,
  not pixel tricks [S1].
- **Item-vs-item order**: z ladder + split + overrides + hides only; no dress-order generation [A1, S1].

---

## 5. Cost-saving option: rigid propagation

For `rigid` slots in idle/walk clips, generate only the `idle/<dir>/0` cells (chroma call), then copy the layer into the other
cells translated by the anchor delta (patch tracking on the frozen base, ±4 px). Head offsets were ≤ 1 px on walk [S1, M2].
Cost ~10 instead of 30 gens per item; perfect temporal consistency. Not valid for action clips or held items with arm swings.
The 3-cell keyframe call is untested (§15 O12), so this is an opt-in "budget" toggle, not the default.

## 6. Colour model

- **Budget**: `edit-animation-v2` quantizes the grid to ~17–19 colours and the key ramp takes ~5–8 of them, so a chroma item
  gets **6–8 colours** [S2]. Item materials: ≤ 2 ramps of 3–4 colours. (Untested knob: a 3-step key ramp frees slots.)
- **Materials** = indexed source ramps, shadow → highlight, colours unique across materials [R5]: base `skin` (6), `eyes` (3),
  `shirt`, `shorts`; per item ≤ 2.
- **Into ramps**: item ramps are taken from the design call's layer (cluster by OKLab lightness), then every layer cell is
  snapped to them (ΔE ≤ 0.08; misses lower `snappedPct`). `target_palette` is not combined with the key yet (it would have to
  include the key ramp; untested).
- **Recolor regions = materials**; exact index swap source → variant ramp; `linkTo` (beard → hair). Export source-ramp sheets +
  `materials` (+ a tiny swap shader); optional baked variants. Multiply tint only as an engine option.

## 7. Project storage (browser) [M1, M2]

- IndexedDB `pixeldoll`: `projects`, `blobs` (PNG keyed by SHA-256 of RGBA, deduped), `jobs` (ledger). Frozen rig record
  `projects/rig-<baseHash 12 hex>` with manifest, skeletons and rig QA [M2]. `navigator.storage.persist()` on first save.
- Project zip: `project.json` (manifest with `cells`, QA, provenance; never the key) + `cells/<sha256>.png`; import re-hashes.
  `store/zip.ts` (store + deflate-raw via native streams, CRC32) and pure `image/pngraw.ts` encoder (canvas encode crawls in
  throttled tabs [M2]) — no dependencies.

## 8. Job queue [M1]

- One queue; persisted before submit, job id right after, results to `blobs` on completion; reload resumes; a job with an id is
  never resubmitted; request-hash cache for seeded requests; cancel = `DELETE`.
- Concurrency: Pro edit jobs default **8** (S2 ran 13 with no 429; S1 24 → two 429s cleared by backoff); `estimate-skeleton`
  **3** (server queues sync calls). On 429 drop to `max(1, n−1)`, +1 after 5 clean submits. M1 ships default 3, user 1–8 —
  raise the Pro default to 8.
- Backoff 2 → 60 s with jitter on 429/423/5xx/network errors of the submit (`Retry-After` unreadable [R2]). 401/402 pause.
  422 and policy `code 5000` are terminal. Poll every 5 s.
- Cost: per-job `usage` (templates report USD but deduct generations [S1]); `/balance` snapshots; estimate table as data (§12);
  confirm batches above a user threshold (default 20 gens).

## 9. API key handling [M1]

Memory by default; opt-in `localStorage`; "forget key". Never in URLs, zips, ledger, provenance or logs. Sent only as
`Authorization: Bearer` to `api.pixellab.ai`. CSP `connect-src` limited to PixelLab hosts. UI warns that the API accepts any
origin [R2].

---

## 10. Module breakdown (`app/src/lib`)

| Module | Files | Status |
|---|---|---|
| `pixellab/` | `client.ts`, `routes.ts`, `queue.ts` | built [M1] |
| `store/` | `manifest.ts`, `db.ts`, `zip.ts`, `project.ts` | built [M1, M2] |
| `image/` | `png.ts`, `pngraw.ts`, `hash.ts` (built); **`chroma.ts`** (port of `spikes/api/lib/chroma.mjs`: `toChroma`, `chromaLayer`, `keyKept`, `keyOutside`, `despill`, `chromaPrompt`), `diff.ts` (S1 `auto` + S2 `clean.mjs` skin rejection/pinhole fill; fallback), `palette.ts`, `qa.ts` | M3 |
| `rig/` | `rig.ts`, `normalize.ts` (+ pad 48→64), `mirror.ts`, `skeleton.ts`, `freeze.ts`, `templates.json` (S2 live humanoid list) | built [M2] |
| `compose/` | `compose.ts`, `split.ts` | built [M5] |
| `export/` | `sheets.ts`, `generic.ts` (+ `CREDITS.csv`), `godot.ts`, `phaser.ts`, `unity.ts`, `export.ts`; `aseprite.ts` later | built [M5] |
| UI | M1 key/queue, M2 rig, M3 item lab, M4 dress-up, M5 export | M1, M2, M5 built |

Every pure module keeps a `selfTest()` run by `npm run selftest` and `#/selftest`.

## 11. Item lifecycle (user view)

Pick slot → type item → design call (16 cells) runs → layer preview + QA badges → accept or re-roll → remaining calls run with the
anchor cell → coverage badge (dirs × anims) → item ready for dress-up.

## 12. Cost model (generations; default rig: 3 generated dirs, idle + walk = 36 cells)

| Step | Gens |
|---|---|
| Base `create-character-v3` (48) | 2 |
| Templates (2 × 3 dirs) | ≈ 6 |
| Skeleton (36 cells × 0.1) | 3.6 |
| **Base total** | **≈ 12** |
| Item (3 calls) | 30 (+20 with cross-punch × 3 dirs) |
| Item, rigid budget mode | ≈ 10 |
| 10-item character | ≈ 300 |

## 13. Risks and mitigations

| Risk | Status / mitigation |
|---|---|
| Mannequin outline redrawn off-key (olive) | Seen once with `transfer-outfit-v2` (not used); rim guard + G2 catch it → re-roll. |
| Key collides with item hue | Key choice by prompt words; other key after 2 fails; S1 diff fallback (still leaks 9–12 px/cell, human review). |
| Mannequin hides face/skin context | Hair, glasses, masks, makeup untested (§15 O11). Fallback route with the real face. |
| Design differs between calls | Anchor cell; pack ≤16 cells; G6 palette distance; not pixel-identical. |
| Held weapons switch hands or flicker in action clips | Generation problem [S2]. G8; prompt the side in image terms ("left side of the image"); anchor cells; re-roll. Known issue. |
| Small figure in the 64 cell (48 base) | Product call; 56 px + 8 pad untested; 64 base option without tall hats. |
| Few colours per item (6–8) | Accept for v1; 3-step key ramp untested. |
| Coverage untested: legs/pants, hair, idle on the clothed base, west generation, 8 dirs | M3 test matrix. |
| Unity importer never run (license-blocked; compiles clean) | Run once with a signed-in Hub [M5]. |
| Base change invalidates items | `baseHash`, stale badge, regenerate from stored prompts/seeds. |
| Template list / prices change | Data files; usage from jobs. |
| Key leakage | Memory default, CSP, never serialized. |

## 14. Mockups

| # | Mockup | Status / must prove |
|---|---|---|
| M1 | Key + queue | **Built** ([M1 report](testing/M1_report.md)). |
| M2 | Rig freeze | **Built** ([M2 report](testing/M2_report.md)). Add: 48→64 pad, `templates.json`. |
| M3 | Item lab (**chroma**) | Key choice, recolour, design + anchor-cell calls, `chromaLayer`, gates G1–G8, whole-call re-roll, key switch, diff fallback, split, budget propagation. Test matrix: helmet, hat, hair, glasses, chest, pants, boots, cape, sword, shield on idle + walk + punch × S/E/N. |
| M4 | Dress-up | 4–6 items with z ladder, overrides, hides, recolor, all directions, stale detection. |
| M5 | Export round-trip | **Built** ([M5 report](testing/M5_report.md)): Godot 4.7.1 and Phaser 3.80/3.90/4.2.1 pixel-identical to the compositor; Unity compile-only. |

## 15. Decisions

**Settled**

| # | Decision | Result |
|---|---|---|
| O1 | Item route | **Chroma mannequin + `edit-animation-v2`** (≤16 cells/call) [S2]. Per-frame masked inpaint rejected (design flicker) [S1]; `transfer-outfit-v2` demoted (worse cross-call lock, olive outline, clip flicker) [S2]. |
| O2 | Rigid propagation | Valid for head items in idle/walk (≤1 px); budget option only (§5). |
| O3 | Masked inpaint | Exact outside the mask, but no longer in the pipeline. |
| O4 | Base route | `create-character-v3` at 48, padded to 64; clothed t-shirt + shorts. |
| O5 | Packing / cross-call | Mix directions in one call; later calls carry one dressed anchor cell. |
| O8 | Skeleton | 0.1 gen/cell; anchors + QA; slot bands optional. |
| O9 | fg/bg split | Silhouette rule, exact recompose. |
| O10 | Concurrency | Pro 8, skeleton 3, adaptive. |
| O11a | Extraction | Chroma primary (0 specks/pinholes); S1/S2 diff only as fallback (ceiling ≈ 9–12 false px/cell). |
| — | Two-pass removal | Only for hidden back pixels. Rejected: `edit-image`, `edit-images-v2`, states, changes-only output. |

**Open**

| # | Decision | Criterion | Default |
|---|---|---|---|
| O6 | Base animation mode: template vs `skeleton-v3` | body stability, feet drift | template |
| O7 | Palette lock: ramp snap vs `target_palette` incl. key ramp; 3-step key ramp | colours per item, recolor quality, key kept | ramp snap |
| O11 | Face-context items (hair, glasses, masks) on the mannequin | layer quality vs diff fallback on the real face | chroma, fallback on fail |
| O12 | Rigid budget call with 3 keyframe cells | design match across dirs | off |
| O13 | Held-item handedness in action clips | G8 pass rate with image-side prompts + anchor cells | known issue |
| O14 | Base scale: 48 + pad vs 56 + pad vs 64 | headroom vs figure size (product call) | 48 + pad |
