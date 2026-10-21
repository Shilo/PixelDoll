# PixelLab (pixellab.ai) — current capabilities & limits, 2026-10

Agent: R2 · Date: 2026-10-20 · Scope: verify/correct `pixellab-first_paperdolling_frame-based_2d_rpgs.md` and
`proper_paperdolling_in_pixellab.md` against PixelLab as it is today.

Evidence levels used below:
- **[spec]**: live OpenAPI `https://api.pixellab.ai/v2/openapi.json`, fetched 2026-10-20. It is **byte-identical** to the local
  snapshot `docs/research/pixellab/pixellab-openapi-v2.json` (102 paths, `version: "dev"`).
- **[docs]**: pixellab.ai/docs pages, fetched 2026-10-20.
- **[mcp]**: hosted MCP guide `https://api.pixellab.ai/mcp/docs`.
- **[probe]**: R2's own unauthenticated HTTP probes (CORS preflights, 401s). No paid calls.
- **[prior]**: earlier local research in `../pixellab-pip/docs/pixellab/*`. Not re-verified here.
- **[3rd]**: third-party pages. Low confidence.

---

## 1. Summary

1. **No official or community paperdoll/layer workflow exists for pixellab.ai.** There is no slot system, no semantic layer
   output and no equipment-library feature in the docs, the REST v2 spec, MCP or the SDKs. The nearest official items are:
   (a) two PixelLab YouTube Shorts, "Building modular clothes with PixelLab!" and "Change your characters' outfits with
   PixelLab!" (official channel @PixelLab_AI, confirmed via oEmbed; content not transcribed); (b) character/object **states**;
   (c) **Transfer outfit (Pro)** and **Edit animation (Pro)**; (d) the editor output method **"New layer with changes"**.
   Web searches for Discord, Reddit and X paperdoll threads turned up nothing (Reddit cannot be reached by this agent's
   crawler). PixelDoll's premise still holds: PixelLab returns composites and layering is our job.
2. **A changes-only output IS now public in REST and MCP** for exactly one route. `POST /v2/inpaint-image-pro-flash` has
   `output_method` ∈ {`New layer with changes`, `Modify current layer, only changes`, `Modify current layer` (default)}. Its
   description says unmasked RGBA is preserved exactly and that changes-only outputs are transparent outside the mask [spec][mcp].
   This output is **bounded by the mask, not by meaning**: inside the mask the body is still redrawn. It corrects one claim in
   the existing doc and in the PLAN "Known facts" (S1 flagged the same thing and is testing it live).
3. **Multi-frame edit routes pack frames into one fixed grid**, so the frame size sets how many frames fit in one call:
   `edit-animation-v2` 16/9/4 frames, `transfer-outfit-v2` 15/8/3, `edit-images-v2` 16/9/4/1. Above ~80 px you get at most
   3–4 frames per call [spec]. Pro editor tools charge per grid (10/15/25 generations by size), not per frame [docs][mcp].
   **Takeaway: keep the base canvas at 64 px or smaller** (80 px at most).
4. **Characters:** `create-character-v3` is the default, with 4 or 8 directions, 32–256 px and a square stored canvas. Other
   routes are Pro (32–168 px) and the legacy 4/8-dir template routes (16–128 px, canvas ~40% larger). The rig templates are
   `mannequin` (the only humanoid template) plus `bear/cat/dog/horse/lion` [spec]. Animations "get their own larger canvas when
   the motion needs room" [spec], so **animation frames are not guaranteed to share the rotation canvas**. PixelDoll must
   normalize canvases and pivots itself.
5. **The browser-direct architecture is confirmed.** The API reflects **any** `Origin` (including `http://localhost:*`) with
   `authorization` allowed, and the storage CDN sends `Access-Control-Allow-Origin: *` [probe]. One catch: only
   `Content-Disposition` is exposed, so **browser JS cannot read `Retry-After`**. PixelLab publishes no API-key handling guidance.
