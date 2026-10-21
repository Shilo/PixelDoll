# PixelLab-Pip Paperdolling Review (R1)

Date: 2026-10-20 · Agent: R1 · Status: research only. I made no PixelLab API calls and spent no credits.

Scope: everything in the `pixellab-pip` agent skill (sibling repo
`C:\Programming_Files\Shilocity\PixelLab\pixellab-pip`, written below as `pip/`) that matters for paperdolling and for building
PixelDoll on PixelLab REST v2. The endpoint facts come from PixelDoll's spec snapshot
`docs/research/pixellab/pixellab-openapi-v2.json` (102 paths, saved 2026-10-20).

Evidence labels used below:

- **[Spec]**: stated by the OpenAPI snapshot (schema or endpoint description).
- **[Pip doc]**: stated in pip docs or references. Usually backed by pip's own research, but not re-run here.
- **[Pip live]**: a live PixelLab result recorded by pip, with saved artifacts.
- **[R1 measured]**: R1 re-analyzed pip's saved PNG outputs locally with Pillow/NumPy (no API calls).
- **[Inference]**: R1's own reasoning. Treat as a hypothesis.

---

## 1. Executive summary

1. **Pip's settled model: paperdolling is a wrapper, not a PixelLab feature.** Public REST and MCP return composited images.
   They return no semantic layers. The route pip proposes is: unchanged base frames → one same-canvas PixelLab edit per item →
   local alpha-aware diff (composite − base) → drift, temporal and round-trip QA → manifest + transparent layer PNGs. Outputs
   get honesty labels: `client-extracted layer` vs `baked equipment composite`. Pip keeps "AI edit adds the item, then a second
   AI edit removes the body" only as an expensive, hallucination-prone fallback.
   [Pip doc: `pip/docs/pixellab/pixellab-paperdolling-research-spike.md`, `pip/docs/pixellab/pixellab-paperdolling-system-plan.md`,
   `pip/skills/pixellab-pip/references/paperdolling.md`]
2. **None of it was built.** No `dev-tools/paperdoll*` code exists and no `paperdolling-rework` branch exists. Git history has
   documentation commits only. The plan's thresholds were never validated against real PixelLab output: RGB Δ18 high-confidence,
   alpha Δ16, grow Δ6. PixelDoll starts from a design, not working code. [R1 checked git branches/log and `pip/dev-tools/`]
3. **The 2026-07 "no public changes-only output" claim is now partly outdated.**
   - **[Spec]** `POST /inpaint-image-pro-flash` (Pro Flash, beta) exposes `output_method` with three values: `"New layer with changes"`,
     `"Modify current layer, only changes"`, and `"Modify current layer"` (default). It states: "black RGB preserves every original RGBA byte"
     and "Changes-only outputs are transparent outside the mask".
   - **[Pip live]** In pip's 2026-09-29 run, all **43/43** Pro Flash inpaint results kept every pixel outside the mask exactly. That is
     0 changed pixels out of 8,418 outside-mask pixels, on a 96×96 canvas, at 5 generations per call and about 1 minute per job. That run
     used the default `"Modify current layer"`; the changes-only modes are untested.
     [`pip/docs/pixellab/pixellab-inline-negative-prompting-new-tool-results.md` §Inpaint integrity; raw jobs in
     `pip/pixellab-pip-generations/negative-prompting-new-tools-20260928/raw/PF-P-*`]
   - Pip's `pro-flash.md` knows about `output_method`, but `paperdolling.md` was never updated. S1 independently flagged the same field
     in SHARED_NOTES.
   - This is currently the **only public route with proven exact preservation outside the edited area**. That makes it the strongest
     single-frame primitive for frame-exact layers.
4. **Unmasked edits and outfit transfer redraw every pixel** [R1 measured from pip artifacts]:
   - `edit-image-pro-flash` with no mask: **0 % of base pixels outside the edited area stayed byte-identical**. 74–98 % stayed within
     max-channel ΔRGB ≤ 8, and 89–100 % within Δ ≤ 24. 0–30 pixels changed alpha. Colour count swung from 73 to between 29 and 478.
     Measured on 6 outputs of `negative-prompting-new-tools-20260928/images/PF-E-*`.
   - `transfer-outfit-v2`: **0 identical base pixels** in all 26 measured frames. 430–616 colours per 32×64 frame. The outfit covered only
     **76–98 %** of the base silhouette, so the base body would show through gaps if the outfit were overlaid as a layer.
     [`pip/pixellab-pip-generations/outfit-transfer-walk/`, `north_outfit_transfer/`]
   - Plain diff extraction therefore needs tolerance and palette snapping. Without them it simply fails.
5. **`inpaint-v3` (Pro) and MCP `inpaint_image` broke mask semantics in pip's live test.** They changed pixels outside the mask, or
   returned the masked area unchanged, and `crop_to_mask` had no effect. MCP and REST behaved identically, which points to a
   PixelLab-side bug. Pip says to avoid them for exact-mask work until they are re-verified.
   [Pip live 2026-07-27: `pip/docs/pixellab/pixellab-mcp-new-tools-test-results.md` §inpaint_image;
   `pip/skills/pixellab-pip/references/image-input-roles.md`]
6. **Content policy blocks nude base bodies.** Outfit transfer onto a nude front-facing (south) base failed **4/4** with
   `code 5000 … "Generation failed because it is against policy"`. Those failures cost $0. North and side views of the same base
   succeeded. PixelDoll's base body must be neutral and clothed (underwear or leotard), not nude.
   [Pip live: `outfit-transfer-walk/jobs/south*-status.json`]
7. **Pip never solved the base body.** Pip's chibi study found no prompt that reliably gives a bald, unclothed, target-proportion base:
   v3 over-stylizes, `outline` does nothing on v3/Pro, and the deprecated "standard" mode came closest. When v3 rotates a 64×64
   reference, it **re-draws it** (best offset matched only 66 % of input pixels exactly) and stores it on a **120×120** canvas.
   [`pip/docs/pixellab/pixellab-chibi-base-character-findings.md`; R1 measured `green-faceless-base-8dir/`]
8. **Frame count is limited by grid packing, not just a 2–16 range.** Multi-frame Pro routes pack all frames into one fixed canvas:
   - `edit-animation-v2`: 16 frames at ≤64 px, 9 at 65–80, 4 at 81–256.
   - `transfer-outfit-v2`: 15 / 8 / 3 (the reference image takes one slot).
   - `edit-images-v2`: 16 / 9 / 4 / 1 for ≤64 / ≤80 / ≤128 / ≤512.
   - Base frames should stay **≤64 px** if one call should cover a whole 8–16-frame direction. [Spec]
