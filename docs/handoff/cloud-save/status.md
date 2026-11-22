# Cloud Save status

Updated 2026-11-22 by the Lead (Claude Opus 5.5). Branch `feat/cloud-save` in worktree `.claude/worktrees/pixeldoll-cloud-save-d586ed`. Read the plan, then [decisions.md](decisions.md), then this file.

## Phase and step

Phases 0 and 2 to 8 are done. **Phase 9: stopped at the [owner checklist](owner-checklist.md).** Phase 1's backup cap lift is its own Later card, [Back up and restore libraries of any size](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=314068449) (decision 11).

## Green (2026-11-22, after merging origin/main 7a62a5460)

- `npm test`: 227 files, 3,262 passed, 5 skipped. Sync: 28 engine scenario tests including the 300-seed fuzz; provider contract suite for Sim, Google Drive and Dropbox fakes; auth; the token endpoint.
- `npm run check`: clean. `npm run build` plus the dist guard: clean (no sync code in startup chunks).
- `npm run e2e -- e2e/cloud-save`: 2 passed (two devices round trip; Settings sign-in round trip, status, disconnect).
- Full e2e suite (`--all`, run twice by the spec-name quirk in decision 16): 424 passed. The failures were the cloud-save test before its fix and load flakes (studio touch-scroll, api-peek, character-creator, crash-recovery, Fix frames) that each passed when rerun alone.
- Browser check of Settings › Cloud Save on the agent dev server: dark and light, phone (375 px) and desktop; not-configured message. The connected states are covered by the e2e test, not checked by eye.

## Performance

| Budget                            | Result                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Entry chunk +2 KB gzipped at most | +2.08 KB, of which about 1.2 KB is English copy (decision 15)                                        |
| Sync code in a separate chunk     | `client-*.js` 13 KB gzipped, loaded only when connected or opened                                    |
| Idle sync = 1 request             | Unit tests, including with a device that stopped syncing                                             |
| Save path not slower              | By design: a save only fires one in-tab event; with Cloud Save off nothing listens. Not benchmarked. |
| Large-workspace restore           | Same pack algorithm as the research benchmark; not re-measured against real providers                |

## Not verified (needs the owner checklist)

Real Google Drive and Dropbox, CORS of Drive resumable uploads over 5 MB and Dropbox content calls, the token endpoint on Cloudflare (including the rate-limit binding on Free), iPhone Home Screen and Android sign-in.

## Next three actions (after the owner reports the checklist done)

1. Put the client ID, app key and endpoint URL in `app/src/lib/sync/config.ts` and the endpoint origin in the CSP (`app/index.html`).
2. Run the provider contract suite and two-browser sync against the real providers with the `.env` test tokens.
3. Read the phone test notes, fix, and prepare the final release.

## Open disagreements

None. Review round 1 findings are all fixed (decision 14).
