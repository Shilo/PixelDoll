# PixelDoll — Plan

Living document: status and decisions. Open tasks live on the [PixelDoll board](https://github.com/users/Shilo/projects/7), known limits in
`docs/known-issues.md`; how things work lives in
`docs/architecture.md`; the agent quick map is `AGENTS.md`.

## Status (2026-10-22)

- **Released:** v0.1.0 (tag + GitHub release). Public repo https://github.com/Shilo/PixelDoll (MIT), live at
  https://shilo.github.io/PixelDoll/. CI on every push/PR (check, selftest, build, dist guard); `main` deploys to Pages.
- **Pipeline (live evidence from legacy mirrored creation and imported rigs):** `create-character-v3` base (48 or 56 px body in a 64 px cell, 4 or 8 directions) →
  skeleton-v3 clips with stored keypoints (idle authored, walk from managed skeleton-v3 motion re-rendered raw, slash/cast/
  hurt/death authored) → items: chroma-keyed rest views dressed in one Pro `edit-animation-v2` call (chunked under the
  frame cap) → posed per clip with `animate-with-skeleton-v3` → chroma extraction + cleanup → quality gates → layers.
  Held items use a 96 px oversize layer sharing the body pivot. Fallback per clip: Pro `inpaint-v3` packed masked grid.
- **Studio:** look A, dark default + light switch, Lucide, responsive desktop/tablet/phone/landscape. Wardrobe, stage,
  inspector, exact palette recolor (incl. Shirt/Shorts/Skin), outfits, undo/redo, create character, new item, add a move,
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
- **Item quality follow-up:** saved east-walk joint/centroid evidence supports retaining both shield flags; no automatic
  pixel repair. A forearm-covered helmet can now require review instead of an H4 retry when head-aligned observed arm
  pixels explain the mismatch; true deformations still fail. Appended move QA now links to the selected source record
  by produced frame key, including grid fallbacks and prior history. See `docs/testing/item-quality-follow-up-2026-10-22.md`.
- **Shared equipment:** local immutable design library, portable design ZIPs, free compatible copies and independent
  target palettes are implemented. Paid cross-body fitting remains an experimental single-material headwear trial.
  Live idle/walk and Cast export/reimport passed; a Hurt helmet extension failed and remains blocked. Broader classes,
  reliability and validation work are tracked on the [board](https://github.com/users/Shilo/projects/7); see the
  [verification report](docs/testing/shared-equipment-2026-10-22.md) for scope and actual charges.
- **PixelLab credits:** the ≈212 balance was an earlier free-GET snapshot, not the balance after subsequent shared-fit
  tests. Shield validation spent 99 generations (34 + 65); later fitting can report USD as well as generations, with
  three unknown Cast measurement outcomes retained without resubmission. Professional-audit tests also changed the
  shared balance; query before further paid work, since unknown outcomes may have charged.
- **Move QA summaries:** new evaluations retain checks per move/direction, including H4 review status. Adding or replacing
  a direction recomputes current extrema and counts, preserves accepted exceptions and source links, and survives ZIP
  export. Older indivisible checks remain explicitly incomplete until their coverage is replaced. Both CI jobs now use
  `ubuntu-24.04`. Offline tests and review: `docs/testing/qa-summaries-2026-10-22.md`.

- **Professional audit:** adversarial pipeline/data/Studio reviews fixed credential sharing, unsafe paid recovery and lifecycle,
  import allocation bounds, persistence/navigation races, animation replacement validity, recolored engine output and
  keyboard/review UX. New independent directions are implemented with automated policy/action/export coverage. The live
  full creation stopped safely after two estimator HTTP 500 unknown outcomes; idle-only recovery and the primary 96px idle sword passed with west grip ambiguity retained. Targeted Slash
  repairs pass body gates and manual review of all 32 sword frames, preserving unrelated artwork and honest item warnings. Fresh evidence and remaining
  limits: [audit report](docs/testing/professional-audit-2026-10-22.md).

## Roadmap

Open work is the [PixelDoll board](https://github.com/users/Shilo/projects/7): Ready (pending, in priority order; deferred cards at the bottom) → In progress → Done.
Releases: bump `app/package.json`, annotated tag `vX.Y.Z`, `gh release create`; CI deploys `main`.

## Frame Editor planning (2026-10-23)

The [unified Frame Editor plan](docs/design/frame-editor/README.md) defines a separate full-screen tool embedded in
PixelDoll for both body and equipment frames: alignment, Draw/Erase, detected joints and desired-pose drafts, one
recoverable editing session and explicit reviewed Save/return. It replaces the earlier equipment-only planning boundary.
Implementation has not started in this task. The [delivery sequence](docs/design/frame-editor/delivery-plan.md) begins
with offline UX/data spikes, then revisions/history/portable recovery, the shared screen and a coherent local editor
including body edits. Paid pose candidates remain a later qualified capability in that same screen. Research, precise
body/gear safety contracts and reviewer agreement are linked from the plan; existing audits remain historical evidence.

## Decisions log

- D1 (2026-10-20): Browser calls PixelLab REST v2 directly with the user's token (CORS verified). No backend, ever.
- D2 (2026-10-20): ~~Same-canvas edit + local diff extraction~~ — superseded by D3; the diff extractor is a fallback only.
- D3 (2026-10-21): Item layers come from a chroma mannequin (recolored frozen base) extracted by color key (S2).
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
- D10 (2026-10-21): Shirt/shorts regions are kept color-disjoint by a 1/255 blue-channel parity nudge (invisible); upgrade
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
- D16 (2026-10-22, professional audit): New character forms default to independent directions. Mirrored economy is
  optional with an explicit held-hand warning; missing policy in historical drafts/specs retains mirrored behavior.
  Existing frozen projects are not regenerated or silently converted.
- D17 (2026-10-23, user scope and team planning): Plan one embedded full-screen Frame Editor for body and equipment,
  with visible target/frame/tool choices, local pixel/alignment/joint edits, durable drafts and explicit revision-safe
  saving. Body edits require fitting review rather than a permanent lock or automatic paid refit. No implementation,
  dependency change or API spend is included in this planning decision. See the [canonical package](docs/design/frame-editor/README.md).

## PWA (deferred, D13)

Installable, offline-capable Studio. Tracked as a deferred card on the [board](https://github.com/users/Shilo/projects/7).

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

## Professional audit follow-up: independent directions

Superseded by the creator's direction presets: new forms default to Top-down 8 (west views mirrored from their eastern
partners); Unique 8 or turning off a view's mirror keeps independent artwork, preserving provider western originals. Historical specs/drafts without `directionPolicy` retain mirrored behavior;
existing projects keep their frozen pixels. Active or interrupted specs determine their own estimates.

The initial text-only v3 request still uses its supported default eight views, selecting cardinal originals for a four-view
rig. Creation requires exactly the requested direction set before freezing. Item posing, future moves and exports preserve
explicit western directions. Offline/browser tests cover all four policy/count combinations, western authored action
trajectories, asymmetric pixels, eight-direction 96 px held-item batching, recolors, tucked layers and ZIP persistence.

Estimated creation ranges are 46–80 gens for independent four directions and 90–150 for eight; mirrored economy remains
35–60 / 57–95. PixelLab may also bill dollars, retries/fallbacks add cost, and queue time varies. These are estimates, not caps.

The integrated source through commit `cd1122a` passed 321 unit tests across 34 files and 34 browser tests, with strict checks,
production build and dist guard clean. The controlled independent four-direction full creation stopped after two estimator
HTTP 500 outcomes remained unknown; none was automatically resent. Its settled ledger displayed $0.509, excluding any
unknown charges. Offline recovery subsequently passed: four complete idle views with 16 real PNG-hash-matched measured
frames, imported and visually inspected in Studio. This separate artifact does not turn the failed idle+walk run into a pass.
The primary 96 px right-hand idle sword was manually accepted with its west-profile grip warning retained. Reload, keyless
ZIP reimport and actual Godot/Phaser/Aseprite runtimes passed. Targeted Slash repair corrected the side body poses and all four weapon views. All body gates and manual review of 32 sword frames pass; automated item warnings remain visible. Independent pixels alone do not prove anatomical or generated-art correctness. Follow the parent audit report
for the final live acceptance results.
