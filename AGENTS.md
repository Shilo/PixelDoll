# PixelDoll

Dress up your 2D game characters with pixel-perfect paper dolling. Generate swappable, frame-aligned equipment layers with PixelLab AI and export them to any game engine.

Tech stack: Node.js 24.22.1; npm 11.19.1; strict TypeScript 6.0.3; Svelte 5.57.2 (not SvelteKit); Vite 8.3.4; @sveltejs/vite-plugin-svelte 7.3.1; @shilo/bronze-ui 0.2.2 theme with custom CSS; Vitest 4.1.12; Playwright Test 1.64.1.

PixelDoll is a free, open-source (MIT), fully client-side web app (Svelte 5, not SvelteKit, with Vite and TypeScript), hosted on GitHub Pages at https://pixeldoll.app/. It is powered by PixelLab (https://pixellab.ai) through its REST v2 API, called directly from the browser with the user's own token.
PixelLab returns one composited image per call and has no layers. PixelDoll turns that into traditional frame-based paper dolling: one frozen base body (4 or 8 directions, several moves) plus a separate transparent layer per item (hair, headgear, clothing, boots, capes, weapons) that lines up on every frame.
Pipeline: create-character-v3 base (48–128 px body in a square frame; default 64 px in 80 px) animated on a skeleton-v3 rig with stored keypoints; each item is dressed once on a chroma-keyed copy of the base with Pro edit-animation-v2, posed onto every move with animate-with-skeleton-v3, then extracted by color key; Pro inpaint-v3 on a packed grid is the per-clip fallback; held weapons use a 96 px oversize layer that shares the body's pivot.
Allowed PixelLab models: characters v3 (Pro Flash as alternative), animations v3, pixminimax or skeleton-v3, skeleton estimate-skeleton plus v3 skeleton, edits edit-animation-v2, inpaint-v3 and transfer-outfit-v2 (reference-image dressing). Pro is allowed for editing only, never for creating from scratch. No template, pro or other legacy modes.
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
- Reuse saved GitHub CLI authorization; follow docs/github-cli-workflow.md before requesting login or new scopes. Codex: .codex/rules/board.rules requires running the board CLI outside the sandbox.
- Tracking: every explicit request to change the project authorizes tracking, including tiny fixes; use one card per independent outcome and keep follow-ups on it. No cards for discussion, incidental findings, task steps or delegated work. New tracking-only cards go to Later.
- Matching: before edits, check list and list archived and inspect likely active matches by scope; reuse a matching unfinished card, or recheck before adding Ready. Ask before choosing or adding if scope remains ambiguous. Keep its scope, Refs and markers accurate without dropping unrequested remaining work. For likely archived matches, ask for restoration to inspect scope; defer adding until resolved.
- Authorization: a direct request authorizes only its requested scope on a matching Ready/Later card; prerequisite approvals remain separate. Resume another session's Progress only on explicit continuation; coordinate a handoff if another agent is active. A question or "maybe" is not approval.
- Broad execution requests ("work on pending tasks", "do everything") cover only unmarked Ready cards, from the top, one at a time; list the marked ones you skipped. Leave Later, Progress and unrelated cards alone.
- "What's next?": report Progress cards, then recommend the top eligible Ready card; move nothing.
- Starting: show the card, read its Refs, recheck status, then move it to Progress before edits. Resolve blockers and obtain missing approval for required generations, installs, accounts or decisions before dependent work; mark unmet prerequisites and keep or return to Ready. Reuse approval already given.
- Completion: move to Done only when the entire card is complete, the checks in End-to-end scope pass and no requested review remains. Otherwise record "Left: …" as the body's last line and keep Progress; if only unrequested scope remains, return to Ready, or Later if that remainder was deferred. Remove Left once complete.
- History: reopen Done only for incomplete original delivery; later regressions or new outcomes get a new linked card.
- Delegating: the coordinating agent manages the card; sub-agents use it without creating cards or changing its status.
- Tracking failures: if board access fails or restoration is pending, report the pending tracking and continue only independently authorized file work. Recheck the board before reconciling or retrying uncertain mutations; never claim unsynchronized updates succeeded.
- Archiving: only when the user drops a card or asks to clear Done.

