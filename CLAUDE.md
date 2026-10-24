@AGENTS.md

## Current redesign continuation

Start with the [UI/UX continuation handoff](.claude/handoffs/2026-10-23-production-parity-ui-ux-continuation.md). Claude takes over as lead game character-creator UI/UX designer, using **Claude Browser** for live prototype/production comparison. The checkpoint is tested but final visual review is unfinished; the handoff identifies exact evidence, remaining work and the approved design contract.

## Bronze UI theme

The production Studio and isolated playable prototype use `@shilo/bronze-ui`, pinned to a versioned release archive in `app/package.json` and `app/package-lock.json`.

Theme source: [bronze-ui](../../bronze-ui/README.md); shared contract: [style guide](../../bronze-ui/docs/STYLE-GUIDE.md). On this workstation the repository is `C:/Programming_Files/Shilocity/bronze-ui`.

Fix shared tokens/component recipes in that repository, test and publish a new version, then update the dependency and lockfile here. Never patch `node_modules` or duplicate package fixes in the prototype. Its [adapter](docs/design/2026-10-22-redesign/round-6-prototype/bronze-theme.css) imports tokens and components without the optional document reset; scene geometry, gradient placement and workflow-specific spacing stay local. Shared control states, materials (including scene backing strengths), focus, borders and radii belong upstream. Run `node docs/design/2026-10-22-redesign/round-6-prototype/verify-theme-ownership.mjs` to catch local appearance duplication. Verify both appearances in the showcase and prototype after upgrades.

Production composition: [experience](app/src/studio/experience/Experience.svelte), [theme adapter](app/src/studio/experience/theme.css), and [layout](app/src/studio/experience/layout.css). The adapter maps legacy workflow variables to Bronze tokens and imports no reset. World configuration and code-only reflections live in [config](app/src/studio/experience/config.ts); movement/presentation are typed, offline modules. Keep existing production storage, generation, queue and export workflows. [Integration contract](docs/design/production-experience.md) records ownership and intentional differences from the prototype.
