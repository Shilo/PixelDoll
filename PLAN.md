# PixelDoll — Plan

Status: **Research spike + mockup phase** (started 2026-10-20). Living document; updated as phases complete.

## Goal

A client-side (GitHub Pages) Svelte + Vite + TypeScript tool that produces **traditional frame-based 2D pixel-art paperdoll assets** —
a base body animation set plus separately exportable, frame-aligned layers (hair, clothing, armor, weapons, accessories) — using
PixelLab AI for every generated pixel, and exports them for Godot, Unity, Phaser (and generic PNG/JSON).

PixelLab produces one composited image per call. PixelDoll's whole job is to turn that into **consistent, layered, slot-based,
frame-aligned** paperdoll data.

## Core hypothesis (to be proven/disproven by spikes)

```
1. Canonical base   : one base body, N directions, M animations, fixed canvas/frame-count/pivot  (the "rig contract")
2. Equipment edit   : PixelLab edits the UNCHANGED base frames to add one item (edit-image / edit-animation-v2 / transfer-outfit-v2 / inpaint)
3. Layer extraction : local alpha-aware diff (composite − base) → transparent per-frame equipment layer
4. QA               : drift detection (body redraw), region checks, temporal jitter, coverage
5. Compose          : slot z-order (incl. per-direction/per-frame front/back) → live preview
6. Export           : per-layer spritesheets + manifest JSON + engine-specific importers (Godot/Unity/Phaser)
```

## Known facts (verified so far)

- PixelLab REST v2 at `https://api.pixellab.ai/v2` allows **CORS** for a `*.github.io` origin (preflight 200, `authorization` header
  allowed) → a fully client-side app with a user-supplied API key is viable. Spec saved at
  `docs/research/pixellab/pixellab-openapi-v2.json` (102 paths).
- No public endpoint returns semantic layers. **Correction (R2/S1):** `inpaint-image-pro-flash` has `output_method`
  ("New layer with changes" …) returning mask-bounded changes-only output (still redraws body inside the mask). Under live test.
- Multi-frame edits pack frames into one grid → frames/call cap by size: edit-animation-v2 16/9/4, transfer-outfit-v2 15/8/3
  (≤64 / 65–80 / 81+ px). Flat cost per call. → **base canvas ≤ 64 px** is the sweet spot.
- Character states don't inherit animations; animation canvas may differ from rotation canvas → PixelDoll normalizes canvas/pivot.
- JS SDK is v1-only/stale → plain `fetch` against v2. Jobs auto-delete after completion → persist results immediately.
- Engines (R3): one sprite per layer, identical grid, one clock; exporter emits transparent cells, never omits.
- `docs/research/pixellab/proper_paperdolling_in_pixellab.md` describes the **Android "PixelLab – Text on pictures" app**, not
  pixellab.ai — must be flagged/corrected.

## Phases

| # | Phase | Owner | Output |
|---|---|---|---|
| 0 | Repo survey, plan, CORS check | PM | PLAN.md, TODO.md |
| 1 | Research (parallel agents) | R1–R5 | `docs/research/**` |
| 2 | API feasibility spike (live generations) | S1 | `spikes/api/` + `docs/spikes/` report |
| 3 | Synthesis → architecture + data model (manifest spec) | PM + architect agent | `docs/architecture.md`, `docs/manifest-spec.md` |
| 4 | Mockups (Svelte, functionality-first) | M-agents | `mockups/*` |
| 5 | Browser testing (Claude Browser / Playwright), real generations | T-agents | `docs/testing/*` |
| 6 | Review / challenge / iterate | PM + reviewers | fixes, updated docs |

## Research agents (Phase 1)

| ID | Topic | Output file |
|---|---|---|
| R1 | pixellab-pip skill + prior paperdoll spikes | `docs/research/tools/pixellab_pip/pixellab_pip_paperdolling_review.md` |
| R2 | PixelLab online docs/API currency check, correct stale docs | `docs/research/pixellab/pixellab_current_capabilities_2026-10.md` |
| R3 | Engine implementation patterns (Godot/Unity/Phaser, atlases) | `docs/research/engines/engine_paperdolling_implementation.md` |
| R4 | Games (Ultima Online, LPC, Tibia, RO, MapleStory, Stardew, …) | `docs/research/games/games_paperdolling_survey.md` |
| R5 | Paperdoll tools (fralonra/paperdoll, LPC generator, RPG Maker gen, Spine skins…) | `docs/research/tools/paperdoll_tools_survey.md` |

Cross-agent channel: `docs/research/SHARED_NOTES.md` (append-only, short bullets, prefixed with agent ID).

## Decisions log

- D1 (2026-10-20): Direct browser → PixelLab REST v2 calls with user-supplied key (CORS verified). No backend.
- D2 (2026-10-20): Primary layer route = same-canvas edit of unchanged base + local diff extraction (to be validated in S1).
- D3 (2026-10-21): **Superseded D2.** Primary route = chroma mannequin (S2): recolour frozen base to key ramp →
  edit-animation-v2 (≤16 cells) → key-score extraction → layer over real base. Diff extractor = fallback only.
- D4 (2026-10-21): Base generated at 48 px, padded to 64 px cell (never rescaled) for 16–20 px headroom. 56 px allowed as an
  advanced option; default stays 48→64 (O14).
- D5 (2026-10-21): Unity live verification deferred (user). Godot + Phaser verified pixel-identical.
- D7 (2026-10-21, PM on D1 §9): mock up looks A+E (native minimal + pixel accents, recommended), B (GlassKit glass), D (soft
  playful) and C (pro dark, as A's dark mode) → screenshots to user. Item flow default = auto-finish with an accept/re-roll
  review at the end (minimal human work). Bundled demo = team's own S1/S2 PixelLab outputs (private mockup phase; revisit before
  public release). Name stays PixelDoll; accent per D1 look E (blue + gold).
- D8 (2026-10-21, user): **Allowed models only** — characters: `create-character-v3` (or `create-character-pro-flash`);
  animations: `pixminimax` or `v3` (+ `skeleton-v3` mode); skeleton: `estimate-skeleton` + v3 skeleton. Banned: animation mode
  `template`, mode `pro`, `create-character-pro`, 4/8-dir standard routes, legacy `animate-with-skeleton`. Item route
  `edit-animation-v2` ("Edit animation (Pro)") under challenge in S4 vs Pro Flash packed-grid editing.
- D6 (2026-10-21): Skeleton v3 is the preferred skeleton route; legacy skeleton only as baseline (user) — S3 validating.