9. **The "echo" frame is never byte-exact.** `animate-pixminimax` frame 0 matched the input in **0/50** calls [Pip live]. v3 rewrites
   RGB under transparent pixels. Managed v3 and PixMiniMax animations store the reference as an extra frame 0 unless
   `keep_first_frame=false`. PixelDoll must keep its own copy of the source frame. [Spec + Pip doc `references/animation.md`]

---

## 2. Endpoint reference for PixelDoll (from the spec snapshot)

### 2.0 Conventions common to all endpoints [Spec unless marked]

- **Base URL:** `https://api.pixellab.ai/v2`.
- **Auth:** `Authorization: Bearer <token>` (security scheme `HTTPBearer`) on every endpoint, with two exceptions:
  `GET /characters/{id}/zip` and `GET /characters/{id}/spritesheet` say "No authentication required — the random character ID
  serves as the access key". Rotation and frame URLs are public `supabase.pixellab.ai/storage/...` URLs.
- **Image inputs:** a `Base64Image` **object** `{"type":"base64","base64":"…","format":"png"}`.
  - REST rejects a bare string with 422 [Pip live].
  - Send **raw base64 with no `data:` prefix**; some standard endpoints fail at generation with 500 otherwise
    [Pip live, `pip/pixellab-pip-generations/MANIFEST.md`].
  - Some frame routes wrap the image as `{image: Base64Image, size: {width, height}}`.
  - No REST request field in this snapshot accepts a URL or an `upload:` ref [R1 grep of the spec]. `POST /uploads` refs are
    therefore useful for MCP only.
- **Usage object:** `usage: {type: "usd"|"generations", usd, generations}`. The submit response often returns `usage: null`. The real
  charge appears on the completed job.
- **Async pattern:**
  - `POST` returns `background_job_id` (character creation also returns `character_id`).
  - Poll `GET /background-jobs/{job_id}` → `{id, status, created_at, last_response, usage}`. Results are in `last_response.images[]`.
  - While a job waits for a GPU, `last_response.queue_position` and `estimated_wait_seconds` are set.
  - `DELETE /background-jobs/{id}` cancels: a queued job is not charged; a running job may still be charged.
- **Observed extra `last_response` fields** [Pip live]:
  - All seen jobs: `type` (`done`/`message_done`/`message_progress`/`error`), `progress`, `billing_usage`, `usage_cost_usd`.
  - Outfit-transfer jobs only: `quantized_images[]`, `original_image_n_colors`, `quantized_image_n_colors`.
  - Pro Flash jobs only: `paste_x`, `paste_y`, `canvas_growth`, `output_method`, `image_url`.
  - Failure shape: `status: "failed"`, `last_response: {code: 5000, type: "error", error, detail}`.
- **Status vocabulary is open-ended.** Seen values include `processing`, `queued`, `completed`, `failed` and others. Detect completion
  by the presence of the result, not by matching a status word [Pip doc `references/job-lifecycle.md`].
- **Free probing:** requests that fail validation (422/400) cost $0, confirmed by balance snapshots. Use them to discover limits
  [Pip live, `pip/docs/pixellab/pixellab-image-size-limits.md`].

### 2.1 Base character creation

| Endpoint | Sync/async | Key request fields & limits [Spec] | Output | Cost signal | PixelDoll role / notes |
|---|---|---|---|---|---|
| `POST /create-character-v3` | async (`background_job_id` + `character_id`) | `description`* 1–2000; `reference_image` (south-facing, ≤256²); `direction_images` (reference mode only; each "used exactly as drawn"; same canvas as reference); `n_directions` 4\|8 (reference mode); `image_size` 32–256 (from scratch; advisory in reference mode); `view` `low top-down`\|`high top-down`\|`side`; `template_id` default `mannequin` (`bear/cat/dog/horse/lion`); `seed`; `no_background` default **true**; `outline`/`detail` (from scratch only); `enhance_prompt` (+0.05, from scratch only). | Managed character with 4 or 8 rotations; status `pending` → `completed` once the skeleton is reconstructed. | Reference mode: `ceil(w·h·8/65536)`. From scratch: `1 + ceil(s²·8/65536)`. | Base body creation. If **every** direction is covered by `direction_images`, the call is an import: 0.25 generations, nothing generated [Spec]. That is the way to bring in exact user-drawn base art. Canvas grows: 64 → 120 observed [R1 measured]. The south view is redrawn, not copied (66 % exact) [R1 measured]. |
| `POST /create-character-with-4-directions` | async | `description`*; `image_size`* 16–128 (character size; canvas about 40 % larger); `text_guidance_scale` 1–20 (8); `outline`/`shading`/`detail`/`view` strings; `isometric`; `color_image` + `force_colors`; `proportions` preset (`default/chibi/cartoon/stylized/realistic_male/realistic_female/heroic`) or custom multipliers 0.5–2.0; `template_id`; `seed`; `directions` {south, east, north, west} (provided images are frozen and must equal `image_size`; south required). | 4 rotations (S, W, E, N) | Template-based, about 1 generation ($0.0105 at 48 px) [Pip doc pricing] | The cheap "standard" pipeline. It gave pip's best chibi base [Pip doc], but pip calls it deprecated for routing. Its frozen `directions` field also imports exact art. |
| `POST /create-character-with-8-directions` | async | Same as the 4-direction route, plus `mode` `standard`\|`pro` (Pro ignores style and proportions, costs 10–25), `target_palette` (Pro only), and 8-key `directions` (standard only). | 8 rotations | standard 1 / pro 10–25 | Same as above, for 8 directions. |
| `POST /create-character-pro` | async | `description`*; `image_size`* 32–168; `method` `create_with_style`\|`create_from_concept`\|`rotate_character`; `view`; `template_id`; `concept_image` ≤1024; `reference_image` ≤168; `style_character_id` (an existing 8-direction character used as style); `style_description` ≤2000; `seed`; `no_background` true; `target_palette`. | 8 rotations on a square canvas (≥ max(w,h), up to 256) | 10–25 generations | Higher-quality base; `style_character_id` keeps sibling bases in one style. Expensive. |
| `POST /create-character-state` | async (status `queued`) | `character_id`*; `edit_description`* 1–1000; `no_background` true; `seed`; `override_frame_size` 32–256, multiples of 4, ≥ source; `state_name` ≤100; `use_color_palette_from_reference` (snap to source palette); `target_palette`. | A new character in the same `group_id`, with the same edit applied to all 4/8 **rotations only** | Pro bands (pricing page: ≤84 px $0.095, ≤112 $0.125, ≤168 $0.185) | A "dressed state" composite of each rotation. It is not a layer. It can seed dressed animations. Base-pixel preservation is unmeasured (gap Q12). |

