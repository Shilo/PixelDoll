# PixelDoll — TODO & Concerns

The single list of open work and known concerns. Done history is at the bottom; decisions live in `PLAN.md`.
Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` concern

## Next up (in order)
1. [ ] Test the live site https://shilo.github.io/PixelDoll/ on a real phone + a real key (PM verified: CI green, demo loads,
      no dev-key path, worker loads — 2026-10-21)
2. [ ] Decide final origin: custom domain (recommended, key safety) vs shared `shilo.github.io` — blocks PWA + "remember key"
3. [ ] PWA (see section below) — after the origin decision
4. [ ] Shields (`off_hand`) live test on a 4- and 8-direction rig
5. [ ] Item quality polish: cape back-hem grey smudges; helmet visor flagged when the forearm covers it
6. [ ] Unity export live verification (needs Unity Hub sign-in; C# already compiles)
7. [ ] Paper theme + theming support (deferred by user)
8. [ ] CI: pin `runs-on` to `ubuntu-24.04` or accept the Ubuntu 26 migration of `ubuntu-latest` (runner notice, 2026-10)

## Concerns
- [!] **Key safety on a shared origin.** All `*.github.io/<repo>` sites of one account share an origin, so another of your
  Pages sites could read a remembered key (localStorage/IndexedDB). Mitigated: key is memory-only by default, never sent
  over BroadcastChannel, Connect warns on `*.github.io`. Fix: serve from a custom domain. (R6 P1-4, B13)
- [!] **PixelLab credits.** Balance ≈529 gens (2026-10-21) after ≈4,400 spent on research/testing. A full 4-dir character
  ≈35–50 gens, an item ≈28–50 gens, a move ≈11 + items. Paid POSTs are never auto-resent; failed ones show as "lost".
- [!] **Generation is not bit-repeatable.** Same request + seed ≠ same pixels → base frames are frozen and never
  regenerated; changing the base (`baseHash`) makes existing items stale.
- [!] **Garment regions use a 1/255 blue nudge** to keep shirt/shorts colours disjoint (D10). Invisible, but it alters
  PixelLab pixels; upgrade path = per-layer region mask in the manifest.
- [!] **Mirrored directions flip handedness** (west holds the sword in the left hand). `mirror: "generate"` per item is
  specified but not exposed in the UI.
- [!] **Unity and Godot Aseprite Wizard paths unverified**; Godot 4.7.1 + Phaser 3.80/3.90/4.2.1 + Aseprite CLI verified.
- [!] **Agent-only key mode is a convention.** `npm run dev:agent` reads `.env` for AI agents; humans must use `npm run dev`
  (no key path). Builds refuse agent mode; CI guard fails if key code or `.env` reaches `dist/`.
- [!] **PixelLab API drift.** Template list, prices and Pro/Pro Flash behaviour change; the OpenAPI snapshot in
  `docs/research/pixellab/` is from 2026-10-20.

## PWA (planned — PLAN.md "PWA", D13 pending)
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
- [ ] Theming support (token-based themes switchable at runtime)
- [ ] "Paper" theme inspired by look D: modern, clean, paper-like surfaces; may be playful but must read as paper (brand)

## Quality bar (user, 2026-10-20)
Paperdoll output must be accurate, consistent, high quality, using proper PixelLab tooling, proper skeleton rigging,
proper post-processing and proper layering — frontier-standard paperdolling workflow.

## Done
- [x] Research R1–R5 (pixellab-pip, PixelLab online, engines, games incl. Ultima Online, paperdoll tools)
- [x] Live spikes S1–S5 (diff extraction → chroma mannequin → skeleton-v3 rig → allowed-model routing → held items)
- [x] Architecture v1.3 + manifest/export spec v1.3.1
- [x] Mockups M1–M5 (key/queue, rig, item lab, dress-up, export) — dev-only, excluded from production
- [x] Design research + six looks with screenshots; user chose look A, dark default, Lucide
- [x] Studio MVP (responsive desktop/tablet/phone/landscape) + UX QA T1/T2 (6 → 8.5/10)
- [x] Hardening: full item coverage (hair, cape, chest, trousers, boots × idle/walk/slash/hurt × 4 dirs), inpaint-v3
      per-clip fallback, hair tucked under helmets, 4/8 directions + 48/56 px, shirt/shorts regions, offline pause,
      8-direction held items, layered .aseprite export, R6 robustness/security fixes
- [x] Exports verified pixel-identical: Godot 4.7.1, Phaser 3.80/3.90/4.2.1, Aseprite CLI
- [x] Docs: README, docs index, user guide, MIT LICENSE
- [x] Agent-only key mode (`npm run dev:agent`); no key path for humans or builds; CI + Pages workflow with dist guard
