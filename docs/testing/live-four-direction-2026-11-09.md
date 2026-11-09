# Live four-direction idle + walk validation (2026-11-09)

Fresh, paid rerun of the independent four-direction creation that stopped on two unknown `/estimate-skeleton` HTTP 500
outcomes in the [professional audit](professional-audit-2026-10-22.md#independent-directions-and-publication-follow-up).
Those earlier records stay as they are; nothing from them was resent. This report is separate from the idle-only
recovery archive and the repaired Slash in that audit.

**Result: pass.** Creation, Idle and Walk completed through the normal UI with every request settled, no unknown paid
outcome, no HTTP error and no failed quality gate. Two quality warnings remain (below). The editable ZIP round trip was
byte-identical.

## Setup

- Source: branch `t3/review-trivial-pending-tasks` at `52c940a` plus the uncommitted working-tree changes another agent
  had in progress (`dress.ts`, `equipment/*`, `ItemPane.svelte`, two unit tests). None of them is on the creation or move
  path exercised here.
- `npm run dev:agent` on localhost:5199 only. The agent token references `PIXELLAB_SECRET_DEV`, so the app talked to the
  local API server at `http://localhost:8000/v2`, not the public API.
- Headless Chromium 1.65 (Playwright) driving the real UI: New character, Add idle + walk, Inspect, Activity, API calls,
  Export, Import. No dev hooks were used to start, approve or edit work; IndexedDB was only read to record QA and ledger
  values.
- Character: "Live4 independent 2026-11-09", default prompt (plain bald base), body 64 px, Auto frame 80 x 80, Low
  top-down, random seed (resolved to 1602010295).

### Directions: Top-down 4 mirrors West

The Top-down 4 preset still selects N/E/S/W with **West mirrored from East**. The audit's sentence "New characters now
default to independently generated directions" does not match the current presets (only Unique 8 is unmirrored). To rerun
the *independent* configuration that failed before, the Mirror W button was turned off after choosing Top-down 4, which
deselects the preset highlight. All four directions were therefore drawn and animated independently.

## Requests and cost

| Step | Calls (all attempt 1, all `done`) | Ledger cost | Wall time |
|---|---|---|---|
| Create (draw + 8-view registration + skeleton read) | 2 `create-character-v3`, 1 `GET /characters/:id` | 2 gens | 16:08:13 to 16:13:50 (5 m 37 s) |
| Idle | 4 `animate-with-skeleton-v3` (one per direction) | 12 gens | 16:14:39 to 16:30:30 (about 16 m) |
| Walk | 4 `characters/animations` (motion) + 4 `animate-with-skeleton-v3` | 24 gens | 16:30:30 to 17:14:22 (about 44 m) |
| Joint estimates (both moves) | 80 `estimate-skeleton`, 13.5 to 47.7 s each (median 22.7 s) | 8 gens | |
| **Total** | 95 ledger records, 94 POSTs, 0 HTTP 4xx/5xx, 0 network failures | **46 gens, $0.00** | about 66 min |

- The Ready sheet estimated "Add idle + walk: Est. 44 gens"; the moves cost exactly 44 gens (12 + 24 + 8).
- Balance (GET /balance via the agent token, shared account): before 18,977.35 gens / $100.00, after 18,931.10 gens /
  $100.00. The 46.25 gen difference is 0.25 gens above the ledger; the shared account and the unreported registration
  usage (see D3) mean this cannot be attributed exactly. No dollars were charged.
- Unknown outcomes: none. Registration is shown as "Unknown" cost after a reload (D3); that is a display state, the
  request itself completed.
- Registration request (inspected in the app's API view): `create-character-v3` with a reference image plus 7
  `direction_images` fields (all 8 originals) and `n_directions: 8`, `template_id: mannequin`, matching the removed-legacy
  create path.

## Quality gates (saved `rigQa`, shown again after import)

Pivot from `default/south/0`; cell 80 x 80, pivot (40, 75). No clip has a failed check.

| Clip | Adherence px | Feet drift px | Palette fit | Border | Stray | Disconnected px | Verdict |
|---|---|---|---|---|---|---|---|
| idle/south | 0.23 | 0 | 1.000 | 0 | 0 | 0 | pass |
| idle/east | 0.59 | 0 | 0.998 | 0 | 0 | 9 | pass, warning |
| idle/north | 0.28 | 0 | 1.000 | 0 | 0 | 0 | pass |
| idle/west | 0.49 | 0 | 1.000 | 0 | 0 | 0 | pass |
| walk/south | 0.87 | 1 | 1.000 | 0 | 0 | 0 | pass |
| walk/east | 0.92 | 1 | 1.000 | 0 | 0 | 0 | pass |
| walk/north | 0.36 | 1 | 1.000 | 0 | 0 | 0 | pass |
| walk/west | 1.17 | 2 | 1.000 | 0 | 0 | 0 | pass, warning |

Global warnings: "idle/east: 9 disconnected pixels retained; review details" and "walk/west: silhouette bottom differs up
to 2 px from standing reference". The Moves list shows Idle and Walk as complete ("4 frames / 8 frames, 4 directions")
with no attention marker; Export showed no warning for this body.

## Visual inspection

All 52 exported body cells (Default 4, Idle 16, Walk 32) were inspected at 5x on a checker with the pivot row marked, plus
per-cell measurements (bounding box, lowest opaque row, alpha, 8-connected components) from the exported strips.

- **Alignment and foot contact:** rest feet sit on row 74 (north 73) against pivot row 75. Idle feet never move. Walk
  south/east/north feet stay within rows 73 to 75. Walk west frames 1 and 2 lift both feet to row 72 (2 px above rest),
  matching the retained warning; visible as a slight hop, not a slide.
- **Consistency:** one consistent bald body across directions and frames: same head, proportions, palette and outline. No
  semi-transparent pixels anywhere (alpha is 0 or 255).
- **West:** faces left in every frame and is genuinely independent art: it differs from flipped East by 878 px at rest,
  858 to 880 px per idle frame and 946 to 1,257 px per walk frame. Walk west has a correct alternating stride and arm swing.
  Frame 6 renders the far arm as a dark mass behind the back; it reads as shading of the far arm and is attached.
- **Stray pixels:** every cell is a single 8-connected component except idle/east frames 2 and 3, which carry a detached
  4 px and 5 px skin-colored fragment in front of the mouth (x 49 to 52, y 29 to 30). Idle/east frame 1 has the same
  fragment in gray-blue (#84888e, #9eb3d4), touching the chin, so it is not counted as disconnected; it explains the 0.998
  palette fit. See D1.
- South and north walks are subtle (small leg lift, little arm swing) but clean.

## Export and keyless round trip

- Export > PNG + JSON downloaded `live4-independent-2026-11-09-generic.pixeldoll.zip` (282,760 bytes): strips for 3 moves
  x 4 directions, layer sheets, baked current/default sheets, 60 deduplicated cells, `manifest.json` and `project.json`.
- Round trip on a separate regular (non-agent) Vite server on localhost:5203 in a fresh browser context with
  `pixeldoll.agentKey` = `off` and all PixelLab traffic blocked (0 API requests attempted): Import > Choose ZIP showed
  "4 directions, 3 moves, 0 separate items"; Import character opened the Studio with Default/Idle/Walk and S/E/N/W. Saved
  QA warnings and directions survived. Re-exporting PNG + JSON from the imported copy produced 82 PNG files that are all
  byte-identical to the original export.
- Not covered: this run had no items, so the changed partial-coverage item warnings were not exercised here.

## Defects and notes

- **D1 (art quality, warned):** idle/east frames 1 to 3 contain a small fragment floating in front of the mouth. Frames 2
  and 3 are counted (9 disconnected pixels, warning). Frame 1's gray-blue variant touches the chin and is not counted by
  the disconnected-pixel check; only a slight palette-fit drop (0.998, above the gate) reflects it. Reported as a quality
  observation; the gate behaved as designed.
- **D2 (art quality, warned):** walk/west frames 1 and 2 lift both feet 2 px (rows 72 vs 74), covered by the retained
  silhouette-bottom warning.
- **D3 (app bug, cost display):** the registration call ("rest views") completed with a background-job result that had no
  `usage` field (only an earlier `processing` poll reported `{usd: 0}`). In the live session the API calls view showed
  "0 gens + $0.000"; after a reload the same call shows "Unknown" and the API calls total reads "46 gens, 1 unknown",
  while the queue ledger stores it as `gens: 0, usd: 0`. `finish()` in `app/src/lib/pixellab/queue.ts` sums absent usage
  as 0, while `restoreActivityRequest` in `app/src/lib/pixellab/activity.ts` marks the same record unknown. The two views
  disagree about one call. Not fixed in this task.
- **D4 (doc mismatch):** the audit says new characters default to independent directions; Top-down 4 and Top-down 8 still
  mirror West (and NW/SW) by default.
- **Harness interruption (not an app defect):** the test browser process was killed by the harness at 16:37:31 during
  Walk (9/72). No POST was in flight (every POST had its response). Relaunching the same profile at 16:38:14 resumed
  polling the same four background job IDs with no new or repeated POST, and Walk finished normally. This doubles as a
  live check of lost-tab resume. The Activity sheet's "This session: 26.6 gens" counts only the post-relaunch session;
  the ledger total is 46 gens.

Screenshots, network log (paths, statuses, usage only; no headers or token), ledger dump and both ZIPs are kept locally
outside the repository.
