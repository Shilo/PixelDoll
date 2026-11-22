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
  `document.modelContext`; `navigator.modelContext` was removed in Chromium. Methods: `registerTool(tool, {signal})`,
  `getTools`, `executeTool`; unregister by aborting the signal. Annotations `readOnlyHint` and `consequentialHint`.
  No progress, streaming, image type or user-consent API. Errors thrown by a tool reach the agent as a bare
  `OperationError`, so PixelDoll returns errors as data (documented, and tested through Playwright MCP).
- Chrome: origin trial from M149 (approved through M156) and `chrome://flags/#enable-webmcp-testing`. Edge: origin
  trial to 2027-03-30. Safari and Firefox: standards positions only (documented). Not enabled in Chrome 157 stable (tested).
- An origin-trial token on pixeldoll.app (a meta tag works on GitHub Pages) would turn the tools on for Chrome and Edge
  users without a flag; registering one is an owner decision (inferred).

## Proof-of-concept results

| Test                  | Result                                                                                                                                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Public website     | The tools ship in the production build (`npm run build`, served on 127.0.0.1:5208) and register from the page alone. Deployment to pixeldoll.app follows the next push to main                                                                            |
| B. No local install   | The working clients used only a browser tool: nothing from this repository                                                                                                                                                                                |
| C. Character creation | Keyless: `create_character` and `create_item` dry runs return validation and price; a real start is refused with `needs_user` while PixelLab is not connected (e2e). A paid run was not authorized for this task, so the paid start path is untested live |
| D. Image inspection   | Composites, item layers alone, all directions and all frames of a move: tested in e2e (PNG checked) and by three agents via screenshot. PixelLab originals and pre-extraction frames are not exposed yet                                                  |
| E. Autonomous repair  | Not covered: no repair tools yet. Agents did spot a real artifact (detached pixels in the demo sword's east and west walk frames 4–7)                                                                                                                     |
| F. Long jobs          | `create_*` return at once with an id; `get_activity` and `wait_for_activity` poll the Studio state that survives reloads. Not run against live jobs                                                                                                       |
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