### 2.2 Base animation

| Endpoint | Sync/async | Key request fields & limits [Spec] | Output | Cost signal | PixelDoll role / notes |
|---|---|---|---|---|---|
| `POST /animate-character` and `POST /characters/animations` (same request schema) | async → `background_job_ids[]` (one per direction), `directions[]`, `animation_group_id` | `character_id`*; `mode` `template`\|`skeleton-v3`\|`v3`\|`pixminimax`\|`pro` (legacy) — auto-detects `template` if a template id is given, otherwise `v3`; `template_animation_id` (e.g. `walking-8-frames`, `breathing-idle`; catalog in `pip/skills/pixellab-pip/references/preset-skeleton-template-animation.md`); `frame_count` (v3: even 4–16; pmm: multiple of 4 from 4–40; ignored by the other modes); `action_description` (required in custom modes); `custom_start_frame`/`end_frame` ≤256 (v3/pmm only, exactly one direction); `keep_first_frame` default true (stores `frame_count+1`); `subject_description`/`initial_pose` ≤300 (pmm only); `text_guidance_scale`/`outline`/`shading`/`detail` (template only); `directions` (template default = all; custom default = south); `isometric`; `color_image`/`force_colors`; `target_palette` (pro/v3/pmm); `seed`; `enhance_prompt` (v3 only); `animation_group_id` (extend an animation; a duplicate direction returns 409). | Stored animation frames: `GET /characters/{id}` returns frame URLs; `/zip` returns PNGs | template: 1 generation per direction, but canvases over ~100 px bill per batch (up to 3 at 128 px, 5 at 180 px, one per frame at 256 px). skeleton-v3: 2–4 per direction, 3–5 min, beta. v3: `ceil(w·h·frames/65536)` per direction [Pip doc]. pmm: 64² at 8 frames = 1, 40 frames = 6. pro: 10–25. | **Base animation source.** `mode="skeleton-v3"` claims it "moves the character instead of redrawing it each frame — steadier identity and colours" [Spec]. If true, frames of different states could align (gap Q11). The endpoint description's "2-12 frames" text is stale against the schema. |
| `POST /animate-with-text-v3` | async | `first_frame`* ≤256²; `last_frame`; `action`* 1–1000; `frame_count` 4–16 even (8); **budget w·h·frames ≤ 524,288**; `seed`; `no_background` (no default); `drift_threshold` ≥0 (colour de-flicker); `enhance_prompt`. | `frame_count+1` images; index 0 is the input "echo" (not exact) | `ceil(w·h·frames/65536)` | Raw base animation of an unmanaged base frame. Pip's matched tests found it best for walks and jumps [Pip live]. |
| `POST /animate-pixminimax` (beta) | async | `first_frame`*; `last_frame` (same size); `description`* ≤1000 (motion only); `frame_count` multiple of 4 from 4–40; `seed`; `no_background` default true; `drift_threshold`; `enhance_prompt`; `direction`/`view`/`subject_description`/`initial_pose` caption fields. | `frame_count+1` images; the spec says index 0 is "your input frame unchanged", but **0/50 matched exactly** [Pip live] | 64² at 4/8/16/40 frames = 1/1/2/6 | Long or forceful animations (attacks). Can turn the sprite away from the requested facing and add impact effects [Pip live]. |
| `POST /animate-with-skeleton-v3` (beta) | async | `description`* (appearance noun phrase); `action`* (short label); `direction`* (8-direction enum); `view`; `first_frame`* ≤256²; `first_frame_keypoints`* (all 18 joints; x,y in 0–1; `z_index` int; optional `depth` 0–255); `keypoints`* 3–15 frames × 18 joints; `template_id` enum; `seed` (0 = random); `no_background` true. | Exactly `len(keypoints)` frames; the reference is **not** echoed | 3 frames = 2, 8 = 3, 15 = 4 generations; 3–5 min | Pose-controlled base animation when PixelDoll owns the keypoints. The first pose is redrawn; a wrong start skeleton costs transparency and colour accuracy [Spec]. |
| `POST /edit-animation-v2` (Pro, REST-only) | async (202) | `description`* 1–2000; `frames`* **2–16** items `{image, size{w,h ≤256}}`; `image_size`* 16–256; `seed`; `no_background` default **false**; `target_palette`. **Packing limit:** 16–64 px → 16 frames, 65–80 → 9, 81–256 → 4. | Edited composite frames, same count and order | Pro bands by size (pricing page: ≤128 $0.095, ≤170 $0.125, ≤256 $0.185) | **Main candidate for adding equipment across animation frames.** Returns composites. Base preservation and temporal stability are unmeasured (gap Q5). |

### 2.3 Equipment edit routes (single image)