6. **The official JS SDK is v1-only and stale** (`@pixellab-code/pixellab` 1.0.2, June 2025, base URL `/v1`). The Python SDK on
   PyPI (1.0.5, May 2025) also defaults to `/v1`, although spec examples call v2 methods. **PixelDoll should call v2 with plain
   `fetch`.**

---

## 2. Capability / limits tables (all [spec] unless marked)

### 2.1 Character creation

| Route | Directions | Size | Templates | Cost | Notes |
|---|---|---|---|---|---|
| `POST /create-character-v3` (default; "most-used endpoint") | 8, or 4 via `n_directions` (reference mode only) | from scratch 32–256 (default 64); `reference_image` ≤256 | `template_id` mannequin \| bear \| cat \| dog \| horse \| lion | ref: `ceil(w*h*8/65536)` gens; scratch: 1 + `ceil(s*s*8/65536)` | Reference must face **south**. Non-square output is padded to a square. `direction_images` freezes directions you drew yourself; a fully covered import costs 0.25 gens. `view`: low top-down \| high top-down \| side |
| `POST /create-character-pro` | 8 | `image_size` 32–168; persisted square canvas may grow to 256 | same | "typically 10–25 gens" | `style_character_id` reuses an existing character's style. `target_palette` (≤64 colours) |
| `POST /create-character-pro-flash` | 8 (`n_directions`) | native 16 (exp.)/24/32/32×48/48/64/96×64/96/128; custom 16–256 beta | + `custom` | provisional; `GET /pro-flash/cost` | Query `GET /pro-flash/capabilities` (auth) for native shapes |
| `POST /create-character-with-4-directions` / `-8-directions` (template/legacy) | 4 / 8 | 16–128; canvas ~40% larger | mannequin + quadrupeds; `proportions` presets | standard 1 gen; 8-dir `mode=pro` 10–25 | Per-direction reference images are frozen as-is. Style hints (outline/shading/detail) are "soft guidance" |
| `POST /create-character-state` | applies the same edit across all 4/8 **rotations** | `override_frame_size` (multiples of 4, ≥ source) | inherits | 10–25 gens [mcp] | Saves a **new character** in the same `group_id`. `use_color_palette_from_reference` locks the palette. The spec text covers rotations only: existing animations are **not** carried over (verify in S1) |
| Export | `GET /characters/{id}/spritesheet` (ZIP: uniform-grid PNG + layout JSON, frames centred, "pivot is always the cell centre", never rescaled), `GET /characters/{id}/zip` | | | free | **No auth: the character UUID is the key.** Rotation URLs on `supabase.pixellab.ai` are public |

