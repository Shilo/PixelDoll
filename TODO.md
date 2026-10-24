# PixelDoll — TODO & Concerns

The single list of open work and known concerns. New agents: read `AGENTS.md` first, then `PLAN.md` (status, roadmap,
decisions). Done history is at the bottom.
Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` concern

## Assigned audit status

- [x] Professional audit and scoped Slash repair completed in the shared `codex/professional-audit` worktree
  through `f3faf84`. Integration with newer shared-equipment work is verified separately below. Includes adversarial
  team review, implemented fixes, actual artwork repair, visual/functional
  browser checks, editable ZIP roundtrip and engine verification. All 32 repaired Slash frames were reviewed;
  467 unit tests and 42 browser tests passed, with strict checks and the production build passing.
  Evidence and verification limits: [audit report](docs/testing/professional-audit-2026-10-22.md).
- [x] Free item colour matching completed and verified on the actual repaired project: 475 RGB-only corrections
  across 17 frames, preserving body/alpha/geometry, existing palettes, saved recolours and review warnings.

- [x] Reconciled the audit with newer main-branch shared-equipment and wardrobe changes. Integrated validation:
  521 unit tests across 53 files, 48 browser tests, strict checks and production credential guard pass. The audit
  checkout/branch are retired after the verified main update; deployment remains a separate release step below.

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
4. [ ] Complete a fresh independent four-direction idle + walk live validation. The previous full run stopped on
      two unknown `/estimate-skeleton` HTTP 500 outcomes. Preserve those records and never automatically resend them;
      distinguish a successful new full creation from the verified idle-only recovery and repaired Slash artifact.
5. [ ] Broader weapon validation: visually check independently generated eight-direction action clips and off-hand
      equipment. Existing automated coverage and the verified four-direction main-hand sword do not certify these cases.
6. [ ] Restore real offline-queue coverage (stack audit 2026-10-22, since c11113f): the studio demo now runs on the
      production preview, where the dev-only `window.__queue`/`__studio` hooks are absent, so its queue-pause/resume and
      selection checks pass vacuously. Fix: a `studio-dev` Playwright project rerunning `studio demo:` on `devURL`
      (verified locally: a wrong queue expectation then fails on dev while production still passes).
7. [ ] Test hardening (low, same audit): the B17 agent-mode branch in `studio.spec.ts` is dead under `agentKey='off'`
      (add `blockApi(c)`; delete or document the branch); pin the self-test group names so a deleted group fails.
8. [ ] Shared equipment fitting: improve the experimental headwear route and qualify broader support only with
      evidence. See [shared equipment remaining work](#shared-equipment-remaining-work); free compatible copying and
      the reviewed headwear trial are already implemented.
9. [ ] Deployment remains a separate release step after integration checks. Nothing from this audit was pushed
      or deployed; use the existing release/version/CI process when a release is authorized.

Physical-phone testing is out of scope by user decision (2026-10-22). The live site passed the keyless Studio regression
in Edge, including emulated phone portrait/landscape and tablet layouts; no physical-device or real-key claim.

## Frame Editor — planned, not implemented

The [unified editor plan](docs/design/frame-editor/README.md) includes character/body and item frames in one separate
embedded screen. Earlier equipment-only recommendations remain historical; the core release must include safe body
editing, not permanently defer it. All implementation work below is unstarted; detailed dependencies and acceptance
cases live in the [delivery plan](docs/design/frame-editor/delivery-plan.md).

- [ ] Run offline UX, coordinates/mirrors, draft/archive/conflict, body-fitting and palette/overlap spikes (E0/S1–S5).
- [ ] Implement immutable revisions, session drafts, Undo/recovery, all-writer checks and portable history (E1).
- [ ] Add the full-screen editor, explicit target/frame/scope, app appearance and safe return navigation (E2).
- [ ] Add body/item Move, Draw/Erase/source palette and reviewed all-wardrobe group alignment (E3).
- [ ] Add direct joint correction/rescue, body fitting review and honest preview/export/recovery states; verify the
      coherent local editor before release (E4). Preserve current structural guards and atomic publication safeguards.
- [ ] Qualify mapped PNG replacement, custom-colour ownership and other deliberate power tools (E5).
- [ ] Only when a later task needs it, qualify explicitly priced v3 pose candidates and optional IK in the same
      editor (E6/S6). No paid generation was requested or performed for the planning package.

## Concerns
- [!] **Merged bundle size.** The combined audit/shared-equipment build is 535.36 KB minified (180.56 KB gzip),
  crossing Vite's default 500 KB chunk warning. Profile startup before deciding whether shared-design UI should load
  on demand; keep the warning visible instead of raising the threshold. Build and credential guard still pass.
- [!] **Intentional shared-origin trust.** Every app on this origin may use the optional remembered `pixellabApiKey`.
  A compromise in any such app can expose it. Keep scripts and deployments trustworthy; app-generated channel notifications contain
  no token, and Forget clears cooperating open apps. Origin isolation and encryption are not part of the current UX.
- [!] **PixelLab credits.** The shared balance changed during live audit testing; query it before further paid work.
  New independent characters are estimated at 46–80 gens (4 directions) or 90–150 (8); optional mirrored economy mode
  remains 35–60 / 57–95. Item/move estimates depend on route and coverage. Some calls bill dollars; estimates are not caps.
  Lost responses may have run or charged and are never auto-resent. See the professional audit report.
- [!] **PixelLab credits and dollar billing.** The earlier ≈212-gen balance was a historical snapshot before later live
  work, not a current balance. Fitting records both reported generations and USD, including rejected attempts and explicit
  retries. A generation estimate is not a dollar spending cap. Three Cast body joint-measurement outcomes remain unknown;
  do not infer their charges from the shared account balance or resend their paid requests. See the
  [shared-equipment ledger and evidence](docs/testing/shared-equipment-2026-10-22.md).
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
  but generated anatomy and grip still need review: idle sword retains west-profile ambiguity; targeted Slash corrections pass manual review and body gates while retaining item review warnings. An item-only toggle cannot repair old flipped actions.
- [!] **Unity and Godot Aseprite Wizard paths unverified**; Godot 4.7.1 + Phaser 3.80/3.90/4.2.1 + Aseprite CLI verified.
- [!] **Agent-only key mode is a convention.** `npm run dev:agent` reads `.env` for AI agents; humans must use `npm run dev`
  (no key path). Builds refuse agent mode; CI guard fails if key code or `.env` reaches `dist/`.
- [!] **Releasing.** Bump `app/package.json` version, annotated tag `vX.Y.Z`, `gh release create`; CI deploys `main`.
- [!] **PixelLab API drift.** Template list, prices and Pro/Pro Flash behaviour change; the OpenAPI snapshot in
  `docs/research/pixellab/` is from 2026-10-20.

## Shared equipment remaining work

This is the canonical shared-system backlog, updated 2026-10-22. The [plan](docs/research/shared-equipment-fitted-copies-plan.md)
contains the original design and qualification proposals; the [verification report](docs/testing/shared-equipment-2026-10-22.md)
records what actually passed and failed. Items below distinguish missing capabilities from validation gaps.

### Current limits and priorities

- [ ] **SE1 — Improve headwear motion reliability (confirmed failed output).** The live Hurt extension produced visible
  helmet deformations on two cells; one explicitly paid retry still failed H4. Both attempts remain unaccepted.
  Investigate the source/target standing references and pose route using the saved evidence before further paid trials.
  A fix must preserve the design through the problematic poses and pass the existing hard gates and enlarged visual
  review. Do not loosen thresholds, conceal defects as occlusion, or add an automatic paid fallback.
- [ ] **SE2 — Qualify more source/target and motion combinations (validation gap).** Successful four-direction idle/walk
  fitting and one-direction Cast extension do not establish universal headwear compatibility. Add representative
  different head/body proportions, palettes and styles; include overhead arms, Hurt/death, occlusion, eight directions
  and independently generated west views. Extend regression fixtures with representative non-secret accepted/rejected
  evidence: current live artwork/contact sheets are ignored local files, not a committed reproducible test corpus.
  Record per-case calls, actual charges, raw pixels, checks and visual decisions before widening the supported claim.
- [ ] **SE3 — Add further paid fitting classes individually (not implemented).** Hair, face/body/leg/foot equipment,
  capes/back layers, held weapons/shields, multiple material roles and 96 px/split layers need their own validated routes.
  Test pivots, grip/handedness, front/back occlusion, palette-role mapping and independent recolouring. Other camera,
  template and cell-geometry profiles also need explicit qualification. Keep these cross-body paid routes disabled until
  their preflight, cost/review flow, extraction, quality gates and export round trip are demonstrated. Compatible free
  copies for supported layer contracts already work; this is not a request to regenerate those frames.
- [ ] **SE4 — Provide a reviewed recovery path for missing equipment references (not implemented).** Old imports may have
  wearable frames but no original dressed standing references; body rig setup cannot reconstruct those references.
  Today they retain old frames and need a remade item for future moves. Design an explicit, priced remake/reference
  workflow if added; never silently repaint old coverage or treat a composite containing unrelated gear as a clean
  reference. Incomplete body views remain a separate character setup/import limitation. Arbitrary PNG-folder/spritesheet
  ZIPs would require a user-confirmed layout mapper; they are not currently supported character import formats.
- [ ] **SE5 — Reconcile unknown paid outcomes where evidence permits (unresolved billing).** Investigate the three Cast
  joint-measurement submissions through existing API/account evidence if available. Record final usage only when
  confirmed; leave genuinely unrecoverable outcomes explicitly unknown. Keep their existing no-resend protection.
  A trustworthy USD preflight/cap would require reliable provider pricing/usage support; the current generation estimate
  must continue to be labelled as an estimate, with actual USD retained across failure, reload and manual retry.
- [ ] **SE6 — Exercise shared-copy exports in engines (validation gap).** All five export formats were generated and
  round-tripped offline; actual Godot ZIPs were independently inspected and reimported in the normal browser. That is
  not a new shared-copy runtime test in each engine. Verify independent palettes/default colourways, source-sheet use,
  sparse coverage warnings and subsequent moves in Godot, Phaser and Aseprite; Unity still needs the live verification
  listed above. Add oversize/multi-role cases when those paid routes are qualified, rather than claiming them now.

### Guardrails for follow-up work

Already implemented and to preserve: immutable pinned design snapshots; safe source/library deletion; independent
target materials/outfits; exact per-cell pixel/geometry proof for free copying; reuse of approved target rest references;
generation of only missing cells; palette normalization before fit planning; durable review and atomic wardrobe publication;
honest incomplete-measurement/provenance labels; and no automatic resubmission of uncertain paid requests.

"Shared" means this browser origin's local library plus portable design ZIPs. Character ZIPs carry their kept copies and
references; neither backup provides account/cloud sync. Clearing browser storage can lose unexported work. Cloud sync,
a public gallery and universal automatic retargeting are outside the implemented scope, not prerequisites for this feature.
Physical-device testing remains out of scope as noted above. Existing offline-queue coverage gaps in Next up remain open
despite the shared-equipment test suite passing.

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
- [ ] **Optional: persisted queue credential ownership (2026-10-23).** User explicitly deferred this account-switch
      edge case; no implementation is scheduled and it is not a release blocker. Open tabs keep their current account
      when another app changes the saved key, but reloading can attach an existing queue ledger to the replacement key.
      Revisit only if requested. Future scope: nonsecret ownership across enqueue, deduplication, recovery and polling;
      preserve accepted job IDs and keep unowned saved work separate instead of assigning it to another account.
      See [shared token contract](docs/shared-token-security.md).
- [ ] **Optional: reassess encryption of `pixellabApiKey` (2026-10-23).** Keep the token plaintext and shared with all
      apps on this origin, with Remember optional and no extra unlock step. A bundled encryption key or a locally saved
      automatic-decryption key would not protect against same-origin malicious scripts; a passphrase adds unwanted
      friction. Revisit only if a concrete threat model and convenient independent unlock mechanism (or provider-issued
      scoped credentials) justify it. No encryption work is scheduled.
- [ ] **Optional: hosting support for security response headers.** If hosting is revisited, consider a static host/CDN
      that can send CSP `frame-ancestors` headers; GitHub Pages ignores `_headers`. Keep the existing frame startup
      guard meanwhile. No hosting migration or backend is planned; see the [current protection and limitation](docs/shared-token-security.md#security-boundary).
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
- [x] Independent Slash repair: versioned side poses, bounded cached-frame body palette correction and scoped
      equipment repair fix the duplicate weapon and misplaced grips. All body gates and manual review of 32 sword
      frames pass; unrelated views/moves remain intact. Godot/Phaser/Aseprite preservation passes. Soft item and
      historical idle-west grip warnings remain visible. See the [audit report](docs/testing/professional-audit-2026-10-22.md).
- [x] Independent direction policy implemented for new forms, including explicit western originals/actions, strict frozen
      direction coverage, 4/8-view costs and mirrored-economy disclosure. Missing policy in saved drafts retains legacy
      behavior. Offline/browser/export regressions pass; live handedness acceptance remains open above.
- [x] Professional audit: independent primary-source research and adversarial pipeline/data/Studio review; credential
      isolation, paid resume/lifecycle safety, import bounds, atomic persistence, fitted move invalidation, colour-faithful
      engine exports and recoverable responsive Studio workflows. See [audit evidence](docs/testing/professional-audit-2026-10-22.md).

- [x] Shared design library and portable archives, free exact/partial copies, independent palettes and reviewed
      experimental headwear fitting; durable retries/charges and missing-move extension. Real PixelLab helmet → imported
      Ranger → rig → fit/recolour → Cast → export/reimport passed; rejected Hurt output remains blocked. Independent
      adversarial review and automated checks are recorded in [the report](docs/testing/shared-equipment-2026-10-22.md).
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