## Code

- PixelLab plan policy (tier limits, tool access): edit `PLAN_JOB_LIMITS` in app/src/lib/pixellab/plans.ts; sources in docs/pixellab-plans.md
- Studio UI: app/src/studio/
- Dev-only pages: app/src/ui/
- Demo fixture: app/public/fixtures/s2/

## Theme

- `@shilo/bronze-ui` is the owner's theme and the only UI kit (source: C:/Programming_Files/Shilocity/bronze-ui).
- Fix shared appearance there (colors, materials, states, focus, borders, radii), release a new version, then update the dependency and lockfile here; never patch node_modules or override that appearance locally.
- Layout, geometry and spacing stay local.
- Ownership: docs/design/production-experience.md
- Prototype CSS check: node docs/design/2026-10-22-redesign/round-6-prototype/verify-theme-ownership.mjs from the repo root

## Commands

- Run all from app/. Install with npm ci; add dependencies with npm install -E and commit the lockfile.
- Unit tests: npm test [-- <file filter>]
- End-to-end tests: npm run e2e, or npm run e2e -- <spec names> [-g "<title>"] [--last-failed]; it builds and starts its own servers.
- Concurrent agents: give each run its own E2E_PREVIEW_PORT, E2E_DEV_PORT and TEST_OUTPUT_DIR; --last-failed reads the same TEST_OUTPUT_DIR.

## End-to-end scope

- CI runs the full end-to-end suite on every push that changes app/ or its workflow, sharded, and Pages deploys only after it passes.
- Agents run npm run check and npm test (skip both for docs-only changes), plus only the end-to-end specs that cover what they changed (none for docs-only or test/unit-only changes).
- Run the full end-to-end suite locally only for cross-cutting changes (studio state, storage, queue, shared components, test/e2e/immersive-helpers.ts, test/fixtures/, src/studio/experience/, Playwright config) or when asked.
- Spec names in app/test/e2e/ match their areas, except:
  - studio covers dressing, outfits, drafts, Activity, review, repair, recolor and export
  - credential changes (remembered token, Forget, canceled Connect) run auth and studio
  - early theme (app/public/appearance.js) runs experience-parity
  - modules registered in src/lib/selftests.ts run in selftests
- Before changing test configs, CI shards or adding slow or timing-sensitive tests, read docs/testing/test-performance.md.
- experience.spec.ts (screenshot captures) runs only with playwright.experience.config.ts.

## Rules

- Remembered PixelLab credentials remain plaintext in optional `localStorage['pixellabApiKey']`, intentionally shared with every app on this origin. Never broadcast credentials. Follow `docs/shared-token-security.md` for credential-free Forget/replacement notifications; do not introduce encryption or an extra unlock step. A deferred board card tracks encryption.
- KISS and YAGNI: no feature, dependency, option or abstraction without a real need.
- No backward compatibility for data saved by earlier versions (no new migrations, upgrades or legacy shims): the app is in preview, so breaking changes are fine as long as old data cannot brick it (ignore it or fail with a clear message). Ask first if compatibility seems needed.
- DRY in app/: before writing a helper, type or constant, search for one and reuse it (extend it only if existing callers keep their behavior); never copy logic. Extract shared code when a second caller needs it, not before.
- Fix the root cause in the code all callers share, not only where the symptom shows.
- Stay in scope: no unrequested refactors, renames, reformatting or restyling; mention them instead.
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

- Agents that need PixelLab run npm run dev:agent (launch config app-dev-agent, port 5199). It reads PIXELLAB_API_KEY_AGENT_DEV from the repo-root .env server-side, and the app connects by itself and shows an Agent mode badge.
- Check GET /balance only unless the task needs generations.
- Keyless scripts set localStorage pixeldoll.agentKey to off on the agent server so nothing can spend. The switch is read at page load and covers every tab of that origin, so keep it set for the whole run.
- Never expose the agent server beyond localhost (no --host, tunnels or port forwards).
