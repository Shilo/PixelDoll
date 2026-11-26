# Handoff: simplicity-first review of the whole app

For a new agent session. Go through every surface of PixelDoll and make it simpler, clearer and easier to read, using
what the item details rework (2026-11-26, `docs/design/2026-11-26-item-details/README.md`) taught us. Less clutter and
less text made that window easier to understand; the owner wants the same for the entire app.

## Goal

A player understands every screen, sheet, popover, menu, notice and toast at a glance: what it is for, what each control
does, what it will change and what it costs. Fewer words, fewer controls, clear placement, visible feedback, nothing
that makes them guess. Correctness, safety and every existing workflow stay intact.

You may think outside the box. Merging, moving, splitting, renaming or replacing controls and surfaces is in scope when
it makes the task clearer. Treat the item details layouts as examples, not a template: keep useful conventions and change
them where evidence shows a task gets clearer. Removing a capability users rely on is a product decision: bring the owner
evidence and a recommendation first (AGENTS.md "Think before coding").

## Working as a pair

Work with a GPT **Sol 6.2 medium** subagent, the same setup as this session's reviewer "Bob" (give yours a short name
too). Call `orchestrator_capabilities` first, then `delegate_task` with `target: { providerInstanceId: "codex", model:
"gpt-6.2-sol", options: { reasoningEffort: "medium" } }`. If it is not offered, ask the owner which model to use and
continue the inventory and research while you wait; never switch silently.

How the pair worked best:

- **Research and propose independently, then debate.** Each studies the problem and proposes an approach without seeing
  the other's; for major friction, include at least one materially different alternative and compare it with the
  current UI. A reviewer handed your conclusion tends to confirm it; give it the code, screenshots and the owner's words
  instead.
- **Challenge both ways, including the owner.** The owner asks for it ("challenge my idea"). Decide on evidence, record
  material disagreements, the evidence that settled them and the rejected options. Example: the subagent first wanted a
  local hover fix for one list, but the invisible hover affected every sheet, so it belonged in Bronze UI.
- **Both exercise the product.** Both independently run the changed journeys in the T3 preview and record visual and
  functional findings; the subagent also reviews the built screenshots and the diff, reporting material problems only,
  most severe first, each with a concrete fix.
- **Every new review is a new `delegate_task`** with a self-contained brief. Name the exact commands it may run, or say
  "read-only, run nothing" (AGENTS.md "Testing"). Use stored or mocked data first, and keep the agent credential off
  (`localStorage` `pixeldoll.agentKey` = `off`) for keyless runs.
- Use it for design, copy review, implementation of independent parts (give it a worktree or a disjoint file set) and
  review. You coordinate the board card, commits and the final checks.

## Research

Before redesigning a surface type, research current practice online: platform guidelines (Apple HIG, Material 3,
Fluent), Nielsen Norman Group, WCAG 2.2 and the WAI ARIA Authoring Practices, and how strong tools handle the same job
(Figma, Aseprite, Photoshop, Procreate, Unity and Godot inspectors, game character creators, image viewers such as
Apple Photos). Cite what you rely on in the design doc. Research informs; the owner's goals and the product's workflows
decide.

## Inventory first

List every surface before changing any, and look at each one rendered. Walk the journeys in order (choose a character,
dress it, generate and recover, review, export) and record every surface you meet in every state: empty, busy, missing,
error, review and done. Then sweep the code for anything the journeys missed:

- Screens and views: Characters, the Studio (Preview, Top-down, Side-scroller) and its tabs (Wardrobe, Colors, Outfits,
  Moves, States), the character creator.
- Sheets and dialogs: `<Sheet`, `<dialog`, `ConfirmDialog`, `ImageViewer`/`SpritePreview`, Settings, Export, Import,
  Activity, Help, Cost estimate, Fix frames, Mount, Share, New item, New move, State capture, Edit appearance, Rename.
- Popovers and menus: `popover`, `role="menu"`, item and character `⋮` menus, PlaybackPicker, Share popover, API calls.
- Notices: toasts, `ProblemNotice`, inline notices, empty states, loading, offline and error states.

