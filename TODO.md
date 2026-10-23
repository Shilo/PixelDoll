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
3. [ ] **Unity native engine verification — blocked (2026-10-23).** Unity Editor 6000.4.0f1 is installed, but has no
      activated license; the batch-mode attempt exited 198. Missing prerequisite: an activated compatible Unity Editor
      (Unity Hub sign-in/license setup by the user). Existing generated-C# compilation against installed assemblies and
      official Sprite interfaces, plus JSON/structural tests, do not establish actual Editor import or runtime correctness.
      Before calling the Unity export fully verified, import a fresh exported character into a real Unity project with
      the required 2D Sprite package, compile without errors, and verify generated sprites, pivots, prefab and Animator.
      Run rendered assertions for playlist timing/repeated cells/nonlooping playback, synchronized layers, oversized
      alignment, equipment/hides/tucking/per-cell depth, source/default/linked/preset palettes, fractional pixels-per-unit
      and independent characters. Reimport must preserve existing asset references; a standalone player build must retain
      all equipment resources and pass the same runtime checks. Record Editor/package versions, commands and results in
      [export verification](docs/testing/export-challenge-2026-10-23.md) before marking this complete.
4. [ ] Mirrored directions keep handedness: expose `mirror: "generate"` per item (west/back-diagonals generated, not flipped)
5. [ ] Restore real offline-queue coverage (stack audit 2026-10-22, since c11113f): the studio demo now runs on the
      production preview, where the dev-only `window.__queue`/`__studio` hooks are absent, so its queue-pause/resume and
      selection checks pass vacuously. Fix: a `studio-dev` Playwright project rerunning `studio demo:` on `devURL`
      (verified locally: a wrong queue expectation then fails on dev while production still passes).
6. [ ] Test hardening (low, same audit): the B17 agent-mode branch in `studio.spec.ts` is dead under `agentKey='off'`
      (add `blockApi(c)`; delete or document the branch); pin the self-test group names so a deleted group fails.

Physical-phone testing is out of scope by user decision (2026-10-22). The live site passed the keyless Studio regression
in Edge, including emulated phone portrait/landscape and tablet layouts; no physical-device or real-key claim.

## Concerns
- [!] **Key safety on a shared origin.** All `*.github.io/<repo>` sites of one account share an origin, so another of your
  Pages sites could read a remembered key (localStorage/IndexedDB). Mitigated: key is memory-only by default, never sent
  over BroadcastChannel, Connect warns on `*.github.io`. Fix: serve from a custom domain. (R6 P1-4, B13)
- [!] **PixelLab credits.** Balance ≈212 gens (2026-10-22), after the 99-generation shield test. A full 4-dir character
  ≈35–50 gens, an item ≈28–50 gens, a move ≈11 + items. Paid POSTs are never auto-resent; failed ones show as "lost".
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
- [!] **Mirrored directions flip handedness** (west holds the sword in the left hand). `mirror: "generate"` per item is
  specified but not exposed in the UI.
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
- [ ] **Native Unreal Engine export (2026-10-23).** Paper2D supports native Sprites/Flipbooks, but image descriptors alone
      do not implement a swappable paperdoll. A complete target needs an Editor importer plus a Blueprint-callable
      Actor/component for shared timing, equipment/hides/tucking, per-frame ordering, oversize pivots and exact palette
      materials/textures. Binary `.uasset` generation from the browser is not a portable substitute for that importer.
      No runnable Unreal Editor is installed here (the old UE 5.1 registration points to a missing directory), so native
      import, rendering and cooked-build dependency retention cannot currently be verified. Defer the public export
      option until the plugin/runtime exists and passes those engine tests. See [native export concerns and scope](docs/research/native-export-expansion-2026-10-23.md#unreal-possible-but-not-currently-implemented).
- [ ] **Native GameMaker export (2026-10-23).** Deferred because the user will not install the runtime needed for actual
      engine verification. Do not advertise a GameMaker target based on PNG strips or ProjectTool validation alone.
      Future scope: native `.yyp`/`.yy` resources or `.yymps`, reusable GML paperdoll runtime, sprite origins, shared timing,
      equipment/hides/tucking/z order and exact owner-local palettes. Acceptance requires Igor compile/run and rendered
      alignment/timing/outfit assertions. Official IDE 2026.0.0.16 / ProjectTool 2024.14.165 were inspected; matching runtime
      2026.0.0.23 is absent. See [native export expansion](docs/research/native-export-expansion-2026-10-23.md).
- [ ] PWA and final-origin decision (custom domain vs shilo.github.io/PixelDoll/); retain the plan above for later
- [ ] Theming support (token-based themes switchable at runtime)
- [ ] "Paper" theme inspired by look D: modern, clean, paper-like surfaces; may be playful but must read as paper (brand)

## Quality bar (user, 2026-10-20)
Paperdoll output must be accurate, consistent, high quality, using proper PixelLab tooling, proper skeleton rigging,
proper post-processing and proper layering — frontier-standard paperdolling workflow.

## Done
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
