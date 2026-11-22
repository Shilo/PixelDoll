# Let an AI agent operate PixelDoll

PixelDoll publishes its own operations to AI agents from the page itself. There is no PixelDoll server, add-on or local
install: open the site in a browser your agent controls and it finds the tools. Research, tests and the decision record:
[research/2026-11-22-agent-automation](research/2026-11-22-agent-automation/README.md).

## How agents reach the tools

The page offers the same 17 tools two ways, both from `app/src/studio/automation/`:

| Channel                          | Who uses it                                                                                                                                                    | How                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| WebMCP (`document.modelContext`) | Agents whose browser supports WebMCP: Playwright MCP, Chrome DevTools MCP (experimental WebMCP tools), the ChatGPT app's browser                               | The tools appear by name (Playwright MCP: `webmcp_inspect_item` and so on)                                 |
| `window.pixeldoll`               | Any agent that can run script in the page: Claude in Chrome, the Claude app's browser, Playwright `browser_evaluate`, DevTools `evaluate_script`, IDE browsers | `await pixeldoll.call('pixeldoll_overview')`; `pixeldoll.help()` and `pixeldoll.tools()` describe the rest |

Frame sheets (labeled contact sheets of real frames, rows = directions, columns = frames, enlarged by whole pixels) are
shown over the page. The agent looks at them with its screenshot tool, which every browser agent has; tool results stay
small text. `imageData: true` also returns them as base64 PNG for clients that show those to the model.

## Setup by agent (checked 2026-11-22)

**Claude (Claude Code, Claude desktop).** Use Claude in Chrome or the Claude app's built-in browser. Ask Claude to open
https://pixeldoll.app/ and "use window.pixeldoll". Nothing else to install.

**Codex CLI, OpenCode, Cursor, any MCP client.** Add Playwright MCP with WebMCP turned on in Chromium. Save this as
`pixeldoll-browser.json`:

```json
{
  "browser": {
    "browserName": "chromium",
    "launchOptions": { "args": ["--enable-features=WebMCP"] }
  }
}
```

and register the server `npx -y @playwright/mcp@latest --config pixeldoll-browser.json` (add `--isolated` for a
throwaway profile; leave it out to keep your PixelDoll library and PixelLab connection between runs). After the agent
opens https://pixeldoll.app/ and takes a snapshot, the tools appear as `webmcp_*`. Clients that do not reload their tool
list mid-session (Codex CLI) still read them from the snapshot and call them through `window.pixeldoll` with
`browser_evaluate`. `codex exec` needs `-c 'mcp_servers.<name>.default_tools_approval_mode="approve"'` to call MCP tools
without an approval prompt.

**Chrome DevTools MCP.** `npx chrome-devtools-mcp@latest --categoryExperimentalWebmcp` with a Chrome that has WebMCP on
(`chrome://flags/#enable-webmcp-testing`); its `list_webmcp_tools` and `execute_webmcp_tool` reach the same tools.
`--autoConnect` drives the Chrome you already have open.

**ChatGPT desktop app.** Its built-in browser calls WebMCP tools natively ("site tools") where OpenAI supports them.
Not tested here.

**Phones.** No agent can call page tools on iOS or Android yet; see the research report.

## What agents can do

| Tool                                                       | What it does                                                                                                 | Cost |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---- |
| `pixeldoll_overview`                                       | Workflow guide, connection, open character, budget and running work                                          | Free |
| `list_characters`, `open_character`, `copy_demo_character` | Find, open, or make a free editable copy of the demo                                                         | Free |
| `inspect_character`                                        | Rig facts, moves, directions, categories, items with quality and cost, colors, outfits, drafts; outfit sheet | Free |
| `inspect_item`                                             | One item or draft: quality checks, cost, a sheet alone and worn on the base body for any move                | Free |
| `render_frames`                                            | Any outfit on any move as a sheet                                                                            | Free |
| `set_outfit`, `set_color`                                  | Wear items or drafts, take slots off, recolor by exact palette ramp; undoable                                | Free |
| `get_activity`, `wait_for_activity`                        | Drafts, creations and moves with progress; waits up to 110 s per call                                        | Free |
| `accept_draft`, `discard_draft`                            | Save or throw away a finished item draft                                                                     | Free |
| `accept_move`, `discard_move`                              | Save or discard a finished body move review                                                                  | Free |
| `export_character`                                         | Downloads a ZIP for the user with the Export settings                                                        | Free |
| `request_budget`                                           | Asks the user, in the page, to approve generations for the task                                              | Free |
| `create_character`, `create_item`                          | Start paid generation; `dryRun` returns the price and checks only                                            | Paid |
| `add_move`                                                 | Add a body animation or redraw views of a saved move; `dryRun` quotes the plan without opening the character | Paid |

Use the ID returned by `add_move` to follow its receipt in `get_activity` or `wait_for_activity`.
The result waits in move review before it becomes part of the character. Review it with the user before calling
`accept_move` or `discard_move`. Item frame repairs still use the item's repair menu in the Studio.

## Safety

- **One approval per task.** Paid tools refuse until the user approves a generation budget in a PixelDoll dialog
  (`request_budget`), which shows the agent's stated reason as a quote. Each paid start reserves its full estimate first,
  so the total never passes the approval. The budget lives in that tab's memory: a reload or another tab starts at zero.
- **Same safeguards as the buttons.** Tools call the Studio's own functions: price checks, plan tiers, the job queue's
  rule never to resend a paid request with an unknown outcome, the leader tab running jobs, autosave and Undo.
- **No credentials or raw data.** No tool reads or returns the PixelLab token, IndexedDB, or other apps' data. If PixelLab
  is not connected, paid tools tell the agent to ask the user to connect; agents never handle the token.
- **Untrusted input.** Every argument is checked against the tool's schema; text an agent writes is shown as plain text.
  Paid and discarding tools carry WebMCP's `consequentialHint` so agents confirm with the user first.
- **Limit.** An agent that can run arbitrary script in the page can also press the page's buttons, including the budget
  dialog's. The budget protects against agent mistakes, not against a hostile agent; only grant browser control to
  agents you trust, as with any browser automation.
