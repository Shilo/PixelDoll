# PixelDoll — TODO

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked/risk

## Phase 0 — Setup
- [x] Survey repo, research docs, pixellab-pip
- [x] Verify PixelLab REST v2 CORS for GitHub Pages origin
- [x] Save OpenAPI v2 spec locally
- [x] PLAN.md / TODO.md

## Phase 1 — Research
- [x] R1 pixellab-pip paperdolling review
- [x] R2 PixelLab current capabilities + correct stale docs
- [x] R3 Engine implementation patterns
- [x] R4 Games survey (incl. Ultima Online verification)
- [x] R5 Paperdoll tools survey (fralonra/paperdoll + LPC generator checkouts)

## Phase 2 — Live API spikes
- [x] S1 feasibility: base → animation → item edit → diff extraction → QA (`docs/spikes/S1_api_feasibility.md`)
- [x] S2 clean layers: chroma mannequin (`docs/spikes/S2_clean_layers.md`)
- [x] S3 skeleton-v3 rigging + skeleton-posed items (`docs/spikes/S3_skeleton_rigging.md`)
- [x] S4 allowed-model routing + editor benchmark (`docs/spikes/S4_model_routing.md`)
- [~] S5 held items: oversize canvas, grip anchoring, direction-consistency gate (≤200 gens)

## Phase 3 — Synthesis
- [x] Architecture v1.1 (`docs/architecture.md`)
- [x] Manifest / export spec (`docs/manifest-spec.md`)
- [x] Mockup scope M1–M5 (architecture §14)

## Phase 4 — Mockups (`app/`, Svelte 5 + Vite 8 + TS)
- [x] Scaffold + foundation (PixelLab client, job queue, IndexedDB, zip, png, hash)
- [x] M1 Key + queue (live-tested, `docs/testing/M1_report.md`)
- [x] M2 Rig freeze (normalize, pivot, mirror, skeleton, anchors, baseHash)
- [ ] M2 v1.3: build skeleton-v3 clips (rest views + keypoints stored, raw re-render), floor padding x+8/y+12
- [x] M3 Item lab (chroma extraction, ea2-anchor + skeleton-pose routes, QA G1–G10, fg/bg split)
- [x] M4 Dress-up (z ladder, hides, exact ramp recolour, presets)
- [x] M5 Export round-trip (Godot + Phaser pixel-identical; Unity compile-only)

## Phase 5 — Testing
- [ ] End-to-end browser test: base → 5 items → dress-up → export
- [ ] Load export in Godot 4 / Phaser page; verify sync + pivots

## Deferred
- [ ] Unity export live verification (needs Unity Hub sign-in; C# compiles) — deferred by user 2026-10-20

## Quality bar (user, 2026-10-20)
Paperdoll output must be accurate, consistent, high quality, using proper PixelLab tooling, proper skeleton rigging,
proper post-processing and proper layering — frontier-standard paperdolling workflow.

## Deferred — theming (user, 2026-10-21)
- [ ] Theming support (token-based themes switchable at runtime)
- [ ] "Paper" theme inspired by look D: modern, clean, paper-like surfaces; may be playful but must read as paper (brand)

## Phase 6 — Design & MVP (after Phases 2–5 are done)
- [x] Design brainstorm with agents (user flows for casual users, information architecture, Apple-style simplicity)
- [x] Theme brainstorm: minimalistic, modern, professional, intuitive candidates
- [x] Evaluate GlassKit (https://glasskit.jungherz.com/, https://github.com/JUNGHERZ/GlassKit) as one theme option
- [x] Build multiple design/theme/interface mockups and deliver screenshots to user (desktop + mobile)
- [x] Choose framework (Svelte 5, not SvelteKit; Vite 8; TS) — user chose look **A only** (not A+E), dark default + light
      switcher, mature icon library (Lucide), no pixel fonts/icons
- [ ] Implement first real MVP app: Apple-like ease of use, minimal, responsive for all resolutions/orientations (desktop + mobile)
- [ ] Test MVP thoroughly: design, layout, functionality, intuitiveness for casual users (desktop + mobile, portrait + landscape)

## Risks
- [!] Held items (sword) fail QA: clipping at cell bottom, arm drift, east flips → S5
- [!] Direction-consistency: helmet visor drawn on a back view (north slash) — no gate catches it → S5 H4
- [!] PixelLab balance ~1265 gens (2026-10-21) — spend economically
- [!] Base body swap invalidates layers (`baseHash` stale detection)
- [!] Template-animation jobs report USD cost only; per-job cost may understate
