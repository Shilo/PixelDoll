# Automatic project-folder publishing: web first, native later

Follow-up to the [desktop shell study](../2026-11-25-desktop-shell/README.md) and its [project workflow](../2026-11-25-desktop-shell/project-workflow.md). This study tested opt-in automatic publishing: link a game asset folder once, edit a character, and the game sees the change at the same paths without Export. It also asks whether Windows, macOS or Linux editions earn their release cost. No PixelLab generations were used. The feature is now implemented as described in [Implementation](#implementation).

## Recommendation

**Build first: a Chromium "Project folder" in the Export sheet, with automatic updates.** Every requirement below passed with a real folder grant in Edge 158 on Windows 11. Keep ZIP export as the universal path. Ship **no native edition yet**. Windows Tauri stays the first candidate if the evidence listed at the end appears.

A project folder receives **individual files**, exactly the files the export ZIP would contain, written into `<picked folder>/<character export ID>/`. It is not a ZIP, and PixelDoll adds no other file to the folder. Download ZIP stays available next to it in every browser.

| Platform                                                                              | Support                                                            | Why                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome, Edge, Opera and other Chromium browsers on Windows, macOS, Linux and ChromeOS | Project folder with automatic updates, plus ZIP                    | Documented API since Chrome 86. Windows passed real tests here. macOS and Linux use the same Chromium code but were not tested.                                                                                                                                                                                                                                           |
| Brave                                                                                 | Same as Chrome once its flag is on, plus ZIP                       | Brave ships the same Chromium API switched off. With `brave://flags/#file-system-access-api` enabled and Brave restarted, it behaves like Chrome. With the flag off, Settings > Export explains how to turn it on. Nothing is forced. Verified in real Brave on Windows: off by default (the hint appears), and with the flag on a real folder grant published 372 files. |
| Android Chrome                                                                        | Shown where the browser offers it (Chrome 132 and later), untested | The API is present on Android according to browser compat data. Android storage providers lack atomic writes, so the per-file journal matters more there. No real Android game workflow was tested.                                                                                                                                                                       |
| Firefox, Safari on macOS                                                              | ZIP only                                                           | Mozilla and WebKit oppose the API. No folder control appears anywhere (checked in Firefox 159 and WebKit with iPhone emulation, with no page errors).                                                                                                                                                                                                                     |
| iOS and iPadOS (every browser)                                                        | ZIP only                                                           | Apple requires every iOS browser, Chrome included, to use WebKit, which lacks the API.                                                                                                                                                                                                                                                                                    |
| Native Windows, macOS, Linux                                                          | None for now                                                       | Nothing tested requires it. See [the native case](#native-editions).                                                                                                                                                                                                                                                                                                      |

## Design goals

1. **Purely additive.** The feature lives in its own modules and its own IndexedDB database. Where the browser cannot write folders, or in a workspace copy, nothing loads and nothing changes. A failure anywhere in it becomes a status line or one notice. It never throws into the app, blocks saving or Export, or touches the library.
2. **Simple Export, settings in Settings.** The Export window stays about choosing a format and downloading. Below the formats, under its own "Game project" heading, one card button shows the folder's state (Not linked, Automatic updates on · Updated 2 minutes ago, Needs attention) and opens Settings > Export straight at the Project folder section through the reusable `openSettings(section, entry)` (it scrolls to, focuses and briefly highlights any `data-setting` row). That section holds everything: Choose folder, Update automatically, Update now (always available; it says "Already up to date" when nothing changed), Change folder and Unlink.
3. **Link once.** Choose a folder for the open character. PixelDoll writes into a subfolder named after the character's export ID, fixed at link time so a rename never moves files.
4. **Update automatically** (on by default after linking, can be turned off per character). A moment after each change, PixelDoll republishes. Only files whose bytes changed are written. An unchanged character writes nothing: an export time that reproduces the manifest already in the folder byte for byte (the link's last time, or the time that manifest records) is reused, so a timestamp alone never counts as a change. Each complete publish also stores a fingerprint of everything it built from and the hashes it produced, so a background check of an unchanged character skips building while still checking PixelDoll's record. The Export card shows the picked folder's name and the character's subfolder (browsers never expose a full path).
5. **Never overwrite the user's changes.** PixelDoll replaces a file only when it still holds exactly the bytes PixelDoll last wrote there, or bytes the user approved replacing. What PixelDoll wrote is recorded in PixelDoll's own browser storage right after each write, never in the folder, so nothing in the folder can claim ownership. Identical files that were already there stay the user's, except that right after choosing a folder PixelDoll offers once to keep such files updated (accepting re-checks each file's bytes first; files that differ still go through review). A folder holding the character's own earlier export is rebuilt with that export's time, so an unchanged character matches file for file. PixelDoll writes nothing but the export's own files, has no delete operation at all, and never names engine sidecars (Godot `.import` and `.uid`, Unity `.meta`), scripts or scenes.
6. **Pause and ask.** A published file edited or deleted in the game, a file PixelDoll did not write, or a folder where a file belongs pauses publishing before anything is written, with a notice that stays until dismissed. Settings lists every file and lists each file with why it differs and a Copy path button (browsers cannot reveal a file in the file manager), and offers **Replace listed files** (only the exact bytes listed; anything changed after the list appeared asks again) or **Keep existing files** (PixelDoll leaves those files alone from then on and publishes the rest; **Review kept files** undoes that). A folder in the way can only be kept or moved by the user. Each file is checked again with its new bytes staged, and its size and modified time are compared once more right before the browser swaps them in. The browser has no compare-and-swap (`createWritable`'s exclusive mode only blocks other writers inside the browser, and `close()` checks nothing), so a change landing in that final instant can still be lost, as can a same-size edit on a file system with coarse timestamps; expected-failure tests record these limits. A native app could close them by locking the file.
7. **Recover.** Each file is written atomically (the browser stages a temporary copy and swaps it in), and the record is updated file by file, so an interrupted publish simply plans again. Each path is marked pending in the record just before its write, and stays pending if the write fails after creating the file, so a file written (or created empty) just before a crash or failure is treated as the user's and asks first, even if it was deleted afterwards. The manifest is written last.
8. **Reconnect and relink.** When access lapses, Settings offers Reconnect and suggests "Allow on every visit". A moved or deleted folder asks to choose it again. Locked files and full disks say so.
9. **One at a time.** Publishes run one at a time per destination, across tabs, each in its own queue so one folder never holds up another. Each publish builds its own character from saved state once it holds the folder (the open character after its pending save; any other as last saved; nothing for a deleted character or one whose artwork cannot all be read), and rechecks the link before building and again before its first write, so Unlink or turning off Update automatically in one tab is respected by the others. A tab rereads the link when Export opens or the tab comes back into view. Problems, notices, approvals and reconnects are bound to the character and link they were made for and never carry over to another folder or character; only a publish that checked the folder clears a problem. Two characters cannot share one folder.
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

| Layer         | Files                                                                                                                                                                                                                                              | Role                                                                                                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planner       | [plan.ts](../../../app/src/lib/project-folder/plan.ts)                                                                                                                                                                                             | Pure. Decides create, update, restore, conflict or keep per path from the export, the folder and PixelDoll's trusted record.                                                                                                            |
| Folder target | [target.ts](../../../app/src/lib/project-folder/target.ts)                                                                                                                                                                                         | Three operations (read, atomic write, remove) over a File System Access directory. Refuses paths that could leave the folder. A native shell or CLI could supply its own target.                                                        |
| Publisher     | [publish.ts](../../../app/src/lib/project-folder/publish.ts)                                                                                                                                                                                       | Hashes, plans, writes changed files (manifest last) with a final check before each swap, and records each write. Returns an outcome and never throws. Never deletes.                                                                    |
| Support check | [support.ts](../../../app/src/lib/project-folder/support.ts)                                                                                                                                                                                       | `supported`, `brave-disabled` or `unsupported`. Also refuses insecure pages and cross-origin frames.                                                                                                                                    |
| Layout        | [layout.ts](../../../app/src/lib/project-folder/layout.ts)                                                                                                                                                                                         | The two parts of a picked folder (character subfolder, shared runtime) and how their records combine.                                                                                                                                   |
| Link storage  | [links.ts](../../../app/src/lib/project-folder/links.ts)                                                                                                                                                                                           | Per character: the folder handle, subfolder, format and automatic updates; per link: what PixelDoll wrote and what the user kept. Its own `pixeldoll-project-folders` database, never in the library, its backups or the user's folder. |
| Studio state  | [projectFolder.svelte.ts](../../../app/src/studio/projectFolder.svelte.ts)                                                                                                                                                                         | Builds the open character's export as the Export sheet would, publishes one at a time per character (Web Locks across tabs), turns outcomes into status and at most one background notice per problem.                                  |
| UI            | [ProjectFolderButton.svelte](../../../app/src/studio/ProjectFolderButton.svelte), [ProjectFolderSetting.svelte](../../../app/src/studio/ProjectFolderSetting.svelte), [ProjectFolderAuto.svelte](../../../app/src/studio/ProjectFolderAuto.svelte) | Export's one button, the Settings > Export row (or the Brave hint), and an invisible watcher loaded on demand only in browsers that have the folder picker.                                                                             |

Existing code changed only where it had to: Export mounts the button and the settings row, Settings search lists the row where it can appear, Export shares its moving-attack options through [exportLayering.ts](../../../app/src/studio/exportLayering.ts), the Studio lazily mounts the watcher, and `buildExport` accepts a fixed `exportedAt` and an uncompressed archive (folder publishing needs only the files).

Tests:

- **Unit** ([project-folder.test.ts](../../../app/test/unit/project-folder.test.ts), [project-folder-adversarial.test.ts](../../../app/test/unit/project-folder-adversarial.test.ts)): planner cases, path safety, and an adversarial suite (first written by GPT-6.2 Sol, which found 17 overwrites in the previous design) that edits, deletes, recreates or empties files at every moment of a publish, forges ownership files, reuses approvals, crashes between writing and recording, keeps files, and checks 1,024 files before writing any. Two expected-failure cases record the browser's final-instant limit.
- **End to end** (`npm run e2e -- export-picker -g "project folder"`): through the real Export button and Settings row, with a browser-private folder: publishing, an unchanged republish writing nothing, automatic updates, a game edit pausing with a lasting notice, Replace files, reconnecting, a missing folder, Unlink; a separate safety test with an edited earlier extract (nothing written), an approval made stale by a newer edit, a deleted file, a folder in the way, Keep mine and Update them, and untouched sidecars and game files; and a test with the API removed and Brave faked.
- **Real grant** (manual, Windows Edge): the spike driver in `web-publish-spike/` exercises the native picker and permission prompts. A browser test cannot complete a real picker grant.

## Shared runtime

Characters linked to one folder share their engine's runtime instead of each carrying a copy:

```
<picked folder>/
  pixeldoll-<engine>/      runtime code plus AGENTS.md and CLAUDE.md saying what the folder is (godot, phaser, phaser-ae, unity)
  <character subfolder>/    everything else, as before (data, sheets, engine data, README, AGENTS.md, docs)
```

- **Why.** Copies of runtime source per character are hard to keep consistent, and the same character in two
  subfolders (left behind by a relink) broke Unity with duplicate assemblies. Unity's shared runtime now has one stable
  namespace and assembly (`PixelDoll.Runtime`, `PixelDoll.Editor`) and imports every folder character by path. ZIP
  exports are byte-identical to before (golden-tested) and keep their own per-character runtime.
- **What stays per engine.** GDevelop embeds its controller in each character's `game.json` events, so it has nothing
  to share; PNG + JSON, Aseprite and RPG Maker have no runtime. Their folder output equals the ZIP's files.
- **One publish, two records.** A publish works on the picked folder: character files under the subfolder, runtime
  files under `pixeldoll-<engine>/`. One plan covers both before anything is written, so an edited runtime pauses the
  character too. The runtime is written first, then the character's images, resources and manifest. Each path is
  recorded in its own trusted record: the character's (per link) or the runtime's (per picked folder and engine, kept
  after unlink). Picked folders are remembered in their own store and matched with `isSameEntry`, so every link to
  one folder shares its runtime record.
- **Upgrades.** Each runtime has an integer revision, pinned to its bytes by a unit test. Before writing, a tab raises
  the folder's revision floor; a tab whose runtime is older than the floor stops with Reload instead of putting older
  runtime files back, also after an update that stopped part way. Newer runtimes must keep playing older character data
  ([contract](../../architecture/javascript-runtime.md#project-folder-runtime-compatibility)).
- **Locks.** Each publish holds its character's lock (`folder:<destination>:<subfolder>`), then the folder's runtime
  lock (`runtime:<destination>:<engine>`), always in that order. Folder publishing needs Web Locks.
- **Overlaps.** Picking a folder inside one PixelDoll manages is refused, and so is a Unity folder nesting with another
  that has a Unity runtime. Unity folders side by side in one game cannot be detected by a browser; see
  [known issues](../../known-issues.md).
- **Native checks** on the folder layout (two characters, the same character in two subfolders): Godot 4.7.1 root and
  nested picks with import, play and exported pack; Unity 6000.4 automatic import without a menu call, a ZIP copy
  alongside, and a player build; Phaser 3.80, 3.90 and 4.1 in Canvas and WebGL with one module; GDevelop 5.6.285 web
  export; Aseprite 1.3.18; RPG Maker MV 1.6.1; an offline PNG + JSON consumer; Phaser AE engine v3-82bf126 build and playback, with three
  dolls on one shared runtime and the README's scene imports from `game/scenes/`.

## Writing several files at once

The publisher reads and writes up to eight files at once (`AT_ONCE` in [publish.ts](../../../app/src/lib/project-folder/publish.ts)). The order is:

1. The shared runtime in `pixeldoll-<engine>/`, one at a time; if any fails, nothing of the character is written.
2. PNGs, eight at a time.
3. Godot's per-layer `.tres` resources, eight at a time.
4. Every other file, one at a time in export order.
5. The character's `manifest.json`, last.

Each phase waits for the previous one, so no index or scene lands before the files it names. Set `AT_ONCE` to 1 to go back to fully sequential publishing; nothing else depends on it.

**Why.** In Chromium, `close()` on a writable stream hashes the staged swap file and runs Safe Browsing and quarantine checks (Mark-of-the-Web on Windows) before the rename. That is about 55 to 66 ms per file and about 80% of a first publish. The time is mostly spent waiting on the browser, not on JavaScript, so a few writes in flight overlap it. Measured on Windows:

- a first publish of the demo went from 21 to 32 s down to about 4.7 s in Edge and 6.1 s in Brave (PNG + JSON);
- an edit went from 2.4 to 2.7 s down to 1.1 to 1.4 s;
- above eight writes at once, the gain was small.

**Why it is safe per file.** Each write keeps the same guarantees as before, independently of the others:

- a strictly durable PENDING mark is recorded before the write;
- the bytes are staged in that file's own swap file;
- that file is checked again just before its own swap;
- its final hash is recorded after.

Chromium gives each writable its own swap file and its own lock per path, and the File System Access spec allows several open writables on different files. When one file fails, no new write starts. A write still checking its staged bytes is given up, so its file keeps its old bytes. Writes already past the check finish and are recorded. Conflicts are reported in export order, whatever finished first. The known Chromium hazard (issue 40795015) is unbounded batches of thousands of writables; the bound of eight avoids it.

**Evidence.**

- Chromium source reading (DeepSeek 4.1).
- Real Edge and Brave runs on Windows (Opus 5.5): 22 publishes byte-identical to sequential ones with every record final, plus a locked file and an edit during a publish, both stopped cleanly.
- A three-way cross-review with Sol 6.2.
- The unit suites, including the adversarial one, run unchanged against the concurrent writer.

**Not tested:**

- Chrome on Android, where storage and Safe Browsing behave differently, so slow or flaky writes there should be checked first;
- macOS and Linux;
- network, cloud-synced (OneDrive) and removable drives.

If any of those fail or corrupt a publish, lower `AT_ONCE` for that platform, or set it to 1 everywhere.

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
