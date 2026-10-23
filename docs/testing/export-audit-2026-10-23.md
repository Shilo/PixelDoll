# Export audit — 23 October 2026

Five separate specialist agents reviewed Godot, Unity, Phaser, Aseprite and raw PNG + JSON. Each challenged its format against official engine/tool documentation and proposed fixes before implementation. The parent reviewed cross-format behavior and coordinated shared palette and stale-item fixes. All work used stored or synthetic pixels; no PixelLab calls or credits were needed.

## Findings and fixes

| Export | Confirmed issue | Implemented response |
|---|---|---|
| Godot | Sanitizing resource IDs merges legal hyphen/underscore move names; runtime-only alternate resources disappear from selected-scene builds; outfit colours ignored | Encode resource IDs, add a native dependency library holding all equipment and manifest metadata, exact owner-local source palette swaps and outfit controls |
| Godot | Equipment changes can remove the frozen base; palette resource replacement interrupts playback | Validate slot/item assignments, preserve body frame/progress/play state on refresh |
| Unity | An assembly described as optional is an unconditional reference and can break compilation | Require only 2D Sprite, remove unused SpriteLibrary generation |
| Unity | Separate character exports duplicate C# identities; reimport deletes generated clip/controller assets and replaces Sprite identities | Deterministic per-character namespaces/assemblies and importer guards; update assets and retain existing Sprite IDs |
| Unity | Palette changes conflict with the Animator-driven visible body; texture defaults can resize or trim sheets; equal-z layers depend on renderer ties | Separate hidden clock, owner-local palette runtime, lossless/full-rect texture settings, explicit draw-order ranks |
| Phaser | Frame duration is added to Phaser's base interval, slowing all animations | Set the base interval to the minimum duration and store only each frame's remaining duration |
| Phaser | Same names collide across folders; concatenated atlas filenames are ambiguous; loading failures are not actionable | Folder-scoped runtime keys, length-prefixed atlas names, shared load promises and error cleanup |
| Phaser | Preset colours ignored and unsupported rows become playable empty animations | Source-ramp palette and outfit controls; supported-direction and equipment guards |
| Aseprite | Editable document ignores first-outfit colours; binary field overflow silently wraps | Apply owner-local default/linked/outfit ramps from source sheets; reject native field limits and empty timelines clearly |
| Raw/shared | Only the UI materializes procedural colour ramps; linked defaults do not retain source sheets | Materialize exported selections/defaults in the shared manifest path; retain original sheets for resolved defaults |
| Raw/shared | Removing stale items leaves palette references behind; baked output can disagree with exported metadata | Resolve affected linked selections onto surviving materials, prune excluded metadata, use consistent exported palette metadata for baking |
| Raw/shared | Fractional frame indices and invalid archive output can corrupt exports; strip instructions imply simple frame order | Validate integer geometry/timing indices and archive paths, explain playlist timing, loops and pivot placement |
| Native startup | An empty first move or unsupported first direction breaks initial playback even when later moves are usable | Select the first playable move/view in Godot and Unity startup and Phaser's generated quick start; Godot also rejects unsupported views |

## Validation and limits

Use Node 24.22.1 / npm 11.19.1. Portable local tools and engine vendor bundles were kept in ignored cache directories; this export audit adds no dependencies or lockfile changes. Optional native tests use `GODOT_BIN` and `ASEPRITE_BIN` environment variables and skip when the required tool is unavailable.

| Check | Evidence |
|---|---|
| Godot 4.7.1 | Native headless import and runtime tests; exact palette data, owner isolation, links/cycles, frozen base, alternate equipment, frame/progress preservation and synchronized clocks. A selected-scene PCK is exported and the runtime assertions repeat against the packed game. This is resource/image-data verification, not a new GPU-render comparison. |
| Phaser 3.90.0 and 4.1.0 | Managed Chromium, Canvas and WebGL: four real engine/renderer combinations pass, no page errors. Exact 80/180/100 ms playback with repeated source cells, palette/default/preset changes, layer synchronization and oversized pivot. Phaser 3.80 is source-reviewed only. Reproduce with `node scripts/verify-phaser-export.mjs` from `app/`. |
| Aseprite 1.3.18.6 | Native CLI renders nine adversarial frames; flattened pixels exactly match the compositor, including mirrored views, repeated cells, z-order changes, oversized layers, tucking, linked/default/explicit palettes and owner isolation. Native metadata confirms timing, tags and pivot slice. |
| Unity 6000.4.0f1 | Generated runtime/importer C# compiles against installed Unity assemblies and official Sprite interface sources, using a signature-only factory shim. Structural regression tests check required references, identity isolation, metadata and importer settings. A compatibility deprecation warning remains for `GetInstanceID`. |
| Unity native limitation | Real batch execution attempted; editor exits 198 because no valid Unity license is available. Actual asset import, prefab rendering, runtime palette behavior and reimport GUID persistence cannot be certified on this machine. An activated editor is still required for that acceptance check. |
| Raw/shared | Encoded PNG pixels compared with compositor; original/source-sheet and editable ZIP import round trips; oversized/mirrored layers, linked procedural defaults, stale palette detachment and invalid path/format rejection. |

Final integrated verification:

| Check | Result |
|---|---|
| `npm test`, with native Godot/Aseprite enabled | **310 passed across 35 files**, no skipped tests |
| `npm run check` | Passed: Svelte reports 0 errors / 0 warnings; application/config/test TypeScript passes |
| `npm run build` + dist guard | Passed; agent/dev code guard clean. Vite retains its advisory for the existing large main bundle. |
| Studio production browser regression | **1 passed (17.5 s)**: actual export ZIP download, outfit recolouring/storage, desktop, phone, landscape and tablet controls, with PixelLab requests blocked |
| Whitespace/diff validation | Passed for the export audit's changed files |

The first sandboxed browser run completed its assertions but stalled during Playwright server cleanup. Retrying outside the sandbox completed cleanly with exit code 0. Browser output is isolated under `test-results/studio-export-review-final/`, preventing Playwright cleanup from deleting other agents' evidence. Unrelated design/dependency edits in the checkout are excluded from this audit's commit.

## Target-list agreement

The agents agreed to retain native Godot, Unity and Phaser plus editable Aseprite and universal PNG + JSON. No new engine button was added. GDevelop and GameMaker are candidates for tested native behavior/resource packages; MonoGame is adequately served by custom runtimes consuming raw data or an Aseprite integration for now. See the evidence and qualifications in the [2026 engine target research](../research/export-targets-2026-10-23.md).

Official technical references: [Godot resource export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_projects.html), [AnimatedSprite2D](https://docs.godotengine.org/en/stable/classes/class_animatedsprite2d.html), [Unity assembly references](https://docs.unity3d.com/6000.0/Documentation/Manual/assembly-definitions-referencing.html), [Sprite Data Provider](https://docs.unity3d.com/Packages/com.unity.2d.sprite@1.0/manual/DataProvider.html), [Phaser animation concepts](https://docs.phaser.io/phaser/concepts/animations), [TextureManager](https://docs.phaser.io/api-documentation/class/textures-texturemanager), [Aseprite binary specification](https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md), [Aseprite CLI](https://www.aseprite.org/docs/cli/).
