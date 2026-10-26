# PixelDoll docs index

Start with [architecture.md](architecture.md) (v1.3, current pipeline) and [manifest-spec.md](manifest-spec.md) (export
format). Project state and decisions D1–D17: [PLAN.md](../PLAN.md). Open work: the [board](https://github.com/users/Shilo/projects/7); accepted limits: [known-issues.md](known-issues.md). Casual users: [user-guide.md](user-guide.md).

**Evidence media lives at commit [1f95029](https://github.com/Shilo/PixelDoll/tree/1f950291f90d43f5c6f27572445664f757f5716e).** Spike outputs (`spikes/api/out/`), test
screenshots (`testing/img/`), design screenshots (`design/screenshots/`) and the D2 mockup app (`design-mockups/`) are no longer
tracked on `main`; links in these docs point to that commit. README images: [media/](media/).

**Superseded** marks a result that later work replaced. The doc is still accurate as a record of what was tested.
[architecture.md §4.3](architecture.md) lists every replaced route.

## Character creator redesign and production integration

**Current accepted direction: [Obsidian / Porcelain Bronze](design/2026-10-22-redesign/round-4-discussion/current-design.md).** Source-verified creator workflow; exact unlit sprites; Preview/Top-down/Side-scroller; continuous movement with animation/direction fallbacks; contextual toasts; one-line prompt expansion; and a dynamic mobile joystick. This record supersedes incompatible earlier proposals. [Full desktop/mobile image mockups](design/2026-10-22-redesign/round-5-mockups/image-index.md) are complete: 32 screens and four overview boards. The [isolated playable proof](design/2026-10-22-redesign/round-6-prototype/README.md) now tests screen switching, continuous movement, camera following, equipment, touch and reflections. The [production experience](design/production-experience.md) now integrates this direction with the real Studio workflows on the feature branch. [Direct mockup/live comparisons](design/2026-10-22-redesign/round-6-prototype/comparisons.md) document the readability refinement, south-facing list thumbnails and simplified Light/Dark action.

[Dynamic animation resolver](design/2026-10-22-redesign/round-4-discussion/animation-resolver.md): velocity-based state, nearest-direction mathematics, intended-versus-available coverage, fallback/notification rules, equipment synchronization and acceptance scenarios.

**Shared styling contract:** [Immersive design system](design/immersive-design-system.md) documents theme tokens, type, control states, paint overflow, reusable modules and Preview/live direction behavior for future integration.

**Production fidelity:** [Direct prototype parity review](design/production-prototype-parity.md) records corrected integration regressions, intentional production differences and the reproducible 40-pair desktop/mobile light/dark comparison matrix.

**Material study history:** [GlassKit evaluation](design/2026-10-22-redesign/round-6-prototype/glasskit-study.md) records the earlier selective adoption, baseline/rounded comparisons, independent review and accessibility/rendering checks. Bronze UI supersedes its active prototype styling.

**Current theme owner:** [Bronze UI](https://github.com/Shilo/bronze-ui) maintains the MIT package, [style guide](https://github.com/Shilo/bronze-ui/blob/main/docs/STYLE-GUIDE.md) and [standalone component showcase](https://shilo.github.io/bronze-ui/). The [round-six dependency integration](design/2026-10-22-redesign/round-6-prototype/bronze-integration.md) applies it to PixelDoll's playable prototype; the [production adapter](../app/src/studio/experience/theme.css) uses the same package without its document reset. The [round-seven lab](design/2026-10-22-redesign/round-7-theme/README.md) preserves historical source, app inventory, independent reviews and browser evidence. Its local theme and runners are frozen.

**Full-app theme recommendation history:** [Theme foundation and component/state catalog](design/2026-10-22-redesign/round-6-prototype/theme-foundation.md), with [independent challenge](design/2026-10-22-redesign/round-6-prototype/theme-foundation-review.md). Evaluates GlassKit CSS/Elements and defines coverage and parity gates. The active playable reference now consumes Bronze UI; earlier GlassKit source and captures remain historical evidence.

**Decision history and palette evidence:** [earlier direction review](design/2026-10-22-redesign/round-4-discussion/README.md), [decision log and corrections](design/2026-10-22-redesign/round-4-discussion/decisions-2026-10-23.md), [Bronze/Frost/Sage studies with exact demo sprites](design/2026-10-22-redesign/round-4-discussion/palette-studies/README.md). Bronze is selected; themes change background/UI only and optional reflection is code-only.

**Current imagery: [round three — immersive HD simulation worlds](design/2026-10-22-redesign/round-3/README.md).** Image-only design: 11 selected screenshots across three world directions, a shared customization/gameplay shell, desktop and phone selection/creation, research and continuous-gameplay requirements. Supersedes round two's visual recommendation; no production implementation. The direction review above corrects these images' outdated workflow labels and controls.

[Round two — pixel worlds and prototype stages](design/2026-10-22-redesign/round-2/README.md): six curated alternatives, desktop/phone selection, creation and customization, Asemulator-inspired future walking studies, source research and the updated Calibration Yard recommendation.

[Design review package](design/2026-10-22-redesign/README.md): current UI audit with 23 screenshots, research into 12 game families and two creator tools, three curated concepts, 18 desktop/mobile mockups, and an offline interactive prototype. The lead recommends Moonlit Camp. This is a new proposal; it does not replace the implemented design or prior decisions until adopted. Its screenshots are included alongside the proposal rather than in the historical tag.

## Current review handoffs and research

- [Claude redesign and Bronze UI review handoff](../.claude/handoffs/2026-10-23-161739-claude-redesign-and-bronze-ui-review.md): independent visual, interaction, accessibility and shared-theme audit brief.
- [Pre-Bronze/current comparison provenance](design/2026-10-22-redesign/round-6-prototype/pre-bronze-comparison.md): the correct historical baseline for reviewing the redesign.
- [Frame-repair and pipeline review index](reviews/README.md): preserved audit reports, repair concept source and verification script/result. These are recommendations, not completed production features.
- [Project repair workflow review](research/project-repair-workflow-review-2026-10-23.md) and [shared-token security review](research/shared-token-security-review-2026-10-23.md): dated research retained for follow-up; findings were not revalidated by repository cleanup. The [storage probe](research/token-storage-probe.mjs) uses synthetic pages/data and intercepts network requests.

Generated screenshots and prototype capture manifests remain local and ignored, together with their existing galleries. Cleanup preserves those files on disk. Source, handoffs, review notes and the compact repair verification record are versioned.

## Spec

| Doc | What |
|---|---|
| [architecture.md](architecture.md) | v1.3: allowed models (D8), rig contract, item pipeline (chroma mannequin + skeleton-posed keyframe, 96 px held items), slots and z ladder, color model, queue/storage/key, cost model, risks. |
| [manifest-spec.md](manifest-spec.md) | `pixeldoll/2` manifest with legacy `pixeldoll/1` reading: owner-local palettes, shared-copy lineage, source sheets, invariants, ZIP layout and per-engine mapping. |
| [user-guide.md](user-guide.md) | The Studio in plain language. |
| [pixellab-plans.md](pixellab-plans.md) | Editable tier limits, Free/Trial handling, and the plan requirements of the REST endpoints PixelDoll calls. |
| [agent-instructions.md](agent-instructions.md) | How to keep AGENTS.md short and effective: what belongs, how to word rules, how to verify an edit. |

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
| [bare-skin-base-wording-2026-10-25.md](research/bare-skin-base-wording-2026-10-25.md) | Wording for a fully bare base body that passes PixelLab's filter: every clause tried, garments per sex and seed, the ablation, the shipped prompt. |
| [lexingel-paperdoll-findings-round5-2026-10-25.md](research/lexingel-paperdoll-findings-round5-2026-10-25.md) | Lexingel's UO-style research, attack pipelines and Godot render route vs ours; round 5 tests: bare bases, small accessories, text-move facing. |
| [paperdoll-py-asset-review-2026-10-24.md](research/paperdoll-py-asset-review-2026-10-24.md) | External diff-extractor + state pipeline compared with ours: offline benchmark, what to adopt, bugs found. |
| [generation-quality-campaign-2026-10-25.md](research/generation-quality-campaign-2026-10-25.md) | Paid A/B campaign (909 gens, 2 bodies, blind judging): third chroma key, concept items via transfer-outfit-v2, rejected prompt variants. |
| [generation-pipeline-review-2026-10-25.md](research/generation-pipeline-review-2026-10-25.md) | Proposal: what the character and item call chains do today, owner concerns checked, Default-first creation, streaming, experiments to run. |
| [SHARED_NOTES.md](research/SHARED_NOTES.md) | Append-only cross-agent findings. |
| [pixellab-openapi-v2.json](research/pixellab/pixellab-openapi-v2.json) | PixelLab REST v2 OpenAPI snapshot (102 paths). |
| [Shared equipment designs with fitted copies](research/shared-equipment-fitted-copies-plan.md) | Agreed design and qualification plan; implemented local library, exact reuse and independent fitted copies. Paid fitting starts with an experimental single-material headwear route. |

Shared-system limits and follow-up tasks live in [shared-equipment cards on the board](https://github.com/users/Shilo/projects/7).
The research plan is broader than the delivered paid trial; the verification report records both accepted and rejected live results.

Older inputs, kept for history:

- [pixellab-first_paperdolling_frame-based_2d_rpgs.md](research/pixellab/pixellab-first_paperdolling_frame-based_2d_rpgs.md): **outdated**, see R2.
- [proper_paperdolling_in_pixellab.md](research/pixellab/proper_paperdolling_in_pixellab.md): **not about pixellab.ai.** It
  covers the Android "PixelLab – Text on pictures" app.
- [ultima_online_paperdolling.md](research/games/ultima_online/ultima_online_paperdolling.md): **partly wrong**, see the R4 verification.
- [fralonra_paperdoll_inspiration.md](research/tools/fralonra/fralonra_paperdoll_inspiration.md): raw notes and links.

## Live spikes (S1–S5)

Code: `spikes/api/`. Evidence: [`spikes/api/out/` at 1f95029](https://github.com/Shilo/PixelDoll/tree/1f950291f90d43f5c6f27572445664f757f5716e/spikes/api/out).

| Doc | Conclusion |
|---|---|
| [S1 API feasibility](spikes/S1_api_feasibility.md) | Edit base → local diff → layer works only with slot masking. Batch edits keep the design but redraw the body. **Superseded:** the diff route is now a fallback only (D3). Its template animations are banned (D8). |
| [S2 clean layers](spikes/S2_clean_layers.md) | The chroma mannequin (base recolored to a key ramp, then dressed) gives clean layers. **Superseded in part:** `edit-animation-v2` over all cells is no longer the primary route. It now dresses only the 3 rest views (S3/S4). |
| [S3 skeleton rigging](spikes/S3_skeleton_rigging.md) | Skeleton-v3 is the rig. Posing a dressed keyframe with the base's keypoints gives pixel-aligned item frames for every move. |
| [S4 model routing](spikes/S4_model_routing.md) | Under D8: base = `create-character-v3` 48 px padded to 64. Items = dress the rest views (Pro `edit-animation-v2`), then pose them with raw skeleton-v3. Its §Q4 routing table is authoritative. |
| [S5 held items](spikes/S5_held_items.md) | Weapons use a 96 px oversize canvas with the same pivot, and slash frame 0 is sent last. The direction gate catches flips. `inpaint-v3` works but costs too much as the default. |

## Design (D1, D2)

| Doc | What |
|---|---|
| [D1_design_research.md](design/D1_design_research.md) | User flows for casual users, information architecture, look candidates A–E. |
| [glasskit_review.md](design/glasskit_review.md) | GlassKit as a theme base (look B): reviewed and not chosen. |
| [D2_mockups_report.md](design/D2_mockups_report.md) | The `design-mockups/` app: looks A–E in dark and light. The user chose **look A only**, dark by default (D9). |
| [Screenshot gallery](https://github.com/Shilo/PixelDoll/blob/1f950291f90d43f5c6f27572445664f757f5716e/docs/design/screenshots/README.md) | Every look, screen and device (`<look>_<scheme>_<screen>_<device>.png`). Grid view: [index.html](https://github.com/Shilo/PixelDoll/blob/1f950291f90d43f5c6f27572445664f757f5716e/docs/design/screenshots/index.html) (open from a checkout of that commit). |

## Testing reports

Screenshots for all reports: [`testing/img/` at 1f95029](https://github.com/Shilo/PixelDoll/tree/1f950291f90d43f5c6f27572445664f757f5716e/docs/testing/img) (bare `img/...` paths in the reports refer to it). Engine harnesses: `testing/m5_engine_tests/`, `testing/b8_engine_tests/`.

| Doc | What |
|---|---|
| [Professional product audit](testing/professional-audit-2026-10-22.md) | Independent pipeline/data/Studio reviews, adversarial team challenges, fixes and fresh browser/live validation. |
| [Test performance](testing/test-performance.md) | Why unit and e2e runs are fast (parallel files, 16 one-worker CI shards), budgets and warning signs, anti-patterns that made them slow, rules for new tests. |
| [Toolchain standardization](testing/toolchain-standardization-2026-10-22.md) | Exact runtime/dependencies, Vitest and Playwright migration, production byte parity and validation. |
| [Replaceable item QA summaries](testing/qa-summaries-2026-10-22.md) | Move/direction aggregation, historical-check limits, offline browser/ZIP tests, adversarial review and CI runner pin. |
| [Character import compatibility](testing/character-import-compatibility-2026-10-22.md) | Actual PixelLab raw/default ZIPs, format boundaries, pagination, Cancel regression and shared-equipment planning. |
| [Shared equipment verification](testing/shared-equipment-2026-10-22.md) | Library/copy lifecycle, paid rest and animation reviews, independent palettes, new moves, adversarial fixes and real exported artifacts. |
| [M1](testing/M1_report.md) | Key + job queue: resume after reload, IndexedDB ledger. |
| [M2](testing/M2_report.md) | Rig freeze: normalize, pivot, mirror, anchors, `baseHash`. Built for template frames, later updated by B7. |
| [M3](testing/M3_report.md) | Item lab: chroma extraction, QA gates G1–G10, automatic re-roll, fg/bg split. |
| [M4](testing/M4_report.md) | Dress-up: z ladder, hides, exact ramp recolor, presets. |
| [M5](testing/M5_report.md) | Export round trip: Godot 4.7.1 and Phaser 3.80/3.90/4.2.1 pixel-identical. Unity compile-only. |
| [MVP (B6)](testing/MVP_report.md) | First Studio UI (look A) on the M1–M5 libraries. |
| [B7](testing/B7_rig_v13_report.md) | Rig v1.3 in the Studio (skeleton-v3 clips + keypoints), Add a move, cross-tab queue lock. |
| [B8](testing/B8_oversize_export_report.md) | Oversize (96 px) layers in compose and export, verified in the engines. |
| [B9](testing/B9_held_items_report.md) | Held-item route in the Studio, streak cleanup, authored idle. |
| [B10](testing/B10_ux_fixes_report.md) | T1 P1/P2 UX fixes and the e2e smoke test. |
| [T1](testing/T1_ux_qa_report.md) | Independent UX/QA review: 6/10, P0–P2 list. |
| [T2](testing/T2_final_regression_report.md) | Final regression: every T1 item passes, 8.5/10. |
| [T3](testing/T3_item_coverage_report.md), [B11](testing/B11_aseprite_export_report.md) | Full item coverage (T3) and a layered `.aseprite` export (B11). |
