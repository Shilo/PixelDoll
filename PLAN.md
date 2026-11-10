# PixelDoll — Plan

Living document: status and decisions. Open tasks live on the [PixelDoll board](https://github.com/users/Shilo/projects/7), known limits in
`docs/known-issues.md`; how things work lives in
`docs/architecture.md`; the agent quick map is `AGENTS.md`.

## Status (2026-10-22)

- **Live:** public repo https://github.com/Shilo/PixelDoll (MIT), live at https://pixeldoll.app/ (D23). CI on every
  push/PR that changes app/ (check, selftest, build, dist guard); `main` deploys to Pages. Versioning: D20.
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

Open work is the [PixelDoll board](https://github.com/users/Shilo/projects/7): Ready (approved, in priority order) → Progress → Done; deferred ideas wait in Later; dropped cards are archived.
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
- D7 (2026-10-21): ~~Item flow auto-finishes with an accept / try-again review~~ — superseded by D26 (review is optional).
  The bundled demo uses the team's own
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
- D13 (2026-10-22, user): PWA was deferred. Superseded by the November 2 request and implementation below;
  the production origin is https://pixeldoll.app/.
- D14 (2026-10-22, user): Evidence media (spike output, test screenshots, design mockups) is untracked and lives at commit
  1f95029 (formerly tag v0.1.0); the repo tracks only what helps development. Dev-only fixtures live in `app/dev-fixtures/`.
- D15 (2026-10-22, user): Do not perform physical-phone testing. Browser-emulated mobile checks remain useful.
- D16 (2026-10-22, professional audit): New character forms default to independent directions. Mirrored economy is
  optional with an explicit held-hand warning; missing policy in historical drafts/specs retains mirrored behavior.
  Existing frozen projects are not regenerated or silently converted.
- D17 (2026-10-23, user scope and team planning): Plan one embedded full-screen Frame Editor for body and equipment,
  with visible target/frame/tool choices, local pixel/alignment/joint edits, durable drafts and explicit revision-safe
  saving. Body edits require fitting review rather than a permanent lock or automatic paid refit. No implementation,
  dependency change or API spend is included in this planning decision. See the [canonical package](docs/design/frame-editor/README.md).
- D18 (2026-10-24, user): `transfer-outfit-v2` is allowed for reference-image dressing (it was only superseded as a per-clip
  design lock), because items from a concept image are planned. Judge external ideas by output quality, not by the model list.
  See the [external pipeline review](docs/research/paperdoll-py-asset-review-2026-10-24.md).
- D19 (2026-10-25, measured campaign): a third chroma key, blue, is used only when an item's colors collide with both green
  and magenta (green with pink or red); green + purple keeps magenta. Concept-image items should be built on
  `transfer-outfit-v2` with the raw concept (provisional). Prompt rewordings for the dress and pose calls are not adopted. See
  the [campaign](docs/research/generation-quality-campaign-2026-10-25.md).
- D21 (2026-10-25, measured round 2): a fourth chroma key, azure (hue 210°), for items that name green and purple; order
  green → magenta → blue → azure. Concept-image items use the anchored edit-animation-v2 route with the raw concept as frame 1
  (supersedes D19's provisional transfer-outfit-v2 route: blind judging found no winner and more hard fails on transfer).
  Held bows and shields default to the off hand. The posed key tolerance follows the body cell (2 px for a 128 px body's 160 px cell). A G2 key switch takes the next key
  the prompt allows. See
  [round 2](docs/research/generation-quality-round2-2026-10-25.md).
- D22 (2026-10-25, measured round 3): items may hide body px they cover (`Item.baseCut`, ear tips under a hood): the dressed
  keyframe decides where, each frame's own erasure decides which; exports bake "<base>~<item>". Despill snaps only to near
  item colors (steel stayed purple-free on azure). Held items fill the stand-in's grip gap. Bows keep the off-hand wording. See
  [round 3](docs/research/generation-quality-round3-2026-10-25.md).
- D23 (2026-10-25, reviews): a key switches only on a dressed keyframe's G3 (collision), at once; G2 never switches. Posed
  clips are also checked against their dressed keyframe's palette (warning). See [round 3](docs/research/generation-quality-round3-2026-10-25.md).
- D24 (2026-10-25, measured round 4): idle and walk of a direction share one pose call for non-held items (3 gens instead of 6);
  prompt grammar stays; the unused baked-color export is deleted (runtimes swap palettes live); no per-item re-roll exceptions.
  See [round 4](docs/research/generation-quality-round4-2026-10-25.md).
- D25 (2026-10-25, measured round 5, Lexingel's paper-doll research): small accessories keep 2–3 px parts and may leave a view
  empty that hides them (review, not re-roll); G2 ignores detached body effects; text moves that turn side-on get a review
  note; body animations describe the prompt's own clothes; one pose price; new bases are fully bare (owner: "with plain bare
  skin everywhere, nothing worn", the shortest wording that drew no garment on men over four seeds). Per-frame z-order, per-item
  mirror flags, ground shifts and a render route are not adopted. See
  [round 5](docs/research/lexingel-paperdoll-findings-round5-2026-10-25.md).
- D20 (2026-10-25, user): the version is automatic and never bumped by hand: the number of non-merge commits that changed what
  ships (app/ or its workflow), written major.minor.patch with patch 0-99 and minor 0-9 (1234 = 1.2.34), shown with the
  short commit in the More menu. Docs-only pushes neither run CI nor deploy. No tags or GitHub releases. See
  app/version.ts.
- D23 (2026-10-25, user): the site moves to the custom domain https://pixeldoll.app/ (registered at Porkbun, verified on
  the GitHub account, HTTPS enforced), which gives PixelDoll its own origin (D12 recommended one; settles D13's origin
  question). https://shilo.github.io/PixelDoll/ redirects there. Keys remembered and projects saved on the old origin stay
  there, and the remembered key is no longer shared with PixelLab Backpack on `shilo.github.io`.
- D26 (2026-10-26, user, round 10): creation makes only the draw, the re-import and the rest keypoints, and publishes a rig
  whose only move is `default` (the standing views; ~2.25 gens, 3–5 min). Idle and walk come from a one-tap "Add idle +
  walk"; moves queue and run one at a time through the unchanged add-move path. Items stream: a direction poses as soon as
  its dress chunk passes, the preview refreshes after every landed call, and a draft can be worn while it loads (never
  saved, undone, put in outfits or exported). Review is optional (supersedes D7's mandatory review): a clean draft saves
  itself; a warned or failed one stays a draft with its badge, and Keep it / Try again / Discard remain. The skeleton-v3
  animation workflow and every PixelLab request body are unchanged. See
  [review §17](docs/research/generation-pipeline-review-2026-10-25.md).
- D27 (2026-11-10, measured): green stays the default mannequin key and the order stays green → magenta → blue → azure.
  Practitioners favor cyan or blue mannequins, so cyan (hue 180), azure and blue were A/B-tested live as the default (808
  gens) and in an offline census: no hard-fail or G2 advantage, while blue-family keys tinted or rewrote steel and silver,
  dropped a turquoise gem and emptied navy gear with no gate firing. Green's one defect (dark item outlines over the body are
  keyed out) belongs in extraction (`absorbOutline`, qualified offline, not yet implemented), not in a key change. See the
  [chroma key reference](docs/research/2026-11-09-paperdoll-video-review/chroma-key.md).

## Progressive equipment generation (2026-11-03)

New item purchases cover only a complete standing pose, regardless of the character's existing moves. Saved rest pixels
or standing provenance identify that pose; Idle and Walk names are not required. Verified one-frame aliases share the
same paid result. Characters without an identifiable standing source stop before spending instead of buying animation
frames. Review the standing design first, then use the item's details to choose one of the character's actual missing
moves and its price. A selector keeps this usable with many imported or custom moves, and each quote is independent.

Skeleton-equipped items reuse their saved dressed references and stored body poses. Items bought before setup retain
the same chroma references: exact standing bindings can become skeleton-equipped during setup, while anchored editing
also extends them directly onto existing frozen frames, including two-view imports that cannot use full rig setup.
Every anchored batch reserves its reference slot and uses deterministic request seeds so resume never starts new paid
attempts. New body moves and the quick Idle + Walk action exclude equipment by default; explicit item checkboxes remain
available. Standing-only edit workflows do not require the later skeleton tool's tier. Quality warnings, missing-frame
notices, reviewed-artwork checks and explicit retry consent still apply.

This default lets users reject a design or skip unwanted moves before buying equipment animation. Completing every
move can cost the same or more than the former combined initial plan, which could batch some short clips. No automatic
animation, quality retry, or substitute static item is introduced.

## PWA (2026-11-02, supersedes D13)

The production build is installable and supports local work offline. Development and agent servers never register a
service worker. The implementation uses the platform APIs without another dependency.

- **User task and placement:** More options shows Install PixelDoll only with an actionable native browser offer;
  its click opens the native prompt directly. Otherwise the entry is explicitly named Installation help. Guidance
  must not masquerade as an install action. Help gains a real install button if a native offer arrives while open;
  Safari's manual paths remain available, including Add to Home Screen and Add to Dock. Prompt acceptance is not treated
  as proof of installation. The manifest derives its [stable identity](https://developer.chrome.com/docs/capabilities/pwa-manifest-id) from its relative start URL, keeping subpath
  installs distinct; an explicit `id: './'` resolves against the origin and would collide with sibling apps.
  Relative scope and branded SVG, 192/512 PNG,
  opaque maskable and Apple touch icons are included, alongside PNG/ICO favicons.
- **Install lifecycle correction (2026-11-02):** the initial always-visible Install label opened instructions when no
  offer had been captured, a misleading original delivery. Comparing Backpack's `InstallPwaButton.svelte` favored
  its capability gate, while retaining explicit manual help for browsers without an offered prompt. A build-only,
  frame-guarded classic `install.js` captures offers before deferred modules or IndexedDB startup. It holds only
  the browser event and installation observations, never credentials. A single source orders fresh browser offers,
  confirmed installation and positive standalone transitions; browser/fullscreen transitions alone cannot infer
  uninstallation. Native offers are consumed before awaiting the prompt; duplicate clicks and failures are handled.
  A new offer can restore installation after uninstalling in the same document. Neither missing offers nor accepted
  prompts prove installation, and no permanent localStorage installed flag is added. Native availability depends on
  the browser and window; help reports that uncertainty instead of claiming the app cannot be installed. See
  [the browser prompt contract](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt).
- **Offline release:** `app/pwa-build.ts` inventories every shipped file after bundling, including all lazy chunks,
  ticker worker, worlds, export icons and demo artwork. `app/pwa-worker.js` stages a separate cache, bypasses HTTP caches
  and verifies every file's SHA-256 before installation. Each build gets a distinct identity even when rebuilt from
  the same commit. Public artwork URLs carry that identity; hashed Vite asset names are already immutable.
- **Update default (2026-11-03):** startup gets one nonblocking two-second automatic-reload opportunity, measured
  from the first Studio mount. Checks, staging and verification run while the app works normally, including offline.
  The opportunity ends on trusted input, loss of focus/visibility, navigation, restoration or cross-tab storage changes.
  Native restored/autofilled form values and session-only connections also prevent automatic reload. Existing Studio
  save and generation guards apply; there is no UI-state snapshot or restoration layer. The initial capture runs in
  main before bootstrap in an isolated build chunk, and startup completion is reactive so a quickly ready update can
  apply on that first opening. Both monotonic and wall clocks enforce the cutoff across system sleep. The distribution
  guard rejects startup chunks that import the app or credential/storage code.
  Complete release verification and target agreement remain mandatory, with eligibility checked after asynchronous
  steps and immediately before activation and reload. A late completion leaves the page open, even if its worker has
  activated. A scoped, credential-free session marker prevents automatic reload chains; unavailable marker storage
  falls back to manual updating. Already open or resumed windows and all late/unsafe updates require an explicit click.
  The app cannot preserve forms, prepared ZIPs, undo history, preview state or a session-only connection through reload.
  A timed versioned notice and More options action
  remain available even when an ordinary toast is replaced. Saved outfits are flushed and checked; an open panel,
  inline outfit draft, unfinished startup, character load or pending paid workflow blocks application. For manual updates, a native modal
  prevents new interactions while verification and activation run. Only the requesting tab reloads. The notice
  discloses view/undo reset and session-only reconnection.
- **Discovery:** startup, foreground focus/visibility, page restoration and reconnect check the deployed `release.json`;
  a visible app also checks every hour. Metadata uses a cache-busting query and `cache: 'no-store'`; worker checks
  use `updateViaCache: 'none'`. Discovery keeps retrying after network or staging failures. A commit becomes visible
  after CI deploys its build and the hosting CDN exposes it, not when the commit is pushed. Offline, suspended and
  closed apps cannot learn about a deployment until they reconnect or resume. No manual check setting is needed.
- **Multi-tab safety:** activating a worker can change older tabs' controller, even without `clients.claim()`.
  Old exact-version assets remain available to those tabs, including after worker termination. Updates never reload
  another tab. Durable, credential-free client leases protect live and frozen windows. Activation retains the current
  and previous active releases plus every live or pending recovered-navigation build; unknown clients defer cleanup.
  Scope-specific Web Locks serialize ownership changes and cleanup. An unacknowledged or unidentified recovery pin
  remains protected, and browsers without Web Locks retain caches conservatively. Quota failures stop staging rather
  than deleting needed files. Superseded waiting releases can accumulate until activation if the user keeps ignoring
  updates. Discovery still reports the latest version; after finishing work, closing every app window permits natural
  activation and cleanup before reopening. This favors preserving live dependencies over install-time pruning races.
  Cleanup is scoped to PixelDoll's own caches and never touches projects, credentials or other apps.
  Shared IndexedDB contracts must still be considered before a future breaking release; retaining old code does not
  make arbitrary data-schema changes safe.
- **Online-only data:** PixelLab API responses, balances, remote libraries, previews and result/ZIP downloads are never
  put in service-worker caches. Their reads bypass browser HTTP caches and omit cookies on remote artwork downloads.
  Refreshing the library reloads previews even when their URLs are unchanged. Imported characters remain local snapshots;
  remote edits do not silently replace them. No background sync or automatic paid-request replay is introduced.
- **Storage boundaries:** IndexedDB remains authoritative for saved characters, cell PNG blobs, outfits, designs, fits,
  drafts and the existing job ledger. Existing localStorage preferences, recovery snapshots and optional remembered
  credentials retain their current contracts. Credentials are never sent in worker messages or written into app caches.
  Component form state and undo history stay in memory. Local imports, recolors and generated exports use local bytes.
- **Scope and recovery:** relative URLs support both the production root and GitHub Pages subpaths. Scope is not an
  origin security boundary; moving origins still loses access to prior local data and installs. Partial/mixed deployments,
  failed verification or quota errors preserve the previous app. Missing current files can be repaired only with verified
  bytes; old missing artwork must never silently borrow a newer release's pixels. Browser storage eviction can still
  remove local data, so exporting backups remains necessary.
  If saved work never finishes loading, **Update now** in the paused dialog activates a verified release and opens
  it in another tab. Only this path bypasses the Studio reload guard, so the original tab keeps its in-memory work.
  Already-loaded older builds can let a ready update activate by closing all PixelDoll tabs and installed windows.

The reference Toadoku implementation was reviewed adversarially. Complete-release verification, explicit activation and
old-tab safety apply here; its state restoration and long retry backoff do not. The
[service-worker lifecycle](https://web.dev/articles/service-worker-lifecycle) and
[update guidance](https://web.dev/learn/pwa/update) explain why unconditional activation and cache deletion are unsafe.

Validation (2026-11-02): Node 24.22.1/npm 11.19.1; type checking, 1,597 unit tests (one existing skip), all 190 browser
tests, production build/dist guard and theme ownership passed. The full suite includes fullscreen and the new busy-modal
keyboard regression, which reproduced before its capture guard was added. Two preview tests were corrected to inspect
the Fetch API cache policy instead of synthesized HTTP headers and to decode a valid PNG instead of a corrupt fixture.
CI exposed an early-theme test race: cached worker responses bypass network routing. The test now gates the first
navigation's application scripts with the saved preference already set, preserving every pre-bootstrap assertion;
the PWA case separately verifies controlled offline light appearance. All 30 affected cases passed with CI's one-worker
settings before the follow-up push.
Native Chromium manifest and installability checks returned no errors; subpath identity, start URL and scope were verified.
Codex browser checks independently confirmed a blocked form retains its text, explicit versioned update/reload, fullscreen
entry/exit, and server-unavailable launch, recolor and prepared export. No PixelLab credits were spent. Physical devices
and OS-installed app windows were not tested, consistent with D15. Frequent ignored updates can retain superseded waiting
caches until activation; no unsafe install-time pruning or unconditional reload was introduced.

Install follow-up validation (2026-11-02): type checking, all 1,610 unit tests (one existing skip), all 32
focused PWA/experience browser tests and the full 192-test browser suite passed, along with the production build,
dist guard and theme ownership check. New cases cover pre-module and late offers, single-use prompts,
duplicate clicks, prompt failures, accepted versus completed installation, reinstall offers and standalone evidence.
A fresh full Chromium profile received a trusted native offer on pixeldoll.app and the actual menu click invoked
the real prompt method; no OS installation was accepted. The Codex browser independently reproduced the original
misleading guidance and exercised the saved character, fullscreen and prepared export without PixelLab requests.

Notification timing (2026-11-02): the preview warning uses the existing eight-second warning duration. Update
notices use 15 seconds because their action and reload consequences need more reading time. They are dismissible;
hover and keyboard focus keep them open, and background tabs do not spend the update reading window. Readiness
starts a fresh window after downloading; periodic metadata refreshes do not extend it. Expiry and dismissal survive
opening or closing sheets. More options retains the versioned update action, so expiry never creates a deadline
for updating. New releases get a new notice. This follows [W3C's temporary-notification guidance](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html):
the information and action must remain accessible after transient feedback disappears. The durations are product
judgments, not prescribed accessibility thresholds. Unresolved errors keep their existing persistence rules.

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

## Motion quality research checkpoint

Production inpaint-grid extraction and repair now enforce the exact submitted edit mask through layer cleanup and body cuts. This prevents protected pixels from leaking into equipment without adding user work or generations. Raw skeleton posing remains unchanged.

The separate weapon-aware custom-V3 experiment authors the grip once, reuses known original body pixels elsewhere and evaluates a frozen frame-based family. Its source corrections, rejected anatomy, full-frame results, export calibration and spending are in the [weapon-aware research report](docs/research/2026-11-02-weapon-aware-grip.md). It is not an approved universal rigging or Studio body-motion replacement; remaining views, body proportions and repeatability require qualification.

The [final joint-review closure](docs/reviews/2026-11-02-final-review-closure.md) completes the agreed engineering fixes, including extraction-cache ownership and uncertain paid-response handling. The experimental presets remain unqualified; the broader motion-quality goal is not marked complete. The owner subsequently authorized a [bounded clean-grip continuation](docs/research/2026-11-02-clean-grip-qualification.md), with500 additional units as a ceiling and only75 initially allocated. Offline review precedes one source-pinned two-pose test; semantic failure stops that route. This does not reopen broad research or authorize production rerolls.

The failed clean-grip route stopped after 15 units. The subsequent [native frame authoring follow-up](docs/research/2026-11-02-native-frame-authoring.md) adds separately authored per-frame item PNGs to the existing offline editor and corrects the two axe controls without another call. Complete body motion and foot planting still require native-art qualification before any Studio preset adoption.

The owner rejected the remaining perched grips in those controls. The [palm-centered correction](docs/research/2026-11-02-palm-grip-correction.md) moves the source anchor inside the shaft and targets actual palm locations across all eight east poses. The source-click guides, fixed-root visible-toe check and exact native export require no generations. The revised full clip remains experimental and does not change Studio defaults.

The [Studio integration follow-up](docs/research/2026-11-02-studio-axe-integration.md) packages that east candidate through the existing project/engine exporters and exercises actual Studio import, wear/remove, all eight rendered frames and UI export. Inspect gains visible frame stepping and a playlist counter. Existing garment color-bit normalization is measured separately from exact native export. The visible front foot is stationary; the rear foot remains unmeasured in two merged poses. No paid calls or universal preset approval are included.

The [final adversarial follow-up](docs/reviews/2026-11-02-final-motion-review.md) reproduces and fixes stale attachment previews after render failures, with independent code/evidence review and counter-review. The complete bottom support edge is stationary; timing transitions were measured without invented universal thresholds. No further concrete blocker was found for this clip/tooling delivery. The original general-purpose professional-animation goal remains unqualified, and no additional paid trial was initiated.

The owner then requested the completed branch on main and a new [eight-direction starter-pack follow-up](docs/research/2026-11-02-eight-direction-starter-pack.md). Main was pushed at `9073b7d4`, passed CI and deployed. `codex/eight-direction-presets` implements a narrow experimental eight-view body pack: free still idle plus shared native walk/one-attack motion, exact source snapshots, receipt-bound paid continuation and reviewed integer layout. Live tests spent 74.25 generations; rejected breathing effects and two attack poses remain raw evidence. Selected artwork exports into a real Studio project with warning QA; production defaults, generated frame-joint claims and equipped-weapon acceptance remain unchanged.

The [animation closeout](docs/research/2026-11-02-animation-closeout.md) fixes actual live-world analog walk cadence, connects native playback slots to source-bound manual hand/foot authoring, blocks missing/off-body grips, and separates sampled contact residual from held-frame travel. Retained-artwork checks use no generations. Eight-direction equipped art and universal physical planting remain unqualified rather than being inferred from code tests.

The owner authorized integration of the tested engineering fixes. Main passed CI and Pages deployment, and the merged branch was deleted locally and on origin. The [remaining concerns](docs/known-issues.md#generation-and-quality) stay explicit: the body pack is experimental, hidden grips and directional weapon artwork need visual qualification, and cadence matching does not establish physical foot planting. Broad research stops here; production generation defaults are not promoted and no further credit use is implied.
