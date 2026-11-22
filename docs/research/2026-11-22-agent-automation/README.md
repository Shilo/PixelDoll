# AI agent automation: research, tests and decision (2026-11-22)

Goal: let existing agents (Claude, Codex, Gemini, DeepSeek through OpenCode, and others) operate the deployed PixelDoll
with real access to its data and images, without a PixelDoll server or local install. Setup and the tool list:
[agent-integration.md](../../agent-integration.md). Board card: "Let AI agents operate PixelDoll through WebMCP".

**Team.** The brief asked for Opus 5.5, Codex GPT Sol 6.2 and OpenCode DeepSeek 4.1 Flash as three research leads. Only
Claude subagents can be spawned from this session, so three independent Claude subagents did the desk research (WebMCP
spec and browsers; an adversarial review of alternatives and harnesses; a map of reusable PixelDoll services). Codex
(GPT-6.2 Sol) and OpenCode (DeepSeek v4.1 Flash) took part as the agents under test instead, which is where their
independent behavior mattered most.

Labels: **tested** = run here on 2026-11-22; **documented** = read in a primary source, not run; **inferred** = reasoning.

## Decision

One typed tool registry over the Studio's own functions (`app/src/studio/automation/tools.ts`), published by two
browser-native adapters with no server (`bridge.ts`):

1. **WebMCP** on `document.modelContext` (falling back to `navigator.modelContext` for early builds): the standards path.
2. **`window.pixeldoll`**: the same tools for agents that drive a page by script. Today this reaches more agents.

Frame evidence is drawn over the page and seen through the agent's own screenshot tool; base64 only on request.

Why not WebMCP alone: no browser ships it on by default (tested: Chrome 157 stable and the Claude app's Chromium 156 have
neither `document.modelContext` nor `navigator.modelContext`), Claude has no WebMCP consumer (documented), and Codex CLI did
not pick up page tools mid-session (tested). Why not a server or extension: both clients that worked needed nothing but a
browser tool they already had, and a relay for web or mobile agents would need someone's server (inferred: a tab cannot
accept connections). Why not UI clicking: the tools reach the same functions with validation, give structured results,
and inspect a whole move in one call (see Performance).

## Technology comparison

| Approach                                  | Reach today                                                                                                                                                                          | Setup                          | Images to the model                                                   | Infrastructure     | Verdict                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | --------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------ |
| WebMCP (page tools)                       | Playwright MCP with the WebMCP feature (tested), DevTools MCP experimental (documented), ChatGPT app browser (documented)                                                            | A browser flag or origin trial | Results are JSON strings; Playwright MCP passes them as text (tested) | None               | Ship; future default                                                           |
| `window.pixeldoll` (page script)          | Every agent with a page-script tool: Claude in Chrome and Claude app browser, Playwright and DevTools MCP, IDE browsers (tested for Claude app browser and Codex via Playwright MCP) | None                           | Via screenshot of the page (tested)                                   | None               | Ship; widest reach now                                                         |
| Generic UI automation (clicks, snapshots) | Every browser agent                                                                                                                                                                  | None                           | Screenshots                                                           | None               | Fallback only: many calls, no validation, brittle                              |
| Custom local MCP server (CDP to Chrome)   | MCP clients                                                                                                                                                                          | Install and configure          | Could return real image blocks                                        | Local process      | Not built: Playwright MCP already covers it                                    |
| Browser extension                         | Chrome desktop                                                                                                                                                                       | Install, store review          | Depends                                                               | Store listing      | Not built: no gain over the page itself                                        |
| Remote MCP or relay                       | Web and mobile chat apps                                                                                                                                                             | Account, hosting               | Yes                                                                   | A permanent server | Rejected: violates the no-server goal                                          |
| MCP Apps                                  | Hosts that render MCP UI                                                                                                                                                             | A host-side MCP server         | n/a                                                                   | Server             | Not relevant: it embeds UI in a chat, it does not let an agent drive PixelDoll |

## Compatibility (model and harness are separate)