| Endpoint | Sync/async | Key request fields & limits [Spec] | Output | Cost signal | PixelDoll role / notes |
|---|---|---|---|---|---|
| `POST /inpaint-image-pro-flash` (beta) | async (202) | `image`*; `mask_image`* (same native size; pure black/white RGB; alpha ignored; an empty mask is rejected); `description`* 1–2000; `context_image` + `bounding_box{x,y,w,h}` (context needs a box); `no_background` default false; `background_removal_task`; **`output_method`** `New layer with changes`\|`Modify current layer, only changes`\|`Modify current layer` (default); `crop_to_mask` const true; `seed` (0); `project_id`. Native sizes come from `GET /pro-flash/capabilities`; a provisional estimate from `GET /pro-flash/cost`. | Submit returns `background_job_id, image_id, source_image_id, status, output_count, image_size, estimated_generations, pricing_provisional`; the job returns `images[]`, `image_url`, `paste_x`, `paste_y`, `canvas_growth`, `output_method` [Pip live] | 5 generations at 96×96 [Pip live]; provisional | **Best single-frame layer primitive.** Outside-mask preservation was exact 43/43 [Pip live]. The changes-only output modes are untested. |
| `POST /edit-image-pro-flash` (beta) | async | `image`*; `method` `text`\|`reference`; `description` ≤2000; `reference_image` (must fit the source canvas); `no_background` false; `use_color_palette_correction`; `seed`; `project_id`. The canvas never grows. | One edited image | ~5 generations at 96² [Pip live] | Redraws every opaque pixel (0 % exact) [R1 measured]. Usable only with tolerant diff. |
| `POST /edit-image` | async (202) | `image`*; `image_size`* 16–400; `description`* 1–**500**; `width`*/`height`* 16–400 (target canvas); `seed`; `no_background` default true; `text_guidance_scale` 1–10 (8); `color_image`. Free tier: ≤200. | One image at the target canvas | ~$0.0118 at 64² | Cheap single-frame edit. Base preservation is unmeasured. Its sibling `edit-image-pro-flash` redraws every pixel, so expect drift. |
| `POST /edit-image-pixen` | async (202) | `image`* (≤256 per side, sides multiple of 4); `description`* ≤500; `width`/`height` (multiples of 4, area ≤256²; it re-renders at that size and pads instead of rescaling); `seed`; `no_background` true. | One image | **1 generation** | Spec claims "pose, composition and pixel style are preserved". Unmeasured (gap Q10). Cheapest edit. |
| `POST /edit-images-v2` (Pro) | async (202) | `method` `edit_with_text`\|`edit_with_reference`; `edit_images`* 1–16 `{image, width, height ≤512}`; `image_size`* 32–512 (output); `description` ≤2000; `reference_image` (reference method); `seed`; `no_background` default **false**. **Packing limit:** 32–64 → 16 (15 with reference), 65–80 → 9 (8), 81–128 → 4 (3), 129–512 → 1. | One edited image per input | Pro bands. Observed 20 generations for 2×32² in July, before the 0.4.128 price change [Pip live]. | Consistent edits across up to 16 frames, e.g. one direction's walk. `edit_with_reference` can pass the item design as the reference. MCP inline base64 gets truncated around 40 KB [Pip live]. |
| `POST /inpaint` (base) | **sync** (200 → `image`) | `description`*; `negative_description`; `image_size`* 16–200 (area ≤200²); `text_guidance_scale` 1–10 (3); `outline`/`shading`/`detail`/`view`/`direction` enums; `isometric`/`oblique_projection`; `no_background` false; `init_image` + `init_image_strength` 1–999 (300); `inpainting_image`*; `mask_image`*; `color_image` (forced palette); `seed`. | One image | ~$0.007–0.013 | A cheap synchronous masked route. Pip never tested it. Worth one S1 probe (gap Q9). |
| `POST /inpaint-v3` (Pro) | async (202) | `description`* ≤2000; `inpainting_image`* `{image, size}` (32–512 in the prose only; schema has min 1); `mask_image`* `{image, size}` (white = generate, black = preserve); `context_image`/`bounding_box` deprecated; `seed`; `no_background` false; `crop_to_mask` default true. | One image | Pro bands | **Mask semantics broken in the 2026-07-27 live test** [Pip live]. Do not depend on it until re-tested. |
| `POST /transfer-outfit-v2` (Pro) | async (202) | `reference_image`* `{image, size ≤256}`; `frames`* **2–16** `{image, size}`; `image_size`* 32–256; `seed`; `no_background` default **false**; `additional_instructions` ≤2000 (e.g. "frames show the character from behind"); `target_palette`. **Packing limit:** 32–64 → 15, 65–80 → 8, 81–256 → 3. | Composited frames; the job also returns `quantized_images` (25–35 colours vs 1.1k–3.4k raw) [Pip live] | Observed **20 generations per job** whether 2 or 8 frames of 32×64, `usage_cost_usd` 0.095 (July) | A full redraw of the body with the outfit [R1 measured]. Use it for whole-body "skin" or outfit states, **not** for overlay layers. Same-character reference recommended. |

### 2.4 Skeleton and rotation

| Endpoint | Sync/async | Key fields [Spec] | Output | Cost | Notes |
|---|---|---|---|---|---|
| `POST /estimate-skeleton` | **sync** (200) | `image` Base64 (prose sizes 16/32/64/128/256) | `keypoints[] {x, y, label, z_index}` + `usage` | 0.1 generation [Pip live] | Per-frame hardpoints (`RIGHT ARM` = wrist/hand end, `LEFT LEG` = ankle/foot end). `z_index` hints front/back order. The v2 coordinate units (normalized or pixels) are unconfirmed (gap Q13). |
| `POST /animate-with-skeleton` (legacy) | **sync** (200 → `images[]`) | `image_size`* 16–256 (prose: 16/32/64/128/256); `guidance_scale` 1–20 (4); `view`; `direction` (pip warns the defaults are side/east); `isometric`/`oblique_projection`; `init_images` + strength; `skeleton_keypoints` **exactly 3 frames**; `reference_image`*; `inpainting_images` (3); `mask_images`; `color_image`; `seed`. | 3 frames | 1 generation [Pip live] | Its per-frame `inpainting_images` + `mask_images` are the only public **multi-frame masked** inputs (untested for paperdolling, see gap Q6). |
| `POST /generate-8-rotations-v3` | async | `first_frame`* ≤256²; `description` ≤2000 (hint); `no_background`; `seed`. | 8 frames | $0.029–0.038 | Rotating an item or dressed frame. Regenerates; not exact. |
| `POST /rotate` | **sync** | `from_image`*; `image_size`* 16–200 (prose 16/32/64/128); `from_/to_view`, `from_/to_direction`, `view_change`, `direction_change`; `init_image`, `mask_image` (needs init); `color_image`; `seed`. | 1 image | ~$0.011 | Single-direction rotate. |

### 2.5 Jobs, export and utilities

