# Handoff: WebMCP and agent tools (paused 2026-11-27)

Branch `feat/webmcp-agent-tools` holds a complete, tested agent integration that is **not merged**.
Board card: "Add WebMCP support" (Later). Read this first, then [agent-integration.md](../agent-integration.md) (setup,
tools, safety) and [the research record](../research/2026-11-22-agent-automation/README.md) (four iterations, tests,
compatibility, final decision).

## What the branch does

- 25 agent tools in `app/src/studio/automation/` over the Studio's own functions: inspect characters, items and frames;
  outfits, colors, undo and redo; create characters and items; add moves and pose equipment onto them; review drafts and
  move candidates; follow running work; export.
- Two browser-native adapters, no server: WebMCP (`document.modelContext.registerTool`) and `window.pixeldoll` for agents
  that run page script. Both share one registry (`tools.ts`) and one contract (`contract.ts`).
- Frame evidence: labeled contact sheets drawn over the page at whole device pixels, seen through the agent's own
  screenshot tool; a detached-pixel digest with coordinates; base64 only through `window.pixeldoll` with `imageData`.
- Paid work only inside a USD budget the person approves in a PixelDoll dialog; End stops unsent and running agent work;
  dispatch is bound to the approving account; durable receipts make retries by `requestId` safe across reloads and tabs.
- Shared Studio changes: `moveForm.ts` (Add move request building, used by `MoveSheet.svelte` and `add_move`),
  `draftSpec` in `characterConfig.ts`, receipt and admission hooks in `state.svelte.ts`, `create.ts` and `queue.ts`.

## Verified on 2026-11-22

- `npm run check`, 3,250 unit tests, and all 429 e2e tests pass (a few unrelated PWA, zoom and studio tests flaked under
  load and passed when rerun alone). `agent-tools.spec.ts` covers native WebMCP in Chromium (`--enable-features=WebMCP`),
  the page bridge, a mocked paid start with replay and End, and a mocked move that survives reload.
- Real agents, keyless, against the production build: Claude (Claude app browser, `window.pixeldoll`), Codex CLI with
  GPT-6.2 Sol (Playwright MCP, `window.pixeldoll` via `browser_evaluate`; it ignores mid-session tool lists), and OpenCode
  with DeepSeek v4.1 Flash (Playwright MCP, native `webmcp_*` tools). All three saw the sheets and read defects correctly.
  Gemini CLI could not run: Google no longer accepts personal free-tier accounts.

## Must do before merging: lazy loading

Today `app/src/bootstrap.ts` imports `studio/automation/bridge.ts` right after the Studio mounts, for every visitor. The
agent chunk is 74 KB raw, about 27 KB gzipped (2026-11-27 build), and the PWA offline inventory (`dist/sw.js`) includes
it, so installing the app downloads it too. Nobody who never uses an agent should download it. No setting is needed:

1. At startup define only a tiny `window.pixeldoll` stub (`help`, `tools`, `call`, `status`, `hide`) whose first use
   `import()`s the real bridge and forwards the call. Script agents (most today) then trigger the download themselves.
2. Register WebMCP only when `document.modelContext` exists (absent in every stable browser as of 2026-11). Move tool
   names, titles, descriptions, schemas and hints into a small module that both the registration and `tools.ts` import
   (no duplication); each `execute` imports the real code on first call.
3. Leave the agent chunk out of the PWA offline inventory (an installed app used offline by an agent is rare).
4. Re-measure: the main bundle should grow by well under 1 KB.

A Settings switch is not needed for size; it would only matter as an opt-out for people who want no agent access, and it
would not stop a hostile agent (page script can press any button).

## Concerns found in the final review

- Size: about 4,200 lines in `automation/` (`tools.ts` about 1,700). Four iterations of fixes (cross-tab receipts, budget
  lifecycle, evidence) made it larger than KISS would choose. Worth a simplification pass: candidates are listed in the
  research record (iteration 3 and 4 "simplicity" findings).
- Paid paths never ran live: `create_character`, `create_item`, `add_move`, `pose_equipment` and the budget were tested
  only with mocked PixelLab responses. Run one small approved paid flow (a few generations) after merging.
- Shared Studio code changed (Add move extraction into `moveForm.ts`, queue and state hooks). e2e passes, but nobody
  clicked through Add move by hand after the refactor.
- Security truth: any agent with page-script access can read the remembered PixelLab key and click the budget dialog; the
  budget guards against agent mistakes, not hostile agents. The docs say so.
- WebMCP is a W3C Community Group draft (2026-11-19), off by default in stable browsers; Playwright MCP and Chrome DevTools
  MCP need `--enable-features=WebMCP` (an origin-trial token does not help them). `window.pixeldoll` is the path most
  agents use today.
- Not checked: the budget line inside Studio sheets in a real browser (e2e proves it is there and clickable), small
  screens, light mode, ChatGPT desktop site tools, Chrome DevTools MCP, phones, two real browser tabs.
- The demo copy cannot get moves (it lacks saved standing views for rig setup); `add_move` refuses clearly. Fixing it
  needs a paid fixture update or a setup change.
- The final docs passes were written by DeepSeek v4.1 Flash (low effort) and spot-checked, not read line by line.

## Process notes for a future session

- Branch is 24+ commits; prototype branches `agent2/*`, `agent3/*`, `agent4/*` hold the competing versions.
- `codex exec` needs stdin closed (`< /dev/null`) or it waits forever; its Windows sandbox cannot write the git index of a
  worktree, so commit for it. Playwright MCP needs a config with `--enable-features=WebMCP` launch args to expose tools.
