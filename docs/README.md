# PixelDoll docs index

Start with [architecture.md](architecture.md) (v1.3, current pipeline) and [manifest-spec.md](manifest-spec.md) (export
format). Project state and decisions D1–D9: [PLAN.md](../PLAN.md). Casual users: [user-guide.md](user-guide.md).

**Evidence media lives at tag [v0.1.0](https://github.com/Shilo/PixelDoll/tree/v0.1.0).** Spike outputs (`spikes/api/out/`), test
screenshots (`testing/img/`), design screenshots (`design/screenshots/`) and the D2 mockup app (`design-mockups/`) are no longer
tracked on `main`; links in these docs point to the tag. README images: [media/](media/).

**Superseded** marks a result that later work replaced. The doc is still accurate as a record of what was tested.
[architecture.md §4.3](architecture.md) lists every replaced route.

## Spec

| Doc | What |
|---|---|
| [architecture.md](architecture.md) | v1.3: allowed models (D8), rig contract, item pipeline (chroma mannequin + skeleton-posed keyframe, 96 px held items), slots and z ladder, colour model, queue/storage/key, cost model, risks. |
| [manifest-spec.md](manifest-spec.md) | `pixeldoll/1` manifest v1.3.1: TypeScript types, invariants checked before export, example, zip layout, per-engine mapping. |
| [user-guide.md](user-guide.md) | The Studio in plain language. |

## Research (R1–R5, 2026-10-20)

| Doc | What |
|---|---|
| R1 [pixellab_pip_paperdolling_review.md](research/tools/pixellab_pip/pixellab_pip_paperdolling_review.md) | What the `pixellab-pip` skill and earlier paperdoll spikes offer PixelDoll. |
| R2 [pixellab_current_capabilities_2026-10.md](research/pixellab/pixellab_current_capabilities_2026-10.md) | PixelLab API as of 2026-10: endpoints, frame caps per size, CORS, costs. Corrects the two older PixelLab docs below. |
| R3 [engine_paperdolling_implementation.md](research/engines/engine_paperdolling_implementation.md) | How Godot, Unity and Phaser do layered frame paperdolls: one sprite per layer, same grid, one clock. |
| R4 [games_paperdolling_survey.md](research/games/games_paperdolling_survey.md) | How shipped games layer characters (UO, LPC, Tibia, RO, MapleStory, Stardew, …). |
| R4 [ultima_online_paperdolling_verification.md](research/games/ultima_online/ultima_online_paperdolling_verification.md) | UO facts checked against ClassicUO source, with corrections. |
| R5 [paperdoll_tools_survey.md](research/tools/paperdoll_tools_survey.md) | Paperdoll and character-creator tools: data models and UX to copy. |
| R5 [fralonra_paperdoll_review.md](research/tools/fralonra/fralonra_paperdoll_review.md), [lpc_generator_review.md](research/tools/lpc/lpc_generator_review.md) | Code reviews of fralonra/paperdoll and the Universal LPC generator. |
| [SHARED_NOTES.md](research/SHARED_NOTES.md) | Append-only cross-agent findings. |
| [pixellab-openapi-v2.json](research/pixellab/pixellab-openapi-v2.json) | PixelLab REST v2 OpenAPI snapshot (102 paths). |
| [Shared equipment designs with fitted copies](research/shared-equipment-fitted-copies-plan.md) | Proposed local design library, exact compatible reuse, reviewed target fitting, API qualification, palette ownership and implementation milestones. Planning only. |

Older inputs, kept for history:

- [pixellab-first_paperdolling_frame-based_2d_rpgs.md](research/pixellab/pixellab-first_paperdolling_frame-based_2d_rpgs.md): **outdated**, see R2.
- [proper_paperdolling_in_pixellab.md](research/pixellab/proper_paperdolling_in_pixellab.md): **not about pixellab.ai.** It
  covers the Android "PixelLab – Text on pictures" app.
- [ultima_online_paperdolling.md](research/games/ultima_online/ultima_online_paperdolling.md): **partly wrong**, see the R4 verification.
- [fralonra_paperdoll_inspiration.md](research/tools/fralonra/fralonra_paperdoll_inspiration.md): raw notes and links.

## Live spikes (S1–S5)

Code: `spikes/api/`. Evidence: [`spikes/api/out/` at v0.1.0](https://github.com/Shilo/PixelDoll/tree/v0.1.0/spikes/api/out).

| Doc | Conclusion |
|---|---|
| [S1 API feasibility](spikes/S1_api_feasibility.md) | Edit base → local diff → layer works only with slot masking. Batch edits keep the design but redraw the body. **Superseded:** the diff route is now a fallback only (D3). Its template animations are banned (D8). |
| [S2 clean layers](spikes/S2_clean_layers.md) | The chroma mannequin (base recoloured to a key ramp, then dressed) gives clean layers. **Superseded in part:** `edit-animation-v2` over all cells is no longer the primary route. It now dresses only the 3 rest views (S3/S4). |
| [S3 skeleton rigging](spikes/S3_skeleton_rigging.md) | Skeleton-v3 is the rig. Posing a dressed keyframe with the base's keypoints gives pixel-aligned item frames for every move. |
| [S4 model routing](spikes/S4_model_routing.md) | Under D8: base = `create-character-v3` 48 px padded to 64. Items = dress the rest views (Pro `edit-animation-v2`), then pose them with raw skeleton-v3. Its §Q4 routing table is authoritative. |
| [S5 held items](spikes/S5_held_items.md) | Weapons use a 96 px oversize canvas with the same pivot, and slash frame 0 is sent last. The direction gate catches flips. `inpaint-v3` works but costs too much as the default. |

## Design (D1, D2)

| Doc | What |
|---|---|
| [D1_design_research.md](design/D1_design_research.md) | User flows for casual users, information architecture, look candidates A–E. |
| [glasskit_review.md](design/glasskit_review.md) | GlassKit as a theme base (look B): reviewed and not chosen. |
| [D2_mockups_report.md](design/D2_mockups_report.md) | The `design-mockups/` app: looks A–E in dark and light. The user chose **look A only**, dark by default (D9). |
| [Screenshot gallery](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/design/screenshots/README.md) | Every look, screen and device (`<look>_<scheme>_<screen>_<device>.png`). Grid view: [index.html](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/design/screenshots/index.html) (open from a checkout of the tag). |

## Testing reports

Screenshots for all reports: [`testing/img/` at v0.1.0](https://github.com/Shilo/PixelDoll/tree/v0.1.0/docs/testing/img) (bare `img/...` paths in the reports refer to it). Engine harnesses: `testing/m5_engine_tests/`, `testing/b8_engine_tests/`.

| Doc | What |
|---|---|
| [Toolchain standardization](testing/toolchain-standardization-2026-10-22.md) | Exact runtime/dependencies, Vitest and Playwright migration, production byte parity and validation. |
| [Character import compatibility](testing/character-import-compatibility-2026-10-22.md) | Actual PixelLab raw/default ZIPs, format boundaries, pagination, Cancel regression and shared-equipment planning. |
| [Equipment QA summaries](testing/qa-summaries-2026-10-22.md) | Current-clip aggregate checks, persisted replacements/export, historical coverage labels and runner pin. |
| [M1](testing/M1_report.md) | Key + job queue: resume after reload, IndexedDB ledger. |
| [M2](testing/M2_report.md) | Rig freeze: normalize, pivot, mirror, anchors, `baseHash`. Built for template frames, later updated by B7. |
| [M3](testing/M3_report.md) | Item lab: chroma extraction, QA gates G1–G10, automatic re-roll, fg/bg split. |
| [M4](testing/M4_report.md) | Dress-up: z ladder, hides, exact ramp recolour, presets. |
| [M5](testing/M5_report.md) | Export round trip: Godot 4.7.1 and Phaser 3.80/3.90/4.2.1 pixel-identical. Unity compile-only. |
| [MVP (B6)](testing/MVP_report.md) | First Studio UI (look A) on the M1–M5 libraries. |
| [B7](testing/B7_rig_v13_report.md) | Rig v1.3 in the Studio (skeleton-v3 clips + keypoints), Add a move, cross-tab queue lock. |
| [B8](testing/B8_oversize_export_report.md) | Oversize (96 px) layers in compose and export, verified in the engines. |
| [B9](testing/B9_held_items_report.md) | Held-item route in the Studio, streak cleanup, authored idle. |
| [B10](testing/B10_ux_fixes_report.md) | T1 P1/P2 UX fixes and the e2e smoke test. |
| [T1](testing/T1_ux_qa_report.md) | Independent UX/QA review: 6/10, P0–P2 list. |
| [T2](testing/T2_final_regression_report.md) | Final regression: every T1 item passes, 8.5/10. |
| T3, B11 | In progress: full item coverage (T3) and a layered `.aseprite` export (B11). |
