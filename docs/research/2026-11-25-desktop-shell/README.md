# PixelDoll desktop shell research

## Recommendation

The follow-up [game-project workflow study](project-workflow.md) tests native publishing and compares it with Chromium folder access and ZIP export.

Tauri 2 is the best candidate tested if PixelDoll needs an optional Windows edition. Its installer is small and the framework supports a narrowly scoped native file bridge. Keep the web app and PWA as the primary distribution. Qualify the shared publishing workflow first. Hold a desktop release until it addresses a real gap and native folder selection, export, backup, and recovery pass on Windows. Defer macOS and Linux builds until the real Studio passes on their WebKit runtimes.

The main performance gain is download and installed footprint. Electron had the fastest repeat launches and lowest sampled idle private memory, but the slowest first launch with a fresh profile. Wails and Tauri had similar repeat launches in the original series. These samples do not establish an editing performance advantage.

Two-way sync should stay out of the release. Ship direct export to a project folder and versioned library backups with reviewed restore first, once they pass. Keep IndexedDB as the editing store. Evaluate Chromium directory grants independently. Successful reconnect and export on the existing PWA would cover the most common folder request without a native install.

## Windows measurements

Windows 11 Home build 26200, Intel Core i7-13700K, 31.7 GiB RAM. Windows webview was Evergreen WebView2 158.0.4370.33. The shared Vite app build was 9,624,669 bytes, built from the target branch with the existing uncommitted Electron integration present. The Tauri and Wails harnesses did not install an app-facing file bridge.

| Candidate | App payload on disk | Downloadable installer | First launch with fresh profile, ms | Repeat launches, ms | Idle private memory / summed working set, MiB |
| --- | ---: | ---: | --- | ---: | --- |
| Electron 45.5.0 | 366.5 MiB unpacked | Not built | 735 | 282, 300 | 281.0 / 399.7 |
| Tauri 2.12.7 | 14.2 MiB executable | 7.4 MiB NSIS | 629 | 383, 358 | 291.8 / 462.5 |
| Wails 3.1.0 | 21.1 MiB executable | Not built | 469 | 378, 330 | 322.3 / 464.8 |

These are process launches, with a new test profile on the first launch of each shell and the same profile on the next two. Timing starts just before PowerShell starts the process and ends two frames after the initial Studio mounted. Windows filesystem caches were left alone. Each timing run loaded the same app build without a development server. Idle figures are one sample 60 seconds after the final launch. Private memory is summed committed private bytes across the process tree. The summed working set can count shared pages more than once. A process can start or exit between snapshots, and transfer peaks are sampled. WebView2 installation and per-user profile data are outside the payload column. The recorded 7,787,246-byte NSIS bundle uses the Evergreen bootstrapper only when the runtime is missing. Electron timing used the prototype in development mode against the shared `app/dist`. Electron size came from an earlier unpacked prototype package.

The test profiles occupied 7.96 MiB for Electron, 8.95 MiB for Tauri, and 6.44 MiB for Wails after the third launch. These profiles contained the initial Studio state and caches. PixelDoll libraries will add their own storage footprint.

A later smoke run saw Wails launches take about 10–13 seconds and an Electron launch take about 14 seconds on the same host. We did not isolate the cause. Use the original startup figures as examples of the measured conditions and collect a larger, controlled series before setting any startup target.

The app build contained 166 files. The sorted SHA-256 file manifest has digest `ef44dec00679b2e691f7e85d5e9bf305e96046453bdc5e2922e6c1a09644b1a5`. Each manifest line contains the lowercase file hash, two spaces, and the slash-separated path relative to `app/dist`, terminated by LF. The original packaged Tauri spike executable has SHA-256 `b5b9877af48b0400f1bf2d7e3f1faf4e5711bdf4a2e759ce3b5234bd3533022c` and the NSIS bundle has `93d2ba85d91b8549fa52ee66c8cf6f63203e832ca2fc28aa4cfc9167ed66521f`. These identify the original audit artifacts. Rebuilt spike executables record their own hash.

### Tauri transfer experiment

The app process sent synthetic bytes to a fixed scratch folder on Windows. Each write flushed the file and published it before verifying its length. The bulk and bounded tests used separate launches. The original bounded run included the demo canvas. The audit reran both modes with the demo canvas open.

