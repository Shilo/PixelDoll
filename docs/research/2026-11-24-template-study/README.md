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

## Reproduce

From `spikes/api`, using Node 24+ and the repo-root `.env`:

```text
C25_RUN=templates-2026-11-24 node --experimental-transform-types --env-file=<.env> mocap-salvage/templates.mts <seed> <dirs> <ids|@screen|@walks> [--motion-only] [--dry]
```

- `mocap-salvage/authored.mts` renders the authored tables.
- `template-sheets.mts` and `review.mts` rebuild the sheets offline.
