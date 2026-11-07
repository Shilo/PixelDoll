# Review: move classification (decisiveAction, whole-word isAction and actionOf)

November 7, 2026. Target: the uncommitted diff in `app/src/lib/items/items.ts` (`LOCOMOTION`, `decisiveAction`, `isAction(key, rig)`
and its three call sites), `app/src/lib/rig/clips.ts` (`moveWords`, `actionOf`), `app/src/studio/model.ts` (`qaReasons(..., rig)`),
`app/src/studio/ItemPane.svelte` and the new `app/test/unit/move-classification.test.ts`. Offline only: no PixelLab calls, no
`app/` edits. `npm run check` passes; `move-classification` and `qa-reasons` unit tests pass (7).

Scripts (run from the repo root with `node <file>`), all under `scripts/review/`:

- `move-classification.ts [names|rigs|perturb|perf]`: old versus new `isAction` and `actionOf` on 128 ids (mannequin templates,
  app ids, import-test ids, plausible MoveSheet slugs, look-alike, case and digit forms); production `decisiveAction` on every
  stored rig on disk (bench A, B, C, N, `helmet-occlusion.json`, seven audit exports with measured joints: 64 clip-directions);
  the smallest root lift, slide, scale, wrist-to-head error and upper-body lean that flips each real walk or idle (41); timing.
- `move-swaps.ts`: one-frame left/right swaps on every real walk or idle, swap-like measured frames against the requested pose,
  wrist span over body height, and a mirror-tolerant candidate.
- `move-root.ts`: the joint motion with the hip-center translation removed, on the KayKit clips.

## Findings

### 1. A one-frame left/right wrist swap turns a front or back walk or idle into an action (regression, medium)

The `moved` term compares each joint with the same label in the standing pose. On PixelDoll's chibi proportions the wrists are
0.69 to 0.88 body heights apart in front and back views (bench, audit exports; 0.11 to 0.22 in side views). One estimator frame
with swapped hands therefore reaches the 0.6 limit: a wrist-only swap on frame 0 flips 8 of 12 front walks or idles and 8 of 12
back ones to an action (0 of 17 side views; leg swaps 0 of 41). Back views are where the estimator is least sure of left and
right. The flip then silently drops G5, G9 and G11 to G14 for that clip-direction and turns a held north G4 failure into a
warning. Evidence for frequency: 0 of 340 stored measured frames look side-swapped against the requested pose, so this is rare
on skeleton-posed frames, but imported clips are estimated end to end and have no requested pose to fall back on.

Smallest fix: measure each joint against the nearer of its own and its mirror joint's standing position
(`min(|p[l]-rest[l]|, |p[l]-rest[twin(l)]|)`). On all 64 stored clip-directions it gives the same decision as the diff, and
wrist, arm or full one-frame swaps flip 0 of 123 cases (`move-swaps.ts`, section d). `rise` and `lean` are swap-invariant already.

### 2. Root motion and scale count as pose change (tradeoff, low)

Translating one frame of a real walk or idle by 0.41 to 0.54 body heights upward (a jump) or 0.44 to 0.60 sideways makes it an
action; so does drawing one frame 50 to 72 % larger. `running-jump`, `two-footed-jump` or a jump loop named `run-jump` were
locomotion before and now may skip G5 and G9, although the item's area and the held shape should not change in a jump. Smallest
fix: subtract the hip-center displacement before `moved`. On KayKit this keeps every locomotion clip at or under 0.40 and every
death decisive (south 0.61, east 0.96, south-east 0.80; side deaths also lean 73 to 78 degrees) (`move-root.ts`).

### 3. The 40 degree lean is absolute and close to a crouched gait (tradeoff, low)

Rotating the upper body forward about the hips flips side-view walks at 40 to 45 degrees of added lean, and front or back ones at
38 to 40. Standing side views already lean 5 to 7 degrees, which the absolute angle counts. A crouched or sneaking walk
(`crouched-walking` template, the new `sneak` word) can lean 30 degrees or more; no fixture holds one, so this is unmeasured.
Smallest fix: compare `lean - restLean` with 40, and note the risk for crouched gaits in the comment.

### 4. Request text changes for a few ids; resumed or saved work with those ids loses its cache (tradeoff, low)

`actionOf` feeds `rawClip` (`create.ts` `renderClip` and `inspectMeasurementRecovery`), `apiPlans.ts` previews, and item poses
(`itemRoute.pose`, `gridPrompt`). The request hash is `sha256(stableStringify({method, endpoint, params}))` (`queue.ts:139`),
and every reuse path matches it exactly: `queue.enqueue` returns a live or done record with the same hash, measurement and palette
recovery look up `requestHash === rawHash`, and `animateAnchoredItem({ savedOnly })` ("Use saved frames") requires a done record
with the same hash. None of the 49 mannequin template ids (live 422 list in `docs/spikes/S2_clean_layers.md`), `BASE_ANIMS`, `ACTIONS`, starter presets, motion-lab ids, import-test
ids or the audit ids (`walking-47c00e8a`, `walking-6fb9c602`) changes text. Changes occur only for:

- look-alikes the old code misread: `rune-*`, `runic-*`, `trunk-*`, `grunt`, `brunch`, `outrun`, `sidewalk`, `walkie-*`, `bridle`
  (old "running", "walking" or "breathing idle"; new the id itself). This is the intended fix: a "Rune blast" cast was sent as
  "running".
- digit-glued ids: `walk2`, `idle2`, `run1`, `walk01` (old "walking" and so on; new the raw id). Worse (see 5).
- inflections and compounds: `walks-*`, `runs-*`, `moonwalk`, `sleepwalk`, `sidle-*`.
- capitalized ids (`Idle`, `Walk_Cycle`, `RunFast`): new "breathing idle", "walking", "running". Not reachable from current
  producers: MoveSheet, ZIP import and starter slugs all lowercase, so the camelCase split in `moveWords` only matters for
  hand-edited projects.

For those ids only, after the update: `resumeMove` rebuilds the clip request, finds no matching record and submits a new paid
render while the old one may still complete (a paid duplicate across the deploy); "Use saved frames" and joint-check or color
recovery refuse ("unavailable") instead of reusing the bought frames. No refusal spends money. Smallest fix: accept for the
look-alikes (they are the bug fix), and fix the digit case as in 5 so `walk2` keeps "walking".

### 5. Some locomotion names now read as actions (regression for digits, tradeoff otherwise)

Name flips from locomotion to action (gates turned off): `walk2`, `idle2`, `run1`, `walk01`, `walking8` (digit glued to the
word, plausible for user-named PixelLab animations; ZIP import keeps them), `walks-forward`, `runs-away` (MoveSheet slugs the
first two words of a description), `moonwalk`, `sleepwalk`, `sidle-left`. Flips from action to locomotion (gates turned on):
`jog`, `sprint`, `sneak`, `march`, `strafe`, `trot`, `stroll`, `breathe` forms. No template, app or fixture id flips.

Smallest fix: split letters from digits in `moveWords` (for example `.replace(/([a-z])(\d)/gi, '$1 $2')` before lowercasing;
hex suffixes like `47c00e8a` cannot spell a gait word) and add `walks`, `runs`, `jogs` to `LOCOMOTION` and the `actionOf` tests.
The newly gated words (sneak, strafe, march) are untested on real frames; a false G5 or G9 there re-rolls a paid call, so they
need one stored clip each before they are trusted, or stay out of the set until then.

### 6. Measured joints are preferred even when they weaken the decision (fine, note)

`decisiveAction` uses measured joints when every frame has them. One audit slash west measured 0.49 / 0.33 / 6 degrees (not
decisive) while its other directions measure 0.78 to 0.98. A clip named `run-slash` would then be an action in three
directions and gated as locomotion in west. This is not worse than before (the old rule gated it everywhere), so no change is
required; the doc comment could say decisions are per direction.

### 7. Performance (fine)

`isAction(cellKey, rig)` costs about 35 microseconds per call on an 8-direction rig with 15-frame clips (it rebuilds the
skeletons each time); one `dirGate` pass over 720 cells takes about 25 ms, and `qaReasons` touches one key per clip. Acceptable.
If dirGate grows, memoize per `anim/dir` inside the loop.

### 8. qaReasons consistency (fine)

The only production caller is `ItemPane.svelte`, which now passes `m?.rig`; `qa.clips` keys are `anim/dir`, so the direction
reaches `decisiveAction`. Tests call it without a rig (name only), matching their names. It reads the current rig, not the rig
the item was gated with, so replacing a move's frames later can change the listed G5 reason; previously the name was stable.
Minor. `pose-review.ts` `fixedFacingLocomotion` (G14 and rig setup) keeps its own strict name rule; unchanged and still stricter.

## Checked and not a problem

- `default` (single frame, equal to the standing pose) is never decisive and stays an action by name.
- Missing joints: `hasAll` requires all 18 labels on the standing pose; incomplete measured frames fall back to requested ones,
  and no requested pose means the name decides. Directions without a standing pose (mirrored west on bench A) use the name.
- Real stored data: every bench and audit walk and idle is not decisive (max 0.29 moved, 0.17 rise, 12 degrees); every stored
  slash except the one west above is decisive; `helmet-occlusion.json` hurt (0.41 / 0.38 / 28 degrees) is not.
- A wrist must travel 65 to 92 % of the way to the nose on one frame before `rise` fires; a misplaced wrist estimate is
  unlikely to reach that.
