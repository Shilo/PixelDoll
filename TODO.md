# PixelDoll — TODO & Concerns

The single list of open work and known concerns. New agents: read `AGENTS.md` first, then `PLAN.md` (status, roadmap,
decisions). Done history is at the bottom.
Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` concern

## Next up (in order)
1. [ ] Shield quality: two east-walk drafts still need visual acceptance or targeted artwork correction. Offline
      occlusion and joint/centroid audits are complete; no safe automatic pixel repair is supported by the evidence
      ([follow-up](docs/testing/item-quality-follow-up-2026-10-22.md)). Keep both drafts unaccepted.
2. [ ] Item quality polish: stored cape back-hem grey smudges and actual helmet hurt-frame deformations. The forearm
      occlusion false H4 retry is fixed; D1 already detects the smudged cape design, but existing art is not recoloured.
3. [ ] Unity export live verification (needs Unity Hub sign-in; C# already compiles)
4. [!] Independent attack quality is not accepted. The four-direction Slash executed successfully ($0.582, no unknown
      outcomes), but both raw west sword rolls contain duplicate/ghost blades, and east/west body adherence retains
      2.77/2.10px failures. Keep this artifact flagged; engine pixel fidelity does not make it good artwork. The item
      runner's worse-last-roll selection bug is fixed, and Export now discloses saved failures. The separate idle sword
      passed reload, keyless ZIP reimport and Godot/Phaser/Aseprite preservation with west grip ambiguity retained.
      The earlier full idle+walk creation also remains failed on two unknown estimator HTTP500 responses; no automatic
      resend occurred. Older mirrored attacks need new body artwork, not an item-only toggle. See the
      [implementation scope](docs/research/handedness-implementation-scope-2026-10-22.md).

Physical-phone testing is out of scope by user decision (2026-10-22). The live site passed the keyless Studio regression
in Edge, including emulated phone portrait/landscape and tablet layouts; no physical-device or real-key claim.

## Concerns
- [!] **Key safety on a shared origin.** All `*.github.io/<repo>` sites of one account share an origin, so another of your
  Pages sites could read a remembered key (localStorage/IndexedDB). Mitigated: key is memory-only by default, never sent
  over BroadcastChannel, Connect warns on `*.github.io`. Fix: serve from a custom domain. (R6 P1-4, B13)
- [!] **PixelLab credits.** The shared balance changed during live audit testing; query it before further paid work.
  New independent characters are estimated at 46–80 gens (4 directions) or 90–150 (8); optional mirrored economy mode
  remains 35–60 / 57–95. Item/move estimates depend on route and coverage. Some calls bill dollars; estimates are not caps.
  Lost responses may have run or charged and are never auto-resent. See the professional audit report.
- [!] **Shield east walks remain unresolved.** The offline body-occlusion audit converts five of seven hard flags to
  explicit review warnings. The 4-direction east walk still fails G5 (area CV 0.284 > 0.186), and the 8-direction east
  walk still fails G9 (68° against the forearm). Hidden shape cannot be verified from a composite; warnings do not mean
  acceptance. Inspect saved grip/orientation evidence before more paid retries. See `docs/testing/shields-2026-10-22.md`.
- [!] **Generation is not bit-repeatable.** Same request + seed ≠ same pixels → base frames are frozen and never
  regenerated; changing the base (`baseHash`) makes existing items stale.
- [!] **Historical item QA.** New move summaries update correctly on additions/replacements. Older saved items lack
  replaceable checks; after an edit they stay marked for review, with an explicit incomplete-check notice. Retained
  historical totals may omit old additions or include replaced frames until all older coverage is replaced. No paid
  recheck or silent reconstruction is performed. Historical source-call indices are also left untouched.
- [!] **Garment regions use a 1/255 blue nudge** to keep shirt/shorts colours disjoint (D10). Invisible, but it alters
  PixelLab pixels; upgrade path = per-layer region mask in the manifest.
- [!] **Mirrored directions flip handedness** (west holds the sword in the left hand). New forms now default to independent
  body views/actions; old projects and optional economy mode remain mirrored. Independent views avoid the forced flip,
  but generated anatomy and grip still need review: idle sword retains west-profile ambiguity and slash execution completed but failed artwork acceptance (west duplicate weapon and east/west pose flags). An item-only toggle cannot repair old flipped actions.
- [!] **Unity and Godot Aseprite Wizard paths unverified**; Godot 4.7.1 + Phaser 3.80/3.90/4.2.1 + Aseprite CLI verified.
- [!] **Agent-only key mode is a convention.** `npm run dev:agent` reads `.env` for AI agents; humans must use `npm run dev`
  (no key path). Builds refuse agent mode; CI guard fails if key code or `.env` reaches `dist/`.
- [!] **Releasing.** Bump `app/package.json` version, annotated tag `vX.Y.Z`, `gh release create`; CI deploys `main`.
- [!] **PixelLab API drift.** Template list, prices and Pro/Pro Flash behaviour change; the OpenAPI snapshot in
  `docs/research/pixellab/` is from 2026-10-20.

## PWA (deferred by user, 2026-10-22 — PLAN.md "PWA")
- [ ] Final origin decided first (custom domain vs shilo.github.io/PixelDoll/)
- [ ] Manifest: name, icons 192/512 + maskable 512, theme/background = dark `--bg`, start_url/scope `./`
- [ ] Service worker: precache shell + hashed assets + demo fixtures; never cache PixelLab API/images or the key
- [ ] Update flow: "New version available — Reload" (skipWaiting only on user accept), delete old caches
- [ ] Offline: shell from cache; existing offline banner + queue pause unchanged
- [ ] Install: `beforeinstallprompt` menu item (Chromium), iOS Add-to-Home-Screen hint, apple-touch-icon, theme-color meta
- [ ] CSP: add `worker-src 'self'` and `manifest-src 'self'`
- [ ] Tests: Lighthouse PWA, offline reload, update flow, install on desktop/Android/iOS, scope under /PixelDoll/,
      CI guard on the precache list

## Deferred (user)
- [ ] PWA and final-origin decision (custom domain vs shilo.github.io/PixelDoll/); retain the plan above for later
- [ ] Theming support (token-based themes switchable at runtime)
- [ ] "Paper" theme inspired by look D: modern, clean, paper-like surfaces; may be playful but must read as paper (brand)

## Quality bar (user, 2026-10-20)
Paperdoll output must be accurate, consistent, high quality, using proper PixelLab tooling, proper skeleton rigging,
proper post-processing and proper layering — frontier-standard paperdolling workflow.

## Done
- [x] Independent direction policy implemented for new forms, including explicit western originals/actions, strict frozen
      direction coverage, 4/8-view costs and mirrored-economy disclosure. Missing policy in saved drafts retains legacy
      behavior. Offline/browser/export regressions pass; live handedness acceptance remains open above.
- [x] Professional audit: independent primary-source research and adversarial pipeline/data/Studio review; credential
      isolation, paid resume/lifecycle safety, import bounds, atomic persistence, fitted move invalidation, colour-faithful
      engine exports and recoverable responsive Studio workflows. See [audit evidence](docs/testing/professional-audit-2026-10-22.md).
- [x] Replaceable move/direction QA summaries, accepted-exception handling, complete-frame guards, real IndexedDB/ZIP
      browser regression and Codex browser inspection; adversarial review findings independently verified and fixed.
      Both CI jobs pinned to `ubuntu-24.04`. See `docs/testing/qa-summaries-2026-10-22.md`.
- [x] Saved shield trajectory audit; forearm-covered helmet review path with adversarial regression; cape D1 evidence;
      selected-source provenance mapping for appended/batched/grid move cells, with offline persistence regressions.
- [x] Offline shield occlusion audit on all 96 saved frames, zero credits: body-explainable size/shape flags require
      visual review, visible mismatches retain hard failures; Codex browser checks and adversarial review completed.
- [x] Codex browser shield/Studio checks and adversarial sub-agent review; independently reproduced and fixed the tiny-item G9 regression (40 offline tests).
- [x] Shield live smoke test: idle/walk on 4- and 8-direction rigs, 99 gens; all 96 generated frames aligned, exports
      validated. Round-mask false rotation failures fixed; remaining walk/occlusion flags are tracked above.
- [x] Research R1–R5 (pixellab-pip, PixelLab online, engines, games incl. Ultima Online, paperdoll tools)
- [x] Live spikes S1–S5 (diff extraction → chroma mannequin → skeleton-v3 rig → allowed-model routing → held items)
- [x] Architecture v1.3 + manifest/export spec v1.3.1
- [x] Mockups M1–M5 (key/queue, rig, item lab, dress-up, export) — dev-only, excluded from production
- [x] Design research + six looks with screenshots; user chose look A, dark default, Lucide
- [x] Studio (responsive desktop/tablet/phone/landscape) + UX QA T1/T2 (6 → 8.5/10)
- [x] Hardening: full item coverage (hair, cape, chest, trousers, boots × idle/walk/slash/hurt × 4 dirs), inpaint-v3
      per-clip fallback, hair tucked under helmets, 4/8 directions + 48/56 px, shirt/shorts regions, offline pause,
      8-direction held items, layered .aseprite export, R6 robustness/security fixes
- [x] Exports verified pixel-identical: Godot 4.7.1, Phaser 3.80/3.90/4.2.1, Aseprite CLI
- [x] Docs: README, docs index, user guide, MIT LICENSE
- [x] Agent-only key mode (`npm run dev:agent`); no key path for humans or builds; CI + Pages workflow with dist guard
- [x] v0.1.0 tag + GitHub release; repo public (MIT); Pages live; 20 topics + description
- [x] Repo cleanup (B18): evidence media + design-mockups untracked (kept at tag v0.1.0, links retargeted), dev-only fixtures in `app/dev-fixtures/` (dist ships s2 only), Playwright an app devDependency, README gallery in `docs/media/`
