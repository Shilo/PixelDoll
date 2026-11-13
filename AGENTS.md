# PixelDoll

Dress up your 2D game characters with pixel-perfect paper dolling. Generate swappable, frame-aligned equipment layers with PixelLab AI and export them to any game engine.

Tech stack: Node.js 24.22.1; npm 11.19.1; strict TypeScript 6.0.3; Svelte 5.57.3 (not SvelteKit); Vite 8.3.6; @sveltejs/vite-plugin-svelte 7.3.1; @shilo/bronze-ui 0.2.8 theme with custom CSS; Vitest 4.1.12; Playwright Test 1.65.0.

PixelDoll is a free, open-source (MIT), fully client-side web app (Svelte 5, not SvelteKit, with Vite and TypeScript), hosted on GitHub Pages at https://pixeldoll.app/. It is powered by PixelLab (https://pixellab.ai) through its REST v2 API, called directly from the browser with the user's own token.
PixelLab returns one composited image per call and has no layers. PixelDoll turns that into traditional frame-based paper dolling: one frozen base body (4 or 8 directions, several moves) plus a separate transparent layer per item (hair, headgear, clothing, boots, capes, weapons) that lines up on every frame.
Pipeline: create-character-v3 base in a square frame (supported sizes in app/src/studio/characterConfig.ts) animated on a skeleton-v3 rig with stored keypoints; each item is dressed once on a chroma-keyed copy of the base with Pro edit-animation-v2, posed onto every move with animate-with-skeleton-v3, then extracted by color key; Pro inpaint-v3 on a packed grid is the per-clip fallback; held weapons use a dynamically padded layer that shares the body's pivot (padOf in app/src/lib/items/items.ts).
Allowed PixelLab models: characters v3 (default; Pro and Pro Flash as alternatives), animations v3, pixminimax or skeleton-v3, skeleton estimate-skeleton plus v3 skeleton, edits edit-animation-v2, inpaint-v3 and transfer-outfit-v2 (reference-image dressing). No template, pro or other legacy modes.
Every item passes quality gates (alignment, frame and direction consistency, grip side, stray pixels) and the Studio lets casual users dress up, recolor by exact palette ramps, add moves and export per-layer spritesheets with a manifest for Godot, Phaser, Unity, Aseprite or raw PNG and JSON.
Quality bar: accurate, consistent, high-quality output using proper PixelLab tooling, skeleton rigging, post-processing and layering. Design: Apple-like simplicity, dark by default with a light switch, Lucide icons, every screen size and orientation.

## Docs

- Index: docs/README.md
- Plan and decisions: PLAN.md
- Accepted limits: docs/known-issues.md
- Agent token contract: docs/handoff/agent-dev-token-handling.md
- Old evidence media: commit 1f95029
- Before editing this file: docs/agent-instructions.md

## Tasks

