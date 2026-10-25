# PixelDoll

Dress up your 2D game characters with pixel-perfect paper dolling. Generate swappable, frame-aligned equipment layers with PixelLab AI and export them to any game engine.

Tech stack: Node.js 24.22.1; npm 11.19.1; strict TypeScript 6.0.3; Svelte 5.57.2 (not SvelteKit); Vite 8.3.4; @sveltejs/vite-plugin-svelte 7.3.1; custom CSS (no GlassKit); Vitest 4.1.12; Playwright Test 1.64.1.

PixelDoll is a free, open-source (MIT), fully client-side web app (Svelte 5, not SvelteKit, with Vite and TypeScript), hosted on GitHub Pages at https://shilo.github.io/PixelDoll/. It is powered by PixelLab (https://pixellab.ai) through its REST v2 API, called directly from the browser with the user's own token.
PixelLab returns one composited image per call and has no layers. PixelDoll turns that into traditional frame-based paper dolling: one frozen base body (4 or 8 directions, several moves) plus a separate transparent layer per item (hair, headgear, clothing, boots, capes, weapons) that lines up on every frame.
Pipeline: create-character-v3 base (48–128 px body in a square frame; default 64 px in 80 px) animated on a skeleton-v3 rig with stored keypoints; each item is dressed once on a chroma-keyed copy of the base with Pro edit-animation-v2, posed onto every move with animate-with-skeleton-v3, then extracted by color key; Pro inpaint-v3 on a packed grid is the per-clip fallback; held weapons use a 96 px oversize layer that shares the body's pivot.
Allowed PixelLab models: characters v3 (Pro Flash as alternative), animations v3, pixminimax or skeleton-v3, skeleton estimate-skeleton plus v3 skeleton, edits edit-animation-v2, inpaint-v3 and transfer-outfit-v2 (reference-image dressing). Pro is allowed for editing only, never for creating from scratch. No template, pro or other legacy modes.
Every item passes quality gates (alignment, frame and direction consistency, grip side, stray pixels) and the Studio lets casual users dress up, recolor by exact palette ramps, add moves and export per-layer spritesheets with a manifest for Godot, Phaser, Unity, Aseprite or raw PNG and JSON.
Quality bar: accurate, consistent, high-quality output using proper PixelLab tooling, skeleton rigging, post-processing and layering. Design: Apple-like simplicity, dark by default with a light switch, Lucide icons, every screen size and orientation.

## Docs

Index: docs/README.md (architecture, manifest spec, user guide, research, test reports). Plan and decisions: PLAN.md. Accepted limits: docs/known-issues.md.
Agent token contract: docs/handoff/agent-dev-token-handling.md. PixelLab API snapshot: docs/research/pixellab/pixellab-openapi-v2.json. Old evidence media: git tag v0.1.0.

## Tasks

