# PixelDoll — Plan

Living document: status, roadmap, decisions. Open tasks and concerns live in `TODO.md`; how things work lives in
`docs/architecture.md`; the agent quick map is `AGENTS.md`.

## Status (2026-10-22)

- **Released:** v0.1.0 (tag + GitHub release). Public repo https://github.com/Shilo/PixelDoll (MIT), live at
  https://shilo.github.io/PixelDoll/. CI on every push/PR (check, selftest, build, dist guard); `main` deploys to Pages.
- **Pipeline (proven live):** `create-character-v3` base (48 or 56 px body in a 64 px cell, 4 or 8 directions) →
  skeleton-v3 clips with stored keypoints (idle authored, walk from managed skeleton-v3 motion re-rendered raw, slash/cast/
  hurt/death authored) → items: chroma-keyed rest views dressed in one Pro `edit-animation-v2` call (chunked under the
  frame cap) → posed per clip with `animate-with-skeleton-v3` → chroma extraction + cleanup → quality gates → layers.
  Held items use a 96 px oversize layer sharing the body pivot. Fallback per clip: Pro `inpaint-v3` packed masked grid.
- **Studio:** look A, dark default + light switch, Lucide, responsive desktop/tablet/phone/landscape. Wardrobe, stage,
  inspector, exact palette recolour (incl. Shirt/Shorts/Skin), outfits, undo/redo, create character, new item, add a move,
  export, activity, offline pause, cross-tab queue lock, worker-driven polling. Dev-only pages `#/m1…#/m5` are excluded
  from production.
- **Exports verified pixel-identical:** Godot 4.7.1, Phaser 3.80/3.90/4.2.1, Aseprite CLI. Unity compiles only.
- **Quality evidence:** full item coverage (hair, cape, chest, trousers, boots, helmet, sword × idle/walk/slash/hurt × 4
  dirs; sword × 8 dirs). Independent UX QA 6 → 8.5/10. Robustness/security review fixed (R6/B13).
- **Shield validation (2026-10-22):** round-mask G9 false turns fixed; adversarial review preserved valid tiny-item
  hand motion. Codex browser and offline regressions pass. Live idle/walk tests cover 4- and 8-direction
  rigs (96 generated frames, 144 with mirrors). The offline occlusion audit now routes plausible body-hidden changes
  to explicit review warnings instead of paid retries. East walks retain two unexplained hard flags; both items remain
  unaccepted drafts. Evidence: `docs/testing/shields-2026-10-22.md`.
- **PixelLab credits:** balance ≈212 (free GET, 2026-10-22). Shield validation spent 99 generations (34 + 65).

## Roadmap

1. **Own origin** (custom domain) — key safety on shared `*.github.io`; prerequisite for PWA and for recommending
   "Remember key". Decision deferred with PWA.
2. **PWA** — deferred by user (2026-10-22); retain the installable, offline shell plan below (D13).
3. **Item quality** — shield east-walk grip/orientation discontinuities (two hard flags remain; reuse saved outputs); cape back-hem
   smudges; helmet visor flag when an arm covers it;
   optional `mirror: "generate"` per item to keep handedness in mirrored directions.
4. **Engine coverage** — Unity live verification (needs Unity Hub sign-in); Godot Aseprite Wizard path.
5. **Theming** — runtime theme tokens + "Paper" theme inspired by design look D (deferred by user).
6. **Housekeeping** — CI runner pin (`ubuntu-latest` → Ubuntu 26 migration), PixelLab OpenAPI snapshot refresh when
   endpoints change. Releases: bump `app/package.json`, annotated tag `vX.Y.Z`, `gh release create`.

## Decisions log

