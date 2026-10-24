# PixelDoll

Dress up your 2D game characters with pixel-perfect paper dolling. Generate swappable, frame-aligned equipment layers with PixelLab AI and export them to any game engine.

Tech stack: Node.js 24.22.1; npm 11.19.1; strict TypeScript 6.0.3; Svelte 5.57.2 (not SvelteKit); Vite 8.3.4; @sveltejs/vite-plugin-svelte 7.3.1; custom CSS (no GlassKit); Vitest 4.1.12; Playwright Test 1.64.1.

PixelDoll is a free, open-source (MIT), fully client-side web app (Svelte 5, not SvelteKit, with Vite and TypeScript), hosted on GitHub Pages at https://shilo.github.io/PixelDoll/. It is powered by PixelLab (https://pixellab.ai) through its REST v2 API, called directly from the browser with the user's own token.
PixelLab returns one composited image per call and has no layers. PixelDoll turns that into traditional frame-based paperdolling: one frozen base body (4 or 8 directions, several moves) plus a separate transparent layer per item (hair, headgear, clothing, boots, capes, weapons) that lines up on every frame.
Pipeline: create-character-v3 base (48 or 56 px body in a 64 px cell) animated on a skeleton-v3 rig with stored keypoints; each item is dressed once on a chroma-keyed copy of the base with Pro edit-animation-v2, posed onto every move with animate-with-skeleton-v3, then extracted by color key; Pro inpaint-v3 on a packed grid is the per-clip fallback; held weapons use a 96 px oversize layer that shares the body's pivot.
Allowed PixelLab models: characters v3 (Pro Flash as alternative), animations v3, pixminimax or skeleton-v3, skeleton estimate-skeleton plus v3 skeleton. Pro is allowed for editing only, never for creating from scratch. No template, pro or other legacy modes.
Every item passes quality gates (alignment, frame and direction consistency, grip side, stray pixels) and the Studio lets casual users dress up, recolor by exact palette ramps, add moves and export per-layer spritesheets with a manifest for Godot, Phaser, Unity, Aseprite or raw PNG and JSON.
Quality bar: accurate, consistent, high-quality output using proper PixelLab tooling, skeleton rigging, post-processing and layering. Design: Apple-like simplicity, dark by default with a light switch, Lucide icons, every screen size and orientation.

## Docs

Overview and setup: README.md
Plan and decisions: PLAN.md
Open work and concerns: TODO.md
Docs index: docs/README.md
Architecture: docs/architecture.md
Manifest and export format: docs/manifest-spec.md
User guide: docs/user-guide.md
Research and spikes: docs/research/, docs/spikes/
Test reports: docs/testing/
Agent token contract: docs/handoff/agent-dev-token-handling.md
PixelLab API snapshot: docs/research/pixellab/pixellab-openapi-v2.json
Old evidence media (spike output, screenshots): git tag v0.1.0

## Code

Studio UI: app/src/studio/
PixelLab client and job queue: app/src/lib/pixellab/
PixelLab tier concurrency defaults and tool access rules: app/src/lib/pixellab/plans.ts (`PLAN_JOB_LIMITS`; edit values here). Policy, endpoint audit and sources: docs/pixellab-plans.md. Free/Trial = local tier 0; the API does not return a numeric concurrency limit.
Rig, clips and poses: app/src/lib/rig/
Item generation and quality gates: app/src/lib/items/
Image pipeline and chroma key: app/src/lib/image/
Compositing and z order: app/src/lib/compose/
Recolor and outfits: app/src/lib/dress/
Exporters: app/src/lib/export/
Storage (IndexedDB, zip): app/src/lib/store/
Dev-only pages and fixtures: app/src/ui/, app/dev-fixtures/
Demo fixture: app/public/fixtures/s2/
Live API experiments: spikes/api/
CI and Pages deploy: .github/workflows/pages.yml

## Commands

Run all from app/.
Runtime: Node.js 24.22.1 (.nvmrc), npm 11.19.1; use exact package versions and the committed lockfile.
Install: npm ci
Dev server for humans: npm run dev
Dev server for agents: npm run dev:agent
Type check: npm run check
Unit tests: npm test (Vitest 4.1.12); npm run selftest is a compatibility alias
Build: npm run build
End-to-end tests: npm run e2e (Playwright Test 1.64.1; managed Chromium; builds and starts local servers)
Browser install: npx playwright install chromium
Standalone Studio compatibility entry: node scripts/e2e-studio.mjs (existing build required)

## Rules

Remembered PixelLab credentials remain plaintext in optional `localStorage['pixellabApiKey']`, intentionally shared
with every app on this origin. Never broadcast credentials. Follow `docs/shared-token-security.md` for credential-free
Forget/replacement notifications; do not introduce encryption or an extra unlock step. The TODO records encryption as deferred.

Follow KISS and YAGNI: no feature, dependency or abstraction without a real need.
Keep the existing custom CSS and visuals; do not introduce GlassKit.
Keep the app client-only; never add a backend.
Use only the allowed PixelLab models above, and check docs/research/pixellab/ before calling an endpoint.
PixelLab credits are real money: spend only when the task needs generations, never auto-resend paid requests, and prefer offline checks on stored frames.
Never print, log, screenshot or commit a PixelLab token or the .env file.
Follow the Git Conventional Commits standard for every commit.

## Agent testing

Agents that need PixelLab run npm run dev:agent (launch config app-dev-agent, port 5199). It reads PIXELLAB_API_KEY_AGENT_DEV from the repo-root .env server-side, and the app connects by itself and shows an Agent mode badge.
Humans use npm run dev and paste their token in the app, as in production. Builds never contain the agent path (agent-mode builds are refused, and npm run build ends with the dist guard, app/scripts/dist-guard.mjs, which fails if key code reaches dist).
Check GET /balance only unless the task needs generations. Keyless scripts set localStorage pixeldoll.agentKey to off on the agent server so nothing can spend. The switch is read at page load and covers every tab of that origin, so keep it set for the whole run.
Never expose the agent server beyond localhost (no --host, tunnels or port forwards).