Record each as a row in the design doc: the player's task, how often it comes up, the friction (with a screenshot path),
the smallest change that removes it, and the status. Prioritize by how often players meet it and how confusing it is,
and agree on the order with the subagent. Item details was already reworked; review it only for consistency with the
rest. Two scope problems there are still open and make good first cases: "Only when facing south" in Outfit reads like a
visibility setting (it limits layer-order changes), and item-wide Quality findings sit beside one-view fixes without
saying which view they concern.

**Diagnose before redesigning.** Something that looks broken may work in the data and fail only on screen: layer order
seemed broken because each step passed entries that changed nothing visible. Reproduce with stored frames and the real
compositor (no paid generation) before touching the layout, and keep what already works.

## Design practices that held up

Each came from a real problem in this session.

1. **If its purpose is not obvious, it is wrong.** A window-wide S/E/N/W facing row silently steered both the paid fixes
   and the outfit preview; the owner never understood it. Every control needs a visible reason where it sits. Prefer
   putting a choice next to the one thing it affects over a global mode.
2. **Name the target at the point of action.** "Repair south view", "Edit every Standing frame in your art app",
   "Updates Standing facing east and west." A heading scrolled away does not count as scope.
3. **One place per job, a predictable home for each kind.** No action shown twice (an earlier attempt showed Fix frames
   three times). Group by task, not by implementation; free before paid; rare and destructive actions in the `⋮` menu;
   the one primary action in the footer. A persistent on/off setting is a switch; picking several items for one action
   uses checkboxes.
4. **Costs live on the paid action.** Put the estimate on the paid control. Remove generic billing and wait-time
   boilerplate ("PixelLab may bill in dollars", "wait times vary", "retries cost extra" were removed app-wide at the
   owner's request). Keep a real minimum charge, consent, paid review and recovery text ("may already have charged") at
   the decision point.
5. **Less text.** One short line per explanation; plain verbs; no repetition of what the layout already says. Review the
   copy together for clear verbs, scope and consistent status terms (59 English strings changed in item details).
6. **Use an icon when it is unambiguous, words when it is not.** A missing view became a missing-image icon (no word,
   no dashed box). Rotate arrows read as reload, so the outfit turns with chevrons.
7. **Show the next step without opening everything.** Progressive disclosure, but: at most one section opens on entry,
   the one that explains what needs attention; a notice carries its one action; a warning dot on the entry point
   ("Details…") leads to it. Closed sections show their state on the right.
8. **No lone rows; scope stays visible.** A control that scopes a whole surface goes in its fixed header, not in a row of
   its own; narrow screens give it a second header row. Give the main name as much room as possible: drop redundant
   words first (the category word, which its icon already shows) and keep the full name accessible.
9. **The whole visible area is the target.** Tiles and rows are seamless hit areas with no dead gaps; decorative icons are
   not buttons; one glyph can mark a whole group (a single fullscreen glyph on the facing strip). Every interactive
   element has hover, pressed, a pointer cursor and visible focus.
10. **Keep things still.** Previews do not resize when switching facing or frame (crop to shared bounds); a viewer keeps
    zoom across frames of the same box. Dropdowns keep the width of their longest option.
11. **Reuse before inventing.** Use the app's own controls for the same concept (the moves/states picker, the stage's
    zoom controls, native selects for simple choices); extract a component at the second use (`ToolRow`, `ImageViewer`).
12. **Change only what was asked, in the existing look.** The owner rejected a restyle of the facing tiles ("ugly",
    "hit areas not seamless", "not centered") and wanted the previous look with only the requested change. Propose
    visual departures with a before/after; do not ship them unasked.
13. **Removing words must not remove meaning.** Keep accessible names stable (the Details row stays "Details…"; why it
    needs attention is its description). When an icon replaces visible status text, keep that status for assistive
    technology. Check scroll reachability and focus return.

## Theme or local

- Shared appearance (colors, materials, hover, pressed, focus, select states, radii) belongs in Bronze UI
  (`C:/Programming_Files/Shilocity/bronze-ui`). Fix it there and add or extend a contract test. Run `npm run check`,
  `npm run build` and `npm test`; serve the built showcase with `npm run preview`, then run `npm run test:contracts`,
  `npm run e2e` and `npm run e2e -- --webkit`. Bump the version and changelog, push `main` and a `v*` tag, wait for the
  release workflow to publish its archive, then `npm install -E <release .tgz URL>` in `app/`. Check the theme's own
  style guide against its CSS: v0.3.12 fixed a quiet hover that contradicted it (surface-colored, invisible on sheets).
