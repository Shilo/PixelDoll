# Developer console: research spike and recommendation (2026-11-23)

Board card: "Add a developer console for logs and full scripts". Related: "Let AI agents operate PixelDoll through
WebMCP" (unmerged branch `claude/pixeldoll-ai-agent-integration-ef0b01`), "Add a project skill to import and debug a
user workspace", "Hide API calls behind Developer mode".

**Team.** Opus 5.5 (lead, code reading and synthesis), Codex GPT-6.2 Sol at medium effort, and OpenCode DeepSeek 4.1
Flash at low effort, each briefed independently with the same problem and no shared conclusion. All three reached the
same verdict separately. Read-only spike: nothing was run, no generations were spent.

Labels: **verified** = checked in this repository's code or history; **inferred** = reasoning.

## The real problem

A friend uses the production app at pixeldoll.app and keeps hitting issues. Today's loop: the friend sends a backup,
the owner loads it, reproduces, fixes, pushes a release; the friend waits or works around it. The idea was an in-app,
lazy-loaded, Developer-mode-only JavaScript console so an AI conversation can hand the friend a snippet that fixes the
problem on the spot, with MCP-style tool calls later.

The slow part of that loop is **diagnosis** (the owner cannot see the friend's failing state), not running code. Most
fixes in recent history are code fixes (about 40 `fix(...)` commits since 2026-11-10, verified), which a snippet cannot
ship durably: it patches one session or one record, and the bug stays for everyone else.

## Findings

1. **A JavaScript console cannot run code in production as the app stands (verified).** `app/index.html` sets
   `script-src 'self'` with no `'unsafe-eval'`, so `eval`, `new Function` and `blob:` scripts are blocked. The options
   are adding `'unsafe-eval'` for every visitor (a real regression on an origin that keeps a plaintext PixelLab token in
   `localStorage`), shipping a JavaScript interpreter written in JavaScript (a large lazy chunk, slower, a new
   dependency), or a same-origin worker loophole (rejected: it is a CSP bypass). The Chrome DevTools console is not
   bound by the page's CSP (inferred from documented Chrome behavior; recheck before relying on it).
2. **The card contradicts the goal (verified).** The card says "keep it out of production builds", but the friend runs
   production. `developerModeEnabled()` is the device-local switch that works in production; `localDeveloperToolsEnabled()`
   also requires `import.meta.env.DEV`, so it never reaches the friend. Note that Developer mode is a `localStorage` flag
   any same-origin script can set: it is a UX gate, not a security boundary.
3. **Backups carry the character data but no error details (verified, corrected 2026-11-23).** Library backup
   (`exportBackup`, commit `4165f841a`) replaced the workspace export and holds every character with its artwork, plus
   kept incompatible-data archives. The old workspace ZIP additionally held the demo outfit, export settings, the open
   view and an opt-in digest of recent failed jobs and API calls (`recentWorkspaceErrors`: tool, HTTP status, error code,
   message). Neither ever held the job queue, drafts, preferences or credentials. So a backup reproduces data problems,
   but the owner loses the failure record. `exportWorkspace` now has no UI caller.
4. **The automation branch already gives AI the typed API a console would want (verified on the branch).**
   `app/src/studio/automation/` registers 25 tools as WebMCP and as `window.pixeldoll`, loaded lazily after the Studio and
   not gated by Developer mode. On desktop, an AI-written snippet can call `await pixeldoll.call('inspect_character', ...)`
   from DevTools today, and an agent with a browser tool (Claude in Chrome, the ChatGPT app browser, Playwright MCP) can
   drive the friend's own tab. It has no integrity check or repair tool, and no on-device route on phones or iPad.
5. **The app already has the sanitizing pieces (verified).** The public report builder (`app/src/lib/report/report.ts`,
   `ReportDialog.svelte`), the `error` and `unhandledrejection` handlers, API activity sanitizing
   (`app/src/lib/pixellab/activity.ts`; it keeps artwork and keypoints, so it is too rich for a shareable default) and
   `problemSummary.ts`, which already sorts failures into known kinds.

## In-app console versus DevTools

What an in-app console adds: it reaches phones, iPad and the installed PWA where DevTools is absent; it can show logs
captured _before_ the user opened it; it can import modules directly instead of needing a published global; it can
offer one-click copy of a redacted report.

What it costs: the CSP decision above; a sanctioned "paste this here" target for social engineering (Chrome's DevTools
asks a new user to type "allow pasting" first; an in-app console removes that friction); any snippet can read the token
and spend credits, and undo cannot reverse either; out-of-band writes skip `db.ts` transactions, Web Locks and undo,
and with no migrations a bad hand-written record can break a character; a "fixed" friend whose data no longer matches
any code path makes the next support round harder. Every advantage except mobile reach can be had without running
arbitrary code.

## Options ranked

| Rank | Option                                                                                                                                                 | Value for the friend                               | Effort | Risk       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ------ | ---------- |
| 1    | **Debugging backup**: a Developer-mode toggle that makes Library backup add a `debug/` folder with the log, job ledger, API activity, drafts and state | Highest: one file holds the data and every failure | M      | Low        |
| 2    | **A skill that diagnoses any user report** (backup with or without `debug/`, problem report, pasted errors) and fixes, tests and commits               | High: the owner no longer reproduces by hand       | M      | Low        |
| 3    | **Doctor and named repairs**: read-only integrity checks, then allow-listed repairs with dry-run diff, one transaction and an undo entry               | High once a repair repeats; helps every user       | M      | Low        |
| 4    | **Repair packs**: a JSON file of named repair steps with preconditions; the friend drops it in, sees the plan, confirms                                | Medium: carries a multi-step fix without a release | M      | Low to mid |
| 5    | **Merge the automation branch** and add `diagnose` and repair tools to it, so the friend's own AI browser agent can inspect and repair                 | Medium on desktop with an agent; none on iPad      | M      | Medium     |
| 6    | **Raw JavaScript console** in production                                                                                                               | Low beyond mobile reach                            | M to L | High       |

Also considered and dropped: a "Copy for AI" button (the debugging backup already carries everything it would, and the
loop runs through the owner), WebRTC remote control of the friend's tab (screen sharing already covers live help;
pairing and signaling would need a server), feature-flagged hotfixes (cannot deliver code the friend's build lacks; main
already deploys in minutes after CI), session replay (privacy and size; the debug log covers the useful part).

