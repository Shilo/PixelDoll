# Shared-token security implementation — 2026-10-23

The user chose optional plaintext `pixellabApiKey`, shared with every application on the origin, with no new unlock step.

Implemented a common credential-free Forget protocol (BroadcastChannel plus storage/visibility recovery), stale-event deduplication, session-generation invalidation, authenticated-request cookie/cache/redirect restrictions, and a bootstrap guard that does not initialize credentials or API clients when framed. PixelDoll also tightens its CSP/referrer policy and hands work to a connected tab without broadcasting a token. Public artwork redirects remain supported.

An open tab retains its current account as session-only when a different saved key appears; the replacement applies on next load. Forget clears credentials and account UI in cooperating open clients. It cannot revoke a copied provider key or erase every remote tab's IndexedDB cache.

## Adversarial review and agreed changes

A separate security reviewer inspected both diffs and adjacent code, reproduced notification-ordering issues, and independently ran 57 PixelDoll and 151 Backpack targeted tests. We challenged and resolved:

- Automatic saved-key adoption could run old paid work under a new account. We rejected a broad fingerprint migration in this patch and retained the current tab's account instead. Durable persisted-queue credential ownership remains explicitly deferred.
- Delayed/duplicate Forget events could undo a new connection or swallow a newer notification. Current storage is authoritative; fresh connections acknowledge it; notifications are deduplicated, with adversarial ordering regressions.
- Queue handoff could stall if a busy operation ended without saving. Guard completion now wakes waiting connected tabs; the self-test covers it.
- A blanket redirect restriction would break public artwork helpers. Only authenticated requests refuse redirects.
- A frame test using preview headers would test response CSP instead of the Pages client guard. The Backpack test removes only the preview CSP response header for its framed document while retaining built meta CSP.

The reviewer approved the final source after debate. No unresolved new credential-exposure blocker was found. This is not a claim that same-origin script compromise, dependency compromise, or browser-profile access cannot expose a remembered token.

## Validation

Exact Node 24.22.1 and npm 11.19.1; all credentials synthetic; no authenticated PixelLab traffic or generations.

- PixelDoll: strict check passes; 729 unit tests pass (1 existing skipped); guarded production build passes; 9 focused browser tests pass, covering credentials, Remember/Forget, framing, and queue leadership/capacity.
- Backpack: strict check passes; 379 unit tests pass; guarded production build passes; 21 security/Settings browser tests pass, including artwork redirects, CSP, key privacy, account reload, and Forget.
- Both actual production builds together on one localhost origin: 2 integration cases pass, verifying shared plaintext storage and Forget in both directions, with BroadcastChannel available and unavailable.
- Both shared-auth implementations are identical; whitespace checks pass. Backpack CI smoke now includes the new shared-token/frame regressions.

PixelDoll was validated in an isolated worktree because unrelated UI work was being edited concurrently. That unrelated work was excluded from this security patch. The existing large-bundle build warning remains unchanged.

Encryption is deferred in both TODO lists: a bundled or locally available automatic-decryption key does not stop same-origin token theft, and a passphrase adds unwanted friction. Real anti-framing response headers remain a hosting limitation of GitHub Pages; the client bootstrap guard mitigates framing today.
