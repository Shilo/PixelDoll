# Mocap salvage study: pre-registered plan (2026-11-23)

Question: can 3D clip data (Quaternius UAL1, CC0) converted to PixelLab's 18 skeleton joints produce body moves that are
better than what PixelDoll ships today? If not, it is not worth more work.

Budget: at most 1,000 generations, approved by the owner on 2026-11-23. Stop early when a stage answers the question.

## What we already know (free, offline)

- The Oct 27 strips the owner judged "horrible" (`walk2`, `slash2`, `die2s`) came from the older retargeter. Their joints
  sink the head 1.7-5.6 px toward the neck, raise the shoulders to neck height, bend knees to 95 degrees and crouch up
  to 8 px. PixelLab's own walk on the same body keeps the head and shoulders fixed, never bends a knee past 131 degrees
  and sends no depth.
- The corrected Oct 28 converter (`app/src/lib/rig/motion.ts`, Motion Lab defaults) fixes the head, shoulders and
  crouch, but east walk still leans 5-8 degrees forward with 95 degree knees and 118-129 degree elbows, run leans 17-22
  degrees, and every pose carries depth hints. Its 84 paid renders are gone (jobs expired, frames were only in a
  browser), so its visual quality is unverified today.
- PixelLab's renderer draws a clean walk from PixelLab's own (measured) walk joints through the same raw
  `animate-with-skeleton-v3` request, so the renderer is not inherently unable to draw a walk.

## Arms (one body first: c27man, 80 px adult, low top-down, south and east)

| Arm | Joints sent to raw `animate-with-skeleton-v3`                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M   | Corrected mocap, Motion Lab defaults, unchanged                                                                                                                                                                                                              |
| M0  | M without depth/z_index hints (PixelLab's own poses send none)                                                                                                                                                                                               |
| MS  | M0 plus a pixel-art style pass: rest-relative head/shoulder cluster, forward lean capped at the reference lean, knee and elbow flex scaled toward rest by a fixed factor. One fixed setting, chosen offline before any render, never tuned on render results |
| P   | Production described route: PixMiniMax motion from the standing frame with the Studio's exact prompt and guard text, then estimate-skeleton per frame, then raw skeleton-v3 render (what "stab" does today)                                                  |
| T   | Walk only: PixelLab's measured template walk joints (the stored Oct 27 control)                                                                                                                                                                              |

Actions: walk, run, attack (overhead strike), hurt, death. Two seeds per case, same seeds across arms. Same reference
image, description and frame counts as the Lab. Death keeps the Lab's padding and terminal buffer.

## Decision rules (fixed before any render)

Blind review: every render is shown as an anonymized native-scale strip plus a 4x strip and GIF, with arm labels hidden
and order shuffled. At least three independent reviewers (two Claude subagents with no access to this plan's arm
mapping, one Codex) rank each action/view set and score readability of the motion, anatomy and identity consistency,
and artifacts. Objective checks run on every frame: detached pixels, border contact, opaque area ratio vs standing, and
palette drift vs standing.

- **Salvageable** if the best mocap arm (chosen per action across all actions, not per case) is ranked above or tied with
  P by a reviewer majority on at least 3 of the 4 non-walk actions in both views, with no higher artifact rate, and the
  result replicates on a second, different body (chibi 64 or adult 128) in Stage 2.
- **Not salvageable** if P wins on at least 3 of 4 non-walk actions in Stage 1, or Stage 2 fails to replicate. Stop and
  record.
- Walk is reported but does not decide: the template already exists.

## Stages and caps

1. Stage 1, c27man: M, M0, MS, P (and T reuse) for 5 actions x 2 views x 2 seeds. Cap 450 generations.
2. Stage 2, only if Stage 1 says salvageable: best mocap arm vs P on a second body, 4 non-walk actions x 2 views x 2
   seeds. Cap 350.
3. Reserve 200 for re-measuring unclear cases. Never resend a paid request automatically; a lost request is recorded,
   not retried.

## Threats to validity (to be challenged)

- P depends on PixMiniMax quality, which changes over time; record dates and seeds.
- Reviewers can recognize arms by style (for example M always has depth artifacts). Shuffling reduces but cannot remove
  this.
- c27man is a bald, unclothed mannequin; clothing and equipment are not tested here.
- The style pass is a hand-designed heuristic. A win for MS shows a direction, not a finished converter.
