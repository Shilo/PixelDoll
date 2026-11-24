# Which PixelLab templates are valid Studio moves? (2026-11-24)

The owner approved up to 1,000 generations to test every PixelLab skeleton-v3 template for the mannequin body: idle, run,
all attacks, hurt, death and everything else. **751.3 were spent** (ledger
`spikes/api/out/templates-2026-11-24/ledger.jsonl`, ignored). All requests were accepted except two free 422 rejections,
and none were lost or resent.

PixelLab lists 49 mannequin templates. The 33 non-walk ones and `walking-8-frames` were reviewed. The 15 other walk
variants were generated motion-only, in east only, and were not reviewed. On a contact sheet they look like near-identical
generic walks, and `walking-8-frames` is the one the Studio already used.

## Verdict

| Studio move              | Route now                                        | Why                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walk                     | **`walking-8-frames`** on a registered character | It won 4 of 6 blind sheets against the described walk: east on all three seeds (71, 83, 47). **South is split:** the described walk won south at seeds 71 and 83 in the mocap study, and the template won south only at seed 47, against a described walk that still paused at its seam. This restores the template the Move sheet stopped reaching in `27b8cd064`. |
| Run                      | **`running-8-frames`**                           | It took the majority first place on 3 of 4 sheets over two seeds. A running template won all 4 sheets, and the described run never took a sheet. It is valid in south, east and north. **Caveat:** the described run was judged without the new seam trim.                                                                                                          |
| Jump (new suggestion)    | **`two-footed-jump`**                            | It is valid in south, east and north at seed 31, and unanimously valid at seed 47.                                                                                                                                                                                                                                                                                  |
| Hurt                     | unchanged authored table                         | `taking-punch` won east unanimously on both seeds. But its south view faces three-quarter in every frame on both seeds, it lost south at seed 31, it had no north head-to-head, and it roughly doubles Hurt's body price. A move that turns away from its view is not shipped.                                                                                      |
| Idle, Slash, Death, Cast | unchanged authored tables                        | The authored idle beat `breathing-idle` and `fight-stance-idle-8-frames`. The authored death beat `falling-back-death` unanimously in both views. No template exists for slash or cast.                                                                                                                                                                             |

A template is used only when it can honor the request:

- a Skeleton V3 move on a registered character;
- the pill's unedited text;
- Automatic, or at most the template's own frame count;
- no start frame.

Everything else keeps the move's existing route: the described or authored route, standalone characters, edited text,
and more frames than the template has.

**Valid but not added:** `running-4-frames`, `running-6-frames`, `running-jump`, `jumping-2`, `getting-up`,
`fight-stance-idle-8-frames`, `breathing-idle` and `scary-walk`. Each passed every view it was screened in: south, east
and north at seed 31, plus seed 47 for `jumping-2`. They either lost to an existing route or have no Studio suggestion
that needs them.

**Not valid:**

| Template                                               | Reason                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every kick                                             | `high-kick` failed at seed 47 (torn east frame 6, south facing flip). `roundhouse-kick` and `hurricane-kick` failed north. `flying-kick` was south-only (torn east frame 5) and never screened north. `leg-sweep` failed outright. `roundhouse-kick` was also rendered at seed 47, but that render was not reviewed. |
| Every punch                                            | `cross-punch`, `lead-jab` and `surprise-uppercut` read only in east; a punch toward the camera is unreadable in south.                                                                                                                                                                                               |
| `taking-punch`                                         | East only, as above.                                                                                                                                                                                                                                                                                                 |
| `throw-object`, `fireball`                             | `throw-object` failed north; its seed-47 render was not reviewed. `fireball` lost its flame and read as a push.                                                                                                                                                                                                      |
| `falling-back-death`                                   | Floating speck in east, and the authored death won.                                                                                                                                                                                                                                                                  |
| `backflip`, `front-flip`, `running-slide`, `jumping-1` | Torn frames; `jumping-1` also leaves the 84 px frame in east.                                                                                                                                                                                                                                                        |
| `drinking`, `picking-up`                               | Invented props.                                                                                                                                                                                                                                                                                                      |
| `pull-heavy-object`, `pushing`                         | One view only.                                                                                                                                                                                                                                                                                                       |
| `crouching`, `crouched-walking`, `sad-walk`            | They fail a view or don't read as their action.                                                                                                                                                                                                                                                                      |