- Layout, spacing and geometry stay local. Never patch `node_modules` or override theme appearance in the app.
- A sheet's global CSS reaches dialogs nested inside it: scope header rules to the sheet's own header
  (`dialog.x > .sheet-head`).

## Verify every change, visually and functionally

- Use the T3 preview tools on the agent dev server (`npm run dev:agent`, port 5199). Keep your own tab; never take over
  one the owner uses.
- Cover desktop (1440×900), a narrow phone (390×844 and 320×568) and short landscape (844×390) in dark and light; then
  test the edge states a change risks: 1, 4 and 8 facings, long names and long translations (German), empty, error and
  busy states.
- Measure instead of eyeballing: horizontal overflow, centering offsets, hit-area coverage (sample `elementFromPoint`
  across a group), stable sizes across switches, accessible names and descriptions. Preview evaluate calls time out
  after 15 s: start long sequences in the page and poll.
- Exercise each control with mouse, keyboard and touch where it applies (pinch and drag included); check focus return
  and Escape order in stacked dialogs.
- Show the owner before/after screenshots and a plain explanation of how each changed control works.
- Tests follow AGENTS.md "Testing", including its full-suite triggers: update tests for changed behavior, add one only
  where nothing covers it. Changing an accessible name breaks every test that finds the control by name: put extra
  reasons in the description instead. During the item details rework,
  `npm run e2e -- pwa -g "offline status stays compact"` also failed on clean `main` at the 390 px Export assertion
  after reconnecting; recheck the current baseline before attributing a failure.

## Mistakes not to repeat

- Acting on a stale memory note ("estimates should lead with dollars"): the owner never asked for it. Keep no memory
  notes outside the repository (the owner's rule), and verify any remembered preference against current owner direction
  before treating it as a requirement.
- Over-applying a pattern beyond the request (the boxed tile restyle). When the owner asks to revert, revert exactly.
- Explaining a control the owner cannot see working: show it.
- Editing source while a paid generation runs: hot reload broke a run once.
- Breaking existing tests by changing accessible names, or by removing a row tests used without updating them.

## Copy

- Localize every new or changed string in all 10 locales (`app/src/locales/`). American English, no em dashes.
- `docs/usability-principles.md` still says to keep retry and fallback disclosures near costs, while the owner removed
  generic billing notes. Reconcile it with practice 4.

## Make the practices permanent

When the review is done:

- Update `docs/usability-principles.md` (AGENTS.md already sends agents there before UI changes) and
  `docs/design/production-experience.md` with the practices the review validated.
- Add or sharpen concise one-line rules in AGENTS.md only for recurring failures an agent cannot infer, following
  `docs/agent-instructions.md`, and have the subagent review the diff. Verify CLAUDE.md still imports `@AGENTS.md`.
- Keep it to a few lines; exact layouts, labels and rejected options stay in design docs. Candidates to weigh, not to
  copy blindly: put scope selectors beside the actions they govern and name the target of consequential actions; costs
  only on the paid control; every interactive element has hover, pressed, pointer and focus states (from the theme);
  whole visible regions are hit areas; reuse existing pickers and viewers for the same concept; change only the
  requested look and show before/after screenshots; no memory notes outside the repository.

## Deliverables

- Tracking per AGENTS.md "Tasks": the card "Review the whole app for simplicity-first design" (check active and archived
  cards and reuse matching work), moved to Progress before edits; independent outcomes get their own cards; record what
  remains before changing a card's status. One commit per surface or coherent group.
- `docs/design/<date>-simplicity-review/README.md`: the inventory table, decisions with rejected options, research
  sources, open items and untested assumptions.
- Updated `docs/usability-principles.md` and, if warranted, AGENTS.md.
- A final report to the owner: what changed per surface with before/after screenshots, what was checked and how, what
  failed or was skipped, and what still needs a decision.
