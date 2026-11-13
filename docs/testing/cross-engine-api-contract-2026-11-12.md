# Cross-engine API contract audit, November 12, 2026

## Intent and review

Keep the application and delivered JavaScript runtimes on the same paper-doll implementation,
and keep the native engine ports consistent in behavior without forcing identical language APIs.
This is a new audit after the earlier [shared-runtime verification](shared-javascript-runtime-2026-11-12.md),
not a claim that its native results cover the changes below.

Independent Sol medium, Opus 5.5 medium and OpenCode Flash low reviews challenged the full API,
then cross-reviewed the fixes. The coordinator rejected forced uniform method names, a new
cross-language interpreter and native-port code generation as unnecessary. Existing native
harnesses plus a written behavior contract are the smaller maintainable boundary.

## Confirmed issues and corrections

- Repeated animation selection froze Phaser and GDevelop while Godot and Unity kept advancing.
  All four now preserve active progress, replay completed once-only clips and support explicit restart.
  Changing the move or direction starts at the beginning.
- Native invalid operations silently returned. Godot and Unity now report a warning and return
  `false` before changing state. JavaScript throws before mutation, an intentional language difference.
- Godot could not remove a color override without changing the outfit. Null now restores the default;
  an empty string retains source colors, consistently with the other controllers.
- JavaScript preset objects bypassed equipment validation, and accepted source presets could reference
  the wrong slot. Canonical `resolvePreset` and `validEquipment` now serve both JavaScript adapters
  and export validation. The frozen body, stale-item exclusion and copy isolation remain intentional.
- A regenerated transport could pass prebuild despite duplicate top-level module bindings that made
  the concatenated export invalid. Synchronization now rejects collisions before writing either output.
- Phaser atlas metadata pointed at a default-colored sheet rather than the source sheet loaded by
  the palette-aware runtime. Metadata and loading now resolve the same resource.
- Valid immutable IDs could generate Windows device paths. Shared path helpers escape resource
  paths without changing manifest IDs. Baked-path discovery is documented and tested from the
  exported manifest, and the native Phaser verifier uses the same helper as the exporter.
- The export boundary now rejects unsupported manifest formats and invalid saved equipment rather
  than shipping inconsistent native behavior. Tests distinguish missing references from known stale items.

The final Opus delta review caught that escaping baked filenames alone broke their documented
discovery convention. The corrected export README, format specification, verifier and manifest-based
regression now use the same rule. Opus approved that correction with no remaining defect.

## Durable maintenance boundary

The [runtime contract](../architecture/javascript-runtime.md) maps operations across all controllers,
records deliberate differences and names the required regression/native checks. `AGENTS.md` points
all paper-doll and engine-export changes at that contract. Canonical JavaScript is still under
`app/src/lib/runtime/`; generated transport is checked for staleness and name collisions.
Godot and Unity remain native ports that require their own updates and execution checks.

Asset-only targets intentionally differ: generic exports provide integration data, Aseprite preserves
editable layers for the first outfit, and RPG Maker resamples to its destination layout.

## Verification record

Production code settled on top of `9d8b45a0`. Pinned Node 24.22.1 was used, with one unit-test worker
and at most two E2E workers. No paid PixelLab requests, installs or credentials were needed.

The first final check stopped on formatting in `export.ts`; scoped formatting corrected it.
The subsequent `npm run check` passed, including Svelte diagnostics, all TypeScript projects and
application formatting. Under concurrent browser load and roughly 1.3 GB free physical memory,
the first final unit run exceeded existing timeouts in runtime synchronization and shared-refit tests.
Those failures must not be treated as green runs or hidden by relaxed assertions or timeouts.
