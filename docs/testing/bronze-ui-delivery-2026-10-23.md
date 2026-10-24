# Bronze UI 0.1.0 delivery and integration

Date: 2026-10-23. Scope: publish the MIT theme and standalone showcase, install the released dependency, and preserve the approved playable prototype.

## Published package

- Repository: https://github.com/Shilo/bronze-ui
- Showcase: https://shilo.github.io/bronze-ui/
- Release: https://github.com/Shilo/bronze-ui/releases/tag/v0.1.0
- Release source: `a9964ab1b9cd03c433fd66d33e5ef7cac861f534`.
- Package: `@shilo/bronze-ui` 0.1.0, MIT, 21 archive entries, 12,716 bytes.
- Archive SHA-256: `597b093ed6a0b185b77af315a9d41a8944abc65a32c03f8792947420246104d8`.
- [Release workflow](https://github.com/Shilo/bronze-ui/actions/runs/39992419617) and [Pages workflow](https://github.com/Shilo/bronze-ui/actions/runs/39992415764) passed.

The package is distributed through a versioned GitHub release archive, not the npm registry. PixelDoll's package manifest and lockfile resolve that public URL with its integrity hash. No local sibling path, mutable branch or symlink is required. Independent review downloaded the public archive, recomputed its SHA-256 and lockfile SHA-512 integrity, and compared all 21 files with the installed package byte for byte.

## Dependency and application checks

A clean directory containing PixelDoll's new package manifest and lockfile passed `npm ci --ignore-scripts`; the CSS and Svelte entries resolved to the installed 0.1.0 package. The committed app at `003bef2`, extracted into that isolated directory with the new manifest/lockfile, passed `npm run check` and `npm run build`, including the distribution guard. Its pre-existing 500 kB bundle advisory remains.

An initial check of the shared working tree encountered two type errors in concurrent `app/src/lib/export/godot.ts` edits: access to `RigAnimation.directions` at lines 43–44. The export task subsequently completed its type updates. A final whole-working-tree `npm run check` and `npm run build` both passed, including the distribution guard. Before the interruption, all 287 existing app unit tests had passed; that result remains historical. The separate [export audit](export-audit-2026-10-23.md) records its own newer 310-test verification.

Commit provenance: the shared index changed between the theme staging review and commit. Commit `e2f2006` contains the 31 theme/dependency/documentation files and 18 concurrently staged export files. The export task then documented that overlap in `c2f2747`. Both tasks' changes were preserved; no export code was reverted or independently altered by this theme task, and shared history was not rewritten. The attempted correction was guarded against an intervening commit and made no changes. This delivery record describes the theme validation separately from the export audit.

Standalone release validation already passed: strict isolated packed Svelte/TypeScript consumer, CSS-only imports, Chromium 48 and WebKit 48 screen/theme/viewport cases, focused form/focus/CSS-isolation checks, and 48 additional Chromium cases against public Pages. The final package does not modify those verified files.

## Final playable prototype

The prototype imports the released tokens and component recipes through one adapter. Its layout, world settings, equipment data and rendering remain local. The optional document reset is omitted intentionally. GlassKit is no longer loaded by the active runtime; archived research remains available for historical reference.

Final released-package verification passed:

- 12 movement/facing unit tests.
- 18 existing browser checks covering input, scene changes, sprite pixels and interaction behavior.
- Eight theme/viewport cases covering package CSS provenance, semantic roles, contrast, focus, controls, menus, dialogs and preference fallbacks.
- Both appearances preserved all 997 sampled opaque sprite pixels without theme tinting.
- No page errors or external requests in the local prototype checks.

See [the final integration report](../design/2026-10-22-redesign/round-6-prototype/bronze-integration.md), [machine-readable checks](../design/2026-10-22-redesign/round-6-prototype/bronze-verification.json) and [independent review](../design/2026-10-22-redesign/round-7-theme/bronze-release-review.md).

## Equal-resolution visual evidence

The comparison set contains 68 original before captures, 68 refreshed after captures, 68 pairs and four overview boards. Desktop uses 1920 × 1080; phone uses 450 × 800; both use device scale 1. Coverage includes selection, creation, Preview, Top-down, Side-scroller, equipment panels, menus, dialogs, a toast and mobile creator scroll states in light and dark.

Original before hashes remain unchanged. Refreshed after hashes and PNG dimensions match their manifests. Measured major layout differences greater than one pixel: zero. The intended differences are shared control/surface styling, semantic foregrounds, focus states and transparent scrollbar tracks; composition, typography hierarchy and source artwork remain consistent.

Open the [comparison gallery](http://127.0.0.1:5202/bronze-review.html) with the local prototype server running. The gallery links every full-resolution image and all four boards. Image evidence remains ignored local media according to the project policy; reproduction scripts and reports are committed.

## Ownership and limits

The [Bronze UI style guide](https://github.com/Shilo/bronze-ui/blob/main/docs/STYLE-GUIDE.md) is the maintained theme contract. Round seven is frozen historical evidence, with explicit links and runner guards to prevent accidental competing theme development.

GPT-6.1 Sol High reviewed package correctness, public delivery, dependency provenance and final visual evidence. This is browser and source validation, not a claim of physical-device performance or assistive-technology certification. Production Studio visual migration and paid generation remain outside this isolated prototype integration.