| IPC path | 64 MiB round trip | 128 MiB round trip | Sampled peak private memory |
| --- | ---: | ---: | ---: |
| One raw IPC call per payload | 824 ms | 1,685 ms | 2,995 MiB |
| Sequential 1 MiB raw IPC chunks | 734–747 ms | 1,441–1,463 ms | 617 MiB |

One bulk request put the whole process tree near 3 GiB. Use backpressure and bounded chunks for any pilot, even with Tauri's raw request body. Stream from a Blob or from the ZIP producer when possible so the frontend also avoids materializing multiple copies. The bounded harness rejected a truncated transfer before publication and accepted a fresh write afterward. It used an NTFS hard link to publish exclusively for the test. The pilot needs an atomic strategy tested on the supported destinations, including removable or cloud-managed storage if offered.

The DeepSeek V4.1 Flash Low audit reproduced the memory result at 3,120 MiB bulk and 596–635 MiB chunked. The auditor measured 2,005 ms for the 128 MiB bulk request and 1,485–2,101 ms for chunked runs. Chunking earns its place through lower peak memory, with throughput dependent on the run.

These tests measured transport and staged file writing. They did not measure materializing an export with thousands of files, large ZIP construction, cloud-provider locks, abrupt termination, or sustained throughput.

The chunked write also passed under a Windows folder with spaces and Unicode, and at a 353-character output path when the WebView2 profile stayed in a separate short directory. The same deeply nested tree failed to launch the shell when it also held the profile. Keep the application profile separate from user-selected file destinations. The harness accepts `-ScratchParent` and `-SeparateProfile` to repeat the distinction.

## Capability checks

- The native Tauri release build loaded PixelDoll at `http://tauri.localhost`, a secure context in this configuration. The test opened the demo and mounted its 1280 × 850 canvas. SHA-256, a Web Lock, an OffscreenCanvas/image bitmap round trip, WebGL2, and raw deflate compression and decompression worked.
- The existing Studio export and library backup each saved a real ZIP through WebView2 in separate launches. The export contained 445 entries, including 438 PNGs, and parsed as `pixeldoll/3`. The backup contained one saved demo copy and 276 artwork blobs and parsed as `pixeldoll-backup/1`. The first artwork entry in each had a PNG signature. A combined smoke attempt timed out on the second download after succeeding on the first. Consecutive downloads with genuine user gestures and native dialogs remain unverified.
- IndexedDB retained a test record across closing and reopening the whole process. `navigator.storage.persist()` returned `false`. The probe found one service worker registration and no controlling worker. Treat storage as best effort until qualified and require a demonstrated backup and restore path.
- Shell IPC worked with `connect-src` additions applied only to the staged desktop copy. The Vite source CSP never changed. Choose the final origin before users store data because IndexedDB and saved credentials are origin-scoped.
- A real webview request to PixelLab's `GET /v2/balance` with an intentionally invalid bearer token returned a readable 401. The authorization header requires browser preflight, so this establishes that CORS allowed the call on that origin. A successful authenticated balance and real clipboard read/write still need verification. The agent-token contract keeps the development credential out of packaged builds. No PixelLab generations were used.
- The Chromium harness exercises read, write, native rename where supported, delete, and IndexedDB handle reload after a directory grant. T3's preview exposed `showDirectoryPicker` but intercepted it with `Page.setInterceptFileChooserDialog()` on both attempts. The fallback Chrome access host was unavailable. A real directory grant, browser restart persistence, and external-folder rename remain unverified. File copying followed by deletion is not a substitute for atomic rename.

## Alternatives