There is still **no `attack` or slash template for mannequins**: `attack`, `attack-back/left/right`, `angry` and `dying`
are rejected for this body template.

## Method

**Template list.** The 49 mannequin templates were read from PixelLab's own validation error on 2026-11-24 (free); see
`evidence/mannequin-templates.json`.

**Pipeline.** Every template went through the Studio's Skeleton V3 pipeline on the managed adult benchmark
(`f69d3f89-…`, 64 px, 84 px canvas):

1. the template motion on the registered character;
2. a leading-echo check;
3. normalize;
4. `estimate-skeleton` per frame;
5. `motionJoints`;
6. a raw `animate-with-skeleton-v3` re-render on the frozen standing art, at render seed = motion seed + 101.

The script is `spikes/api/mocap-salvage/templates.mts`. Every template returned a 96 px canvas with no echo frame, at a
cost of 3 generations per view (2 for the 3-frame `lead-jab`), which matches `poseCallGens`.

**Stages.**

1. **Screening, seed 31:** all 33 non-walk templates in south and east, judged from raw-versus-re-drawn sheets.
2. **North, seed 31:** the 20 candidates.
3. **Blind head-to-heads, seed 31:** against the authored tables (A) and the described route (P) from the mocap study,
   using the same reference, render seed and canvas.
4. **Fresh-seed confirmation, seed 47:** for run, hurt and walk; the described walk used the new seam trim.
5. **Jump and kick candidates:** re-screened at seed 47.

**Reviewers.** Claude Opus, Claude Sonnet and Codex GPT 6.2 Sol reviewed every set independently. Comparisons were
blind, with shuffled rows and the key kept outside the reviewed folder. Named sheets that could unblind a comparison
were withheld from that round.

- Verdict rule: a majority of the three.
- Every ballot is in `evidence/ballots.json`, and the keys are in `evidence/blind-keys.json`.
- The sheets are under `evidence/screen-*` and `evidence/compare/`.

**Loop seams.** Several stored described loops from the mocap study open or close on an exact copy of the standing pose
(`spikes/api/mocap-salvage/loop-stall.mts`):

- all four standalone chibi runs end on it (overlap 1.00);
- two managed south runs open on it;
- one managed south walk ends on it.

The Studio now drops at most one such frame per end of a looping described motion before measuring it, then resamples
the cycle (`trimStandingSeam` in `create.ts`):

- only exact copies count (overlap 0.99 or more);
- a motion with more than two copies is left whole, as a breath or sway;
- template loops are never trimmed.

The seed-47 described walk was rendered with an earlier, looser version of this rule (0.95). It dropped one south frame,
and Codex still saw a south seam pause, so the trim removes exact stand frames, not every slow seam.

## Limits

- Bare mannequins only: no clothing or items. Templates are per body template, and other templates (non-mannequin
  bodies) list different IDs.
- Ordered 4x stills, not playback. Small samples: one body, one or two seeds per view.
- West mirrors east in the Studio, and the diagonal views were not tested.
- Template frames sit 1-4 px off the standing art in the best silhouette match. The Studio's existing body checks
  (feet drift, placement) still apply to the re-render; watch for a small jump between Standing and a template move.

## Findings for future work

### PixelLab behavior (observed 2026-11-23/24)

**Template list for free.** Sending an invalid `template_animation_id` to `POST /characters/animations` returns a 422
that lists every valid template for that character's body template. The generic list in the OpenAPI spec is different,
and it is truncated.

**The mannequin lacks several templates.** `attack`, `attack-back/left/right`, `angry` and `dying` are rejected.

**Response shapes and costs.**

| Route                                 | Canvas (64 px body)               | Leading echo frame     | Cost per view                                                   |
| ------------------------------------- | --------------------------------- | ---------------------- | --------------------------------------------------------------- |
| Template motion                       | 96 px                             | No                     | 3 gens; 2 for a 3-frame template (`poseCallGens` of its frames) |
| Managed described motion (PixMiniMax) | 84 px, registered art at (10, 10) | Yes                    | 1 gen                                                           |
| Standalone PixMiniMax                 | the first frame's size            | Yes (required leading) | 1 gen                                                           |

Template frame counts:

| Frames | Templates                                                                                                                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3      | `lead-jab`                                                                                                                                                                                      |
| 4      | `breathing-idle`, `running-4-frames`, `hurricane-kick`, `walking-2`, `walking-5`, `walking-4-frames`                                                                                            |
| 5      | `crouching`, `getting-up`, `picking-up`                                                                                                                                                         |
| 6      | `cross-punch`, `flying-kick`, `fireball`, `taking-punch`, `running-6-frames`, `running-slide`, `front-flip`, `drinking`, `pull-heavy-object`, `pushing`, `crouched-walking`, most walk variants |
| 7      | `surprise-uppercut`, `high-kick`, `roundhouse-kick`, `leg-sweep`, `throw-object`, `falling-back-death`, `two-footed-jump`                                                                       |
| 8      | `running-8-frames`, `walking-8-frames`, `fight-stance-idle-8-frames`, `jumping-2`, `running-jump`, `sad-walk`, `scary-walk`                                                                     |
| 9      | `jumping-1`                                                                                                                                                                                     |
| 10     | `backflip`                                                                                                                                                                                      |

**Background jobs expire.** `GET /background-jobs/{id}` returned 404 for the Oct 28 jobs. The 84 Motion Lab renders
existed only in browser storage and were lost. Always save paid frames to disk as they arrive, as the
`spikes/api/c25/lib.mts` `paid()` harness does.

**Raw re-renders copy template defects.** The raw `animate-with-skeleton-v3` re-render reproduces whatever the template
does: torn frames, facing turns and props. Judge the re-render, not only the raw template.

**South is the hard view.** Motion toward or away from the camera (punches, kicks, hurt) is often unreadable or turns the
body three-quarter. Every candidate needs south and north checked, not just east.

### Method lessons

- **Use a pre-run challenge and a pilot.** The pre-run adversarial review (Codex) caught three plan flaws before any
  spending:
  - an unfaithful production baseline (standalone instead of managed);
  - a best-of-several multiple-comparison problem;
  - an expensive full matrix where a pilot would answer first.
- **Use an independent post-run challenge.** It caught a sign bug that bent every knee the wrong way in a joint fix, an
  adopted template with a facing defect, a loop trim that could gut subtle loops, and overstated counts. Budget for both
  challenges.
- **Keep comparisons blind.** Shuffle rows per sheet and keep the key outside the reviewed folder. Never include a named
  sheet whose pixels match a compared row in the same review round.
- **Write down the verdict rule before rendering.** Record per-reviewer ballots, not just winners, and count from the
  ballots when writing the report.
- **Keep frames and arms matched.** Match the canvas (here 84 px), reference art, rest joints, action text and render
  seed across arms. Confirm that the managed character's registered art equals the local reference before comparing
  routes; `c27man` did not match the managed benchmark.
- **Watch the ledger's estimates.** The `c25` ledger counts the estimate for rows that errored (free 422s) toward
  `spent()`. Report actual usage from the `gens` field.

### Environment pitfalls (this Windows workstation)

- **Python writes CRLF by default.** On Windows, Python text-mode writes convert files to CRLF. Open with `newline=''`
  when editing repository files.
- **The root `tsconfig.json` checks nothing.** It has no files, so `npx tsc --noEmit -p .` is a no-op. Use
  `npm run check`.
- **Node 25 needs `--experimental-transform-types`.** App modules use TypeScript parameter properties, so Node 25 needs
  this flag to import them, for example from spike scripts.
- **Codex needs two flags here.** `codex exec` outside a git repository needs `--skip-git-repo-check`, and images are
  attached with `-i <file>`.
- **The agent key needs resolving outside the dev server.** `.env` stores the agent key as a `${NAME}` reference, which
  `node --env-file` does not expand. Spike scripts resolve it (`spikes/api/mocap-salvage/env.mts`).

## Reproduce

From `spikes/api`, using Node 24+ and the repo-root `.env`:

```text
C25_RUN=templates-2026-11-24 node --experimental-transform-types --env-file=<.env> mocap-salvage/templates.mts <seed> <dirs> <ids|@screen|@walks> [--motion-only] [--dry]
```

- `mocap-salvage/authored.mts` renders the authored tables.
- `template-sheets.mts` and `review.mts` rebuild the sheets offline.