| Client (harness)                               | Model used          | Native WebMCP                             | Page script                               | Images seen                    | Result                                                                                                              |
| ---------------------------------------------- | ------------------- | ----------------------------------------- | ----------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Claude app built-in browser (Claude Code tab)  | Opus 5.5            | No (tested)                               | Yes                                       | Yes, screenshot (tested)       | **Works** with `window.pixeldoll`: every read tool, sheets, budget dialog                                           |
| Claude in Chrome (Claude Code, Claude desktop) | Opus 5.5            | No (tested, Chrome 157)                   | Yes, main world (tested on pixeldoll.app) | Screenshots (documented)       | Expected to work once deployed; the full call was not run because that Chrome could not open this machine's preview |
| OpenCode 2.2.6 + Playwright MCP 0.0.86         | DeepSeek v4.1 Flash | Yes, `webmcp_*` tools (tested)            | Yes                                       | Yes, screenshot (tested)       | **Works**: called overview and inspect_item natively, saw the sheet, named a real defect                            |
| Codex CLI 0.167 + Playwright MCP 0.0.86        | GPT-6.2 Sol         | No: ignores `tools/list_changed` (tested) | Yes, `browser_evaluate` (tested)          | Yes, screenshot (tested)       | **Works** through `window.pixeldoll`; needs MCP auto-approval for `codex exec`                                      |
| Gemini CLI 0.52                                | Gemini              | n/a                                       | n/a                                       | n/a                            | **Blocked**: this account's free tier was refused ("client no longer supported", tested)                            |
| Chrome DevTools MCP 1.13                       | any                 | Experimental flag (documented)            | `evaluate_script` (documented)            | `take_screenshot` (documented) | Not run                                                                                                             |
| ChatGPT desktop browser                        | GPT                 | Yes, "site tools" (documented)            | Not documented                            | Not documented                 | Not run                                                                                                             |
| Gemini in Chrome                               | Gemini              | Announced, not shipped (documented)       | No                                        | n/a                            | Not available                                                                                                       |
| T3 Code                                        | any                 | Not found                                 | Preview evaluate tool (project notes)     | Screenshot                     | Not run; same path as Claude's browser                                                                              |
| Claude web and mobile apps                     | Claude              | No                                        | No browser tool                           | n/a                            | Not possible without a server                                                                                       |

Gemini models remain reachable through other harnesses (OpenCode lists Gemini models); not run.

## Browser and WebMCP status

- The spec is a W3C Community Group draft (19 Nov 2026), not on the standards track. The entry point moved to
  `document.modelContext`; `navigator.modelContext` was removed in Chromium, and PixelDoll's fallback to it serves
  Firefox's pref-gated implementation. Methods: `registerTool(tool, {signal})`,
  `getTools`, `executeTool`; unregister by aborting the signal. Annotations `readOnlyHint` and `consequentialHint`.
  No progress, streaming, image type or user-consent API. Errors thrown by a tool reach the agent as a bare
  `OperationError`, so PixelDoll returns errors as data (documented, and tested through Playwright MCP).
- Chrome: origin trial from M149, approved through M156, plus `chrome://flags/#enable-webmcp-testing`. An extension to
  M162 is proposed with conditional LGTM, not final (corrected in iteration 4). Edge: origin trial to 2027-03-30.
  Firefox has an experimental implementation behind `dom.modelcontext.enabled`; WebKit states a position of oppose.
  Not enabled in Chrome 157 stable (tested).
- An origin-trial token on pixeldoll.app (a meta tag works on GitHub Pages) would turn the tools on for ordinary Chrome
  and Edge visitors without a flag; registering one is an owner decision (inferred). It does not help an automation
  browser started by Playwright MCP or DevTools MCP, which needs `--enable-features=WebMCP` (verified 2026-11-22).

## Proof-of-concept results