| Option | Assessment |
| --- | --- |
| Chromium PWA and File System Access | Smallest additional footprint and reuses the user's existing library. A good candidate for explicit folder exports and manual snapshots. Directory access depends on browser support, user grants and the tab lifecycle. OPFS is browser-managed storage, so it does not satisfy the requirement to work in a project folder. [Platform API](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker) |
| Tauri 2 and WebView2 | Best measured native footprint. Rust-side commands can hold the selected folder and expose operation-specific access. Tauri handles the system webview, packaging and platform integration. Budget for an OS-specific browser test matrix and signed release artifacts. [Capabilities](https://v2.tauri.app/security/capabilities/) · [Windows installers](https://v2.tauri.app/distribute/windows-installer/) |
| Wails 3 and WebView2 | Wails v3.1.0 is a non-prerelease weekly release. The Windows build loaded the app at `http://wails.localhost`. Its `http.Handler` serves embedded assets inside the process through WebView2 request interception. The spike does not configure a listening HTTP service. Large-file transport, an installer, and Wails-specific persistence and permission behavior remain unverified. [Wails v3.1.0](https://github.com/wailsapp/wails/releases/tag/v3.1.0) · [Windows request handling](https://github.com/wailsapp/wails/blob/v3.1.0/v3/pkg/application/webview_window_windows.go) |
| Neutralinojs 6.10.0 | Reuses the OS webview. Its local server and native WebSocket bridge conflict with the handoff's requirement to avoid a local HTTP service for the packaged edition. Equivalent folder authorization would need additional application code. [Native API security](https://neutralino.js.org/docs/contributing/security/) · [Neutralinojs v6.10.0](https://github.com/neutralinojs/neutralinojs/releases/tag/v6.10.0) |
| Direct Win32 WebView2 | The most plausible smaller Windows host. It comes with the same browser-renderer memory costs and makes PixelDoll responsible for packaging, IPC isolation, permissions, and lifecycle. Revisit only if Windows becomes the sole supported desktop platform or host code appears on a profile. [WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution) |
| Electron 45.5.0 | Mature, consistent browser runtime. Measured speed and idle memory were competitive on this machine. The bundled browser makes the package much larger, so the rejected prototype stays a baseline. [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model) |

The independent stack review ran on DeepSeek V4.1 Flash with the High variant. It confirmed that a Chromium PWA deserves a real folder test before public desktop release. Chrome documents persistent permissions for File System Access, including installed web apps. Test disconnect, revocation, and reconnect across a browser restart before relying on that behavior. Start with project-folder export and the existing backup ZIP format. [Chrome persistent file permissions](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api)

Use Evergreen WebView2 for the Windows pilot. Microsoft's Fixed Version runtime adds over 250 MB, which would erase much of the package-size advantage. If automatic updates are added, Tauri requires update signatures. Treat installer signing and update signing as separate release requirements. [WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution) · [Tauri updater](https://v2.tauri.app/plugin/updater/)

Set macOS and Linux support from the app's tested webview capabilities. WebKit added compression streams and 2D OffscreenCanvas in Safari 16.4, so the shell's advertised macOS minimum alone cannot qualify PixelDoll. Verify the ZIP and canvas paths, image clipboard, and direct PixelLab requests on each proposed platform and origin. [WebKit 16.4 features](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/) · [Tauri configuration](https://v2.tauri.app/reference/config/)

## Folder workflow and sync

Keep backups append-only and restorable through the existing review. A first pilot can use explicit project-folder export and native save/open for backup ZIPs. Frequent users can justify a versioned backup setting after recovery, retention and size handling pass. A folder on the same drive protects against loss of browser data. Protection against drive failure requires a separate drive or another backup copy.

Do not reuse `savedAt` or the backup deduplication hash as sync revisions. Outfit saves and some review updates leave `savedAt` unchanged. Backup equivalence omits dressing and item history, which matter to a sync user. A future sync implementation that replaces whole records could discard local or in-flight work omitted from backups. The existing restore flow reviews additions and copies. Verify this against [dressing persistence](../../../app/src/lib/dress/project.ts), [backup equivalence and restore](../../../app/src/lib/store/backup.ts), and [local database concurrency](../../../app/src/lib/store/db.ts).

The independent storage review ran on DeepSeek V4.1 Flash with the High variant. It identified these concrete failure paths and recommended retaining explicit, reviewed restore until a merge can preserve both committed changes and local paid review data.

Clock ordering, cloud-folder rename order and origin-scoped Web Locks cannot coordinate two machines. A mutable shared index can lose an update even if each platform uses atomic local writes. A folder-only record may be a concurrent edit, a partial download or a conflict copy. Missing files do not convey deletion. Keeping both whole characters preserves variants but does not merge separate hats and boots onto one body. Even an item-level merge must respect base hashes and frame alignment.

If reviewed backup exchange demonstrates enough demand, test an explicit, non-destructive import/export merge using immutable revisions keyed by content and a prior common version. Isolate it from live jobs, write records and artwork transactionally, and recover deliberately from interrupted and reordered cloud copies. Skip deletion propagation and automatic import in that experiment. Release work needs an actual privacy, revision, conflict, and recovery design for both origins.

## Windows pilot gates

| Area | Evidence still needed |
| --- | --- |
| Native file access and recovery | Select and restrict destinations. Verify export, repeated saves with genuine gestures, backup retention and the size limit, first-run import from a web backup, and interrupted-write and restore recovery. Qualify removable and cloud folders before offering support. |
| Webview and privilege boundary | Choose a stable desktop origin. Use Tauri's explicit application-command manifest and capability allowlist, remove probe commands from release builds, and verify that an unlisted command is denied. Verify a fresh desktop profile has no service worker registration or PWA install/update surfaces. Check storage persistence or plan recovery through backups. |
| Native experience | Verify clipboard images, external links opening in the system browser, second-launch behavior, window sizing and DPI, and an authenticated PixelLab request from the final origin. Evaluate menus, shortcuts, and drag-and-drop when a workflow needs them. |
| Distribution | Verify installer upgrade and uninstall, signing and SmartScreen, and first launch with and without Evergreen already installed. Qualify a signed update path if automatic updates are offered. |

## Reproduction

The research adds isolated harnesses. Native probe commands write to their scratch root. They are registered on the spike app, which has one window, and do not demonstrate a production capability allowlist. The original timings used build `1f62e91c-473d-4200-9840-65c9860d3821` at source commit `ae549f6` with the local uncommitted Electron changes present. A clean checkout can rerun Tauri and Wails against a fresh build of the tracked web app. Reproducing the exact timing build and the Electron baseline requires the historical worktree. The earlier Electron size package embedded app build `2c06c813-a85f-4e05-9dbd-cbcf11d34383`.

1. From `app/`, run `npm ci` and `npm run build`. This workstation used Node 25.0.0 and npm 11.21.2. Node 25 is outside the app's supported Node 24 range and emitted an engine warning.
2. From `tauri-spike/`, run `node stage.mjs` and `npx --yes --package @tauri-apps/cli@2.12.6 tauri build --ci`. The build used Rust 1.100.0 x64 MSVC and the Windows 10.0.26100 SDK. The generated installer is unsigned.
3. From `wails-spike/`, run `node stage.mjs` and `go build -trimpath -ldflags '-s -w -H=windowsgui' -o pixeldoll-wails-spike.exe .` with Go 1.27.4. Its assets are embedded, and the readiness event returns through the in-process asset handler.
4. Run `tauri-spike/measure.ps1` in PowerShell 7.4 or newer with `-Shell tauri`, `-Shell wails`, or `-Shell electron` and `-Executable <path>`. Use Electron 45.5.0 under the prototype's `node_modules` for the Electron case. The runner clears `ELECTRON_RUN_AS_NODE` for that child process. Use `-Runs 2 -IdleSeconds 0 -Case chunked` or `-Runs 1 -IdleSeconds 0 -Case transfer` for local transfer tests. `-Case online` runs the invalid-token CORS probe without bulk transfers. Set `-Runs 1 -IdleSeconds 0 -Case download` or `-Case backup` for the ZIP tests. Each invocation reports the executable SHA-256 and retains JSON events and test downloads under its temporary directory for inspection.
5. For the browser probe, run `node serve.mjs` in `pwa-spike/`, visit the printed localhost port in Chromium, and select an empty scratch folder. Leave the server running on that port while restarting the browser so that its origin stays the same.

After building the app, run `node --test stage-assets.test.mjs` here to verify that rebuilding a spike removes retired assets.

This is a Windows-only spike. No signing or publication occurred.

The app build and all 246 unit test files passed. The suite reported 3,563 passed tests and two skipped tests. `npm run check` stopped at the pre-existing nullable Electron bridge reference in [ExportSheet.svelte](../../../app/src/studio/ExportSheet.svelte#L669). The inherited prototype was left outside the research changes.