## Recommendation

**Do not build the raw JavaScript console now.** Build a small support kit and let real incidents pull the later steps
in:

1. **Debugging backup (option 1), implemented 2026-11-23.** Settings > Library shows "Include debugging details" while
   Developer mode is on. With both on, every Library backup adds `debug/` (`app/src/lib/debug/bundle.ts`): environment,
   Studio state, the log of errors, warnings and shown problems (`log.ts`, started before the app loads and kept across
   reloads while the setting is on), API activity, the job ledger, drafts and the character fields a normal backup
   leaves out, storage, an artwork inventory and the images only drafts and jobs use. Everything passes one sanitizer
   (`sanitize.ts`: keys, inline images and URL queries removed); restore and Open as a copy ignore the folder. If the
   details cannot be gathered or make the ZIP too large, the backup still saves the characters with `debug/failed.txt`.
2. **The diagnosis skill (option 2)**: see the [handoff](../../handoff/debug-user-report-skill.md).
3. **Doctor (option 3)**, starting read-only: manifest and version, missing artwork references, stuck or orphaned jobs.
   Add each repair only when a real incident shows it, with dry-run, transaction, revision recheck and undo. One
   dispatcher serves the settings panel, a dropped repair pack (option 4) and, once merged, a WebMCP tool.
4. **For one-off code experiments**, the owner's AI writes a snippet against `window.pixeldoll` and the friend runs it in
   desktop DevTools. Document that path; do not build UI for it.
5. **Revisit the console** only if a real case cannot be handled by 1 to 4 and the friend is on a device without
   DevTools. Even then, make it run named repairs and tool calls through the same dispatcher, not `eval`, so the CSP
   stays as it is.

Gating: `developerModeEnabled()`, never `localDeveloperToolsEnabled()`. Developer mode is a `localStorage` flag, a UX
gate rather than a security boundary.

## Open questions for the owner

- Which device and browser does the friend use? Desktop Chrome makes the DevTools route and the agent route viable;
  iPad or phone makes in-app tools the only route.
- `exportWorkspace` in `app/src/lib/store/workspace.ts` has no UI caller since commit `4165f841a`; only tests use it.
  Remove it, or keep it for the tests?
