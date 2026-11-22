# Cloud Save status

Updated 2026-11-22 by the Lead (Claude Opus 5.5). Branch `feat/cloud-save` in worktree `.claude/worktrees/pixeldoll-cloud-save-d586ed`. Read the plan, then [decisions.md](decisions.md), then this file.

## Phase and step

Phase 0 done (verification in decisions.md 2). Phases 3-5 in flight.

## Green

- Section 4 claims verified and recorded.

## In flight

- Provider adapters (Drive, Dropbox) with fakes and the contract suite: sub-agent.
- Auth (PKCE, Google via endpoint, Dropbox offline refresh) and the token endpoint: sub-agent.
- Engine port (Lead).

## Next three actions

1. Engine core with the memory store, ported PoC tests and fuzz test.
2. pixeldoll.ts adapter to db.ts and the IndexedDB sync store.
3. Settings › Cloud Save section behind Developer mode.

## Open disagreements

None.