| Test                  | Result                                                                                                                                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Public website     | The tools ship in the production build (`npm run build`, served on 127.0.0.1:5208) and register from the page alone. Deployment to pixeldoll.app follows the next push to main                                                                            |
| B. No local install   | The working clients used only a browser tool: nothing from this repository                                                                                                                                                                                |
| C. Character creation | Keyless: `create_character` and `create_item` dry runs return validation and price; a real start is refused with `needs_user` while PixelLab is not connected (e2e). A paid run was not authorized for this task, so the paid start path is untested live |
| D. Image inspection   | Composites, item layers alone, all directions and all frames of a move: tested in e2e (PNG checked) and by three agents via screenshot. PixelLab originals and pre-extraction frames are not exposed yet                                                  |
| E. Autonomous repair  | Not covered: no repair tools yet. Agents did spot a real artifact (detached pixels in the demo sword's east and west walk frames 4–7)                                                                                                                     |
| F. Long jobs          | `create_*` return at once with an id; `get_activity` and `wait_for_activity` poll the Studio state that survives reloads (iteration 4 replaced the wait tool with `get_activity`'s `waitSeconds`). Not run against live jobs                              |
| G. Interoperability   | See the compatibility table                                                                                                                                                                                                                               |
| H. Tabs               | Tools act in their own tab; paid starts refuse in a tab that does not run the jobs; budgets never cross tabs or reloads. Not tested with two tabs                                                                                                         |
| I. Mobile             | Not tested (no devices). No agent can call page tools on iOS; Android Gemini auto browse only taps and types (documented)                                                                                                                                 |
| J. Performance        | Below                                                                                                                                                                                                                                                     |

## Performance (production build, Claude app Chromium, demo character, median of 5)

| Call                                                                     | Time         | Result size                                    |
| ------------------------------------------------------------------------ | ------------ | ---------------------------------------------- |
| `pixeldoll_overview`, `get_activity`, `inspect_character` without images | under 1 ms   | 0.3 to 3.9 k chars                             |
| `inspect_character` (standing sheet)                                     | 70 ms        | 3.9 k chars + sheet in page                    |
| `inspect_item` (2 sheets, walk, 4 directions x 8 frames)                 | 79 ms        | 0.6 k chars + sheets in page                   |
| `render_frames` (walk)                                                   | 138 ms       | 0.3 k chars + sheet in page                    |
| Same with `imageData`                                                    | similar      | 130 to 134 k chars (PNG sheets of 76 to 98 KB) |
| One tool call through Playwright MCP (round trip)                        | about 520 ms |                                                |

Tools load after the Studio (a 31 KB chunk, off the startup path), in about 0.3 s after navigation; heap 21 MB on the demo.
Checking one item across a whole move takes two agent calls (`inspect_item`, screenshot); through the UI an agent would
open the item, step each of 32 frames and capture each (inferred: about 35 or more calls).

## Remaining work

- Tools for adding moves, frame repair, redraws and revisions (the logic lives in Svelte sheets today and must be moved
  into shared functions first, to avoid copying it).
- PixelLab originals and pre-extraction frames as evidence, for telling generation faults from extraction faults.
- Live paid test of `create_character` and `create_item` within an approved budget; two-tab test.
- Origin-trial token decision; ChatGPT site tools, DevTools MCP and mobile checks.

## Iteration 2

**Team.** Three leads worked in parallel: Opus 5.5 medium (Claude), Codex GPT-6.2 Sol medium through `codex exec`, and
DeepSeek v4.1 Flash low through OpenCode.

**Steps.**

1. **Research.** Each lead independently re-checked the WebMCP spec and browsers, every client route, the alternatives
   and the mobile situation rather than trusting iteration 1.
2. **Critiques.** All three reviewed the shipped code adversarially (correctness, budget holes, evidence quality, tool
   design, tests, docs accuracy) against one brief, without editing.
3. **Plan.** The critiques merged into one plan with three tracks: tool core, evidence, moves.
4. **Competing prototypes.** Isolated git worktrees held rival branches: core (Opus against Codex), evidence (Codex
   against DeepSeek), moves (Opus only). Leads ran type checks and their own unit tests, not the end-to-end suite.
5. **Judged picks.** An independent judge per track read the branches and chose a base, then listed ports and gaps.
   - Core: Opus base. Its receipts, serialization and budget ledger were more complete; Codex's job-error policy and
     immediate start ids were ported, and the judge's defects were fixed during integration.
   - Evidence: Codex base, for the shared crop and the detached-pixel digest; DeepSeek's fit-all-sheets zoom, page cap,
     digest boxes and device-pixel labels were ported. Its 4-connected parts, composite coverage and async re-encode
     panel were rejected.
   - Moves: Opus. Integration fixed its judge findings: acceptance receipt from the Studio, quote recheck before
     reserving, a loop regression, the skeleton probe timeout, and accept and discard review tools.
6. **Integration.** One branch per track merged in order; real agents reran against a production build.

**Real-agent results** (production build, 127.0.0.1:5208, keyless: dry runs and reads only, no generations spent).

| Client and model                      | Route                              | What it did                                                                                                          | Result                                                                                                                                     |
| ------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude app built-in browser, Opus 5.5 | `window.pixeldoll`                 | 11 calls: overview, copy, open, inspect character, inspect item, set outfit, set color, undo, item dry run, activity | All read and edit calls ok; item dry run 10 generations, about $0.06; saw sheets and the digest; `add_move` refused on a demo copy         |
| OpenCode 2.2.6 + DeepSeek v4.1 Flash  | Playwright MCP, native `webmcp_*`  | 25 native tools available, 16 page calls, two sheets read in one screenshot                                          | Read 12 frames with 2 to 8 px detached parts near the hilt; scarf dry run 10 generations, about $0.06; `add_move` needs a rigged character |
| Codex CLI 0.167 + GPT-6.2 Sol         | Playwright MCP, `browser_evaluate` | 13 calls through `window.pixeldoll`; no mid-session tool reload                                                      | Matched the digest, saw the sheets; scarf dry run 10 generations, about $0.06; confirmed rig setup is disabled for a demo copy             |

**Research corrections** (re-verified 2026-11-22).

- Chrome's trial ran past M149. Iteration 4 corrected the reported end: it is approved through M156, with an extension
  to M162 still proposed, and 2027-03-30 is Edge's end date.
- Edge's trial runs to 2027-03-30. Brave Leo lists WebMCP in 1.102.2.
- Firefox has an experimental implementation behind `dom.modelcontext.enabled`, not a standards position only.
- WebKit states a position of oppose.
- Gemini CLI ended individual account authentication in June 2026; Antigravity and enterprise paths remain.
- ChatGPT Atlas was retired on 2026-08-09; the desktop app's site tools are the route now.
- Claude web and mobile have a cloud browser beta, separate from the person's local library.
- Android can be driven from a desktop through Chrome DevTools MCP over `adb`; iOS still has no route.

## Iteration 3

**Team.** Same three models. This round was audit only, then implementation in two isolated worktrees.

**Steps.**

1. **Three blind audits.** Each model re-verified the time-sensitive research and challenged every iteration 2 decision.
   Two high findings led: queued agent work could submit under a replaced PixelLab account, and `accept_move` could
   decide a candidate the agent never inspected.
2. **Merged fixes.** Budget and receipts track: bind paid dispatch to a non-secret credential identity, return
   `request_budget` immediately with a pending `activityId`, release unsent reservations after End, make targeted
   activity reads return only matched records, and replay paid starts before UI guards. Evidence and moves track: crop
   the item-alone sheet tight to the item, show one sheet at a time with End reachable, label shown and sheet scales,
   encode PNG only when `imageData` is asked for, report `addMove` readiness with a reason, bind decisions to an
   immutable `candidateId`, and return `equipmentToPose`.
3. **Integration.** Both tracks merged; 25 tools register. The three live agents then ran against the merged production
   build, keyless (table below).

**Real-agent results** (production build, 127.0.0.1:5208, keyless: dry runs and reads only).

| Client and model                      | Route                              | What it did                                                                                                          | Result                                                                                                                               |
| ------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Claude app built-in browser, Opus 5.5 | `window.pixeldoll`                 | 11 calls: overview, copy, open, inspect character, inspect item, set outfit, set color, undo, item dry run, activity | 11 ok except the expected `add_move` refusal; item sheet took 27 ms (was 126 ms); one sheet at a time, item crop at 2x of a 3x sheet |
| OpenCode 2.2.6 + DeepSeek v4.1 Flash  | Playwright MCP, native `webmcp_*`  | 15 native calls, 12 frames read from the digest                                                                      | Sheets legible at the shown 2x; scarf dry run 10 generations, about $0.06; `addMove` refused with the real reason                    |
| Codex CLI + GPT-6.2 Sol               | Playwright MCP, `browser_evaluate` | 11 calls through `window.pixeldoll`; no mid-session `webmcp_*` tools                                                 | Matched the digest (12 of 32 frames); noticed west mirrors east; scarf dry run 10 generations, about $0.06                           |

**Research corrections.** None: re-verification found no changed claims. The two high findings were in the shipped code,
and both were fixed before the runs.

**Remaining limits.**

- Accepting a move does not pose worn equipment onto it; the person does that in the Studio from each item.
- A demo copy can never get moves: it lacks the standing views rig setup needs, and agents cannot start rig setup.
- Paid starts are still untested live. Every agent run was keyless; only refusal, approval and End are covered, plus a
  mocked admission path in the end-to-end suite.
- ChatGPT site tools, Chrome DevTools MCP and the Android route were read from primary sources, not run.

## Iteration 4

**Team.** Same three leads: Opus 5.5 medium, Codex GPT-6.2 Sol medium through `codex exec`, and DeepSeek v4.1 Flash low
through OpenCode.

**Steps.**

1. **Three blind critiques.** Each lead challenged the shipped architecture, tool set, budget and security, evidence,
   harness interop, tests and docs, and re-verified time-sensitive research.
2. **Two implementation tracks in isolated worktrees.** Evidence and UI: metadata-only `inspect_character`, bounded
   on-demand sheets, whole-device-pixel fitting, a scroll cue, `missingItems` instead of hatching composites, outlines
   on every flagged frame, End reachable while a Studio sheet is open, and localized sheet labels. Receipts, moves and
   API: `get_activity` with `waitSeconds` in place of `wait_for_activity`, `pose_equipment`, explicit `set_outfit`
   changes with no-ops skipped, durable cross-tab receipts, `candidateId` only from `render_frames review: true`, and
   End stopping unsent work.
3. **Merged and verified.** 25 tools remain (`wait_for_activity` out, `pose_equipment` in). The agent-tools end-to-end
   spec passed locally on four cases, including budget approval in USD and a mocked move surviving reload. This round
   was review and implementation only; no live agent run was recorded.

**Research corrections** (re-verified 2026-11-22).

- Chrome's origin trial is approved through M156; an extension to M162 is proposed with conditional LGTM, not final.
  2027-03-30 is Edge's end date, not Chrome's.
- An origin-trial token does not enable WebMCP for Playwright MCP or Chrome DevTools MCP. Both need
  `--enable-features=WebMCP`; DevTools MCP passes it as `--chromeArg=--enable-features=WebMCP`.
- PixelDoll's `navigator.modelContext` fallback is for Firefox's pref-gated implementation, not an early Chromium build.
- Codex 0.171 has an experimental `mcp_tool_list_changed` option, off by default, so the no-mid-session-reload advice
  still holds.
- Gemini CLI personal accounts ended June 2026; Atlas was retired; Claude web and mobile have a cloud browser beta;
  Android works only through a desktop agent with DevTools MCP over `adb`. Unchanged since iteration 2.

**Remaining limits.**

- `pose_equipment` fills one item's missing frames on one saved move, one paid start at a time; it does not batch an
  outfit.
- A demo copy can never get moves: it lacks the standing views rig setup needs, and agents cannot start rig setup.
- Paid paths are still untested live. Every agent run was keyless; approval, refusal, End and a mocked admission path
  are covered, but no real generation was bought by an agent.
- ChatGPT site tools, Chrome DevTools MCP, the Android route and a phone were not run.

## Final decision

One typed tool registry over the Studio's own functions, published by two browser-native adapters with no server. This
keeps the app client-only and gives every client the same validation, pricing, queue, autosave and undo. Frame evidence
is drawn in the page because neither WebMCP nor script results reliably carry images to a model.

Rejected: a local MCP server (an install per person, and Playwright MCP already covers its reach), a browser extension
(store review for no gain over the page), a remote MCP relay (a permanent server, against the client-only rule), UI
clicking (many brittle calls, no validation), and MCP Apps (it embeds UI in a chat instead of driving PixelDoll).

WebMCP is the forward path, not the primary route yet: no browser ships it on by default. PixelDoll publishes it
first-class and falls back to `window.pixeldoll`, which reaches more agents today. Tested working: the Claude app's
browser through page script, and Playwright MCP, OpenCode and Codex CLI through their browser tools. Claude in Chrome is
documented for the same page-script route but its full call was not run. Worth keeping as fallbacks: page script for any
harness that evaluates JavaScript and screenshots, then UI clicking as a last resort. The whole thing needs no
infrastructure beyond the static GitHub Pages build.

The remaining limits above are accepted for this milestone: no live paid run, no on-device mobile, and the unrun
clients are documented rather than claimed.

### Iteration 4 real-agent results (final build, keyless, 2026-11-22)

| Client and model                    | Path                                                   | Calls                 | Result                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Claude app browser, Opus 5.5        | `window.pixeldoll`                                     | 11                    | All tools 0 to 57 ms; `inspect_character` metadata only; `set_outfit` no-op reported as `changed: false`                            |
| Codex CLI 0.167, GPT-6.2 Sol        | Playwright MCP `browser_evaluate` + `window.pixeldoll` | 11 (18 browser calls) | Sheets legible at 2x; digest matched (12 of 32 frames, "may be intentional"); scarf 10 generations, about $0.06; move refusal clear |
| OpenCode 2.2.6, DeepSeek v4.1 Flash | Playwright MCP                                         | 20 browser calls      | Sheets legible at 2x with ruler ticks; located the largest fragment (east frame 5, x 23, y 46); undo and outfit results clear       |

No agent reported a confusing result that iteration 4 did not already address. Iterations stopped at the owner's cap of four.