| Endpoint | Sync/async | Fields / response [Spec] | Cost | PixelDoll use |
|---|---|---|---|---|
| `GET /background-jobs/{job_id}` | — | `{id, status, created_at, last_response, usage}`; 404 if not found or not owned; "Jobs are automatically cleaned up after completion" | free | Polling. Persist IDs so a reload can resume. |
| `DELETE /background-jobs/{job_id}` | sync | `{id, status:"failed", message, usage}` | queued: not charged; running: may be charged | User-initiated cancel only. |
| `GET /characters/{id}` | sync | `CharacterDetail`: `size`, `directions`, `template_id`, `view`, `status`, `rotation_urls` (public), **`skeletons`** ("2D skeleton keypoints with depth", `{direction: [keypoints]}`), `animations[] {animation_type, animation_group_id, directions[{direction, frame_count, frames[] (public URLs)}]}`, `group_id`, `state_name`, `updated_at` | free | Fetch base frames and keypoints. Compare `updated_at` or the `?t=` stamp to re-sync. |
| `GET /characters/{id}/zip?states=` | sync, **no auth** | ZIP containing `rotations/`, `animations/{type}/{dir}/frame_###.png`, `metadata.json`; 423 while generating | free | Bulk import of base frames. The spec says keypoints are included "for template-based characters", but pip's three v3/standard exports (no animations) had none [R1 measured]. |
| `GET /characters/{id}/spritesheet` | sync, **no auth** | ZIP with `<name>.png` (uniform grid; row 0 = rotations, one row per animation-direction; frames centred and never rescaled, so the **pivot is the cell centre**) + `<name>.json` layout | free | Reference for PixelDoll's own export conventions. |
| `POST /uploads` (multipart `file`) | sync | `{ref: "upload:<uuid>", upload_id, width, height, n_frames, expires_in_days}`; hidden after 3 days, deleted a day later | free | No REST field accepts the ref (MCP only). Not needed for a REST-only app. |
| `POST /resize` | sync | `description`*, `reference_image`*, `reference_image_size`* / `target_size`* 16–200 (area); `view`, `direction`, `isometric`, `oblique_projection`, `no_background`, `color_image`, `init_image` + strength 0–999 (150), `seed`; advice: at most 2× up or 50 % down per step | ~$0.018 | Rarely needed; do not rescale rig frames. |
| `POST /remove-background` | sync | `image`*, `image_size`* 1–400 (area ≤400²), `background_removal_task` simple\|complex, `text` ≤500, `seed` | ~$0.0055 | Fallback when an edit returns a matte. |
| `POST /reduce-colors` | sync | `images`* (all the same size; **total ≤512² pixels**), `num_colors` 2–256 **or** `palette_image` (≤256 colours), `dithering` none/2x2/4x4/8x8, `dithering_strength` 0–10 → `images[]`, `palette`, `n_colors` | 0.1 generation [Pip doc] | **Palette snap before diffing:** put the composite frames onto `palette_image` = base palette + item palette, all frames of a direction in one call. |
| `POST /correct-pixelart` | sync | `images`* (same size, area ≤1024²), `strength` 0–1 (0.1) | 0.1 generation [Pip doc] | Optional cleanup; it alters pixels, so run it before diffing, never after. |
| `GET /balance` | sync | `credits{usd}`, `subscription{status, plan, generations, total}` | free | Budget UI and before/after cost checks. |
| `GET /pro-flash/capabilities`, `GET /pro-flash/cost` | sync | Native size pairs and supported controls; provisional cost (operation, width, height, n_directions) | free | Choose the rig canvas size to suit Pro Flash. |

---

## 3. Known failure modes and mitigations

| # | Failure mode | Evidence | Mitigation for PixelDoll |
|---|---|---|---|
| F1 | **Whole-sprite redraw on unmasked edits.** No byte-exact base pixels survive, so naive diff marks the whole body as "equipment". | [R1 measured] PF-E: 0 % exact; transfer-outfit: 0 identical; crown edit replaced the whole knight with a crown (`pip/pixellab-pip-generations/es-generations/edit_image_0.png`; pairing it to `knight-add-golden-crown.blueprint.json` is an inference from file names) | Prefer **masked Pro Flash inpaint** (exact outside the mask). For routes without a mask, apply a **mask clamp** (outside the slot mask, take the base pixel) plus a **tolerant diff with palette snap** inside the mask. Reject the result if more than X % of base pixels inside the slot drift beyond τ. |
| F2 | **Colour and palette drift; hundreds of colours.** | [Pip live] transfer-outfit raw 1,157–3,454 colours vs `quantized_images` 25–35; PF-E outputs 29–478 colours vs 73 in the source | Prefer a returned `quantized_images` field when present; call `reduce-colors` with `palette_image` (base + item palette); use `target_palette` on routes that accept it (edit-animation-v2, transfer-outfit-v2, states); set `use_color_palette_from_reference` on states. |
| F3 | **Masked inpaint-v3 ignores the mask.** | [Pip live 2026-07-27] | Do not use it until S1 re-tests. Use Pro Flash inpaint or base `inpaint`. |
| F4 | **Canvas size changes and padding.** | [Spec/Pip live] v3 creation pads to a square (64 → 120 observed; probe 32 → 64); Pro 32 → 60; standard canvas ~40 % larger than `size`; v3 "animations get their own larger canvas when the motion needs room"; `edit-image-pixen` re-renders at its target size; `override_frame_size` on states; Pro Flash reports `paste_x/paste_y` and `canvas_growth` | Freeze one **rig canvas** (square, multiple of 4) once. Normalize every return by **crop/pad only, never rescale**, recording the offset. Treat any size mismatch as a failed QA gate (pip Gate 1). Read `paste_x/paste_y/canvas_growth` from Pro Flash jobs. |
| F5 | **The echo frame is not the input.** | [Pip live] PixMiniMax frame 0 matched 0/50; v3 normalizes RGB under alpha 0; `keep_first_frame` defaults to true (+1 frame) | Drop or replace frame 0 with PixelDoll's stored source. Set `keep_first_frame=false` on managed v3/pmm. Count frames explicitly. |
| F6 | **Frame-count limits from grid packing.** | [Spec] `edit-animation-v2` 2–16 frames but only 4 above 80 px; `transfer-outfit-v2` 15/8/3; `edit-images-v2` 16/9/4/1; `animate-with-text-v3` budget w·h·frames ≤ 524,288; skeleton-v3 3–15 | Keep rig frames ≤64 px (16 frames per call) or ≤80 px (9). Split longer animations into chunks and expect seams between chunks (temporal QA). Some sources note Pro billing covers the whole grid. |
| F7 | **Per-endpoint size limits.** | [Spec + Pip size-limits doc] edit-image 16–400 (Free tier 200); edit-images-v2 output 32–512; edit-animation-v2 16–256; transfer 32–256; base inpaint area ≤200²; inpaint-v3 32–512 (prose only); pixen edit 256 per side, multiple of 4; v3 animation 256; skeleton-v3 256; rotate 16–200 (discrete sizes); resize ≤200²; remove-background ≤400²; reduce-colors 512² total; create-character-v3 floor **32** over REST | Rig canvas ≤128 (≤64 recommended). Validate locally before submitting. |
| F8 | **Inconsistent `no_background` defaults.** | [Spec] default **true** on edit-image, edit-image-pixen, character, state and pmm routes; default **false** on edit-images-v2, edit-animation-v2, transfer-outfit-v2, inpaint-v3, Pro Flash edit and inpaint | Always send `no_background` explicitly. After every call, verify alpha is 0/255 and no matte was baked in. Fallback: `remove-background` (pip `references/background-removal.md`). |
| F9 | **Content policy rejects nude base bodies.** | [Pip live] 4/4 south-view failures (`code 5000`, $0); north and side passed | Base bodies wear neutral underwear or a leotard. Treat a policy failure as a terminal, non-retried state with a clear UI message. |
| F10 | **Occluded and hidden item pixels.** | [Pip doc] diff cannot recover pixels hidden behind the body (back weapons, capes) | Front/back slot split using the body alpha and `z_index` hints; per-direction draw order; allow a manual mask. Label hidden parts as not recoverable. |
| F11 | **Temporal jitter and flicker across frames.** | [Pip doc] high risk; unmeasured | Temporal QA: bounding box, centroid, area, IoU, component count per frame. Re-roll only the frames that fail. |
| F12 | **Identity and style drift in managed template animation.** | [Pip doc] template mode re-renders (heavier leg shadows, palette drift, stiff motion); `outline` inert on v3/Pro creation | Test managed `skeleton-v3` (claims steadier identity); tune `shading`/`detail`/`color_image`+`force_colors`/`ai_freedom` (MCP). |
| F13 | **Facing and view drift.** | [Pip live/doc] PixMiniMax punches turn to a side view; v3 treats any reference as south; the faceless base came back reading as a back view (`green-faceless-base-8dir/south.png`, [Inference]) | Pass explicit `direction`/`view`; check facing in QA; base faces need clear front cues. |
| F14 | **Base body quality is unresolved.** | [Pip doc chibi findings] baby-like reads for "bald + no clothes + big head"; "unisex" helps; thigh gaps are a failure signal | Use user-supplied base art via `direction_images`/`directions` import, or a clothed neutral base. Do not promise a perfect generated base. |
| F15 | **Latency, queueing and stuck jobs.** | [Pip live] jobs stuck at `progress 0.49`; 17–30 min latency at 20-job peak concurrency; a 20/20 concurrency-limit error before a job ID was issued (2026-09-26; R2 cites a pip observation of 8 for Tier 2, so the limit seems to vary by time or surface); status lags the ready result | Back-off polling; resumable job ledger in IndexedDB; never resubmit a paid job because a poll errored; show `queue_position`. |
| F16 | **Pricing drift between documentation snapshots.** | [Pip doc] Pro bands changed in 0.4.128 to 10/15/25 by size; July observations of 20 generations predate that; Pro Flash pricing is "provisional" | Read `usage` from completed jobs; use `/pro-flash/cost` and `/balance`. Never hard-code prices. |
| F17 | **Semi-transparent VFX or edges.** | [Pip doc] alpha cannot be reconstructed from a flattened composite | Out of scope for diff layers. Generate VFX separately (VFX routes). |

