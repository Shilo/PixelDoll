# Project-folder publishing for PixelDoll

## Recommendation

Build **Publish to project folder** as a shared workflow. Qualify the Chromium path first. Keep ZIP export available across browsers, and keep Tauri 2 as the Windows candidate if users need a downloadable edition or the browser path leaves a real gap. The workflow removes steps from the recurring loop between PixelDoll, a game editor, source control, and a coding agent. The tested publishing logic can work in a browser adapter, a native app, or a local CLI.

Chrome and Edge can read, create, and update files in a directory the user selects. Chrome documents automatic persistence after a grant in installed web apps, subject to revocation and browser policy. The real Windows grant and reconnect still need verification for PixelDoll. This capability does not have broad browser coverage. OPFS is private to the browser and cannot give Godot or a local coding agent a path inside the user's repository. [Chromium File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) · [Persistent permissions](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api) · [Browser support](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)

A native edition could support users whose preferred browser lacks directory access, provide a consistent installed workflow, and reveal the result in the system file manager. Chromium can already remember a destination. The shell experiment did not test native folder grants, reconnect, or better recovery than Chromium. Treat native distribution and cross-browser reach as potential benefits and weigh them against maintaining a second release.

## The workflow to qualify

1. In the current Export sheet, pick a Godot, Unity, Phaser, or other supported format as today. Choose a project folder once. Show the exact relative output path and the files PixelDoll will manage before the first publish.
2. Write a generated asset subtree, such as `assets/pixeldoll/adventurer/`. Save the destination and export choices against that character. Keep the subtree stable if the user changes the displayed character name.
3. On the next explicit publish, show what changed. Rewrite changed generated files, leave equal files alone, and report externally edited files before writing. Preserve adjacent game code and the editor's import metadata. Keep stale generated files by default and show them in the plan. Review removal separately and only remove a file that still matches its last published hash.
4. Give people a short project-relative path they can copy into an AI coding prompt. Offer Reveal in Explorer in the native edition. The exported manifest, engine helper and nested agent instructions already describe how to use the character. An agent can read those files with its existing project access. Store the absolute project location locally on each machine. PixelDoll needs no agent token, custom host service, or ability to run project commands.

A Godot scene, Unity prefab, or Phaser asset manifest can become a dependency of game code. Avoid dated output folders and changing import paths on every publish. Godot can generate import metadata next to original files, and Unity uses `.meta` files to preserve references. A replacement of the whole output directory would risk discarding those files. [Godot import process](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/import_process.html) · [Unity asset metadata](https://docs.unity3d.com/Manual/AssetMetadata.html) · [PixelDoll's exported agent guides](../../../app/src/lib/export/agent-docs.ts)

Keep a separate ownership index per character destination. An existing manually extracted export needs an explicit adoption review or a separate destination. The spike exercises only one new test subtree. This proposed stable update behavior differs from the earlier Electron prototype, whose folder export makes a fresh suffixed directory on collision.

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

On Windows 11, the bundled Studio published **351 files** into an isolated Godot project. A synthetic revision updated one walk-sheet pixel and the manifest. Both the original package and its revision wrote zero files on identical reapply. The omitted export README survived, and an external scene edit prevented other pending writes. A final hash comparison found exactly two changed files. Godot 4.7.2 checked the revised pixel, loaded the scene at the same project path, played `walk` south, and found nine textured animated layers. No PixelLab generations were used.

- The Tauri experiment starts with a real local Studio export, picks Godot, and sends the resulting ZIP through WebView2 to a native process. The process owns a fixed scratch project and publishes to a stable subtree. Readback compares hashes to avoid rewriting equal files or overwriting an external edit.
- The repeat scenario checks that unrelated project files and a synthetic sidecar survive. The original Godot import generated 328 `.import` and `.uid` files. A further engine test must republish after actual sidecars exist and check that resource identifiers stay stable.
- The Rust experiment flushes staged files before same-volume replacement. A sequence of individually replaced files can still leave a partial package after a crash, lock error, or racing external writer. A user-facing publisher needs a recovery journal, a concurrency policy, verified path containment at the filesystem-operation boundary, and tests with engine, antivirus, or sync-client file locks. The scratch probe refuses an existing game directory or leftover stage rather than adopting or cleaning it.
- The Windows probe uses an isolated scratch location rather than a granted user folder. The existing Chromium probe has not completed a real directory grant because the preview intercepted the picker. The native pilot must prove a user-granted destination and reconnect. Native dialogs and reveal are supported by Tauri plugins, with permission scoping to verify in the pilot. [Tauri dialog](https://v2.tauri.app/plugin/dialog/) · [Tauri opener](https://v2.tauri.app/plugin/opener/) · [Shell and benchmark research](README.md)
- Manual ZIP extraction remains the universal baseline. A local CLI can offer similar automation once an archive exists, but it leaves asset creation and export in the web app and adds a separate install or invocation. A full Unity/Godot editor integration would add two maintenance surfaces. The first trial should use the generated engine package the app already supports.
- In the repeat workflow, the baseline involves downloading, extracting, and choosing where to place the new files. With a remembered Chromium handle or a native destination, the user can select Publish and review any conflicts. That is a comparison of designed steps. The experiment did not measure user time or adoption.

## Release decision

Use one publishing design and keep filesystem access behind narrow adapters. In the PWA, bind a directory handle chosen in a user gesture and confirm grant/reconnect on the supported browsers. In Tauri, hold the chosen root in the native process and scope the renderer to publishing or revealing that destination. The two adapters may differ in failure recovery and rename support. Preserve the existing ZIP as a fallback and use the existing reviewed library import for recovery.

Start with the real Chromium grant, then test two edits and republishes to the same path across a restart. Confirm recovery after grant revocation, a moved folder, an external edit, and a failed write. Run the same workflow in native if target users cannot complete it in their preferred browser or identify a recurring task the native edition would remove. Keep automatic two-way sync outside that decision.

The independent DeepSeek V4.1 Flash Low review reproduced the original Godot run and independently tested a real PNG update and stable Godot import UID. It challenged the need for a desktop app and proposed a CLI first. The CLI is a credible fit for scripted users with an existing ZIP. For the editor workflow in this study, qualifying direct browser publishing addresses the extra download and extraction steps without requiring a separate command or binary.

## Reproduce the native experiment

Build the shared app and the Tauri spike as described in the [shell study](README.md). From `tauri-spike/`, run `pwsh -NoProfile -File ./verify-project.ps1 -Executable <Tauri executable> -Godot <Godot console executable>`. The launcher creates a fresh test profile and scratch project. The check leaves the project available for inspection.
