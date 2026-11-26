# Automatic project-folder publishing: web first, native later

Follow-up to the [desktop shell study](../2026-11-25-desktop-shell/README.md) and its [project workflow](../2026-11-25-desktop-shell/project-workflow.md). This study tested opt-in automatic publishing: link a game asset folder once, edit a character, and the game sees the change at the same paths without Export. It also asks whether Windows, macOS or Linux editions earn their release cost. No PixelLab generations were used. The feature is now implemented as described in [Implementation](#implementation).

## Recommendation

**Build first: a Chromium "Project folder" in the Export sheet, with automatic updates.** Every requirement below passed with a real folder grant in Edge 158 on Windows 11. Keep ZIP export as the universal path. Ship **no native edition yet**. Windows Tauri stays the first candidate if the evidence listed at the end appears.

A project folder receives **individual files**, exactly the files the export ZIP would contain, written into `<picked folder>/<character export ID>/`. It is not a ZIP. Download ZIP stays available next to it in every browser.

| Platform | Support | Why |
| --- | --- | --- |
| Chrome, Edge, Opera and other Chromium browsers on Windows, macOS, Linux and ChromeOS | Project folder with automatic updates, plus ZIP | Documented API since Chrome 86. Windows passed real tests here. macOS and Linux use the same Chromium code but were not tested. |
| Brave | Same as Chrome once its flag is on, plus ZIP | Brave ships the same Chromium API switched off. With `brave://flags/#file-system-access-api` enabled and Brave restarted, it behaves like Chrome. With the flag off, Settings > Export explains how to turn it on. Nothing is forced. |
| Android Chrome | Shown where the browser offers it (Chrome 132 and later), untested | The API is present on Android according to browser compat data. Android storage providers lack atomic writes, so the per-file journal matters more there. No real Android game workflow was tested. |
| Firefox, Safari on macOS | ZIP only | Mozilla and WebKit oppose the API. The section does not appear. |
| iOS and iPadOS (every browser) | ZIP only | Apple requires every iOS browser, Chrome included, to use WebKit, which lacks the API. |
| Native Windows, macOS, Linux | None for now | Nothing tested requires it. See [the native case](#native-editions). |

## Design goals

1. **Purely additive.** The feature lives in its own modules and its own IndexedDB database. Where the browser cannot write folders, or in a workspace copy, nothing loads and nothing changes. A failure anywhere in it becomes a status line or one notice. It never throws into the app, blocks saving or Export, or touches the library.
2. **Simple Export, settings in Settings.** The Export window stays about choosing a format and downloading. It gets one "Project folder" button showing Off, On or Needs attention, which opens Settings > Export. That row holds everything: Choose folder, Update automatically, Publish now, Change and Stop. Text stays short; details appear only when something needs the user.
3. **Link once.** Choose a folder for the open character. PixelDoll writes into a subfolder named after the character's export ID, fixed at link time so a rename never moves files.
4. **Update automatically** (on by default after linking, can be turned off per character). A moment after each change, PixelDoll republishes. Only files whose bytes changed are written. An unchanged character writes nothing, because the manifest timestamp is reused until the files change.
5. **Never damage the game.** PixelDoll writes only the export's own paths and its `.pixeldoll-publish.json` index. Engine sidecars such as Godot `.import` and `.uid` files and Unity `.meta` files, scripts, scenes and other assets are never written, moved or deleted. Nothing is ever removed automatically. Identical files that were already there are taken over only on a publish the user started.
6. **Pause on conflict.** If a published file was edited in the game, a file PixelDoll did not write sits at a target path, or the index is damaged, nothing is written. Settings lists every file and offers Replace, which applies only to the exact bytes the user saw.
7. **Recover.** Each file is written atomically (the browser writes a temporary copy and swaps it in). A journal in the index lets an interrupted publish finish on the next try, even after repeated interruptions or an empty file left by a crash, without mistaking its own writes for game edits. The manifest is written last.
8. **Reconnect and relink.** When access lapses, Settings offers Reconnect and suggests "Allow on every visit". A moved or deleted folder asks to choose it again. Locked files and full disks say so.
9. **One at a time.** Publishes run one at a time per destination, across tabs, and each rechecks that its link still exists, so Stop in one tab is respected by the others. A change made during a publish runs next.
10. **One-way only.** The library is the source of truth. Nothing flows back from the folder.

## What "sync" should mean

| Meaning                                          | Verdict                                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One-way automatic publishing of generated assets | **Build.** The library in IndexedDB is the only source of truth. The folder is derived output with an ownership index.                                        |
| Versioned library backup and reviewed restore    | **Exists** (backup ZIP and reviewed restore). Cloud Save is tracked on its own card. A folder backup adds nothing a ZIP lacks except automation, so defer it. |
| Two-way sync of editable work                    | **Do not build.** Nothing in the folder is editable PixelDoll source. Engine import settings, scenes and scripts belong to the game.                          |

Only one inbound need is plausible: an artist touches up a published sheet in an external editor and wants it back in PixelDoll. Treat that as an explicit, reviewed "import edited sheet" that checks frame alignment against the base, not as sync. Wait for real demand. Deletions never propagate. A stale generated file is reported and removed only on request, and only if it still matches its published hash.

## Tests run

Edge 158.0.4370.33, Windows 11 Home 26200, a separate scratch profile driven over CDP. The native folder dialog and Edge permission prompts were real and answered through UI Automation window messages. Godot 4.7.2 console. The input was a real Studio Godot export of 351 files (`5a8ef136…`) from the earlier spike. The planner logic is in [plan.mjs](web-publish-spike/plan.mjs) and the browser adapter is in [app.js](web-publish-spike/app.js).

| #   | Test                                                                                    | Result                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Planner unit tests (`node --test plan.test.mjs`)                                        | 6 of 6 passed: create and adopt, foreign-file block, update only changed bytes, external-edit block, crash recovery that counts pending writes as owned, stale handling, sidecars outside the plan.                                                                                |
| 2   | Pick a folder under `%LOCALAPPDATA%`                                                    | **Refused** by Edge: "can't open this folder because it contains system files". Chromium blocks all of AppData, Program Files and Windows, plus the roots of home, Desktop, Documents and Downloads, and writes inside `.git`. Subfolders are fine.                                |
| 3   | Real grant of a home subfolder ("game one", with a space), then first automatic publish | Passed. 351 files created in **31.5 s** (about 11 files per second). Slow, so the first publish needs progress UI. The final "Allow" was pressed during a gap in automation and nobody confirmed who pressed it. The owner did not. Later prompts were answered by the automation. |
| 4   | Godot headless import                                                                   | Generated 327 `.import` files and 1 `.uid` file. Godot ignored the `.pixeldoll-publish.json` index because its name starts with a dot.                                                                                                                                             |
| 5   | Saved edit with **no user activation** (`navigator.userActivation.isActive` false)      | Published automatically in **1.8 s**: 2 updated, 349 unchanged. All 328 sidecars stayed byte-identical. Godot reimported, read the revised pixel, loaded the scene at the same path, played walk south with 9 textured layers, and kept the UID `uid://deccpqqt4ux1k`.             |
| 6   | Game-side edit to `godot/Paperdoll.tscn`, then a save                                   | **Blocked** with `edited-outside`. The full file hash set was unchanged, so nothing was written. After the edit was reverted, publishing resumed.                                                                                                                                  |
| 7   | Browser restart, regular tab                                                            | Permission returned `prompt`. A save reported `needs-reconnect` and wrote nothing. Reconnect showed Edge's restore prompt ("Allow this time", "Allow on every visit", "Don't allow").                                                                                              |
| 8   | "Allow on every visit", then another restart                                            | Permission returned `granted` with no prompt, and a save published automatically.                                                                                                                                                                                                  |
| 9   | Kill all Edge processes mid-publish (3 s per-file delay)                                | The sheet was new, the manifest old, and the journal pending. **No `.crswap` left behind.** On relaunch it recovered with no click (`recovering: true`, 1 update). Godot verified the pixel.                                                                                       |
| 10  | Manifest held open with no sharing                                                      | `NotReadableError` during hashing. Nothing was written.                                                                                                                                                                                                                            |
| 11  | Manifest held open read-only (write fails mid-publish)                                  | Sheet written, manifest failed with a misleading `InvalidStateError`, journal pending, no swap files. A retry finished only the manifest.                                                                                                                                          |
| 12  | Linked folder renamed while Edge was open                                               | `NotFoundError`. Nothing was created at the old path. `queryPermission` still said `granted`, so the app must treat `NotFoundError` as "relink". Moving the folder back resumed publishing.                                                                                        |
| 13  | Revocation                                                                              | CDP `Browser.resetPermissions` and Edge's site-level "Reset permissions" **did not** revoke the grant, even across a restart. Edge lists it under Site permissions > File editing. Removing it there was not automated. The app's not-granted path is covered by test 7.           |
| 14  | Hidden tab (another tab in front) and minimized window                                  | Both published with no click: 4.5 s and 2.9 s after the save. The longer time came from throttled timers.                                                                                                                                                                          |
| 15  | Two real Studio exports of the same character, seconds apart                            | 349 of 351 files were byte-identical. `manifest.json` and `godot/library.tres` differ only by `exportedAt` (from [generic.ts](../../../app/src/lib/export/generic.ts)). Without a fix, every republish rewrites both and makes Godot reimport the library.                         |
| 16  | FileSystemObserver on the linked folder                                                 | Supported. A create, modify and delete each arrived as a record. Live detection of game-side edits is possible on desktop Chromium.                                                                                                                                                |

Not tested: Unity (none installed; `.meta` safety follows from test 1 and the Godot run), a running Godot editor during publish, OneDrive or other cloud-managed folders (this machine's Documents is OneDrive), installed-PWA persistence, the background grant-expiry timer for one-time grants, macOS, Linux, ChromeOS and Android.

## Native editions

**The strongest case for native:** it reaches Firefox and Safari users, writes faster on first publish, adds Reveal in Explorer and file associations, and avoids the browser blocklist and grant prompts. None of these is a blocker for the core loop. Users without Chromium can install Chrome. The first publish is slow but happens once. Copy path covers most of what Reveal offers. Publishing with the Studio closed has no value, because edits only happen in the Studio. PixelLab jobs finish server-side and are fetched when the app opens. The tray and background service ideas fail for the same reason.

**The strongest case against, per OS** (from the native fact sheet):

- **Windows (Tauri, WebView2).** Closest to the web runtime, with a 7.4 MiB installer. Costs: Azure Artifact Signing from $9.99 a month (individuals only in the US or Canada), plus SmartScreen reputation that takes weeks even when signed. An updater signing key that cannot be lost. Installer upgrade tests. WebView2 can be tested with Playwright over CDP.
- **macOS (WKWebView).** $99 a year, Developer ID, notarization and hardened runtime. Since macOS 15, unsigned apps need a trip to System Settings. WebKit gaps must be qualified (CompressionStream and OffscreenCanvas need 16.4 or later; image clipboard is unverified). `tauri-driver` does not support macOS, and macOS CI minutes cost about ten times Linux minutes on private repositories.
- **Linux (WebKitGTK).** No signing is required, but the distro and package matrix is broad. Documented DMABUF and NVIDIA rendering bugs, and WebGL can fall back to software rendering. The updater covers AppImage only. Chrome already runs well on Linux, so native adds the least here.

A local CLI that applies an export ZIP to a project is credible for CI and scripted teams, using the same planner. It does not remove the download step from the interactive loop, so it comes after the web feature.

**Release burden if native is ever justified:** one frontend, a native adapter that implements the same planner interface (read hash, write file, remove), and tauri-action on GitHub Releases for Windows first. Add macOS only with a signing budget and a WKWebView qualification pass.

## Implementation

| Layer | Files | Role |
| --- | --- | --- |
| Planner | [plan.ts](../../../app/src/lib/project-folder/plan.ts) | Pure. Decides create, update, adopt, conflict, stale or remove per path from the export, the folder and the ownership index. Names only export paths and its own index. |
| Folder target | [target.ts](../../../app/src/lib/project-folder/target.ts) | Three operations (read, atomic write, remove) over a File System Access directory. Refuses paths that could leave the folder. A native shell or CLI could supply its own target. |
| Publisher | [publish.ts](../../../app/src/lib/project-folder/publish.ts) | Hashes, plans, journals, writes changed files (manifest last), commits the index. Returns an outcome and never throws. |
| Support check | [support.ts](../../../app/src/lib/project-folder/support.ts) | `supported`, `brave-disabled` or `unsupported`. Also refuses insecure pages and cross-origin frames. |
| Link storage | [links.ts](../../../app/src/lib/project-folder/links.ts) | One record per character (folder handle, subfolder, format, automatic updates, last timestamp) in its own `pixeldoll-project-folders` database, never in the library or its backups. |
| Studio state | [projectFolder.svelte.ts](../../../app/src/studio/projectFolder.svelte.ts) | Builds the open character's export as the Export sheet would, publishes one at a time per character (Web Locks across tabs), turns outcomes into status and at most one background notice per problem. |
| UI | [ProjectFolderButton.svelte](../../../app/src/studio/ProjectFolderButton.svelte), [ProjectFolderSetting.svelte](../../../app/src/studio/ProjectFolderSetting.svelte), [ProjectFolderAuto.svelte](../../../app/src/studio/ProjectFolderAuto.svelte) | Export's one button, the Settings > Export row (or the Brave hint), and an invisible watcher loaded on demand only in browsers that have the folder picker. |

Existing code changed only where it had to: Export mounts the button and the settings row, Settings search lists the row where it can appear, Export shares its moving-attack options through [exportLayering.ts](../../../app/src/studio/exportLayering.ts), the Studio lazily mounts the watcher, and `buildExport` accepts a fixed `exportedAt` and an uncompressed archive (folder publishing needs only the files).

Tests:

- **Unit** ([project-folder.test.ts](../../../app/test/unit/project-folder.test.ts)): planner cases, approval bound to the bytes seen, repeated interruption, an empty file from a crash, a damaged index that pauses, path safety, an in-memory folder that fails on chosen operations (locked manifest mid-publish, missing folder, lost permission, folder in the way), recovery from the journal, the index-only and disk-verified no-change checks, and browser detection (Chromium, Brave with the flag off, insecure page, frame, everything else).
- **End to end** (`npm run e2e -- export-picker -g "project folder"`): from Export's button into Settings, links a browser-private folder, publishes, checks that a repeat publish writes nothing, republishes after a saved color change, pauses on a file edited in the game with a notice whose Review opens Settings, replaces it, reconnects after lost permission, reports a deleted folder and stops. A second test removes the API and fakes Brave: no folder controls, the flag hint appears, and no page errors occur.
- **Real grant** (manual, Windows Edge): the spike driver in `web-publish-spike/` exercises the native picker and permission prompts. A browser test cannot complete a real picker grant.

## Independent challenge

GPT-6.2 Sol (medium) reviewed the prior research and code before these tests. It reached the same sequence: Chromium publishing first, ZIP everywhere, no native yet. It rated automatic publishing at moderate confidence until real grants, restarts and interruption were tested. Tests 3 to 14 now cover most of that. Its points that changed this design: stabilize `exportedAt` (confirmed by test 15), write the manifest last (adopted), and keep Android on ZIP. Its alternatives were an engine plugin, a Downloads-watching CLI, a loopback companion, a git flow, OPFS with a copy step, and an extension with native messaging. Each needs a second install or more steps than a remembered folder handle.

Disagreements:

- Sol treats background grant expiry as a main risk. With "Allow on every visit", tests 8 and 14 showed no prompt and no lapse. A one-time grant can still expire, so the reconnect banner stays.
- Sol proposed a five-user study to qualify native. I agree it is the right evidence. I would run it only after the web feature ships and real support requests exist.

## Evidence that would change this

| Finding                                                                                                                               | Change                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Chrome or Edge on macOS or Linux fails the real-grant smoke test                                                                      | Hold that OS to ZIP; consider native for it.                                                                |
| OneDrive or another cloud folder corrupts or locks publishes repeatedly                                                               | Recommend local folders and add guidance; native would not fix cloud locks either.                          |
| Godot or Unity editor imports a half-written revision and breaks references                                                           | Publish into a staging folder and swap it in, which changes the adapter design but not the platform choice. |
| Users with "Allow on every visit" still get re-prompted in normal use (for example, by Edge's "remove permissions from unused sites") | Weaker web case; reconsider Windows Tauri.                                                                  |
| Several frequent exporters are blocked in their browser (Firefox, Safari, managed policy)                                             | Qualify a Windows Tauri pilot with the same planner.                                                        |
| Artists repeatedly edit published sheets outside PixelDoll                                                                            | Add the reviewed sheet import, not sync.                                                                    |

Smallest follow-ups: run the real-grant smoke test once on macOS Chrome, Linux Chrome and a OneDrive folder. Test publishing with the Godot editor open and with a Unity project. Install the probe as a PWA to confirm automatic persistence.

## Reproduce

From `web-publish-spike/`:

1. Extract a Studio Godot export ZIP and run `node serve.mjs <extracted dir> 5288`.
2. `node drive.mjs launch "<msedge.exe>" <profile dir> http://localhost:5288/`, with `BROWSER_FLAGS="--disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows"` if other windows cover it. A covered window counts as hidden and drops CDP clicks.
3. `node drive.mjs click '#link'`, then `pwsh -File answer-dialog.ps1 -Folder <folder under your home>`. Answer prompts with `-Button '<name regex>'` and list them with `-List`.
4. Save an edit: `node drive.mjs eval "(async()=>JSON.stringify(await probe.saveEdit()))()"`. Read events with `node drive.mjs eval "JSON.stringify(__events)"`.
5. Verify in Godot with `../2026-11-25-desktop-shell/tauri-spike/verify-project.gd` and the pixel from `saveEdit`.

The automation briefly shows native dialogs on the desktop. Use a machine nobody is typing on.