---

## 4. Prior experiment results and lessons

| # | Experiment (date) | Artifacts | What happened | Lesson for PixelDoll |
|---|---|---|---|---|
| E1 | Outfit transfer onto a 24-frame nude base walk sheet, 3 directions, 32×64 cells (2026-07-21) | `pip/pixellab-pip-generations/outfit-transfer-walk/` (jobs/*.json, output-frames, completed-16-preview.png) | North and side completed at 8 frames each, 20 generations per job. South failed 4× on policy ($0). One 2-frame south job completed (20 generations: price did not drop with frame count). 2 jobs were still "processing" at 0.49 when the run ended. Outputs were full armour redraws: horns added above the headless base, 0 identical base pixels, 76–98 % silhouette coverage [R1 measured]. | Outfit transfer gives a **new full-body sprite**, not a layer. Charge is per job, not per frame. Avoid nude bases. Expect stuck jobs. |
| E2 | Back-view outfit transfer with `additional_instructions` (2026-07) | `north_outfit_transfer/` | 8/8 frames, 20 generations, identity kept; 500+ colours, 0 identical pixels, 76–87 % coverage [R1 measured] | Same as E1. `additional_instructions` works for view hints. |
| E3 | Pro Flash inpaint integrity (2026-09-29; 41 REST + 2 MCP) | `negative-prompting-new-tools-20260928/raw/PF-P-*`, `images/PF-P-*` | **Exact preservation outside the mask, 43/43.** 96×96 canvas, 798-pixel mask, 5 generations, ~1 min; `output_method:"Modify current layer"`, `canvas_growth:false`, `paste_x/y:0` | **Best primitive.** Inside the mask everything regenerates (0–0.1 % identical) [R1 measured], so body pixels inside the mask are redrawn too. Keep masks tight to the item region. |
| E4 | Pro Flash edit without a mask (same run) | `images/PF-E-*` | 0 % exact; 74–98 % within Δ8; some alpha flips; colour count unstable [R1 measured] | A Δ≈8–24 tolerance band plus palette snapping could make tolerant extraction feasible. Alpha flips at the silhouette edge are the hard part. |
| E5 | MCP/REST inpaint-v3 and edit-images-v2 verification (2026-07-27) | `pip/docs/pixellab/pixellab-mcp-new-tools-test-results.md`, `mcp-tool-verification-20260727T040152Z/` | inpaint-v3: mask semantics failed on both surfaces. edit-images-v2: 16 frames at ≤64 px returned; 2-frame edit = 20 generations; MCP inline PNG truncated at 40,020 base64 chars | Use REST from the browser, not MCP inline images. Do not rely on inpaint-v3. |
| E6 | Crown edit on a standing knight (localization test, date unknown) | `es-generations/`, `es-sweep/` (`base_sprite_0.png`, `edit_image_0.png`, `knight-add-golden-crown.blueprint.json`) | `edit-image` "add a golden crown" output a full-canvas crown; the knight disappeared [R1 viewed; pairing inferred from file names] | Short, unconstrained edit prompts can replace the subject. Use pip's paperdoll prompt fields: body region, placement, a preservation sentence, no loose parts (`references/paperdolling.md`). |
| E7 | Chibi base-body search (2026-06/07) | `pip/docs/pixellab/pixellab-chibi-base-character-findings.md`; `clean-chibi-base-template-*`, `hairless-chibi-base-template-*`, `unisex-chibi-base-template-*`, `hairless-woman-base-template-*` | No reliable bald, unclothed, target-proportion base. Standard mode came closest. Canvas 92×92 for a ~64 px subject. ZIP `metadata.json` contained no keypoints. | Ship a curated, user-supplied or imported base option. Prompt guidance: "unisex", "tall chibi avatar base", "big simple hands and feet"; avoid "mannequin", "doll-like", "paperdoll base", "oversized head". |
| E8 | v3 reference rotation of a 32×59 base, padded to 64² (2026-07-19) | `green-faceless-base-8dir/` | 8 directions on a 120×120 canvas; south only 66 % exact at the best offset (28,28); $0.18 credit delta | v3 rotation **redraws** the reference. Import every direction (`direction_images`) when exact art matters. |
| E9 | Skeleton v3 campaigns (2026-09-25/26; 54 matched jobs) | `pip/docs/pixellab/pixellab-skeleton-v3-research-spike.md`, `skeleton-v3-comparison/`, `*-skeleton-v3-*` | `estimate-skeleton` 0.1 generations, sync, 18 labels. A hand-placed start pose was off by a median 10.5 % of the canvas. Skeleton v3 3 generations per 8 frames. Text-v3 read best for walks and jumps, PixMiniMax for punches. Managed skeleton-v3 showed no decisive gain over template mode in one sample. | Use `estimate-skeleton` for the start pose and per-frame hardpoints. Skeleton v3 is choreography input, not pixel locking. |
| E10 | PixMiniMax negative prompting (2026-09-28) | same run, `PM-*` | 0/50 exact frame-0 echoes. `enhance_prompt` dropped negative clauses 3/3. | Keep the source frame locally; leave `enhance_prompt` off when constraints matter. |
| E11 | Prior art: PixelLab AI Skill (v1.5.5) and the lysle.net skeleton tool | spike §"PixelLab AI Skill…" and §"Reference Implementation: lysle.net" | AI Skill: transfer-outfit → edit-animation-v2 "remove the body" (two passes) plus a file-level `validate-sprites` checker. Lysle: keypoints `{x, y, label, z_index}` normalized 0–1 on v1, and cosmetic attachments that track keypoints. | The cheap first QA to adopt is a frame-set, order and size checker. The keypoint schema needs v2 confirmation. |

**Lessons, ordered by impact:**

1. The precondition for diff extraction (unchanged base pixels) holds only under a mask. In observed data, only Pro Flash inpaint
   provides it.
2. Charges are per call, not per frame (20 generations whether 2 or 8 frames). Batch as many frames per call as the grid tier allows.
3. Keep the PixelDoll-owned base frames as the single source of truth. Never trust a returned "echo".
4. Plan for policy failures, stuck jobs and long queues as normal states, not exceptions.

---

## 5. Gaps and open questions for S1 (live API spike)

Ranked by how much each answer changes the pipeline. Each item lists the cheapest decisive test.

| # | Question | Suggested test | Decides |
|---|---|---|---|
| Q1 | What does `output_method: "New layer with changes"` return on `inpaint-image-pro-flash`? Is it transparent outside the mask, alpha 0/255 inside, with pixel values equal to the composite? Does it include redrawn body pixels inside the mask? | One base frame + hat-region mask; run once with each of the 3 `output_method` values and the same `seed`. Diff against base and against each other. | Whether PixelDoll needs local diff at all for single frames. [Inference] It will still contain regenerated skin inside the mask, so a local diff will still be needed. |
| Q2 | Which native sizes does Pro Flash inpaint accept (`/pro-flash/capabilities`)? Does 64×64 work? Does an arbitrary multiple of 4 work? | Free GET plus a 422 probe. | The rig canvas size. If only presets work: a crop → inpaint → paste-back workflow. |
| Q3 | Is an item consistent across frames when each frame is inpainted separately (Pro Flash has no `reference_image`)? | 4 walk frames; same seed, prompt, mask shape following the hand keypoint; compare item bounding box, colours and shape. | Per-frame inpaint vs grid edit for animation. |
| Q4 | Cost and latency of Pro Flash inpaint at 32/48/64/128 (`/pro-flash/cost` plus actual `usage`). | Free GET, then 1 paid call per size. | Budget model: frames × directions × items × 5? |
| Q5 | `edit-animation-v2` base preservation: share of base pixels within Δ≤8/24 outside the item region, alpha flips, colour count, temporal stability. | 8-frame 64×64 walk, "add an iron helmet". Metrics from §3 F1/F11. | Whether a mask clamp + tolerant diff on grid edits is viable, which would cost about 16× less per frame than per-frame inpaint. |
| Q6 | Legacy `animate-with-skeleton` with `inpainting_images` + `mask_images`: a 3-frame masked route. Does it preserve unmasked pixels? | 3 base frames + masks. | A cheap multi-frame masked alternative. |
| Q7 | Do `quantized_images` and `original_image_n_colors` appear on edit-animation-v2 and edit-images-v2 jobs, and is the quantized output closer to the base palette? | Inspect any completed job JSON. | Whether a separate reduce-colors pass is needed. |
| Q8 | Is the inpaint-v3 mask bug fixed? | One 64×64 call with a small mask. | Re-enables a 512-capable masked Pro route. |
| Q9 | Base `inpaint` (sync, ≤200², about $0.007): is it exact outside the mask? | 1 call. | A cheap synchronous masked route if exact. |
| Q10 | `edit-image-pixen` (1 generation) base preservation. | 1 call, same metrics as PF-E. | Cheapest edit route. |
| Q11 | Managed alignment: does a `create-character-state` (dressed) animated with the **same** `template_animation_id` in `skeleton-v3` mode produce frames pixel-aligned with the base character's animation? | Base + "wearing iron helmet" state; same template; diff per frame. | Whether "state diff" is a valid multi-direction, multi-animation layer route. |
| Q12 | Does `create-character-state` preserve canvas and base pixels per rotation? | 1 state; diff against the 4 rotations. | Direction coverage via state. |
| Q13 | `estimate-skeleton` v2 coordinate units, and whether `GET /characters/{id}.skeletons` or ZIP `metadata.json` carry **per-animation-frame** keypoints. | 1 sync call + 1 GET on an animated template character. | Hardpoint source (free from managed data vs 0.1 generations per frame). |
| Q14 | CORS from a `*.github.io` origin for `GET /characters/{id}/zip` / `spritesheet`, public `supabase.pixellab.ai` frame URLs and Pro Flash `image_url`. | Browser fetch with an Origin header. R2 (SHARED_NOTES) reports API CORS reflects any origin and the storage CDN sends `*`; `/zip` from the browser still needs confirming. | Whether the client can download managed frames directly or must rely on base64 job results. |
| Q15 | Does a clothed-underwear neutral base pass policy on south for transfer-outfit and edits? | 1–2 calls. | The base-body recipe. |
| Q16 | Concurrency limit and 429 behaviour for the tier being used, and typical latency per route. | Log timings across S1. | Queue UI and parallelism. |
| Q17 | Does `seed` + identical prompt reproduce the same item across separate calls on different frames? | 2 calls. | The consistency strategy for per-frame edits. |

---

## 6. Recommendations for PixelDoll's pipeline

1. **Four honest output classes**, recorded per layer in the manifest:
   - `native-layer`: Pro Flash changes-only, if Q1 passes.
   - `client-extracted`: local diff, after QA passes.
   - `baked-composite`: composite only; the layer was rejected.
   - `body-variant`: a full redraw such as outfit transfer or a state, which replaces the base instead of overlaying it.

   Never present a full redraw as an overlay layer.
2. **Rig contract first.**
   - Choose one square canvas: a multiple of 4, ≤64 px if possible (16 frames per Pro grid call), and inside Pro Flash's native sizes
     (Q2).
   - Freeze the base frames for directions × animations × frames as **PixelDoll-owned PNGs**. Never regenerate them afterwards.
   - Every item edit targets these frozen frames, never a previous composite (pip rule).
   - Normalize every PixelLab return by crop/pad with recorded offsets. Never rescale.
3. **Base creation path:**
   - Managed character (`create-character-v3`, or the cheaper standard 4/8-direction route) with a **clothed neutral** base prompt.
   - Base animation from managed `template` or `skeleton-v3` (`/characters/animations`, `keep_first_frame` irrelevant for template),
     or raw `animate-with-text-v3` per direction.
   - Import user art exactly via `direction_images` / `directions`.
   - Download frames via job results or `/zip` (no auth; CORS pending Q14).
4. **Single-frame item layer, default route:**
   - Build a slot mask: head for hats and hair, torso, hand plus weapon arc. Derive it from `estimate-skeleton` keypoints plus slot
     templates, with a manual override.
   - Call `POST /inpaint-image-pro-flash`.
   - Take the layer from the composite: layer = composite pixels **inside the mask** that differ from the base beyond τ. Outside the
     mask the composite is byte-identical, which E3 proved.
   - Treat regenerated body pixels inside the mask (Δ ≤ τ after palette snap) as "base".
   - Switch to `output_method: "New layer with changes"` only if Q1 shows it is cleaner.
5. **Animation item layer** (choose with S1 data):
   - (a) Per-frame Pro Flash inpaint: exact outside the mask, but about 5 generations per frame and a consistency risk (Q3).
   - (b) One `edit-animation-v2` call per direction (≤16 frames at ≤64 px). Then **clamp** outside the slot mask to base pixels; this is a
     local copy of base pixels, allowed under pip's asset-integrity rules. Then tolerant diff inside the mask.
   - Default to (b) for cost. Escalate the frames that fail QA to (a). Whole-direction consistency comes from (b); exactness from the
     mask clamp.
6. **Extraction algorithm** (implement in TypeScript, Canvas/ImageData, run in a Web Worker):
   1. Size, frame-count and order gate.
   2. Premultiplied alpha.
   3. Palette snap: map each composite colour to the nearest base-palette colour within τ.
   4. Seed changed pixels at Δ > τ_hi; grow into neighbours at Δ > τ_lo.
   5. 3×3 close/open.
   6. Connected components scored against the slot region.
   7. Copy composite pixels into the layer.
   8. Round-trip check: base + layer ≈ composite inside the mask.
   9. Temporal QA.

   Starting thresholds: pip's τ_hi = 18, alpha 16, τ_lo = 6. R1's PF-E data suggests **τ ≈ 8–24 is the noise band** of redraws, so
   expose τ as a user-tunable control (the "calibration knob") and show a diff heatmap.
7. **Palette discipline:** optionally run `reduce-colors` with `palette_image` = base palette ∪ item palette on all frames of a
   direction in one call (0.1 generations, ≤512² total pixels). Use `target_palette` where available. Always send `no_background: true`
   explicitly.
8. **Hardpoints and z-order:**
   - Per frame, `estimate-skeleton` (0.1 generations, sync) or managed `skeletons` (Q13): `RIGHT ARM` → `hand_r`, `LEFT ARM` →
     `hand_l`, `NECK`/`NOSE` → head, `LEFT/RIGHT LEG` → feet.
   - Use keypoint `z_index` plus body-alpha overlap to propose front/back splits per direction. Export the hardpoints in the
     manifest.
9. **Outfits and armour that cover the whole body:** use `transfer-outfit-v2` (≤15 frames at ≤64 px per call, about 20 generations
   observed) as a `body-variant`. Swap the whole frame set at runtime instead of overlaying, because outfit coverage is only
   76–98 % of the base.
10. **Do not use** for the layer path: inpaint-v3 (until Q8), unconstrained `edit-image` prompts, two-pass "remove the body" (fallback
    only, labelled AI-extracted), MCP inline base64, or `data:` prefixes.
11. **Job engine (client-side):**
    - Bearer key in memory or optional local storage; it never leaves the browser except to `api.pixellab.ai`.
    - Back-off polling.
    - Persistent job ledger (IndexedDB) storing request, job ID, status and usage, so a page reload can resume polling.
    - Never resubmit on a poll error. Cancel (DELETE) only when the user asks.
    - Show `queue_position`/`estimated_wait_seconds` and the per-call `usage`.
    - Pre-flight cost estimate via `/pro-flash/cost` plus a static table. Check `/balance` before and after.
    - Treat `code 5000` policy failures as terminal.
12. **Prompt template per item** (from pip `references/paperdolling.md`): identity, direction, target item, body region and side,
    placement and geometry, occlusion, then preservation ("keep every existing pixel unchanged except where the item naturally covers
    it"). Keep it under 500 characters so it fits `edit-image`/`edit-image-pixen`.

---

## Source index (pip repo, `C:\Programming_Files\Shilocity\PixelLab\pixellab-pip`)

- Skill: `skills/pixellab-pip/SKILL.md`; references `paperdolling.md`, `image-input-roles.md`, `animation.md`,
  `preset-skeleton-template-animation.md`, `job-lifecycle.md`, `cost-routing.md`, `prompt-limits.md`, `style-reference.md`,
  `local-asset-assembly.md`, `credentials.md`, `official-pixellab-documentation.md`, `mcp-platform-tools.md`,
  `reviewable-candidates.md`, `pro-flash.md`.
- Research: `docs/pixellab/pixellab-paperdolling-research-spike.md`, `pixellab-paperdolling-system-plan.md`,
  `pixellab-image-size-limits.md`, `pixellab-hd-region-edit-animate-spike.md`, `pixellab-chibi-base-character-findings.md`,
  `pixellab-skeleton-v3-research-spike.md`, `pixellab-skeleton-template-animation-research.md`, `pixellab-api-pricing-model-list.md`,
  `pixellab-credit-output-estimation-spike.md`, `pixellab-mcp-vs-rest-route-parity.md`, `pixellab-mcp-new-tools-test-results.md`,
  `pixellab-inline-negative-prompting-new-tool-results.md`.
- Handoffs: `.claude/handoffs/*.md` (PixMiniMax, Workbench, Skeleton v3, Game-Art merge, personalization). None are
  paperdoll-specific. The Skeleton v3 handoff led to the E9 campaigns.
- Generations: `pixellab-pip-generations/outfit-transfer-walk/`, `north_outfit_transfer/`,
  `negative-prompting-new-tools-20260928/`, `mcp-tool-verification-20260727T040152Z/`, `es-generations/`, `es-sweep/`,
  `green-faceless-base-8dir/`, `*-base-template-*`, `skeleton-v3-comparison/`, `*-skeleton-v3-*`, `MANIFEST.md`.
- No pip dev-tools exist for diff, extraction or layers. `skills/pixellab-pip/assets/inspect_images.py` reports only dimensions, alpha
  extrema and bounds.
