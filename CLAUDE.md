@AGENTS.md

## Current redesign continuation

The production/prototype visual review is complete: see the [final review](docs/testing/production-parity-final-review.md) for fixes, intentional differences, verification and the open copy follow-up. The [UI/UX continuation handoff](.claude/handoffs/2026-10-23-production-parity-ui-ux-continuation.md) keeps the approved design contract. Use **Claude Browser** for live prototype/production comparison (`.claude/launch.json` has `prototype-5202`, `app-build-5208` and `app-dev-5207`).

## Bronze UI theme

The production Studio and isolated playable prototype use `@shilo/bronze-ui`, pinned to a versioned release archive in `app/package.json` and `app/package-lock.json`.

Theme source: [bronze-ui](../../bronze-ui/README.md); shared contract: [style guide](../../bronze-ui/docs/STYLE-GUIDE.md). On this workstation the repository is `C:/Programming_Files/Shilocity/bronze-ui`.

Fix shared tokens/component recipes in that repository, test and publish a new version, then update the dependency and lockfile here. Never patch `node_modules` or duplicate package fixes in the prototype. Its [adapter](docs/design/2026-10-22-redesign/round-6-prototype/bronze-theme.css) imports tokens and components without the optional document reset; scene geometry, gradient placement and workflow-specific spacing stay local. Shared control states, materials (including scene backing strengths), focus, borders and radii belong upstream. Run `node docs/design/2026-10-22-redesign/round-6-prototype/verify-theme-ownership.mjs` to catch local appearance duplication. Verify both appearances in the showcase and prototype after upgrades.

Production composition: [experience](app/src/studio/experience/Experience.svelte), [theme adapter](app/src/studio/experience/theme.css), and [layout](app/src/studio/experience/layout.css). The adapter maps legacy workflow variables to Bronze tokens and imports no reset. World configuration and code-only reflections live in [config](app/src/studio/experience/config.ts); movement/presentation are typed, offline modules. Keep existing production storage, generation, queue and export workflows. [Integration contract](docs/design/production-experience.md) records ownership and intentional differences from the prototype.