Tasks live only on the [PixelDoll board](https://github.com/users/Shilo/projects/7) as draft cards; there is no TODO file, and GitHub Issues are for user reports. The board is public and is the roadmap, so write cards for users to read.
Statuses: Ready (approved and pending; top is next), In progress, Done, Later (deferred: start one only when the user explicitly asks for that card, and confirm first), Canceled; archived cards are hidden from list.
From app/, run node scripts/board.mjs list [status] | show <card> | add <title> [--body b] [--status s] | move <card> <status> | edit <card> [--title t] [--body b] | archive <card>. A card is its ID, exact title or a unique part of its title; \n in a body is a newline. Codex: the CLI needs the user's GitHub login, which the sandbox hides; .codex/rules/board.rules asks to run it outside the sandbox.
- "What's next?": list Ready and recommend the highest card whose body does not start with "Blocked:"; say if it is paid or needs the user's decision. Do not move it.
- "Work on pending tasks" (or similar): take Ready cards from the top, one at a time, never Later or Blocked ones; skip cards that are paid or need the user's decision and list them for the user.
- Starting a card: show it, read its Refs, then move it to In progress before changing files.
- Finishing: move it to Done only after verifying the work. If work stops early, keep it In progress and add a "Left: …" line to the body; remove that line when the card is done.
- Adding: only when the user asks to track something, or for an out-of-scope finding the user agrees to track; never for steps of the current task. List first to avoid duplicates, including similar titles. Use a short imperative title and one to three plain lines plus "Refs: <paths or links>"; no progress logs.
- Canceling: move to Canceled only when the user decides. Archive only when asked. Leave Later and Blocked cards alone unless asked.

## Code

Studio UI: app/src/studio/. app/src/lib/: pixellab (client, job queue), rig, items (generation, quality gates), image (chroma key), compose (z order), dress (recolor, outfits), equipment (shared designs, fitted copies), export, store (IndexedDB, zip).
PixelLab plan policy (tier limits and tool access): edit `PLAN_JOB_LIMITS` in app/src/lib/pixellab/plans.ts; policy and sources in docs/pixellab-plans.md. Free/Trial is local tier 0; the API returns no numeric concurrency limit.
Dev-only pages and fixtures: app/src/ui/, app/dev-fixtures/. Demo fixture: app/public/fixtures/s2/. Live API experiments: spikes/api/. CI and Pages deploy: .github/workflows/pages.yml.

## Commands

Run all from app/. Install with npm ci; add dependencies with npm install -E and commit the lockfile.
Unit tests: npm test [-- <file filter>].
End-to-end tests: npm run e2e, or npm run e2e -- <spec names> [-g "<title>"] [--last-failed]; it builds and starts its own servers.
Concurrent agents: give each run its own E2E_PREVIEW_PORT, E2E_DEV_PORT and TEST_OUTPUT_DIR (defaults 5399, 5298, test-results); --last-failed reads the same TEST_OUTPUT_DIR.

## End-to-end scope

CI runs the full end-to-end suite on every push, sharded, and Pages deploys only after it passes. Agents run npm run check and npm test (skip both for docs-only changes), plus only the end-to-end specs that cover what they changed (none for docs-only or test/unit-only changes); run the full end-to-end suite locally only for cross-cutting changes (studio state, storage, queue, shared components, test/e2e/immersive-helpers.ts, test/fixtures/, src/studio/experience/, Playwright config) or when asked. Specs in app/test/e2e/:
studio: Studio shell, dressing, outfits, drafts, Activity, review, repair, recolor, export
characters: character import (device and PixelLab library), duplicates, deletion
character-creator, creator-request-matrix: New character sheet, creation flow and its request JSON
shared-equipment: shared designs and cross-tab follower work
auth: shared-token peers and framed-app isolation; remembered token, Forget and canceled Connect live in studio, so credential changes run auth and studio
api-peek: API call inspector
export-picker: export dialog and engine formats
concurrency: plan capacity, two-tab queue leadership, busy recovery
selftests: browser self-tests (every module registered in src/lib/selftests.ts), QA storage, demo copy
experience-parity: world keyboard focus, Preview input, resizing, selection wheel, phone Redo, character search, early theme, two-finger equipment (src/studio/experience/)
Before changing test configs, CI shards or adding slow or timing-sensitive tests, read docs/testing/test-performance.md.
Experience screenshot captures (experience.spec.ts) use playwright.experience.config.ts (see docs/testing/production-experience-2026-10-23.md).

## Rules

Remembered PixelLab credentials remain plaintext in optional `localStorage['pixellabApiKey']`, intentionally shared
with every app on this origin. Never broadcast credentials. Follow `docs/shared-token-security.md` for credential-free
Forget/replacement notifications; do not introduce encryption or an extra unlock step. A deferred board card tracks encryption.

KISS and YAGNI: no feature, dependency, option or abstraction without a real need.
DRY in app/: before writing a helper, type or constant, search for one and reuse it (extend it only if existing callers keep their behavior); never copy logic. Extract shared code when a second caller needs it, not before.
Fix the root cause in the code all callers share, not only where the symptom shows.
Stay in scope: no unrequested refactors, renames or reformatting; mention them instead.
Never revert, stash, reformat or commit changes you did not make; the owner and other agents work in this tree.
Surface errors: no empty catch, placeholder value or silent fallback that hides a failure unless documented as intended (e.g. the inpaint-v3 fallback, legacy manifest reading, optional localStorage).
Never weaken, skip or delete a test or assertion, or change its expected values, just to make it pass; if the test itself is wrong, fix it and say why.
Delete code your change makes dead; no commented-out code. Comments explain why, not what changed.
Report what you verified, what failed and what you skipped; never claim a check you did not run.
Keep the existing custom CSS and visuals; do not introduce GlassKit.
Keep the app client-only; never add a backend.
Use only the allowed PixelLab models above, and check docs/research/pixellab/ before calling an endpoint.
PixelLab credits are real money: spend only when the task needs generations, never auto-resend paid requests, and prefer offline checks on stored frames.
Never print, log, screenshot or commit a PixelLab token or the .env file.
Follow the Git Conventional Commits standard for every commit.
Use American English spelling.

## Agent testing

Agents that need PixelLab run npm run dev:agent (launch config app-dev-agent, port 5199). It reads PIXELLAB_API_KEY_AGENT_DEV from the repo-root .env server-side, and the app connects by itself and shows an Agent mode badge.
Humans use npm run dev and paste their token, as in production. Agent-mode builds are refused, and npm run build ends with app/scripts/dist-guard.mjs, which fails if key code reaches dist.
Check GET /balance only unless the task needs generations. Keyless scripts set localStorage pixeldoll.agentKey to off on the agent server so nothing can spend. The switch is read at page load and covers every tab of that origin, so keep it set for the whole run.
Never expose the agent server beyond localhost (no --host, tunnels or port forwards).