- Tasks are draft cards on the public [PixelDoll board](https://github.com/users/Shilo/projects/7), which is also the roadmap; there is no TODO file, and GitHub Issues are for user reports. Write each card for the maintainer and agents alike: a short imperative title, then one to three short lines on what and why (technical terms are fine; details belong in the Refs), then "Refs: <paths or links>"; no progress logs.
- Statuses: Ready (approved; top is next), Progress, Done, Later (deferred). Dropped cards are archived. The user orders cards by dragging; list prints board order and new cards land at the bottom.
- A body's first line may be "Blocked:", "Paid:" (needs PixelLab generations) or "Needs decision:"; list shows it. Add the marker whenever it applies.
- From app/: node scripts/board.mjs list [status|archived] | show <card> | add <title> [--body b] [--status s] | move <card> <status> | edit <card> [--title t] [--body b] | archive <card>. A card is its ID or a unique part of its title. Single-quote bodies; \n is a newline; --body replaces the whole body.
- When adding a task, link the generated board card directly in the reply.
- Reuse saved GitHub CLI authorization; follow docs/github-cli-workflow.md for the active session's execution policy before requesting login or new scopes.
- Tracking: every explicit request to change the project authorizes tracking, including tiny fixes; use one card per independent outcome and keep follow-ups on it. No cards for discussion, incidental findings, task steps or delegated work. New tracking-only cards go to Later.
- Matching: before edits, check list and list archived and inspect likely active matches by scope; reuse a matching unfinished card, or recheck before adding Ready. Ask before choosing or adding if scope remains ambiguous. Keep its scope, Refs and markers accurate without dropping unrequested remaining work. For likely archived matches, ask for restoration to inspect scope; defer adding until resolved.
- Authorization: a direct request authorizes only its requested scope on a matching Ready/Later card; prerequisite approvals remain separate. Resume another session's Progress only on explicit continuation; coordinate a handoff if another agent is active. A question or "maybe" is not approval.
- Broad execution requests ("work on pending tasks", "do everything") cover only unmarked Ready cards, from the top, one at a time; list the marked ones you skipped. Leave Later, Progress and unrelated cards alone.
- "What's next?": report Progress cards, then recommend the top eligible Ready card; move nothing.
- Starting: show the card, read its Refs, recheck status, then move it to Progress before edits. Resolve blockers and obtain missing approval for required generations, installs, accounts or decisions before dependent work; mark unmet prerequisites and keep or return to Ready. Reuse approval already given.
- Completion: move to Done only when the entire card is complete, the checks in Testing pass and no requested review remains. Otherwise record "Left: …" as the body's last line and keep Progress; if only unrequested scope remains, return to Ready, or Later if that remainder was deferred. Remove Left once complete.
- History: reopen Done only for incomplete original delivery; later regressions or new outcomes get a new linked card.
- Delegating: the coordinating agent manages the card; sub-agents use it without creating cards or changing its status.
- Tracking failures: if board access fails or restoration is pending, report the pending tracking and continue only independently authorized file work. Recheck the board before reconciling or retrying uncertain mutations; never claim unsynchronized updates succeeded.
- Archiving: only when the user drops a card or asks to clear Done.

## Code

- Paper-doll runtime, application facades and all engine exports: read `docs/architecture/javascript-runtime.md` before editing; follow its cross-engine behavior contract, canonical-source synchronization and native parity-check workflow.
- PixelLab plan policy (tier limits, tool access): edit `PLAN_JOB_LIMITS` in app/src/lib/pixellab/plans.ts; sources in docs/pixellab-plans.md
- Studio UI: app/src/studio/
- Dev-only pages: app/src/ui/
- Demo fixture: app/public/fixtures/s2/
- Chroma keys (colors, order, mannequin style, despill) were chosen by paid A/B tests; read docs/research/2026-11-09-paperdoll-video-review/chroma-key.md before changing them, and change them only after a paired live test beats them

## Theme

- `@shilo/bronze-ui` is the owner's theme and the only UI kit (source: C:/Programming_Files/Shilocity/bronze-ui).
- Fix shared appearance there (colors, materials, states, focus, borders, radii), release a new version, then update the dependency and lockfile here; never patch node_modules or override that appearance locally.
- Layout, geometry and spacing stay local.
- Counter AI design convergence: challenge recurring layouts, palettes, typography and component styling instead of treating model defaults as design decisions. Base visual choices on PixelDoll's character-dressing workflow, simplicity-first usability and immersive experience, with clear visual hierarchy, affordance and readability. Preserve useful conventions; novelty or resemblance to AI-generated work alone is not a reason to change them.
- Validate substantial visual changes against the current design in the browser using representative workflows, interaction states, dark/light and small screens; record meaningful tradeoffs and untested assumptions.
- Ownership: docs/design/production-experience.md
- Prototype CSS check: node docs/design/2026-10-22-redesign/round-6-prototype/verify-theme-ownership.mjs from the repo root

## Commands

- Run all from app/. Add dependencies with npm install -E and commit the lockfile.
- When app tools need missing or stale dependencies, run npm ci without asking. Do not interrupt an active install, server, or test using that checkout’s dependencies.
- Format only files you changed (npx prettier --write <files>); npm run check fails on unformatted files.
- Unit tests: npm test [-- <file filter>] [-t "<name>"]
- End-to-end tests: npm run e2e -- <spec names> [-g "<title>"] [--last-failed, which reads this checkout's last run, whoever started it]; it builds and starts its own servers. On a workstation it needs spec names (--all is the full suite) and runs one at a time per machine: when it prints "Waiting", keep waiting.
- Start it in the background or with your longest command timeout and wait for it to exit: a killed run loses its place. Never start a second run or call Playwright directly (--list is fine).
- Leave E2E_PREVIEW_PORT, E2E_DEV_PORT and TEST_OUTPUT_DIR unset, and add no logs or output folders to app/ (they slow npm run check for everyone).
- After pushing to main, wait for its CI run in the background (gh run list --branch main --limit 1, then gh run watch <id> --exit-status; about 3 minutes) and fix a failure at once: while main is red, nothing deploys. If main is already red, push only its fix.

## Testing

- CI runs check, all unit tests and the full end-to-end suite on every push that changes app/ or its workflow, and gates the Pages deploy. The workstation is shared with the owner and other sessions, so local runs prove your change only.
- Run the full set of checks once, when the change is complete: npm run check and npm test (skip both for docs-only changes), plus only the end-to-end specs that cover what you changed (none for docs-only or unit-test-only changes). Before that, run only the one test that reproduces the bug or covers the code you are changing.
- Rerun a passed check only after changing code it covers; repeat a test for stability only when the task is about flakiness.
- A failure your change cannot explain: rerun that test once on its own; if it passes, report a suspected flake and move on.
- Run the full end-to-end suite locally (npm run e2e -- --all) only for cross-cutting changes (studio state, storage, the job queue, components every screen uses such as Sheet and Toast, test/e2e/immersive-helpers.ts, test/fixtures/, Experience.svelte, layout.css, geometry.ts or theme.css in src/studio/experience/, Playwright config) or when asked.
- If another agent started you, run no checks, tests, builds or servers unless your brief names the exact command; "verify" or "make sure it works" names none. Coordinators: name the exact commands in a brief or say "run nothing", then verify the combined result once.
- New tests: add one only for changed behavior that no existing test would catch. A bug fix gets one regression test and a behavior change updates the tests that cover it; refactors, copy and styling get none unless they fix a regression.
- Test at the cheapest level that proves it: unit tests for logic (value combinations belong there, not in end-to-end), browser self-tests for browser APIs, end-to-end only for UI wiring and user flows (one case per control). Extend an existing end-to-end test before adding one.
- Spec names in app/test/e2e/ match their areas, except:
  - studio covers dressing, outfits, drafts, Activity, review, repair and recolor; it is the largest spec, so narrow it with -g
  - Export runs export-picker and crash-recovery; runtime and engine exports also run their unit tests (docs/architecture/javascript-runtime.md)
  - Preview lineup, floor rings, joystick and wheel run experience-parity; zoom and pinch run scene-zoom
  - Activity, tabs and account capacity run concurrency and studio -g "first tab|busy tab|Activity"; PixelLab request wiring runs api-peek
  - the wrapper itself (scripts/e2e.mjs) runs any one small spec, such as auth
  - tests in helper files run through their spec: studio -g "dialog dismissal", studio -g "thumbnail|draft item artwork", characters -g "rig setup"
  - credential changes (remembered token, Forget, canceled Connect) run auth and studio -g "remembered key|Connect"
  - early theme (app/public/appearance.js) runs experience-parity
  - modules registered in src/lib/selftests.ts run in selftests
- Before adding an end-to-end, slow or timing-sensitive test, or changing test configs or CI shards, read docs/testing/test-performance.md.
- experience.spec.ts (screenshot captures) runs only when asked, with playwright.experience.config.ts against an already served build; it bypasses the queue, so first check that no end-to-end run is active.

## Rules

- Remembered PixelLab credentials remain plaintext in optional `localStorage['pixellabApiKey']`, intentionally shared with every app on this origin. Never broadcast credentials. Follow `docs/shared-token-security.md` for credential-free Forget/replacement notifications; do not introduce encryption or an extra unlock step. A deferred board card tracks encryption.
- Think before coding: state non-obvious assumptions. If a request is ambiguous, contradicts the code or docs, or has a clearly simpler or better alternative, say so; ask only when a wrong guess is costly to undo, otherwise proceed. Push back with evidence; never agree just to please.
- KISS and YAGNI: no feature, dependency, option or abstraction without a real need.
- Goal-driven: before changing behavior, decide how you will prove it works (for a bug, a failing test or offline reproduction on stored frames first, never a paid generation), then iterate until that check passes.
- Follow **simplicity-first design**: strong defaults, minimal necessary features/settings and no unnecessary setup for ordinary use. Keep frequent actions easy to reach; reveal necessary infrequent options through clear contextual access. Preserve accessibility, timely feedback/recovery and consequential disclosures, especially paid costs. Use concise, familiar labels. Read [Usability principles](docs/usability-principles.md) when changing features, settings, navigation or user-facing copy; its linked research is optional.
- No backward compatibility for data saved by earlier versions (no new migrations, upgrades or legacy shims): the app is in preview, so breaking changes are fine as long as old data cannot brick it (ignore it or fail with a clear message). Ask first if compatibility seems needed.
- DRY in app/: before writing a helper, type or constant, search for one and reuse it (extend it only if existing callers keep their behavior); never copy logic. Extract shared code when a second caller needs it, not before.
- Fix the root cause in the code all callers share, not only where the symptom shows.
- Stay in scope: change only what the task needs; no unrequested refactors, renames, reformatting or restyling, and leave unrelated code and comments alone; mention them instead.
- Never revert, stash, reformat or commit changes you did not make; the owner and other agents work in this tree.
- Surface errors: no empty catch, placeholder value or silent fallback that hides a failure unless documented as intended (e.g. the inpaint-v3 fallback, legacy manifest reading, optional localStorage).
- Never weaken, skip or delete a test or assertion, or change its expected values, just to make it pass; if the test itself is wrong, fix it and say why.
- Delete code your change makes dead; no commented-out code. Comments explain why, not what changed.
- Report what you verified, what failed and what you skipped; never claim a check you did not run.
- Keep the app client-only; never add a backend.
- Use only the allowed PixelLab models above, and check docs/research/pixellab/ (pixellab-openapi-v2.json) before calling an endpoint.
- PixelLab credits are real money: spend only when the task needs generations, never auto-resend paid requests, and prefer offline checks on stored frames.
- Never print, log, screenshot or commit a PixelLab token or the .env file.
- Follow the Git Conventional Commits standard for every commit.
- Use American English spelling.
- Do not use em dashes in text.

## Agent testing

- Agents that need PixelLab run npm run dev:agent (launch config app-dev-agent, port 5199). It reads PIXELLAB_API_KEY_AGENT_DEV from the repo-root .env server-side (a worktree without one uses the main checkout's), and the app connects by itself and shows an Agent mode badge.
- Check GET /balance only unless the task needs generations.
- Keyless scripts set localStorage pixeldoll.agentKey to off on the agent server so nothing can spend. The switch is read at page load and covers every tab of that origin, so keep it set for the whole run.
- Never expose the agent server beyond localhost (no --host, tunnels or port forwards).
- In T3 Code, do every manual browser check, including of your own edits, with its preview tools (preview_open and the rest; load them first if deferred); keep Playwright for test specs.
