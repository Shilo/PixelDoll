# Handoff: two-handed weapons and dual wielding

For a Claude Fable 5.2 session at high effort in T3 Code, on branch `claude/two-handed-items`.
Board card: [Add two-handed weapons and dual wielding](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=301043311). Move it to Progress when you start.

## The product

PixelDoll is a free, client-only web app and PWA for dressing 2D pixel-art game characters with swappable, frame-aligned equipment layers. The layers are generated through PixelLab and exported to game engines. It serves casual users who want to dress a character up, and game developers who export the layers to Godot, Phaser, Unity or Aseprite. Read `AGENTS.md` first: it has the project rules, commands, the PixelDoll pipeline, testing scope and board workflow. `docs/README.md` indexes the docs.

## Goal

Today a character holds at most one item in the Main hand and one in the Off hand, and each held item is fitted on its own. So a two-handed sword, a bow, a staff held in both hands, or a matched pair of daggers has no proper home: the two items would fight over the grip and the pose.

Design and ship proper support for:

- **Two-handed items:** one item held with both hands.
- **Dual wielding:** two items, one in each hand, that look and move right together.

It must be intuitive for a casual user and behave correctly everywhere an item shows up: equipping and unequipping, swapping items, outfits, every move and direction, quality checks, recolors, sharing, and every export format. Nothing that works today may regress.

**The owner's starting idea:** each item tile already has a "⋮" more menu (`app/src/studio/ItemMenu.svelte`). For a Main hand or Off hand item, a toggle there could make it a two-handed item, so that when it's equipped it occupies both hands in an obvious way. Take this idea seriously, but treat it as one candidate. If research or testing shows a better design, recommend it and explain why.

**Constraints:**

- **Quality first.** PixelDoll's quality bar is accurate, consistent pixel art on every frame (`AGENTS.md`). A design that looks good in the menu but produces wrong grips, wrong hand order or broken poses in some moves is not done.
- **Simplicity first.** Strong defaults, as few new controls as possible, and consequential disclosures stay visible, especially paid costs (`docs/usability-principles.md`).
- **One way of doing things.** Reuse and extend the existing held-item code paths; don't build a parallel path for two-handed items (`AGENTS.md`, DRY and root cause rules).
- **No backward compatibility.** PixelDoll is not released yet. Plan no migrations or legacy shims; old saved data only has to not brick the app.
- **Allowed PixelLab models only**, as listed in `AGENTS.md`.

## Do your own thinking

The value of this task is your judgment, so form it first-hand:

- **Learn how held items work today, yourself:** use the app with the demo character, read the held-item code, and read the earlier held-item research and accepted limits (`docs/research/2026-11-07-paperdoll-cycle/`, especially `audit-held.md` and `hand-wording-ab.md`, and `docs/known-issues.md`). Know what has already been tried and rejected before proposing anything.
- **Explore before you converge.** Develop several genuinely different designs, covering both the user experience and how the pipeline produces the frames, and test each against concrete items (a greatsword, a bow, a spear, a staff, paired daggers, a sword and shield) across moves and directions. Argue against your favorite before you choose it.
- **Prove it on stored frames first.** Before any paid generation, check what you can offline on existing frames and fixtures (`AGENTS.md`, Goal-driven).
- **Keep the decisions yourself.** Subagents gather facts, build and test. You do the synthesis, the design and the final judgment.

## Research

Back every external claim with a source, and say when you could not verify one.

- How games and character creators handle two-handed weapons, dual wielding and off-hand items: equipment screens, slot rules, what happens when equipping one conflicts with another, and how it's shown to the player.
- How 2D sprite and paper-doll pipelines draw and layer held items in both hands across directions: grips, hand order in front of or behind the body, and pivots.
- How game engines and their sprite tools expect held items in exported sheets, so exports stay usable.
- What PixelLab's allowed tools can and can't do for two hands holding one object, from `docs/research/pixellab/` and the existing research, before spending anything.

## Stops

**Stop 1: design.** Write up the research with its sources and your recommended design: how it works for the user (with a mock-up of the menu and the equipped result), how the pipeline produces it, the alternatives you rejected and why, how you will prove it works, and the risks. Include a **generation budget**: which live PixelLab tests you need, why offline checks aren't enough for them, and their estimated credit cost. List the owner's decisions, then stop and wait.

**After the owner approves:** implement it, test it, and run the approved live tests within the approved budget. If you need more generations than approved, stop and ask before spending.

**Before you finish:** have GPT 6.1 Sol review the full change adversarially (see Subagents), answer every finding (fixed, or rejected with the reason), and re-run the checks.

**Stop 2: done.** Report what you built, what you verified and how, what failed or was skipped, the credits spent, and anything left. Don't merge into `main` or push without the owner's approval.

## Working on this branch

Before you start, merge the latest `main` into this branch. Merge it again before Stop 2. If a merge conflicts in files you didn't change, stop and tell the owner.

Commit your work on this branch in Conventional Commits. Put design notes and the research in `docs/design/2026-11-11-two-handed-items/`, where this handoff lives.

Use the testing rules in `AGENTS.md`: `npm run check`, `npm test`, and the end-to-end specs that cover what you changed (`studio` covers dressing, outfits, review, recolor and export). Use the agent mode in `AGENTS.md` (Agent testing) for live PixelLab tests. Images under `docs/design/` are ignored by git, so screenshots stay local; describe what they show in words.

You do not need approval to read code and docs, research the web, start subagents, run `npm ci` in `app/`, run the dev servers, the browser and the tests, change app code on this branch after Stop 1, commit on this branch, check the PixelLab balance, or move your own board card. You need the owner's approval for the design at Stop 1, any PixelLab generation beyond the approved budget, adding a dependency, merging into `main`, pushing, and any other board change.

## Subagents

Subagents cost tokens, so use them where they save real time: independent, well-scoped work that can run in parallel. Prefer a few large briefs over many small ones. Brief each one with the goal, the files or products to cover and what to return (facts and findings, not file dumps, and not design decisions). Check what a subagent returns before you rely on it.

- **Claude Opus 5.5 at medium effort:** research batches, the inventory of held-item code and tests, implementation pieces you hand off, and browser checks.
- **GPT 6.1 Sol at medium effort,** started with T3 Code's `delegate_task`: one independent adversarial review of your design before Stop 1, and one of the finished change before Stop 2. Send the reviewer the design or the diff and the code, not your reasoning, so its read is not anchored to yours.

## Finishing work

Keep going while you still owe work on this task. Status notes are welcome, and so are questions on open decisions, but carry on with the work that does not depend on the answer. You will meet ordinary obstacles such as errors, timeouts, flaky tools, failing tests and empty results. Diagnose them, and when they are not real blockers, work through them with the access you have (wait and retry, fix the request, use another tool or source) instead of stopping. If something was clearly put out of bounds on purpose, leave it alone, say plainly what you found, and look for another safe way to finish. Stop only at Stop 1, Stop 2, a spending limit, or a real blocker. This does not replace the approvals listed above.

## Keeping the owner informed

Before you start, say in one line what you are about to do, and give brief updates while you work.

Write every report, stop message and the owner-decisions list for a reader who has seen none of the work: not your tool calls, not the files you opened, not your reasoning. Put the key points first. Use plain words and full sentences, and do not use terms you made up during the work; say what the thing is instead. Each message should make sense on its own.
