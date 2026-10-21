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
- [x] S5 held items: 96 px oversize canvas + skeleton pose, frame-0-last, direction gate (`docs/spikes/S5_held_items.md`)

## Phase 3 — Synthesis
- [x] Architecture v1.3 (`docs/architecture.md`)
- [x] Manifest / export spec v1.3.1 incl. per-layer cell/pivot (`docs/manifest-spec.md`)
- [x] Mockup scope M1–M5 (architecture §14)

## Phase 4 — Mockups (`app/`, Svelte 5 + Vite 8 + TS)
- [x] Scaffold + foundation (PixelLab client, job queue, IndexedDB, zip, png, hash)
- [x] M1 Key + queue (live-tested, `docs/testing/M1_report.md`)
- [x] M2 Rig freeze (normalize, pivot, mirror, skeleton, anchors, baseHash)
- [x] Rig v1.3: skeleton-v3 clips with stored keypoints, floor padding x+8/y+12, authored idle, add-a-move (B7/B9)
- [x] Held items 96 px route + oversize export (B8/B9); cross-tab queue lock (B7)
- [x] M3 Item lab (chroma extraction, ea2-anchor + skeleton-pose routes, QA G1–G10, fg/bg split)
- [x] M4 Dress-up (z ladder, hides, exact ramp recolour, presets)
- [x] M5 Export round-trip (Godot + Phaser pixel-identical; Unity compile-only)

## Phase 5 — Testing
- [x] End-to-end: Studio Ranger → helmet + sword → slash → Godot export pixel-identical (B7/B9)
- [x] Godot 4.7.1 + Phaser 3.80/3.90/4.2.1 verified pixel-identical incl. oversize layers (M5/B8/B9)

## Phase 7 — Hardening (2026-10-21)
- [~] T3 full item coverage: hair, cape, chest, boots, legs × idle/walk/slash/hurt × S/E/N/W (≤220 gens, user-approved)
- [~] B11 layered .aseprite export (verified with Aseprite CLI) + Godot CREDITS.csv warning fix
- [~] B12 root README, docs index, user guide, GitHub Pages workflow (no push), repo hygiene
- [~] R6 code/security/over-engineering review (report only)
- [ ] After T3/R6: offline banner, 4/8-direction + 48/56 px options in Create, shirt/shorts colour regions, R6 fixes

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
- [x] Implement first real MVP Studio (look A, dark default, Lucide, responsive) — B6, fixes B10
- [x] Independent UX QA T1 (P0 fixed by PM, P1/P2 by B10)
- [x] Final regression T2 (all T1 items pass, live add-a-move, dev rigs hidden, keyboard nav) — score 8.5/10
- [x] Background-tab throttling: queue ticks from a Worker timer

## Risks
- [!] PixelLab balance ≈923 gens (2026-10-21) — spend economically
- [!] Shields (off_hand) untested; helmet south-slash frame flagged when forearm covers visor
- [!] Base body swap invalidates layers (`baseHash` stale detection)
- [ ] Next: hair/cape/chest/boots/legs on skeleton-pose across a full 3-dir × 4-clip set (O11)
- [ ] Next: shields (off_hand) live test; reduce 'Needs a look' rate on action moves (smear on hurt/slash frames)
- [ ] Next: separate base colour regions (shirt vs shorts) for independent recolour
- [ ] Next: offline banner; 48 vs 56 px base option (O14); 4/8-direction choice in Create
- [ ] Next: GitHub Pages deploy workflow
