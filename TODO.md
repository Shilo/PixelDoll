# PixelDoll — TODO

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked/risk

## Phase 0 — Setup
- [x] Survey repo, research docs, pixellab-pip
- [x] Verify PixelLab REST v2 CORS for GitHub Pages origin
- [x] Save OpenAPI v2 spec locally
- [x] PLAN.md / TODO.md

## Phase 1 — Research
- [~] R1 pixellab-pip paperdolling review
- [~] R2 PixelLab current capabilities + correct stale docs
- [~] R3 Engine implementation patterns
- [~] R4 Games survey (incl. Ultima Online verification)
- [~] R5 Paperdoll tools survey (fralonra/paperdoll checkout + review)

## Phase 2 — API feasibility spike (live)
- [~] S1 base character → animation → equipment edit → diff extraction → QA metrics

## Phase 3 — Synthesis
- [ ] Architecture doc
- [ ] Manifest / export spec
- [ ] Mockup scope list

## Phase 4 — Mockups
- [ ] TBD after synthesis

## Phase 5 — Testing
- [ ] TBD

## Risks
- [!] PixelLab edits may redraw base pixels → diff picks up body drift
- [!] Occlusion: items behind body (capes, back weapons) only partially visible per frame
- [!] Temporal consistency of equipment across animation frames
- [!] Base body swap: layers extracted against body A won't fit body B
