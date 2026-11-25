# Project-folder publishing for PixelDoll

## Recommendation

Build a small Tauri 2 Windows pilot around **Publish to project folder**. Keep ZIP export and the PWA available. Judge the pilot by whether it removes steps from the recurring loop between PixelDoll, a game editor, source control, and a coding agent. A saved destination and repeatable updates are more valuable than a native wrapper around the existing ZIP download.

Offer the same publishing workflow to Chromium users if the real folder-grant test succeeds. Chrome and Edge can read, create, and update files in a directory the user selects. Installed Chromium apps can retain a grant, subject to revocation and browser policy. This capability does not have broad browser coverage. OPFS is private to the browser and cannot give Godot or a local coding agent a path inside the user's repository. [Chromium File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) · [Persistent permissions](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api) · [Browser support](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)

The native edition earns its place when it provides a remembered project destination, reliable updates with native error and recovery handling, and a way to reveal the result in the file manager. Those features can work across installed browsers and without changing a user's preferred browser. A browser-independent editor beside Godot and a local coding agent has practical value. If Chromium provides an equally reliable repeat-publish workflow for the target users and they rarely need the native handoff, the PWA plus ZIP export is enough.

## The workflow to qualify

1. In the current Export sheet, pick a Godot, Unity, Phaser, or other supported format as today. Choose a project folder once. Show the exact relative output path and the files PixelDoll will manage before the first publish.
2. Write a generated asset subtree, such as `assets/pixeldoll/adventurer/`. Save the destination and export choices against that character. Keep the subtree stable if the user changes the displayed character name.
3. On the next explicit publish, show what changed. Rewrite changed generated files, leave equal files alone, and report externally edited files before writing. Preserve adjacent game code and the editor's import metadata. Treat removed generated paths as a separate operation with a clear review.
4. Give people a short project-relative path they can copy into an AI coding prompt. Offer Reveal in Explorer in the native edition. The exported manifest, engine helper and nested agent instructions already describe how to use the character. An agent can read those files with its existing project access. Store the absolute project location locally on each machine. PixelDoll needs no agent token, custom host service, or ability to run project commands.

