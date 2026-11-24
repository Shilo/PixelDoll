# Brief for the Opus 5.5 review

Date: 2026-11-24
Status: prepared before the review starts
Reviewer: Claude Opus 5.5, medium effort
Mandate: challenge everything. Do not accept the coordinator's or the implementer's conclusions without evidence.

## The goal

PixelDoll generates 2D paper-doll characters with baked, directional sprite frames. In the live test views (Top-down and Side-scroller) and in the exported runtime API, a character can walk in one direction and attack in another, or attack while walking. Today the attack clip replaces the whole body while the actor keeps translating, so the character visibly slides.

The owner wants an optional capability, not an opinionated default in the API:
- While a grounded attack plays and the character is walking in the same facing, keep the Walk's legs and gait and draw the attack's upper body over them, with the attack's own legs removed by a shaped mask. This is a layered split, not a crossfade.
- It must be optional, off in the exported API, and on by default in the app.
- The app must use the same shared API the exports use, to prove it works.
- The exported operations must be structurally the same on Phaser/JS, GDevelop, Godot and Unity.
- Settings must stay simple: one switch and at most one seam control, with human-readable tooltips that explain the technique.
- Grounded attacks on foot slow travel to 0.8 for the duration, in both layered and fallback modes. Attack timing stays authored. Mounted characters are exempt: a rider's attack must never change mount speed, and the mount must never rotate to the attack; only the rider turns.
- Brief paper-doll artifacts (a cape behaving oddly during the attack) are acceptable to the owner, because a second of layered animation beats sliding. Missing art, disappearing gear or a broken grip are not acceptable.

## What has been established

- Naive fixed cuts fail: they clip fists, weapons and capes. Cross-direction halves are not viable. See composite-probe.md and the two labs.
- A same-facing, shaped leg removal with per-frame hip registration can look acceptable. The owner judged the demo result as practically acceptable. The independent labs reached 46/48 (tight outfit) and 36/48 (body plus sword) phase pairs passing, and both fail with a cape.
- A first implementation attempt used an offline gate that compared automatic hip offsets to hand-tuned offsets and deferred the feature. The coordinator challenged the gate: it selected offsets by distance rather than measured seam quality, used a proxy as the quality bar, and ignored rig.anchors.hip. See REVIEW.md.
- The gate's fitted output was re-rendered for all 64 bodyA pairs per facing and looks comparable to the accepted demo result.
- Independently shipped and tested: the 0.8 grounded slowdown with mount/airborne/riding exemptions, and independent mount versus rider facing with integer seat placement.

## Decisions already made

Read DECISION.md. Key decisions:
- One-shot playAction over the running loop; setActionLayering, canLayerAction, actionPlaying. API default off.
- Per-frame upper and lower fragments plus integer hip anchors at export; controllers draw two ordered stacks and never mask.
- Same-facing only. Grounded and unmounted only. Whole-body fallback otherwise, with a reason.
- App setting on by default, plus a Waist stepper (-4 to +4, Automatic).
- 0.8 travel slowdown, app policy only, not exported.
- No registry, no review UI, no independent aim, no strafe, no generated clips, no seam or speed sliders.

## What to challenge

Do not limit yourself to this list, but cover at least:

1. **API design and parity.** Are the four operations the right surface? Does playAction's once-only-over-the-loop semantics hold on all four controllers? What happens with repeated calls, completion, cancellation, invalid input, equipment changes, palette changes, missing fragments, mirrored directions, padded held layers, tuck and baseCut variants? Is the capability report honest? Are the names and result shapes truly identical across JS, GDScript and C#?
2. **App behavior.** Eligibility, phase preservation, fallback, item hiding, mount and airborne exemptions, pause/hidden tab, direction changes, 8-way and side view, diagonals, reduced motion, zoom, framing, performance of per-frame masks and search, and the cost of the live envelope.
3. **Data and export.** Fragment and anchor format, duplicated pixels and archive size, coverage validation, versioning, what happens when a character is edited after export, Aseprite/RPG Maker behavior, and whether the "no masking at runtime" promise actually holds.
4. **Settings.** Is one switch plus Waist really the simplest honest surface? Are the defaults right? Is "on by default" safe for characters whose art composes badly? Are the tooltips accurate, localized and accessible? Does the Waist control make sense to a non-technical user?
5. **Quality evidence.** Are the gate metrics predictive of visual quality? Do the rendered sheets actually show what the implementer claims? Are the thresholds defensible, or do they let bad frames through? Does the worst frame matter more than the median? Is foot contact verified?
6. **Tests.** Do they test behavior or just the happy path? Any vacuous assertions, missing negative controls, or tests that would pass with the feature disabled? Is the E2E case meaningful?
7. **Robustness and honesty.** Silent fallbacks, swallowed errors, unverified native behavior, documentation claims that outrun the evidence, and anything that would embarrass the project later.

## Constraints

- Read-only: do not modify app code, tests or existing docs. You may write one review file at docs/research/2026-11-24-animation-blending/review-opus55/challenge.md.
- No commits, no board changes, no paid PixelLab calls. You may run checks and render pixels. Do not run the full E2E suite.
- Report exact commands, files and line references. Severity-rank findings (blocker, major, minor, nit). State agreement or disagreement with DECISION.md explicitly, and list anything you could not verify.

## Deliverable

A concise, evidence-first review: verdict, findings with file and line references, what is good, what must change before merge, and the questions the implementer must answer. No filler, no em dashes.