- D1 (2026-10-20): Browser calls PixelLab REST v2 directly with the user's token (CORS verified). No backend, ever.
- D2 (2026-10-20): ~~Same-canvas edit + local diff extraction~~ — superseded by D3; the diff extractor is a fallback only.
- D3 (2026-10-21): Item layers come from a chroma mannequin (recoloured frozen base) extracted by colour key (S2).
- D4 (2026-10-21): Base generated at 48 px and padded to a 64 px cell (never rescaled); 56 px is an option.
- D5 (2026-10-21, user): Unity live verification deferred; Godot + Phaser verified.
- D6 (2026-10-21, user): Skeleton v3 is the rig (`estimate-skeleton` + `animate-with-skeleton-v3`); legacy skeleton banned.
- D7 (2026-10-21): Item flow auto-finishes with an accept / try-again review. The bundled demo uses the team's own
  PixelLab outputs (fine for the public MIT repo).
- D8 (2026-10-21, user): Allowed models only — characters `create-character-v3` (Pro Flash alternative); animations
  `v3`, `pixminimax`, `skeleton-v3`; skeleton `estimate-skeleton` + v3. Pro is for editing only (`edit-animation-v2`,
  `inpaint-v3`, …), never for creating from scratch. Banned: `template`/`pro` animation modes, `create-character-pro`,
  4/8-direction standard routes, legacy `animate-with-skeleton`, `edit-images-v2` for layers.
- D9 (2026-10-21, user): UI look A only (no pixel fonts/icons), dark by default with a persisted light switch, Lucide
  icons, system font. Theming + "Paper" theme deferred.
- D10 (2026-10-21): Shirt/shorts regions are kept colour-disjoint by a 1/255 blue-channel parity nudge (invisible); upgrade
  path = per-layer region mask in the manifest.
- D11 (2026-10-21, user): `PIXELLAB_API_KEY_AGENT_DEV` (repo-root `.env`) is for AI-agent dev automation only
  (`npm run dev:agent`). Humans and every build have no env/key path; CI fails if agent code reaches `dist`.
  Contract: `docs/handoff/agent-dev-token-handling.md`.
- D12 (2026-10-21, user): Public GitHub repo under MIT; Pages at https://shilo.github.io/PixelDoll/ (custom domain
  recommended).
- D13 (2026-10-22, user): PWA deferred — retain the plan below, not implemented. Final origin remains undecided.
- D14 (2026-10-22, user): Evidence media (spike output, test screenshots, design mockups) is untracked and lives in tag
  v0.1.0; the repo tracks only what helps development. Dev-only fixtures live in `app/dev-fixtures/`.
- D15 (2026-10-22, user): Do not perform physical-phone testing. Browser-emulated mobile checks remain useful.

## PWA (deferred, D13)

Installable, offline-capable Studio. Tasks in `TODO.md` "PWA".

- **Manifest** (`app/public/manifest.webmanifest`, relative href): name/short_name "PixelDoll", `start_url` "./#/",
  `scope` "./", `display` "standalone", theme/background = dark `--bg`, icons 192 + 512 + 512 maskable + SVG.
- **Service worker** (hand-written `sw.js` or `vite-plugin-pwa` generateSW, whichever is smaller): precache the shell,
  hashed assets, ticker worker, icons and the demo fixture. Never cache PixelLab API or image hosts, never see the key.
  IndexedDB stays the source of truth.
- **Updates:** new SW waits; "New version available — Reload" posts `SKIP_WAITING` only on user accept; delete old caches
  on activate.
- **Offline:** shell from cache; existing offline banner + queue pause unchanged.
- **Install:** `beforeinstallprompt` → quiet "Install app" menu item; iOS hint in the user guide; `apple-touch-icon` and
  `theme-color` (light/dark).
- **Scope / origin:** `./sw.js` → scope `/PixelDoll/` on Pages, `/` on a custom domain. A SW scope is not a security
  boundary; choose the final origin before shipping (moving origin loses installs and local data).
- **CSP:** add `worker-src 'self'` and `manifest-src 'self'`.
- **Tests:** Lighthouse installability, offline reload, update flow, install on Chrome desktop / Android / iOS, sub-path
  scope, CI guard that the precache list has no `__dev`, `.env` or PixelLab API entries.