A Godot scene, Unity prefab, or Phaser asset manifest can become a dependency of game code. Avoid dated output folders and changing import paths on every publish. Godot can generate import metadata next to original files, and Unity uses `.meta` files to preserve references. A replacement of the whole output directory would risk discarding those files. [Godot import process](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/import_process.html) · [Unity asset metadata](https://docs.unity3d.com/Manual/AssetMetadata.html) · [PixelDoll's exported agent guides](../../../app/src/lib/export/agent-docs.ts)

## Native features worth considering

| Feature | Value for PixelDoll | Placement |
| --- | --- | --- |
| Publish and republish to a working game project | High. Removes ZIP extraction, placement, and path drift from every edit-and-test cycle. | First pilot. Same export bytes in the PWA and desktop app. |
| Reveal published assets and copy a project-relative path | High when the user works across the editor, Explorer, and an AI coding session. | Put next to the publish result. Copy path works on the web too. |
| Explicit native open/save for library backups and selected reference art | Moderate. Improves movement between machines and art tools. Browser pickers cover many one-off cases. | Use existing import and restore review. Qualify recovery before promising automatic backups. |
| Open a published PNG in the system's configured editor | Potential value for manual art touch-ups. External edits need review before becoming a PixelDoll source again. | Test demand after the publish loop works. |
| Local automation from a coding session | Potential value for teams regenerating a project repeatedly. A standalone publisher can consume an existing PixelDoll ZIP without requiring a GUI bridge. | Evaluate separately if users want scripting. Avoid remote control of a running Studio, generic command execution, and stored AI credentials. |
| Automatic republish, file watchers, two-way folder sync | High failure cost. The game editor can already watch its assets. External changes can be legitimate game-side edits, partial copies, or conflicting authoring history. | Defer automatic writing and sync. Start with explicit, reviewed publishing and import. |
| Native menus, tray, updater, OS file associations | Release support or convenience. These do little for the core asset loop. Chromium PWAs also support file associations on some platforms. | Add when required by a demonstrated workflow or distribution channel. [Chromium File Handling](https://developer.chrome.com/docs/capabilities/web-apis/file-handling) |

## Evidence and trade-offs

On Windows 11, the bundled Studio published a Godot export with **351 files** into an isolated game project. Reapplying the identical package rewrote zero files. A synthetic revision rewrote one manifest, and a simulated external scene edit blocked the pending update before it changed another generated file. Godot 4.7.2 imported the final project, loaded the scene at its published path, played `walk` south, and found nine animated layers with textures. A post-import hash comparison found that the manifest was the only published file that differed from the export. Godot created 328 `.import` and `.uid` sidecars. Retaining actual editor sidecars on a later republish is a separate test. No PixelLab generations were used.

- The Tauri experiment starts with a real local Studio export, picks Godot, and sends the resulting ZIP through WebView2 to a native process. The process owns a fixed scratch project and publishes to a stable subtree. Readback compares hashes to avoid rewriting equal files or overwriting an external edit.
- The repeat scenario applies the same package and a synthetic revision that changes one manifest field. It checks that unrelated project files and a sidecar in the generated subtree survive, and rejects an externally modified generated scene. This is a narrower claim than synchronizing live edits, removed files, or formats other than Godot.
- The Rust experiment uses a same-volume staged file replacement. A sequence of individually replaced files can still leave a partial package after a crash, lock error, or racing external writer. An actual product needs a recovery journal, a concurrency policy, verified path containment at the filesystem-operation boundary, and a test for an engine reading while the pack changes. Never treat a read-before-write hash check as a concurrency guarantee.
- The Windows probe uses an isolated scratch location rather than a granted user folder. The existing Chromium probe has not completed a real directory grant because the preview intercepted the picker. The native pilot must prove a user-granted destination and reconnect. Native dialogs and reveal are supported by Tauri plugins, with permission scoping to verify in the pilot. [Tauri dialog](https://v2.tauri.app/plugin/dialog/) · [Tauri opener](https://v2.tauri.app/plugin/opener/) · [Shell and benchmark research](README.md)
- Manual ZIP extraction remains the universal baseline. A local CLI can offer similar automation once an archive exists, but it leaves asset creation and export in the web app and adds a separate install or invocation. A full Unity/Godot editor integration would add two maintenance surfaces. The first trial should use the generated engine package the app already supports.
- In the repeat workflow, the baseline involves downloading, extracting, and choosing where to place the new files. With a remembered Chromium handle or a native destination, the user can select Publish and review any conflicts. That is a comparison of designed steps. The experiment did not measure user time or adoption.

## Release decision

Use one publishing design and keep filesystem access behind narrow adapters. In the PWA, bind a directory handle chosen in a user gesture and confirm grant/reconnect on the supported browsers. In Tauri, hold the chosen root in the native process and scope the renderer to publishing or revealing that destination. The two adapters may differ in failure recovery and rename support. Preserve the existing ZIP as a fallback and use the existing reviewed library import for recovery.

Qualify the pilot with real users who make repeated changes to a game project. They should be able to publish twice from a fresh install, use the same scene or asset path in a local coding session, and recover when the folder is moved or a file is edited outside PixelDoll. Count steps and verify correctness against manual ZIP extraction and Chromium direct publishing. Ship the native edition if this proves a meaningful advantage. Keep automatic two-way sync outside that decision.

## Reproduce the native experiment

Build the shared app and the Tauri spike as described in the [shell study](README.md). From `tauri-spike/`, run `pwsh -NoProfile -File ./verify-project.ps1 -Executable <Tauri executable> -Godot <Godot console executable>`. The launcher creates a fresh test profile and scratch project. The check leaves the project available for inspection.
