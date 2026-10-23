@AGENTS.md

## Bronze UI theme

The isolated playable prototype uses `@shilo/bronze-ui`, pinned to a versioned release archive in `app/package.json` and `app/package-lock.json`. The production Studio still uses its existing CSS.

Theme source: [bronze-ui](../../bronze-ui/README.md); shared contract: [style guide](../../bronze-ui/docs/STYLE-GUIDE.md). On this workstation the repository is `C:/Programming_Files/Shilocity/bronze-ui`.

Fix shared tokens/component recipes in that repository, test and publish a new version, then update the dependency and lockfile here. Never patch `node_modules` or duplicate package fixes in the prototype. Its [adapter](docs/design/2026-10-22-redesign/round-6-prototype/bronze-theme.css) imports tokens and components without the optional document reset; scene geometry, scrims and workflow-specific spacing stay local. Verify both appearances in the showcase and prototype after upgrades.
