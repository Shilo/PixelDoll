# Cloud Save status

Updated 2026-11-22 by the Lead (Claude Opus 5.5). Branch `feat/cloud-save` in worktree `.claude/worktrees/pixeldoll-cloud-save-d586ed`. Read the plan, then [decisions.md](decisions.md), then this file.

## Phase and step

Phases 0, 2-5 and 7 (docs, privacy page, CSP, agent wiring) done. Phase 6 (UI) in flight. Phase 1's backup cap lift is its own card (decision 11).

## Green

- Engine: 24 scenario tests plus the 300-seed three-device fuzz (`npm test -- sync`).
- Provider contract suite: Sim, Google Drive and Dropbox against fakes (41 pass, 4 Sim skips).
- Auth and the token endpoint: 41 tests.
- `tsc -p tsconfig.test.json` clean.

## In flight

- Settings › Cloud Save UI (Svelte sub-agent).
- Independent challenger review of the sync code.
- `cloud-save` e2e spec (dev server, fake Dropbox via route interception).

## Next three actions

1. Merge the UI, then write and run the e2e spec; browser-check the section (dark/light, phone/desktop).
2. Fix challenger findings; full `npm run check`, `npm test`, `npm run e2e -- --all`, build + guard; bundle and perf numbers.
3. Owner checklist, card marked "Blocked: owner checklist".

## Open disagreements

None.