Docs: "Create 8-directional sprite (Pro)" in the editor/Creator: ≤168 px, 10/15/25 gens for 1–85/86–113/114–168 px, Tier 1
([docs](https://www.pixellab.ai/docs/tools/create-8-rotations-pro)).

### 2.2 Character animation

| Route / mode | Frames | Size | Cost | Notes |
|---|---|---|---|---|
| `/characters/animations` or `/animate-character`, `mode=template` | fixed by template | — | 1 gen/direction; canvases over ~100 px are billed per batch | `template_animation_id`; skeleton-based |
| `mode=skeleton-v3` (beta) | template | — | 2–4 gens/direction, ~3–5 min | "Moves the character instead of redrawing it each frame", which gives steadier identity and colours. **Best candidate for a stable base body** |
| `mode=v3` (default when no template) | 4–16, even | ≤256 | size × frames | `custom_start_frame`, `end_frame` (interpolation), `keep_first_frame` (default true, so you get N+1 frames) |
| `mode=pixminimax` (beta) | multiples of 4, up to 40 | any | 64×64: 8 frames = 1 gen, 40 frames = 6 | Tier 1+ per [prior] |
| `mode=pro` (legacy) | — | — | 10–25 gens/direction | |
| `POST /animate-with-text-v3` (raw frames) | 4–16, even | ≤256; budget `w*h*frames ≤ 524,288` | — | So the maximum is 16 frames at 64²/128², 14 at 192², 8 at 256². `drift_threshold` colour de-flicker |
| `POST /animate-with-skeleton-v3` (beta, raw) | 3–15 | ≤256 | 3 frames = 2 gens, 8 = 3, 15 = 4 (longer clips are nearly free); USD ≈ $0.0436/$0.0513/$0.0622 ([pixellab-api](https://www.pixellab.ai/pixellab-api)) | 18 labelled joints, x/y in 0–1, optional depth 0–255 and z_index. Needs `first_frame_keypoints`. Returns exactly `len(keypoints)` frames. 3–5 min |
| `POST /estimate-skeleton` | — | **only** 16/32/64/128/256 square | ~0.1 gen [prior] | The v3 text says "`GET /v2/estimate-skeleton`", but the spec defines **POST** (doc inconsistency) |
| `POST /interpolation-v2` (Pro) | "typically 4–8" | 16–128 | — | |

**Template IDs:** the spec only gives a truncated alphabetical list (`angry, attack, attack-back, attack-left, attack-right,
backflip, bark, breathing-idle, cross-punch, crouched-walking, …`). No enum endpoint exists. pixellab-pip's catalog (2026-06-30)
lists ~45 mannequin IDs (walk/walking-N, running-4/6/8-frames, breathing-idle, fight-stance-idle-8-frames, jumps, punches,
kicks, fireball, death, …) and has **no** `angry`/`attack*` entries. **The template set has changed since June, so do not
hard-code it.** It is [unverified]; S1 should capture the current list.

### 2.3 Editing / outfit routes (the paperdoll-relevant core)

| Route | Inputs | Size | Frames per call | Cost | Preservation behaviour |
|---|---|---|---|---|---|
| `POST /edit-animation-v2` (Pro) | text + 2–16 frames | output 16–256 | 16–64 px: **16** (4×4); 65–80: **9**; 81–256: **4** | 10 (≤128) / 15 (129–170) / 25 (171–256) gens [docs] | Claims "frame-to-frame consistency". **No pixel-preservation guarantee.** Optional `target_palette` |
| `POST /transfer-outfit-v2` (Pro) | reference image + 2–16 frames | output 32–256 | 32–64: **15**; 65–80: **8**; 81–256: **3** (the reference uses one grid slot) | same 10/15/25 tiers; "2 frames cost the same as more" [mcp] | Keeps the motion. [mcp]: the reference should be **the same character in the new outfit**; a different character can freeze the motion or change almost nothing. Smaller frames are centred and padded, never scaled. `additional_instructions` takes direction hints |
| `POST /edit-images-v2` (Pro) | `edit_with_text` or `edit_with_reference`; 1–16 images | output 32–512; inputs ≤512 | 32–64: 16 (15 with ref); 65–80: 9/8; 81–128: 4/3; 129–512: 1 | 10–25 [mcp] | "Preserves original structure and poses" (claimed, not guaranteed) |
| `POST /edit-image-pixen` | text, 1 image | source ≤256/side; target area ≤256²; **sides must be multiples of 4** | 1 | **1 gen** | "Only what you asked for changes" (claimed). Re-renders at the target size |
| `POST /edit-image-pro-flash` | text or reference | native sizes only | 1 | provisional | "Source canvas never grows or resizes" |
| `POST /edit-image` (legacy) | text | 16–400 (free tier ≤200) | 1 | — | |
| `POST /inpaint-v3` (Pro) | image + mask (**white = generate**) | 32–512 (docs: ≤256 Tier 1, ≤512 Tier 2+) | 1 | 10 gens [docs] | `crop_to_mask` default true. [mcp] `inpaint_image` "keeps the rest pixel-identical" |
| `POST /inpaint-image-pro-flash` | image + pure B/W mask | native sizes; source and mask identical | 1 | provisional | **Exact RGBA preserved outside the mask. `output_method` changes-only gives a result transparent outside the mask** |
| `POST /inpaint` (legacy) | | area ≤200×200 | 1 | — | |
| Try On (editor, experimental) | subject + garment image | 16–320 area | 1 | 1 gen, **Tier 2+** | **No REST endpoint.** The functional API analogue is `edit-images-v2 method=edit_with_reference` ([docs](https://www.pixellab.ai/docs/tools/try-on)) |

Editor docs ([options/general](https://www.pixellab.ai/docs/options/general)) list the output methods **New layer with
changes / Modify current layer / New frame**, plus "Paint in selection" and "Force symmetry". They do not say which tools
support each method. The editor inpainting UI asks you to paint **black** on an auto-created "Inpainting" layer, while the REST
mask convention is **white = generate**. Do not mix them up.

### 2.4 Jobs, billing, limits

| Topic | Fact | Evidence |
|---|---|---|
| Async | Most routes return `background_job_id`. Poll `GET /background-jobs/{id}` every 5–10 s (2–5 s for v3) until status is `completed` or `failed`. Results are in `last_response`; usage is in `usage` | [spec] |
| Queue | While `processing`, `last_response.queue_position` and `estimated_wait_seconds` are reported. `DELETE /background-jobs/{id}` cancels and frees the slot. A queued job is not charged; a running one may still be charged | [spec] |
| Retention | "Jobs are automatically cleaned up after completion". `/uploads` lasts 3 days (free). Map objects are deleted after 8 h | [spec] |
| Errors | 401 bad token · 402 insufficient credits/generations · 422 validation · **429 concurrency limit** · 529 rate limit (legacy routes) · 423 + `Retry-After` while still generating (tilesets, map objects, spritesheet) | [spec] |
| Concurrency | **Not published.** Per tier, shown only in the account UI. Earned "priority slots" add more (≥80% utilization for 30 min gives +1). Observed: Tier 2 hit a cap of 8 simultaneous jobs and had a priority-slot limit of 10. No API reports slots | [prior] |
| Balance | `GET /balance` returns `credits.usd` and `subscription.{plan, generations, total}`. Subscription generations are spent first, then USD credits | [spec], [prior] |
| Pricing (USD est.) | e.g. char v3 64² $0.041, 128² $0.042; anim text v3 $0.022–$0.042; skeleton v3 $0.044–$0.062; Pro image ≤256² $0.08; rotations v3 $0.029–$0.038. "Estimates; vary with GPU time" | [pixellab-api](https://www.pixellab.ai/pixellab-api) |
| Plans | Tier 1 "Pixel Apprentice", Tier 2 "Pixel Artisan" (spec example: 2000 generations/month), Tier 3 "Pixel Architect". Prices are reported at $12/$24/$50 per month. **[3rd, unverified]**: the official plan grid is JS-rendered and could not be read | [spec] example; [G2](https://ai.g2.com/marketplace/tools/pixellab) |
| Gating | Pro editor tools (Edit image Pro, Inpaint v3, 8-rot Pro, skeleton) need Tier 1+. Try On needs Tier 2+. Free trial: limited generations, legacy edit target ≤200² | [docs] |
| Commercial use | Allowed. Do not use outputs to train models. PixelLab says it does not store inputs/outputs unless a tool says so (managed characters are stored) | [FAQ](https://www.pixellab.ai/docs/faq) |

### 2.5 Browser / CORS / key handling ([probe], 2026-10-20)

- `OPTIONS https://api.pixellab.ai/v2/*` returns 200 for any Origin tested (`https://shilo.github.io`, `https://example.github.io`,
  `https://evil.example.com`, `http://localhost:5173`): the Origin is reflected, `allow-credentials: true`,
  `allow-headers: authorization,content-type`, all methods allowed, `max-age 7200`. This means **no origin allowlist**: any site
  holding a key can call the API.
- Actual responses expose only `Content-Disposition`. **`Retry-After` cannot be read from JS**, so use client-side exponential
  backoff on 429/529/423.
- The storage CDN `supabase.pixellab.ai` returns `Access-Control-Allow-Origin: *`, so result PNGs can be drawn to a `<canvas>`
  without tainting it. That is required for local diff extraction.
- Key guidance: none published (checked llms.txt, the API page, the FAQ and the MCP page). Auth is a bearer token from
  `pixellab.ai/account`. The MCP offers 15-minute upload-only ticket URLs (`/uploads/{ticket}`), which are not useful for a
  browser app.

### 2.6 SDKs / MCP

| Item | Status |
|---|---|
| JS SDK `pixellab-code/pixellab-js` | npm `@pixellab-code/pixellab` 1.0.2 (2025-06-15). Base URL `api.pixellab.ai/v1`. Covers only pixflux/bitforge/skeleton/text-anim/inpaint/rotate. **Stale; do not use** |
| Python SDK `pixellab-code/pixellab-python` | PyPI 1.0.5 (2025-05). Default branch `base_url` is `/v1`. A `new-endpoints` branch exists. The v2 spec's Python examples (`client.create_character_v3`, …) are not in the published package [inferred from repo listing] |
| MCP `https://api.pixellab.ai/mcp` (HTTP, Bearer) | Actively maintained, with a large tool set: `create_character(_state)`, `animate_character`, `transfer_outfit`, `edit_image(_pixen/_pro_flash)`, `inpaint_image(_pro_flash)`, `animate_with_skeleton_v3`, `get_upload_url`, `wait_for_jobs` (240 s default), plus project/chat/sandbox/Game Builder tools. No layer/paperdoll tool ("layers" appears only in map tools) |
| `llms.txt` | Endpoint index only. It says to use the OpenAPI for details |

---

## 3. Verified vs unverified claims

| Claim | Status |
|---|---|
| PixelLab returns composites; no semantic layers anywhere | **Verified** (spec, MCP, docs) |
| Changes-only output exists in public REST/MCP | **Verified in spec text** (`inpaint-image-pro-flash`). Live behaviour **unverified** (S1) |
| Exact preservation outside the mask (pro-flash inpaint; MCP `inpaint_image`) | Documented claim. **Unverified live** |
| `edit-animation-v2` / `transfer-outfit-v2` / `edit-images-v2` preserve unchanged body pixels | **Not claimed** by PixelLab. Expect redraw drift; the diff/QA pipeline is required |
| Frame/size tiers for the Pro edit routes | **Verified** (spec + docs agree) |
| Animation canvas may be larger than the rotation canvas | **Verified** (spec text). Exact sizing rule unverified |
| Character state does not carry animations | Spec wording implies it. **Unverified** |
| Current template-animation ID list | **Unverified**. The list has changed since 2026-06 |
| Concurrency numbers per tier | **Unverified** (one Tier 2 observation in [prior]) |
| Plan prices | **Unverified** (third-party) |
| CORS open for any origin; storage `*`; Retry-After not exposed | **Verified** ([probe]) |
| Community paperdoll workflow for pixellab.ai | **None found**. Discord/Reddit/X are not indexed or not reachable. PixelLab's own "modular clothes" Short exists but was not transcribed |

---

## 4. Corrections to existing docs

### 4.1 `pixellab-first_paperdolling_frame-based_2d_rpgs.md`

| # | Section / claim | Correction | Source |
|---|---|---|---|
| 1 | §6.2, §13 Option C, §17 item 4: "Public REST/MCP documentation does not expose equivalent native layer creation" / no changes-only output | **Outdated.** `POST /v2/inpaint-image-pro-flash` and MCP `inpaint_image_pro_flash` expose `output_method` "New layer with changes" / "Modify current layer, only changes". The output is transparent outside the mask and preserves unmasked RGBA exactly. It is still mask-bounded, not semantic | [OpenAPI](https://api.pixellab.ai/v2/openapi.json), [MCP docs](https://api.pixellab.ai/mcp/docs) |
| 2 | §5.2 Skeleton: references only the editor "Animate with skeleton" | Incomplete. **Skeleton v3** now exists: raw `POST /v2/animate-with-skeleton-v3` (beta; 18 joints, 3–15 frames, ≤256, 2–4 gens) and managed `mode=skeleton-v3`, which moves the character rather than redrawing it. `estimate-skeleton` accepts only 16/32/64/128/256 square inputs | [OpenAPI](https://api.pixellab.ai/v2/openapi.json) |
| 3 | §5.3 Transfer Outfit: "larger images have lower per-operation frame limits" | Correct, but needs specifics. Editor: 32–64 px 15 frames, 65–80 px 8, 81–256 px 3; cost 10/15/25 gens by size. API minimum is 32 px. Per the MCP guide, the reference should show **the same character** in the new outfit | [docs](https://www.pixellab.ai/docs/tools/transfer-outfit-pro), [MCP docs](https://api.pixellab.ai/mcp/docs) |
| 4 | §5.4 Edit Animation Pro "2–16 frames" | Correct. Tiers: ≤64 px 16, 65–80 px 9, 81–256 px 4; cost 10/15/25. Neither the docs nor the API promise pixel preservation | [docs](https://www.pixellab.ai/docs/tools/edit-animation-pro) |
| 5 | §5.5 Inpainting "modifies selected regions while preserving other image regions" | Partly verified. The options page only promises the result will "match the frozen part". Exact preservation is claimed only for MCP `inpaint_image` and pro-flash. Inpaint v3: 32–256 px (Tier 1) / 512 (Tier 2+), 10 gens. Mask polarity differs: editor paints black on the Inpainting layer, REST uses white = generate | [docs](https://www.pixellab.ai/docs/options/inpainting), [inpaint-v3](https://www.pixellab.ai/docs/tools/inpaint-v3) |
| 6 | §5 table "Try On" | Add: **experimental**, Tier 2+, 16–320 area, single image, 1 gen, **no REST endpoint** (closest: `edit-images-v2 edit_with_reference`) | [docs](https://www.pixellab.ai/docs/tools/try-on) |
| 7 | §5 table "Edit Image" as the single-frame route | Several routes now exist. `edit-image-pixen` (1 gen, ≤256, multiples of 4, "only what you asked for changes") is the cheapest single-frame edit. `edit-images-v2` batches up to 16 frames at ≤64 px. Editor "Edit image (Pro)" is single-image, Tier 1, 10/15/25 gens | [OpenAPI](https://api.pixellab.ai/v2/openapi.json), [docs](https://www.pixellab.ai/docs/tools/edit-image-pro) |
| 8 | §5 table "Character states — creates variations" | Correct. Add: the same edit is applied across all 4/8 rotations, saved as a new character in the group, with an optional palette lock and `override_frame_size`, at 10–25 gens. The spec says only rotations are edited, so **base animations are not inherited**. A state is therefore not frame-aligned with base animations unless re-animated (and then motion differs) | [OpenAPI](https://api.pixellab.ai/v2/openapi.json) |
| 9 | Appendix D references: "PixelLab JS SDK" listed as the API integration route | The JS SDK targets **v1** and was last released 2025-06 (1.0.2). The Python SDK on PyPI also defaults to v1. For v2 use raw HTTP | [npm](https://www.npmjs.com/package/@pixellab-code/pixellab), [GitHub](https://github.com/pixellab-code/pixellab-js) |
| 10 | Appendix D videos "Building Modular Clothes…" / "Changing Character Outfits…": "not independently reverified" | Verified as official PixelLab channel Shorts (titles "Building modular clothes with PixelLab!" and "Change your characters' outfits with PixelLab!"). Content was not reviewed | YouTube oEmbed, [1EDq2xHQcJ8](https://www.youtube.com/shorts/1EDq2xHQcJ8), [XF3VEbLnWCw](https://www.youtube.com/shorts/XF3VEbLnWCw) |
| 11 | §13 Option A Pixelorama "in the browser" | Add: **desktop browsers only** (no mobile) | [docs](https://www.pixellab.ai/docs/ways-to-use-pixellab) |
| 12 | §5 / §7 "Create 8-directional sprite" as the direction route | Still valid (Pro, ≤168 px, Tier 1), but the current default is `create-character-v3` (≤256 px, 4 or 8 dirs, south reference, frozen `direction_images`) | [OpenAPI](https://api.pixellab.ai/v2/openapi.json) |
| 13 | §5.1 Rotation tutorial (two approaches, fix with inpaint) | **Verified correct** | [docs](https://www.pixellab.ai/docs/guides/rotating-a-character) |
| 14 | (missing) canvas assumptions | Add: animations may get a larger canvas than rotations. The official spritesheet export centres frames in uniform cells ("pivot = cell centre"). The legacy 4/8-dir characters use a canvas ~40% larger than the requested size | [OpenAPI](https://api.pixellab.ai/v2/openapi.json) |

### 4.2 `proper_paperdolling_in_pixellab.md`

| # | Claim | Correction | Source |
|---|---|---|---|
| 1 | Whole document | **Confirmed off-topic for PixelDoll.** It covers the Android photo/text editor **"PixelLab – Text on pictures"** (package `com.imaginstudio.imagetools.pixellab`, developer App Holdings, originally Imagin Studio). It is **unrelated to pixellab.ai**, and the doc itself says so near the top. None of its feature claims (PLP projects, grid, layer lock/merge, no batch layer export) apply to pixellab.ai | [Google Play](https://play.google.com/store/apps/details?id=com.imaginstudio.imagetools.pixellab) |
| 2 | "Current Google Play release 2.1.9, updated January 19, 2026" | The listing fetched 2026-10-20 shows version string 2.1.9 but **"Updated on Oct 19, 2026"**. The date is stale | Google Play (fetched 2026-10-20) |
| 3 | Citations `citeturn…` | These are unresolvable chat-export citation tokens, so the specific claims cannot be traced. Treat its app-specific statements as unverified | — |
| 4 | Generic paperdoll rules (same canvas for every layer, fixed anchor, full-canvas transparent PNG, no independent trimming, `front/back` split for occluding items, explicit z-order data) | **Still valid and generic.** They agree with PixelDoll's rig contract and can be kept as background | — |

---

## 5. Implications for PixelDoll

1. **Rig contract: 64×64 (≤80) frames, 4 or 8 directions, `mannequin`.** That keeps every multi-frame edit at the 15–16 frame
   tier, so a whole 8-frame walk (or an N+1 frame clip) fits in one grid call. At 81–256 px the same work takes 3–4× more calls
   and 10–25 gens each. Compute the real canvas from the returned frames, never from `image_size`.
2. **Base body: `create-character-v3` plus template/`skeleton-v3` animations.** Skeleton-v3 "moves rather than redraws", which
   suits a stable base. Normalize all rotations and animations to one padded canvas with an explicit pivot. Match the official
   spritesheet convention (centred cells) or record offsets.
3. **Equipment route candidates, ranked for S1:**
   - (a) **Region items** (hat, helmet, held weapon): `inpaint-image-pro-flash` with a changes-only `output_method`. The layer
     arrives directly, transparent outside the mask. Still diff against the base inside the mask so redrawn skin/hair is not
     baked in. Drawbacks: single image per call, so temporal consistency across frames is a risk; native sizes only.
   - (b) **Worn items that follow motion:** first get a dressed reference via `create-character-state` (same edit across
     rotations, palette lock) or `edit-image-pixen`. Then run `transfer-outfit-v2` (reference = same character dressed, which
     matches the MCP guidance) or `edit-animation-v2` on the **unchanged base animation frames**, one direction per call, then
     diff. Body drift is expected because no preservation is promised, so QA must detect body redraw.
   - (c) Character **states alone are not a layer route**: they don't inherit base animations.
4. **Cost model:** a Pro edit costs per grid, so always fill the grid to the frame limit. Use `GET /balance` before and after
   for spend, and show the estimate in the UI.
5. **Job runner:** a client-side queue with a user-set concurrency (default ~4, adaptive on 429). Poll every 5 s. Use backoff
   because `Retry-After` is unreadable. Cancel with `DELETE`. Jobs are auto-cleaned, so download results immediately and
   persist to IndexedDB. Characters' zip/spritesheet links are public by UUID, so warn users.
6. **Key handling:** hold the key in memory or `sessionStorage` by default, with opt-in `localStorage`. Never put it in a URL.
   Send it only as `Authorization: Bearer`. Add a warning that any site can use a leaked key (no origin allowlist).
7. **No SDK:** use a thin typed `fetch` wrapper over the v2 OpenAPI snapshot (the local file is already identical to live).
8. **Template IDs must be data, not code.** Ask S1 to record the live list.
